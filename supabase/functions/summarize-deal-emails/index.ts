// Phase 8 — Deal-wide email recap synthesizer.
// Reads all email_thread_intelligence rows for a lead and synthesizes a single
// strategic narrative across all threads. Returns plaintext markdown body so
// the front-end can render directly.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ThreadIntel {
  thread_id: string;
  summary: string;
  sentiment: string;
  recommended_action: string;
  signal_tags: string[];
  email_count: number;
  hot_flag: boolean;
  last_email_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { leadId } = await req.json();
    if (!leadId || typeof leadId !== "string") {
      return new Response(JSON.stringify({ error: "leadId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: lead } = await sb.from("leads")
      .select("id, name, company, stage, days_in_current_stage, stall_reason, deal_narrative, fireflies_summary")
      .eq("id", leadId)
      .maybeSingle();

    const { data: intelRows } = await sb.from("email_thread_intelligence")
      .select("thread_id, summary, sentiment, recommended_action, signal_tags, email_count, hot_flag, last_email_at")
      .eq("lead_id", leadId)
      .order("last_email_at", { ascending: false })
      .limit(20);

    const threads = (intelRows || []) as ThreadIntel[];

    if (threads.length === 0) {
      return new Response(JSON.stringify({
        recap: "No analyzed email threads yet for this deal. Open a thread to generate AI analysis.",
        threadCount: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const threadDigest = threads.map((t, i) => (
      `Thread ${i + 1} (${t.email_count} emails, ${t.sentiment}${t.hot_flag ? ", hot" : ""})\n` +
      `Summary: ${t.summary}\n` +
      `Recommended action: ${t.recommended_action || "none"}\n` +
      `Signals: ${(t.signal_tags || []).join(", ") || "none"}`
    )).join("\n\n");

    const sysPrompt = `You are a senior M&A sales advisor synthesizing email correspondence across a deal.
Output a tight strategic recap (≤180 words) in this exact structure:
**Where we are:** 1-2 sentences on the overall conversation arc.
**What's working:** 1 sentence on positive signals.
**Where it's stuck:** 1 sentence on friction.
**Recommended next move:** 1 sentence with a specific action.

Be specific, cite evidence, no filler, no greetings, no sign-off.`;

    const userPrompt = `Deal: ${lead?.name || ""} at ${lead?.company || ""}
Stage: ${lead?.stage || "unknown"} (${lead?.days_in_current_stage ?? "?"} days)
${lead?.stall_reason ? `Stall reason: ${lead.stall_reason}` : ""}
${lead?.deal_narrative ? `Narrative: ${lead.deal_narrative}` : ""}

${threads.length} email threads analyzed:

${threadDigest}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI provider error (${aiRes.status}): ${txt.slice(0, 200)}`);
    }
    const aiData = await aiRes.json();
    const recap = aiData?.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({
      recap,
      threadCount: threads.length,
      hotThreads: threads.filter(t => t.hot_flag).length,
      sentimentMix: {
        positive: threads.filter(t => t.sentiment === "positive" || t.sentiment === "engaged").length,
        neutral: threads.filter(t => t.sentiment === "neutral").length,
        cooling: threads.filter(t => t.sentiment === "cooling" || t.sentiment === "negative").length,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[summarize-deal-emails] error:", e);
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
