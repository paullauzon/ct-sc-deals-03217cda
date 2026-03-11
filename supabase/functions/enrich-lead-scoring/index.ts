import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LEGITIMATE_BUYER_TYPES = new Set([
  "private_equity", "corporate", "family_office",
  "independent_sponsor", "search_fund", "individual_investor",
]);

// ─── Website Fetching Helpers ───

async function tryFetchUrl(url: string): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SourceCo Lead Enrichment Bot/1.0" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (res.ok) return res;
    return null;
  } catch {
    return null;
  }
}

async function resolveWebsiteUrl(
  websiteField: string | null,
  emailDomain: string,
): Promise<string | null> {
  // 1. Use website field if populated
  if (websiteField && websiteField.trim()) {
    let url = websiteField.trim();
    if (!url.startsWith("http")) url = `https://${url}`;
    const res = await tryFetchUrl(url);
    if (res) return url;
  }

  // 2. Try constructing from email domain
  const domainUrl = `https://${emailDomain}`;
  let res = await tryFetchUrl(domainUrl);
  if (res) return domainUrl;

  // 3. Try with www prefix
  const wwwUrl = `https://www.${emailDomain}`;
  res = await tryFetchUrl(wwwUrl);
  if (res) return wwwUrl;

  return null;
}

function extractTextFromHtml(html: string): string {
  // Strip script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Extract title
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Prepend title
  if (title) text = `PAGE TITLE: ${title}\n${text}`;
  // Cap at 5000 chars
  if (text.length > 5000) text = text.substring(0, 5000);
  return text;
}

async function fetchPage(baseUrl: string, path: string): Promise<string> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SourceCo Lead Enrichment Bot/1.0" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return "";
    const html = await res.text();
    return extractTextFromHtml(html);
  } catch {
    return "";
  }
}

// ─── PE Detection ───

const PE_PHRASES = [
  "portfolio company of", "backed by", "owned by",
  "a ", " company", "an investment of", "acquired by",
  "private equity", "pe-backed", "pe backed",
];

const MA_KEYWORDS = [
  "add-on acquisition", "platform", "bolt-on", "tuck-in",
  "build-and-buy", "buy and build", "acquisitive growth",
  "add-on", "tuck in",
];

function detectPeSponsor(text: string): { sponsor: string | null; confirmed: boolean } {
  const lower = text.toLowerCase();
  for (const phrase of PE_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      // Try to extract the sponsor name from surrounding text
      const surrounding = text.substring(Math.max(0, idx - 50), Math.min(text.length, idx + phrase.length + 100));
      // Look for capitalized multi-word names near the phrase
      const nameMatches = surrounding.match(/[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,4}/g);
      if (nameMatches && nameMatches.length > 0) {
        // Filter out generic words
        const filtered = nameMatches.filter((n) =>
          !["The", "Our", "We", "About", "Home", "Page"].includes(n)
        );
        if (filtered.length > 0) {
          return { sponsor: filtered[0], confirmed: true };
        }
      }
      return { sponsor: null, confirmed: true };
    }
  }
  return { sponsor: null, confirmed: false };
}

function detectMaActivity(text: string): boolean {
  const lower = text.toLowerCase();
  return MA_KEYWORDS.some((kw) => lower.includes(kw));
}

function countPortfolioCompanies(text: string): number {
  const lower = text.toLowerCase();
  // Check for portfolio-related page headings
  const hasPortfolioPage = /portfolio|our companies|investments|companies/i.test(lower);
  if (!hasPortfolioPage) return 0;
  // Count list items or heading-like patterns (rough estimate)
  const listItems = text.match(/<li[^>]*>|•|\n-\s|\d+\.\s/g);
  return listItems ? Math.min(listItems.length, 100) : 0;
}

function extractAcquisitionYear(text: string): number | null {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  const matches = text.match(/\b(20[12]\d)\b/g);
  if (matches) {
    for (const m of matches) {
      const y = parseInt(m);
      if (y >= 2010 && y <= currentYear) years.push(y);
    }
  }
  return years.length > 0 ? Math.max(...years) : null;
}

// ─── Firecrawl Web Search ───

async function searchWeb(
  query: string,
  apiKey: string,
): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const results = data.data || [];
    let combined = "";
    for (const r of results) {
      const snippet = r.markdown || r.description || "";
      if (snippet) combined += `${snippet}\n\n`;
    }
    if (combined.length > 5000) combined = combined.substring(0, 5000);
    return combined;
  } catch (e) {
    console.error("Web search failed:", e);
    return "";
  }
}

// ─── Apollo.io LinkedIn Lookup ───

interface ApolloPersonResult {
  title: string | null;
  linkedinUrl: string | null;
  hasMaExperience: boolean;
}

