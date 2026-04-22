import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

/**
 * POST { subject, body, direction, fromName, leadFirstName? }
 * Returns: { sentiment, headline, signals: string[] } — single message AI reading.
 * Not persisted; cheap and rendered on-demand when a message is expanded.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      subject = "",
      body = "",
      direction = "inbound",
      fromName = "",
      leadFirstName = "",
    } = await req.json();

    const trimmed = String(body || "").replace(/\s+/g, " ").slice(0, 3000);
    if (!trimmed && !subject) {
      return new Response(JSON.stringify({ sentiment: "neutral", headline: "", signals: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys = `You read a single sales email and produce a one-line "what this means" for the rep, plus a sentiment label and up to 3 short signal tags. No fluff, no greetings, no em/en dashes. Max 18 words for the headline. Be concrete.`;

    const userPrompt = `Direction: ${direction}\nFrom: ${fromName || "(unknown)"}\nLead first name: ${leadFirstName || "(unknown)"}\nSubject: ${subject}\n\nBody:\n${trimmed}\n\nReturn the structured analysis.`;

    const tool = {
      type: "function",
      function: {
        name: "report_message",
        description: "Return per-message reading.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            sentiment: {
              type: "string",
              enum: ["positive", "engaged", "neutral", "cooling", "negative"],
            },
            headline: { type: "string", description: "One sentence; <=18 words" },
            signals: {
              type: "array",
              items: { type: "string" },
              maxItems: 3,
              description: "Short tags like 'asks for pricing', 'offers proof', 'objection: timing'",
            },
          },
          required: ["sentiment", "headline", "signals"],
        },
      },
    };

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "report_message" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenAI error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "ai_unavailable", detail: errText.slice(0, 200) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = { sentiment: "neutral", headline: "", signals: [] };
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (_) {
        // fall through to defaults
      }
    }

    return new Response(JSON.stringify({
      sentiment: parsed.sentiment || "neutral",
      headline: String(parsed.headline || "").trim(),
      signals: Array.isArray(parsed.signals) ? parsed.signals.slice(0, 3) : [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("analyze-email-message error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
