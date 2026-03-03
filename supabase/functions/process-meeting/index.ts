import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Suggested Lead Updates Schema ───

const SUGGESTED_UPDATE_FIELD = {
  type: "object",
  properties: {
    value: { type: "string", description: "The suggested value for this field" },
    confidence: { type: "string", enum: ["Certain", "Likely", "Possible"], description: "How confident you are. Certain = explicit in transcript. Likely = strongly implied. Possible = inferred but not explicit." },
    evidence: { type: "string", description: "Direct quote or paraphrase from the transcript supporting this suggestion." },
  },
  required: ["value", "confidence", "evidence"],
};

const SUGGESTED_UPDATE_FIELD_NUMBER = {
  type: "object",
  properties: {
    value: { type: "number", description: "The suggested numeric value" },
    confidence: { type: "string", enum: ["Certain", "Likely", "Possible"] },
    evidence: { type: "string" },
  },
  required: ["value", "confidence", "evidence"],
};

// ─── Main Intelligence Tool Schema ───

const INTELLIGENCE_TOOL = {
  type: "function" as const,
  function: {
    name: "meeting_intelligence",
    description: "Extract comprehensive meeting intelligence from a sales meeting transcript.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Comprehensive 3-5 sentence summary covering key topics, decisions, prospect needs, objections, and overall tone.",
        },
        attendees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string", description: "Job title or role if mentioned" },
              company: { type: "string" },
            },
            required: ["name", "role", "company"],
          },
          description: "All people who participated in the meeting.",
        },
        keyTopics: {
          type: "array",
          items: { type: "string" },
          description: "Main topics discussed, in order of importance.",
        },
        nextSteps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string", description: "The specific action to take" },
              owner: { type: "string", description: "Who owns this action" },
              deadline: { type: "string", description: "When it should be done, or empty" },
            },
            required: ["action", "owner", "deadline"],
          },
        },
        actionItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              owner: { type: "string" },
              deadline: { type: "string" },
              status: { type: "string", enum: ["New", "Pending", "In Progress"] },
            },
            required: ["item", "owner", "deadline", "status"],
          },
        },
        decisions: {
          type: "array",
          items: { type: "string" },
          description: "Concrete decisions made during the meeting.",
        },
        dealSignals: {
          type: "object",
          properties: {
            buyingIntent: { type: "string", enum: ["Strong", "Moderate", "Low", "None detected"] },
            sentiment: { type: "string", enum: ["Very Positive", "Positive", "Neutral", "Cautious", "Negative"] },
            timeline: { type: "string", description: "E.g. 'Q2 2026', 'Next 30 days', 'No timeline discussed'" },
            budgetMentioned: { type: "string", description: "Any budget signals or ranges mentioned, or 'Not discussed'" },
            champions: { type: "array", items: { type: "string" }, description: "Internal advocates or supporters" },
            competitors: { type: "array", items: { type: "string" }, description: "Competing solutions or vendors mentioned" },
            objections: { type: "array", items: { type: "string" }, description: "Concerns, pushback, or objections raised" },
            riskFactors: { type: "array", items: { type: "string" }, description: "Deal risks identified" },
            decisionProcess: { type: "string", description: "How decisions are made — who decides, approval process, etc." },
            urgencyDrivers: { type: "array", items: { type: "string" }, description: "What's driving urgency or lack thereof" },
          },
          required: ["buyingIntent", "sentiment", "timeline", "budgetMentioned", "champions", "competitors", "objections", "riskFactors", "decisionProcess", "urgencyDrivers"],
        },
        priorFollowUps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              status: { type: "string", enum: ["Addressed", "Outstanding", "Dropped"] },
            },
            required: ["item", "status"],
          },
          description: "Status of action items from prior meetings. Empty array if no prior meetings.",
        },
        relationshipProgression: {
          type: "string",
          description: "How the relationship has evolved across meetings. Empty if first meeting.",
        },
        questionsAsked: {
          type: "array",
          items: { type: "string" },
          description: "Notable questions asked by the prospect.",
        },
        painPoints: {
          type: "array",
          items: { type: "string" },
          description: "Pain points, frustrations, or unmet needs expressed by the prospect.",
        },
        valueProposition: {
          type: "string",
          description: "What aspects of the offering resonated most with the prospect.",
        },
        engagementLevel: {
          type: "string",
          enum: ["Highly Engaged", "Engaged", "Passive", "Disengaged"],
        },
        talkingPoints: {
          type: "array",
          items: { type: "string" },
          description: "Key talking points to reference in follow-up communications.",
        },
        competitiveIntel: {
          type: "string",
          description: "Any competitive intelligence gathered — what they use now, what else they're evaluating.",
        },
        pricingDiscussion: {
          type: "string",
          description: "Summary of any pricing, budget, or cost discussions. 'Not discussed' if none.",
        },
        talkRatio: {
          type: "number",
          description: "Estimated percentage (0-100) of time OUR team talked vs the prospect. Lower is better (good listening). Estimate from transcript patterns.",
        },
        questionQuality: {
          type: "string",
          enum: ["Strong", "Adequate", "Weak"],
          description: "Did our team ask good discovery/qualifying questions, or just pitch? Strong = probing open-ended questions. Weak = mostly statements/pitching.",
        },
        objectionHandling: {
          type: "string",
          enum: ["Effective", "Partial", "Missed"],
          description: "When objections were raised, did our team address them effectively? Effective = acknowledged and provided compelling response. Missed = ignored or deflected.",
        },
        // ─── CRM Field Suggestions ───
        suggestedLeadUpdates: {
          type: "object",
          description: "CRM field updates suggested based on transcript evidence. ONLY include fields you have evidence for. Omit any field you're unsure about.",
          properties: {
            stage: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "Pipeline stage. Values: 'Meeting Held', 'Proposal Sent', 'Negotiation', 'Contract Sent', 'Closed Won', 'Closed Lost', 'Went Dark'. A transcript of a meeting that happened = at minimum 'Meeting Held'.",
            },
            meetingOutcome: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "Meeting outcome. Values: 'Held', 'No-Show', 'Rescheduled', 'Cancelled'. If a real meeting happened with discussion, this is 'Held'.",
            },
            meetingDate: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "The date of THIS meeting in YYYY-MM-DD format, extracted from transcript metadata or discussion.",
            },
            nextFollowUp: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "Next follow-up date in YYYY-MM-DD format, if a specific date/timeframe was discussed.",
            },
            priority: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "Priority level. Values: 'High', 'Medium', 'Low'. Based on buying intent + engagement + deal size signals.",
            },
            forecastCategory: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "Forecast category. Values: 'Commit', 'Best Case', 'Pipeline', 'Omit'. Only suggest 'Commit' if prospect verbally committed. 'Omit' if clearly dead.",
            },
            icpFit: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "ICP fit. Values: 'Strong', 'Moderate', 'Weak'. Based on company profile, deal strategy, and needs alignment with our services.",
            },
            serviceInterest: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "Service interest. Values: 'Off-Market Email Origination', 'Direct Calling', 'Banker/Broker Coverage', 'Full Platform (All 3)', 'SourceCo Retained Search', 'Other', 'TBD'. Only suggest if explicitly discussed.",
            },
            dealValue: {
              ...SUGGESTED_UPDATE_FIELD_NUMBER,
              description: "Estimated deal value in dollars. Only suggest if pricing/budget was explicitly discussed.",
            },
            assignedTo: {
              ...SUGGESTED_UPDATE_FIELD,
              description: "Deal owner name. Values: 'Malik', 'Valeria', 'Tomos'. Only suggest if a specific person from our team is clearly leading this deal based on the transcript.",
            },
          },
        },
      },
      required: [
        "summary", "attendees", "keyTopics", "nextSteps", "actionItems",
        "decisions", "dealSignals", "priorFollowUps", "relationshipProgression",
        "questionsAsked", "painPoints", "valueProposition", "engagementLevel",
        "talkingPoints", "competitiveIntel", "pricingDiscussion",
        "talkRatio", "questionQuality", "objectionHandling",
        "suggestedLeadUpdates",
      ],
      additionalProperties: false,
    },
  },
};

