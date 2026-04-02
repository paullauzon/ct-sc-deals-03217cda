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

    if (leadFields) {
      contextParts.push(`Prospect: ${leadFields.name || "Unknown"}, ${leadFields.role || ""} at ${leadFields.company || ""}`);
      contextParts.push(`Our brand: ${leadFields.brand === "SourceCo" ? "SourceCo" : "Captarget"}`);
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
            content: `You are a senior dealmaker drafting a post-meeting follow-up email. Your audience is PE managing partners, family office principals, and C-suite acquirers who get 50+ emails daily and delete anything generic.

=== PRIORITY 1 (violating any of these makes the email unusable) ===
- No em dashes, en dashes, or double hyphens. Ever. Use commas, periods, or line breaks.
- No banned phrases (see list below). If "As agreed", "As discussed", "Following up", etc. appear, the email is trash.
- NEVER tell the prospect what they already know about themselves. They were there. Do not parrot their words back.
- NEVER say "you mentioned..." or repeat what they said in the meeting. They know what they said.
- Maximum 80 words in the body. Count them. If over 80, cut ruthlessly.

=== PRIORITY 2 (violating these makes the email mediocre) ===
- First sentence states what YOU are delivering. Not what THEY said or need.
- ONE call-to-action naming a specific deliverable with a date. Not "let's discuss" but "sending profiles Thursday."
- Every noun is specific: dollar amounts, geographies, company counts, sector names, EBITDA ranges.
- No vendor language. Never say "our pipeline", "our team", "our services."

=== PRIORITY 3 (polish) ===
- Subject line: 4-6 words, specific to THIS deal. Not a newsletter title.
- Sign off: first name only, on its own line after a blank line.
- Write as a peer sharing intelligence, not a salesperson.
- If brand is SourceCo: direct, research-heavy, executive search vernacular.
- If brand is Captarget: market-intelligence-forward, deal-flow focused.
- Match seniority: Managing Partners/CEOs get fewer words.

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

=== BAD vs GOOD examples ===

BAD: "Hi John, thank you for taking the time to meet today. It was great to learn about your acquisition strategy. As discussed, we'll follow up with some target recommendations. Please let me know if you have any questions. Best regards, The Team"

GOOD: "John, 4 HVAC targets in the $8-12M range, all off-market. Sending profiles with financials Friday. One has an LOI deadline in 3 weeks.

Mike"

BAD: "Emmanuel, you mentioned budget constraints limit your lead generation in Canadian healthcare tech. As agreed, I'll introduce you to two additional low-cost resources by Friday to support your current efforts. Expect introductions and details on next steps."

GOOD: "Emmanuel, sending 2 Canadian healthcare sourcing contacts by Friday. Both work sub-$5K retainers, one specializes in Ontario med-tech. Names and intros Thursday.

Mike"

=== SELF-CHECK (do this before returning) ===
Re-read your draft and verify:
1. Does it contain any em dash, en dash, or "--"? If yes, rewrite.
2. Does it contain ANY phrase from the banned list? If yes, rewrite.
3. Does any sentence explain to the prospect what their own situation is, or repeat what they said? If yes, delete it.
4. Is the word count over 80? If yes, cut.
5. Does the subject line sound like a newsletter or generic header? If yes, make it specific.
6. Does the CTA name a specific deliverable with a date? If not, fix it.
7. Does the first sentence start with what YOU have/deliver, not what THEY said? If not, rewrite.

Return ONLY the email text: subject line on first line, blank line, then body. No markdown formatting.`,
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
