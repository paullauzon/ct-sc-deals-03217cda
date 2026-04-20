import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Extracts structured intelligence from a call summary so the Activities tab
 * can render decisions / action items / next step pills the same way it does
 * for meeting transcripts. Single-shot, GPT-4o-mini, returns JSON.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { summary, outcome = "Connected", duration = "" } = await req.json();
    const text = (summary || "").toString().trim();
    if (text.length < 40) {
      // Below threshold — caller will skip storing intel, no AI burn.
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const sys = `You extract structured intelligence from sales call summaries written by reps.
Return ONLY a JSON object with these fields (omit any field if nothing applies):
{
  "decisions": string[],          // concrete decisions made on the call (max 4, ≤120 chars each)
  "actionItems": [                // commitments by either side (max 5)
    { "owner": "us" | "them" | "shared", "item": string, "deadline": string }
  ],
  "nextStep": string,             // single recommended next step (≤140 chars)
  "engagement": "Highly Engaged" | "Engaged" | "Passive" | "Disengaged",
  "objections": string[],         // up to 3
  "painPoints": string[]          // up to 3
}
Be specific, no filler, no em/en dashes. Skip fields you don't have evidence for.`;

    const user = `Outcome: ${outcome}${duration ? ` · ${duration} min` : ""}\n\nSummary:\n${text}`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("openai error", resp.status, t);
      return new Response(JSON.stringify({ skipped: true, error: "ai_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    return new Response(JSON.stringify({ intel: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-call-intel error:", e);
    return new Response(JSON.stringify({ skipped: true, error: e instanceof Error ? e.message : "unknown" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
