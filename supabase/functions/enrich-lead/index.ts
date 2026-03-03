import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function scrapeWebsite(companyUrl: string, apiKey: string): Promise<string> {
  let formattedUrl = companyUrl.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }
  console.log("Scraping website:", formattedUrl);
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: formattedUrl, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!res.ok) {
    console.error("Firecrawl scrape error:", res.status);
    return "";
  }
  const data = await res.json();
  let content = data.data?.markdown || data.markdown || "";
  if (content.length > 5000) content = content.substring(0, 5000) + "\n[...truncated]";
  console.log("Website scraped, length:", content.length);
  return content;
}

async function searchWeb(query: string, apiKey: string): Promise<{ content: string; urls: string[] }> {
  console.log("Web search query:", query);
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 3,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (!res.ok) {
      console.error("Firecrawl search error:", res.status);
      return { content: "", urls: [] };
    }
    const data = await res.json();
    const results = data.data || [];
    const urls: string[] = [];
    let combined = "";
    for (const r of results) {
      if (r.url) urls.push(r.url);
      const snippet = r.markdown || r.description || "";
      if (snippet) {
        combined += `--- Source: ${r.url || "unknown"} ---\n${snippet}\n\n`;
      }
    }
    if (combined.length > 3000) combined = combined.substring(0, 3000) + "\n[...truncated]";
    console.log("Web search results:", results.length, "urls, length:", combined.length);
    return { content: combined, urls };
  } catch (e) {
    console.error("Web search failed:", e);
    return { content: "", urls: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyUrl, meetings, leadName, leadMessage, leadRole, leadCompany } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    // Step 1: Scrape website + web search in parallel
    let websiteContent = "";
    let webSearchContent = "";
    let webSearchUrls: string[] = [];

    const tasks: Promise<void>[] = [];

    if (companyUrl && FIRECRAWL_API_KEY) {
      tasks.push(scrapeWebsite(companyUrl, FIRECRAWL_API_KEY).then(c => { websiteContent = c; }));
    }

    if (FIRECRAWL_API_KEY && (leadCompany || leadName)) {
      const searchQuery = `"${leadCompany || ""}" ${leadName || ""} ${leadRole || "acquisitions"}`.trim();
      tasks.push(searchWeb(searchQuery, FIRECRAWL_API_KEY).then(r => {
        webSearchContent = r.content;
        webSearchUrls = r.urls;
      }));
    }

    await Promise.all(tasks);

    // Step 2: Combine meeting transcripts
    const meetingsWithTranscripts = (meetings || []).filter((m: any) => m.transcript);
    const transcripts = meetingsWithTranscripts
      .map((m: any) => `--- Meeting: ${m.title} (${m.date}) ---\n${m.transcript}`)
      .join("\n\n");

    // Step 3: Build source inventory
    const sourceInventory = [
      `- Website content: ${websiteContent ? `YES (scraped from ${companyUrl})` : "NO"}`,
      `- Form submission: ${leadMessage ? "YES" : "NO"}`,
      `- Meeting transcripts: ${meetingsWithTranscripts.length > 0 ? `YES (${meetingsWithTranscripts.length} meeting${meetingsWithTranscripts.length > 1 ? "s" : ""})` : "NO (0 meetings)"}`,
      `- Web search results: ${webSearchContent ? `YES (${webSearchUrls.length} results)` : "NO"}`,
    ].join("\n");

    // Step 4: Build context
    const contextParts = [];
    contextParts.push(`AVAILABLE SOURCES:\n${sourceInventory}\n\nYou may ONLY cite sources marked YES. Any claim without a valid citation from the source material must say "Not available from current data."`);

    if (leadName) contextParts.push(`Lead Name: ${leadName}`);
    if (leadRole) contextParts.push(`Role: ${leadRole}`);
    if (leadCompany) contextParts.push(`Company: ${leadCompany}`);
    if (companyUrl) contextParts.push(`Website: ${companyUrl}`);
    if (leadMessage) contextParts.push(`Original Form Submission:\n${leadMessage}`);
    if (websiteContent) contextParts.push(`Company Website Content:\n${websiteContent}`);
    if (transcripts) contextParts.push(`Meeting Transcripts:\n${transcripts}`);
    if (webSearchContent) contextParts.push(`Web Search Results:\n${webSearchContent}`);

    const userContent = contextParts.join("\n\n");

    if (!userContent.trim()) {
      return new Response(
        JSON.stringify({ error: "No data available to enrich this lead" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 5: Call AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an M&A deal intelligence analyst for a buy-side deal origination firm. Your job is to extract deal-qualifying intelligence from prospect data to help the sales team qualify leads faster.

CRITICAL RULES — FOLLOW EXACTLY:
1. Every single claim you make MUST have an inline citation in parentheses indicating its source:
   - (website) — from the scraped company website
   - (form submission) — from the lead's original form submission
   - (meeting: {title}) — from a specific meeting transcript, include the meeting title
   - (web search: {URL}) — from web search results, include the source URL
2. If a field has NO factual data from ANY available source, return EXACTLY: "Not available from current data"
3. Do NOT infer, estimate, or guess revenue figures, employee counts, deal sizes, or company valuations unless explicitly stated in source material.
4. Do NOT fabricate names, titles, companies, or relationships not found in the sources.
5. Do NOT extrapolate or assume information based on industry norms or common patterns.
6. Check the AVAILABLE SOURCES block at the top of the user message — you may ONLY cite sources marked YES.

Focus on what matters for M&A deal origination:
- What does their company do and how big are they?
- What are they looking to acquire? (sectors, size, geography)
- Why are they acquiring? (roll-up, platform build, diversification, PE mandate)
- How urgent is their timeline?
- Who are the decision makers?
- What other tools/services are they using or evaluating?
- What are the key deal-critical insights?`,
          },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "enrich_lead",
              description: "Return structured deal intelligence about a prospect. Every claim must have an inline source citation.",
              parameters: {
                type: "object",
                properties: {
                  companyDescription: {
                    type: "string",
                    description: "1-2 sentence description of what the company does, industry, and size indicators. Each fact must cite its source.",
                  },
                  acquisitionCriteria: {
                    type: "string",
                    description: "What they're looking to acquire: target sectors, deal size range, geography preferences. Each fact must cite its source. If not available, say 'Not available from current data'.",
                  },
                  buyerMotivation: {
                    type: "string",
                    description: "Why they're acquiring. Each fact must cite its source. If not available, say 'Not available from current data'.",
                  },
                  urgency: {
                    type: "string",
                    description: "Timeline signals with specific dates/timeframes mentioned. Each fact must cite its source. If not available, say 'Not available from current data'.",
                  },
                  decisionMakers: {
                    type: "string",
                    description: "Key people involved — names, roles, influence. ONLY include people explicitly mentioned in the sources. If not available, say 'Not available from current data'.",
                  },
                  competitorTools: {
                    type: "string",
                    description: "Other deal sourcing services, platforms, brokers, or advisors mentioned. If not available, say 'Not available from current data'.",
                  },
                  keyInsights: {
                    type: "string",
                    description: "3-5 bullet points of deal-critical intelligence. Each bullet on a new line starting with •. Every bullet must cite its source.",
                  },
                  dataSources: {
                    type: "string",
                    description: "List each source actually used with specifics, e.g. 'Website (atriumhomeservices.com), Form Submission, Web Search (linkedin.com/in/..., crunchbase.com/...)'. Only list sources you actually cited.",
                  },
                },
                required: [
                  "companyDescription", "acquisitionCriteria", "buyerMotivation",
                  "urgency", "decisionMakers", "competitorTools", "keyInsights", "dataSources",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "enrich_lead" } },
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "AI did not return structured data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const enrichment = JSON.parse(toolCall.function.arguments);
    enrichment.enrichedAt = new Date().toISOString();

    console.log("Enrichment complete for:", leadName);

    return new Response(
      JSON.stringify({ enrichment }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enrich-lead error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
