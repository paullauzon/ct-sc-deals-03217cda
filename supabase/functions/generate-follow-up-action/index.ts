import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BANNED_PHRASES = `
BANNED PHRASES (never use any of these — if you catch yourself writing one, delete it and rewrite):
"I hope this finds you well", "I wanted to reach out", "I'd love to", "Just checking in",
"Following up", "Circling back", "Touching base", "Per our conversation", "As discussed",
"At your earliest convenience", "Please don't hesitate", "I look forward to hearing from you",
"Let me know if you have any questions", "Happy to discuss further", "Quick question",
"I noticed that", "It was great to", "Thank you for your time", "I hope you're doing well",
"I hope you had a great weekend", "Just wanted to", "Reach out", "Touch base",
"Best regards", "Kind regards", "Warm regards", "Looking forward to hearing from you"`;

type ActionType = "post-meeting" | "initial-outreach" | "meeting-nudge" | "proposal-followup" | "re-engagement" | "reply-inbound" | "schedule-call" | "prep-brief";

function getSystemPrompt(actionType: ActionType): string {
  const base = `You are a senior dealmaker at an M&A deal origination firm. You write like a Wall Street veteran — direct, specific, zero fluff. Your audience is PE managing partners, family office principals, and C-suite acquirers who get 50+ cold emails daily.

RULES:
- Maximum 100 words for emails. 60-80 is ideal. Every word must earn its place.
- First sentence must contain a SPECIFIC reference — a name, number, date, company, or event. Never open with a greeting or pleasantry.
- ONE call-to-action per email. Not two. Not three. One.
- Subject line: max 6 words. Must be specific to THIS prospect. Never generic. Never start with "Re:" unless it IS a reply.
- Sign off with first name only. No titles, no "Best", no "Regards".
- Write as a peer sharing intelligence, not a vendor pitching. You are an equal.
- If brand is SourceCo: tone is direct, research-heavy, executive search vernacular.
- If brand is Captarget: tone is market-intelligence-forward, deal-flow focused.
- Match seniority: Managing Partners/CEOs get 3-4 sentences max. VPs/Directors can get slightly more context.
- Use the enrichment data and deal intelligence to make EVERY claim specific. Don't say "your industry" — name the industry. Don't say "companies like yours" — name the company.
- No markdown formatting.
- Return ONLY: subject line on first line, blank line, then body.

${BANNED_PHRASES}

BAD vs GOOD examples:

BAD: "Hi John, I hope this email finds you well. I wanted to follow up on our recent conversation about your acquisition strategy. I'd love to schedule a call to discuss how our services might align with your goals. Please let me know what works for your schedule. Best regards, The Team"

GOOD: "John — your 3rd bolt-on this year puts you ahead of most platforms in building density. We have 2 off-market targets in your core geography, both $8-12M EBITDA. Worth a 15-min look Thursday? — Mike"

BAD: "Hi Sarah, I noticed your company has been growing recently. I wanted to reach out because I think our services could be a great fit. Would you be open to a quick call this week?"

GOOD: "Sarah — 14 HVAC distributors traded hands in the Southeast this quarter, 9 off-market. Your criteria matches 3 we're tracking. 15 minutes to compare notes? — Mike"`;

  switch (actionType) {
    case "post-meeting":
      return `${base}

TASK: Draft a post-meeting follow-up email.
- Reference ONE specific thing they said or decided in the meeting — use their exact words if available.
- Confirm the ONE agreed next step with owner and timeline.
- No recap of the meeting agenda. No "it was great meeting you."
- If there's an open action item on YOUR side, state what you'll deliver and when.
- End. No filler closing.`;

    case "initial-outreach":
      return `${base}

TASK: Draft an initial outreach email to a prospect who has NOT been contacted yet.
- First sentence: lead with a SPECIFIC insight from their enrichment data — a deal they did, a market shift in their sector, a portfolio gap. Not "I noticed your company is growing."
- Second sentence: one line of value — what you bring that's specific to their situation.
- Third sentence: ONE CTA — suggest a specific time frame.
- That's it. Three sentences. Maybe four if the insight needs a sentence of context.`;

    case "meeting-nudge":
      return `${base}

TASK: Draft a meeting-booking nudge for a prospect who expressed interest but hasn't scheduled.
- Lead with SPECIFIC value they'll get from the meeting — name targets, geographies, EBITDA ranges, or market data you have.
- Not "I'd love to discuss how we can help" — instead "I have 3 off-market targets in [their geography] matching [their criteria]."
- One sentence of value, one CTA. Done.`;

    case "proposal-followup":
      return `${base}

TASK: Draft a follow-up to a prospect who received a proposal but hasn't responded.
- Do NOT ask "did you get my proposal?" or "checking in on the proposal."
- Lead with ONE new data point they don't have — a relevant deal that closed, a market shift, a competitive move.
- Connect it back to why the proposal matters NOW.
- One CTA: suggest a 15-min call to walk through specifics.`;

    case "re-engagement":
      return `${base}

TASK: Draft a re-engagement email for a prospect who's been silent 21+ days.
- Maximum 50 words. This is the shortest email type.
- Lead with ONE new market fact — a deal, a trend, a data point.
- No guilt about silence. No "haven't heard from you."
- End with "Still relevant?" or "Worth revisiting?" or similar low-friction CTA.`;

    case "reply-inbound":
      return `${base}

TASK: Draft a reply to an inbound email from a prospect.
- Mirror their tone and approximate length.
- Answer their specific question or point in the FIRST line.
- Add one piece of value beyond just answering — context, insight, or relevant data.
- End with ONE clear next step.`;

    case "schedule-call":
      return `${base}

TASK: Suggest talking points and an agenda for a follow-up call.
- List 3-5 key discussion points based on deal context and enrichment data.
- For each point, include a brief note on the goal (discover, confirm, advance).
- End with suggested call duration and any prep needed.
- Format: Return as plain text with numbered points, NOT as an email.`;

    case "prep-brief":
      return `${base}

TASK: Create a pre-meeting intelligence brief.
- Who they are (role, firm, deal history) in 2 sentences max.
- What they want (acquisition criteria, strategic intent) in 2 sentences.
- Their psychological drivers and communication style in 1-2 sentences.
- Top 2 objections they'll raise and how to handle each.
- Your #1 closing strategy for THIS specific person.
- 3 "power questions" — specific, impossible to answer with yes/no, designed to surface strategic intent.
- Format: Return as a structured brief with clear sections, NOT as an email.`;

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
      if (e.openingHook) contextParts.push(`Opening Hook (use this as inspiration): ${e.openingHook}`);
      if (e.valueAngle) contextParts.push(`Value Angle: ${e.valueAngle}`);
      if (e.watchOuts) contextParts.push(`Watch Outs: ${e.watchOuts}`);
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
        if (intel.talkingPoints?.length) contextParts.push(`Talking Points: ${intel.talkingPoints.join("; ")}`);
        if (intel.decisions?.length) contextParts.push(`Decisions Made: ${intel.decisions.join("; ")}`);
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
        model: "gpt-4o",
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
