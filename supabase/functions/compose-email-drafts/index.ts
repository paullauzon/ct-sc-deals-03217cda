// Phase 4 — generate 3 distinct AI email drafts (direct / data-led / question-led)
// in a single tool call. Returns drafts plus the variable map used and a list of
// missing variables so the UI can render red chips and block send.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Approach = "direct" | "data_led" | "question_led";

interface ComposeRequest {
  lead: {
    id: string;
    name?: string;
    company?: string;
    email?: string;
    role?: string;
    brand?: string;
    stage?: string;
    serviceInterest?: string;
    targetCriteria?: string;
    geography?: string;
    targetRevenue?: string;
    ebitdaMin?: string;
    ebitdaMax?: string;
    dealValue?: number;
    daysInCurrentStage?: number;
    stallReason?: string;
    nextMutualStep?: string;
    forecastedCloseDate?: string;
    competingBankers?: string;
    decisionBlocker?: string;
    firefliesSummary?: string;
    firefliesNextSteps?: string;
    dealNarrative?: string;
  };
  context?: {
    purpose?: string; // "follow_up" | "stall_response" | "outreach" | "objection" | "free_form"
    threadSummary?: string;       // Last AI thread summary if replying
    lastInboundExcerpt?: string;  // Most-recent prospect message excerpt
    sequenceStep?: string;        // e.g. "N+3", "Proposal follow-up"
    senderName?: string;          // e.g. "Malik"
    senderTitle?: string;         // optional
    customInstruction?: string;   // free-form user direction
  };
  recommendedApproach?: Approach; // bias which card is "Recommended"
}

interface DraftCard {
  approach: Approach;
  label: string;
  rationale: string;
  subject: string;
  body: string;
  proof_points_used: string[];
}

function pickStringList(...candidates: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (c && c.trim()) out.push(c.trim());
  }
  return out;
}

function buildVariables(lead: ComposeRequest["lead"], senderName?: string) {
  const first = (lead.name || "").trim().split(/\s+/)[0] || "";
  const ebitda = lead.ebitdaMin || lead.ebitdaMax
    ? `${lead.ebitdaMin || "?"}–${lead.ebitdaMax || "?"}`
    : "";
  return {
    first_name: first,
    name: lead.name || "",
    firm: lead.company || "",
    company: lead.company || "",
    role: lead.role || "",
    stage: lead.stage || "",
    service: lead.serviceInterest || "",
    geography: lead.geography || "",
    target_revenue: lead.targetRevenue || "",
    ebitda,
    deal_value: lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "",
    next_step: lead.nextMutualStep || "",
    sender_name: senderName || "",
  } as Record<string, string>;
}