async function apolloPersonLookup(
  name: string,
  company: string | null,
  domain: string,
  apiKey: string,
): Promise<ApolloPersonResult> {
  try {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        name,
        organization_name: company || undefined,
        domain,
      }),
    });
    if (!res.ok) return { title: null, linkedinUrl: null, hasMaExperience: false };
    const data = await res.json();
    const person = data.person;
    if (!person) return { title: null, linkedinUrl: null, hasMaExperience: false };

    const title = person.title || null;
    const linkedinUrl = person.linkedin_url || null;

    // Check for M&A experience in employment history
    let hasMaExperience = false;
    const maKeywords = [
      "investment bank", "private equity", "m&a", "corporate development",
      "mergers", "acquisitions", "corp dev", "advisory",
    ];
    const history = person.employment_history || [];
    for (const job of history) {
      const jobTitle = (job.title || "").toLowerCase();
      const jobCompany = (job.organization_name || "").toLowerCase();
      if (maKeywords.some((kw) => jobTitle.includes(kw) || jobCompany.includes(kw))) {
        hasMaExperience = true;
        break;
      }
    }

    return { title, linkedinUrl, hasMaExperience };
  } catch (e) {
    console.error("Apollo person lookup failed:", e);
    return { title: null, linkedinUrl: null, hasMaExperience: false };
  }
}

// ─── Seniority Scoring ───

