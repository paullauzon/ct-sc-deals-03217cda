import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;
const DELAY_MS = 2000;
const FLASH_MAX_TURNS = 5;
const PRO_MAX_TURNS = 8;

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

SEARCH STRATEGIES (use your judgment on which to try):
1. Direct search: "FirstName LastName" "Company" site:linkedin.com/in
2. If company name looks concatenated (e.g. "Treatyoakequity"), break it into words: "Treaty Oak Equity"
3. Use the email domain to infer the real company name (e.g. hanacovc.com → "Hanaco Ventures")
4. Search WITHOUT site: restriction: "Name" "Company" linkedin — catches third-party mentions
5. Search for the company on LinkedIn first, then look for the person among results
6. Try common nicknames (Michael→Mike, Robert→Bob, William→Bill, etc.)
7. If they have a company_url, SCRAPE that URL's /about or /team page to find LinkedIn links directly
8. Scrape the company's LinkedIn page (linkedin.com/company/...) and look for employee mentions
9. If the email domain is a company, scrape it to find team/about pages
10. If all else fails, try just the person's name with their city/geography

VERIFICATION RULES (before saying "found"):
- The LinkedIn URL slug should contain at least part of the person's name (first name is sufficient)
- The profile's company/role context must align with the lead's data
- If the email domain is "xyz.com" and the LinkedIn shows a completely different company, that's wrong
- When in doubt, SCRAPE the LinkedIn profile to verify the person's details
- When in doubt, try another search rather than guessing

WHEN TO GIVE UP:
- Person appears to use a disposable/privacy email (mozmail.com, guerrillamail, etc.)
- No real company information available
- After trying multiple strategies with no relevant results
- The person is clearly too obscure to have a findable LinkedIn profile`;
}

async function aiSearchAgent(
  lead: LeadContext,
  firecrawlKey: string,
  lovableKey: string,
  model: string = "google/gemini-2.5-flash",
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

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: buildSystemPrompt(maxTurns) },
    {
      role: "user",
      content: `Find the LinkedIn profile for this person:\n\n${contextParts.join("\n")}\n\nWhat would you like to do first?`,
    },
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages }),
      });

      if (!response.ok) {
        console.error(`AI agent call failed: HTTP ${response.status}`);
        return { url: null, profileContent: "", turnsUsed: turn + 1, gaveUpReason: "AI call failed" };
      }

      const data = await response.json();
      const content = (data.choices?.[0]?.message?.content || "").trim();

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
        const scraped = await firecrawlScrape(parsed.url, firecrawlKey);
        
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
  lovableKey: string,
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

  const agentResult = await aiSearchAgent(leadContext, firecrawlKey, lovableKey, model, maxTurns);

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

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

    // Get leads missing LinkedIn URL (NULL only — empty string means already searched)
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, company, email, company_url, website_url, role, message, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience")
      .is("linkedin_url", null)
      .neq("name", "")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const validLeads = (leads || []).filter(l => l.name.split(/\s+/).filter((p: string) => p.length >= 2).length >= 2);

    if (validLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No leads need LinkedIn backfill" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Pass 1: Flash model (fast, cheap) ───
    console.log(`\n=== PASS 1: Flash model (${validLeads.length} leads) ===`);
    let found = 0;
    let processed = 0;
    const failedLeadIds: string[] = [];
    const agentStats = { totalTurns: 0, gaveUp: 0, gaveUpReasons: [] as string[] };

    for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
      const batch = validLeads.slice(i, i + BATCH_SIZE);

      for (const lead of batch) {
        processed++;
        console.log(`\n[Pass1 ${processed}/${validLeads.length}] ${lead.name} (${lead.company})`);

        const result = await processLead(lead, FIRECRAWL_API_KEY, LOVABLE_API_KEY, supabase, "google/gemini-2.5-flash", FLASH_MAX_TURNS);
        agentStats.totalTurns += result.turnsUsed;

        if (result.found) {
          found++;
          console.log(`  MATCHED (${result.turnsUsed} turns)`);
        } else {
          failedLeadIds.push(lead.id);
          agentStats.gaveUp++;
          if (result.gaveUpReason) {
            agentStats.gaveUpReasons.push(`${lead.name}: ${result.gaveUpReason}`);
          }
          console.log(`  NO MATCH (${result.turnsUsed} turns): ${result.gaveUpReason}`);
        }

        await new Promise((r) => setTimeout(r, 800));
      }

      if (i + BATCH_SIZE < validLeads.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    // ─── Pass 2: Pro model for failed leads (stronger reasoning, more turns) ───
    let proFound = 0;
    let proProcessed = 0;

    if (failedLeadIds.length > 0) {
      // Reset failed leads to NULL so we can retry
      for (const id of failedLeadIds) {
        await supabase.from("leads").update({ linkedin_url: null }).eq("id", id);
      }

      // Re-fetch the failed leads
      const { data: retryLeads } = await supabase
        .from("leads")
        .select("id, name, company, email, company_url, website_url, role, message, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience")
        .in("id", failedLeadIds)
        .neq("name", "");

      const retryValid = (retryLeads || []).filter(l => {
        // Skip obvious junk for the expensive pass
        const name = l.name.trim();
        if (name.split(/\s+/).length < 2) return false;
        if (/^[a-z]{1,3}\s[a-z]{1,3}$/i.test(name)) return false; // "a a", "ab cd"
        const email = (l.email || "").toLowerCase();
        if (email.includes("mozmail.com") || email.includes("guerrillamail")) return false;
        return true;
      });

      if (retryValid.length > 0) {
        console.log(`\n=== PASS 2: Pro model (${retryValid.length} leads, ${PRO_MAX_TURNS} turns) ===`);

        for (let i = 0; i < retryValid.length; i += BATCH_SIZE) {
          const batch = retryValid.slice(i, i + BATCH_SIZE);

          for (const lead of batch) {
            proProcessed++;
            console.log(`\n[Pass2 ${proProcessed}/${retryValid.length}] ${lead.name} (${lead.company})`);

            const result = await processLead(lead, FIRECRAWL_API_KEY, LOVABLE_API_KEY, supabase, "google/gemini-2.5-pro", PRO_MAX_TURNS);
            agentStats.totalTurns += result.turnsUsed;

            if (result.found) {
              proFound++;
              found++;
              console.log(`  PRO MATCHED (${result.turnsUsed} turns)`);
            } else {
              console.log(`  PRO NO MATCH (${result.turnsUsed} turns): ${result.gaveUpReason}`);
            }

            await new Promise((r) => setTimeout(r, 1200));
          }

          if (i + BATCH_SIZE < retryValid.length) {
            await new Promise((r) => setTimeout(r, DELAY_MS));
          }
        }
      }
    }

    const totalProcessed = processed;
    const avgTurns = totalProcessed > 0 ? (agentStats.totalTurns / totalProcessed).toFixed(1) : "0";
    console.log(`\nBackfill complete: ${found} total matches (Pass1: ${found - proFound}, Pass2/Pro: ${proFound}) from ${totalProcessed} leads`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        found,
        pass1Found: found - proFound,
        pass2ProFound: proFound,
        pass2ProProcessed: proProcessed,
        total: validLeads.length,
        avgTurnsPerLead: parseFloat(avgTurns),
        gaveUp: agentStats.gaveUp - proFound,
        gaveUpReasons: agentStats.gaveUpReasons.slice(0, 20),
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
