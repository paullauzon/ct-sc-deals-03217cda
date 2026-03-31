import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const PRE_MEETING_STAGES = ["New Lead", "Contacted", "Qualifying"];

// All Calendly bookings are Malik's calendar
const CALENDLY_DEFAULT_OWNER = "Malik";

function detectBrand(eventName: string): string | null {
  const lower = eventName.toLowerCase();
  if (lower.includes("sourceco")) return "SourceCo";
  if (lower.includes("captarget")) return "Captarget";
  return null;
}

/**
 * Calculate hours_to_meeting_set using the best available lead origin time.
 * For seeded/imported leads, created_at may be after the actual booking —
 * in that case, fall back to date_submitted. Always clamp to >= 0.
 */
function calcHoursToMeetingSet(
  leadCreatedAt: string | null,
  dateSubmitted: string | null,
  bookingTime: Date
): number {
  const createdAtMs = leadCreatedAt ? new Date(leadCreatedAt).getTime() : 0;
  const dateSubmittedMs = dateSubmitted ? new Date(dateSubmitted).getTime() : 0;
  const bookingMs = bookingTime.getTime();

  // If created_at is after booking, it's a seeded row — use date_submitted instead
  let originMs = createdAtMs;
  if (createdAtMs > bookingMs && dateSubmittedMs > 0 && dateSubmittedMs <= bookingMs) {
    originMs = dateSubmittedMs;
  } else if (createdAtMs === 0 && dateSubmittedMs > 0) {
    originMs = dateSubmittedMs;
  }

  if (originMs === 0) return 0;
  const hours = Math.round(((bookingMs - originMs) / 3600000) * 10) / 10;
  return Math.max(0, hours);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-api-key") || url.searchParams.get("key");
    const expectedKey = Deno.env.get("INGEST_API_KEY");
    if (!expectedKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const forceMode = url.searchParams.get("force") === "true";
    console.log(`[backfill-calendly] Force mode: ${forceMode}`);

    const calendlyToken = Deno.env.get("CALENDLY_API_TOKEN");
    if (!calendlyToken) {
      return new Response(JSON.stringify({ error: "CALENDLY_API_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get Calendly user URI first
    const meRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${calendlyToken}` },
    });
    if (!meRes.ok) throw new Error(`Calendly /users/me failed: ${meRes.status}`);
    const meData = await meRes.json();
    const orgUri = meData.resource.current_organization;

    // Fetch scheduled events (last 90 days, active)
    const minStart = new Date(Date.now() - 90 * 86400000).toISOString();
    let allEvents: any[] = [];
    let nextPage: string | null = null;
    let page = 0;

    do {
      const eventsUrl = nextPage || `https://api.calendly.com/scheduled_events?organization=${encodeURIComponent(orgUri)}&min_start_time=${minStart}&status=active&count=100`;
      const evRes = await fetch(eventsUrl, {
        headers: { Authorization: `Bearer ${calendlyToken}` },
      });
      if (!evRes.ok) throw new Error(`Calendly events fetch failed: ${evRes.status}`);
      const evData = await evRes.json();
      allEvents = allEvents.concat(evData.collection || []);
      nextPage = evData.pagination?.next_page || null;
      page++;
    } while (nextPage && page < 10);

    console.log(`[backfill-calendly] Found ${allEvents.length} events`);

    const results: any[] = [];

    for (const event of allEvents) {
      const eventUri = event.uri;
      const eventUuid = eventUri.split("/").pop();
      const startTime = event.start_time;
      const endTime = event.end_time;
      const eventCreatedAt = event.created_at || "";
      const eventName = event.name || "Calendly Meeting";
      const eventType = event.event_type || "";
      const eventDuration = (startTime && endTime)
        ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
        : null;

      // Fetch invitees
      const invRes = await fetch(`https://api.calendly.com/scheduled_events/${eventUuid}/invitees`, {
        headers: { Authorization: `Bearer ${calendlyToken}` },
      });
      if (!invRes.ok) {
        results.push({ event: eventName, status: "invitee_fetch_failed", code: invRes.status });
        continue;
      }
      const invData = await invRes.json();

      for (const invitee of invData.collection || []) {
        const email = (invitee.email || "").toLowerCase().trim();
        if (!email) continue;

        // Look up lead
        const { data: leads, error: lookupErr } = await supabase
          .from("leads")
          .select("id, stage, created_at, date_submitted, name, calendly_booked_at")
          .eq("email", email)
          .limit(1);

        if (lookupErr || !leads || leads.length === 0) {
          results.push({ email, event: eventName, status: "no_lead_match" });
          continue;
        }

        const lead = leads[0];

        // Skip if already has calendly_booked_at (unless force mode)
        if (!forceMode && lead.calendly_booked_at && lead.calendly_booked_at !== "") {
          results.push({ email, lead: lead.name, status: "already_stamped" });
          continue;
        }

        const now = new Date();
        const nowISO = now.toISOString();
        const bookingTime = eventCreatedAt ? new Date(eventCreatedAt) : now;
        const bookingISO = eventCreatedAt || nowISO;
        const bookingDate = bookingTime.toISOString().split("T")[0];

        // Store full ISO timestamp for meeting_date (preserves time)
        const meetingDateFull = startTime || "";

        const hoursToMeetingSet = calcHoursToMeetingSet(
          lead.created_at,
          lead.date_submitted,
          bookingTime
        );

        const detectedBrand = detectBrand(eventName);

        if (PRE_MEETING_STAGES.includes(lead.stage)) {
          const updateData: Record<string, any> = {
            stage: "Meeting Set",
            meeting_date: meetingDateFull,
            meeting_set_date: bookingDate,
            hours_to_meeting_set: hoursToMeetingSet,
            stage_entered_date: bookingDate,
            last_contact_date: bookingDate,
            calendly_booked_at: bookingISO,
            calendly_event_name: eventName,
            calendly_event_type: eventType,
            calendly_event_duration: eventDuration,
            assigned_to: CALENDLY_DEFAULT_OWNER,
            updated_at: nowISO,
          };
          if (detectedBrand) updateData.brand = detectedBrand;
          await supabase.from("leads").update(updateData).eq("id", lead.id);

          await supabase.from("lead_activity_log").insert({
            lead_id: lead.id,
            event_type: "stage_change",
            description: `Stage changed from "${lead.stage}" → "Meeting Set" (Calendly backfill: ${eventName}, scheduled for ${meetingDateFull || "TBD"}, assigned to ${CALENDLY_DEFAULT_OWNER})`,
            old_value: lead.stage,
            new_value: "Meeting Set",
          });

          results.push({ email, lead: lead.name, status: "advanced_to_meeting_set", meetingDate: meetingDateFull, hoursToMeetingSet, assignedTo: CALENDLY_DEFAULT_OWNER, brand: detectedBrand });
        } else {
          const updateData: Record<string, any> = {
            calendly_booked_at: bookingISO,
            meeting_date: meetingDateFull || undefined,
            meeting_set_date: bookingDate,
            hours_to_meeting_set: hoursToMeetingSet,
            assigned_to: CALENDLY_DEFAULT_OWNER,
            updated_at: nowISO,
          };
          if (detectedBrand) updateData.brand = detectedBrand;
          await supabase.from("leads").update(updateData).eq("id", lead.id);

          results.push({ email, lead: lead.name, status: "stamped_only", currentStage: lead.stage, meetingDate: meetingDateFull, hoursToMeetingSet, assignedTo: CALENDLY_DEFAULT_OWNER, brand: detectedBrand });
        }
      }
    }

    console.log(`[backfill-calendly] Done. ${results.length} invitees processed.`);

    return new Response(JSON.stringify({ success: true, eventsScanned: allEvents.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[backfill-calendly] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
