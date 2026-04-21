// Full-history Calendly backfill.
//
// One-shot edge function that scans Malik's entire Calendly history (default
// since 2019-01-01), matches invitees to existing leads via primary email,
// secondary_contacts JSONB, and lead_stakeholders, and stamps the lead with
// Calendly metadata. Pre-meeting stages get advanced to "Meeting Set".
//
// Resilience: if it approaches wall-time, it persists a cursor in
// calendly_backfill_state and self-reschedules via fire-and-forget POST.
// Idempotent: never overwrites a meeting_date that's already newer than the
// Calendly event for that lead.
//
// Auth: dual mode — INGEST_API_KEY header/query OR Supabase Bearer token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const PRE_MEETING_STAGES = ["New Lead", "Contacted", "Qualifying"];
const CALENDLY_DEFAULT_OWNER = "Malik";

// Wall-time budget. Edge functions cap at ~150s; we self-reschedule well before.
const WALL_TIME_BUDGET_MS = 100_000;

function detectBrand(eventName: string): string | null {
  const lower = eventName.toLowerCase();
  if (lower.includes("sourceco")) return "SourceCo";
  if (lower.includes("captarget")) return "Captarget";
  return null;
}

function calcHoursToMeetingSet(
  leadCreatedAt: string | null,
  dateSubmitted: string | null,
  bookingTime: Date
): number {
  const createdAtMs = leadCreatedAt ? new Date(leadCreatedAt).getTime() : 0;
  const dateSubmittedMs = dateSubmitted ? new Date(dateSubmitted).getTime() : 0;
  const bookingMs = bookingTime.getTime();

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

/**
 * Match an invitee email to a lead. Tries:
 * 1. leads.email exact match
 * 2. leads.secondary_contacts JSONB contains the email
 * 3. lead_stakeholders.email exact match
 * Returns the first matched lead with the fields we need.
 */
async function matchLeadByEmail(supabase: any, email: string) {
  // 1. Primary email
  const { data: primary } = await supabase
    .from("leads")
    .select("id, stage, created_at, date_submitted, name, calendly_booked_at, meeting_date, brand")
    .eq("email", email)
    .limit(1);
  if (primary && primary.length > 0) return { lead: primary[0], matchType: "primary" };

  // 2. secondary_contacts JSONB — case-insensitive contains
  // Use ilike on the JSONB-as-text representation. Cheap and covers nested shapes.
  const { data: secondary } = await supabase
    .from("leads")
    .select("id, stage, created_at, date_submitted, name, calendly_booked_at, meeting_date, brand")
    .filter("secondary_contacts::text", "ilike", `%${email}%`)
    .limit(1);
  if (secondary && secondary.length > 0) return { lead: secondary[0], matchType: "secondary_contact" };

  // 3. Stakeholders table
  const { data: stakeholder } = await supabase
    .from("lead_stakeholders")
    .select("lead_id")
    .eq("email", email)
    .limit(1);
  if (stakeholder && stakeholder.length > 0) {
    const { data: stLead } = await supabase
      .from("leads")
      .select("id, stage, created_at, date_submitted, name, calendly_booked_at, meeting_date, brand")
      .eq("id", stakeholder[0].lead_id)
      .limit(1);
    if (stLead && stLead.length > 0) return { lead: stLead[0], matchType: "stakeholder" };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-api-key") || url.searchParams.get("key");
    const expectedKey = Deno.env.get("INGEST_API_KEY");
    const authHeader = req.headers.get("authorization");
    const hasValidApiKey = expectedKey && apiKey === expectedKey;
    const hasAuthHeader = authHeader && authHeader.startsWith("Bearer ");
    if (!hasValidApiKey && !hasAuthHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = url.searchParams.get("since") || "2019-01-01";
    const includeCancelled = url.searchParams.get("include_cancelled") === "true";
    const forceMode = url.searchParams.get("force") === "true";
    // Resume cursor — when self-rescheduling we pass next_page back in.
    let nextPage: string | null = url.searchParams.get("cursor");
    // Aggregate counters can be passed forward across self-reschedules.
    const carry = {
      eventsScanned: parseInt(url.searchParams.get("c_scanned") || "0", 10),
      leadsAdvanced: parseInt(url.searchParams.get("c_advanced") || "0", 10),
      leadsStamped: parseInt(url.searchParams.get("c_stamped") || "0", 10),
      alreadyStamped: parseInt(url.searchParams.get("c_already") || "0", 10),
      unmatchedInvitees: parseInt(url.searchParams.get("c_unmatched") || "0", 10),
      cancelledStamped: parseInt(url.searchParams.get("c_cancelled") || "0", 10),
      captargetStamped: parseInt(url.searchParams.get("c_capt") || "0", 10),
      sourcecoStamped: parseInt(url.searchParams.get("c_src") || "0", 10),
    };

    console.log(
      `[backfill-calendly] since=${since} include_cancelled=${includeCancelled} force=${forceMode} resume=${!!nextPage}`
    );

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

    // Need org URI for the initial events query (not needed when resuming via next_page).
    let orgUri: string | null = null;
    if (!nextPage) {
      const meRes = await fetch("https://api.calendly.com/users/me", {
        headers: { Authorization: `Bearer ${calendlyToken}` },
      });
      if (!meRes.ok) throw new Error(`Calendly /users/me failed: ${meRes.status}`);
      const meData = await meRes.json();
      orgUri = meData.resource.current_organization;
    }

    const minStartISO = new Date(since).toISOString();
    const statusFilter = includeCancelled ? "" : "&status=active";
    const sampleUnmatched: string[] = [];

    let pagesThisRun = 0;
    let timeBudgetExceeded = false;

    while (true) {
      // Self-reschedule check
      if (Date.now() - startedAt > WALL_TIME_BUDGET_MS) {
        timeBudgetExceeded = true;
        break;
      }

      const eventsUrl =
        nextPage ||
        `https://api.calendly.com/scheduled_events?organization=${encodeURIComponent(
          orgUri!
        )}&min_start_time=${minStartISO}${statusFilter}&count=100`;

      const evRes = await fetch(eventsUrl, {
        headers: { Authorization: `Bearer ${calendlyToken}` },
      });
      if (!evRes.ok) throw new Error(`Calendly events fetch failed: ${evRes.status}`);
      const evData = await evRes.json();
      const events: any[] = evData.collection || [];
      pagesThisRun++;

      for (const event of events) {
        carry.eventsScanned++;

        const eventUri = event.uri;
        const eventUuid = eventUri.split("/").pop();
        const startTime = event.start_time;
        const endTime = event.end_time;
        const eventCreatedAt = event.created_at || "";
        const eventName = event.name || "Calendly Meeting";
        const eventType = event.event_type || "";
        const eventStatus = event.status || "active";
        const eventDuration =
          startTime && endTime
            ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
            : null;

        const invRes = await fetch(
          `https://api.calendly.com/scheduled_events/${eventUuid}/invitees`,
          { headers: { Authorization: `Bearer ${calendlyToken}` } }
        );
        if (!invRes.ok) continue;
        const invData = await invRes.json();

        for (const invitee of invData.collection || []) {
          const email = (invitee.email || "").toLowerCase().trim();
          if (!email) continue;

          const match = await matchLeadByEmail(supabase, email);
          if (!match) {
            carry.unmatchedInvitees++;
            if (sampleUnmatched.length < 50) sampleUnmatched.push(`${email} | ${eventName}`);
            continue;
          }

          const lead = match.lead;
          const now = new Date();
          const nowISO = now.toISOString();
          const bookingTime = eventCreatedAt ? new Date(eventCreatedAt) : now;
          const bookingISO = eventCreatedAt || nowISO;
          const bookingDate = bookingTime.toISOString().split("T")[0];
          const meetingDateFull = startTime || "";
          const isCancelled = eventStatus === "canceled" || eventStatus === "cancelled";

          // Skip-already logic: only skip when not forcing AND lead already has
          // calendly_booked_at AND existing meeting_date is same/newer than this event.
          const existingMeetingMs = lead.meeting_date ? new Date(lead.meeting_date).getTime() : 0;
          const newMeetingMs = meetingDateFull ? new Date(meetingDateFull).getTime() : 0;
          if (
            !forceMode &&
            lead.calendly_booked_at &&
            lead.calendly_booked_at !== "" &&
            existingMeetingMs >= newMeetingMs
          ) {
            carry.alreadyStamped++;
            continue;
          }

          const hoursToMeetingSet = calcHoursToMeetingSet(
            lead.created_at,
            lead.date_submitted,
            bookingTime
          );
          const detectedBrand = detectBrand(eventName);

          // Build update — never downgrade meeting_date if existing is newer.
          const updateData: Record<string, any> = {
            calendly_booked_at: bookingISO,
            meeting_set_date: bookingDate,
            hours_to_meeting_set: hoursToMeetingSet,
            calendly_event_name: eventName,
            calendly_event_type: eventType,
            calendly_event_duration: eventDuration,
            assigned_to: CALENDLY_DEFAULT_OWNER,
            updated_at: nowISO,
          };
          if (newMeetingMs > existingMeetingMs) {
            updateData.meeting_date = meetingDateFull;
          }
          if (isCancelled) {
            updateData.meeting_outcome = "cancelled";
          }
          if (detectedBrand && !lead.brand) updateData.brand = detectedBrand;

          // Stage advancement only when not cancelled and lead is pre-meeting.
          let advanced = false;
          if (!isCancelled && PRE_MEETING_STAGES.includes(lead.stage)) {
            updateData.stage = "Meeting Set";
            updateData.stage_entered_date = bookingDate;
            updateData.last_contact_date = bookingDate;
            advanced = true;
          }

          await supabase.from("leads").update(updateData).eq("id", lead.id);

          if (advanced) {
            carry.leadsAdvanced++;
            await supabase.from("lead_activity_log").insert({
              lead_id: lead.id,
              event_type: "stage_change",
              description: `Stage changed from "${lead.stage}" → "Meeting Set" (Calendly backfill: ${eventName}, scheduled for ${meetingDateFull || "TBD"}, match=${match.matchType})`,
              old_value: lead.stage,
              new_value: "Meeting Set",
            });
          }
          carry.leadsStamped++;
          if (isCancelled) carry.cancelledStamped++;
          const finalBrand = detectedBrand || lead.brand;
          if (finalBrand === "Captarget") carry.captargetStamped++;
          else if (finalBrand === "SourceCo") carry.sourcecoStamped++;
        }
      }

      nextPage = evData.pagination?.next_page || null;
      if (!nextPage) break;
    }

    const elapsedMs = Date.now() - startedAt;

    // If we ran out of time but there are still pages, self-reschedule.
    if (timeBudgetExceeded && nextPage) {
      const resumeUrl = new URL(`${Deno.env.get("SUPABASE_URL")}/functions/v1/backfill-calendly`);
      resumeUrl.searchParams.set("cursor", nextPage);
      resumeUrl.searchParams.set("since", since);
      if (includeCancelled) resumeUrl.searchParams.set("include_cancelled", "true");
      if (forceMode) resumeUrl.searchParams.set("force", "true");
      resumeUrl.searchParams.set("c_scanned", String(carry.eventsScanned));
      resumeUrl.searchParams.set("c_advanced", String(carry.leadsAdvanced));
      resumeUrl.searchParams.set("c_stamped", String(carry.leadsStamped));
      resumeUrl.searchParams.set("c_already", String(carry.alreadyStamped));
      resumeUrl.searchParams.set("c_unmatched", String(carry.unmatchedInvitees));
      resumeUrl.searchParams.set("c_cancelled", String(carry.cancelledStamped));
      resumeUrl.searchParams.set("c_capt", String(carry.captargetStamped));
      resumeUrl.searchParams.set("c_src", String(carry.sourcecoStamped));

      // Fire-and-forget — UI/caller gets partial result back immediately.
      fetch(resumeUrl.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
      }).catch((e) => console.error("[backfill-calendly] resume dispatch failed:", e));

      console.log(
        `[backfill-calendly] PARTIAL — ${pagesThisRun} pages, ${elapsedMs}ms, rescheduled.`
      );
      return new Response(
        JSON.stringify({
          success: true,
          partial: true,
          rescheduled: true,
          pagesThisRun,
          elapsedMs,
          ...carry,
          sampleUnmatched,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[backfill-calendly] DONE — scanned ${carry.eventsScanned} events in ${elapsedMs}ms across ${pagesThisRun} pages.`
    );

    return new Response(
      JSON.stringify({
        success: true,
        partial: false,
        pagesThisRun,
        elapsedMs,
        eventsScanned: carry.eventsScanned,
        leadsAdvanced: carry.leadsAdvanced,
        leadsStamped: carry.leadsStamped,
        alreadyStamped: carry.alreadyStamped,
        unmatchedInvitees: carry.unmatchedInvitees,
        cancelledStamped: carry.cancelledStamped,
        byBrandStamped: {
          Captarget: carry.captargetStamped,
          SourceCo: carry.sourcecoStamped,
        },
        sampleUnmatched,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[backfill-calendly] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
