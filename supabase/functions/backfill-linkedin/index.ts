import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;
const DELAY_MS = 2000;

// ─── Nickname Mapping ───
const NICKNAMES: Record<string, string[]> = {
  michael: ["mike", "mick"],
  robert: ["rob", "bob", "bobby"],
  william: ["will", "bill", "billy"],
  james: ["jim", "jimmy"],
  richard: ["rick", "rich", "dick"],
  thomas: ["tom", "tommy"],
  christopher: ["chris"],
  joseph: ["joe", "joey"],
  charles: ["charlie", "chuck"],
  daniel: ["dan", "danny"],
  matthew: ["matt"],
  anthony: ["tony"],
  edward: ["ed", "eddie", "ted"],
  kenneth: ["ken", "kenny"],
  nicholas: ["nick"],
  stephen: ["steve"],
  steven: ["steve"],
  timothy: ["tim"],
  benjamin: ["ben"],
  jonathan: ["jon"],
  lawrence: ["larry"],
  patrick: ["pat"],
  raymond: ["ray"],
  samuel: ["sam"],
  alexander: ["alex"],
  katherine: ["kate", "kathy"],
  elizabeth: ["liz", "beth"],
  jennifer: ["jen", "jenny"],
  margaret: ["maggie", "meg"],
  patricia: ["pat", "patty"],
  deborah: ["deb", "debbie"],
  andrew: ["drew", "andy"],
  gregory: ["greg"],
  jeffrey: ["jeff"],
  ronald: ["ron", "ronnie"],
  donald: ["don", "donnie"],
  gerald: ["gerry", "jerry"],
  douglas: ["doug"],
  phillip: ["phil"],
  philip: ["phil"],
};

function getNameVariants(firstName: string): string[] {
  const lower = firstName.toLowerCase();
  const variants = [firstName];
  // Add nicknames for this first name
  if (NICKNAMES[lower]) {
    for (const nick of NICKNAMES[lower]) {
      variants.push(nick.charAt(0).toUpperCase() + nick.slice(1));
    }
  }
  // Also check reverse: if "Mike" is given, add "Michael"
  for (const [full, nicks] of Object.entries(NICKNAMES)) {
    if (nicks.includes(lower)) {
      variants.push(full.charAt(0).toUpperCase() + full.slice(1));
    }
  }
  return [...new Set(variants)];
}

// ─── Email Domain to Company Name ───
function emailDomainToCompanyName(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1].split(".")[0].toLowerCase();
  if (!domain || domain.length < 3) return null;
  // Split camelCase and concatenated words
  let expanded = domain.replace(/([a-z])([A-Z])/g, "$1 $2");
  expanded = expanded.replace(/(capital|equity|partners|advisory|advisors|ventures|group|holdings|management|invest|financial|consulting|strategies|solutions|properties|services|industries|enterprises|technologies|global|international)/gi, " $1 ");
  expanded = expanded.replace(/\s+/g, " ").trim();
  if (expanded === domain) {
    // Try inserting spaces at common word boundaries
    expanded = domain.replace(/([a-z])([a-z]*)(oak|bay|rock|river|lake|peak|stone|bridge|wood|field|hill|vale|glen|port|land|fort|park|spring|star|sun|moon|fire|iron|gold|silver|blue|red|green|black|white|north|south|east|west)/gi, "$1$2 $3");
    expanded = expanded.replace(/\s+/g, " ").trim();
  }
  return expanded.includes(" ") ? expanded : null;
}

// ─── Company Name Utilities ───

function cleanCompanyName(company: string): string {
  return company
    .replace(/\b(LLC|Inc\.?|Corp\.?|Corporation|Ltd\.?|LP|LLP|Group|Holdings|Co\.?|Company|Partners|Capital|Management|Advisors|Advisory)\b/gi, "")
    .replace(/[.,]+$/, "")
    .trim();
}

