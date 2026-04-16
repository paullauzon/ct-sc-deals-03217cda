import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;
const DELAY_MS = 2000;
const FLASH_MAX_TURNS = 7;
const MAX_LEADS_PER_RUN = 10;
const MAX_AUTO_CHAINS = 3; // up to 30 leads per button press

// ─── Company Cache (shared across batch) ───
interface CompanyCacheEntry {
  linkedinPage?: string;
  websiteLinks?: string[];
  employeeSlugs?: string[];
}
type CompanyCache = Map<string, CompanyCacheEntry>;

// ─── Fuzzy Company Name Matching ───
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.'"""'']/g, "")
    .replace(/\b(inc|incorporated|llc|llp|ltd|limited|corp|corporation|co|company|group|holdings|partners|lp|plc|gmbh|ag|sa|nv|bv)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyCompanyMatch(a: string, b: string): boolean {
  const normA = normalizeCompanyName(a);
  const normB = normalizeCompanyName(b);
  if (normA === normB) return true;
  if (!normA || !normB) return false;
  // Check if one contains the other
  if (normA.includes(normB) || normB.includes(normA)) return true;
  // Word overlap: 2+ shared significant words
  const wordsA = normA.split(" ").filter(w => w.length >= 3);
  const wordsB = normB.split(" ").filter(w => w.length >= 3);
  const shared = wordsA.filter(w => wordsB.includes(w));
  return shared.length >= 2 || (shared.length >= 1 && Math.max(wordsA.length, wordsB.length) <= 2);
}


// ─── Firecrawl Search (v2 + 429 retry) ───

interface SearchResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
}

async function firecrawlFetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1,
): Promise<Response> {
  let res = await fetch(url, options);
  if (res.status === 429 && retries > 0) {
    console.warn(`  Firecrawl 429 rate limit — retrying in 3s...`);
    await new Promise(r => setTimeout(r, 3000));
    res = await fetch(url, options);
  }
  return res;
}

async function firecrawlSearch(
  query: string,
  apiKey: string,
  limit = 5,
  scrape = true,
): Promise<SearchResult[]> {
  try {
    const body: Record<string, unknown> = { query, limit };
    if (scrape) {
      body.scrapeOptions = { formats: ["markdown"] };
    }

    const res = await firecrawlFetchWithRetry("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Firecrawl search error ${res.status}: ${errText}`);
      return [];
    }

    const data = await res.json();
    const raw = data.data || data.results || [];
    const results = Array.isArray(raw) ? raw : [];
    return results.map((r: any) => ({
      url: r.url || "",
      title: r.title || "",
      description: r.description || "",
      markdown: r.markdown || "",
    }));
  } catch (e) {
    console.error("Firecrawl search failed:", e);
    return [];
  }
}


// ─── Firecrawl Scrape (single URL, v2 + 429 retry) ───

async function firecrawlScrape(
  url: string,
  apiKey: string,
): Promise<string> {
  try {
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

    const res = await firecrawlFetchWithRetry("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown", "links"],
        onlyMainContent: false,
        waitFor: 3000,
      }),
    });

    if (!res.ok) {
      console.error(`Firecrawl scrape error ${res.status}`);
      return "";
    }

    const data = await res.json();
    const markdown = data.data?.markdown || data.markdown || "";
    const links = data.data?.links || data.links || [];
    
    const linkedinLinks = links.filter((l: string) => l.includes("linkedin.com/in/"));
    if (linkedinLinks.length > 0) {
      return markdown + "\n\nLinkedIn profile links found on page:\n" + linkedinLinks.join("\n");
    }
    return markdown;
  } catch (e) {
    console.error("Firecrawl scrape failed:", e);
    return "";
  }
}

// ─── AI Call Helper (OpenAI with Lovable AI Gateway fallback) ───

async function callAI(
  messages: Array<{ role: string; content: string }>,
  openaiKey: string,
  model: string,
): Promise<string> {
  // Try OpenAI first
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });
    if (res.status === 429 && attempt < 2) {
      const delays = [2000, 5000];
      const delay = delays[attempt];
      console.warn(`  OpenAI 429 — retrying in ${delay / 1000}s (attempt ${attempt + 1}/3)...`);
      await res.text();
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    if (res.status === 429 && attempt === 2) {
      // All OpenAI retries exhausted — fall back to Lovable AI Gateway
      await res.text();
      break;
    }
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  }

  // Phase C: Fallback to Lovable AI Gateway (Gemini)
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("OpenAI 429 after 3 retries and no LOVABLE_API_KEY for fallback");
  }
  
  const fallbackModel = model.includes("4o-mini") ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro";
  console.warn(`  OpenAI exhausted — falling back to Lovable AI (${fallbackModel})`);
  
  const fallbackRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: fallbackModel, messages }),
  });
  
  if (!fallbackRes.ok) {
    const errText = await fallbackRes.text();
    throw new Error(`Lovable AI fallback HTTP ${fallbackRes.status}: ${errText}`);
  }
  
  const fallbackData = await fallbackRes.json();
  return (fallbackData.choices?.[0]?.message?.content || "").trim();
}

// ─── Firecrawl Map (discover URLs on a site) ───

async function firecrawlMap(
  url: string,
  apiKey: string,
  search?: string,
  limit = 100,
): Promise<string[]> {
  try {
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

    const res = await firecrawlFetchWithRetry("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        ...(search ? { search } : {}),
        limit,
        includeSubdomains: false,
      }),
    });

    if (!res.ok) {
      console.error(`Firecrawl map error ${res.status}`);
      return [];
    }

    const data = await res.json();
    const links = data.links || data.data || [];
    return Array.isArray(links) ? links : [];
  } catch (e) {
    console.error("Firecrawl map failed:", e);
    return [];
  }
}

// ─── AI Search Agent ───

interface LeadContext {
  name: string;
  company: string | null;
  email: string | null;
  companyUrl: string | null;
  websiteUrl: string | null;
  role: string | null;
  message: string | null;
  buyerType: string | null;
  serviceInterest: string | null;
  dealsPlanned: string | null;
  targetCriteria: string | null;
  targetRevenue: string | null;
  geography: string | null;
}

// ─── Pre-Search Rationalization ───

interface RationalizationResult {
  name_variants: string[];
  company_variants: string[];
  email_inference: { first_initial: string; likely_names: string[] } | null;
  linkedin_slug_guesses: string[];
  best_search_queries: string[];
  confidence_notes: string;
  confidence_level?: "high" | "medium" | "low";
}

