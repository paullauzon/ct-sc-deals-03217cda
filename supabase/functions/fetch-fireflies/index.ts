import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";
const BATCH_SIZE = 50;
const MAX_BATCHES = 20; // Safety cap: scan up to 1000 transcripts

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

function getNameVariants(name: string): string[] {
  const lower = name.toLowerCase();
  const variants = [lower];
  const aliases = NICKNAME_MAP[lower];
  if (aliases) variants.push(...aliases);
  return variants;
}

function wordBoundaryMatch(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.substring(at + 1).toLowerCase();
}

// ── Fireflies API helpers ──

/** Metadata-only query (no sentences — fast) */
const METADATA_QUERY = `
  query Transcripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      date
      duration
      organizer_email
      fireflies_users
      participants
      transcript_url
    }
  }
`;

/** Full transcript query for a single meeting */
const FULL_TRANSCRIPT_QUERY = `
  query Transcript($id: String!) {
    transcript(id: $id) {
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

async function firefliesRequest(apiKey: string, query: string, variables: Record<string, any> = {}) {
  const response = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
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
  return data.data;
}

/** Fetch metadata in paginated batches, applying filter function to each batch */
async function fetchMetadataPaginated(
  apiKey: string,
  filterFn: ((t: any) => boolean) | null,
  maxMatches: number,
  since?: string,
): Promise<any[]> {
  const matches: any[] = [];
  let skip = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    console.log(`Fetching metadata batch ${batch + 1} (skip=${skip}, limit=${BATCH_SIZE})`);
    const data = await firefliesRequest(apiKey, METADATA_QUERY, { limit: BATCH_SIZE, skip });
    const transcripts = data?.transcripts || [];

    if (transcripts.length === 0) {
      console.log("No more transcripts from API, stopping pagination.");
      break;
    }

    // Filter by date first
    let candidates = transcripts;
    if (since) {
      const sinceDate = new Date(since).getTime();
      candidates = candidates.filter((t: any) => {
        const tDate = t.date ? new Date(t.date).getTime() : 0;
        return tDate >= sinceDate;
      });
    }

    // Apply search filter if provided
    if (filterFn) {
      for (const t of candidates) {
        if (filterFn(t)) {
          matches.push(t);
          if (matches.length >= maxMatches) {
            console.log(`Found ${matches.length} matches, stopping pagination.`);
            return matches;
          }
        }
      }
    } else {
      matches.push(...candidates);
      if (matches.length >= maxMatches) {
        return matches.slice(0, maxMatches);
      }
    }

    // If this batch was smaller than BATCH_SIZE, we've reached the end
    if (transcripts.length < BATCH_SIZE) {
      console.log("Last batch (fewer than BATCH_SIZE), stopping pagination.");
      break;
    }

    skip += BATCH_SIZE;
  }

  console.log(`Pagination complete. Total matches: ${matches.length}`);
  return matches;
}

/** Fetch full transcript details for a set of matched IDs */
async function fetchFullTranscripts(apiKey: string, ids: string[]): Promise<any[]> {
  console.log(`Fetching full transcripts for ${ids.length} matched meetings...`);
  const results: any[] = [];

  // Fetch in parallel, 5 at a time
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const promises = batch.map((id) =>
      firefliesRequest(apiKey, FULL_TRANSCRIPT_QUERY, { id })
        .then((data) => data?.transcript)
        .catch((e) => {
          console.error(`Failed to fetch transcript ${id}:`, e);
          return null;
        })
    );
    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

/** Build a filter function from search criteria */
function buildSearchFilter(
  searchEmails: string[],
  searchNames: string[],
  searchDomains: string[],
  searchCompanies: string[],
): ((t: any) => boolean) | null {
  if (searchEmails.length === 0 && searchNames.length === 0 && searchDomains.length === 0 && searchCompanies.length === 0) {
    return null;
  }

  const lowerEmails = searchEmails.map((e) => e.toLowerCase());
  const lowerFullNames = searchNames.map((n) => n.toLowerCase().trim());
  const lowerDomains = searchDomains.map((d) => d.toLowerCase().trim());

  const GENERIC_COMPANY_WORDS = new Set([
    "group", "capital", "partners", "services", "solutions", "inc", "llc",
    "corp", "corporation", "company", "co", "the", "and", "of", "for",
    "holdings", "enterprises", "consulting", "management", "advisors",
    "associates", "global", "international", "home", "health", "tech",
    "financial", "investment", "investments", "properties", "fund", "equity",
  ]);
  const companyWords: string[] = [];
  for (const company of searchCompanies) {
    const words = company.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(
      (w) => w.length >= 4 && !GENERIC_COMPANY_WORDS.has(w)
    );
    companyWords.push(...words);
  }
  companyWords.sort((a, b) => b.length - a.length);

  return (t: any) => {
    const participants = (t.participants || []).map((p: string) => p.toLowerCase());
    const organizerEmail = (t.organizer_email || "").toLowerCase();
    const firefliesUsers = (t.fireflies_users || []).map((u: string) => u.toLowerCase());
    const allEmailFields = [...participants, organizerEmail, ...firefliesUsers].filter(Boolean);
    const titleLower = (t.title || "").toLowerCase();

    // Signal 1: Direct email match
    for (const email of lowerEmails) {
      if (allEmailFields.some((f: string) => f.includes(email))) return true;
    }

    // Signal 2: Company domain match
    for (const domain of lowerDomains) {
      for (const field of allEmailFields) {
        const fieldDomain = extractDomain(field);
        if (fieldDomain && fieldDomain === domain) return true;
      }
    }

    // Signal 3: Full name match with word-boundary + nicknames
    for (const fullName of lowerFullNames) {
      const nameParts = fullName.split(/\s+/).filter((p) => p.length >= 2);
      if (nameParts.length === 0) continue;

      const firstName = nameParts[0];
      const firstNameVariants = getNameVariants(firstName);
      const restParts = nameParts.slice(1);

      const matchesInText = (text: string): boolean => {
        const hasFirstName = firstNameVariants.some((v) => wordBoundaryMatch(text, v));
        if (!hasFirstName) return false;
        return restParts.every((part) => wordBoundaryMatch(text, part));
      };

      if (matchesInText(titleLower)) return true;
      for (const field of allEmailFields) {
        if (matchesInText(field)) return true;
      }

      // Note: speaker name matching requires sentences (full transcript).
      // In metadata-first mode, we match on title + participants + emails.
      // Speaker matching happens if we fall back to non-search mode.
    }

    // Signal 4: Company name match in title or participants
    if (companyWords.length > 0) {
      const distinctiveWord = companyWords[0];
      if (wordBoundaryMatch(titleLower, distinctiveWord)) return true;
      for (const field of allEmailFields) {
        if (wordBoundaryMatch(field, distinctiveWord)) return true;
      }
    }

    return false;
  };
}

async function summarizeTranscript(transcript: string, openaiApiKey: string): Promise<{ summary: string; nextSteps: string }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const limit = body.limit || 100;
    const since = body.since || null;
    const summarize = body.summarize !== false;
    const searchEmails: string[] = body.searchEmails || [];
    const searchNames: string[] = body.searchNames || [];
    const searchDomains: string[] = body.searchDomains || [];
    const searchCompanies: string[] = body.searchCompanies || [];

    const hasSearchCriteria = searchEmails.length > 0 || searchNames.length > 0 || searchDomains.length > 0 || searchCompanies.length > 0;

    console.log(`Fetching Fireflies transcripts (limit: ${limit}, since: ${since}, hasSearch: ${hasSearchCriteria}, searchEmails: ${searchEmails.length}, searchNames: ${searchNames.length}, searchDomains: ${searchDomains.length}, searchCompanies: ${searchCompanies.length})`);

    let fullTranscripts: any[];

    if (hasSearchCriteria) {
      // ── Metadata-first approach: paginate metadata, then fetch full transcripts for matches ──
      const filterFn = buildSearchFilter(searchEmails, searchNames, searchDomains, searchCompanies);
      const metadataMatches = await fetchMetadataPaginated(FIREFLIES_API_KEY, filterFn, limit, since || undefined);
      console.log(`Metadata scan found ${metadataMatches.length} matches. Fetching full transcripts...`);

      if (metadataMatches.length === 0) {
        return new Response(
          JSON.stringify({ meetings: [], count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const matchedIds = metadataMatches.map((t: any) => t.id);
      fullTranscripts = await fetchFullTranscripts(FIREFLIES_API_KEY, matchedIds);
    } else {
      // ── No search criteria: just fetch recent transcripts with full data ──
      const metadataMatches = await fetchMetadataPaginated(FIREFLIES_API_KEY, null, limit, since || undefined);
      const matchedIds = metadataMatches.map((t: any) => t.id);
      fullTranscripts = matchedIds.length > 0
        ? await fetchFullTranscripts(FIREFLIES_API_KEY, matchedIds)
        : [];
    }

    // Process transcripts
    const processed = [];
    for (const t of fullTranscripts) {
      const fullTranscript = t.sentences
        ? t.sentences.map((s: any) => `${s.speaker_name}: ${s.text}`).join("\n")
        : "";

      const attendees = t.participants || [];
      const attendeeEmails = attendees.map((p: string) => p.toLowerCase());

      const nativeSummary = t.summary?.overview || "";
      const nativeNextSteps = t.summary?.action_items || "";
      let summary = nativeSummary;
      let nextSteps = nativeNextSteps;

      if (summarize && fullTranscript.length > 50) {
        try {
          const truncated = fullTranscript.length > 15000
            ? fullTranscript.substring(0, 15000) + "\n\n[Transcript truncated...]"
            : fullTranscript;
          const aiResult = await summarizeTranscript(truncated, OPENAI_API_KEY);
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
