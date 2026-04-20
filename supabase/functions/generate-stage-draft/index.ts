// Generates an AI email draft when a lead enters a key pipeline stage.
// Writes to lead_drafts so the Actions tab surfaces it with Send / Edit / Discard.
// Trigger: explicit POST from LeadContext after a stage change.
//
// Body: { lead_id: string, new_stage: string, old_stage?: string }
//
// Stage → draft mapping:
//   "Sample Sent"      → cover note for the sample (references target criteria + mandate fields)
//   "Proposal Sent"    → proposal cover email pulling deal value + scope
//   "Closed Won"       → kickoff email copying Valeria
//   "Negotiating"      → soft follow-up clarifying pricing/terms
//
// Uses Lovable AI gateway (google/gemini-3-flash-preview) — no external key needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const P1_RULES = `
RULES:
- No em dashes, en dashes, or double hyphens. Use commas, periods, or line breaks.
- Maximum 80 words. Shorter is better.
- NEVER say "hope you're well", "checking in", "following up", "circling back", "touching base".
- NEVER say "per our conversation", "as discussed", "quick question".
- NEVER parrot back what the prospect told you.
- Every noun specific: dollar amounts, company names, geographies, EBITDA ranges.
- Sign off: first name only on its own line. No "Best", no "Regards".
- Return subject on first line, blank line, then body. No markdown.
`;

const STAGE_PROMPTS: Record<string, (ctx: string) => string> = {
  "Sample Sent": (ctx) => `You are drafting a SAMPLE COVER NOTE. The sample (target list, candidate profiles, market map) is being sent now. This is a delivery email.

