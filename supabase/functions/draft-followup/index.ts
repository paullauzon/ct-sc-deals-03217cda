import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const P1_RULES = `
=== PRIORITY 1 (violating any of these makes the email unusable) ===
- No em dashes, en dashes, or double hyphens. Ever. Use commas, periods, or line breaks.
- No banned phrases (see list below). If any appear, the email is trash.
- NEVER tell the prospect what they already know about themselves. They were there. Do not parrot their words back.
- NEVER say "you mentioned..." or repeat what they said.

BANNED PHRASES (if ANY appear, delete and rewrite):
"I hope this finds you well", "I wanted to reach out", "I'd love to", "Just checking in",
"Following up", "Circling back", "Touching base", "Per our conversation", "As discussed",
"As agreed", "At your earliest convenience", "Please don't hesitate",
"I look forward to hearing from you", "Let me know if you have any questions",
"Happy to discuss further", "Quick question", "I noticed that", "It was great to",
"Thank you for your time", "Best regards", "Kind regards", "Warm regards",
"Looking forward to hearing from you", "leveraging", "synergies", "alignment",
"opportunities", "solutions", "offerings", "capabilities", "value proposition",
"strategic fit", "growth trajectory", "aggressive acquisitions",
"our pipeline includes", "our team can", "our services", "discuss how we can",
"explore ways", "mutually beneficial", "low-cost", "current efforts",
"to support your", "expect introductions"

=== SELF-CHECK (do this before returning) ===
1. Does it contain any em dash, en dash, or "--"? If yes, rewrite.
2. Does it contain ANY phrase from the banned list? If yes, rewrite.
3. Does any sentence explain to the prospect what their own situation is? If yes, delete it.
4. Does the subject line sound like a newsletter? If yes, make it specific.
`;

const BRAND_CONTEXT = `
- If brand is SourceCo: direct, research-heavy, executive search vernacular. You find and place operating executives.
- If brand is Captarget: market-intelligence-forward, deal-flow focused. You source acquisition targets and provide market maps.
`;

const SIGN_OFF = `Sign off: first name only, on its own line after a blank line. No "Best", no "Regards".`;

