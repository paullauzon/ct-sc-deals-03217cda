import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "live.com", "msn.com",
  "me.com", "mac.com", "googlemail.com", "ymail.com",
]);

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.substring(at + 1).toLowerCase();
}

function generateMeetingId(): string {
  return `mtg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const funcUrl = `${SUPABASE_URL}/functions/v1`;
  const funcHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  };

  try {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    console.log(`[sync-fireflies] Running. Window: ${twoHoursAgo.toISOString()} to ${tenMinAgo.toISOString()}`);

    // Query leads with meeting_date in the window
    // meeting_date is stored as ISO string text from Calendly
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, name, email, company, company_url, meetings, stage, brand, meeting_date")
      .neq("meeting_date", "")
      .gte("meeting_date", twoHoursAgo.toISOString())
      .lte("meeting_date", tenMinAgo.toISOString());

    if (leadsErr) {
      console.error("[sync-fireflies] Error querying leads:", leadsErr);
      return new Response(JSON.stringify({ error: leadsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!leads || leads.length === 0) {
      console.log("[sync-fireflies] No leads with meetings in the window.");
      return new Response(JSON.stringify({ synced: 0, message: "No eligible leads" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[sync-fireflies] Found ${leads.length} leads with meetings in window.`);

    let synced = 0;
    const results: Array<{ leadId: string; name: string; status: string }> = [];

    for (const lead of leads) {
      try {
        // Check if meetings JSONB already has a firefliesId entry near this meeting time
        const existingMeetings: any[] = Array.isArray(lead.meetings) ? lead.meetings : [];
        const meetingTime = new Date(lead.meeting_date).getTime();

        const alreadyHasFireflies = existingMeetings.some((m: any) => {
          if (!m.firefliesId) return false;
          if (!m.date) return true; // has fireflies entry, close enough
          const mTime = new Date(m.date).getTime();
          return Math.abs(mTime - meetingTime) < 60 * 60 * 1000; // within 1 hour
        });

        if (alreadyHasFireflies) {
          console.log(`[sync-fireflies] Lead ${lead.name}: already has Fireflies meeting, skipping.`);
          results.push({ leadId: lead.id, name: lead.name, status: "already_synced" });
          continue;
        }

        // Build search criteria for fetch-fireflies
        const searchEmails: string[] = [];
        const searchNames: string[] = [];
        const searchDomains: string[] = [];
        const searchCompanies: string[] = [];

        if (lead.email) {
          searchEmails.push(lead.email);
          const domain = extractDomain(lead.email);
          if (domain && !GENERIC_DOMAINS.has(domain)) {
            searchDomains.push(domain);
          }
        }
        if (lead.name) searchNames.push(lead.name);
        if (lead.company) searchCompanies.push(lead.company);

        console.log(`[sync-fireflies] Lead ${lead.name}: searching Fireflies (emails: ${searchEmails}, names: ${searchNames}, domains: ${searchDomains}, companies: ${searchCompanies})`);

        // Call fetch-fireflies
        const ffResponse = await fetch(`${funcUrl}/fetch-fireflies`, {
          method: "POST",
          headers: funcHeaders,
          body: JSON.stringify({
            brand: lead.brand || "Captarget",
            searchEmails,
            searchNames,
            searchDomains,
            searchCompanies,
            limit: 5,
            since: twoHoursAgo.toISOString(),
            summarize: false, // We'll process through process-meeting instead
          }),
        });

        if (!ffResponse.ok) {
          const errText = await ffResponse.text();
          console.error(`[sync-fireflies] fetch-fireflies failed for ${lead.name}:`, errText);
          results.push({ leadId: lead.id, name: lead.name, status: "fetch_failed" });
          continue;
        }

        const ffData = await ffResponse.json();
        const ffMeetings: any[] = ffData.meetings || [];

        if (ffMeetings.length === 0) {
          console.log(`[sync-fireflies] Lead ${lead.name}: no Fireflies meetings found.`);
          results.push({ leadId: lead.id, name: lead.name, status: "no_match" });
          continue;
        }

        // Find the best matching meeting by date proximity to the Calendly meeting
        let bestMatch: any = null;
        let bestDiff = Infinity;

        for (const ffm of ffMeetings) {
          if (!ffm.date) continue;
          const ffmTime = new Date(ffm.date).getTime();
          const diff = Math.abs(ffmTime - meetingTime);
          if (diff < 30 * 60 * 1000 && diff < bestDiff) { // within 30 min
            bestDiff = diff;
            bestMatch = ffm;
          }
        }

        if (!bestMatch) {
          // Fallback: take the closest meeting if within 2 hours
          for (const ffm of ffMeetings) {
            if (!ffm.date) continue;
            const ffmTime = new Date(ffm.date).getTime();
            const diff = Math.abs(ffmTime - meetingTime);
            if (diff < 2 * 60 * 60 * 1000 && diff < bestDiff) {
              bestDiff = diff;
              bestMatch = ffm;
            }
          }
        }

        if (!bestMatch) {
          console.log(`[sync-fireflies] Lead ${lead.name}: no meeting within time window.`);
          results.push({ leadId: lead.id, name: lead.name, status: "no_time_match" });
          continue;
        }

        console.log(`[sync-fireflies] Lead ${lead.name}: matched Fireflies meeting "${bestMatch.title}" (diff: ${Math.round(bestDiff / 60000)}min)`);

        // Check dedup by firefliesId
        const alreadyById = existingMeetings.some((m: any) => m.firefliesId === bestMatch.firefliesId);
        if (alreadyById) {
          console.log(`[sync-fireflies] Lead ${lead.name}: firefliesId ${bestMatch.firefliesId} already exists, skipping.`);
          results.push({ leadId: lead.id, name: lead.name, status: "already_synced" });
          continue;
        }

        // Process through process-meeting for AI analysis
        let intelligence = null;
        const hasTranscript = bestMatch.transcript && bestMatch.transcript.length > 50;

        // Empty transcript path: enqueue into retry queue and skip writing the meeting.
        // The retry runner will re-fetch and patch the meeting in once a transcript lands.
        if (!hasTranscript && bestMatch.firefliesId) {
          await supabase
            .from("fireflies_retry_queue")
            .upsert({
              fireflies_id: bestMatch.firefliesId,
              lead_id: lead.id,
              attempts: 0,
              max_attempts: 5,
              status: "pending",
              next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }, { onConflict: "fireflies_id" });
          console.log(`[sync-fireflies] Lead ${lead.name}: empty transcript — enqueued for retry.`);
          results.push({ leadId: lead.id, name: lead.name, status: "enqueued_for_retry" });
          continue;
        }

        if (hasTranscript) {
          try {
            // Get prior meetings for context
            const priorMeetings = existingMeetings
              .filter((m: any) => m.intelligence)
              .sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

            const pmResponse = await fetch(`${funcUrl}/process-meeting`, {
              method: "POST",
              headers: funcHeaders,
              body: JSON.stringify({
                transcript: bestMatch.transcript,
                priorMeetings,
              }),
            });

            if (pmResponse.ok) {
              const pmData = await pmResponse.json();
              intelligence = pmData.intelligence || null;
              console.log(`[sync-fireflies] Lead ${lead.name}: AI processing complete.`);
            } else {
              console.error(`[sync-fireflies] process-meeting failed for ${lead.name}:`, await pmResponse.text());
            }
          } catch (e) {
            console.error(`[sync-fireflies] process-meeting error for ${lead.name}:`, e);
          }
        }

        // Build meeting entry
        const newMeeting = {
          id: generateMeetingId(),
          firefliesId: bestMatch.firefliesId,
          title: bestMatch.title || "Untitled Meeting",
          date: bestMatch.date,
          duration: bestMatch.duration || 0,
          attendees: bestMatch.attendees || [],
          attendeeEmails: bestMatch.attendeeEmails || [],
          transcriptUrl: bestMatch.transcriptUrl || "",
          transcript: bestMatch.transcript || "",
          summary: intelligence?.summary || bestMatch.summary || "",
          nextSteps: intelligence?.nextSteps
            ? intelligence.nextSteps.map((ns: any) => `${ns.action} (${ns.owner})`).join("\n")
            : bestMatch.nextSteps || "",
          intelligence,
          noRecording: !hasTranscript,
          source: "auto-sync",
        };

        // Append to meetings array
        const updatedMeetings = [...existingMeetings, newMeeting];

        // Build update object
        const updateObj: Record<string, any> = {
          meetings: updatedMeetings,
          updated_at: new Date().toISOString(),
        };

        // If transcript exists, update fireflies fields
        if (hasTranscript) {
          updateObj.fireflies_transcript = bestMatch.transcript;
          updateObj.fireflies_summary = newMeeting.summary;
          updateObj.fireflies_next_steps = newMeeting.nextSteps;
          if (bestMatch.transcriptUrl) {
            updateObj.fireflies_url = bestMatch.transcriptUrl;
          }
        }

        // Advance stage if currently "Meeting Set"
        if (lead.stage === "Meeting Set") {
          updateObj.stage = "Meeting Held";
          updateObj.stage_entered_date = new Date().toISOString().split("T")[0];
          updateObj.meeting_outcome = hasTranscript ? "Held" : "Held";
        }

        const { error: updateErr } = await supabase
          .from("leads")
          .update(updateObj)
          .eq("id", lead.id);

        if (updateErr) {
          console.error(`[sync-fireflies] Failed to update lead ${lead.name}:`, updateErr);
          results.push({ leadId: lead.id, name: lead.name, status: "update_failed" });
          continue;
        }

        // Log activity
        await supabase.from("lead_activity_log").insert({
          lead_id: lead.id,
          event_type: "meeting_synced",
          description: `Auto-synced Fireflies meeting: "${bestMatch.title}"`,
          new_value: bestMatch.firefliesId,
        });

        if (lead.stage === "Meeting Set") {
          await supabase.from("lead_activity_log").insert({
            lead_id: lead.id,
            event_type: "stage_change",
            description: "Stage auto-advanced after meeting sync",
            old_value: "Meeting Set",
            new_value: "Meeting Held",
          });
        }

        synced++;
        results.push({ leadId: lead.id, name: lead.name, status: "synced" });
        console.log(`[sync-fireflies] Lead ${lead.name}: successfully synced and updated.`);
      } catch (e) {
        console.error(`[sync-fireflies] Error processing lead ${lead.name}:`, e);
        results.push({ leadId: lead.id, name: lead.name, status: "error" });
      }
    }

    console.log(`[sync-fireflies] Complete. Synced ${synced}/${leads.length} leads.`);

    return new Response(
      JSON.stringify({ synced, total: leads.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[sync-fireflies] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
