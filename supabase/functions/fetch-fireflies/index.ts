import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

// Common nickname map — bidirectional lookup
const NICKNAME_MAP: Record<string, string[]> = {
  michael: ["mike", "mikey"],
  mike: ["michael"],
  mikey: ["michael"],
  robert: ["rob", "bob", "bobby", "robbie"],
  rob: ["robert"],
  bob: ["robert"],
  bobby: ["robert"],
  robbie: ["robert"],
  william: ["will", "bill", "billy", "willy"],
  will: ["william"],
  bill: ["william"],
  billy: ["william"],
  willy: ["william"],
  richard: ["rick", "rich", "dick"],
  rick: ["richard"],
  rich: ["richard"],
  dick: ["richard"],
  james: ["jim", "jimmy", "jamie"],
  jim: ["james"],
  jimmy: ["james"],
  jamie: ["james"],
  joseph: ["joe", "joey"],
  joe: ["joseph"],
  joey: ["joseph"],
  thomas: ["tom", "tommy"],
  tom: ["thomas"],
  tommy: ["thomas"],
  daniel: ["dan", "danny"],
  dan: ["daniel"],
  danny: ["daniel"],
  matthew: ["matt"],
  matt: ["matthew"],
  christopher: ["chris"],
  chris: ["christopher"],
  anthony: ["tony"],
  tony: ["anthony"],
  nicholas: ["nick"],
  nick: ["nicholas"],
  benjamin: ["ben"],
  ben: ["benjamin"],
  alexander: ["alex"],
  alex: ["alexander"],
  jonathan: ["jon"],
  jon: ["jonathan"],
  stephen: ["steve"],
  steve: ["stephen", "steven"],
  steven: ["steve"],
  edward: ["ed", "eddie"],
  ed: ["edward"],
  eddie: ["edward"],
  elizabeth: ["liz", "beth", "lizzy"],
  liz: ["elizabeth"],
  beth: ["elizabeth"],
  lizzy: ["elizabeth"],
  jennifer: ["jen", "jenny"],
  jen: ["jennifer"],
  jenny: ["jennifer"],
  katherine: ["kate", "kathy", "katie"],
  kate: ["katherine", "catherine"],
  kathy: ["katherine"],
  katie: ["katherine"],
  catherine: ["kate", "cathy"],
  cathy: ["catherine"],
  margaret: ["maggie", "meg"],
  maggie: ["margaret"],
  meg: ["margaret"],
  patricia: ["pat", "patty"],
  pat: ["patricia", "patrick"],
  patty: ["patricia"],
  patrick: ["pat"],
  david: ["dave"],
  dave: ["david"],
  andrew: ["andy", "drew"],
  andy: ["andrew"],
  drew: ["andrew"],
  timothy: ["tim"],
  tim: ["timothy"],
  samuel: ["sam"],
  sam: ["samuel", "samantha"],
  samantha: ["sam"],
  rebecca: ["becca", "becky"],
  becca: ["rebecca"],
  becky: ["rebecca"],
};

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "live.com", "msn.com",
  "me.com", "mac.com", "googlemail.com", "ymail.com",
]);

/** Get all name variants (original + nicknames) for a given first name */
function getNameVariants(name: string): string[] {
  const lower = name.toLowerCase();
  const variants = [lower];
  const aliases = NICKNAME_MAP[lower];
  if (aliases) variants.push(...aliases);
  return variants;
}

