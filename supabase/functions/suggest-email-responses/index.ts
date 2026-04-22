const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestBody {
  emailSubject?: string;
  emailBody?: string;
  fromName?: string;
  detectedObjections?: { label: string; matchedPhrase: string }[];
  leadContext?: {
    name?: string;
    company?: string;
    role?: string;
    brand?: string;
    stage?: string;
    serviceInterest?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const objections = (body.detectedObjections || []).map(o => o.label).join(", ") || "general hesitation";
    const ctx = body.leadContext || {};

    const systemPrompt = `You are a senior M&A buy-side advisor at ${ctx.brand || "Captarget/SourceCo"} responding to a prospect email.

Tone: peer-to-peer, professional, confident. Never sycophantic. No filler ("hope you're well"). No em/en dashes. Max 80 words per response.

Context:
- Recipient: ${ctx.name || "the prospect"}${ctx.role ? `, ${ctx.role}` : ""}${ctx.company ? ` at ${ctx.company}` : ""}
- Deal stage: ${ctx.stage || "unknown"}
- Service interest: ${ctx.serviceInterest || "unknown"}
- Detected objection(s): ${objections}

Generate exactly 3 distinct response strategies that directly address the objection. Each must:
- Acknowledge their concern in one sentence (no parroting)
- Offer a specific reframe, proof point, or next step
- End with a clear, low-friction ask

Do NOT mention competitors by name. Do NOT promise specific deal counts. Stay grounded in our service: off-market origination, banker coverage, retained search.`;

    const userPrompt = `Inbound email from ${body.fromName || "prospect"}:

Subject: ${body.emailSubject || "(no subject)"}

${body.emailBody || ""}

Generate 3 response options.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_responses",
              description: "Return 3 distinct response options for the inbound email.",
              parameters: {
                type: "object",
                properties: {
                  responses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        approach: { type: "string", description: "Short label for the strategy, e.g. 'Reframe value', 'Offer proof', 'Suggest lighter step'." },
                        body: { type: "string", description: "The response email body. Max 80 words. No em/en dashes. No filler greeting." },
                        subject: { type: "string", description: "Suggested reply subject line." },
                      },
                      required: ["approach", "body", "subject"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["responses"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_responses" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI provider error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { responses: [] };

    return new Response(JSON.stringify({ responses: parsed.responses || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-email-responses error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
