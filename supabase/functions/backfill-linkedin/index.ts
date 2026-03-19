import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 5;
const DELAY_MS = 1200;

// ─── Company Name Utilities ───

function cleanCompanyName(company: string): string {
  return company
    .replace(/\b(LLC|Inc\.?|Corp\.?|Corporation|Ltd\.?|LP|LLP|Group|Holdings|Co\.?|Company|Partners|Capital|Management|Advisors|Advisory)\b/gi, "")
    .replace(/[.,]+$/, "")
    .trim();
}

/** Split concatenated domain-style names: "Imperialcap" → "Imperial Cap", "treatyoakequity" → "Treaty Oak Equity" */
function expandConcatenatedName(name: string): string {
  // Split on camelCase boundaries
  let expanded = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  // If still one word, try common word boundary heuristics
  if (!expanded.includes(" ") && expanded.length > 6) {
    // Try splitting at common business suffixes
    expanded = expanded.replace(/(capital|equity|partners|advisory|advisors|ventures|group|holdings|management|invest|financial|consulting|strategies|solutions)/gi, " $1");
    expanded = expanded.trim();
  }
  return expanded;
}

function extractDomainRoot(input: string | null): string | null {
  if (!input || !input.trim()) return null;
  try {
    let domain = input.trim().toLowerCase();
    if (domain.includes("@")) domain = domain.split("@")[1];
    else if (domain.includes("//")) domain = new URL(domain).hostname;
    domain = domain.replace(/^www\./, "");
    const root = domain.split(".")[0];
    return root && root.length > 2 ? root : null;
  } catch {
    return null;
  }
}

function tokenize(input: string): string[] {
  const words = input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  return [...new Set(words)];
}

function isCompanyMatch(
  snippet: string,
  company: string | null,
  email: string | null,
  companyUrl: string | null,
): boolean {
  const lower = snippet.toLowerCase();
  
  if (company && company.trim()) {
    const clean = cleanCompanyName(company).toLowerCase();
    if (clean && clean.length >= 3 && lower.includes(clean)) return true;
    
    // Try expanded name
    const expanded = expandConcatenatedName(clean).toLowerCase();
    if (expanded !== clean && expanded.length >= 3 && lower.includes(expanded)) return true;
    
    const companyWords = tokenize(clean);
    if (companyWords.length >= 2) {
      const matches = companyWords.filter((w) => lower.includes(w));
      if (matches.length >= Math.ceil(companyWords.length * 0.5)) return true;
    }
    // Also try expanded tokens
    const expandedWords = tokenize(expanded);
    if (expandedWords.length >= 2) {
      const matches = expandedWords.filter((w) => lower.includes(w));
      if (matches.length >= Math.ceil(expandedWords.length * 0.5)) return true;
    }
  }
  
  const emailRoot = extractDomainRoot(email);
  if (emailRoot) {
    if (lower.includes(emailRoot)) return true;
    const expanded = expandConcatenatedName(emailRoot).toLowerCase();
    if (expanded !== emailRoot && lower.includes(expanded)) return true;
    const emailTokens = tokenize(emailRoot);
    if (emailTokens.length >= 2) {
      const matches = emailTokens.filter((w) => lower.includes(w));
      if (matches.length >= Math.ceil(emailTokens.length * 0.5)) return true;
    }
  }
  
  const urlRoot = extractDomainRoot(companyUrl);
  if (urlRoot && urlRoot !== emailRoot) {
    if (lower.includes(urlRoot)) return true;
    const expanded = expandConcatenatedName(urlRoot).toLowerCase();
    if (expanded !== urlRoot && lower.includes(expanded)) return true;
    const urlTokens = tokenize(urlRoot);
    if (urlTokens.length >= 2) {
      const matches = urlTokens.filter((w) => lower.includes(w));
      if (matches.length >= Math.ceil(urlTokens.length * 0.5)) return true;
    }
  }
  
  return false;
}

// ─── LinkedIn Search Helpers ───