async function rationalizeLead(
  lead: LeadContext,
  openaiKey: string,
): Promise<RationalizationResult | null> {
  const contextParts: string[] = [];
  contextParts.push(`Name: ${lead.name}`);
  if (lead.company) contextParts.push(`Company: ${lead.company}`);
  if (lead.email) contextParts.push(`Email: ${lead.email}`);
  if (lead.companyUrl) contextParts.push(`Company URL: ${lead.companyUrl}`);
  if (lead.websiteUrl) contextParts.push(`Website: ${lead.websiteUrl}`);
  if (lead.role) contextParts.push(`Role: ${lead.role}`);
  if (lead.geography) contextParts.push(`Geography: ${lead.geography}`);

  const prompt = `You are a pre-search analyst. Given a person's data, produce a structured search plan for finding their LinkedIn profile. Think step-by-step about who this person really is before any search happens.

PERSON DATA:
${contextParts.join("\n")}

ANALYSIS RULES:
1. NICKNAME EXPANSION: If the first name is a common nickname, list ALL formal/legal name variants. Common mappings include but aren't limited to:
   Woody→William/Woodrow, Bill/Billy→William, Bob/Bobby→Robert, Dick→Richard, Ted→Edward/Theodore, Chuck→Charles, Jack→John/Jackson, Jim/Jimmy→James, Mike→Michael, Joe→Joseph, Tom/Tommy→Thomas, Dave→David, Dan→Daniel, Pat→Patrick/Patricia, Chris→Christopher/Christine, Alex→Alexander/Alexandra, Sam→Samuel/Samantha, Ben→Benjamin, Matt→Matthew, Nick→Nicholas, Rick/Ricky→Richard, Steve→Stephen/Steven, Andy→Andrew, Tony→Anthony, Larry→Lawrence, Jerry→Gerald/Jerome, Terry→Terrence/Teresa, Jeff→Jeffrey, Greg→Gregory, Phil→Philip, Ron→Ronald, Ray→Raymond, Ken→Kenneth, Don→Donald, Hank→Henry, Peggy→Margaret, Beth→Elizabeth, Kate/Katie→Katherine, Liz→Elizabeth, Maggie→Margaret, Sally→Sarah, Jenny→Jennifer, Molly→Mary, Patty→Patricia, Sandy→Sandra, Barb→Barbara, Meg→Margaret, Sue→Susan, Vicky→Victoria, Wendy→Gwendolyn, Penny→Penelope, Cathy→Catherine, Debbie→Deborah, Cindy→Cynthia, Nancy→Ann/Anne, Mandy→Amanda

2. EMAIL USERNAME ANALYSIS: Parse the email username carefully:
   - "wcissel@" → first initial is "w", surname is "cissel" → likely names starting with W (William, Walter, Warren, Wesley, Wayne, etc.)
   - "jsmith@" → first initial is "j" → James, John, Joseph, Jeffrey, etc.
   - "firstname.lastname@" → confirms exact spelling
   - "flastname@" or "firstl@" → extract initial + name fragment

3. COMPANY NAME NORMALIZATION: Break concatenated names into words (e.g., "Treatyoakequity" → "Treaty Oak Equity"), expand abbreviations, consider DBA names

4. DOMAIN CROSS-REFERENCE: If email domain differs from company URL domain, note this — both are valid search signals

5. SEARCH QUERY GENERATION: Produce 2-3 ranked search queries from most-to-least specific. Always include:
   - A query using the MOST LIKELY legal/formal name with company
   - A query using the original name as given
   Format: "FirstName LastName" OR "VariantName" "Company" site:linkedin.com/in

6. LINKEDIN SLUG GUESSES: Common patterns: firstnamelastname, flastname, firstname-lastname, firstlast

7. CONFIDENCE LEVEL: Assess "high" (unique name + clear company), "medium" (common name or ambiguous company), or "low" (very common name, no company, personal email)

Respond with ONLY a JSON object:
{
  "name_variants": ["formal/legal name variants to search"],
  "company_variants": ["company name variants"],
  "email_inference": {"first_initial": "x", "likely_names": ["Name1", "Name2"]} or null,
  "linkedin_slug_guesses": ["possible-slug-1", "possible-slug-2"],
  "best_search_queries": ["query1 site:linkedin.com/in", "query2 site:linkedin.com/in"],
  "confidence_notes": "Brief reasoning about name/company analysis",
  "confidence_level": "high"|"medium"|"low"
}`;

  try {
    const content = await callAI(
      [{ role: "user", content: prompt }],
      openaiKey,
      "gpt-4o-mini",
    );

    const jsonStr = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    console.log(`  Rationalization: ${parsed.confidence_notes}`);
    console.log(`  Name variants: ${(parsed.name_variants || []).join(", ")}`);
    console.log(`  Confidence: ${parsed.confidence_level || "unknown"}`);
    return parsed as RationalizationResult;
  } catch (e) {
    console.error(`  Rationalization failed:`, e);
    return null;
  }
}

// ─── Inline Verification ───

async function inlineVerify(
  lead: LeadContext,
  linkedinUrl: string,
  linkedinSnippet: string,
  openaiKey: string,
): Promise<{ verdict: "correct" | "wrong" | "uncertain"; reason: string }> {
  const contextParts: string[] = [];
  if (lead.company) contextParts.push(`Company: ${lead.company}`);
  if (lead.email) contextParts.push(`Email: ${lead.email}`);
  if (lead.companyUrl) contextParts.push(`Company URL: ${lead.companyUrl}`);
  if (lead.role) contextParts.push(`Role: ${lead.role}`);

  const prompt = `You are verifying whether a LinkedIn profile URL belongs to the correct person. Be strict — only say "correct" if the LinkedIn snippet clearly matches.

PERSON TO FIND:
Name: ${lead.name}
${contextParts.join("\n")}

LINKEDIN MATCH:
URL: ${linkedinUrl}
Snippet: ${linkedinSnippet || "No snippet available"}

RULES:
- The LinkedIn profile MUST be for someone at the SAME company (or a clearly related entity).
- If the email domain matches the LinkedIn company, that's a strong signal for CORRECT.
- Consider company name abbreviations (e.g., "GMAX" vs "G-Max Industries").
- If the LinkedIn URL contains a completely different name, that's WRONG.
- If not enough info to verify, say "uncertain".

Respond with ONLY: {"verdict": "correct"|"wrong"|"uncertain", "reason": "brief explanation"}`;

  try {
    const content = await callAI(
      [{ role: "user", content: prompt }],
      openaiKey,
      "gpt-4o-mini",
    );
    const jsonStr = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    return { verdict: parsed.verdict || "uncertain", reason: parsed.reason || "" };
  } catch (e) {
    console.error(`  Inline verify error:`, e);
    return { verdict: "uncertain", reason: "Parse error" };
  }
}

// ─── Direct LinkedIn URL Guessing ───

async function tryDirectSlugGuess(
  slugs: string[],
  lead: LeadContext,
  firecrawlKey: string,
  openaiKey: string,
): Promise<{ url: string; snippet: string } | null> {
  for (const slug of slugs.slice(0, 4)) {
    const candidateUrl = `https://www.linkedin.com/in/${slug}`;
    console.log(`  Direct slug guess: ${candidateUrl}`);
    
    // Search for the slug to get snippet (scraping LinkedIn directly usually fails)
    const results = await firecrawlSearch(`"${slug}" site:linkedin.com/in`, firecrawlKey, 2, false);
    const match = results.find(r => r.url.includes(`/in/${slug}`));
    
    if (match) {
      const snippet = `${match.title || ""} ${match.description || ""}`;
      // Check if company name appears in snippet
      const companyLower = lead.company?.toLowerCase() || "";
      if (companyLower && snippet.toLowerCase().includes(companyLower)) {
        console.log(`  Direct slug HIT: ${match.url} (company match in snippet)`);
        return { url: match.url.split("?")[0], snippet };
      }
    }
  }
  return null;
}

// ─── Email Signature LinkedIn Mining ───

async function mineEmailSignatures(
  leadId: string,
  lead: LeadContext,
  supabase: any,
  openaiKey: string,
): Promise<{ url: string; snippet: string } | null> {
  try {
    const { data: emails } = await supabase
      .from("lead_emails")
      .select("body_preview")
      .eq("lead_id", leadId)
      .not("body_preview", "is", null)
      .limit(20);

    if (!emails || emails.length === 0) return null;

    for (const email of emails) {
      const body = email.body_preview || "";
      // Match linkedin.com/in/slug patterns
      const matches = body.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/gi);
      if (matches && matches.length > 0) {
        const url = matches[0].replace(/\/$/, "").split("?")[0];
        console.log(`  Email signature LinkedIn URL found: ${url}`);
        
        // Verify it belongs to this person
        const verification = await inlineVerify(lead, url, `Found in email signature from ${lead.name}`, openaiKey);
        if (verification.verdict !== "wrong") {
          console.log(`  Email signature URL verified (${verification.verdict}): ${url}`);
          return { url, snippet: `Email signature match — ${verification.reason}` };
        } else {
          console.log(`  Email signature URL rejected: ${verification.reason}`);
        }
      }
    }
    return null;
  } catch (e) {
    console.error(`  Email signature mining failed:`, e);
    return null;
  }
}

interface AgentResult {
  url: string | null;
  profileContent: string;
  turnsUsed: number;
  gaveUpReason: string | null;
  snippet?: string;
}