// ─── Build Prior Context ───

function buildPriorContext(priorMeetings: any[]): string {
  if (!priorMeetings || priorMeetings.length === 0) return "";

  let ctx = "\n\nPRIOR MEETING HISTORY (oldest first):\n";
  for (const m of priorMeetings) {
    ctx += `\n--- Meeting: ${m.title || "Untitled"} (${m.date || "unknown date"}) ---\n`;
    if (m.intelligence) {
      const intel = m.intelligence;
      ctx += `Summary: ${intel.summary}\n`;
      if (intel.nextSteps?.length) {
        ctx += `Next Steps: ${intel.nextSteps.map((ns: any) => `${ns.action} (${ns.owner})`).join("; ")}\n`;
      }
      if (intel.actionItems?.length) {
        ctx += `Action Items: ${intel.actionItems.map((ai: any) => `${ai.item} [${ai.status}]`).join("; ")}\n`;
      }
      if (intel.dealSignals) {
        ctx += `Deal Signals: Intent=${intel.dealSignals.buyingIntent}, Sentiment=${intel.dealSignals.sentiment}\n`;
      }
      if (intel.painPoints?.length) {
        ctx += `Pain Points: ${intel.painPoints.join("; ")}\n`;
      }
      if (intel.decisions?.length) {
        ctx += `Decisions: ${intel.decisions.join("; ")}\n`;
      }
    } else {
      if (m.summary) ctx += `Summary: ${m.summary}\n`;
      if (m.nextSteps) ctx += `Next Steps: ${m.nextSteps}\n`;
    }
  }
  return ctx;
}

