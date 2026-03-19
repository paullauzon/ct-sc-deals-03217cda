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
    
    // Parse JSON from response (handle markdown code blocks)
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

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Parse optional dry_run parameter
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
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

    console.log(`Verifying ${leads.length} LinkedIn matches (dry_run: ${dryRun})`);

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

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const verifications = await Promise.all(
        batch.map(async (lead) => {
          const result = await verifyMatch(lead as LeadForVerification, LOVABLE_API_KEY);
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
            console.log(`CLEARED: ${lead.name} (${lead.company}) — ${result.reason}`);
          } else {
            console.log(`WOULD CLEAR: ${lead.name} (${lead.company}) — ${result.reason}`);
          }
        } else {
          uncertain++;
          console.log(`UNCERTAIN: ${lead.name} (${lead.company}) — ${result.reason}`);
        }
      }

      if (i + BATCH_SIZE < leads.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    const summary = { success: true, total: leads.length, correct, wrong, uncertain, dryRun, results };
    console.log(`Verification complete: ${correct} correct, ${wrong} wrong, ${uncertain} uncertain`);

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