function buildSystemPrompt(maxTurns: number): string {
  return `You are a LinkedIn research assistant. Your job is to find a specific person's LinkedIn profile URL.

You have access to these tools. Each turn, you choose ONE action, then I'll give you the results. You get up to ${maxTurns} turns.

TOOLS AVAILABLE:
1. **search** — Web search via Firecrawl. Good for broad queries.
   Response format: {"action": "search", "query": "your search query here"}

2. **scrape** — Scrape a specific URL to read its full content. Use this to:
   - Read a company's LinkedIn page (linkedin.com/company/...) to find employees
   - Read a company's /about or /team page to find LinkedIn links
   - Verify a LinkedIn profile by reading its content
   Response format: {"action": "scrape", "url": "https://example.com/team"}

3. **found** — You've found the LinkedIn profile URL.
   Response format: {"action": "found", "url": "https://linkedin.com/in/...", "confidence": "high"}

4. **give_up** — You can't find the profile.
   Response format: {"action": "give_up", "reason": "brief explanation"}

RESPONSE FORMAT — respond with ONLY a JSON object, no markdown, no explanation.

PRIORITY STRATEGIES (try these FIRST for small/niche companies):
A. COMPANY LINKEDIN PAGE: Search "CompanyName site:linkedin.com/company", then SCRAPE the company's LinkedIn page (e.g., linkedin.com/company/companyname/people or /about) to find the person among employees
B. EMAIL INITIALS INFERENCE: If the person's email is firstname.lastname@domain, try searching for their initials as a LinkedIn slug (e.g., ellie.burei → try "emb" or "eb" combined with company name, or directly try linkedin.com/in/emb* variations)
C. COMPANY WEBSITE TEAM PAGE: If they have a company_url, SCRAPE that URL's /about or /team page to find LinkedIn links directly

GENERAL SEARCH STRATEGIES (use your judgment on which to try):
1. Direct search: "FirstName LastName" "Company" site:linkedin.com/in
2. If company name looks concatenated (e.g. "Treatyoakequity"), break it into words: "Treaty Oak Equity"
3. Use the email domain to infer the real company name (e.g. hanacovc.com → "Hanaco Ventures")
4. Search WITHOUT site: restriction: "Name" "Company" linkedin — catches third-party mentions
5. Search for the company on LinkedIn first, then look for the person among results
6. Try common nicknames (Michael→Mike, Robert→Bob, William→Bill, etc.)
7. If the email domain is a company, scrape it to find team/about pages
8. If all else fails, try just the person's name with their city/geography

VERIFICATION RULES (before saying "found"):
- The LinkedIn URL slug does NOT need to match the person's name — many people use initials, numbers, or random slugs (e.g., "emb339" for "Ellie M. Burei", "jsmith42" for "John Smith")
- Instead, verify by reading the search snippet or SCRAPING the LinkedIn profile to confirm the person's NAME and COMPANY match
- If a search result shows the right name + company but has an unusual slug, that's CORRECT
- The profile's company/role context must align with the lead's data
- If the email domain is "xyz.com" and the LinkedIn shows a completely different company, that's wrong
- When in doubt, SCRAPE the LinkedIn profile to verify the person's details
- When in doubt, try another search rather than guessing

WHEN TO GIVE UP:
- NEVER give up before trying ALL three priority strategies (A, B, C above)
- Person appears to use a disposable/privacy email (mozmail.com, guerrillamail, etc.)
- No real company information available
- After trying company LinkedIn page scrape AND email initials AND multiple search variations with no results
- The person is clearly too obscure to have a findable LinkedIn profile

IMPORTANT: Do NOT give up just because direct name searches fail. Many people have non-obvious LinkedIn slugs. You MUST try the company LinkedIn page (strategy A) and email initials (strategy B) before giving up.`;
}