function extractLinkedInFromResults(
  organic: Array<{ link?: string; snippet?: string; title?: string }>,
): { linkedinUrl: string | null; snippet: string; allResults: Array<{ url: string; snippet: string }> } {
  const allResults: Array<{ url: string; snippet: string }> = [];
  let firstUrl: string | null = null;
  let firstSnippet = "";
  
  for (const result of organic) {
    if (result.link?.includes("linkedin.com/in/")) {
      const snip = (result.snippet || "") + " " + (result.title || "");
      allResults.push({ url: result.link, snippet: snip });
      if (!firstUrl) {
        firstUrl = result.link;
        firstSnippet = snip;
      }
    }
  }
  return { linkedinUrl: firstUrl, snippet: firstSnippet, allResults };
}

async function serperSearch(
  query: string,
  apiKey: string,
  num = 10,
): Promise<Array<{ link?: string; snippet?: string; title?: string }>> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.organic || [];
}

function extractTitle(snippet: string): string | null {
  let title: string | null = null;
  const titleMatch = snippet.match(/[-–—]\s*(.+?)(?:\s+at\s+|\s+[-–—]\s+|\s*$)/i);
  if (titleMatch) title = titleMatch[1].trim().replace(/\s*[-–—]\s*LinkedIn.*$/i, "").trim();
  if (!title) {
    const match = snippet.match(
      /\b(CEO|CFO|COO|CTO|President|Partner|Managing Director|Vice President|VP|Director|Principal|Founder|Co-Founder|Manager|Associate|Analyst)\b/i,
    );
    if (match) title = match[0];
  }
  return title;
}

function detectMaExperience(snippet: string): boolean {
  const maKeywords = [
    "investment bank", "private equity", "m&a", "corporate development",
    "mergers", "acquisitions", "corp dev", "advisory",
  ];
  const lower = snippet.toLowerCase();
  return maKeywords.some((kw) => lower.includes(kw));
}

/** Build multiple search query variants for a company */
function buildCompanyQueries(name: string, company: string | null): string[] {
  const queries: string[] = [];
  if (!company || !company.trim()) return queries;
  
  const clean = cleanCompanyName(company);
  if (clean) {
    queries.push(`site:linkedin.com/in/ "${name}" "${clean}"`);
  }
  
  // Try expanded concatenated name
  const expanded = expandConcatenatedName(clean || company);
  if (expanded !== clean && expanded.includes(" ")) {
    queries.push(`site:linkedin.com/in/ "${name}" "${expanded}"`);
  }
  
  // Try first significant word only (for very concatenated names)
  const words = tokenize(expanded || clean || company);
  const significantWord = words.find(w => w.length >= 4 && !["the", "and", "for"].includes(w));
  if (significantWord && significantWord !== clean?.toLowerCase()) {
    queries.push(`site:linkedin.com/in/ "${name}" "${significantWord}"`);
  }
  
  return queries;
}

// ─── Multi-Pass LinkedIn Lookup ───

interface LinkedInResult {
  title: string | null;
  linkedinUrl: string | null;
  hasMaExperience: boolean;
  failedCandidates?: Array<{ url: string; snippet: string }>;
}

