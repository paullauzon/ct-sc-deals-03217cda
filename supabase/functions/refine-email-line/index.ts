// Phase 4 — inline writing tools: rewrite a single line/paragraph or whole body.
// Modes: "improve" | "shorten" | "expand" | "add_proof" | "soften" | "strengthen"
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Mode = "improve" | "shorten" | "expand" | "add_proof" | "soften" | "strengthen";

interface RefineRequest {
  text: string;            // The text to rewrite (selection or whole body)
  fullBody?: string;       // Optional surrounding context if `text` is a selection
  mode: Mode;
  proofPoint?: string;     // Required when mode === "add_proof"
  tone?: string;           // Optional override (e.g. "more peer-to-peer")
}

const MODE_INSTRUCTIONS: Record<Mode, string> = {
  improve: "Rewrite this to be sharper, more specific, and more confident. Preserve meaning and length within ±10%.",
  shorten: "Cut to ~50% length while preserving the core ask and any concrete proof. Remove filler.",
  expand: "Expand by ~30-50% to add one specific detail or proof. Do not pad with filler.",
  add_proof: "Weave in the provided proof point naturally. The proof point should feel earned, not bolted on.",
  soften: "Rewrite with slightly less direct language. Still confident, but less pushy.",
  strengthen: "Rewrite to be more direct and confident. Remove hedging words ('maybe', 'might', 'just', 'really').",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RefineRequest;
  try { body = await req.json() as RefineRequest; }
  catch { return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

  if (!body.text?.trim() || !body.mode) {
    return new Response(JSON.stringify({ error: "text and mode required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (body.mode === "add_proof" && !body.proofPoint?.trim()) {
    return new Response(JSON.stringify({ error: "proofPoint required for add_proof mode" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sys = `You are a precision rewriting tool for B2B sales emails.

HARD RULES:
- No em-dashes or en-dashes. Use commas or periods.
- No filler phrases ("hope you're well", "just checking in", "circling back").
- No emojis.
- Peer-to-peer professional tone.
- Preserve any [bracket_variables] verbatim — do not resolve, expand, or remove them.
- Return ONLY the rewritten text. No prefix, no explanation, no quotes around the output.`;

  const instruction = MODE_INSTRUCTIONS[body.mode];
  const proofLine = body.mode === "add_proof" ? `\n\nProof point to weave in: "${body.proofPoint}"` : "";
  const toneLine = body.tone ? `\n\nAdditional tone direction: ${body.tone}` : "";
  const ctxLine = body.fullBody && body.fullBody !== body.text
    ? `\n\nSurrounding email body (for tone matching only — do NOT rewrite this):\n"""${body.fullBody}"""`
    : "";

  const userPrompt = `${instruction}${proofLine}${toneLine}${ctxLine}\n\nText to rewrite:\n"""${body.text}"""`;

  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `gateway fetch failed: ${e instanceof Error ? e.message : e}` }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (aiResponse.status === 429) {
    return new Response(JSON.stringify({ error: "Rate limit hit — try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (aiResponse.status === 402) {
    return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!aiResponse.ok) {
    const t = await aiResponse.text();
    console.error("AI gateway error", aiResponse.status, t);
    return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const aiJson = await aiResponse.json();
  let rewritten: string = aiJson?.choices?.[0]?.message?.content || "";
  rewritten = rewritten.trim().replace(/^"+|"+$/g, "").replace(/[—–]/g, "-").trim();

  if (!rewritten) {
    return new Response(JSON.stringify({ error: "AI returned empty output" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ rewritten, mode: body.mode }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
