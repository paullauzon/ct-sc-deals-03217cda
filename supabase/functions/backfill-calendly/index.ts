import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const PRE_MEETING_STAGES = ["New Lead", "Contacted", "Qualifying"];

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
    const userUri = meData.resource.uri;
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
      const eventName = event.name || "Calendly Meeting";

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
          .select("id, stage, created_at, name, calendly_booked_at")
          .eq("email", email)
          .limit(1);

        if (lookupErr || !leads || leads.length === 0) {
          results.push({ email, event: eventName, status: "no_lead_match" });
          continue;
        }

        const lead = leads[0];

        // Skip if already has calendly_booked_at
        if (lead.calendly_booked_at && lead.calendly_booked_at !== "") {
          results.push({ email, lead: lead.name, status: "already_stamped" });
          continue;
        }

        const now = new Date();
        const nowISO = now.toISOString();
        const nowDate = nowISO.split("T")[0];
        const meetingDate = startTime ? new Date(startTime).toISOString().split("T")[0] : "";

        if (PRE_MEETING_STAGES.includes(lead.stage)) {
          // Advance to Meeting Set
          let hoursToMeetingSet: number | null = null;
          if (lead.created_at) {
            const createdAt = new Date(lead.created_at);
            hoursToMeetingSet = Math.round(((now.getTime() - createdAt.getTime()) / 3600000) * 10) / 10;
          }

          await supabase.from("leads").update({
            stage: "Meeting Set",
            meeting_date: meetingDate,
            meeting_set_date: nowDate,
            hours_to_meeting_set: hoursToMeetingSet,
            stage_entered_date: nowDate,
            last_contact_date: nowDate,
            calendly_booked_at: nowISO,
            updated_at: nowISO,
          }).eq("id", lead.id);

          await supabase.from("lead_activity_log").insert({
            lead_id: lead.id,
            event_type: "stage_change",
            description: `Stage changed from "${lead.stage}" → "Meeting Set" (Calendly backfill: ${eventName}, scheduled for ${meetingDate || "TBD"})`,
            old_value: lead.stage,
            new_value: "Meeting Set",
          });

          results.push({ email, lead: lead.name, status: "advanced_to_meeting_set", meetingDate });
        } else {
          // Just stamp calendly_booked_at
          await supabase.from("leads").update({
            calendly_booked_at: nowISO,
            meeting_date: lead.stage === "Meeting Set" && !meetingDate ? "" : meetingDate || undefined,
            updated_at: nowISO,
          }).eq("id", lead.id);

          results.push({ email, lead: lead.name, status: "stamped_only", currentStage: lead.stage, meetingDate });
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