async function serperLinkedInLookup(
  name: string,
  company: string | null,
  email: string | null,
  companyUrl: string | null,
  apiKey: string,
): Promise<LinkedInResult> {
  const failedCandidates: Array<{ url: string; snippet: string }> = [];
  const seenUrls = new Set<string>();
  
  const addCandidates = (results: Array<{ url: string; snippet: string }>) => {
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        failedCandidates.push(r);
      }
    }
  };
  
  try {
    // Pass 1: Name + Company variants (trust Google)
    const companyQueries = buildCompanyQueries(name, company);
    for (const query of companyQueries) {
      const results = await serperSearch(query, apiKey);
      const extracted = extractLinkedInFromResults(results);
      if (extracted.linkedinUrl) {
        return {
          title: extractTitle(extracted.snippet),
          linkedinUrl: extracted.linkedinUrl,
          hasMaExperience: detectMaExperience(extracted.snippet),
        };
      }
      addCandidates(extracted.allResults);
    }

    // Pass 2: Name + Email domain hint
    const emailRoot = extractDomainRoot(email);
    if (emailRoot && emailRoot.length >= 3) {
      // Try full domain root
      const results = await serperSearch(`site:linkedin.com/in/ "${name}" "${emailRoot}"`, apiKey);
      const extracted = extractLinkedInFromResults(results);
      if (extracted.linkedinUrl) {
        return {
          title: extractTitle(extracted.snippet),
          linkedinUrl: extracted.linkedinUrl,
          hasMaExperience: detectMaExperience(extracted.snippet),
        };
      }
      addCandidates(extracted.allResults);
      
      // Try expanded email domain
      const expandedDomain = expandConcatenatedName(emailRoot);
      if (expandedDomain !== emailRoot && expandedDomain.includes(" ")) {
        const results2 = await serperSearch(`site:linkedin.com/in/ "${name}" "${expandedDomain}"`, apiKey);
        const extracted2 = extractLinkedInFromResults(results2);
        if (extracted2.linkedinUrl) {
          return {
            title: extractTitle(extracted2.snippet),
            linkedinUrl: extracted2.linkedinUrl,
            hasMaExperience: detectMaExperience(extracted2.snippet),
          };
        }
        addCandidates(extracted2.allResults);
      }
    }

    // Pass 3: Name only — REQUIRE company validation, check more results
    {
      const results = await serperSearch(`site:linkedin.com/in/ "${name}"`, apiKey, 10);
      const extracted = extractLinkedInFromResults(results);
      
      for (const candidate of extracted.allResults) {
        if (isCompanyMatch(candidate.snippet, company, email, companyUrl)) {
          return {
            title: extractTitle(candidate.snippet),
            linkedinUrl: candidate.url,
            hasMaExperience: detectMaExperience(candidate.snippet),
          };
        }
      }
      addCandidates(extracted.allResults);
    }
    
    // Pass 3b: Name without quotes (for unusual names)
    const nameParts = name.split(/\s+/).filter(p => p.length >= 2);
    if (nameParts.length >= 2) {
      const results = await serperSearch(`site:linkedin.com/in/ ${name}`, apiKey, 10);
      const extracted = extractLinkedInFromResults(results);
      
      for (const candidate of extracted.allResults) {
        if (isCompanyMatch(candidate.snippet, company, email, companyUrl)) {
          return {
            title: extractTitle(candidate.snippet),
            linkedinUrl: candidate.url,
            hasMaExperience: detectMaExperience(candidate.snippet),
          };
        }
      }
      addCandidates(extracted.allResults);
    }

    return { title: null, linkedinUrl: null, hasMaExperience: false, failedCandidates };
  } catch (e) {
    console.error("LinkedIn lookup failed:", e);
    return { title: null, linkedinUrl: null, hasMaExperience: false, failedCandidates };
  }
}

// ─── AI Arbitration ───

