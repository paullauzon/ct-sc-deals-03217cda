import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;
const DELAY_MS = 2000;

function getSeniorityScore(title: string | null): number {
  if (!title) return -2;
  const lower = title.toLowerCase();
  if (/\b(managing director|partner|ceo|president|chief|founder|co-founder)\b/.test(lower)) return 20;
  if (/\b(vp|vice president|director|principal)\b/.test(lower)) return 16;
  if (/\b(manager|associate|senior associate)\b/.test(lower)) return 10;
  if (/\b(analyst|junior|assistant)\b/.test(lower)) return 5;
  return 8;
}

function extractTitle(content: string): string | null {
  const headlineMatch = content.match(/^#+\s*(.+)/m);
  if (headlineMatch) {
    const headline = headlineMatch[1].trim();
    if (headline.length < 100 && !headline.toLowerCase().includes("linkedin")) return headline;
  }
  const match = content.match(
    /\b(CEO|CFO|COO|CTO|President|Partner|Managing Director|Vice President|VP|Director|Principal|Founder|Co-Founder|Manager|Associate|Analyst)\b/i,
  );
  return match ? match[0] : null;
}

/** Use Firecrawl Map to discover all URLs on a website, then filter for LinkedIn profile URLs */
async function mapWebsiteForLinkedIn(baseUrl: string, firecrawlKey: string): Promise<string[]> {
  try {
    let formattedUrl = baseUrl.trim();
    if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

    const response = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        search: "linkedin",
        limit: 5000,
        includeSubdomains: false,
      }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    const links: string[] = data.links || data.data?.links || [];
    
    return links.filter((l: string) => l.includes("linkedin.com/in/"));
  } catch {
    return [];
  }
}

/** Scrape team/about pages to find LinkedIn links embedded in page content */
async function scrapeTeamPagesForLinkedIn(baseUrl: string, firecrawlKey: string): Promise<string[]> {
  let formattedUrl = baseUrl.trim();
  if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;
  // Remove trailing slash
  formattedUrl = formattedUrl.replace(/\/+$/, "");

  const teamPaths = ["/about", "/team", "/our-team", "/about-us", "/leadership", "/people", "/about/team"];
  const foundLinkedIns: string[] = [];

  for (const path of teamPaths) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: `${formattedUrl}${path}`,
          formats: ["markdown", "links"],
          onlyMainContent: false,
          waitFor: 3000,
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      
      // Extract LinkedIn URLs from the links array
      const links: string[] = data.data?.links || data.links || [];
      const liLinks = links.filter((l: string) => l.includes("linkedin.com/in/"));
      
      // Also extract LinkedIn URLs from markdown content (catches JS-rendered links)
      const markdown: string = data.data?.markdown || data.markdown || "";
      const mdMatches = markdown.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/g) || [];
      
      const allLinks = [...new Set([...liLinks, ...mdMatches])];
      if (allLinks.length > 0) {
        console.log(`  Found ${allLinks.length} LinkedIn URLs on ${formattedUrl}${path}`);
        foundLinkedIns.push(...allLinks);
        break; // Found links, no need to check more pages
      }
    } catch {
      continue;
    }
  }

  return [...new Set(foundLinkedIns)];
}

