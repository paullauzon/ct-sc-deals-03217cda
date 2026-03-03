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
  return content;
}

async function searchWeb(query: string, apiKey: string): Promise<{ content: string; urls: string[] }> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 3, scrapeOptions: { formats: ["markdown"] } }),
    });
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
    if (combined.length > 3000) combined = combined.substring(0, 3000) + "\n[...truncated]";
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
    const body = await req.json();
    const {
      companyUrl, meetings, leadName, leadMessage, leadRole, leadCompany,
      // Full lead context
      leadStage, leadPriority, leadDealValue, leadServiceInterest,
      leadForecastCategory, leadIcpFit, leadSubscriptionValue,
      leadContractStart, leadContractEnd, leadCloseReason, leadWonReason,
      leadLostReason, leadNotes, leadTargetCriteria, leadTargetRevenue,
      leadGeography, leadAcquisitionStrategy, leadBuyerType,
      leadDaysInStage, leadStageEnteredDate,
      // Aggregated meeting intelligence
      meetingIntelligence,
      // Accumulated deal intelligence
      dealIntelligence,
    } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    // Step 1: Scrape + search in parallel
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

    // Step 2: Meeting transcripts + intelligence
    const meetingsWithTranscripts = (meetings || []).filter((m: any) => m.transcript);
    const transcripts = meetingsWithTranscripts
      .map((m: any) => `--- Meeting: ${m.title} (${m.date}) ---\n${m.transcript}`)
      .join("\n\n");

    // Step 3: Build deal context
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

    // Step 4: Aggregated meeting intelligence
    const meetingIntelStr: string[] = [];
    if (meetingIntelligence) {
      const mi = meetingIntelligence;
      if (mi.objections?.length) meetingIntelStr.push(`Objections (from meetings): ${mi.objections.join("; ")}`);
      if (mi.painPoints?.length) meetingIntelStr.push(`Pain Points: ${mi.painPoints.join("; ")}`);
      if (mi.competitors?.length) meetingIntelStr.push(`Competitors Mentioned: ${mi.competitors.join(", ")}`);
      if (mi.champions?.length) meetingIntelStr.push(`Champions Identified: ${mi.champions.join(", ")}`);
      if (mi.sentiments?.length) meetingIntelStr.push(`Sentiment Progression: ${mi.sentiments.join(" → ")}`);
      if (mi.intents?.length) meetingIntelStr.push(`Intent Progression: ${mi.intents.join(" → ")}`);
      if (mi.actionItems?.length) meetingIntelStr.push(`Outstanding Actions: ${mi.actionItems.slice(0, 10).join("; ")}`);
    }

    // Step 4b: Accumulated deal intelligence
    const dealIntelStr: string[] = [];
    if (dealIntelligence) {
      const di = dealIntelligence;
      if (di.dealNarrative) dealIntelStr.push(`Deal Narrative: ${di.dealNarrative}`);
      if (di.momentumSignals?.momentum) dealIntelStr.push(`Momentum: ${di.momentumSignals.momentum} (frequency: ${di.momentumSignals.meetingFrequencyDays}d, completion: ${di.momentumSignals.completionRate}%)`);
      if (di.buyingCommittee) {
        const bc = di.buyingCommittee;
        dealIntelStr.push(`Buying Committee: DM=${bc.decisionMaker || "Unknown"}, Champion=${bc.champion || "None"}, Blockers=${bc.blockers?.join(", ") || "None"}`);
      }
      if (di.objectionTracker?.length) {
        const open = di.objectionTracker.filter((o: any) => o.status === "Open" || o.status === "Recurring");
        if (open.length) dealIntelStr.push(`Open/Recurring Objections: ${open.map((o: any) => o.objection).join("; ")}`);
      }
      if (di.riskRegister?.length) {
        const critical = di.riskRegister.filter((r: any) => r.severity === "Critical" || r.severity === "High");
        if (critical.length) dealIntelStr.push(`High/Critical Risks: ${critical.map((r: any) => `${r.risk} (${r.mitigationStatus})`).join("; ")}`);
      }
      if (di.dealStageEvidence) dealIntelStr.push(`Stage Evidence: ${di.dealStageEvidence}`);
      if (di.stakeholderMap?.length) {
        dealIntelStr.push(`Key Stakeholders: ${di.stakeholderMap.map((s: any) => `${s.name} (${s.stance}, ${s.influence})`).join("; ")}`);
      }
    }

    // Step 5: Source inventory
    const sourceInventory = [
      `- Website content: ${websiteContent ? "YES" : "NO"}`,
      `- Form submission: ${leadMessage ? "YES" : "NO"}`,
      `- Meeting transcripts: ${meetingsWithTranscripts.length > 0 ? `YES (${meetingsWithTranscripts.length})` : "NO"}`,
      `- Web search results: ${webSearchContent ? `YES (${webSearchUrls.length})` : "NO"}`,
      `- Deal fields: ${dealFields.length > 0 ? "YES" : "NO"}`,
      `- Meeting intelligence (aggregated): ${meetingIntelStr.length > 0 ? "YES" : "NO"}`,
      `- Notes: ${leadNotes ? "YES" : "NO"}`,
    ].join("\n");

    // Step 6: Build context
    const contextParts: string[] = [];
    contextParts.push(`AVAILABLE SOURCES:\n${sourceInventory}\n\nYou may ONLY cite sources marked YES.`);
    if (leadName) contextParts.push(`Lead Name: ${leadName}`);
    if (leadRole) contextParts.push(`Role: ${leadRole}`);
    if (leadCompany) contextParts.push(`Company: ${leadCompany}`);
    if (companyUrl) contextParts.push(`Website: ${companyUrl}`);
    if (dealFields.length) contextParts.push(`DEAL FIELDS:\n${dealFields.join("\n")}`);
    if (meetingIntelStr.length) contextParts.push(`AGGREGATED MEETING INTELLIGENCE:\n${meetingIntelStr.join("\n")}`);
    if (leadMessage) contextParts.push(`Original Form Submission:\n${leadMessage}`);
    if (leadNotes) contextParts.push(`Internal Notes:\n${leadNotes}`);
    if (websiteContent) contextParts.push(`Company Website Content:\n${websiteContent}`);
    if (transcripts) contextParts.push(`Meeting Transcripts:\n${transcripts}`);
    if (webSearchContent) contextParts.push(`Web Search Results:\n${webSearchContent}`);

    const userContent = contextParts.join("\n\n");
    if (!userContent.trim()) {
      return new Response(JSON.stringify({ error: "No data available to enrich this lead" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 7: Call AI with expanded tool schema
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
            content: `You are an M&A deal intelligence analyst for a buy-side deal origination firm. Your job is to extract AND SYNTHESIZE deal-qualifying intelligence from ALL available data — prospect research, meeting transcripts, deal fields, and aggregated meeting intelligence.

CRITICAL RULES:
1. Every claim must have an inline citation: (website), (form submission), (meeting: {title}), (web search: {URL}), (deal fields), (meeting intelligence), (notes).
2. If a field has NO data from ANY source, return EXACTLY: "Not available from current data"
3. Do NOT infer, estimate, or guess.
4. Cross-reference deal fields with meeting intelligence. Flag contradictions (e.g., stage is "Negotiation" but sentiment is "Negative" — flag this risk).
5. When objections exist from meetings, provide specific recommendations to overcome each one.
6. When assessing deal health, consider: stage velocity (days in stage), sentiment trends, engagement level, outstanding action items, and competitive threats.
7. For recommended actions, be SPECIFIC to this deal's current stage and context — not generic advice.
8. In suggestedUpdates, ONLY suggest changes when you have clear evidence. Compare against current deal field values provided. For each suggestion include a concise reason citing the evidence.
9. For stage suggestions: only suggest advancement when evidence clearly supports it (e.g., meeting held → suggest "Meeting Held"; proposal discussed → suggest "Proposal Sent").
10. For priority: consider urgency signals, deal size, and engagement level.
11. For nextFollowUp: extract specific dates mentioned in meetings or suggest based on next step deadlines.
12. For dealValue: only suggest when specific pricing/fees are discussed in transcripts.

Focus areas for M&A deal origination:
- Company profile and acquisition appetite
- Deal signals and buying intent
- Objection handling with specific rebuttals
- Risk factors and mitigation strategies
- Relationship dynamics and key stakeholders
- Competitive positioning
- Deal health and likelihood to close`,
          },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "enrich_lead",
              description: "Return comprehensive deal intelligence synthesized from all available sources.",
              parameters: {
                type: "object",
                properties: {
                  companyDescription: { type: "string", description: "Company overview with size indicators. Cite sources." },
                  acquisitionCriteria: { type: "string", description: "Target sectors, deal size, geography. Cite sources." },
                  buyerMotivation: { type: "string", description: "Why they're acquiring. Cite sources." },
                  urgency: { type: "string", description: "Timeline signals with dates. Cite sources." },
                  decisionMakers: { type: "string", description: "Key people, roles, influence. Only from sources." },
                  competitorTools: { type: "string", description: "Other sourcing services/platforms/advisors mentioned." },
                  keyInsights: { type: "string", description: "5-7 bullet points of deal-critical intelligence. Each on new line starting with •. Cite sources." },
                  dataSources: { type: "string", description: "List each source actually used." },
                  // New holistic fields
                  objectionsSummary: { type: "string", description: "Consolidated objections from all meetings with specific recommendations to overcome each. Format: '• [Objection]: [Recommendation]'. If none, say 'Not available from current data'." },
                  dealRiskAssessment: { type: "string", description: "Overall deal risk assessment. Consider stage velocity, sentiment, engagement, competition, outstanding items. Cross-reference deal fields with meeting signals. Rate as High/Medium/Low risk with specific factors." },
                  recommendedNextActions: { type: "string", description: "3-5 specific next actions based on current stage, objections, and intelligence. Not generic — tailored to this deal. Format as bullet points." },
                  competitiveLandscape: { type: "string", description: "Aggregated competitive intel: who else is in play, their positioning, our advantages/disadvantages." },
                  relationshipMap: { type: "string", description: "Key stakeholders: champions, blockers, decision makers, influencers. Include their stance and engagement level." },
                  dealHealthScore: { type: "string", description: "One of: Strong, Good, Fair, At Risk, Poor. Based on all signals." },
                  engagementTrend: { type: "string", description: "One of: Increasing, Stable, Declining, New. Based on meeting frequency, responsiveness, sentiment." },
                  likelihoodToClose: { type: "string", description: "One of: High, Medium, Low, Unknown. With brief justification." },
                  sentimentAnalysis: { type: "string", description: "Sentiment progression across meetings with analysis. If single meeting, overall tone. If no meetings, say 'Not available from current data'." },
                  suggestedUpdates: {
                    type: "object",
                    description: "Suggested updates to lead fields based on evidence from transcripts, deal fields, and intelligence. Only include fields where evidence supports a change from current values. Omit fields where no change is warranted.",
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
                        properties: { value: { type: "string", description: "ISO date string YYYY-MM-DD" }, reason: { type: "string" } },
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
                  "companyDescription", "acquisitionCriteria", "buyerMotivation",
                  "urgency", "decisionMakers", "competitorTools", "keyInsights", "dataSources",
                  "objectionsSummary", "dealRiskAssessment", "recommendedNextActions",
                  "competitiveLandscape", "relationshipMap",
                  "dealHealthScore", "engagementTrend", "likelihoodToClose", "sentimentAnalysis",
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
