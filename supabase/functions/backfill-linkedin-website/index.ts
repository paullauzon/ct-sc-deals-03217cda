import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;
const DELAY_MS = 2000;

/** Check if a LinkedIn URL slug matches a person's name */
function nameMatchesSlug(name: string, url: string): boolean {
  const slugMatch = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!slugMatch) return false;
  const slug = slugMatch[1].toLowerCase().replace(/[-_]/g, " ");
  
  const nameParts = name.toLowerCase().split(/\s+/).filter((p) => p.length >= 2);
  if (nameParts.length === 0) return false;
  
  // Check if first AND last name parts appear in slug
  const first = nameParts[0];
  const last = nameParts[nameParts.length - 1];
  return slug.includes(first) && slug.includes(last);
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

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Get leads that still need LinkedIn AND have a company_url or website_url
    // Include both NULL and empty string (empty = searched by Serper but not found)
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, company, company_url, website_url, stage2_score, linkedin_score")
      .or("linkedin_url.is.null,linkedin_url.eq.")
      .neq("name", "")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Filter to leads with a usable URL
    const leadsWithUrls = (leads || []).filter(
      (l) => (l.company_url && l.company_url.trim()) || (l.website_url && l.website_url.trim()),
    );

    if (leadsWithUrls.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No leads with company URLs need LinkedIn backfill" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Website LinkedIn backfill: ${leadsWithUrls.length} leads with company URLs`);
    let found = 0;
    let processed = 0;

    for (let i = 0; i < leadsWithUrls.length; i += BATCH_SIZE) {
      const batch = leadsWithUrls.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (lead) => {
          processed++;
          const baseUrl = (lead.company_url || lead.website_url || "").trim();
          if (!baseUrl) return { lead, linkedinUrl: null };

          let formattedUrl = baseUrl;
          if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

          // Try team/about pages to find LinkedIn links
          const pagePaths = ["", "/about", "/about-us", "/team", "/our-team", "/leadership", "/people", "/staff"];
          
          for (const path of pagePaths) {
            try {
              const scrapeUrl = `${formattedUrl.replace(/\/$/, "")}${path}`;
              const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  url: scrapeUrl,
                  formats: ["links"],
                  waitFor: 3000,
                }),
              });

              if (!response.ok) continue;
              const data = await response.json();
              
              // Extract LinkedIn profile URLs from links
              const links: string[] = data.data?.links || data.links || [];
              const linkedinLinks = links.filter((l: string) => l.includes("linkedin.com/in/"));

              // Match by name
              for (const liUrl of linkedinLinks) {
                if (nameMatchesSlug(lead.name, liUrl)) {
                  return { lead, linkedinUrl: liUrl };
                }
              }
            } catch {
              // Skip failed pages
            }
          }

          return { lead, linkedinUrl: null };
        }),
      );

      for (const { lead, linkedinUrl } of results) {
        if (!linkedinUrl) continue;
        found++;

        const seniorityScoreValue = getSeniorityScore(null); // No title from URL alone
        const oldLinkedinScore = lead.linkedin_score || 0;
        const oldStage2 = lead.stage2_score || 0;
        const newStage2 = Math.max(0, Math.min(100, oldStage2 - oldLinkedinScore + seniorityScoreValue));

        await supabase.from("leads").update({
          linkedin_url: linkedinUrl,
          linkedin_score: seniorityScoreValue,
          seniority_score: seniorityScoreValue,
          stage2_score: newStage2,
        }).eq("id", lead.id);
      }

      if (i + BATCH_SIZE < leadsWithUrls.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    console.log(`Website backfill complete: ${found} LinkedIn profiles found from ${processed} leads`);
    return new Response(
      JSON.stringify({ success: true, processed, found }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-linkedin-website error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