// ─── Server ───

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { transcript, priorMeetings } = body;

    if (!transcript || transcript.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Transcript is too short to summarize" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priorContext = buildPriorContext(priorMeetings);
    const truncated = transcript.length > 25000
      ? transcript.substring(0, 25000) + "\n\n[Transcript truncated...]"
      : transcript;

    const hasPrior = priorMeetings?.length > 0;

    const systemPrompt = `You are an elite sales intelligence analyst for an M&A deal origination firm (Captarget / SourceCo). You extract comprehensive, structured intelligence from meeting transcripts to inform the sales process.

Context: The firm helps private equity firms and strategic acquirers find and close acquisitions. Services include off-market email origination, direct calling campaigns, and broker/banker coverage.

Your analysis must be thorough, specific, and actionable. Extract every signal that could inform the deal process. Use concrete details from the transcript — never be vague or generic.

${hasPrior ? "IMPORTANT: You have prior meeting history. Track which prior action items were addressed, which are outstanding, and how the relationship has progressed. Note changes in sentiment, intent, or engagement." : "This is the first meeting with this prospect."}

## CRM FIELD UPDATE RULES (suggestedLeadUpdates)

You MUST also recommend CRM field updates based on transcript evidence. Follow these rules with absolute discipline:

### Confidence Levels
- **Certain**: The transcript EXPLICITLY states or directly demonstrates this. A meeting transcript existing = the meeting was "Held" (Certain). An explicit date mentioned = Certain.
- **Likely**: Strongly implied by multiple signals but not explicitly stated. E.g., strong buying intent + pricing discussion + timeline = "Best Case" forecast is Likely.
- **Possible**: Inferred from indirect signals. DO NOT auto-apply these. Only include if the inference is reasonable.

### Stage Mapping (from transcript content)
- Transcript of a real meeting with discussion → stage = "Meeting Held" (Certain)
- Detailed pricing/proposal discussed → stage = "Proposal Sent" (Certain if they said "send the proposal" or we presented pricing; Likely if pricing was just explored)
- Negotiating terms, pushing back on pricing, discussing contract details → stage = "Negotiation" (Certain if explicit negotiation; Likely if just pricing pushback)
- "Send us the contract" / "let's get the paperwork going" → stage = "Contract Sent" (Certain)
- Verbal commitment, "we're moving forward", "let's do this" → stage = "Closed Won" (Certain only if unambiguous commitment with no caveats)
- "We've decided to go another direction" / clear rejection → stage = "Closed Lost" (Certain)

### Priority Mapping
- Strong buying intent + Highly Engaged + clear timeline → "High" (Likely)
- Moderate intent + Engaged → "Medium" (Likely)
- Low intent + Passive/Disengaged → "Low" (Likely)

### Service Interest
- Only suggest if they EXPLICITLY discussed which service(s) they want. Never guess.

### Deal Value
- Only suggest if specific pricing, budget numbers, or deal size was discussed. Use the number mentioned.

### Owner (assignedTo)
- Only suggest if you can identify a specific team member (Malik, Valeria, or Tomos) who is clearly leading the conversation from our side.

### Dates
- meetingDate: Extract from transcript metadata if available. Otherwise Possible.
- nextFollowUp: Only if a specific follow-up date was discussed. "Next week" = calculate from meeting date if known.

### ICP Fit
- Strong: They match our ideal customer perfectly (PE firm or strategic acquirer actively doing deals, clear M&A strategy, budget)
- Moderate: Some fit but missing elements (exploring M&A, no clear budget, early stage)  
- Weak: Poor fit (not doing M&A, no budget, wrong segment)

### Forecast Category
- Commit: ONLY if they verbally committed and there are no blockers
- Best Case: Strong signals, high probability but not committed
- Pipeline: Active opportunity, outcome uncertain
- Omit: Dead deal or not a real opportunity

CRITICAL: When in doubt, OMIT the field entirely. A missing suggestion is always better than a wrong one. We are data strategists with 50+ years of experience — we do not guess.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `${priorContext ? priorContext + "\n\n" : ""}CURRENT MEETING TRANSCRIPT:\n\n${truncated}`,
          },
        ],
        tools: [INTELLIGENCE_TOOL],
        tool_choice: { type: "function", function: { name: "meeting_intelligence" } },
        stream: false,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", status, errText);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "meeting_intelligence") {
      const content = data.choices?.[0]?.message?.content || "";
      return new Response(
        JSON.stringify({ summary: content, nextSteps: "", intelligence: null, suggestedLeadUpdates: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let intelligence;
    try {
      intelligence = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool call arguments:", e);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract backward-compatible fields
    const summary = intelligence.summary || "";
    const nextSteps = (intelligence.nextSteps || [])
      .map((ns: any) => `- ${ns.action}${ns.owner ? ` (${ns.owner})` : ""}${ns.deadline ? ` — by ${ns.deadline}` : ""}`)
      .join("\n");

    // Extract suggested lead updates separately
    const suggestedLeadUpdates = intelligence.suggestedLeadUpdates || null;
    // Remove from intelligence object to keep it clean
    delete intelligence.suggestedLeadUpdates;

    return new Response(
      JSON.stringify({ summary, nextSteps, intelligence, suggestedLeadUpdates }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-meeting error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
