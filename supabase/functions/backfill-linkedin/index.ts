import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;
const DELAY_MS = 2000;
const FLASH_MAX_TURNS = 5;
const MAX_LEADS_PER_RUN = 5; // Process only 5 leads per invocation to stay within timeout


// ─── Firecrawl Search ───

interface SearchResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
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

    const res = await fetch("https://api.firecrawl.dev/v1/search", {
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
    const results = data.data || data.results || [];
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

// ─── Firecrawl Scrape (single URL) ───

async function firecrawlScrape(
  url: string,
  apiKey: string,
): Promise<string> {
  try {
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
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
    
    // Append any LinkedIn links found
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

// ─── AI Call Helper (OpenAI only) ───

async function callAI(
  messages: Array<{ role: string; content: string }>,
  openaiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
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

interface AgentResult {
  url: string | null;
  profileContent: string;
  turnsUsed: number;
  gaveUpReason: string | null;
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

  // ─── Pre-execute priority strategies programmatically ───
  const preSearchResults: string[] = [];

  // Strategy A: Search company LinkedIn page for employees
  if (lead.company) {
    console.log(`  Pre-search: Company LinkedIn page for "${lead.company}"`);
    const companyResults = await firecrawlSearch(`"${lead.company}" site:linkedin.com/company`, firecrawlKey, 3, false);
    const companyLinkedinUrl = companyResults.find(r => r.url.includes("linkedin.com/company/"))?.url;
    if (companyLinkedinUrl) {
      const scraped = await firecrawlScrape(companyLinkedinUrl, firecrawlKey);
      if (scraped) {
        // Extract any linkedin.com/in/ links from the scraped content
        const linkedinProfileLinks = scraped.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/g) || [];
        const uniqueLinks = [...new Set(linkedinProfileLinks)];
        if (uniqueLinks.length > 0) {
          preSearchResults.push(`Company LinkedIn page (${companyLinkedinUrl}) employee profiles found:\n${uniqueLinks.map(l => `https://${l}`).join("\n")}`);
        }
        // Also include any name mentions near linkedin links
        const nameFirst = lead.name.split(/\s+/)[0]?.toLowerCase();
        if (nameFirst && scraped.toLowerCase().includes(nameFirst)) {
          preSearchResults.push(`The company LinkedIn page mentions "${nameFirst}" — check the profile links above.`);
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
      
      // Generate all possible initial combinations:
      // 1. Two-letter: first+last initial (e.g. "eb")
      const initials2 = firstInitial + lastInitial;
      // 2. Three-letter with middle initial: try all 26 letters between first and last
      //    This catches cases like "emb" for "Ellie M. Burei" where middle initial is unknown
      const initialsVariants = [initials2];
      const alphabet = "abcdefghijklmnopqrstuvwxyz";
      for (const mid of alphabet) {
        initialsVariants.push(firstInitial + mid + lastInitial);
      }
      // 3. Also try first 2 chars of first name + last initial (e.g. "elb")
      if (parts[0].length > 1) {
        initialsVariants.push(parts[0].substring(0, 2) + lastInitial);
      }
      // 4. Full local part without dots (e.g. "ellieburei")
      initialsVariants.push(localPart.replace(/\./g, ""));
      
      // Search using the most likely variants (2-letter + all 3-letter middle-initial combos)
      // Use a compact search: just search the slug patterns with company name
      const searchVariants = [initials2, ...alphabet.split("").map(m => firstInitial + m + lastInitial)];
      const searchQuery = searchVariants.slice(0, 5).map(v => `"${v}"`).join(" OR ") + ` "${lead.company || ""}" site:linkedin.com/in`;
      console.log(`  Pre-search: Email initials "${initials2}", middle-initial variants (${firstInitial}[a-z]${lastInitial})`);
      const initialsResults = await firecrawlSearch(searchQuery, firecrawlKey, 5, false);
      const initialsLinkedins = initialsResults.filter(r => r.url.includes("linkedin.com/in/"));
      if (initialsLinkedins.length > 0) {
        preSearchResults.push(`LinkedIn profiles matching email initials patterns:\n${initialsLinkedins.map(r => `${r.url} — ${r.title || ""} ${r.description || ""}`).join("\n")}`);
      }
      
      // Also provide the initials variants to the agent context
      preSearchResults.push(`Email initials hint: The email "${lead.email}" suggests possible LinkedIn slugs starting with: ${initials2}, ${firstInitial}[a-z]${lastInitial} (e.g. ${firstInitial}a${lastInitial}, ${firstInitial}m${lastInitial}), ${localPart.replace(/\./g, "")}, ${localPart.replace(/\./g, "-")}`);
    }
  }

  const preSearchContext = preSearchResults.length > 0
    ? `\n\nPRE-SEARCH RESULTS (from automated priority strategies):\n${preSearchResults.join("\n\n")}\n\nAnalyze these results first. If any profile matches ${lead.name}, verify and report it as found.`
    : "";

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: buildSystemPrompt(maxTurns) },
    {
      role: "user",
      content: `Find the LinkedIn profile for this person:\n\n${contextParts.join("\n")}${preSearchContext}\n\nWhat would you like to do first?`,
    },
  ];

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
        console.log(`  Turn ${turn + 1}: GAVE UP — ${parsed.reason}`);
        return { url: null, profileContent: "", turnsUsed: turn + 1, gaveUpReason: parsed.reason };
      }

      if (parsed.action === "scrape" && parsed.url) {
        console.log(`  Turn ${turn + 1}: Scraping "${parsed.url}"`);
        let scraped = await firecrawlScrape(parsed.url, firecrawlKey);
        
        // Fallback: if scraping a LinkedIn profile returned empty (403 block), search for the slug instead
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
        const results = await firecrawlSearch(parsed.query, firecrawlKey, 5, true);

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

// ─── Process a single lead (used in both passes) ───

async function processLead(
  lead: any,
  firecrawlKey: string,
  openaiKey: string,
  supabase: any,
  model: string,
  maxTurns: number,
): Promise<{ found: boolean; turnsUsed: number; gaveUpReason: string | null }> {
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

  const agentResult = await aiSearchAgent(leadContext, firecrawlKey, openaiKey, model, maxTurns);

  if (!agentResult.url) {
    await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
    return { found: false, turnsUsed: agentResult.turnsUsed, gaveUpReason: agentResult.gaveUpReason };
  }

  const profileContent = await scrapeLinkedInProfile(agentResult.url, firecrawlKey);
  const finalTitle = extractTitle(profileContent);
  const finalMa = detectMaExperience(profileContent);

  let seniorityScoreValue = getSeniorityScore(finalTitle);
  if (finalMa) seniorityScoreValue += 2;
  seniorityScoreValue = Math.max(-2, Math.min(20, seniorityScoreValue));

  const oldLinkedinScore = lead.linkedin_score || 0;
  const oldStage2 = lead.stage2_score || 0;
  const newStage2 = Math.max(0, Math.min(100, oldStage2 - oldLinkedinScore + seniorityScoreValue));

  await supabase.from("leads").update({
    linkedin_url: agentResult.url,
    linkedin_title: finalTitle,
    linkedin_ma_experience: finalMa,
    linkedin_score: seniorityScoreValue,
    seniority_score: seniorityScoreValue,
    stage2_score: newStage2,
  }).eq("id", lead.id);

  return { found: true, turnsUsed: agentResult.turnsUsed, gaveUpReason: null };
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Parse request body
  let singleLeadId: string | null = null;
  let retryFailed = false;
  try {
    const body = await req.json();
    singleLeadId = body?.leadId || null;
    retryFailed = body?.retryFailed === true;
  } catch {
    // No body or invalid JSON — proceed with batch mode
  }

  try {
    // ─── Single-lead mode ───
    if (singleLeadId) {
      console.log(`[single-lead] Processing lead ${singleLeadId}`);
      const { data: leadRows } = await supabase
        .from("leads")
        .select("id, name, company, email, company_url, website_url, role, message, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience")
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

      // Validate name has at least 2 parts
      const nameParts = lead.name.split(/\s+/).filter((p: string) => p.length >= 2);
      if (nameParts.length < 2) {
        await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
        return new Response(JSON.stringify({ success: true, found: false, reason: "Insufficient name" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await processLead(lead, FIRECRAWL_API_KEY, OPENAI_API_KEY, supabase, "gpt-4o", 8);
      console.log(`[single-lead] ${lead.name}: ${result.found ? "FOUND" : "NOT FOUND"} (${result.turnsUsed} turns)`);

      return new Response(JSON.stringify({ success: true, found: result.found, turnsUsed: result.turnsUsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Batch mode (existing behavior) ───
    console.log(`Single pass: gpt-4o-mini (${FLASH_MAX_TURNS} turns), max ${MAX_LEADS_PER_RUN} leads per run`);

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

    // Get leads needing LinkedIn lookup
    // retryFailed=true: re-process leads where linkedin_url='' (previously failed with old rules)
    // default: only process leads where linkedin_url IS NULL (never searched)
    let leadsQuery = supabase
      .from("leads")
      .select("id, name, company, email, company_url, website_url, role, message, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience");

    if (retryFailed) {
      leadsQuery = leadsQuery.eq("linkedin_url", "");
      console.log("retryFailed=true: re-processing previously failed leads");
    } else {
      leadsQuery = leadsQuery.is("linkedin_url", null);
    }

    const { data: leads, error } = await leadsQuery
      .neq("name", "")
      .order("created_at", { ascending: false })
      .limit(MAX_LEADS_PER_RUN);

    if (error) throw error;

    const validLeads = (leads || []).filter(l => l.name.split(/\s+/).filter((p: string) => p.length >= 2).length >= 2);

    if (validLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No leads need LinkedIn backfill" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`\n=== Processing ${validLeads.length} leads with gpt-4o-mini ===`);
    let found = 0;
    let processed = 0;
    const agentStats = { totalTurns: 0, gaveUp: 0, gaveUpReasons: [] as string[] };

    for (const lead of validLeads) {
      processed++;
      console.log(`\n[${processed}/${validLeads.length}] ${lead.name} (${lead.company})`);

      const result = await processLead(lead, FIRECRAWL_API_KEY, OPENAI_API_KEY, supabase, "gpt-4o-mini", FLASH_MAX_TURNS);
      agentStats.totalTurns += result.turnsUsed;

      if (result.found) {
        found++;
        console.log(`  MATCHED (${result.turnsUsed} turns)`);
      } else {
        agentStats.gaveUp++;
        if (result.gaveUpReason) {
          agentStats.gaveUpReasons.push(`${lead.name}: ${result.gaveUpReason}`);
        }
        console.log(`  NO MATCH (${result.turnsUsed} turns): ${result.gaveUpReason}`);
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    // Check how many remain
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

    const avgTurns = processed > 0 ? (agentStats.totalTurns / processed).toFixed(1) : "0";
    console.log(`\nRun complete: ${found}/${processed} matched, ${remaining || 0} leads remaining`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        found,
        remaining: remaining || 0,
        avgTurnsPerLead: parseFloat(avgTurns),
        gaveUp: agentStats.gaveUp,
        gaveUpReasons: agentStats.gaveUpReasons,
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
