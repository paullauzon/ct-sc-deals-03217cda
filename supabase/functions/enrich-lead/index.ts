import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function scrapeWebsite(companyUrl: string, apiKey: string): Promise<string> {
  let formattedUrl = companyUrl.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }
  console.log("Scraping website:", formattedUrl);
  try {
    const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: formattedUrl, formats: ["markdown"], onlyMainContent: true }),
    }, 10000);
    if (!res.ok) {
      console.error("Firecrawl scrape error:", res.status);
      return "";
    }
    const data = await res.json();
    let content = data.data?.markdown || data.markdown || "";
    if (content.length > 5000) content = content.substring(0, 5000) + "\n[...truncated]";
    return content;
  } catch (e) {
    console.warn("Scrape timed out or failed:", e instanceof Error ? e.message : e);
    return "";
  }
}

async function searchWeb(query: string, apiKey: string): Promise<{ content: string; urls: string[] }> {
  try {
    const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 5 }),
    }, 8000);
    if (!res.ok) return { content: "", urls: [] };
    const data = await res.json();
    const results = data.data || [];
    const urls: string[] = [];
    let combined = "";
    for (const r of results) {
      if (r.url) urls.push(r.url);
      const snippet = r.markdown || r.description || "";
      if (snippet) combined += `--- Source: ${r.url || "unknown"} ---\n${snippet}\n\n`;
    }
    if (combined.length > 5000) combined = combined.substring(0, 5000) + "\n[...truncated]";
    return { content: combined, urls };
  } catch (e) {
    console.warn("Web search timed out or failed:", e instanceof Error ? e.message : e);
    return { content: "", urls: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      companyUrl, meetings, leadName, leadMessage, leadRole, leadCompany,
      leadStage, leadPriority, leadDealValue, leadServiceInterest,
      leadForecastCategory, leadIcpFit, leadSubscriptionValue,
      leadContractStart, leadContractEnd, leadCloseReason, leadWonReason,
      leadLostReason, leadNotes, leadTargetCriteria, leadTargetRevenue,
      leadGeography, leadAcquisitionStrategy, leadBuyerType,
      leadDaysInStage, leadStageEnteredDate,
      meetingIntelligence,
      dealIntelligence,
    } = body;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    // Step 1: External research — scrape company + web search for company + prospect separately
    let websiteContent = "";
    let companySearchContent = "";
    let prospectSearchContent = "";
    let companySearchUrls: string[] = [];
    let prospectSearchUrls: string[] = [];
    const tasks: Promise<void>[] = [];

    if (companyUrl && FIRECRAWL_API_KEY) {
      tasks.push(scrapeWebsite(companyUrl, FIRECRAWL_API_KEY).then(c => { websiteContent = c; }));
    }
    if (FIRECRAWL_API_KEY && leadCompany) {
      const companyQuery = `"${leadCompany}" company acquisitions M&A news funding recent`;
      tasks.push(searchWeb(companyQuery, FIRECRAWL_API_KEY).then(r => {
        companySearchContent = r.content;
        companySearchUrls = r.urls;
      }));
    }
    if (FIRECRAWL_API_KEY && leadName) {
      const prospectQuery = `"${leadName}" ${leadCompany || ""} ${leadRole || ""} professional background`;
      tasks.push(searchWeb(prospectQuery, FIRECRAWL_API_KEY).then(r => {
        prospectSearchContent = r.content;
        prospectSearchUrls = r.urls;
      }));
    }
    await Promise.all(tasks);

    // Step 2: Build deal context for CRM field suggestions
    const dealFields: string[] = [];
    if (leadStage) dealFields.push(`Current Stage: ${leadStage} (${leadDaysInStage || 0} days, entered ${leadStageEnteredDate || "unknown"})`);
    if (leadPriority) dealFields.push(`Priority: ${leadPriority}`);
    if (leadDealValue) dealFields.push(`Deal Value: $${leadDealValue}`);
    if (leadServiceInterest) dealFields.push(`Service Interest: ${leadServiceInterest}`);
    if (leadForecastCategory) dealFields.push(`Forecast Category: ${leadForecastCategory}`);
    if (leadIcpFit) dealFields.push(`ICP Fit: ${leadIcpFit}`);
    if (leadSubscriptionValue) dealFields.push(`Subscription Value: $${leadSubscriptionValue}/mo`);
    if (leadContractStart) dealFields.push(`Contract Start: ${leadContractStart}`);
    if (leadContractEnd) dealFields.push(`Contract End: ${leadContractEnd}`);
    if (leadTargetCriteria) dealFields.push(`Target Criteria: ${leadTargetCriteria}`);
    if (leadTargetRevenue) dealFields.push(`Target Revenue: ${leadTargetRevenue}`);
    if (leadGeography) dealFields.push(`Geography: ${leadGeography}`);
    if (leadAcquisitionStrategy) dealFields.push(`Acquisition Strategy: ${leadAcquisitionStrategy}`);
    if (leadBuyerType) dealFields.push(`Buyer Type: ${leadBuyerType}`);
    if (leadCloseReason) dealFields.push(`Close Reason: ${leadCloseReason}`);
    if (leadWonReason) dealFields.push(`Won Reason: ${leadWonReason}`);
    if (leadLostReason) dealFields.push(`Lost Reason: ${leadLostReason}`);

    // Step 3: Meeting context (summaries only — Deal Intelligence handles deep analysis)
    const meetingsWithTranscripts = (meetings || []).filter((m: any) => m.transcript);
    const meetingSummaries = meetingsWithTranscripts
      .map((m: any) => `• ${m.title} (${m.date}): ${m.summary || "No summary"}`)
      .join("\n");

    // Step 4: Source inventory
    const sourceInventory = [
      `- Website content: ${websiteContent ? "YES" : "NO"}`,
      `- Form submission: ${leadMessage ? "YES" : "NO"}`,
      `- Company web search: ${companySearchContent ? `YES (${companySearchUrls.length} results)` : "NO"}`,
      `- Prospect web search: ${prospectSearchContent ? `YES (${prospectSearchUrls.length} results)` : "NO"}`,
      `- Meeting summaries: ${meetingSummaries ? `YES (${meetingsWithTranscripts.length})` : "NO"}`,
      `- Deal fields: ${dealFields.length > 0 ? "YES" : "NO"}`,
      `- Notes: ${leadNotes ? "YES" : "NO"}`,
    ].join("\n");

    // Step 5: Build context
    const contextParts: string[] = [];
    contextParts.push(`AVAILABLE SOURCES:\n${sourceInventory}\n\nYou may ONLY cite sources marked YES.`);
    if (leadName) contextParts.push(`Lead Name: ${leadName}`);
    if (leadRole) contextParts.push(`Role: ${leadRole}`);
    if (leadCompany) contextParts.push(`Company: ${leadCompany}`);
    if (companyUrl) contextParts.push(`Website: ${companyUrl}`);
    if (dealFields.length) contextParts.push(`CURRENT DEAL FIELDS:\n${dealFields.join("\n")}`);
    if (leadMessage) contextParts.push(`Original Form Submission:\n${leadMessage}`);
    if (leadNotes) contextParts.push(`Internal Notes:\n${leadNotes}`);
    if (websiteContent) contextParts.push(`COMPANY WEBSITE CONTENT:\n${websiteContent}`);
    if (companySearchContent) contextParts.push(`COMPANY WEB SEARCH RESULTS:\n${companySearchContent}`);
    if (prospectSearchContent) contextParts.push(`PROSPECT WEB SEARCH RESULTS:\n${prospectSearchContent}`);
    if (meetingSummaries) contextParts.push(`MEETING SUMMARIES (high-level only):\n${meetingSummaries}`);

    const userContent = contextParts.join("\n\n");
    if (!userContent.trim()) {
      return new Response(JSON.stringify({ error: "No data available to research this lead" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 6: Call AI — Research & Recommend persona
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an elite EXTERNAL intelligence operative for a buy-side M&A deal origination sales team. You are three experts in one body:

1. **Competitive Intelligence Officer** — You build dossiers on companies from public data. You find what others miss: leadership changes, recent funding, M&A activity, news mentions, strategic pivots, financial signals. You create a 360° picture of who this company is and what they're doing RIGHT NOW.

2. **Executive Profiler** — You profile the individual prospect from their public footprint. From web search results, you infer: career trajectory (are they rising, established, or pivoting?), professional values, communication preferences, what motivates them personally. You understand what kind of person sits across the table, what makes them tick, and how to speak their language. You are NOT analyzing meeting transcripts (Deal Intelligence does that) — you are profiling from EXTERNAL signals.

3. **Pre-Call Strategist** — You package external intelligence into ammunition a salesperson can use in the first 30 seconds of a call. Recent company news they can name-drop. Industry trends affecting their business. Personalized talking points that demonstrate "I did my homework." You create the kind of opening that makes a prospect think "this person actually understands my world."

CRITICAL RULES:
1. Every claim must cite its source: (website), (form submission), (web search: {URL}), (notes).
2. If a field has NO data from ANY source, return EXACTLY: "Not available from current data"
3. Do NOT duplicate what Deal Intelligence (meeting transcript analysis) already provides. You handle EXTERNAL research only.
4. Do NOT analyze meeting transcripts for objections, sentiment, stakeholder dynamics — that's Deal Intelligence's job. You may reference meeting summaries only for context on what topics matter.
5. For CRM field suggestions: compare against current deal field values. Only suggest changes with clear evidence and concise reasoning.
6. For the prospect profile: be a psychologist reading a resume, not a stalker. Infer professional motivations, communication style, career ambitions from their public presence.
7. For pre-meeting ammo: think "what would impress this person if I said it in the first 60 seconds?" Not generic industry facts — specific, recent, relevant.
8. Be BOLD in your assessments. Sales teams need sharp opinions, not hedged academic analysis.`,
          },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "research_and_recommend",
              description: "Return external research intelligence and CRM field recommendations.",
              parameters: {
                type: "object",
                properties: {
                  companyDossier: {
                    type: "string",
                    description: "External company intelligence dossier. Include: what the company does, size/scale indicators, recent news or activity, M&A history, leadership team, strategic direction, financial signals. Format with bullet points. Cite all sources. This is the '60-second company briefing' a salesperson reads before a call.",
                  },
                  prospectProfile: {
                    type: "string",
                    description: "External profile of the individual prospect (NOT from meeting transcripts). Infer from web search: career trajectory, professional background, likely communication style (Analytical/Driver/Amiable/Expressive), professional motivations, what they care about, what kind of pitch would resonate with THEM specifically. If no web data available, say 'Not available from current data'.",
                  },
                  preMeetingAmmo: {
                    type: "string",
                    description: "Pre-meeting ammunition — 3-5 specific, recent, external talking points a salesperson can use to build instant credibility. Recent company news, industry trends affecting them, competitive moves in their space, regulatory changes, funding activity. Each point should be usable as an opening line. Format: '• [Talking Point]: [Why it matters to them]'. If no external data, say 'Not available from current data'.",
                  },
                  competitivePositioning: {
                    type: "string",
                    description: "External competitive landscape — from web research, what other deal sourcing firms, advisors, or platforms serve this company's space? What is our positioning advantage? NOT from meeting transcripts (Deal Intelligence handles that). Cite sources.",
                  },
                  companyDescription: { type: "string", description: "One-paragraph company overview with size indicators. Cite sources." },
                  acquisitionCriteria: { type: "string", description: "Target sectors, deal size, geography preferences. Cite sources." },
                  buyerMotivation: { type: "string", description: "Why they're acquiring — strategic rationale. Cite sources." },
                  urgency: { type: "string", description: "Timeline signals and urgency indicators. Cite sources." },
                  decisionMakers: { type: "string", description: "Key people and roles from external research. Only from public sources." },
                  competitorTools: { type: "string", description: "Other sourcing services/platforms/advisors they may use." },
                  keyInsights: { type: "string", description: "5-7 bullet points of the most important intelligence for this deal. Each on new line starting with •. Mix external research with form/notes context. These are the 'if you read nothing else, read this' insights." },
                  dataSources: { type: "string", description: "List each data source actually used with URLs where applicable." },
                  openingHook: {
                    type: "string",
                    description: "A personalized opening sentence the rep can say in the first 30 seconds of a call or meeting. Reference something specific about their company, recent news, or situation from the research. Write it as a direct quote they can use verbatim.",
                  },
                  discoveryQuestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 strategic discovery questions to ask in a first meeting with this prospect. Specific to their company/situation — not generic. Written as direct quotes.",
                  },
                  valueAngle: {
                    type: "string",
                    description: "How to position our M&A deal origination service for THIS specific prospect. What's our unique value proposition given their situation, industry, and acquisition strategy?",
                  },
                  watchOuts: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 things to be careful about or avoid based on research. Potential sensitivities, competitive landmines, or topics that could derail a conversation.",
                  },
                  suggestedUpdates: {
                    type: "object",
                    description: "Suggested CRM field updates based on evidence. Only include fields where evidence supports a change from current values.",
                    properties: {
                      stage: {
                        type: "object",
                        properties: { value: { type: "string", enum: ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won", "Closed Lost", "Went Dark"] }, reason: { type: "string" } },
                        required: ["value", "reason"],
                      },
                      priority: {
                        type: "object",
                        properties: { value: { type: "string", enum: ["High", "Medium", "Low"] }, reason: { type: "string" } },
                        required: ["value", "reason"],
                      },
                      forecastCategory: {
                        type: "object",
                        properties: { value: { type: "string", enum: ["Commit", "Best Case", "Pipeline", "Omit"] }, reason: { type: "string" } },
                        required: ["value", "reason"],
                      },
                      icpFit: {
                        type: "object",
                        properties: { value: { type: "string", enum: ["Strong", "Moderate", "Weak"] }, reason: { type: "string" } },
                        required: ["value", "reason"],
                      },
                      nextFollowUp: {
                        type: "object",
                        properties: { value: { type: "string", description: "ISO date YYYY-MM-DD" }, reason: { type: "string" } },
                        required: ["value", "reason"],
                      },
                      dealValue: {
                        type: "object",
                        properties: { value: { type: "number" }, reason: { type: "string" } },
                        required: ["value", "reason"],
                      },
                      serviceInterest: {
                        type: "object",
                        properties: { value: { type: "string", enum: ["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "SourceCo Retained Search", "Other", "TBD"] }, reason: { type: "string" } },
                        required: ["value", "reason"],
                      },
                      meetingOutcome: {
                        type: "object",
                        properties: { value: { type: "string", enum: ["Scheduled", "Held", "No-Show", "Rescheduled", "Cancelled"] }, reason: { type: "string" } },
                        required: ["value", "reason"],
                      },
                    },
                    additionalProperties: false,
                  },
                },
                required: [
                  "companyDossier", "prospectProfile", "preMeetingAmmo", "competitivePositioning",
                  "companyDescription", "acquisitionCriteria", "buyerMotivation",
                  "urgency", "decisionMakers", "competitorTools", "keyInsights", "dataSources",
                  "openingHook", "discoveryQuestions", "valueAngle", "watchOuts",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "research_and_recommend" } },
        stream: false,
      }),
    }, 30000);

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

    let enrichment;
    try {
      enrichment = JSON.parse(toolCall.function.arguments);
    } catch (parseErr) {
      console.error("Failed to parse AI tool call arguments:", toolCall.function.arguments?.substring(0, 500));
      return new Response(JSON.stringify({ error: "AI returned malformed data — please retry" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    enrichment.enrichedAt = new Date().toISOString();

    console.log("Research & Recommend complete for:", leadName);

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