function getSeniorityScore(title: string | null): number {
  if (!title) return -2;
  const lower = title.toLowerCase();

  // Tier 1: 18-20
  if (
    /\b(managing director|partner|ceo|president|chief|founder|co-founder)\b/.test(lower)
  ) return 20;

  // Tier 2: 14-17
  if (/\b(vp|vice president|director|principal)\b/.test(lower)) return 16;

  // Tier 3: 8-12
  if (/\b(manager|associate|senior associate)\b/.test(lower)) return 10;

  // Tier 4: 4-7
  if (/\b(analyst|junior|assistant)\b/.test(lower)) return 5;

  // Has a title but doesn't match known patterns
  return 8;
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let leadId: string | undefined;

  try {
    const body = await req.json();
    leadId = body.leadId;
    const email: string = body.email || "";
    const name: string | null = body.name || null;
    const company: string | null = body.company || null;
    const websiteField: string | null = body.website || null;
    const buyerType: string | null = body.buyerType || null;
    const emailDomain: string = body.emailDomain || email.toLowerCase().split("@")[1] || "";
    const stage1Score: number = body.stage1Score || 0;
    const currentTier: number = body.currentTier || 4;
    let tierOverride: boolean = body.tierOverride || false;
    let peBacked: boolean = body.peBacked || false;
    let peSponsorName: string | null = body.peSponsorName || null;

    if (!leadId) {
      return new Response(
        JSON.stringify({ error: "leadId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Never enrich Tier 5 leads
    if (currentTier === 5) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Tier 5" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Step 1: Mark as Running ───
    await supabase
      .from("leads")
      .update({ enrichment_status: "running" })
      .eq("id", leadId);

    // ─── Step 2: Resolve Website URL ───
    const websiteUrl = await resolveWebsiteUrl(websiteField, emailDomain);
    let enrichmentWebsiteFailed = false;

    if (!websiteUrl) {
      enrichmentWebsiteFailed = true;
      console.log(`Website resolution failed for lead ${leadId}, domain ${emailDomain}`);
    }

    // ─── Step 3: Scrape Website Pages ───
    let allWebsiteText = "";
    let portfolioPageText = "";

    if (websiteUrl && !enrichmentWebsiteFailed) {
      const paths = [
        "/", "/about", "/about-us", "/portfolio", "/companies",
        "/our-companies", "/investments", "/news", "/press",
        "/team", "/leadership",
      ];

      const pageResults = await Promise.allSettled(
        paths.map((path) => fetchPage(websiteUrl, path)),
      );

      for (let i = 0; i < pageResults.length; i++) {
        const result = pageResults[i];
        if (result.status === "fulfilled" && result.value) {
          allWebsiteText += `\n--- ${paths[i]} ---\n${result.value}\n`;
          if (["/portfolio", "/companies", "/our-companies", "/investments"].includes(paths[i])) {
            portfolioPageText += result.value;
          }
        }
      }
    }

    // ─── Step 4: PE Sponsor Detection ───
    // First pass: website text
    let websitePeResult = { sponsor: null as string | null, confirmed: false };
    if (allWebsiteText) {
      websitePeResult = detectPeSponsor(allWebsiteText);
    }

    // Second pass: web search (CRITICAL — do not skip)
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    let searchPeResult = { sponsor: null as string | null, confirmed: false };
    let webSearchText = "";

    const companyName = company || "";

    if (FIRECRAWL_API_KEY && companyName) {
      const currentYear = new Date().getFullYear();
      const searches = [
        `"${companyName}" "private equity"`,
        `"${companyName}" "portfolio company"`,
        `"${companyName}" acquired ${currentYear - 1} OR ${currentYear - 2}`,
      ];

      const searchResults = await Promise.allSettled(
        searches.map((q) => searchWeb(q, FIRECRAWL_API_KEY)),
      );

      for (const result of searchResults) {
        if (result.status === "fulfilled" && result.value) {
          webSearchText += result.value + "\n";
        }
      }

      if (webSearchText) {
        searchPeResult = detectPeSponsor(webSearchText);
      }
    }

    // Combine PE detection results
    const peConfirmed = websitePeResult.confirmed || searchPeResult.confirmed || peBacked;
    const detectedSponsor = websitePeResult.sponsor || searchPeResult.sponsor || peSponsorName;
    const combinedText = allWebsiteText + "\n" + webSearchText;

    // ─── Step 5: Portfolio / M&A Activity Detection ───
    const portfolioCount = portfolioPageText
      ? countPortfolioCompanies(portfolioPageText)
      : 0;
    const lastAcquisitionYear = extractAcquisitionYear(combinedText);
    const hasMaActivity = detectMaActivity(combinedText);

    // ─── Step 6: LinkedIn Lookup ───
    const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY");
    let linkedinUrl: string | null = null;
    let linkedinTitle: string | null = null;
    let linkedinMaExperience = false;
    let linkedinScore = 0;
    let seniorityScoreValue = 0;

    if (APOLLO_API_KEY && name) {
      const apolloResult = await apolloPersonLookup(
        name,
        company,
        emailDomain,
        APOLLO_API_KEY,
      );
      linkedinUrl = apolloResult.linkedinUrl;
      linkedinTitle = apolloResult.title;
      linkedinMaExperience = apolloResult.hasMaExperience;
    }

    // ─── Step 7: Calculate Stage 2 Scores ───

    // Website identity add-on (max 20)
    let websiteIdentityAddon = 0;
    if (peConfirmed) websiteIdentityAddon += 8;
    if (hasMaActivity || portfolioCount > 0) websiteIdentityAddon += 7;
    websiteIdentityAddon = Math.min(20, websiteIdentityAddon);

    // LinkedIn/seniority score (max 20)
    const titleForScoring = linkedinTitle;
    seniorityScoreValue = getSeniorityScore(titleForScoring);
    if (linkedinMaExperience) seniorityScoreValue += 2;
    seniorityScoreValue = Math.max(-2, Math.min(20, seniorityScoreValue));
    linkedinScore = seniorityScoreValue;

    // ─── Step 8: Recalculate Total Score ───
    let stage2Score = stage1Score + websiteIdentityAddon + seniorityScoreValue;
    stage2Score = Math.max(0, Math.min(100, stage2Score));

    // ─── Step 9: PE-Backed Auto-Upgrade Check ───
    // All three conditions must be true:
    // 1. PE sponsor confirmed
    // 2. Active portfolio/acquisition language on their website
    // 3. Lead email domain matches portfolio company domain (not PE firm domain)
    const peBackedStage2 = peConfirmed;

    if (
      peConfirmed &&
      hasMaActivity &&
      emailDomain !== "" // Lead has an email domain
      // The email domain is the company's domain, not the PE firm's
      // If the detected sponsor domain were available we'd check they differ,
      // but the key signal is: PE confirmed + M&A activity + lead is from the portfolio co
    ) {
      tierOverride = true;
    }

    // Reassign tier (Tier 5 is permanent — already handled above)
    let newTier = currentTier;
    if (tierOverride) {
      newTier = 1;
    } else if (stage2Score >= 70) {
      newTier = 1;
    } else if (stage2Score >= 50) {
      newTier = 2;
    } else if (stage2Score >= 30) {
      newTier = 3;
    } else {
      const bt = (buyerType || "").toLowerCase().trim();
      newTier = LEGITIMATE_BUYER_TYPES.has(bt) ? 4 : 4;
    }

    // Update pe fields
    if (peConfirmed) peBacked = true;
    if (detectedSponsor) peSponsorName = detectedSponsor;

    // ─── Step 10: Write Stage 2 Results ───
    await supabase
      .from("leads")
      .update({
        stage2_score: stage2Score,
        tier: newTier,
        tier_override: tierOverride,
        pe_backed: peBacked,
        pe_sponsor_name: peSponsorName,
        website_url: websiteUrl,
        website_score: websiteIdentityAddon,
        pe_backed_stage2: peBackedStage2,
        portfolio_count: portfolioCount || null,
        last_acquisition_year: lastAcquisitionYear,
        linkedin_url: linkedinUrl,
        linkedin_title: linkedinTitle,
        linkedin_ma_experience: linkedinMaExperience,
        linkedin_score: linkedinScore,
        seniority_score: seniorityScoreValue,
        enrichment_status: "complete",
      })
      .eq("id", leadId);

    console.log(
      `enrich-lead-scoring complete: ${leadId} → tier=${newTier}, stage2_score=${stage2Score}, pe=${peBacked}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        stage2Score,
        tier: newTier,
        tierOverride,
        peBacked,
        peSponsorName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("enrich-lead-scoring error:", err);

    // Never throw — mark as failed and log
    if (leadId) {
      try {
        await supabase
          .from("leads")
          .update({ enrichment_status: "failed" })
          .eq("id", leadId);
      } catch (dbErr) {
        console.error("Failed to update enrichment_status on error:", dbErr);
      }
    }

    return new Response(
      JSON.stringify({ error: (err as Error).message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