async function aiSearchAgent(
  lead: LeadContext,
  firecrawlKey: string,
  openaiKey: string,
  model: string = "gpt-4o-mini",
  maxTurns: number = FLASH_MAX_TURNS,
  rationalization: RationalizationResult | null = null,
  _deprecated_serperKey: string | null = null, // kept for signature compat
  previousSearchLog: any = null,
  companyCache: CompanyCache | null = null,
  supabaseForCrossLead: any = null,
): Promise<AgentResult> {
  const contextParts: string[] = [];
  contextParts.push(`Name: ${lead.name}`);
  if (lead.company) contextParts.push(`Company: ${lead.company}`);
  if (lead.email) contextParts.push(`Email: ${lead.email}`);
  if (lead.companyUrl) contextParts.push(`Company URL: ${lead.companyUrl}`);
  if (lead.websiteUrl) contextParts.push(`Website: ${lead.websiteUrl}`);
  if (lead.role) contextParts.push(`Role: ${lead.role}`);
  if (lead.buyerType) contextParts.push(`Buyer Type: ${lead.buyerType}`);
  if (lead.serviceInterest) contextParts.push(`Service Interest: ${lead.serviceInterest}`);
  if (lead.geography) contextParts.push(`Geography: ${lead.geography}`);
  if (lead.dealsPlanned) contextParts.push(`Deals Planned: ${lead.dealsPlanned}`);
  if (lead.targetCriteria) contextParts.push(`Target Criteria: ${lead.targetCriteria}`);
  if (lead.targetRevenue) contextParts.push(`Target Revenue: ${lead.targetRevenue}`);
  if (lead.message) contextParts.push(`Submission Message: "${lead.message.substring(0, 600)}"`);

  // ─── Rationalization-driven quick-match ───
  if (rationalization && rationalization.best_search_queries?.length > 0) {
    for (const query of rationalization.best_search_queries.slice(0, 2)) {
      console.log(`  Quick-match search: ${query}`);
      const results = await firecrawlSearch(query, firecrawlKey, 5, false);
      const linkedinResults = results.filter(r => r.url.includes("linkedin.com/in/"));
      
      if (linkedinResults.length > 0) {
        const companyVariants = [
          lead.company?.toLowerCase(),
          ...(rationalization.company_variants || []).map(c => c.toLowerCase()),
        ].filter(Boolean) as string[];
        
        for (const result of linkedinResults) {
          const snippet = `${result.title || ""} ${result.description || ""}`.toLowerCase();
          const companyMatch = companyVariants.some(cv => snippet.includes(cv)) || companyVariants.some(cv => fuzzyCompanyMatch(cv, snippet.substring(0, 200)));
          const allNames = [lead.name, ...(rationalization.name_variants || [])];
          const lastName = lead.name.split(/\s+/).pop()?.toLowerCase() || "";
          const nameMatch = lastName && snippet.includes(lastName);
          
          if (companyMatch && nameMatch) {
            const url = result.url.split("?")[0];
            const snippetFull = `${result.title || ""} ${result.description || ""}`;
            console.log(`  Quick-match candidate: ${url} — running inline verification...`);
            
            // A: Add inline verification to quick-match path
            const verification = await inlineVerify(lead, url, snippetFull, openaiKey);
            if (verification.verdict === "wrong") {
              console.log(`  Quick-match REJECTED by inline verify: ${verification.reason}`);
              continue; // try next result
            }
            console.log(`  Quick-match VERIFIED (${verification.verdict}): ${url}`);
            return { url, profileContent: "", turnsUsed: 0, gaveUpReason: null, snippet: snippetFull };
          }
        }
      }
      
      // Firecrawl retry fallback for quick-match if first search found nothing
      if (linkedinResults.length === 0) {
        console.log(`  Quick-match Firecrawl retry: ${query}`);
        const retryResults = await firecrawlSearch(query, firecrawlKey, 5, false);
        const retryLinkedins = retryResults.filter(r => r.url.includes("linkedin.com/in/"));
        
        const companyVariants = [
          lead.company?.toLowerCase(),
          ...(rationalization.company_variants || []).map(c => c.toLowerCase()),
        ].filter(Boolean) as string[];
        
        for (const result of retryLinkedins) {
          const snippet = `${result.title || ""} ${result.description || ""}`.toLowerCase();
          const companyMatch = companyVariants.some(cv => snippet.includes(cv)) || companyVariants.some(cv => fuzzyCompanyMatch(cv, snippet.substring(0, 200)));
          const lastName = lead.name.split(/\s+/).pop()?.toLowerCase() || "";
          const nameMatch = lastName && snippet.includes(lastName);
          
          if (companyMatch && nameMatch) {
            const url = result.url.split("?")[0];
            const snippetFull = `${result.title || ""} ${result.description || ""}`;
            console.log(`  Quick-match retry candidate: ${url} — running inline verification...`);
            
            const verification = await inlineVerify(lead, url, snippetFull, openaiKey);
            if (verification.verdict === "wrong") {
              console.log(`  Quick-match retry REJECTED: ${verification.reason}`);
              continue;
            }
            console.log(`  Quick-match retry VERIFIED (${verification.verdict}): ${url}`);
            return { url, profileContent: "", turnsUsed: 0, gaveUpReason: null, snippet: snippetFull };
          }
        }
      }
    }
  }

  // ─── Pre-execute priority strategies programmatically ───
  const preSearchResults: string[] = [];
  const preSearchQueriesDone: string[] = [];

  // Inject rationalization context
  if (rationalization) {
    const ratContext: string[] = [];
    if (rationalization.name_variants.length > 0) {
      ratContext.push(`KNOWN NAME VARIANTS (from AI analysis): ${rationalization.name_variants.join(", ")}`);
    }
    if (rationalization.company_variants.length > 0) {
      ratContext.push(`COMPANY VARIANTS: ${rationalization.company_variants.join(", ")}`);
    }
    if (rationalization.email_inference) {
      ratContext.push(`EMAIL ANALYSIS: First initial "${rationalization.email_inference.first_initial}", likely formal names: ${rationalization.email_inference.likely_names.join(", ")}`);
    }
    if (rationalization.linkedin_slug_guesses.length > 0) {
      ratContext.push(`LIKELY LINKEDIN SLUGS: ${rationalization.linkedin_slug_guesses.join(", ")}`);
    }
    ratContext.push(`ANALYSIS NOTES: ${rationalization.confidence_notes}`);
    preSearchResults.push(`AI RATIONALIZATION (use these name variants in your searches!):\n${ratContext.join("\n")}`);
  }

  // C: Inject previous search log if retrying
  if (previousSearchLog) {
    const prevParts: string[] = [];
    if (previousSearchLog.fail_reason) {
      prevParts.push(`PREVIOUS FAILURE REASON: ${previousSearchLog.fail_reason}`);
    }
    if (previousSearchLog.rationalization?.queries_tried?.length > 0) {
      prevParts.push(`PREVIOUSLY TRIED QUERIES (DO NOT repeat these):\n${previousSearchLog.rationalization.queries_tried.join("\n")}`);
    }
    if (previousSearchLog.turns_used) {
      prevParts.push(`Previous attempt used ${previousSearchLog.turns_used} turns.`);
    }
    if (prevParts.length > 0) {
      preSearchResults.push(`PREVIOUS SEARCH ATTEMPT (use this to try NEW strategies):\n${prevParts.join("\n")}`);
    }
  }

  // Strategy A: Search company LinkedIn page for employees (with cache)
  const companyCacheKey = lead.company ? normalizeCompanyName(lead.company) : "";
  const cachedCompany = companyCacheKey && companyCache ? companyCache.get(companyCacheKey) : undefined;
  
  if (lead.company) {
    if (cachedCompany?.linkedinPage) {
      console.log(`  Pre-search: Using cached company LinkedIn page for "${lead.company}"`);
      if (cachedCompany.employeeSlugs && cachedCompany.employeeSlugs.length > 0) {
        preSearchResults.push(`Company LinkedIn page (cached) employee profiles found:\n${cachedCompany.employeeSlugs.map(l => `https://linkedin.com/in/${l}`).join("\n")}`);
      }
    } else {
      const companyQuery = `"${lead.company}" site:linkedin.com/company`;
      preSearchQueriesDone.push(companyQuery);
      console.log(`  Pre-search: Company LinkedIn page for "${lead.company}"`);
      const companyResults = await firecrawlSearch(companyQuery, firecrawlKey, 3, false);
      const companyLinkedinUrl = companyResults.find(r => r.url.includes("linkedin.com/company/"))?.url;
      if (companyLinkedinUrl) {
        const scraped = await firecrawlScrape(companyLinkedinUrl, firecrawlKey);
        if (scraped) {
          const linkedinProfileLinks = scraped.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/g) || [];
          const uniqueSlugs = [...new Set(linkedinProfileLinks.map(l => l.replace("linkedin.com/in/", "")))];
          
          // Cache for future leads
          if (companyCache && companyCacheKey) {
            const entry = companyCache.get(companyCacheKey) || {};
            entry.linkedinPage = companyLinkedinUrl;
            entry.employeeSlugs = uniqueSlugs;
            companyCache.set(companyCacheKey, entry);
          }
          
          if (uniqueSlugs.length > 0) {
            preSearchResults.push(`Company LinkedIn page (${companyLinkedinUrl}) employee profiles found:\n${uniqueSlugs.map(l => `https://linkedin.com/in/${l}`).join("\n")}`);
            
            // H: Cross-lead mining — resolve other leads from same company
            if (supabaseForCrossLead && uniqueSlugs.length > 0) {
              try {
                const { data: sameCompanyLeads } = await supabaseForCrossLead
                  .from("leads")
                  .select("id, name, company, email")
                  .is("linkedin_url", null)
                  .neq("name", "")
                  .limit(50);
                
                const companyLeads = (sameCompanyLeads || []).filter((cl: any) => 
                  cl.id !== lead.name && cl.company && fuzzyCompanyMatch(cl.company, lead.company || "")
                );
                
                for (const cl of companyLeads) {
                  const clFirstName = cl.name.split(/\s+/)[0]?.toLowerCase() || "";
                  const clLastName = cl.name.split(/\s+/).pop()?.toLowerCase() || "";
                  const matchingSlugs = uniqueSlugs.filter(slug => {
                    const slugLower = slug.toLowerCase();
                    return (clFirstName && slugLower.includes(clFirstName)) || 
                           (clLastName && clLastName.length >= 3 && slugLower.includes(clLastName));
                  });
                  
                  if (matchingSlugs.length === 1) {
                    const crossUrl = `https://www.linkedin.com/in/${matchingSlugs[0]}`;
                    const crossSnippet = `Cross-lead match from ${lead.company} company page`;
                    const crossVerify = await inlineVerify(
                      { name: cl.name, company: cl.company, email: cl.email, companyUrl: null, websiteUrl: null, role: null, message: null, buyerType: null, serviceInterest: null, dealsPlanned: null, targetCriteria: null, targetRevenue: null, geography: null },
                      crossUrl, crossSnippet, openaiKey,
                    );
                    if (crossVerify.verdict !== "wrong") {
                      console.log(`  Cross-lead RESOLVED: ${cl.name} → ${crossUrl}`);
                      await supabaseForCrossLead.from("leads").update({
                        linkedin_url: crossUrl,
                        linkedin_search_log: { cross_lead_match: true, source_lead: lead.name, url: crossUrl, resolved_at: new Date().toISOString() },
                      }).eq("id", cl.id);
                    }
                  }
                }
              } catch (e) {
                console.error(`  Cross-lead mining error:`, e);
              }
            }
          }
          
          const allNames = rationalization
            ? [lead.name, ...rationalization.name_variants]
            : [lead.name];
          const anyNameMention = allNames.some(n => scraped.toLowerCase().includes(n.split(/\s+/)[0]?.toLowerCase()));
          if (anyNameMention) {
            preSearchResults.push(`The company LinkedIn page mentions a name variant — check the profile links above.`);
          }
        }
      }
    }
  }

  // Strategy B: Try email initials as LinkedIn slug
  if (lead.email) {
    const localPart = lead.email.split("@")[0];
    if (localPart.includes(".")) {
      const parts = localPart.split(".");
      const firstInitial = parts[0][0];
      const lastInitial = parts[parts.length - 1][0];
      
      const initials2 = firstInitial + lastInitial;
      const initialsVariants = [initials2];
      const alphabet = "abcdefghijklmnopqrstuvwxyz";
      for (const mid of alphabet) {
        initialsVariants.push(firstInitial + mid + lastInitial);
      }
      if (parts[0].length > 1) {
        initialsVariants.push(parts[0].substring(0, 2) + lastInitial);
      }
      initialsVariants.push(localPart.replace(/\./g, ""));
      
      const searchVariants = [initials2, ...alphabet.split("").map(m => firstInitial + m + lastInitial)];
      const searchQuery = searchVariants.slice(0, 5).map(v => `"${v}"`).join(" OR ") + ` "${lead.company || ""}" site:linkedin.com/in`;
      preSearchQueriesDone.push(searchQuery);
      console.log(`  Pre-search: Email initials "${initials2}", middle-initial variants (${firstInitial}[a-z]${lastInitial})`);
      const initialsResults = await firecrawlSearch(searchQuery, firecrawlKey, 5, false);
      const initialsLinkedins = initialsResults.filter(r => r.url.includes("linkedin.com/in/"));
      if (initialsLinkedins.length > 0) {
        preSearchResults.push(`LinkedIn profiles matching email initials patterns:\n${initialsLinkedins.map(r => `${r.url} — ${r.title || ""} ${r.description || ""}`).join("\n")}`);
      }
      
      preSearchResults.push(`Email initials hint: The email "${lead.email}" suggests possible LinkedIn slugs starting with: ${initials2}, ${firstInitial}[a-z]${lastInitial} (e.g. ${firstInitial}a${lastInitial}, ${firstInitial}m${lastInitial}), ${localPart.replace(/\./g, "")}, ${localPart.replace(/\./g, "-")}`);
    }
  }

  // Strategy C: Discover company website pages via Map, then scrape for LinkedIn links (with cache)
  const companyWebsite = lead.companyUrl || lead.websiteUrl;
  if (companyWebsite && !companyWebsite.includes("linkedin.com")) {
    const cachedWebsite = companyCacheKey && companyCache ? companyCache.get(companyCacheKey) : undefined;
    if (cachedWebsite?.websiteLinks && cachedWebsite.websiteLinks.length > 0) {
      console.log(`  Pre-search: Using cached website LinkedIn links for "${lead.company}"`);
      const nameFirst = lead.name.split(/\s+/)[0]?.toLowerCase();
      const matchingLinks = cachedWebsite.websiteLinks.filter(l => {
        const slug = l.split("/in/")[1]?.toLowerCase() || "";
        return slug.includes(nameFirst) || slug.includes(nameFirst.substring(0, 3));
      });
      const linksToReport = matchingLinks.length > 0 ? matchingLinks : cachedWebsite.websiteLinks;
      preSearchResults.push(`IMPORTANT — LinkedIn URLs found on company website (cached):\n${linksToReport.join("\n")}\nThese are HIGH-PRIORITY candidates.`);
    } else {
      // Phase B: Use Firecrawl Map to discover team/about/leadership pages first
      console.log(`  Pre-search: Mapping company website "${companyWebsite}" for team pages`);
      const allSiteUrls = await firecrawlMap(companyWebsite, firecrawlKey, "team about leadership people", 50);
      const teamPagePatterns = /\/(team|about|leadership|people|staff|our-team|management|who-we-are|partners)\b/i;
      const teamPages = allSiteUrls.filter(u => teamPagePatterns.test(u));
      
      // Scrape team pages + root for LinkedIn links
      const pagesToScrape = teamPages.length > 0 ? teamPages.slice(0, 3) : [companyWebsite];
      if (teamPages.length > 0) {
        console.log(`  Found ${teamPages.length} team pages: ${teamPages.slice(0, 3).join(", ")}`);
      }
      
      const allLinkedInLinks: string[] = [];
      for (const pageUrl of pagesToScrape) {
        const websiteContent = await firecrawlScrape(pageUrl, firecrawlKey);
        if (websiteContent) {
          const websiteLinkedIns = websiteContent.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/g) || [];
          allLinkedInLinks.push(...websiteLinkedIns);
        }
      }
      // Also scrape root page if we scraped team pages (root might have additional links)
      if (teamPages.length > 0 && !pagesToScrape.includes(companyWebsite)) {
        const rootContent = await firecrawlScrape(companyWebsite, firecrawlKey);
        if (rootContent) {
          const rootLinkedIns = rootContent.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/g) || [];
          allLinkedInLinks.push(...rootLinkedIns);
        }
      }
      
      const uniqueWebsiteLinks = [...new Set(allLinkedInLinks)];
      
      // Cache for future leads
      if (companyCache && companyCacheKey) {
        const entry = companyCache.get(companyCacheKey) || {};
        entry.websiteLinks = uniqueWebsiteLinks;
        companyCache.set(companyCacheKey, entry);
      }
      
      if (uniqueWebsiteLinks.length > 0) {
        const nameFirst = lead.name.split(/\s+/)[0]?.toLowerCase();
        const matchingLinks = uniqueWebsiteLinks.filter(l => {
          const slug = l.split("/in/")[1]?.toLowerCase() || "";
          return slug.includes(nameFirst) || slug.includes(nameFirst.substring(0, 3));
        });
        const linksToReport = matchingLinks.length > 0 ? matchingLinks : uniqueWebsiteLinks;
        preSearchResults.push(`IMPORTANT — LinkedIn URLs found on company website (${companyWebsite}):\n${linksToReport.join("\n")}\nThese are HIGH-PRIORITY candidates. Try to verify these FIRST by searching for the slug.`);
      }
    }
  }

  // ─── Strategy D: Role-filtered search (via Firecrawl) ───
  if (lead.company && lead.role) {
    const roleQuery = `site:linkedin.com/in "${lead.company}" "${lead.role}"`;
    console.log(`  Pre-search Strategy D (role-filtered): ${roleQuery}`);
    preSearchQueriesDone.push(roleQuery);
    const roleResults = await firecrawlSearch(roleQuery, firecrawlKey, 5, false);
    const roleLinkedins = roleResults.filter(r => r.url.includes("linkedin.com/in/"));
    if (roleLinkedins.length > 0) {
      preSearchResults.push(`STRATEGY D — Role-filtered search (${lead.role} at ${lead.company}):\n${roleLinkedins.map(r => `${r.url} — ${r.title || ""} ${r.description || ""}`).join("\n")}`);
    }
  }

  // ─── Phase A: Pre-Agent Confidence Gate ───
  // If pre-search found LinkedIn URLs from the company website where the slug
  // contains BOTH the person's first AND last name, verify directly and skip the agent.
  {
    const namePartsLower = lead.name.toLowerCase().split(/\s+/).filter(p => p.length >= 2);
    const firstName = namePartsLower[0] || "";
    const lastName = namePartsLower[namePartsLower.length - 1] || "";
    const allNames = rationalization ? [lead.name, ...rationalization.name_variants] : [lead.name];
    
    // Collect all LinkedIn URLs found in pre-search
    const preSearchLinkedInUrls: string[] = [];
    for (const section of preSearchResults) {
      const urls = section.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/g) || [];
      preSearchLinkedInUrls.push(...urls);
    }
    const uniquePreSearchUrls = [...new Set(preSearchLinkedInUrls)];
    
    if (uniquePreSearchUrls.length > 0 && firstName && lastName) {
      for (const candidateUrl of uniquePreSearchUrls) {
        const slug = (candidateUrl.split("/in/")[1] || "").toLowerCase().replace(/\/$/, "");
        // Check if slug contains both first and last name (or name variants)
        const slugMatchesName = allNames.some(fullName => {
          const parts = fullName.toLowerCase().split(/\s+/);
          const fn = parts[0] || "";
          const ln = parts[parts.length - 1] || "";
          return fn.length >= 2 && ln.length >= 2 && slug.includes(fn) && slug.includes(ln);
        });
        
        if (slugMatchesName) {
          console.log(`  Confidence gate: slug "${slug}" matches name — verifying directly...`);
          const verification = await inlineVerify(lead, candidateUrl.replace(/\/$/, "").split("?")[0], `Pre-search match with name-matching slug`, openaiKey);
          if (verification.verdict !== "wrong") {
            console.log(`  Confidence gate VERIFIED (${verification.verdict}): ${candidateUrl} — SKIPPING agent`);
            return { url: candidateUrl.replace(/\/$/, "").split("?")[0], profileContent: "", turnsUsed: 0, gaveUpReason: null, snippet: `Confidence gate: ${verification.reason}` };
          } else {
            console.log(`  Confidence gate rejected: ${verification.reason}`);
          }
        }
      }
    }
  }

  // J: Agent deduplication instruction — tell agent what was already searched
  let dedupNote = "";
  if (preSearchQueriesDone.length > 0) {
    dedupNote = `\n\nALREADY SEARCHED (do NOT repeat these exact queries — try NEW strategies instead):\n${preSearchQueriesDone.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
  }

  const preSearchContext = preSearchResults.length > 0
    ? `\n\nPRE-SEARCH RESULTS (from automated priority strategies):\n${preSearchResults.join("\n\n")}\n\nIMPORTANT: Analyze these results first. If any LinkedIn URL was found on the company website, try to verify it by searching for the slug (e.g. search for "slug_name" site:linkedin.com). If a profile matches ${lead.name}, report it as found. Do NOT skip these just because the slug looks unusual.${dedupNote}`
    : dedupNote;

  const nameVariantNote = rationalization && rationalization.name_variants.length > 0
    ? `\n\nCRITICAL: This person may go by different names. Search for ALL of these: ${[lead.name, ...rationalization.name_variants].join(", ")}`
    : "";

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: buildSystemPrompt(maxTurns) },
    {
      role: "user",
      content: `Find the LinkedIn profile for this person:\n\n${contextParts.join("\n")}${nameVariantNote}${preSearchContext}\n\nWhat would you like to do first?`,
    },
  ];

  // Fix 2: Collect ALL LinkedIn URLs encountered during agent search for candidate UI
  const agentEncounteredUrls: Array<{ url: string; snippet: string }> = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    try {
      const content = await callAI(messages, openaiKey, model);

      let parsed: any;
      try {
        const jsonStr = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
        }
        if (!parsed) {
          return { url: null, profileContent: "", turnsUsed: turn + 1, gaveUpReason: "Unparseable AI response" };
        }
      }

      messages.push({ role: "assistant", content });

      if (parsed.action === "found" && parsed.url) {
        const url = parsed.url.split("?")[0];
        console.log(`  Turn ${turn + 1}: FOUND ${url} (confidence: ${parsed.confidence || "unknown"})`);
        return { url, profileContent: "", turnsUsed: turn + 1, gaveUpReason: null };
      }

      if (parsed.action === "give_up") {
        console.log(`  Turn ${turn + 1}: GAVE UP — ${parsed.reason} (${agentEncounteredUrls.length} candidates collected)`);
        
        // Firecrawl fallback before truly giving up (site:linkedin.com)
        if (lead.company) {
          console.log(`  Firecrawl fallback before giving up...`);
          const allNames = rationalization ? [lead.name, ...rationalization.name_variants] : [lead.name];
          for (const nameVariant of allNames.slice(0, 3)) {
            const fallbackQuery = `"${nameVariant}" "${lead.company}" site:linkedin.com/in`;
            const fallbackResults = await firecrawlSearch(fallbackQuery, firecrawlKey, 5, false);
            const fallbackLinkedin = fallbackResults.find(r => r.url.includes("linkedin.com/in/"));
            if (fallbackLinkedin) {
              const sUrl = fallbackLinkedin.url.split("?")[0];
              console.log(`  Firecrawl rescue: ${sUrl}`);
              return { url: sUrl, profileContent: "", turnsUsed: turn + 1, gaveUpReason: null, snippet: `${fallbackLinkedin.title || ""} ${fallbackLinkedin.description || ""}` };
            }
          }
          
          // Open web LinkedIn mention search (no site: restriction)
          console.log(`  Open web fallback — searching without site:linkedin.com...`);
          for (const nameVariant of allNames.slice(0, 2)) {
            const openWebQuery = `"${nameVariant}" "${lead.company}" linkedin profile`;
            console.log(`  Open web search: ${openWebQuery}`);
            const openResults = await firecrawlSearch(openWebQuery, firecrawlKey, 8, false);
            const openLinkedins = openResults.filter(r => r.url.includes("linkedin.com/in/"));
            if (openLinkedins.length > 0) {
              for (const candidate of openLinkedins.slice(0, 3)) {
                const cUrl = candidate.url.split("?")[0];
                const cSnippet = `${candidate.title || ""} ${candidate.description || ""}`;
                console.log(`  Open web candidate: ${cUrl}`);
                const verification = await inlineVerify(lead, cUrl, cSnippet, openaiKey);
                if (verification.verdict !== "wrong") {
                  console.log(`  Open web VERIFIED (${verification.verdict}): ${cUrl}`);
                  return { url: cUrl, profileContent: "", turnsUsed: turn + 1, gaveUpReason: null, snippet: cSnippet };
                }
              }
            }
          }
        }
        
        // Attach collected candidates to the result
        const result: AgentResult = { url: null, profileContent: "", turnsUsed: turn + 1, gaveUpReason: parsed.reason, snippet: "" };
        (result as any).candidates = agentEncounteredUrls;
        return result;
      }

      if (parsed.action === "scrape" && parsed.url) {
        console.log(`  Turn ${turn + 1}: Scraping "${parsed.url}"`);
        let scraped = await firecrawlScrape(parsed.url, firecrawlKey);
        
        if (!scraped && parsed.url.includes("linkedin.com/in/")) {
          const slug = parsed.url.split("/in/")[1]?.split("/")[0]?.split("?")[0];
          if (slug) {
            console.log(`  Turn ${turn + 1}: LinkedIn scrape blocked, searching for slug "${slug}"`);
            const fallbackResults = await firecrawlSearch(`"${slug}" site:linkedin.com`, firecrawlKey, 3, true);
            if (fallbackResults.length > 0) {
              scraped = fallbackResults.map((r, i) => {
                const parts = [`Result ${i + 1}: ${r.url}`];
                if (r.title) parts.push(`Title: ${r.title}`);
                if (r.description) parts.push(`Description: ${r.description}`);
                if (r.markdown) parts.push(`Content: ${r.markdown.substring(0, 600)}`);
                return parts.join("\n");
              }).join("\n\n");
              scraped = `[LinkedIn scrape was blocked. Here are search results for the slug "${slug}" instead:]\n\n${scraped}`;
            }
          }
        }
        
        const preview = scraped.length > 2000 ? scraped.substring(0, 2000) + "\n...(truncated)" : scraped;
        messages.push({
          role: "user",
          content: `Scraped content from "${parsed.url}":\n\n${preview || "(empty page)"}\n\nYou have ${maxTurns - turn - 1} turns remaining. What next?`,
        });
        continue;
      }

      if (parsed.action === "search" && parsed.query) {
        console.log(`  Turn ${turn + 1}: Searching "${parsed.query}"`);
        let results = await firecrawlSearch(parsed.query, firecrawlKey, 5, true);

        // Serper fallback if Firecrawl returns 0 results
        if (results.length === 0 && serperKey) {
          console.log(`  Turn ${turn + 1}: Firecrawl empty, trying Serper fallback`);
          const serperResults = await serperSearch(parsed.query, serperKey, 5);
          if (serperResults.length > 0) {
            results = serperResults;
          }
        }

        // Fix 2: Collect all LinkedIn /in/ URLs from search results
        for (const r of results) {
          if (r.url.includes("linkedin.com/in/")) {
            const cleanUrl = r.url.split("?")[0];
            if (!agentEncounteredUrls.some(c => c.url === cleanUrl)) {
              agentEncounteredUrls.push({ url: cleanUrl, snippet: `${r.title || ""} ${r.description || ""}`.trim() });
            }
          }
        }

        let resultsSummary: string;
        if (results.length === 0) {
          resultsSummary = "No results found for this search.";
        } else {
          resultsSummary = results
            .map((r, i) => {
              const parts = [`Result ${i + 1}: ${r.url}`];
              if (r.title) parts.push(`Title: ${r.title}`);
              if (r.description) parts.push(`Description: ${r.description}`);
              if (r.markdown) parts.push(`Content preview: ${r.markdown.substring(0, 800)}`);
              return parts.join("\n");
            })
            .join("\n\n");
        }

        messages.push({
          role: "user",
          content: `Search results for "${parsed.query}":\n\n${resultsSummary}\n\nYou have ${maxTurns - turn - 1} turns remaining. What next?`,
        });
        continue;
      }

      console.error(`AI agent returned unknown action for ${lead.name}: ${parsed.action}`);
      return { url: null, profileContent: "", turnsUsed: turn + 1, gaveUpReason: "Unknown action from AI" };
    } catch (e) {
      console.error(`AI agent error on turn ${turn + 1} for ${lead.name}:`, e);
      return { url: null, profileContent: "", turnsUsed: turn + 1, gaveUpReason: `Error: ${(e as Error).message}` };
    }
  }

  return { url: null, profileContent: "", turnsUsed: maxTurns, gaveUpReason: "Max turns reached" };
}

// ─── Post-match enrichment ───

async function scrapeLinkedInProfile(url: string, firecrawlKey: string): Promise<string> {
  try {
    const results = await firecrawlSearch(`site:linkedin.com/in "${url.split("/in/")[1]?.split("/")[0]?.split("?")[0]}"`, firecrawlKey, 1, true);
    return results[0]?.markdown || results[0]?.description || "";
  } catch {
    return "";
  }
}

function extractTitle(content: string): string | null {
  const headlineMatch = content.match(/^#+\s*(.+)/m);
  if (headlineMatch) {
    const headline = headlineMatch[1].trim();
    if (headline.length < 100 && !headline.toLowerCase().includes("linkedin")) return headline;
  }
  const titleMatch = content.match(/[-–—]\s*(.+?)(?:\s+at\s+|\s+[-–—]\s+|\s*$)/i);
  if (titleMatch) {
    const title = titleMatch[1].trim().replace(/\s*[-–—]\s*LinkedIn.*$/i, "").trim();
    if (title.length > 2) return title;
  }
  const match = content.match(
    /\b(CEO|CFO|COO|CTO|President|Partner|Managing Director|Vice President|VP|Director|Principal|Founder|Co-Founder|Manager|Associate|Analyst)\b/i,
  );
  return match ? match[0] : null;
}

function detectMaExperience(content: string): boolean {
  const maKeywords = [
    "investment bank", "private equity", "m&a", "corporate development",
    "mergers", "acquisitions", "corp dev", "advisory", "buy-side",
    "sell-side", "due diligence", "portfolio company",
  ];
  const lower = content.toLowerCase();
  return maKeywords.some((kw) => lower.includes(kw));
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

// ─── Validate lead name (relaxed for single-name with company+email) ───

function isValidLeadForSearch(lead: any): boolean {
  const nameParts = lead.name.split(/\s+/).filter((p: string) => p.length >= 2);
  // Standard: 2+ name parts
  if (nameParts.length >= 2) return true;
  // Relaxed: single name but has company AND non-personal email
  if (nameParts.length >= 1 && lead.company && lead.email) {
    const personalDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com", "protonmail.com", "mozmail.com"];
    const emailDomain = lead.email.split("@")[1]?.toLowerCase() || "";
    if (!personalDomains.includes(emailDomain)) return true;
  }
  return false;
}

// ─── Process a single lead (used in both passes) ───

async function processLead(
  lead: any,
  firecrawlKey: string,
  openaiKey: string,
  supabase: any,
  model: string,
  maxTurns: number,
  serperKey: string | null = null,
  companyCache: CompanyCache | null = null,
  startTime: number = Date.now(),
): Promise<{ found: boolean; turnsUsed: number; gaveUpReason: string | null }> {
  // Step 3: Timeout guard — save progress before edge function times out
  const TIMEOUT_MS = 45000;
  if (Date.now() - startTime > TIMEOUT_MS) {
    console.log(`  Timeout guard: skipping ${lead.name} (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
    await writeSearchLog(supabase, lead.id, null, { url: null, profileContent: "", turnsUsed: 0, gaveUpReason: "timeout" }, "timeout");
    await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
    return { found: false, turnsUsed: 0, gaveUpReason: "timeout" };
  }
  const leadContext: LeadContext = {
    name: lead.name,
    company: lead.company,
    email: lead.email,
    companyUrl: lead.company_url,
    websiteUrl: lead.website_url,
    role: lead.role,
    message: lead.message,
    buyerType: lead.buyer_type,
    serviceInterest: lead.service_interest,
    dealsPlanned: lead.deals_planned,
    targetCriteria: lead.target_criteria,
    targetRevenue: lead.target_revenue,
    geography: lead.geography,
  };

  // B: Mine email signatures for LinkedIn URLs before anything else
  console.log(`  Checking email signatures for LinkedIn URLs...`);
  const emailSignatureResult = await mineEmailSignatures(lead.id, leadContext, supabase, openaiKey);
  if (emailSignatureResult) {
    console.log(`  Email signature match: ${emailSignatureResult.url}`);
    return await writeLinkedInResult(lead, emailSignatureResult.url, firecrawlKey, supabase, null, 0, null);
  }

  // Run AI rationalization before search
  console.log(`  Running AI rationalization for ${lead.name}...`);
  const rationalization = await rationalizeLead(leadContext, openaiKey);

  // C: Read previous search log for retry context
  const previousSearchLog = lead.linkedin_search_log || null;
  if (previousSearchLog) {
    console.log(`  Previous search log found — will inject context into agent`);
  }

  // ─── Phase 1A: Direct LinkedIn URL guessing from rationalization slugs ───
  if (rationalization && rationalization.linkedin_slug_guesses?.length > 0) {
    console.log(`  Trying direct slug guesses: ${rationalization.linkedin_slug_guesses.join(", ")}`);
    const slugResult = await tryDirectSlugGuess(rationalization.linkedin_slug_guesses, leadContext, firecrawlKey, openaiKey);
    if (slugResult) {
      // Inline verify before accepting
      const verification = await inlineVerify(leadContext, slugResult.url, slugResult.snippet, openaiKey);
      if (verification.verdict === "correct") {
        console.log(`  Direct slug VERIFIED: ${slugResult.url}`);
        return await writeLinkedInResult(lead, slugResult.url, firecrawlKey, supabase, rationalization, 0, null);
      } else {
        console.log(`  Direct slug REJECTED (${verification.verdict}): ${verification.reason}`);
      }
    }
  }

  const agentResult = await aiSearchAgent(leadContext, firecrawlKey, openaiKey, model, maxTurns, rationalization, serperKey, previousSearchLog, companyCache, supabase);

  // ─── Phase 1B: Inline verification before writing ───
  // Collect candidates for multi-candidate UI — merge agent-collected candidates
  const candidates: Array<{ url: string; snippet: string }> = [];
  if ((agentResult as any).candidates) {
    for (const c of (agentResult as any).candidates) {
      if (!candidates.some(x => x.url === c.url)) candidates.push(c);
    }
  }
  
  if (agentResult.url) {
    const snippet = agentResult.snippet || "";
    const verification = await inlineVerify(leadContext, agentResult.url, snippet, openaiKey);
    
    if (verification.verdict === "wrong") {
      console.log(`  Inline verify REJECTED: ${agentResult.url} — ${verification.reason}`);
      candidates.push({ url: agentResult.url, snippet: `${snippet} (rejected: ${verification.reason})` });
      // Don't write this bad match — mark as not found
      await writeSearchLog(supabase, lead.id, rationalization, agentResult, `Rejected by inline verify: ${verification.reason}`, candidates);
      await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
      return { found: false, turnsUsed: agentResult.turnsUsed, gaveUpReason: `Inline verify rejected: ${verification.reason}` };
    }
    
    if (verification.verdict === "uncertain") {
      candidates.push({ url: agentResult.url, snippet: `${snippet} (uncertain: ${verification.reason})` });
    }
    
    console.log(`  Inline verify: ${verification.verdict} — ${verification.reason}`);
    return await writeLinkedInResult(lead, agentResult.url, firecrawlKey, supabase, rationalization, agentResult.turnsUsed, null);
  }

  // Not found — include any candidates we collected
  await writeSearchLog(supabase, lead.id, rationalization, agentResult, agentResult.gaveUpReason || "Not found", candidates);
  await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
  return { found: false, turnsUsed: agentResult.turnsUsed, gaveUpReason: agentResult.gaveUpReason };
}

