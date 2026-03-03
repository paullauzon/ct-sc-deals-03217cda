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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { transcript, priorMeetings } = body;

    if (!transcript || transcript.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Transcript is too short to summarize" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build prior context block
    let priorContext = "";
    if (priorMeetings && priorMeetings.length > 0) {
      priorContext = "\n\nPRIOR MEETING HISTORY (oldest first):\n";
      for (const m of priorMeetings) {
        priorContext += `\n--- Meeting: ${m.title || "Untitled"} (${m.date || "unknown date"}) ---\n`;
        if (m.summary) priorContext += `Summary: ${m.summary}\n`;
        if (m.nextSteps) priorContext += `Next Steps: ${m.nextSteps}\n`;
      }
    }

    // Truncate transcript
    const truncated = transcript.length > 15000
      ? transcript.substring(0, 15000) + "\n\n[Transcript truncated...]"
      : transcript;

    const systemPrompt = `You are a sales meeting analyst for an M&A deal origination firm. Given a meeting transcript${priorMeetings?.length ? " and the history of prior meetings with this prospect" : ""}, produce a structured analysis.

Your output MUST follow this exact format:

SUMMARY:
A comprehensive 3-5 sentence summary covering:
- Key topics discussed and decisions made
- Prospect's pain points, needs, and interest level
- Any objections or concerns raised
- Overall tone and relationship progression
${priorMeetings?.length ? "- What changed or progressed since the last meeting" : ""}

NEXT STEPS:
A bulleted list of concrete, actionable next steps. Each bullet starts with "- " and includes:
- The specific action to take
- Who owns it (if mentioned)
- Any deadline or timeframe mentioned
${priorMeetings?.length ? "- Note which prior next steps were addressed or still outstanding" : ""}

${priorMeetings?.length ? `RELATIONSHIP PROGRESSION:
A 1-2 sentence note on how the relationship has evolved across meetings — momentum, engagement level, deal trajectory.` : ""}

Be direct, specific, and actionable. No fluff. Use concrete details from the transcript.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `${priorContext ? priorContext + "\n\n" : ""}CURRENT MEETING TRANSCRIPT:\n\n${truncated}`,
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("AI gateway error:", status);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const summaryMatch = content.match(/SUMMARY:\s*([\s\S]*?)(?=\n\s*NEXT STEPS:|$)/i);
    const nextStepsMatch = content.match(/NEXT STEPS:\s*([\s\S]*?)(?=\n\s*RELATIONSHIP PROGRESSION:|$)/i);
    const progressionMatch = content.match(/RELATIONSHIP PROGRESSION:\s*([\s\S]*?)$/i);

    const summary = summaryMatch ? summaryMatch[1].trim() : content;
    let nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : "";
    const progression = progressionMatch ? progressionMatch[1].trim() : "";

    // Append progression to summary if present
    const fullSummary = progression ? `${summary}\n\n📈 ${progression}` : summary;

    return new Response(
      JSON.stringify({ summary: fullSummary, nextSteps }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-meeting error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
