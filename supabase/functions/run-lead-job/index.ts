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

const FIELD_LABELS: Record<string, string> = {
  stage: "Pipeline Stage",
  meetingOutcome: "Meeting Outcome",
  meetingDate: "Meeting Date",
  nextFollowUp: "Next Follow-Up",
  priority: "Priority",
  forecastCategory: "Forecast Category",
  icpFit: "ICP Fit",
  serviceInterest: "Service Interest",
  dealValue: "Deal Value",
  assignedTo: "Assigned To",
};

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

  let jobId: string | undefined;

  try {
    const body = await req.json();
    jobId = body.jobId;
    const lead = body.lead;
    const prefetchedMeetings = body.prefetchedMeetings || null;

    if (!jobId || !lead) {
      return new Response(
        JSON.stringify({ error: "jobId and lead are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to processing
    await supabase.from("processing_jobs").update({
      status: "processing",
      progress_message: prefetchedMeetings ? "Processing pre-matched meetings..." : "Searching Fireflies (Captarget)...",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    let newMeetings: any[];

    if (prefetchedMeetings && prefetchedMeetings.length > 0) {
      // Use prefetched meetings — defensively truncate transcripts
      newMeetings = prefetchedMeetings.map((m: any) => ({
        ...m,
        transcript: (m.transcript || "").substring(0, 15000),
      }));
    } else {
      // Build search params and fetch from Fireflies
      const searchEmails: string[] = lead.email ? [lead.email] : [];
      const searchNames: string[] = lead.name ? [lead.name] : [];
      const searchDomains: string[] = [];
      const searchCompanies: string[] = lead.company?.trim() ? [lead.company.trim()] : [];

      if (lead.email) {
        const domain = lead.email.split("@")[1]?.toLowerCase();
        if (domain && !GENERIC_DOMAINS.has(domain)) searchDomains.push(domain);
      }
      if (searchDomains.length === 0 && lead.companyUrl) {
        try {
          const urlDomain = new URL(
            lead.companyUrl.startsWith("http") ? lead.companyUrl : `https://${lead.companyUrl}`
          ).hostname.replace(/^www\./, "").toLowerCase();
          if (urlDomain && !GENERIC_DOMAINS.has(urlDomain)) searchDomains.push(urlDomain);
        } catch { /* skip */ }
      }

      const searchBody = {
        searchEmails,
        searchNames,
        searchDomains,
        searchCompanies,
        limit: 100,
        summarize: false,
      };

      // Fetch from both brands sequentially to avoid Fireflies 429s
      const ctRes = await fetch(`${funcUrl}/fetch-fireflies`, {
        method: "POST",
        headers: funcHeaders,
        body: JSON.stringify({ ...searchBody, brand: "Captarget" }),
      });

      // Update progress message for second brand
      await supabase.from("processing_jobs").update({
        progress_message: "Searching Fireflies (SourceCo)...",
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);

      // Longer delay between brands to respect rate limits
      await new Promise((r) => setTimeout(r, 3000));

      const scRes = await fetch(`${funcUrl}/fetch-fireflies`, {
        method: "POST",
        headers: funcHeaders,
        body: JSON.stringify({ ...searchBody, brand: "SourceCo" }),
      });

      const ctData = ctRes.ok ? await ctRes.json() : { meetings: [] };
      const scData = scRes.ok ? await scRes.json() : { meetings: [] };

      if (!ctRes.ok && !scRes.ok) {
        const ctText = await ctRes.text().catch(() => "");
        throw new Error(`Both Fireflies fetches failed. CT: ${ctRes.status}, SC: ${scRes.status}. ${ctText}`);
      }

      const ctMeetings = (ctData.meetings || []).map((m: any) => ({ ...m, sourceBrand: "Captarget" }));
      const scMeetings = (scData.meetings || []).map((m: any) => ({ ...m, sourceBrand: "SourceCo" }));

      // Deduplicate by firefliesId
      const seenIds = new Set<string>();
      const foundMeetings: any[] = [];
      for (const m of [...ctMeetings, ...scMeetings]) {
        if (m.firefliesId && seenIds.has(m.firefliesId)) continue;
        if (m.firefliesId) seenIds.add(m.firefliesId);
        foundMeetings.push(m);
      }

      // Filter out existing meetings
      const existingIds = new Set(lead.existingMeetingIds || []);
      newMeetings = foundMeetings.filter((m: any) => !existingIds.has(m.firefliesId));
    }

    if (newMeetings.length === 0) {
      await supabase.from("processing_jobs").update({
        status: "completed",
        new_meetings: [],
        pending_suggestions: [],
        applied_updates: {},
        applied_fields: [],
        progress_message: "No new meetings found",
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);

      return new Response(
        JSON.stringify({ success: true, newMeetings: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process each new meeting through AI
    await supabase.from("processing_jobs").update({
      progress_message: `Found ${newMeetings.length} meeting(s), analyzing with AI...`,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    const processedMeetings: any[] = [];
    const allSuggestions: any[] = [];
    const existingMeetings = lead.existingMeetings || [];

    for (let i = 0; i < newMeetings.length; i++) {
      const m = newMeetings[i];
      const transcript = m.transcript || "";
      const priorMeetings = [...existingMeetings, ...processedMeetings];

      let summary = m.summary || "";
      let nextSteps = m.nextSteps || "";
      let intelligence: any = undefined;

      if (transcript.length > 20) {
        try {
          await supabase.from("processing_jobs").update({
            progress_message: `AI analyzing meeting ${i + 1}/${newMeetings.length}: "${(m.title || "Untitled").substring(0, 40)}"`,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);

          const aiRes = await fetch(`${funcUrl}/process-meeting`, {
            method: "POST",
            headers: funcHeaders,
            body: JSON.stringify({ transcript, priorMeetings }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            summary = aiData.summary || summary;
            nextSteps = aiData.nextSteps || nextSteps;
            intelligence = aiData.intelligence;
            if (aiData.suggestedLeadUpdates) {
              allSuggestions.push(aiData.suggestedLeadUpdates);
            }
          } else {
            console.error(`process-meeting failed for meeting ${i}:`, aiRes.status);
          }
        } catch (e) {
          console.error(`AI processing error for meeting ${i}:`, e);
        }
      }

      processedMeetings.push({
        id: generateMeetingId(),
        date: m.date || new Date().toISOString().split("T")[0],
        title: m.title || "Untitled Meeting",
        firefliesId: m.firefliesId,
        firefliesUrl: m.transcriptUrl || "",
        transcript,
        summary,
        nextSteps,
        addedAt: new Date().toISOString(),
        intelligence,
        sourceBrand: m.sourceBrand,
      });

      // Rate limit between AI calls
      if (i < newMeetings.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Process suggestions — separate certain (auto-apply) from likely (pending)
    const appliedUpdates: Record<string, any> = {};
    const appliedFields: string[] = [];
    const pendingSuggestions: any[] = [];
    const today = new Date().toISOString().split("T")[0];

    for (const suggestions of allSuggestions) {
      for (const [field, suggestion] of Object.entries(suggestions) as [string, any][]) {
        if (!suggestion || !suggestion.value) continue;
        if (field === "nextFollowUp" && typeof suggestion.value === "string" && suggestion.value < today) continue;

        if (suggestion.confidence === "Certain") {
          appliedUpdates[field] = suggestion.value;
          appliedFields.push(`${FIELD_LABELS[field] || field}: ${suggestion.value}`);
        } else if (suggestion.confidence === "Likely") {
          pendingSuggestions.push({
            field,
            label: FIELD_LABELS[field] || field,
            value: suggestion.value,
            evidence: suggestion.evidence,
          });
        }
      }
    }

    // Deduplicate pending suggestions by field
    const seenFields = new Set<string>();
    const uniquePending = pendingSuggestions.filter((p) => {
      if (seenFields.has(p.field)) return false;
      seenFields.add(p.field);
      return true;
    });

    // Synthesize deal intelligence
    let dealIntelligence: any = null;
    const allMeetings = [...existingMeetings, ...processedMeetings];
    const meetingsWithIntel = allMeetings.filter((m: any) => m.intelligence);

    if (meetingsWithIntel.length > 0) {
      try {
        await supabase.from("processing_jobs").update({
          progress_message: "Synthesizing deal intelligence...",
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);

        const synthRes = await fetch(`${funcUrl}/synthesize-deal-intelligence`, {
          method: "POST",
          headers: funcHeaders,
          body: JSON.stringify({
            meetings: allMeetings.map((m: any) => ({
              ...m,
              transcript: (m.transcript || "").substring(0, 3000),
            })),
            leadFields: {
              name: lead.name,
              company: lead.company,
              role: lead.role,
              stage: lead.stage,
              priority: lead.priority,
              dealValue: lead.dealValue,
              serviceInterest: lead.serviceInterest,
            },
          }),
        });

        if (synthRes.ok) {
          const synthData = await synthRes.json();
          dealIntelligence = synthData.dealIntelligence || null;
        } else {
          console.error("synthesize-deal-intelligence failed:", synthRes.status);
        }
      } catch (e) {
        console.error("Deal intelligence synthesis error:", e);
      }
    }

    // Write results to DB
    await supabase.from("processing_jobs").update({
      status: "completed",
      new_meetings: processedMeetings,
      applied_updates: appliedUpdates,
      applied_fields: appliedFields,
      pending_suggestions: uniquePending,
      deal_intelligence: dealIntelligence,
      progress_message: `Found ${processedMeetings.length} new meeting(s)`,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    return new Response(
      JSON.stringify({ success: true, newMeetings: processedMeetings.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("run-lead-job error:", e);

    if (jobId) {
      try {
        await supabase.from("processing_jobs").update({
          status: "failed",
          error: e.message || "Unknown error",
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      } catch (dbErr) {
        console.error("Failed to update job status:", dbErr);
      }
    }

    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