function getSystemPrompt(actionType: string): string {
  const prompts: Record<string, string> = {
    agenda: `You are drafting a PRE-MEETING AGENDA EMAIL. Not a follow-up. Not a recap. An agenda.

FORMAT (strict):
Subject: [4-6 words specific to this meeting]

[One sentence: what this meeting will cover and the outcome you're driving toward]

Agenda:
1. [Topic] — [What you'll cover, 2-3 specifics] (Xmin)
2. [Topic] — [What you'll cover, 2-3 specifics] (Xmin)
3. [Topic] — [What you'll cover, 2-3 specifics] (Xmin)

[One sentence: what to prepare or bring, if applicable]

[first name]

RULES:
- 3 agenda items, each with a time estimate
- Topics must reference THEIR deal, sector, geography, or criteria. Not generic.
- Total should add to ~30min or ~45min depending on meeting type.
- If you know their priorities from previous meetings, weave them in.
- No vendor language. You're setting a peer-to-peer working session.
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,

    "post-meeting": `You are drafting a POST-MEETING FOLLOW-UP EMAIL. You're recapping what was decided and what happens next.

FORMAT:
Subject: [4-6 words referencing a specific decision or next step from the meeting]

[One sentence stating what YOU are delivering or doing next, with a date]

Key takeaways:
- [Specific decision or insight, with numbers/names]
- [Specific decision or insight]
- [Specific decision or insight]

Next steps:
- [Your action] by [date]
- [Their action] by [date, if discussed]

[first name]

RULES:
- Maximum 80 words in the body.
- Lead with what YOU deliver, not what THEY said.
- Every noun is specific: dollar amounts, company names, geographies, EBITDA ranges.
- ONE clear next deliverable with a date in the first sentence.
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,

    nudge: `You are drafting a NUDGE EMAIL to get a response from someone who owes you something (information, a decision, feedback). This is NOT "checking in." You are providing new value to earn the response.

FORMAT:
Subject: [4-6 words, references something new you found or are sharing]

[One sentence sharing a new data point, market insight, or relevant update that gives them a reason to respond NOW]

[One sentence referencing the specific item they owe, framed as "so I can [do the thing that benefits them]"]

[first name]

RULES:
- Maximum 50 words in the body. Nudges are SHORT.
- NEVER say "checking in", "following up", "circling back", "just wanted to"
- Lead with NEW value: a comp, a market data point, a name, a deal that closed
- Then reference what you need from them, framed as enabling YOUR deliverable for THEM
- Create subtle urgency through specificity ("2 of the 4 targets I sent have active LOIs")
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,

    objection: `You are drafting a RESPONSE TO A SPECIFIC OBJECTION raised by the prospect. You must address it head-on with evidence, not deflect.

FORMAT:
Subject: [4-6 words that reframe the objection as a solvable problem]

[One sentence acknowledging the concern WITHOUT repeating their words back. State the reality.]

[2-3 sentences with specific evidence: a number, a case study result, a comparable deal, or a data point that directly counters the objection. Be concrete.]

[One sentence with a clear next step that moves past the objection.]

[first name]

RULES:
- Maximum 80 words.
- NEVER parrot the objection back ("I understand your concern about...")
- Lead with evidence and data, not reassurance
- Use specific numbers, company examples, or market data
- The next step should be concrete ("sending 3 case studies by Thursday" not "happy to discuss")
- Tone: confident peer sharing facts, not defensive salesperson
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,

    "re-engagement": `You are drafting a RE-ENGAGEMENT EMAIL for a prospect who has gone silent. They haven't responded in 7+ days. This is NOT "checking in." You are giving them a reason to re-engage NOW.

FORMAT:
Subject: [4-6 words referencing a market trigger, news event, or new data point]

[One sentence sharing a genuinely new, relevant insight: a deal that closed in their sector, a regulatory change, a comp that moved, new targets identified]

[One sentence connecting it to their specific situation with a concrete deliverable]

[first name]

RULES:
- Maximum 60 words. Shorter = better for re-engagement.
- NEVER reference their silence ("haven't heard from you", "been a while")
- Lead with something they DON'T know yet
- Make it feel like you're sharing intel with a peer, not chasing a sale
- The deliverable should be specific ("3 off-market HVAC targets in Ontario" not "some ideas")
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,

    commitment: `You are drafting an email that DELIVERS ON A PROMISE made in a previous meeting. You committed to sending something (profiles, data, case studies, targets) and now you're delivering it.

FORMAT:
Subject: [What you're delivering] — [quantity or specificity]

[One sentence: here is what you promised, delivered. Reference the specific item.]

[2-3 bullet points previewing what's included, with specific details: names, EBITDA ranges, geographies, sectors]

[One sentence: the next step or what you want from them after they review]

[first name]

RULES:
- Maximum 80 words.
- First sentence is about DELIVERY, not about the meeting where it was discussed
- Be specific about what's attached/included
- Close with what you need from them: "Flag the 2 strongest fits by Friday"
- Tone: you're a peer delivering work product, not a vendor dropping off brochures
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,

    outreach: `You are drafting a FIRST-TOUCH COLD EMAIL. The prospect has never heard from you. Every word must earn the next word.

FORMAT:
Subject: [4-6 words, hyper-specific to their deal criteria or sector]

[One sentence: what you have for them. A number, a type, a geography. Not what you do.]

[One sentence: why now, with specificity. A market window, a comp, a timing angle.]

[One sentence: the ask. A 15-min call, sending profiles, sharing a map. With a date.]

[first name]

RULES:
- Maximum 50 words. Cold emails that are long get deleted.
- First sentence is about THEM and what you HAVE, not about YOU and what you DO
- No company introductions ("We are a..." is instant delete)
- Every noun is specific. Not "opportunities" but "4 HVAC distributors, $5-15M revenue, Pacific NW"
- ONE ask. Not two. Not "would love to chat or send some info." Pick one.
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,

    strategic: `You are drafting a STRATEGIC EMAIL to expand into a new stakeholder, multi-thread the deal, or advance the relationship. This might be an intro request, a referral ask, or reaching a decision-maker through your existing contact.

FORMAT:
Subject: [4-6 words, references the specific expansion angle]

[One sentence: the specific reason you're reaching out to this person or asking for this intro, tied to a concrete deal outcome]

[One sentence: what you'll provide or share that makes the intro/expansion valuable to ALL parties]

[One sentence: the specific ask with a timeline]

[first name]

RULES:
- Maximum 70 words.
- Be explicit about WHO you want to reach and WHY
- Frame as mutual benefit, not "I need access to your boss"
- Reference specific deal context that makes the expansion logical
- The ask is concrete: "Could you cc David on my next target list?" not "expand the conversation"
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,

    "proposal-followup": `You are drafting a PROPOSAL FOLLOW-UP EMAIL. A proposal was sent and you need a response. This is NOT "did you get my email." You are adding new value that reinforces the proposal.

FORMAT:
Subject: [4-6 words referencing a specific proposal element or new supporting data]

[One sentence: a new data point, case study result, or market insight that strengthens the proposal's value]

[One sentence: the specific decision or feedback you need, with a date]

[first name]

RULES:
- Maximum 50 words. Proposal follow-ups should be tight.
- NEVER ask "did you get a chance to review"
- Lead with something NEW that wasn't in the proposal
- Reference a specific section or number from the proposal
- The ask is about a decision, not a meeting: "Need your top 3 criteria by Friday so I can narrow the shortlist"
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`,
  };

  return prompts[actionType] || `You are a senior dealmaker drafting a follow-up email. Your audience is PE managing partners, family office principals, and C-suite acquirers who get 50+ emails daily and delete anything generic.

FORMAT:
Subject: [4-6 words, specific to THIS deal]

[Body: maximum 80 words. First sentence states what YOU are delivering. ONE call-to-action naming a specific deliverable with a date. Every noun is specific.]

[first name]

RULES:
- Maximum 80 words.
- First sentence is about what YOU deliver, not what THEY said.
- ONE CTA with a specific deliverable and date.
- No vendor language.
${P1_RULES}
${BRAND_CONTEXT}
${SIGN_OFF}
Return ONLY the email text: subject line on first line, blank line, then body. No markdown.`;
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

    const { meeting, leadFields, dealIntelligence, actionType: rawActionType } = await req.json();
    const actionType = rawActionType || "default";

    if (!meeting?.intelligence && !meeting?.summary) {
      return new Response(JSON.stringify({ error: "Meeting has no intelligence to draft from" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const intel = meeting.intelligence;
    const contextParts: string[] = [];

    if (leadFields) {
      contextParts.push(`Prospect: ${leadFields.name || "Unknown"}, ${leadFields.role || ""} at ${leadFields.company || ""}`);
      contextParts.push(`Our brand: ${leadFields.brand === "SourceCo" ? "SourceCo" : "Captarget"}`);
      if (leadFields.serviceInterest) contextParts.push(`Service interest: ${leadFields.serviceInterest}`);
      if (leadFields.targetCriteria) contextParts.push(`Target criteria: ${leadFields.targetCriteria}`);
      if (leadFields.targetRevenue) contextParts.push(`Target revenue range: ${leadFields.targetRevenue}`);
      if (leadFields.geography) contextParts.push(`Geography focus: ${leadFields.geography}`);
      if (leadFields.stage) contextParts.push(`Current stage: ${leadFields.stage}`);
      if (leadFields.assignedTo) contextParts.push(`Our rep: ${leadFields.assignedTo}`);
    }

    contextParts.push(`\nMEETING: ${meeting.title} (${meeting.date})`);
    if (intel) {
      contextParts.push(`Summary: ${intel.summary}`);
      if (intel.attendees?.length) {
        contextParts.push(`Attendees: ${intel.attendees.map((a: any) => `${a.name} (${a.role})`).join(", ")}`);
      }
      if (intel.nextSteps?.length) {
        contextParts.push(`Next Steps:\n${intel.nextSteps.map((ns: any) => `- ${ns.action} (${ns.owner})${ns.deadline ? " by " + ns.deadline : ""}`).join("\n")}`);
      }
      if (intel.actionItems?.length) {
        contextParts.push(`Action Items:\n${intel.actionItems.map((ai: any) => `- ${ai.item} (${ai.owner})`).join("\n")}`);
      }
      if (intel.decisions?.length) {
        contextParts.push(`Decisions: ${intel.decisions.join("; ")}`);
      }
      if (intel.keyTopics?.length) {
        contextParts.push(`Topics Discussed: ${intel.keyTopics.join(", ")}`);
      }
      if (intel.talkingPoints?.length) {
        contextParts.push(`Follow-up Talking Points: ${intel.talkingPoints.join("; ")}`);
      }
      if (intel.valueProposition) {
        contextParts.push(`What Resonated: ${intel.valueProposition}`);
      }
      if (intel.objections?.length) {
        contextParts.push(`Objections Raised:\n${intel.objections.map((o: any) => `- ${typeof o === "string" ? o : o.objection + " (" + o.status + ")"}`).join("\n")}`);
      }
    } else {
      if (meeting.summary) contextParts.push(`Summary: ${meeting.summary}`);
      if (meeting.nextSteps) contextParts.push(`Next Steps: ${meeting.nextSteps}`);
    }

    if (dealIntelligence?.dealNarrative) {
      contextParts.push(`\nDeal Context: ${dealIntelligence.dealNarrative}`);
    }
    if (dealIntelligence?.psychologicalProfile?.communicationStyle) {
      contextParts.push(`Communication Style: ${dealIntelligence.psychologicalProfile.communicationStyle}`);
    }
    if (dealIntelligence?.winStrategy?.recommendedApproach) {
      contextParts.push(`Recommended Approach: ${dealIntelligence.winStrategy.recommendedApproach}`);
    }
    if (dealIntelligence?.buyingCommittee?.length) {
      contextParts.push(`Buying Committee: ${dealIntelligence.buyingCommittee.map((m: any) => `${m.name} (${m.role}, ${m.stance})`).join(", ")}`);
    }

    // Add action-specific context
    if (meeting.actionSpecificContext) {
      contextParts.push(`\nACTION CONTEXT: ${meeting.actionSpecificContext}`);
    }

    const systemPrompt = getSystemPrompt(actionType);

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
      return new Response(JSON.stringify({ error: "AI processing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const emailText = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ email: emailText }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("draft-followup error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
