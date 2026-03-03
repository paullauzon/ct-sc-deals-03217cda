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
    const { transcript } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return new Response(
        JSON.stringify({ error: "transcript is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a sales meeting analyst. Given a meeting transcript, extract exactly two things:

1. SUMMARY: A concise 2-3 sentence summary of what was discussed, focusing on the prospect's needs, pain points, and interest level.

2. NEXT STEPS: A bulleted list of concrete, actionable next steps with owners if mentioned. Each bullet should start with "- ".

Format your response exactly like this:
SUMMARY:
[your summary here]

NEXT STEPS:
- [step 1]
- [step 2]
- [step 3]

Be direct, specific, and actionable. No fluff.`,
          },
          {
            role: "user",
            content: `Here is the meeting transcript to analyze:\n\n${transcript}`,
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the structured response
    const summaryMatch = content.match(/SUMMARY:\s*([\s\S]*?)(?=\n\s*NEXT STEPS:|$)/i);
    const nextStepsMatch = content.match(/NEXT STEPS:\s*([\s\S]*?)$/i);

    const summary = summaryMatch ? summaryMatch[1].trim() : content;
    const nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : "";

    return new Response(
      JSON.stringify({ summary, nextSteps }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("summarize-meeting error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