FORMAT:
Subject: [What's attached] — [quantity]

[One sentence: here is what was promised, delivered. Reference specifics from their mandate.]

[2-3 bullet points with specific details from target_criteria / target_revenue / geography / buyer_type.]

[One sentence: what you need from them after they review. Specific ask with a date.]

[first name]

${P1_RULES}

CONTEXT:
${ctx}`,

  "Proposal Sent": (ctx) => `You are drafting a PROPOSAL COVER EMAIL. The proposal/SOW is being delivered. Lead with the deliverable, not pleasantries.

FORMAT:
Subject: [Proposal reference] — [deal value or scope marker]

[One sentence: here is the proposal, referencing the specific deal value and service scope.]

[2 sentences: highlight one concrete thing they'll get that others don't — a specific angle tied to their criteria.]

[One sentence: specific decision needed and a date, e.g. "Need your top 3 criteria by Friday to start origination Monday."]

[first name]

${P1_RULES}

CONTEXT:
${ctx}`,

  "Negotiating": (ctx) => `You are drafting a NEGOTIATION FOLLOW-UP. The proposal is out; now you're handling questions or terms.

FORMAT:
Subject: [4-6 words referencing a specific term or decision]

[One sentence: a concrete data point, comp, or fact that strengthens the terms you proposed.]

[One sentence: the specific next step with a date.]

[first name]

${P1_RULES}

CONTEXT:
${ctx}`,

  "Closed Won": (ctx) => `You are drafting a KICKOFF EMAIL for a new client. Valeria is CC'd — she runs CS/onboarding. This sets the tone: confident, specific, action-ready.

FORMAT:
Subject: Welcome — kickoff next steps

Cc: Valeria Rivera <valeria@captarget.com>

[One sentence confirming the engagement is live, referencing deal value or scope.]

[2 bullet points: first deliverable with a date, first meeting with a proposed time.]

[One sentence: who they'll hear from next and when.]

[first name]

${P1_RULES}

CONTEXT:
${ctx}`,
};

// "Proposal Sent > 7d silent" (stall) — different prompt.
const STALL_PROMPT = (ctx: string) => `You are drafting a SOFT NUDGE for a proposal that has been silent 7+ days. NOT "checking in." You are adding NEW value.

FORMAT:
Subject: [4-6 words referencing a market trigger or new data point]

[One sentence sharing something new: a comp that closed, a market shift, a new target identified.]

[One sentence connecting it to their specific proposal with a concrete ask and date.]

[first name]

${P1_RULES}

CONTEXT:
${ctx}`;

// Inbound reply trigger — they responded, draft a contextual reply.
const REPLY_PROMPT = (ctx: string) => `You are drafting a REPLY to an inbound message from the prospect. They wrote back, you respond. Acknowledge what they said specifically, then move the deal forward with a concrete next step.

FORMAT:
Subject: Re: [original subject — keep it]

[One sentence acknowledging the specific thing they raised. Quote a phrase or reference a fact from their email — do not summarize generically.]

[One sentence proposing the next step with a specific date or time, e.g. "Friday at 2pm ET works for a 20-min walkthrough."]

[first name]

${P1_RULES}

CONTEXT:
${ctx}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { lead_id, new_stage, trigger, inbound_email_id } = body as {
      lead_id: string;
      new_stage: string;
      trigger?: "stage_change" | "stall" | "reply";
      inbound_email_id?: string;
    };

    if (!lead_id || !new_stage) {
      return new Response(JSON.stringify({ ok: false, error: "lead_id and new_stage required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick prompt
    const isStall = trigger === "stall";
    const isReply = trigger === "reply";
    const promptBuilder = isReply
      ? REPLY_PROMPT
      : isStall
        ? STALL_PROMPT
        : STAGE_PROMPTS[new_stage];
    if (!promptBuilder) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: `no draft template for stage ${new_stage}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, name, company, email, brand, role, stage, deal_value, service_interest, target_criteria, target_revenue, geography, buyer_type, acquisition_strategy, stall_reason, assigned_to, deal_narrative")
      .eq("id", lead_id)
      .single();
    if (leadErr || !lead) throw new Error(`Lead ${lead_id} not found`);

    // For reply trigger, fetch the inbound email so the prompt can reference it.
    let inboundContext = "";
    if (isReply) {
      const inboundQuery = (supabase as any)
        .from("lead_emails")
        .select("subject, body_preview, body_text, from_name, from_address, email_date")
        .eq("lead_id", lead_id)
        .eq("direction", "inbound")
        .order("email_date", { ascending: false })
        .limit(1);
      if (inbound_email_id) inboundQuery.eq("id", inbound_email_id);
      const { data: inboundRows } = await inboundQuery;
      const inbound = inboundRows?.[0];
      if (inbound) {
        const snippet = (inbound.body_text || inbound.body_preview || "").slice(0, 800).replace(/\s+/g, " ").trim();
        inboundContext = `Their reply (subject: "${inbound.subject || "(no subject)"}", from ${inbound.from_name || inbound.from_address}):\n${snippet}`;
      }
    }

    const ctx = [
      `Prospect: ${lead.name} (${lead.role || "role unknown"}) at ${lead.company}`,
      `Brand: ${lead.brand}`,
      `Deal value: $${lead.deal_value || 0}`,
      `Service: ${lead.service_interest || "TBD"}`,
      lead.target_criteria && `Target criteria: ${lead.target_criteria}`,
      lead.target_revenue && `Target revenue: ${lead.target_revenue}`,
      lead.geography && `Geography: ${lead.geography}`,
      lead.buyer_type && `Buyer type: ${lead.buyer_type}`,
      lead.acquisition_strategy && `Strategy: ${lead.acquisition_strategy}`,
      isStall && lead.stall_reason && `Stall reason: ${lead.stall_reason}`,
      lead.deal_narrative && `Deal narrative: ${lead.deal_narrative}`,
      `Our rep: ${lead.assigned_to || "Malik"}`,
      inboundContext,
    ].filter(Boolean).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: promptBuilder(ctx) },
          { role: "user", content: `Draft the email now for stage: ${new_stage}${isStall ? " (stalled 7+ days)" : ""}${isReply ? " (reply to their inbound message)" : ""}` },
        ],
        stream: false,
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway error: ${aiRes.status} ${txt.slice(0, 200)}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content?.trim() || "";
    if (!content) throw new Error("AI returned empty content");

    const actionKey = isReply
      ? `reply-${inbound_email_id || crypto.randomUUID()}`
      : isStall
        ? `stage-stall-${new_stage}`
        : `stage-entry-${new_stage}`;
    const contextLabel = isReply
      ? `Reply draft — they responded`
      : isStall
        ? `Stalled at ${new_stage} — soft nudge draft`
        : `Entered ${new_stage} — cover draft`;

    await (supabase as any).from("lead_drafts").upsert({
      lead_id,
      action_key: actionKey,
      draft_type: "email",
      context_label: contextLabel,
      content,
      status: "draft",
      updated_at: new Date().toISOString(),
    }, { onConflict: "lead_id,action_key" });

    return new Response(JSON.stringify({ ok: true, action_key: actionKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-stage-draft error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