function detectMissingVariables(text: string, vars: Record<string, string>): string[] {
  const missing = new Set<string>();
  const re = /\[([a-z_]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    if (!vars[key] || !vars[key].trim()) missing.add(key);
  }
  return Array.from(missing);
}

function defaultRecommendedApproach(lead: ComposeRequest["lead"], purpose?: string): Approach {
  // Heuristic-only first cut (Phase 6 will replace this with learned per-firm/stage stats):
  // - Stall/no response → question_led (gets a reply)
  // - Sample/Proposal stage → data_led (proves value)
  // - Otherwise → direct
  if ((purpose === "stall_response") || (lead.daysInCurrentStage && lead.daysInCurrentStage >= 10)) {
    return "question_led";
  }
  if (lead.stage === "Proposal Sent" || lead.stage === "Sample Sent" || lead.stage === "Negotiating") {
    return "data_led";
  }
  return "direct";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ComposeRequest;
  try {
    body = await req.json() as ComposeRequest;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.lead?.id) {
    return new Response(JSON.stringify({ error: "lead.id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const lead = body.lead;
  const ctx = body.context || {};
  const senderName = ctx.senderName || "";
  const variables = buildVariables(lead, senderName);
  const recommended = body.recommendedApproach || defaultRecommendedApproach(lead, ctx.purpose);

  // Build the context block. Keep it dense — small but information-rich.
  const proofBank = pickStringList(
    lead.firefliesSummary && `Last call summary: ${lead.firefliesSummary}`,
    lead.firefliesNextSteps && `Agreed next steps: ${lead.firefliesNextSteps}`,
    lead.dealNarrative && `Deal narrative: ${lead.dealNarrative}`,
    lead.targetCriteria && `Target criteria: ${lead.targetCriteria}`,
    lead.competingBankers && `Competing bankers: ${lead.competingBankers}`,
    lead.decisionBlocker && `Decision blocker: ${lead.decisionBlocker}`,
    lead.stallReason && `Stall reason: ${lead.stallReason}`,
  );

  const sys = `You are an elite B2B sales writer for ${lead.brand || "Captarget"}, an M&A target sourcing firm.
Write for ${variables.first_name || "the prospect"} at ${variables.firm || "their firm"} (role: ${variables.role || "?"}).

HARD RULES (enforced):
- Maximum 80 words per email body. Subject line max 8 words.
- No filler ("hope you're well", "just checking in", "circling back").
- No em-dashes or en-dashes. Use commas or periods.
- No emojis. Peer-to-peer professional tone, not salesy.
- Reference one concrete signal from the context (deal stage, last meeting, criteria) — not a generic platitude.
- If a fact is unknown, use a square-bracket variable like [first_name] or [ebitda]. Never invent numbers.
- Each draft must use a DIFFERENT angle. Do not repeat the same opening across drafts.

Approaches you must produce (one of each):
1) "direct" — Get to the point in line 1. Single ask. Short and confident.
2) "data_led" — Open with a concrete data point or proof from context. Then ask.
3) "question_led" — Open with a sharp open-ended question. Re-engages stalled threads.`;

  const userPrompt = `Deal context:
- Stage: ${lead.stage || "(unknown)"}${lead.daysInCurrentStage ? ` (${lead.daysInCurrentStage} days in stage)` : ""}
- Service interest: ${lead.serviceInterest || "(unknown)"}
- Geography / size: ${lead.geography || "?"} / ${variables.target_revenue || "?"} revenue / EBITDA ${variables.ebitda || "?"}
- Deal value (our retainer): ${variables.deal_value || "(unset)"}
${lead.nextMutualStep ? `- Open mutual next step: ${lead.nextMutualStep}` : ""}
${ctx.purpose ? `- Email purpose: ${ctx.purpose}` : ""}
${ctx.sequenceStep ? `- Sequence step: ${ctx.sequenceStep}` : ""}
${ctx.threadSummary ? `\nThread so far: ${ctx.threadSummary}` : ""}
${ctx.lastInboundExcerpt ? `\nProspect's last message: """${ctx.lastInboundExcerpt}"""` : ""}
${ctx.customInstruction ? `\nUser instruction (highest priority): ${ctx.customInstruction}` : ""}

Available proof points to draw from:
${proofBank.length ? proofBank.map((p, i) => `${i + 1}. ${p}`).join("\n") : "(none — keep drafts question-led)"}

Variables you may use as [bracket] tokens:
${Object.entries(variables).map(([k, v]) => `[${k}]${v ? ` = ${v}` : " (UNKNOWN — will be flagged)"}`).join("\n")}

Sign off as "${senderName || "[sender_name]"}".

Mark the "${recommended}" approach as the recommended one in your rationale field.`;

  const tools = [{
    type: "function",
    function: {
      name: "submit_drafts",
      description: "Return exactly three email drafts using three distinct approaches.",
      parameters: {
        type: "object",
        properties: {
          drafts: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                approach: { type: "string", enum: ["direct", "data_led", "question_led"] },
                label: { type: "string", description: "Short human label (e.g. 'Direct ask', 'Proof-led', 'Open question')" },
                rationale: { type: "string", description: "One sentence: why this approach fits this deal right now." },
                subject: { type: "string" },
                body: { type: "string", description: "Email body. Max 80 words. No em-dashes." },
                proof_points_used: {
                  type: "array",
                  items: { type: "string" },
                  description: "Which proof bank items (verbatim or paraphrased) appear in the body. Empty array if none.",
                },
              },
              required: ["approach", "label", "rationale", "subject", "body", "proof_points_used"],
              additionalProperties: false,
            },
          },
        },
        required: ["drafts"],
        additionalProperties: false,
      },
    },
  }];

  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "submit_drafts" } },
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `gateway fetch failed: ${e instanceof Error ? e.message : e}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (aiResponse.status === 429) {
    return new Response(JSON.stringify({ error: "Rate limit hit — try again in a moment." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (aiResponse.status === 402) {
    return new Response(JSON.stringify({ error: "AI credits exhausted. Top up in Workspace settings." }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!aiResponse.ok) {
    const t = await aiResponse.text();
    console.error("AI gateway error", aiResponse.status, t);
    return new Response(JSON.stringify({ error: "AI gateway error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aiJson = await aiResponse.json();
  const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("No tool call in AI response", JSON.stringify(aiJson).slice(0, 500));
    return new Response(JSON.stringify({ error: "AI did not return drafts" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let parsed: { drafts: DraftCard[] };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to parse AI drafts" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Compute missing variables across all drafts (union — used for the chip warning bar)
  const allText = parsed.drafts.map(d => `${d.subject}\n${d.body}`).join("\n");
  const missingVariables = detectMissingVariables(allText, variables);

  // Sort so the recommended one is first
  parsed.drafts.sort((a, b) => (a.approach === recommended ? -1 : b.approach === recommended ? 1 : 0));

  return new Response(JSON.stringify({
    drafts: parsed.drafts,
    variables,
    missingVariables,
    recommendedApproach: recommended,
    model: "google/gemini-3-flash-preview",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