// ─── Write LinkedIn result to DB ───

async function writeLinkedInResult(
  lead: any,
  url: string,
  firecrawlKey: string,
  supabase: any,
  rationalization: RationalizationResult | null,
  turnsUsed: number,
  gaveUpReason: string | null,
): Promise<{ found: boolean; turnsUsed: number; gaveUpReason: string | null }> {
  const profileContent = await scrapeLinkedInProfile(url, firecrawlKey);
  const finalTitle = extractTitle(profileContent);
  const finalMa = detectMaExperience(profileContent);

  let seniorityScoreValue = getSeniorityScore(finalTitle);
  if (finalMa) seniorityScoreValue += 2;
  seniorityScoreValue = Math.max(-2, Math.min(20, seniorityScoreValue));

  const oldLinkedinScore = lead.linkedin_score || 0;
  const oldStage2 = lead.stage2_score || 0;
  const newStage2 = Math.max(0, Math.min(100, oldStage2 - oldLinkedinScore + seniorityScoreValue));

  const searchLog = rationalization ? {
    rationalization: {
      name_variants: rationalization.name_variants,
      company_variants: rationalization.company_variants,
      confidence_notes: rationalization.confidence_notes,
      confidence_level: rationalization.confidence_level,
    },
    found_url: url,
    turns_used: turnsUsed,
    searched_at: new Date().toISOString(),
  } : null;

  await supabase.from("leads").update({
    linkedin_url: url,
    linkedin_title: finalTitle,
    linkedin_ma_experience: finalMa,
    linkedin_score: seniorityScoreValue,
    seniority_score: seniorityScoreValue,
    stage2_score: newStage2,
    ...(searchLog ? { linkedin_search_log: searchLog } : {}),
  }).eq("id", lead.id);

  return { found: true, turnsUsed, gaveUpReason };
}

