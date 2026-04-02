import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ActionType = "post-meeting" | "initial-outreach" | "meeting-nudge" | "proposal-followup" | "re-engagement" | "reply-inbound" | "schedule-call" | "prep-brief";

function getSystemPrompt(actionType: ActionType): string {
  const base = `You are a senior sales strategist at an M&A deal origination firm. Services include off-market email origination, direct calling, and broker/banker coverage. You draft highly personalized, psychologically-informed communications.

Rules:
- Professional but warm — never robotic
- Use the prospect's first name
- Keep emails under 200 words
- No markdown formatting
- Return ONLY: subject line on first line, blank line, then body
- Sign off naturally`;

  switch (actionType) {
    case "post-meeting":
      return `${base}

You are drafting a follow-up email AFTER a sales meeting. Reference 1-2 specific discussion points. Summarize agreed next steps with clear owners. Include a soft CTA that advances the deal.`;

    case "initial-outreach":
      return `${base}

You are drafting an initial outreach email to a NEW prospect who has submitted a form or been identified as a lead but has NOT been contacted yet. Research their company and role. Lead with a specific insight about their acquisition strategy or market position. Make the CTA a meeting request — suggest a specific time frame ("this week" or "early next week").`;

    case "meeting-nudge":
      return `${base}

You are drafting a meeting-booking nudge to a prospect who has been contacted but hasn't scheduled a meeting yet. Reference their initial interest or form submission. Create urgency without pressure — mention a relevant market trend or time-sensitive opportunity. CTA: direct Calendly link or "pick a time this week."`;

    case "proposal-followup":
      return `${base}

You are drafting a check-in email to a prospect who received a proposal but hasn't responded. Don't ask "did you get my proposal?" Instead, add NEW value — a relevant case study, market data point, or competitive insight. Reaffirm the key value proposition that resonated. CTA: suggest a quick 15-min call to walk through any questions.`;

    case "re-engagement":
      return `${base}

You are drafting a re-engagement email to a prospect who has gone SILENT for 21+ days. Do NOT guilt-trip about silence. Instead, lead with something new — a market update, a relevant deal closed, or a shifted landscape. Keep it short (under 100 words). End with a low-friction CTA: "Worth a quick conversation?" or "Still on your radar?"`;

    case "reply-inbound":
      return `${base}

You are drafting a reply to an inbound email from a prospect. Be responsive and helpful. Address their specific question or point directly. Add value beyond just answering — provide context, insight, or a relevant resource. Keep momentum: end with a clear next step.`;

    case "schedule-call":
      return `${base}

You are suggesting talking points and an agenda for a follow-up call. List 3-5 key discussion points based on the deal context. For each point, include a brief note on the goal (discover, confirm, advance). End with a suggested call duration and any prep needed.

Format: Return as plain text with numbered points, NOT as an email.`;

    case "prep-brief":
      return `${base}

You are creating a pre-meeting intelligence brief. Summarize: who they are, what they want, their psychological drivers, potential objections, and your #1 closing strategy. Include 3 "power questions" to ask during the meeting.

Format: Return as a structured brief with clear sections, NOT as an email.`;

    default:
      return base;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { actionType, lead, lastEmail, meetingContext } = await req.json();

    if (!actionType || !lead) {
      return new Response(JSON.stringify({ error: "actionType and lead are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build rich context
    const contextParts: string[] = [];

    // Lead basics
    contextParts.push(`Prospect: ${lead.name || "Unknown"} — ${lead.role || ""} at ${lead.company || ""}`);
    contextParts.push(`Brand: ${lead.brand === "SourceCo" ? "SourceCo" : "Captarget"}`);
    contextParts.push(`Stage: ${lead.stage}`);
    if (lead.dealValue) contextParts.push(`Deal Value: $${lead.dealValue.toLocaleString()}`);
    if (lead.serviceInterest && lead.serviceInterest !== "TBD") contextParts.push(`Service Interest: ${lead.serviceInterest}`);

    // Enrichment data
    if (lead.enrichment) {
      const e = lead.enrichment;
      if (e.companyDescription) contextParts.push(`\nCompany Profile: ${e.companyDescription}`);
      if (e.buyerMotivation) contextParts.push(`Motivation: ${e.buyerMotivation}`);
      if (e.urgency) contextParts.push(`Urgency: ${e.urgency}`);
      if (e.acquisitionCriteria) contextParts.push(`Acquisition Criteria: ${e.acquisitionCriteria}`);
      if (e.keyInsights) contextParts.push(`Key Insights: ${e.keyInsights}`);
    }

    // Meeting intelligence
    if (meetingContext) {
      contextParts.push(`\nMEETING CONTEXT:`);
      if (meetingContext.title) contextParts.push(`Meeting: ${meetingContext.title} (${meetingContext.date})`);
      if (meetingContext.summary) contextParts.push(`Summary: ${meetingContext.summary}`);
      if (meetingContext.nextSteps) contextParts.push(`Next Steps: ${meetingContext.nextSteps}`);
      if (meetingContext.intelligence) {
        const intel = meetingContext.intelligence;
        if (intel.keyTopics?.length) contextParts.push(`Topics: ${intel.keyTopics.join(", ")}`);
        if (intel.valueProposition) contextParts.push(`What Resonated: ${intel.valueProposition}`);
        if (intel.nextSteps?.length) {
          contextParts.push(`Action Items:\n${intel.nextSteps.map((ns: any) => `- ${ns.action} (${ns.owner})`).join("\n")}`);
        }
      }
    }

    // Deal intelligence
    if (lead.dealIntelligence) {
      const di = lead.dealIntelligence;
      if (di.dealNarrative) contextParts.push(`\nDeal Narrative: ${di.dealNarrative}`);
      if (di.winStrategy?.powerMove) contextParts.push(`Power Move: ${di.winStrategy.powerMove}`);
      if (di.winStrategy?.numberOneCloser) contextParts.push(`#1 Closer: ${di.winStrategy.numberOneCloser}`);
      if (di.psychologicalProfile?.realWhy) contextParts.push(`Real Motivation: ${di.psychologicalProfile.realWhy}`);
      if (di.psychologicalProfile?.communicationStyle) contextParts.push(`Communication Style: ${di.psychologicalProfile.communicationStyle}`);
      if (di.actionItemTracker?.length) {
        const open = di.actionItemTracker.filter((a: any) => a.status === "Open" || a.status === "Overdue");
        if (open.length) contextParts.push(`Open Action Items:\n${open.map((a: any) => `- ${a.item} (${a.status})`).join("\n")}`);
      }
    }

    // Last email for reply context
    if (lastEmail && actionType === "reply-inbound") {
      contextParts.push(`\nINBOUND EMAIL TO REPLY TO:`);
      contextParts.push(`From: ${lastEmail.fromName || lastEmail.fromAddress}`);
      contextParts.push(`Subject: ${lastEmail.subject}`);
      if (lastEmail.bodyPreview) contextParts.push(`Content: ${lastEmail.bodyPreview}`);
    }

    const systemPrompt = getSystemPrompt(actionType as ActionType);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextParts.join("\n") },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      return new Response(JSON.stringify({ error: "AI processing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Suggest next follow-up date based on action type
    const now = new Date();
    let suggestedFollowUpDays = 3;
    switch (actionType) {
      case "initial-outreach": suggestedFollowUpDays = 3; break;
      case "meeting-nudge": suggestedFollowUpDays = 2; break;
      case "post-meeting": suggestedFollowUpDays = 2; break;
      case "proposal-followup": suggestedFollowUpDays = 5; break;
      case "re-engagement": suggestedFollowUpDays = 7; break;
      case "reply-inbound": suggestedFollowUpDays = 1; break;
    }
    const suggestedDate = new Date(now.getTime() + suggestedFollowUpDays * 86400000);
    const suggestedFollowUp = suggestedDate.toISOString().split("T")[0];

    return new Response(JSON.stringify({
      content,
      actionType,
      suggestedFollowUp,
      suggestedFollowUpDays,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-follow-up-action error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
