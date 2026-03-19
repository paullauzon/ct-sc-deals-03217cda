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

function tokenize(input: string): string[] {
  const words = input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  return [...new Set(words)];
}

// ─── LinkedIn Search Helpers ───

interface Candidate {
  url: string;
  snippet: string;
  source: string; // which pass found it
}

function extractLinkedInFromResults(
  organic: Array<{ link?: string; snippet?: string; title?: string }>,
  source: string,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const result of organic) {
    if (result.link?.includes("linkedin.com/in/")) {
      const snip = (result.snippet || "") + " " + (result.title || "");
      candidates.push({ url: result.link, snippet: snip, source });
    }
  }
  return candidates;
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

function buildCompanyQueries(name: string, company: string | null): string[] {
  const queries: string[] = [];
  if (!company || !company.trim()) return queries;
  const clean = cleanCompanyName(company);
  if (clean) queries.push(`site:linkedin.com/in/ "${name}" "${clean}"`);
  const expanded = expandConcatenatedName(clean || company);
  if (expanded !== clean && expanded.includes(" ")) {
    queries.push(`site:linkedin.com/in/ "${name}" "${expanded}"`);
  }
  const words = tokenize(expanded || clean || company);
  const significantWord = words.find(w => w.length >= 4 && !["the", "and", "for"].includes(w));
  if (significantWord && significantWord !== clean?.toLowerCase()) {
    queries.push(`site:linkedin.com/in/ "${name}" "${significantWord}"`);
  }
  return queries;
}

// ─── Collect ALL candidates from ALL passes ───

async function collectAllCandidates(
  name: string,
  company: string | null,
  email: string | null,
  companyUrl: string | null,
  apiKey: string,
): Promise<Candidate[]> {
  const allCandidates: Candidate[] = [];
  const seenUrls = new Set<string>();

  const addCandidates = (candidates: Candidate[]) => {
    for (const c of candidates) {
      if (!seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        allCandidates.push(c);
      }
    }
  };

  try {
    // Pass 1: Name + Company variants
    const companyQueries = buildCompanyQueries(name, company);
    for (const query of companyQueries) {
      const results = await serperSearch(query, apiKey);
      addCandidates(extractLinkedInFromResults(results, "company"));
      if (allCandidates.length >= 8) break; // enough candidates
    }

    // Pass 2: Name + Email domain
    const emailRoot = extractDomainRoot(email);
    if (emailRoot && emailRoot.length >= 3) {
      const results = await serperSearch(`site:linkedin.com/in/ "${name}" "${emailRoot}"`, apiKey);
      addCandidates(extractLinkedInFromResults(results, "email"));

      const expandedDomain = expandConcatenatedName(emailRoot);
      if (expandedDomain !== emailRoot && expandedDomain.includes(" ")) {
        const results2 = await serperSearch(`site:linkedin.com/in/ "${name}" "${expandedDomain}"`, apiKey);
        addCandidates(extractLinkedInFromResults(results2, "email-expanded"));
      }
    }

    // Pass 3: Name only (broader search)
    if (allCandidates.length < 5) {
      const results = await serperSearch(`site:linkedin.com/in/ "${name}"`, apiKey, 10);
      addCandidates(extractLinkedInFromResults(results, "name-only"));
    }

    // Pass 3b: Name without quotes
    if (allCandidates.length < 3) {
      const nameParts = name.split(/\s+/).filter(p => p.length >= 2);
      if (nameParts.length >= 2) {
        const results = await serperSearch(`site:linkedin.com/in/ ${name}`, apiKey, 10);
        addCandidates(extractLinkedInFromResults(results, "name-unquoted"));
      }
    }
  } catch (e) {
    console.error("Candidate collection failed:", e);
  }

  return allCandidates;
}

// ─── AI Verification — pick the best candidate using full lead context ───

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
): Promise<{ url: string | null; snippet: string }> {
  if (!candidates.length) return { url: null, snippet: "" };

  // Deduplicate and limit to top 8
  const top = candidates.slice(0, 8);

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
  if (lead.message) contextParts.push(`Submission Message: "${lead.message.substring(0, 500)}"`);

  const candidateList = top
    .map((c, i) => `${i + 1}. URL: ${c.url}\n   Info: ${c.snippet.substring(0, 300)}\n   Found via: ${c.source}`)
    .join("\n");

  const prompt = `You are finding the correct LinkedIn profile for a specific person. Be STRICT — only pick a match if you are confident.

PERSON:
Name: ${lead.name}
${contextParts.join("\n")}

LINKEDIN CANDIDATES:
${candidateList}

RULES:
- The profile MUST belong to someone at the SAME company or a clearly related entity.
- Check the URL slug — if it contains a completely different name (e.g., looking for "Gabriel Fogel" but URL has "brandon-camelione"), it's WRONG.
- Email domain should match the company in the LinkedIn profile.
- The person's submission message gives context about their industry/business — use it.
- If the person says they do "M&A in home services" but the LinkedIn shows "software engineer", that's wrong.
- If NO candidate is a confident match, say "none".

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

    if (!response.ok) return { url: null, snippet: "" };

    const data = await response.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();

    if (answer === "none" || answer === "0") return { url: null, snippet: "" };

    const num = parseInt(answer);
    if (num >= 1 && num <= top.length) {
      return { url: top[num - 1].url, snippet: top[num - 1].snippet };
    }

    return { url: null, snippet: "" };
  } catch (e) {
    console.error("AI pick failed:", e);
    return { url: null, snippet: "" };
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured — needed for AI verification" }), {
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

    console.log(`Backfilling LinkedIn (with AI verification) for ${validLeads.length} leads`);
    let found = 0;
    let processed = 0;

    for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
      const batch = validLeads.slice(i, i + BATCH_SIZE);

      // Collect candidates for all leads in batch in parallel
      const candidateResults = await Promise.all(
        batch.map(async (lead) => {
          const candidates = await collectAllCandidates(
            lead.name, lead.company, lead.email, lead.company_url, SERPER_API_KEY,
          );
          return { lead, candidates };
        }),
      );

      // AI verify each lead's candidates
      for (const { lead, candidates } of candidateResults) {
        processed++;

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
        const finalTitle = extractTitle(aiResult.snippet);
        const finalMa = detectMaExperience(aiResult.snippet);

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
