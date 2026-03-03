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

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a senior sales professional drafting a follow-up email after a sales meeting. The email should be:

1. Professional but warm — not robotic
2. Reference 1-2 specific discussion points to show you were listening
3. Summarize agreed next steps with clear owners
4. Confirm any commitments made (both sides)
5. Include a soft call-to-action that advances the deal
6. Keep it concise — no longer than 200 words in the body
7. Use the prospect's first name
8. Sign off with the sender's name (use "the team at [brand]" if no specific sender)

Context: This is an M&A deal origination firm. Services include off-market email origination, direct calling, and broker/banker coverage.

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
