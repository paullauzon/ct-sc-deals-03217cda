import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;
const DELAY_MS = 500;

interface LeadForVerification {
  id: string;
  name: string;
  company: string;
  email: string;
  company_url: string;
  role: string;
  message: string;
  linkedin_url: string | null;
  linkedin_title: string | null;
  buyer_type: string;
  service_interest: string;
  deals_planned: string;
  target_criteria: string;
  target_revenue: string;
  geography: string;
}

async function verifyMatch(
  lead: LeadForVerification,
  apiKey: string,
): Promise<{ verdict: "correct" | "wrong" | "uncertain"; reason: string }> {
  const contextParts: string[] = [];
  if (lead.company) contextParts.push(`Company: ${lead.company}`);
  if (lead.email) contextParts.push(`Email: ${lead.email}`);
  if (lead.company_url) contextParts.push(`Company URL: ${lead.company_url}`);
  if (lead.role) contextParts.push(`Role: ${lead.role}`);
  if (lead.buyer_type) contextParts.push(`Buyer Type: ${lead.buyer_type}`);
  if (lead.service_interest) contextParts.push(`Service Interest: ${lead.service_interest}`);
  if (lead.deals_planned) contextParts.push(`Deals Planned: ${lead.deals_planned}`);
  if (lead.target_criteria) contextParts.push(`Target Criteria: ${lead.target_criteria}`);
  if (lead.target_revenue) contextParts.push(`Target Revenue: ${lead.target_revenue}`);
  if (lead.geography) contextParts.push(`Geography: ${lead.geography}`);
  if (lead.message) contextParts.push(`Submission Message: "${lead.message.substring(0, 500)}"`);

  const prompt = `You are verifying whether a LinkedIn profile URL belongs to the correct person. You must be strict — only say "correct" if the LinkedIn snippet clearly matches the person's company/role context.

PERSON TO FIND:
Name: ${lead.name}
${contextParts.join("\n")}

LINKEDIN MATCH:
URL: ${lead.linkedin_url}
Title/Snippet from search: ${lead.linkedin_title || "No snippet available"}

RULES:
- The LinkedIn profile MUST be for someone at the SAME company (or a clearly related entity). 
- If the person's company is "Modern Distribution" but the LinkedIn shows "Commio" — that's WRONG.
- If the email domain matches the LinkedIn company, that's a strong signal for CORRECT.
- Consider that company names might be abbreviated differently (e.g., "GMAX" vs "G-Max Industries").
- If the LinkedIn URL contains a name that doesn't match the person's name at all (e.g., different first AND last name), that's WRONG.
- If there's not enough info in the snippet to verify, say "uncertain".

Respond with ONLY a JSON object: {"verdict": "correct"|"wrong"|"uncertain", "reason": "brief explanation"}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`AI verify failed for ${lead.name}: HTTP ${response.status}`);
      return { verdict: "uncertain", reason: "AI call failed" };
    }

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || "").trim();
    
    const jsonStr = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    return {
      verdict: parsed.verdict || "uncertain",
      reason: parsed.reason || "No reason given",
    };
  } catch (e) {
    console.error(`AI verify error for ${lead.name}:`, e);
    return { verdict: "uncertain", reason: `Parse error: ${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Parse optional parameters
    let dryRun = false;
    let reSearch = false;
    let reverifyUncertain = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      reSearch = body?.re_search === true;
      reverifyUncertain = body?.reverify_uncertain === true;
    } catch { /* no body is fine */ }

    // Get all leads with existing linkedin_url (non-empty)
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, company, email, company_url, role, message, linkedin_url, linkedin_title, buyer_type, service_interest, deals_planned, target_criteria, target_revenue, geography")
      .not("linkedin_url", "is", null)
      .neq("linkedin_url", "")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No matched leads to verify", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Verifying ${leads.length} LinkedIn matches (dry_run: ${dryRun}, re_search: ${reSearch}, reverify_uncertain: ${reverifyUncertain})`);

    const results: Array<{
      name: string;
      company: string;
      linkedin_url: string;
      linkedin_title: string | null;
      verdict: string;
      reason: string;
    }> = [];

    let correct = 0;
    let wrong = 0;
    let uncertain = 0;
    const clearedLeadIds: string[] = [];
    const uncertainLeadIds: string[] = [];

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const verifications = await Promise.all(
        batch.map(async (lead) => {
          const result = await verifyMatch(lead as LeadForVerification, OPENAI_API_KEY);
          return { lead, result };
        }),
      );

      for (const { lead, result } of verifications) {
        results.push({
          name: lead.name,
          company: lead.company,
          linkedin_url: lead.linkedin_url!,
          linkedin_title: lead.linkedin_title,
          verdict: result.verdict,
          reason: result.reason,
        });

        if (result.verdict === "correct") correct++;
        else if (result.verdict === "wrong") {
          wrong++;
          if (!dryRun) {
            // Clear the bad match so it can be re-searched
            await supabase.from("leads").update({
              linkedin_url: null,
              linkedin_title: null,
              linkedin_score: null,
              linkedin_ma_experience: null,
              seniority_score: null,
            }).eq("id", lead.id);
            clearedLeadIds.push(lead.id);
            console.log(`CLEARED: ${lead.name} (${lead.company}) — ${result.reason}`);
          } else {
            console.log(`WOULD CLEAR: ${lead.name} (${lead.company}) — ${result.reason}`);
          }
        } else {
          uncertain++;
          uncertainLeadIds.push(lead.id);
          console.log(`UNCERTAIN: ${lead.name} (${lead.company}) — ${result.reason}`);
        }
      }

      if (i + BATCH_SIZE < leads.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    // ─── Phase D: Re-verify uncertain matches with deeper scraping ───
    let uncertainResolved = 0;
    let uncertainCleared = 0;
    if (reverifyUncertain && !dryRun && uncertainLeadIds.length > 0) {
      console.log(`\n=== Re-verifying ${uncertainLeadIds.length} uncertain matches ===`);
      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
      
      for (const leadId of uncertainLeadIds) {
        const lead = leads.find((l: any) => l.id === leadId);
        if (!lead || !lead.linkedin_url) continue;
        
        try {
          // Try to scrape the actual LinkedIn profile for more context
          let profileSnippet = lead.linkedin_title || "";
          if (FIRECRAWL_API_KEY) {
            const slug = lead.linkedin_url.split("/in/")[1]?.split("/")[0]?.split("?")[0];
            if (slug) {
              const searchRes = await fetch("https://api.firecrawl.dev/v2/search", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ query: `"${slug}" site:linkedin.com/in`, limit: 2, scrapeOptions: { formats: ["markdown"] } }),
              });
              if (searchRes.ok) {
                const searchData = await searchRes.json();
                const raw = searchData.data || searchData.results || [];
                const arr = Array.isArray(raw) ? raw : [];
                const match = arr.find((r: any) => r.url?.includes(`/in/${slug}`));
                if (match) {
                  profileSnippet = `${match.title || ""} ${match.description || ""} ${(match.markdown || "").substring(0, 500)}`;
                }
              }
            }
          }
          
          // Re-verify with enriched snippet
          const reVerification = await verifyMatch(
            { ...lead, linkedin_title: profileSnippet } as LeadForVerification,
            OPENAI_API_KEY,
          );
          
          if (reVerification.verdict === "correct") {
            uncertainResolved++;
            console.log(`UNCERTAIN→CORRECT: ${lead.name} — ${reVerification.reason}`);
          } else if (reVerification.verdict === "wrong") {
            uncertainCleared++;
            await supabase.from("leads").update({
              linkedin_url: null,
              linkedin_title: null,
              linkedin_score: null,
              linkedin_ma_experience: null,
              seniority_score: null,
            }).eq("id", lead.id);
            clearedLeadIds.push(lead.id);
            console.log(`UNCERTAIN→CLEARED: ${lead.name} — ${reVerification.reason}`);
          } else {
            console.log(`UNCERTAIN→STILL UNCERTAIN: ${lead.name} — ${reVerification.reason}`);
          }
          
          await new Promise((r) => setTimeout(r, DELAY_MS));
        } catch (e) {
          console.error(`Re-verify uncertain failed for ${lead.name}:`, e);
        }
      }
      
      console.log(`Uncertain re-verify: ${uncertainResolved} confirmed, ${uncertainCleared} cleared`);
    }

    let reSearchResults: Array<{ name: string; found: boolean }> = [];
    if (reSearch && !dryRun && clearedLeadIds.length > 0) {
      console.log(`\n=== Re-searching ${clearedLeadIds.length} cleared leads ===`);
      
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      for (const leadId of clearedLeadIds) {
        try {
          console.log(`Re-searching lead ${leadId}...`);
          const reSearchResponse = await fetch(`${SUPABASE_URL}/functions/v1/backfill-linkedin`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ leadId }),
          });
          
          const reSearchData = await reSearchResponse.json();
          const leadName = results.find(r => r.linkedin_url && leads.find(l => l.id === leadId))?.name || leadId;
          reSearchResults.push({ name: leadName, found: reSearchData?.found === true });
          console.log(`Re-search ${leadId}: ${reSearchData?.found ? "FOUND" : "NOT FOUND"}`);
          
          // Small delay between re-searches
          await new Promise((r) => setTimeout(r, 1000));
        } catch (e) {
          console.error(`Re-search failed for ${leadId}:`, e);
          reSearchResults.push({ name: leadId, found: false });
        }
      }
    }

    const summary = {
      success: true,
      total: leads.length,
      correct,
      wrong,
      uncertain,
      dryRun,
      reSearch,
      reSearchResults: reSearchResults.length > 0 ? reSearchResults : undefined,
      clearedLeadIds: clearedLeadIds.length > 0 ? clearedLeadIds : undefined,
      results,
    };
    console.log(`Verification complete: ${correct} correct, ${wrong} wrong, ${uncertain} uncertain`);
    if (reSearchResults.length > 0) {
      const reFound = reSearchResults.filter(r => r.found).length;
      console.log(`Re-search complete: ${reFound}/${reSearchResults.length} found`);
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("verify-linkedin-matches error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
