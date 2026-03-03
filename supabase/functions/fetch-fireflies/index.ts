import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

async function fetchFirefliesTranscripts(apiKey: string, limit: number, since?: string) {
  const query = `
    query {
      transcripts {
        id
        title
        date
        duration
        organizer_email
        fireflies_users
        participants
        transcript_url
        sentences {
          speaker_name
          text
        }
        summary {
          overview
          shorthand_bullet
          action_items
        }
      }
    }
  `;

  const response = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Fireflies API error:", response.status, text);
    throw new Error(`Fireflies API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors) {
    console.error("Fireflies GraphQL errors:", data.errors);
    throw new Error(data.errors[0]?.message || "Fireflies GraphQL error");
  }

  let transcripts = data.data?.transcripts || [];

  // Filter by date if provided
  if (since) {
    const sinceDate = new Date(since).getTime();
    transcripts = transcripts.filter((t: any) => {
      const tDate = t.date ? new Date(t.date).getTime() : 0;
      return tDate >= sinceDate;
    });
  }

  // Limit results
  transcripts = transcripts.slice(0, limit);

  return transcripts;
}

async function summarizeTranscript(transcript: string, lovableApiKey: string): Promise<{ summary: string; nextSteps: string }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
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
    console.error("AI gateway error:", response.status);
    return { summary: "", nextSteps: "" };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  const summaryMatch = content.match(/SUMMARY:\s*([\s\S]*?)(?=\n\s*NEXT STEPS:|$)/i);
  const nextStepsMatch = content.match(/NEXT STEPS:\s*([\s\S]*?)$/i);

  return {
    summary: summaryMatch ? summaryMatch[1].trim() : content,
    nextSteps: nextStepsMatch ? nextStepsMatch[1].trim() : "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIREFLIES_API_KEY = Deno.env.get("FIREFLIES_API_KEY");
    if (!FIREFLIES_API_KEY) {
      return new Response(
        JSON.stringify({ error: "FIREFLIES_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 50;
    const since = body.since || null;
    const summarize = body.summarize !== false; // default true
    const searchEmails: string[] = body.searchEmails || [];
    const searchNames: string[] = body.searchNames || [];

    console.log(`Fetching Fireflies transcripts (limit: ${limit}, since: ${since}, searchEmails: ${searchEmails.length}, searchNames: ${searchNames.length})`);

    let transcripts = await fetchFirefliesTranscripts(FIREFLIES_API_KEY, limit, since);

    // Filter by search criteria if provided
    if (searchEmails.length > 0 || searchNames.length > 0) {
      const lowerEmails = searchEmails.map((e: string) => e.toLowerCase());
      const lowerNames = searchNames.map((n: string) => n.toLowerCase().split(" ").pop() || "");

      transcripts = transcripts.filter((t: any) => {
        const participants = (t.participants || []).map((p: string) => p.toLowerCase());
        // Check email match
        for (const email of lowerEmails) {
          if (participants.some((p: string) => p.includes(email))) return true;
        }
        // Check name match in title or participants
        for (const name of lowerNames) {
          if (name.length < 3) continue;
          if (t.title?.toLowerCase().includes(name)) return true;
          if (participants.some((p: string) => p.includes(name))) return true;
        }
        return false;
      });
    }

    const processed = [];
    for (const t of transcripts) {
      // Build full transcript text from sentences
      const fullTranscript = t.sentences
        ? t.sentences.map((s: any) => `${s.speaker_name}: ${s.text}`).join("\n")
        : "";

      // Extract attendee info
      const attendees = t.participants || [];
      const attendeeEmails = attendees.map((p: string) => p.toLowerCase());

      let summary = t.summary?.overview || "";
      let nextSteps = t.summary?.action_items || "";

      // If we should summarize with AI and have transcript text
      if (summarize && fullTranscript.length > 50) {
        try {
          // Truncate very long transcripts to ~15k chars for the AI
          const truncated = fullTranscript.length > 15000
            ? fullTranscript.substring(0, 15000) + "\n\n[Transcript truncated...]"
            : fullTranscript;
          const aiResult = await summarizeTranscript(truncated, LOVABLE_API_KEY);
          if (aiResult.summary) summary = aiResult.summary;
          if (aiResult.nextSteps) nextSteps = aiResult.nextSteps;
        } catch (e) {
          console.error("AI summarization failed for transcript:", t.id, e);
          // Fall back to Fireflies' own summary
        }
      }

      processed.push({
        firefliesId: t.id,
        title: t.title || "Untitled Meeting",
        date: t.date ? new Date(t.date).toISOString().split("T")[0] : "",
        duration: t.duration || 0,
        attendees,
        attendeeEmails,
        transcriptUrl: t.transcript_url || "",
        transcript: fullTranscript,
        summary,
        nextSteps,
      });
    }

    return new Response(
      JSON.stringify({ meetings: processed, count: processed.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-fireflies error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
