import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Stages that come before "Meeting Set" in the pipeline
const PRE_MEETING_STAGES = ["New Lead", "Contacted", "Qualifying"];

// All Calendly bookings are Malik's calendar
const CALENDLY_DEFAULT_OWNER = "Malik";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth via x-api-key header, ?key= query param, or allow Calendly webhook (no auth but validated by payload structure)
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-api-key") || url.searchParams.get("key");
    const expectedKey = Deno.env.get("INGEST_API_KEY");
    
    // We allow unauthenticated requests since Calendly webhooks can't send custom headers.
    // The endpoint URL acts as a shared secret, and we validate the payload structure below.
    const isAuthenticated = expectedKey && apiKey === expectedKey;

    const body = await req.json();

    // Calendly webhook payload structure
    const event = body.event; // "invitee.created"
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
      .select("id, stage, created_at, name")
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

    // Calculate hours_to_meeting_set
    let hoursToMeetingSet: number | null = null;
    if (lead.created_at) {
      const createdAt = new Date(lead.created_at);
      hoursToMeetingSet = Math.round(((now.getTime() - createdAt.getTime()) / 3600000) * 10) / 10;
    }

    // Format meeting_date as readable string
    const meetingDate = scheduledStart
      ? new Date(scheduledStart).toISOString().split("T")[0]
      : "";

    // Update the lead
    const updatePayload: Record<string, any> = {
      stage: "Meeting Set",
      meeting_date: meetingDate,
      meeting_set_date: nowDate,
      hours_to_meeting_set: hoursToMeetingSet,
      stage_entered_date: nowDate,
      last_contact_date: nowDate,
      calendly_booked_at: nowISO,
      updated_at: nowISO,
      assigned_to: CALENDLY_DEFAULT_OWNER,
    };

    const { error: updateError } = await supabase
      .from("leads")
      .update(updatePayload)
      .eq("id", lead.id);

    if (updateError) throw updateError;

    // Log activity
    const ownerNote = hostOwner ? `, assigned to ${hostOwner}` : "";
    await supabase.from("lead_activity_log").insert({
      lead_id: lead.id,
      event_type: "stage_change",
      description: `Stage changed from "${lead.stage}" → "Meeting Set" (Calendly booking: ${eventName}, scheduled for ${meetingDate || "TBD"}${ownerNote})`,
      old_value: lead.stage,
      new_value: "Meeting Set",
    });

    console.log(`[ingest-calendly-booking] Lead ${lead.id} updated to Meeting Set`);

    return new Response(JSON.stringify({
      status: "updated",
      leadId: lead.id,
      message: `Lead "${lead.name}" moved to Meeting Set`,
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