function expandConcatenatedName(name: string): string {
  let expanded = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  if (!expanded.includes(" ") && expanded.length > 6) {
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

// ─── Candidate Collection ───

interface Candidate {
  url: string;
  profileContent: string; // rich markdown or snippet
  source: string;
}

function extractLinkedInCandidates(results: SearchResult[], source: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const r of results) {
    if (r.url?.includes("linkedin.com/in/")) {
      const content = r.markdown || r.description || r.title || "";
      candidates.push({ url: r.url, profileContent: content.substring(0, 3000), source });
    }
  }
  return candidates;
}

function buildCompanyQueries(name: string, company: string | null): string[] {
  const queries: string[] = [];
  if (!company || !company.trim()) return queries;
  const clean = cleanCompanyName(company);
  if (clean) queries.push(`site:linkedin.com/in "${name}" "${clean}"`);
  const expanded = expandConcatenatedName(clean || company);
  if (expanded !== clean && expanded.includes(" ")) {
    queries.push(`site:linkedin.com/in "${name}" "${expanded}"`);
  }
  return queries;
}

async function collectAllCandidates(
  name: string,
  company: string | null,
  email: string | null,
  companyUrl: string | null,
  apiKey: string,
): Promise<Candidate[]> {
  const allCandidates: Candidate[] = [];
  const seenUrls = new Set<string>();
  const firstName = name.split(/\s+/)[0];

  const addCandidates = (candidates: Candidate[]) => {
    for (const c of candidates) {
      const normalizedUrl = c.url.split("?")[0].replace(/\/$/, "");
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        allCandidates.push(c);
      }
    }
  };

  // Helper: filter search results by first name appearing in URL or content
  const filterByFirstName = (results: SearchResult[], source: string): Candidate[] => {
    const candidates: Candidate[] = [];
    const firstLower = firstName.toLowerCase();
    for (const r of results) {
      if (!r.url?.includes("linkedin.com/in/")) continue;
      const urlSlug = r.url.split("linkedin.com/in/")[1]?.toLowerCase() || "";
      const content = (r.markdown || r.description || r.title || "").toLowerCase();
      if (urlSlug.includes(firstLower) || content.includes(firstLower)) {
        candidates.push({
          url: r.url,
          profileContent: (r.markdown || r.description || r.title || "").substring(0, 3000),
          source,
        });
      }
    }
    return candidates;
  };

  try {
    // Pass 0: Company-first employee discovery
    if (company && company.trim()) {
      const clean = cleanCompanyName(company);
      if (clean) {
        // Search for company employees on LinkedIn (without person name)
        const empResults = await firecrawlSearch(
          `"${clean}" site:linkedin.com/in`, apiKey, 10, true,
        );
        addCandidates(filterByFirstName(empResults, "company-employees"));

        // Also try expanded company name
        const expanded = expandConcatenatedName(clean);
        if (expanded !== clean && expanded.includes(" ")) {
          const empResults2 = await firecrawlSearch(
            `"${expanded}" site:linkedin.com/in`, apiKey, 10, true,
          );
          addCandidates(filterByFirstName(empResults2, "company-employees-expanded"));
        }
      }
    }

    // Pass 1: Name + Company variants (existing)
    const companyQueries = buildCompanyQueries(name, company);
    for (const query of companyQueries) {
      const results = await firecrawlSearch(query, apiKey, 5, true);
      addCandidates(extractLinkedInCandidates(results, "company"));
      if (allCandidates.length >= 8) break;
    }

    // Pass 2: Name + Email domain (existing)
    const emailRoot = extractDomainRoot(email);
    if (emailRoot && emailRoot.length >= 3) {
      const results = await firecrawlSearch(
        `site:linkedin.com/in "${name}" "${emailRoot}"`, apiKey, 5, true,
      );
      addCandidates(extractLinkedInCandidates(results, "email"));

      const expandedDomain = expandConcatenatedName(emailRoot);
      if (expandedDomain !== emailRoot && expandedDomain.includes(" ")) {
        const results2 = await firecrawlSearch(
          `site:linkedin.com/in "${name}" "${expandedDomain}"`, apiKey, 5, true,
        );
        addCandidates(extractLinkedInCandidates(results2, "email-expanded"));
      }
    }

    // Pass 3: First name + Company (relaxed — catches nicknames/shortened names)
    if (company && company.trim() && allCandidates.length < 6) {
      const clean = cleanCompanyName(company);
      if (clean && firstName.length >= 3) {
        const results = await firecrawlSearch(
          `site:linkedin.com/in "${firstName}" "${clean}"`, apiKey, 5, true,
        );
        addCandidates(extractLinkedInCandidates(results, "firstname-company"));

        // Try nickname variants
        const variants = getNameVariants(firstName);
        for (const variant of variants) {
          if (variant === firstName || allCandidates.length >= 8) continue;
          const nickResults = await firecrawlSearch(
            `site:linkedin.com/in "${variant}" "${clean}"`, apiKey, 5, true,
          );
          addCandidates(extractLinkedInCandidates(nickResults, `nickname-${variant}`));
        }
      }
    }

    // Pass 4: Email address direct search
    if (email && email.includes("@") && allCandidates.length < 6) {
      const results = await firecrawlSearch(
        `"${email}" site:linkedin.com`, apiKey, 3, true,
      );
      addCandidates(extractLinkedInCandidates(results, "email-direct"));
    }

    // Pass 5: Name only (broader fallback)
    if (allCandidates.length < 4) {
      const results = await firecrawlSearch(
        `site:linkedin.com/in "${name}"`, apiKey, 5, true,
      );
      addCandidates(extractLinkedInCandidates(results, "name-only"));
    }

    // Pass 6: Broad search WITHOUT site: restriction
    if (allCandidates.length < 4 && company && company.trim()) {
      const clean = cleanCompanyName(company);
      if (clean) {
        const results = await firecrawlSearch(
          `"${name}" "${clean}" linkedin`, apiKey, 5, true,
        );
        addCandidates(extractLinkedInCandidates(results, "broad-search"));
      }
    }

    // Pass 7: Email domain expanded as company name
    if (allCandidates.length < 4 && email) {
      const expandedCompany = emailDomainToCompanyName(email);
      if (expandedCompany) {
        const results = await firecrawlSearch(
          `site:linkedin.com/in "${name}" "${expandedCompany}"`, apiKey, 5, true,
        );
        addCandidates(extractLinkedInCandidates(results, "email-domain-expanded"));
      }
    }

    // Pass 8: Nickname variants in company-employees search (Pass 0 extension)
    if (allCandidates.length < 4 && company && company.trim()) {
      const clean = cleanCompanyName(company);
      if (clean) {
        const variants = getNameVariants(firstName);
        for (const variant of variants) {
          if (variant === firstName || allCandidates.length >= 6) continue;
          const empResults = await firecrawlSearch(
            `"${clean}" site:linkedin.com/in`, apiKey, 10, false,
          );
          addCandidates(filterByFirstName(
            empResults.map(r => ({ ...r, _nickFilter: variant })) as any,
            `nickname-employees-${variant}`,
          ));
        }
      }
    }
  } catch (e) {
    console.error("Candidate collection failed:", e);
  }

  return allCandidates;
}

