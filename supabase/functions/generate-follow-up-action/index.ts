import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BANNED_PHRASES = `
BANNED PHRASES (if ANY of these appear in your draft, delete the sentence and rewrite):
"I hope this finds you well", "I wanted to reach out", "I'd love to", "Just checking in",
"Following up", "Circling back", "Touching base", "Per our conversation", "As discussed",
"As agreed", "At your earliest convenience", "Please don't hesitate",
"I look forward to hearing from you", "Let me know if you have any questions",
"Happy to discuss further", "Quick question", "I noticed that", "It was great to",
"Thank you for your time", "I hope you're doing well", "I hope you had a great weekend",
"Just wanted to", "Reach out", "Touch base", "Best regards", "Kind regards",
"Warm regards", "Looking forward to hearing from you",
"leveraging", "synergies", "alignment", "opportunities", "solutions", "offerings",
"capabilities", "value proposition", "strategic fit", "growth trajectory",
"aggressive acquisitions", "primes you for", "positions you to",
"our pipeline includes", "our team can", "our services", "our platform",
"discuss how we can", "explore ways", "mutually beneficial",
"low-cost", "resources", "current efforts", "next steps" (as a vague phrase),
"to support your", "expect introductions"`;

type ActionType = "post-meeting" | "initial-outreach" | "meeting-nudge" | "proposal-followup" | "re-engagement" | "reply-inbound" | "schedule-call" | "prep-brief";

