import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyUrl, meetings, leadName, leadMessage, leadRole, leadCompany } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Step 1: Scrape company website if URL exists
    let websiteContent = "";
    if (companyUrl) {
      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
      if (FIRECRAWL_API_KEY) {
        try {
          let formattedUrl = companyUrl.trim();
          if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
            formattedUrl = `https://${formattedUrl}`;
          }
          console.log("Scraping website:", formattedUrl);
          const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: formattedUrl,
              formats: ["markdown"],
              onlyMainContent: true,
            }),
          });
          if (scrapeRes.ok) {
            const scrapeData = await scrapeRes.json();
            websiteContent = scrapeData.data?.markdown || scrapeData.markdown || "";
            // Truncate to avoid token limits
            if (websiteContent.length > 5000) {
              websiteContent = websiteContent.substring(0, 5000) + "\n[...truncated]";
            }
            console.log("Website scraped successfully, length:", websiteContent.length);
          } else {
            console.error("Firecrawl error:", scrapeRes.status);
          }
        } catch (e) {
          console.error("Website scrape failed:", e);
        }
      }
    }

    // Step 2: Combine all meeting transcripts
    const transcripts = (meetings || [])
      .filter((m: any) => m.transcript)
      .map((m: any) => `--- Meeting: ${m.title} (${m.date}) ---\n${m.transcript}`)
      .join("\n\n");

    // Step 3: Build the prompt
    const contextParts = [];
    if (leadName) contextParts.push(`Lead Name: ${leadName}`);
    if (leadRole) contextParts.push(`Role: ${leadRole}`);
    if (leadCompany) contextParts.push(`Company: ${leadCompany}`);
    if (companyUrl) contextParts.push(`Website: ${companyUrl}`);
    if (leadMessage) contextParts.push(`Original Form Submission:\n${leadMessage}`);
    if (websiteContent) contextParts.push(`Company Website Content:\n${websiteContent}`);
    if (transcripts) contextParts.push(`Meeting Transcripts:\n${transcripts}`);

    const userContent = contextParts.join("\n\n");

    if (!userContent.trim()) {
      return new Response(
        JSON.stringify({ error: "No data available to enrich this lead" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Call AI with tool calling for structured output
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

Analyze the provided information and extract structured intelligence. For EVERY claim you make, indicate the source in parentheses: (website), (form submission), or (meeting transcript). If you cannot cite a specific source for a claim, do NOT include it — say "Not available from current data" instead. Never guess or infer facts that aren't explicitly stated in the source material.

Focus on what matters for M&A deal origination:
- What does their company do and how big are they?
- What are they looking to acquire? (sectors, size, geography)
- Why are they acquiring? (roll-up, platform build, diversification, PE mandate)
- How urgent is their timeline?
- Who are the decision makers?
- What other tools/services are they using or evaluating?
- What are the key deal-critical insights?`,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "enrich_lead",
              description: "Return structured deal intelligence about a prospect",
              parameters: {
                type: "object",
                properties: {
                  companyDescription: {
                    type: "string",
                    description: "1-2 sentence description of what the company does, industry, and approximate size indicators",
                  },
                  acquisitionCriteria: {
                    type: "string",
                    description: "What they're looking to acquire: target sectors, deal size range, geography preferences, and any specific criteria mentioned",
                  },
                  buyerMotivation: {
                    type: "string",
                    description: "Why they're acquiring: roll-up strategy, platform build, diversification, PE mandate, strategic add-on, etc.",
                  },
                  urgency: {
                    type: "string",
                    description: "Timeline signals: actively looking with deadline, exploring options, early stage research, etc. Include any specific dates or timeframes mentioned",
                  },
                  decisionMakers: {
                    type: "string",
                    description: "Key people involved in the acquisition decision: names, roles, and their influence level if mentioned",
                  },
                  competitorTools: {
                    type: "string",
                    description: "Other deal sourcing services, platforms, brokers, or advisors they're using or have evaluated",
                  },
                  keyInsights: {
                    type: "string",
                    description: "3-5 bullet points of deal-critical intelligence that would help close this deal. Each bullet on a new line starting with •",
                  },
                  dataSources: {
                    type: "string",
                    description: "Comma-separated list of data sources that were available and contained useful content, e.g. 'Website, Form Submission, 2 Meeting Transcripts'",
                  },
                },
                required: [
                  "companyDescription",
                  "acquisitionCriteria",
                  "buyerMotivation",
                  "urgency",
                  "decisionMakers",
                  "competitorTools",
                  "keyInsights",
                  "dataSources",
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
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "AI did not return structured data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
