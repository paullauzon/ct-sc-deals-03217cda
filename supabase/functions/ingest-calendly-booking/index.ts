import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Stages that come before "Meeting Set" in the pipeline
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
    
    const isAuthenticated = expectedKey && apiKey === expectedKey;

    const body = await req.json();

    const event = body.event;
    const payload = body.payload;

    if (event !== "invitee.created" || !payload) {
      return new Response(JSON.stringify({ status: "ignored", reason: "Not an invitee.created event" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inviteeEmail = (payload.email || payload.invitee?.email || "").toLowerCase().trim();
    const inviteeName = payload.name || payload.invitee?.name || "";
    const scheduledStart = payload.scheduled_event?.start_time || payload.event?.start_time || "";
    const scheduledEnd = payload.scheduled_event?.end_time || payload.event?.end_time || "";
    const eventCreatedAt = payload.scheduled_event?.created_at || payload.event?.created_at || "";
    const eventName = payload.scheduled_event?.name || payload.event?.name || "Calendly Meeting";
    const eventType = payload.scheduled_event?.event_type || payload.event?.event_type || "";
    const eventName = payload.scheduled_event?.name || payload.event?.name || "Calendly Meeting";

    console.log(`[ingest-calendly-booking] Booking: ${inviteeEmail} | ${inviteeName} | ${scheduledStart} | owner: ${CALENDLY_DEFAULT_OWNER}`);

    if (!inviteeEmail) {
      return new Response(JSON.stringify({ error: "No invitee email found in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up lead by email
    const { data: leads, error: lookupError } = await supabase
      .from("leads")
      .select("id, stage, created_at, date_submitted, name")
      .eq("email", inviteeEmail)
      .limit(1);

    if (lookupError) throw lookupError;

    if (!leads || leads.length === 0) {
      console.warn(`[ingest-calendly-booking] No lead found for ${inviteeEmail}`);
      return new Response(JSON.stringify({
        status: "no_match",
        message: `No lead found for ${inviteeEmail}. Lead may arrive via form submission later.`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = leads[0];
    const now = new Date();
    const nowISO = now.toISOString();
    const nowDate = nowISO.split("T")[0];

    // Only advance if lead is in a pre-meeting stage
    if (!PRE_MEETING_STAGES.includes(lead.stage)) {
      console.log(`[ingest-calendly-booking] Lead ${lead.id} already at stage "${lead.stage}", skipping stage update`);
      return new Response(JSON.stringify({
        status: "skipped",
        leadId: lead.id,
        message: `Lead already at "${lead.stage}"`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bookingTime = eventCreatedAt ? new Date(eventCreatedAt) : now;

    const hoursToMeetingSet = calcHoursToMeetingSet(
      lead.created_at,
      lead.date_submitted,
      bookingTime
    );

    // Store full ISO timestamp for meeting_date (preserves time)
    const meetingDateFull = scheduledStart || "";
    const meetingDateDisplay = scheduledStart
      ? new Date(scheduledStart).toISOString().split("T")[0]
      : "";

    // Detect brand from event name
    const detectedBrand = detectBrand(eventName);

    // Update the lead
    const updatePayload: Record<string, any> = {
      stage: "Meeting Set",
      meeting_date: meetingDateFull,
      meeting_set_date: nowDate,
      hours_to_meeting_set: hoursToMeetingSet,
      stage_entered_date: nowDate,
      last_contact_date: nowDate,
      calendly_booked_at: nowISO,
      updated_at: nowISO,
      assigned_to: CALENDLY_DEFAULT_OWNER,
    };
    if (detectedBrand) updatePayload.brand = detectedBrand;

    const { error: updateError } = await supabase
      .from("leads")
      .update(updatePayload)
      .eq("id", lead.id);

    if (updateError) throw updateError;

    // Log activity
    const ownerNote = `, assigned to ${CALENDLY_DEFAULT_OWNER}`;
    await supabase.from("lead_activity_log").insert({
      lead_id: lead.id,
      event_type: "stage_change",
      description: `Stage changed from "${lead.stage}" → "Meeting Set" (Calendly booking: ${eventName}, scheduled for ${meetingDateDisplay || "TBD"}${ownerNote})`,
      old_value: lead.stage,
      new_value: "Meeting Set",
    });

    console.log(`[ingest-calendly-booking] Lead ${lead.id} updated to Meeting Set (hours: ${hoursToMeetingSet})`);

    return new Response(JSON.stringify({
      status: "updated",
      leadId: lead.id,
      message: `Lead "${lead.name}" moved to Meeting Set`,
      hoursToMeetingSet,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ingest-calendly-booking] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
