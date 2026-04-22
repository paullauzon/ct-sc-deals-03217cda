// Phase 9 — first-email research.
// Given a leadId, finds ONE specific, citable fact about the prospect's firm
// (e.g. "BrightPath Software in your portfolio"), suitable for line 1/2 of the
// first outbound email. Cached on leads.first_email_fact + first_email_fact_source
// so it only runs once per lead.
//
// Input: { leadId: string, force?: boolean }
// Output: { fact: string, source_url: string, cached: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function fetchSiteSnapshot(url: string): Promise<string> {
  // Prefer Firecrawl when available — it strips chrome and returns markdown.
  if (FIRECRAWL_API_KEY) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 1500,
        }),
      });
      if (res.ok) {
        const json = await res.json() as { data?: { markdown?: string } };
        const md = json?.data?.markdown || "";
        if (md) return md.slice(0, 8000);
      }
    } catch (e) {
      console.warn("firecrawl failed", (e as Error).message);
    }
  }
  // Fallback — raw HTML stripped of tags (best-effort).
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 LovableCRM/1.0" } });
    if (!res.ok) return "";
    const html = await res.text();
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.slice(0, 8000);
  } catch {
    return "";
  }
}

function normalizeUrl(u: string): string {
  if (!u) return "";
  let url = u.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { leadId, force } = await req.json() as { leadId?: string; force?: boolean };
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("id, name, company, company_url, website_url, linkedin_url, brand, service_interest, first_email_fact, first_email_fact_source")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache hit — return immediately
    if (!force && (lead as any).first_email_fact) {
      return new Response(JSON.stringify({
        fact: (lead as any).first_email_fact,
        source_url: (lead as any).first_email_fact_source || "",
        cached: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const candidateUrl = normalizeUrl((lead as any).company_url || (lead as any).website_url || "");
    if (!candidateUrl) {
      return new Response(JSON.stringify({
        fact: "",
        source_url: "",
        cached: false,
        skipped: "no company url",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const snapshot = await fetchSiteSnapshot(candidateUrl);
    if (!snapshot || snapshot.length < 200) {
      return new Response(JSON.stringify({
        fact: "",
        source_url: candidateUrl,
        cached: false,
        skipped: "site snapshot too thin",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sys = `You read PE / search-fund / family-office firm websites and extract ONE specific, verifiable fact a salesperson can reference in line 1 of a cold email. Rules:
- Must be specific (a portfolio company name, a recent transaction, a sector focus, a stated thesis).
- Must be paraphrased in 12 words or fewer, ready to drop into "I noticed [FACT]".
- Never invent. If nothing is concretely citable, return an empty fact.
- Never use generic platitudes ("strong investment record", "proven track record").
- No em-dashes. No emojis.`;

    const tools = [{
      type: "function",
      function: {
        name: "submit_fact",
        description: "Return one specific fact + source URL.",
        parameters: {
          type: "object",
          properties: {
            fact: { type: "string", description: "12 words or fewer, ready to drop into a sentence. Empty string if nothing citable." },
            source_url: { type: "string", description: "Exact URL the fact was sourced from." },
          },
          required: ["fact", "source_url"],
          additionalProperties: false,
        },
      },
    }];

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Firm: ${(lead as any).company}\nURL: ${candidateUrl}\n\nSite excerpt:\n${snapshot}` },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "submit_fact" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("OpenAI error", aiRes.status, t.slice(0, 300));
      return new Response(JSON.stringify({ error: "AI provider error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const args = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      return new Response(JSON.stringify({
        fact: "", source_url: candidateUrl, cached: false, skipped: "no tool call",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const parsed = JSON.parse(args) as { fact: string; source_url: string };
    const fact = (parsed.fact || "").trim();
    const sourceUrl = (parsed.source_url || candidateUrl).trim();

    if (fact) {
      await sb.from("leads")
        .update({
          first_email_fact: fact,
          first_email_fact_source: sourceUrl,
        })
        .eq("id", leadId);
    }

    return new Response(JSON.stringify({
      fact, source_url: sourceUrl, cached: false,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("research-first-email-fact error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
