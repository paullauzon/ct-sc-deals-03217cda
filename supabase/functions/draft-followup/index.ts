import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { meeting, leadFields, dealIntelligence } = await req.json();

    if (!meeting?.intelligence && !meeting?.summary) {
      return new Response(JSON.stringify({ error: "Meeting has no intelligence to draft from" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const intel = meeting.intelligence;
    const contextParts: string[] = [];

    // Lead context
    if (leadFields) {
      contextParts.push(`Prospect: ${leadFields.name || "Unknown"} — ${leadFields.role || ""} at ${leadFields.company || ""}`);
      contextParts.push(`Our brand: ${leadFields.brand === "SourceCo" ? "SourceCo" : "Captarget"}`);
    }

    // Meeting details
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
    } else {
      if (meeting.summary) contextParts.push(`Summary: ${meeting.summary}`);
      if (meeting.nextSteps) contextParts.push(`Next Steps: ${meeting.nextSteps}`);
    }

    // Deal intelligence context
    if (dealIntelligence?.dealNarrative) {
      contextParts.push(`\nDeal Context: ${dealIntelligence.dealNarrative}`);
    }
    if (dealIntelligence?.psychologicalProfile?.communicationStyle) {
      contextParts.push(`Communication Style: ${dealIntelligence.psychologicalProfile.communicationStyle}`);
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a senior dealmaker drafting a post-meeting follow-up email. Your audience is PE managing partners, family office principals, and C-suite acquirers — people who get 50+ emails daily and delete anything that smells generic.

RULES:
- Maximum 100 words in the body. 60-80 is ideal.
- First sentence: reference ONE specific thing discussed in the meeting — use their words if available. No "it was great meeting you." No "thank you for your time."
- Confirm the ONE agreed next step with clear owner and timeline.
- If there's an open action item on YOUR side, state what you'll deliver and when.
- ONE call-to-action. Not two.
- Subject line: max 6 words. Specific to what was discussed. Not "Following up on our conversation."
- Sign off with first name only.
- Write as a peer, not a vendor.
- If brand is SourceCo: direct, research-heavy, executive search vernacular.
- If brand is Captarget: market-intelligence-forward, deal-flow focused.
- Match seniority: Managing Partners/CEOs get fewer words. VPs/Directors can get slightly more context.
- NEVER explain to the prospect what their own situation means. They know. State what YOU will deliver.
- NEVER use "our pipeline", "our team", "our services", "our platform" — vendor phrases. Say what you HAVE.
- Every noun must be specific. Not "security firms" but "$8-12M commercial security companies in TX."
- The CTA must name a specific deliverable. Not "discuss next steps" but "send profiles by Friday."

BANNED PHRASES (never use any of these — rewrite if you catch yourself):
"I hope this finds you well", "I wanted to reach out", "I'd love to", "Just checking in",
"Following up", "Circling back", "Touching base", "Per our conversation", "As discussed",
"At your earliest convenience", "Please don't hesitate", "I look forward to hearing from you",
"Let me know if you have any questions", "Happy to discuss further", "Quick question",
"I noticed that", "It was great to", "Thank you for your time", "Best regards",
"Kind regards", "Warm regards", "Looking forward to hearing from you",
"leveraging", "synergies", "alignment", "opportunities", "solutions", "offerings",
"capabilities", "value proposition", "strategic fit", "growth trajectory",
"aggressive acquisitions", "our pipeline includes", "our team can", "our services",
"discuss how we can", "explore ways", "mutually beneficial"

BAD: "Hi John, thank you for taking the time to meet with us today. It was great to learn about your acquisition strategy. As discussed, we'll follow up with some target recommendations. Please let me know if you have any questions. Best regards, The Team"

GOOD: "John — you mentioned needing HVAC targets in the $8-12M range by Q3. We're tracking 4 that fit. I'll send profiles by Friday. If one clicks, we move fast. — Mike"

Return ONLY the email text — subject line on first line, then blank line, then body. No markdown formatting.`,
          },
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
