// Phase 4 — generate 3 distinct AI email drafts (direct / data-led / question-led)
// in a single tool call. Returns drafts plus the variable map used and a list of
// missing variables so the UI can render red chips and block send.
//
// Phase 6 update — before answering, query email_compose_events / outcomes
// (last 60 days, same brand × stage × purpose) and bias the "recommended"
// approach toward the one with the best (pickRate × replyRate) score.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  // Heuristic fallback when no learned signal is available yet.
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

/**
 * Phase 6 — read learned patterns for this brand × stage × purpose and pick
 * the approach with the strongest combined pickRate × replyRate signal.
 * Returns null when there isn't enough data (require ≥ 5 picks for a single
 * approach before overriding the heuristic).
 */
async function learnedRecommendedApproach(
  brand: string, stage: string, purpose: string,
): Promise<{ approach: Approach; basis: string } | null> {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const since = new Date();
    since.setDate(since.getDate() - 60);

    let q = sb.from("email_compose_events")
      .select("draft_picked, email_id, brand, stage, purpose")
      .eq("sent", true)
      .eq("do_not_train", false)
      .gte("created_at", since.toISOString())
      .limit(500);
    if (brand) q = q.eq("brand", brand);
    if (purpose) q = q.eq("purpose", purpose);
    if (stage) q = q.eq("stage", stage);
    const { data: events } = await q;
    const rows: any[] = events || [];
    if (rows.length < 8) return null;

    // Pull outcomes for these emails
    const ids = rows.map(r => r.email_id).filter(Boolean);
    let replied: Record<string, boolean> = {};
    if (ids.length > 0) {
      const { data: outRows } = await sb.from("email_compose_outcomes")
        .select("email_id, replied").in("email_id", ids);
      for (const o of outRows || []) replied[(o as any).email_id] = (o as any).replied;
    }

    type Stat = { picks: number; replies: number; outcomeCount: number };
    const stats: Record<Approach, Stat> = {
      direct: { picks: 0, replies: 0, outcomeCount: 0 },
      data_led: { picks: 0, replies: 0, outcomeCount: 0 },
      question_led: { picks: 0, replies: 0, outcomeCount: 0 },
    };
    for (const r of rows) {
      const ap = r.draft_picked as Approach;
      if (!stats[ap]) continue;
      stats[ap].picks += 1;
      if (r.email_id && r.email_id in replied) {
        stats[ap].outcomeCount += 1;
        if (replied[r.email_id]) stats[ap].replies += 1;
      }
    }

    let best: Approach | null = null;
    let bestScore = -1;
    let bestBasis = "";
    for (const [ap, s] of Object.entries(stats) as [Approach, Stat][]) {
      if (s.picks < 5) continue;
      const replyRate = s.outcomeCount > 0 ? s.replies / s.outcomeCount : 0;
      const pickRate = s.picks / Math.max(rows.length, 1);
      // Weighted: reply outcome dominates, pick rate breaks ties
      const score = replyRate * 100 + pickRate * 20;
      if (score > bestScore) {
        bestScore = score;
        best = ap;
        bestBasis = `${s.picks} picks · ${Math.round(replyRate * 100)}% reply rate`;
      }
    }
    if (!best) return null;
    return { approach: best, basis: bestBasis };
  } catch (e) {
    console.warn("learnedRecommendedApproach failed", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), {
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
  // Phase 6 — try the learned recommendation first, fall back to heuristic.
  let recommended: Approach = body.recommendedApproach || defaultRecommendedApproach(lead, ctx.purpose);
  let recommendationBasis = "heuristic";
  if (!body.recommendedApproach) {
    const learned = await learnedRecommendedApproach(
      lead.brand || "Captarget",
      lead.stage || "",
      ctx.purpose || "free_form",
    );
    if (learned) {
      recommended = learned.approach;
      recommendationBasis = `learned: ${learned.basis}`;
    }
  }

  // Phase 9 — first-email research injection.
  // When this lead has zero prior outbound, fetch (or reuse cached) one specific
  // firm-website fact and require the AI to anchor line 1/2 to it.
  let firstEmailFact = "";
  let firstEmailFactSource = "";
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { count: outboundCount } = await sb
      .from("lead_emails")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .eq("direction", "outbound");
    const isFirstEmail = (outboundCount ?? 0) === 0;
    if (isFirstEmail) {
      const { data: leadRow } = await sb
        .from("leads")
        .select("first_email_fact, first_email_fact_source")
        .eq("id", lead.id)
        .maybeSingle();
      const cachedFact = (leadRow as any)?.first_email_fact as string | undefined;
      const cachedSrc = (leadRow as any)?.first_email_fact_source as string | undefined;
      if (cachedFact && cachedFact.trim()) {
        firstEmailFact = cachedFact.trim();
        firstEmailFactSource = cachedSrc?.trim() || "";
      } else {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/research-first-email-fact`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leadId: lead.id }),
        });
        if (r.ok) {
          const j = await r.json() as { fact?: string; source_url?: string };
          if (j.fact && j.fact.trim()) {
            firstEmailFact = j.fact.trim();
            firstEmailFactSource = (j.source_url || "").trim();
          }
        }
      }
    }
  } catch (e) {
    console.warn("first-email-fact lookup failed", (e as Error).message);
  }

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
    aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "submit_drafts" } },
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `OpenAI fetch failed: ${e instanceof Error ? e.message : e}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (aiResponse.status === 429) {
    return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!aiResponse.ok) {
    const t = await aiResponse.text();
    console.error("OpenAI error", aiResponse.status, t);
    return new Response(JSON.stringify({ error: "AI provider error" }), {
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
    recommendationBasis,
    model: "gpt-5",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