// ─── Write search log on failure ───

async function writeSearchLog(
  supabase: any,
  leadId: string,
  rationalization: RationalizationResult | null,
  agentResult: AgentResult,
  failReason: string,
  candidates?: Array<{ url: string; snippet: string }>,
) {
  const searchLog: Record<string, any> = {
    rationalization: rationalization ? {
      name_variants: rationalization.name_variants,
      company_variants: rationalization.company_variants,
      confidence_notes: rationalization.confidence_notes,
      confidence_level: rationalization.confidence_level,
      queries_tried: rationalization.best_search_queries,
    } : null,
    turns_used: agentResult.turnsUsed,
    fail_reason: failReason,
    searched_at: new Date().toISOString(),
  };
  
  // Step 2: Store candidates for multi-candidate disambiguation UI
  if (candidates && candidates.length > 0) {
    searchLog.candidates = candidates.slice(0, 5); // Max 5 candidates
  }

  await supabase.from("leads").update({ linkedin_search_log: searchLog }).eq("id", leadId);
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY") || null;
  _serperExhausted = false; // Reset per invocation

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Parse request body
  let singleLeadId: string | null = null;
  let retryFailed = false;
  let manualUrl: string | null = null;
  let minAgeDays: number | null = null;
  try {
    const body = await req.json();
    singleLeadId = body?.leadId || null;
    retryFailed = body?.retryFailed === true || body?.retry_failed === true;
    manualUrl = body?.manualUrl || null;
    minAgeDays = body?.minAge ? Number(body.minAge) : null;
  } catch {
    // No body or invalid JSON — proceed with batch mode
  }

  try {
    // ─── Manual URL override mode ───
    if (singleLeadId && manualUrl) {
      console.log(`[manual-url] Setting LinkedIn URL for ${singleLeadId}: ${manualUrl}`);
      
      const { data: leadRows } = await supabase
        .from("leads")
        .select("id, name, company, email, company_url, website_url, role, message, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience, linkedin_search_log")
        .eq("id", singleLeadId)
        .limit(1);
      
      const lead = leadRows?.[0];
      if (!lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Scrape and enrich the manually provided URL
      const profileContent = await scrapeLinkedInProfile(manualUrl, FIRECRAWL_API_KEY);
      const finalTitle = extractTitle(profileContent);
      const finalMa = detectMaExperience(profileContent);
      let seniorityScoreValue = getSeniorityScore(finalTitle);
      if (finalMa) seniorityScoreValue += 2;
      seniorityScoreValue = Math.max(-2, Math.min(20, seniorityScoreValue));

      const oldLinkedinScore = lead.linkedin_score || 0;
      const oldStage2 = lead.stage2_score || 0;
      const newStage2 = Math.max(0, Math.min(100, oldStage2 - oldLinkedinScore + seniorityScoreValue));

      await supabase.from("leads").update({
        linkedin_url: manualUrl,
        linkedin_title: finalTitle,
        linkedin_ma_experience: finalMa,
        linkedin_score: seniorityScoreValue,
        seniority_score: seniorityScoreValue,
        stage2_score: newStage2,
        linkedin_search_log: { manual_override: true, url: manualUrl, set_at: new Date().toISOString() },
      }).eq("id", lead.id);

      return new Response(JSON.stringify({ success: true, found: true, url: manualUrl, title: finalTitle }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Single-lead mode ───
    if (singleLeadId) {
      console.log(`[single-lead] Processing lead ${singleLeadId}`);
      const { data: leadRows } = await supabase
        .from("leads")
        .select("id, name, company, email, company_url, website_url, role, message, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience, linkedin_search_log")
        .eq("id", singleLeadId)
        .limit(1);

      const lead = leadRows?.[0];
      if (!lead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Skip if already has LinkedIn URL
      if (lead.linkedin_url) {
        return new Response(JSON.stringify({ success: true, skipped: true, message: "Already has LinkedIn URL" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if company_url is already a LinkedIn URL
      if (lead.company_url && lead.company_url.includes("linkedin.com/in/")) {
        await supabase.from("leads").update({ linkedin_url: lead.company_url }).eq("id", lead.id);
        return new Response(JSON.stringify({ success: true, found: true, url: lead.company_url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate name (relaxed)
      if (!isValidLeadForSearch(lead)) {
        await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
        return new Response(JSON.stringify({ success: true, found: false, reason: "Insufficient name" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await processLead(lead, FIRECRAWL_API_KEY, OPENAI_API_KEY, supabase, "gpt-4o", 8, SERPER_API_KEY, null, Date.now());
      console.log(`[single-lead] ${lead.name}: ${result.found ? "FOUND" : "NOT FOUND"} (${result.turnsUsed} turns)`);

      return new Response(JSON.stringify({ success: true, found: result.found, turnsUsed: result.turnsUsed, serper_exhausted: _serperExhausted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Batch mode with auto-continuation ───
    console.log(`Batch mode: gpt-4o-mini (${FLASH_MAX_TURNS} turns), max ${MAX_LEADS_PER_RUN} leads per run, up to ${MAX_AUTO_CHAINS} chains`);

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

    // D: Company-level cache shared across all leads in batch
    const companyCache: CompanyCache = new Map();
    // batchStartTime moved inside chain loop (Fix 1)
    
    let totalFound = 0;
    let totalProcessed = 0;
    const allGaveUpReasons: string[] = [];
    let totalTurns = 0;
    let totalGaveUp = 0;
    let chainsRun = 0;

    for (let chain = 0; chain < MAX_AUTO_CHAINS; chain++) {
      chainsRun++;
      // Fix 1: Reset timeout per chain so chains 2-3 get fresh 45s windows
      const chainStartTime = Date.now();
      
      // Get leads needing LinkedIn lookup
      let leadsQuery = supabase
        .from("leads")
        .select("id, name, company, email, company_url, website_url, role, message, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience, linkedin_search_log");

      if (retryFailed) {
        leadsQuery = leadsQuery.eq("linkedin_url", "");
        if (chain === 0) console.log("retryFailed=true: re-processing previously failed leads");
      } else {
        leadsQuery = leadsQuery.is("linkedin_url", null);
      }

      let { data: leads, error } = await leadsQuery
        .neq("name", "")
        .order("created_at", { ascending: false })
        .limit(MAX_LEADS_PER_RUN);
      
      // Step 4: Stale re-enrichment filter — re-process leads searched > minAgeDays ago
      if (minAgeDays && leads) {
        const cutoff = new Date(Date.now() - minAgeDays * 86400000).toISOString();
        leads = leads.filter((l: any) => {
          if (!l.linkedin_search_log?.searched_at) return true;
          return l.linkedin_search_log.searched_at < cutoff;
        });
        if (chain === 0) console.log(`Stale filter: ${leads.length} leads searched >${minAgeDays}d ago`);
      }

      if (error) throw error;

      const validLeads = (leads || []).filter(isValidLeadForSearch);

      if (validLeads.length === 0) {
        if (chain === 0) {
          return new Response(
            JSON.stringify({ success: true, processed: 0, message: "No leads need LinkedIn backfill" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        break; // No more leads to process
      }

      console.log(`\n=== Chain ${chain + 1}/${MAX_AUTO_CHAINS}: Processing ${validLeads.length} leads with gpt-4o-mini ===`);

      for (const lead of validLeads) {
        totalProcessed++;
        console.log(`\n[${totalProcessed}] ${lead.name} (${lead.company})`);

        const result = await processLead(lead, FIRECRAWL_API_KEY, OPENAI_API_KEY, supabase, "gpt-4o-mini", FLASH_MAX_TURNS, SERPER_API_KEY, companyCache, chainStartTime);
        totalTurns += result.turnsUsed;

        if (result.found) {
          totalFound++;
          console.log(`  MATCHED (${result.turnsUsed} turns)`);
        } else {
          totalGaveUp++;
          if (result.gaveUpReason) {
            allGaveUpReasons.push(`${lead.name}: ${result.gaveUpReason}`);
          }
          console.log(`  NO MATCH (${result.turnsUsed} turns): ${result.gaveUpReason}`);
        }

        await new Promise((r) => setTimeout(r, 500));
      }

      // Check if more remain
      let remainingQuery = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .neq("name", "");

      if (retryFailed) {
        remainingQuery = remainingQuery.eq("linkedin_url", "");
      } else {
        remainingQuery = remainingQuery.is("linkedin_url", null);
      }

      const { count: remaining } = await remainingQuery;
      console.log(`Chain ${chain + 1} complete: ${remaining || 0} leads remaining`);
      
      if (!remaining || remaining <= 0) break;
    }

    const avgTurns = totalProcessed > 0 ? (totalTurns / totalProcessed).toFixed(1) : "0";
    console.log(`\nAll chains complete: ${totalFound}/${totalProcessed} matched across ${chainsRun} chains, cache had ${companyCache.size} companies`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        found: totalFound,
        remaining: 0,
        avgTurnsPerLead: parseFloat(avgTurns),
        gaveUp: totalGaveUp,
        gaveUpReasons: allGaveUpReasons,
        chainsRun,
        companyCacheHits: companyCache.size,
        serper_exhausted: _serperExhausted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-linkedin error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