async function aiArbitrate(
  name: string,
  company: string | null,
  email: string | null,
  candidates: Array<{ url: string; snippet: string }>,
  apiKey: string,
): Promise<{ linkedinUrl: string | null; snippet: string }> {
  if (!candidates || candidates.length === 0) return { linkedinUrl: null, snippet: "" };
  
  try {
    const candidateList = candidates
      .map((c, i) => `${i + 1}. URL: ${c.url}\n   Info: ${c.snippet.substring(0, 200)}`)
      .join("\n");

    const prompt = `I need to find the LinkedIn profile for a specific person. Here are the details:

Name: ${name}
Company: ${company || "Unknown"}
Email: ${email || "Unknown"}

Here are LinkedIn profile candidates from a Google search:
${candidateList}

Which candidate (if any) is most likely the correct person? Consider:
- Does the profile snippet mention the same company or a related company?
- Does the job title/industry match what you'd expect?
- Could the company name be abbreviated differently?

Respond with ONLY the number (1, 2, etc.) of the correct match, or "none" if none match. Nothing else.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return { linkedinUrl: null, snippet: "" };

    const data = await response.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();
    
    if (answer === "none" || answer === "0") return { linkedinUrl: null, snippet: "" };
    
    const num = parseInt(answer);
    if (num >= 1 && num <= candidates.length) {
      return { linkedinUrl: candidates[num - 1].url, snippet: candidates[num - 1].snippet };
    }
    
    return { linkedinUrl: null, snippet: "" };
  } catch (e) {
    console.error("AI arbitration failed:", e);
    return { linkedinUrl: null, snippet: "" };
  }
}

// ─── Seniority Scoring ───

function getSeniorityScore(title: string | null): number {
  if (!title) return -2;
  const lower = title.toLowerCase();
  if (/\b(managing director|partner|ceo|president|chief|founder|co-founder)\b/.test(lower)) return 20;
  if (/\b(vp|vice president|director|principal)\b/.test(lower)) return 16;
  if (/\b(manager|associate|senior associate)\b/.test(lower)) return 10;
  if (/\b(analyst|junior|assistant)\b/.test(lower)) return 5;
  return 8;
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");
  if (!SERPER_API_KEY) {
    return new Response(JSON.stringify({ error: "SERPER_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Step 0: Extract LinkedIn URLs already stored in company_url
    const { data: linkedinInCompanyUrl } = await supabase
      .from("leads")
      .select("id, company_url")
      .is("linkedin_url", null)
      .like("company_url", "%linkedin.com/in/%");
    
    if (linkedinInCompanyUrl && linkedinInCompanyUrl.length > 0) {
      for (const lead of linkedinInCompanyUrl) {
        await supabase.from("leads").update({ linkedin_url: lead.company_url }).eq("id", lead.id);
      }
      console.log(`Extracted ${linkedinInCompanyUrl.length} LinkedIn URLs from company_url field`);
    }

    // Get all leads still missing LinkedIn URL
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, company, email, company_url, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience")
      .is("linkedin_url", null)
      .neq("name", "")
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    // Filter out single-name leads (can't reliably find on LinkedIn)
    const validLeads = (leads || []).filter(l => l.name.split(/\s+/).filter((p: string) => p.length >= 2).length >= 2);
    
    if (validLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No leads need LinkedIn backfill" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Backfilling LinkedIn for ${validLeads.length} leads (skipped ${(leads || []).length - validLeads.length} single-name leads)`);
    let found = 0;
    let aiFound = 0;
    let processed = 0;

    for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
      const batch = validLeads.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (lead) => {
          const result = await serperLinkedInLookup(
            lead.name,
            lead.company,
            lead.email,
            lead.company_url,
            SERPER_API_KEY,
          );
          return { lead, result };
        }),
      );

      for (const { lead, result } of results) {
        processed++;
        let finalUrl = result.linkedinUrl;
        let finalTitle = result.title;
        let finalMa = result.hasMaExperience;

        // AI arbitration for failed candidates
        if (!finalUrl && result.failedCandidates?.length && LOVABLE_API_KEY) {
          const aiResult = await aiArbitrate(
            lead.name,
            lead.company,
            lead.email,
            result.failedCandidates,
            LOVABLE_API_KEY,
          );
          if (aiResult.linkedinUrl) {
            finalUrl = aiResult.linkedinUrl;
            finalTitle = extractTitle(aiResult.snippet);
            finalMa = detectMaExperience(aiResult.snippet);
            aiFound++;
          }
        }

        if (!finalUrl && !finalTitle) {
          // Mark as searched so we don't retry — use empty string vs NULL
          await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
          continue;
        }
        found++;

        let seniorityScoreValue = getSeniorityScore(finalTitle);
        if (finalMa) seniorityScoreValue += 2;
        seniorityScoreValue = Math.max(-2, Math.min(20, seniorityScoreValue));

        const oldLinkedinScore = lead.linkedin_score || 0;
        const oldStage2 = lead.stage2_score || 0;
        const newStage2 = Math.max(0, Math.min(100, oldStage2 - oldLinkedinScore + seniorityScoreValue));

        await supabase.from("leads").update({
          linkedin_url: finalUrl,
          linkedin_title: finalTitle,
          linkedin_ma_experience: finalMa,
          linkedin_score: seniorityScoreValue,
          seniority_score: seniorityScoreValue,
          stage2_score: newStage2,
        }).eq("id", lead.id);
      }

      if (i + BATCH_SIZE < validLeads.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    console.log(`Backfill complete: ${found} found (${aiFound} via AI) out of ${processed} leads`);
    return new Response(
      JSON.stringify({ success: true, processed, found, aiFound, total: validLeads.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-linkedin error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