/** AI verification: does this LinkedIn URL belong to this person? */
async function aiVerifyLinkedIn(
  lead: { name: string; company: string; email: string; role: string; message: string; company_url: string; website_url: string | null },
  linkedinUrl: string,
  lovableKey: string,
): Promise<{ match: boolean; title: string | null; profileContent: string }> {
  const contextParts: string[] = [];
  if (lead.company) contextParts.push(`Company: ${lead.company}`);
  if (lead.email) contextParts.push(`Email: ${lead.email}`);
  if (lead.company_url) contextParts.push(`Company URL: ${lead.company_url}`);
  if (lead.website_url) contextParts.push(`Website: ${lead.website_url}`);
  if (lead.role) contextParts.push(`Role: ${lead.role}`);
  if (lead.message) contextParts.push(`Submission: "${lead.message.substring(0, 500)}"`);

  const prompt = `You are verifying whether a LinkedIn profile URL found on a company website belongs to a specific person.

PERSON TO FIND:
Name: ${lead.name}
${contextParts.join("\n")}

LINKEDIN URL FOUND ON THEIR COMPANY WEBSITE: ${linkedinUrl}

Since this LinkedIn URL was found on the company's own website, the company match is already confirmed.
Your job is to verify the NAME matches. The URL slug should contain at least the first name or a recognizable variant.

For example, if finding "Michael Tindall" and the URL is linkedin.com/in/michael-t-661bmt/, that's a MATCH (contains "michael").
If the URL contains a completely different name like "john-smith", that's NOT a match.

Consider: the company likely only has a few people, so a first-name match on a company website is strong evidence.

Respond with ONLY a JSON object: {"match": true/false, "reason": "brief explanation"}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return { match: false, title: null, profileContent: "" };

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || "").trim();
    const jsonStr = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    
    return {
      match: parsed.match === true,
      title: null,
      profileContent: content,
    };
  } catch {
    return { match: false, title: null, profileContent: "" };
  }
}

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
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, company, email, company_url, website_url, role, message, stage2_score, linkedin_score")
      .or("linkedin_url.is.null,linkedin_url.eq.")
      .neq("name", "")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const leadsWithUrls = (leads || []).filter(
      (l) => (l.company_url && l.company_url.trim() && !l.company_url.includes("linkedin.com")) 
        || (l.website_url && l.website_url.trim()),
    );

    if (leadsWithUrls.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No leads with company URLs need LinkedIn backfill" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Website LinkedIn backfill (Map + Scrape + AI): ${leadsWithUrls.length} leads`);
    let found = 0;
    let processed = 0;
    let foundViaScrape = 0;

    for (let i = 0; i < leadsWithUrls.length; i += BATCH_SIZE) {
      const batch = leadsWithUrls.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (lead) => {
          processed++;
          const baseUrl = (lead.website_url || lead.company_url || "").trim();
          if (!baseUrl) return { lead, linkedinUrl: null, title: null, method: "none" };

          // Step 1: Use Firecrawl Map to discover LinkedIn URLs
          let linkedinUrls = await mapWebsiteForLinkedIn(baseUrl, FIRECRAWL_API_KEY);
          let method = "map";
          
          // Step 2: If Map found nothing, scrape team/about pages directly
          if (linkedinUrls.length === 0) {
            console.log(`  Map found nothing for ${lead.name}, scraping team pages...`);
            linkedinUrls = await scrapeTeamPagesForLinkedIn(baseUrl, FIRECRAWL_API_KEY);
            method = "scrape";
          }
          
          if (linkedinUrls.length === 0) {
            console.log(`  No LinkedIn URLs found on ${baseUrl} for ${lead.name}`);
            return { lead, linkedinUrl: null, title: null, method: "none" };
          }

          console.log(`  Found ${linkedinUrls.length} LinkedIn URLs via ${method} on ${baseUrl} for ${lead.name}`);

          // Quick first-name filter
          const firstName = lead.name.split(/\s+/)[0].toLowerCase();
          const filtered = linkedinUrls.filter(url => {
            const slug = url.split("linkedin.com/in/")[1]?.toLowerCase() || "";
            return slug.includes(firstName) || slug.includes(firstName.substring(0, 3));
          });

          const toVerify = filtered.length > 0 ? filtered.slice(0, 5) : linkedinUrls.slice(0, 3);

          for (const liUrl of toVerify) {
            const verification = await aiVerifyLinkedIn(lead, liUrl, LOVABLE_API_KEY);
            if (verification.match) {
              return { lead, linkedinUrl: liUrl, title: verification.title, method };
            }
          }

          return { lead, linkedinUrl: null, title: null, method: "none" };
        }),
      );

      for (const { lead, linkedinUrl, title, method } of results) {
        if (!linkedinUrl) continue;
        found++;
        if (method === "scrape") foundViaScrape++;

        const seniorityScoreValue = getSeniorityScore(title);
        const oldLinkedinScore = lead.linkedin_score || 0;
        const oldStage2 = lead.stage2_score || 0;
        const newStage2 = Math.max(0, Math.min(100, oldStage2 - oldLinkedinScore + seniorityScoreValue));

        await supabase.from("leads").update({
          linkedin_url: linkedinUrl,
          linkedin_title: title,
          linkedin_score: seniorityScoreValue,
          seniority_score: seniorityScoreValue,
          stage2_score: newStage2,
        }).eq("id", lead.id);

        console.log(`MATCHED via website ${method}: ${lead.name} → ${linkedinUrl}`);
      }

      if (i + BATCH_SIZE < leadsWithUrls.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    console.log(`Website backfill complete: ${found} found (${foundViaScrape} via team page scrape) from ${processed} leads`);
    return new Response(
      JSON.stringify({ success: true, processed, found, foundViaScrape }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-linkedin-website error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