/** Word-boundary match: checks if `word` appears as a whole word in `text` */
function wordBoundaryMatch(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/** Extract domain from an email address */
function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.substring(at + 1).toLowerCase();
}

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
    const body = await req.json().catch(() => ({}));
    const brand: string = body.brand || "Captarget";

    const FIREFLIES_API_KEY = brand === "SourceCo"
      ? Deno.env.get("FIREFLIES_API_KEY_SOURCECO")
      : Deno.env.get("FIREFLIES_API_KEY");

    if (!FIREFLIES_API_KEY) {
      return new Response(
        JSON.stringify({ error: `Fireflies API key for ${brand} is not configured` }),
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

    const limit = body.limit || 100;
    const since = body.since || null;
    const summarize = body.summarize !== false; // default true
    const searchEmails: string[] = body.searchEmails || [];
    const searchNames: string[] = body.searchNames || [];
    const searchDomains: string[] = body.searchDomains || [];

    console.log(`Fetching Fireflies transcripts (limit: ${limit}, since: ${since}, searchEmails: ${searchEmails.length}, searchNames: ${searchNames.length}, searchDomains: ${searchDomains.length})`);

    let transcripts = await fetchFirefliesTranscripts(FIREFLIES_API_KEY, limit, since);

    // Filter by search criteria if provided
    if (searchEmails.length > 0 || searchNames.length > 0 || searchDomains.length > 0) {
      const lowerEmails = searchEmails.map((e: string) => e.toLowerCase());
      const lowerFullNames = searchNames.map((n: string) => n.toLowerCase().trim());
      const lowerDomains = searchDomains.map((d: string) => d.toLowerCase().trim());

      transcripts = transcripts.filter((t: any) => {
        const participants = (t.participants || []).map((p: string) => p.toLowerCase());
        const organizerEmail = (t.organizer_email || "").toLowerCase();
        const firefliesUsers = (t.fireflies_users || []).map((u: string) => u.toLowerCase());
        const allEmailFields = [...participants, organizerEmail, ...firefliesUsers].filter(Boolean);
        const titleLower = (t.title || "").toLowerCase();

        // === Signal 1: Direct email match ===
        for (const email of lowerEmails) {
          if (allEmailFields.some((f: string) => f.includes(email))) return true;
        }

        // === Signal 2: Company domain match ===
        for (const domain of lowerDomains) {
          for (const field of allEmailFields) {
            const fieldDomain = extractDomain(field);
            if (fieldDomain && fieldDomain === domain) return true;
          }
        }

        // === Signal 3: Full name match with word-boundary + nicknames ===
        for (const fullName of lowerFullNames) {
          const nameParts = fullName.split(/\s+/).filter((p: string) => p.length >= 2);
          if (nameParts.length === 0) continue;

          // Build expanded name parts: for the first name, include nickname variants
          const firstName = nameParts[0];
          const firstNameVariants = getNameVariants(firstName);
          const restParts = nameParts.slice(1);

          // Helper: check if a text matches any first-name variant + all remaining name parts
          const matchesInText = (text: string): boolean => {
            const hasFirstName = firstNameVariants.some((v) => wordBoundaryMatch(text, v));
            if (!hasFirstName) return false;
            return restParts.every((part) => wordBoundaryMatch(text, part));
          };

          // Check title
          if (matchesInText(titleLower)) return true;

          // Check each participant/email field individually
          for (const field of allEmailFields) {
            if (matchesInText(field)) return true;
          }

          // === Signal 4: Speaker name match in transcript ===
          const speakers = (t.sentences || []).map((s: any) => (s.speaker_name || "").toLowerCase());
          const uniqueSpeakers = [...new Set(speakers)];
          for (const speaker of uniqueSpeakers) {
            if (matchesInText(speaker as string)) return true;
          }
        }
        return false;
      });
    }

    // Apply limit after filtering
    transcripts = transcripts.slice(0, limit);

    const processed = [];
    for (const t of transcripts) {
      // Build full transcript text from sentences
      const fullTranscript = t.sentences
        ? t.sentences.map((s: any) => `${s.speaker_name}: ${s.text}`).join("\n")
        : "";

      // Extract attendee info
      const attendees = t.participants || [];
      const attendeeEmails = attendees.map((p: string) => p.toLowerCase());

      // Always keep native Fireflies summary as fallback
      const nativeSummary = t.summary?.overview || "";
      const nativeNextSteps = t.summary?.action_items || "";
      let summary = nativeSummary;
      let nextSteps = nativeNextSteps;

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
