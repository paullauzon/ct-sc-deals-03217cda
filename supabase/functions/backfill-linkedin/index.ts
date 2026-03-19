import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 5;
const DELAY_MS = 1000; // 1s between batches to respect rate limits

function cleanCompanyName(company: string): string {
  return company
    .replace(/\b(LLC|Inc\.?|Corp\.?|Corporation|Ltd\.?|LP|LLP|Group|Holdings|Co\.?|Company|Partners|Capital|Management|Advisors|Advisory)\b/gi, "")
    .replace(/[.,]+$/, "")
    .trim();
}

function extractLinkedInFromResults(organic: Array<{ link?: string; snippet?: string; title?: string }>): { linkedinUrl: string | null; snippet: string } {
  for (const result of organic) {
    if (result.link?.includes("linkedin.com/in/")) {
      const snippet = (result.snippet || "") + " " + (result.title || "");
      return { linkedinUrl: result.link, snippet };
    }
  }
  return { linkedinUrl: null, snippet: "" };
}

async function serperSearch(query: string, apiKey: string): Promise<Array<{ link?: string; snippet?: string; title?: string }>> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.organic || [];
}

async function serperLinkedInLookup(
  name: string,
  company: string | null,
  apiKey: string,
): Promise<{ title: string | null; linkedinUrl: string | null; hasMaExperience: boolean }> {
  try {
    let linkedinUrl: string | null = null;
    let snippet = "";

    // Pass 1: Search with company name
    if (company && company.trim()) {
      const cleanCo = cleanCompanyName(company);
      const query = cleanCo ? `site:linkedin.com/in/ "${name}" "${cleanCo}"` : `site:linkedin.com/in/ "${name}"`;
      const results = await serperSearch(query, apiKey);
      const extracted = extractLinkedInFromResults(results);
      linkedinUrl = extracted.linkedinUrl;
      snippet = extracted.snippet;
    }

    // Pass 2: Fallback — search without company
    if (!linkedinUrl) {
      const results = await serperSearch(`site:linkedin.com/in/ "${name}"`, apiKey);
      const extracted = extractLinkedInFromResults(results);
      linkedinUrl = extracted.linkedinUrl;
      snippet = extracted.snippet;
    }

    if (!linkedinUrl) return { title: null, linkedinUrl: null, hasMaExperience: false };

    let title: string | null = null;
    const titleMatch = snippet.match(/[-–—]\s*(.+?)(?:\s+at\s+|\s+[-–—]\s+|\s*$)/i);
    if (titleMatch) title = titleMatch[1].trim().replace(/\s*[-–—]\s*LinkedIn.*$/i, "").trim();
    if (!title) {
      const match = snippet.match(/\b(CEO|CFO|COO|CTO|President|Partner|Managing Director|Vice President|VP|Director|Principal|Founder|Co-Founder|Manager|Associate|Analyst)\b/i);
      if (match) title = match[0];
    }

    const maKeywords = ["investment bank", "private equity", "m&a", "corporate development", "mergers", "acquisitions", "corp dev", "advisory"];
    const hasMaExperience = maKeywords.some((kw) => snippet.toLowerCase().includes(kw));

    return { title, linkedinUrl, hasMaExperience };
  } catch (e) {
    console.error("LinkedIn lookup failed:", e);
    return { title: null, linkedinUrl: null, hasMaExperience: false };
  }
}

function getSeniorityScore(title: string | null): number {
  if (!title) return -2;
  const lower = title.toLowerCase();
  if (/\b(managing director|partner|ceo|president|chief|founder|co-founder)\b/.test(lower)) return 20;
  if (/\b(vp|vice president|director|principal)\b/.test(lower)) return 16;
  if (/\b(manager|associate|senior associate)\b/.test(lower)) return 10;
  if (/\b(analyst|junior|assistant)\b/.test(lower)) return 5;
  return 8;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");
  if (!SERPER_API_KEY) {
    return new Response(JSON.stringify({ error: "SERPER_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Get all leads missing LinkedIn URL
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, company, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience")
      .is("linkedin_url", null)
      .neq("name", "")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No leads need LinkedIn backfill" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Backfilling LinkedIn for ${leads.length} leads`);
    let found = 0;
    let processed = 0;

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (lead) => {
          const result = await serperLinkedInLookup(lead.name, lead.company, SERPER_API_KEY);
          return { lead, result };
        }),
      );

      for (const { lead, result } of results) {
        processed++;
        if (!result.linkedinUrl && !result.title) continue;
        found++;

        // Recalculate seniority and stage2 scores
        let seniorityScoreValue = getSeniorityScore(result.title);
        if (result.hasMaExperience) seniorityScoreValue += 2;
        seniorityScoreValue = Math.max(-2, Math.min(20, seniorityScoreValue));

        const oldLinkedinScore = lead.linkedin_score || 0;
        const oldStage2 = lead.stage2_score || 0;
        const newStage2 = Math.max(0, Math.min(100, oldStage2 - oldLinkedinScore + seniorityScoreValue));

        await supabase.from("leads").update({
          linkedin_url: result.linkedinUrl,
          linkedin_title: result.title,
          linkedin_ma_experience: result.hasMaExperience,
          linkedin_score: seniorityScoreValue,
          seniority_score: seniorityScoreValue,
          stage2_score: newStage2,
        }).eq("id", lead.id);
      }

      // Rate limit between batches
      if (i + BATCH_SIZE < leads.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    console.log(`Backfill complete: ${found} LinkedIn profiles found out of ${processed} leads`);
    return new Response(JSON.stringify({ success: true, processed, found, total: leads.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("backfill-linkedin error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