function getSystemPrompt(actionType: ActionType): string {
  const base = `You are a senior dealmaker at an M&A deal origination firm. You write like a Wall Street veteran: direct, specific, zero fluff. Your audience is PE managing partners, family office principals, and C-suite acquirers who get 50+ cold emails daily.

=== PRIORITY 1 (violating any of these makes the email unusable) ===
- No em dashes, en dashes, or double hyphens. Ever. Use commas, periods, or line breaks.
- No banned phrases (see list below). If "As agreed", "As discussed", "Following up", etc. appear, the email is trash.
- NEVER tell the prospect what they already know about themselves. They were there. They know their fund size, strategy, and portfolio. Do not parrot their words back.
- NEVER explain what their situation "means" or "implies." No interpreting their business for them.
- Maximum 80 words in the body. Count them. If over 80, cut ruthlessly.

=== PRIORITY 2 (violating these makes the email mediocre) ===
- First sentence states what YOU have or what YOU are delivering. Not what THEY said or what THEY need.
- ONE call-to-action naming a specific deliverable with a date. Not "let's discuss" but "sending 3 profiles Thursday."
- Every noun is specific: dollar amounts, geographies, company counts, sector names, EBITDA ranges. Not "security firms" but "$8-12M commercial security companies in TX."
- No vendor language. Never say "our pipeline", "our team", "our services." Say what you HAVE: "tracking 3 targets" not "our pipeline includes targets."

=== PRIORITY 3 (polish) ===
- Subject line: 4-6 words, specific to THIS deal. Not a newsletter title. Not "Resource Introductions for Canadian Leads." More like "3 Ontario med-tech contacts" or "TX security targets, $8-12M."
- Sign off: first name only, on its own line after a blank line. No "Best", no "Regards", no dash before the name.
- Write as a peer sharing intelligence, not a salesperson pitching.
- If brand is SourceCo: direct, research-heavy, executive search vernacular.
- If brand is Captarget: market-intelligence-forward, deal-flow focused.
- Match seniority: Managing Partners/CEOs get 3-4 sentences max. VPs/Directors can get slightly more context.
- No markdown formatting.
- Return ONLY: subject line on first line, blank line, then body.

${BANNED_PHRASES}

=== BAD vs GOOD examples ===

BAD initial outreach: "Hi John, I hope this email finds you well. I wanted to follow up on our recent conversation about your acquisition strategy. I'd love to schedule a call to discuss how our services might align with your goals. Please let me know what works for your schedule. Best regards, The Team"

GOOD initial outreach: "John, 14 HVAC distributors traded hands in the Southeast this quarter, 9 off-market. Your criteria matches 3 we're tracking. 15 minutes to compare notes?

Mike"

BAD initial outreach: "Cody, Shore Capital's $850M fund closure primes Dillard Door for aggressive acquisitions. Our pipeline includes five tech-enhanced security firms. Can we discuss alignment opportunities next Tuesday?"

GOOD initial outreach: "Cody, 3 commercial security companies in TX, $8-12M revenue, all off-market. One overlaps with Dillard Door's locksmith vertical. Profiles by Thursday if useful.

Mike"

BAD post-meeting: "Emmanuel, you mentioned budget constraints limit your lead generation in Canadian healthcare tech. As agreed, I'll introduce you to two additional low-cost resources by Friday to support your current efforts. Expect introductions and details on next steps."

GOOD post-meeting: "Emmanuel, sending 2 Canadian healthcare sourcing contacts by Friday. Both work sub-$5K retainers, one specializes in Ontario med-tech. Names and intros Thursday.

Mike"

BAD post-meeting: "Hi Sarah, it was great meeting you today. Thank you for your time. As discussed, we'll follow up with some target recommendations. Please let me know if you have any questions."

GOOD post-meeting: "Sarah, 4 profiles matching your $5-10M EBITDA criteria in industrial services. Sending Thursday with financials. One has an LOI deadline in 3 weeks, worth a first look.

Mike"

=== SELF-CHECK (do this before returning) ===
Re-read your draft and verify:
1. Does it contain any em dash, en dash, or "--"? If yes, rewrite.
2. Does it contain ANY phrase from the banned list? If yes, rewrite.
3. Does any sentence explain to the prospect what their own situation is, or repeat what they said? If yes, delete it.
4. Is the word count over 80? If yes, cut.
5. Does the subject line sound like a newsletter or generic header? If yes, make it specific to this deal.
6. Does the CTA name a specific deliverable with a date? If not, fix it.
7. Does the first sentence start with what YOU have, not what THEY said? If not, rewrite.
8. Is there any vague noun that could be made specific (amounts, counts, geographies)? If yes, specify it.`;

  switch (actionType) {
    case "post-meeting":
      return `${base}

TASK: Draft a post-meeting follow-up email.
- Do NOT repeat what they said back to them. They were there.
- Do NOT reference "what you mentioned" or "as we discussed." Banned.
- Instead: state what YOU are delivering, with specifics (names, count, dollar ranges, dates).
- The email should answer one question: "What am I getting, and when?"
- Confirm the ONE agreed next step with owner and timeline.
- If there's an open action item on YOUR side, state what you'll deliver and when.
- End. No filler closing. No "looking forward to" anything.`;

    case "initial-outreach":
      return `${base}

TASK: Draft an initial outreach email to a prospect who has NOT been contacted yet.
- First sentence: state a SPECIFIC fact, a deal count, a market data point, a target you're tracking. Not about THEM, about what YOU have that's relevant to them.
- Second sentence: connect it to their situation in ONE line. Be specific: name EBITDA ranges, geographies, sectors, company count.
- Third sentence: ONE CTA with a specific deliverable. Not "let's discuss" but "I'll send profiles Thursday" or "15 min to compare target lists."
- That's it. Three sentences. Maybe four if the data needs a sentence of context.
- NEVER tell them what their own fund/strategy/portfolio means. They know.`;

    case "meeting-nudge":
      return `${base}

TASK: Draft a meeting-booking nudge for a prospect who expressed interest but hasn't scheduled.
- Lead with SPECIFIC value they'll get from the meeting: name targets, geographies, EBITDA ranges, or market data you have.
- Not "I'd love to discuss how we can help." Instead: "3 off-market targets in [geography] matching [criteria]. Worth 15 minutes?"
- One sentence of value, one CTA. Done.`;

    case "proposal-followup":
      return `${base}

TASK: Draft a follow-up to a prospect who received a proposal but hasn't responded.
- Do NOT ask "did you get my proposal?" or "checking in on the proposal."
- Lead with ONE new data point they don't have: a relevant deal that closed, a market shift, a competitive move.
- Connect it back to why the proposal matters NOW.
- One CTA: suggest a 15-min call to walk through specifics.`;

    case "re-engagement":
      return `${base}

TASK: Draft a re-engagement email for a prospect who's been silent 21+ days.
- Maximum 50 words. This is the shortest email type.
- Lead with ONE new market fact: a deal, a trend, a data point.
- No guilt about silence. No "haven't heard from you."
- End with "Still relevant?" or "Worth revisiting?" or similar low-friction CTA.`;

    case "reply-inbound":
      return `${base}

TASK: Draft a reply to an inbound email from a prospect.
- Mirror their tone and approximate length.
- Answer their specific question or point in the FIRST line.
- Add one piece of value beyond just answering: context, insight, or relevant data.
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
- 3 "power questions": specific, impossible to answer with yes/no, designed to surface strategic intent.
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

    const contextParts: string[] = [];

    contextParts.push(`Prospect: ${lead.name || "Unknown"}, ${lead.role || ""} at ${lead.company || ""}`);
    contextParts.push(`Brand: ${lead.brand === "SourceCo" ? "SourceCo" : "Captarget"}`);
    contextParts.push(`Stage: ${lead.stage}`);
    if (lead.dealValue) contextParts.push(`Deal Value: $${lead.dealValue.toLocaleString()}`);
    if (lead.serviceInterest && lead.serviceInterest !== "TBD") contextParts.push(`Service Interest: ${lead.serviceInterest}`);

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