// ─── AI Verification — pick the best candidate using full lead context + rich profile ───

interface LeadContext {
  name: string;
  company: string | null;
  email: string | null;
  companyUrl: string | null;
  role: string | null;
  message: string | null;
  buyerType: string | null;
  serviceInterest: string | null;
  dealsPlanned: string | null;
  targetCriteria: string | null;
  targetRevenue: string | null;
  geography: string | null;
}

async function aiPickBestCandidate(
  lead: LeadContext,
  candidates: Candidate[],
  apiKey: string,
): Promise<{ url: string | null; profileContent: string }> {
  if (!candidates.length) return { url: null, profileContent: "" };

  const top = candidates.slice(0, 6);

  const contextParts: string[] = [];
  if (lead.company) contextParts.push(`Company: ${lead.company}`);
  if (lead.email) contextParts.push(`Email: ${lead.email}`);
  if (lead.companyUrl) contextParts.push(`Company URL: ${lead.companyUrl}`);
  if (lead.role) contextParts.push(`Role: ${lead.role}`);
  if (lead.buyerType) contextParts.push(`Buyer Type: ${lead.buyerType}`);
  if (lead.serviceInterest) contextParts.push(`Service Interest: ${lead.serviceInterest}`);
  if (lead.dealsPlanned) contextParts.push(`Deals Planned: ${lead.dealsPlanned}`);
  if (lead.targetCriteria) contextParts.push(`Target Criteria: ${lead.targetCriteria}`);
  if (lead.targetRevenue) contextParts.push(`Target Revenue: ${lead.targetRevenue}`);
  if (lead.geography) contextParts.push(`Geography: ${lead.geography}`);
  if (lead.message) contextParts.push(`Submission Message: "${lead.message.substring(0, 800)}"`);

  const candidateList = top
    .map((c, i) => {
      const contentPreview = c.profileContent.substring(0, 1500);
      return `--- CANDIDATE ${i + 1} ---\nURL: ${c.url}\nFound via: ${c.source}\nProfile Content:\n${contentPreview}`;
    })
    .join("\n\n");

  const prompt = `You are matching a person to their correct LinkedIn profile. You have RICH profile data from each candidate.

PERSON TO FIND:
Name: ${lead.name}
${contextParts.join("\n")}

LINKEDIN CANDIDATES (with full profile content):
${candidateList}

MATCHING RULES:
1. The name on the LinkedIn profile must match "${lead.name}" (allow minor variations like nicknames).
2. The company in their CURRENT experience must match or be clearly related to "${lead.company || "unknown"}".
3. If the email domain is "${extractDomainRoot(lead.email)}", the LinkedIn profile's company should align with that domain.
4. The URL slug should contain parts of the person's name — if it contains a completely different name, REJECT it.
5. Their industry/role should be consistent with their submission message context.
6. If NO candidate is a confident match, say "none".

Respond with ONLY the number (1, 2, etc.) of the correct match, or "none". Nothing else.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return { url: null, profileContent: "" };

    const data = await response.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();

    if (answer === "none" || answer === "0") return { url: null, profileContent: "" };

    const num = parseInt(answer);
    if (num >= 1 && num <= top.length) {
      return { url: top[num - 1].url, profileContent: top[num - 1].profileContent };
    }

    return { url: null, profileContent: "" };
  } catch (e) {
    console.error("AI pick failed:", e);
    return { url: null, profileContent: "" };
  }
}

// ─── Extract title & M&A from rich profile content ───

function extractTitle(content: string): string | null {
  // Try headline pattern (common in LinkedIn markdown)
  const headlineMatch = content.match(/^#+\s*(.+)/m);
  if (headlineMatch) {
    const headline = headlineMatch[1].trim();
    if (headline.length < 100 && !headline.toLowerCase().includes("linkedin")) {
      return headline;
    }
  }

  // Try "title at company" pattern
  const titleMatch = content.match(/[-–—]\s*(.+?)(?:\s+at\s+|\s+[-–—]\s+|\s*$)/i);
  if (titleMatch) {
    const title = titleMatch[1].trim().replace(/\s*[-–—]\s*LinkedIn.*$/i, "").trim();
    if (title.length > 2) return title;
  }

  // Try known title keywords
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
      .select("id, name, company, email, company_url, role, message, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography, stage1_score, stage2_score, website_score, linkedin_score, seniority_score, linkedin_ma_experience")
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

    console.log(`Backfilling LinkedIn (Firecrawl + AI) for ${validLeads.length} leads`);
    let found = 0;
    let processed = 0;

    for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
      const batch = validLeads.slice(i, i + BATCH_SIZE);

      for (const lead of batch) {
        processed++;

        const candidates = await collectAllCandidates(
          lead.name, lead.company, lead.email, lead.company_url, FIRECRAWL_API_KEY,
        );

        if (candidates.length === 0) {
          await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
          console.log(`NO CANDIDATES: ${lead.name} (${lead.company})`);
          continue;
        }

        const leadContext: LeadContext = {
          name: lead.name,
          company: lead.company,
          email: lead.email,
          companyUrl: lead.company_url,
          role: lead.role,
          message: lead.message,
          buyerType: lead.buyer_type,
          serviceInterest: lead.service_interest,
          dealsPlanned: lead.deals_planned,
          targetCriteria: lead.target_criteria,
          targetRevenue: lead.target_revenue,
          geography: lead.geography,
        };

        const aiResult = await aiPickBestCandidate(leadContext, candidates, LOVABLE_API_KEY);

        if (!aiResult.url) {
          await supabase.from("leads").update({ linkedin_url: "" }).eq("id", lead.id);
          console.log(`AI REJECTED ALL (${candidates.length} candidates): ${lead.name} (${lead.company})`);
          continue;
        }

        found++;
        const finalTitle = extractTitle(aiResult.profileContent);
        const finalMa = detectMaExperience(aiResult.profileContent);

        let seniorityScoreValue = getSeniorityScore(finalTitle);
        if (finalMa) seniorityScoreValue += 2;
        seniorityScoreValue = Math.max(-2, Math.min(20, seniorityScoreValue));

        const oldLinkedinScore = lead.linkedin_score || 0;
        const oldStage2 = lead.stage2_score || 0;
        const newStage2 = Math.max(0, Math.min(100, oldStage2 - oldLinkedinScore + seniorityScoreValue));

        await supabase.from("leads").update({
          linkedin_url: aiResult.url,
          linkedin_title: finalTitle,
          linkedin_ma_experience: finalMa,
          linkedin_score: seniorityScoreValue,
          seniority_score: seniorityScoreValue,
          stage2_score: newStage2,
        }).eq("id", lead.id);

        console.log(`MATCHED: ${lead.name} (${lead.company}) → ${aiResult.url}`);

        // Rate limit between individual leads
        await new Promise((r) => setTimeout(r, 800));
      }

      if (i + BATCH_SIZE < validLeads.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    console.log(`Backfill complete: ${found} AI-verified matches out of ${processed} leads`);
    return new Response(
      JSON.stringify({ success: true, processed, found, total: validLeads.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-linkedin error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
