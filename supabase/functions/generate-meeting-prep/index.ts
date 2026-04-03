import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PREP_TOOL = {
  type: "function" as const,
  function: {
    name: "meeting_prep_brief",
    description: "Generate a comprehensive meeting preparation brief for a sales rep before their next meeting.",
    parameters: {
      type: "object",
      properties: {
        executiveSummary: {
          type: "string",
          description: "2-3 sentence overview of the deal state, relationship health, and what to expect in this meeting.",
        },
        openActionItemsWeOwe: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              deadline: { type: "string" },
              context: { type: "string", description: "Why this matters and what to say about it" },
            },
            required: ["item", "deadline", "context"],
          },
          description: "Action items our team committed to that are still open. CRITICAL to address.",
        },
        openActionItemsTheyOwe: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              followUpApproach: { type: "string", description: "How to tactfully follow up on this" },
            },
            required: ["item", "followUpApproach"],
          },
          description: "Action items the prospect committed to — leverage for follow-up.",
        },
        unresolvedObjections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              objection: { type: "string" },
              recommendedApproach: { type: "string", description: "Specific strategy to address this objection" },
              evidence: { type: "string", description: "Data points or references to support the rebuttal" },
            },
            required: ["objection", "recommendedApproach", "evidence"],
          },
        },
        stakeholderBriefing: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              stance: { type: "string" },
              keyInterests: { type: "string", description: "What they care about most" },
              approachTips: { type: "string", description: "How to engage this person effectively" },
            },
            required: ["name", "role", "stance", "keyInterests", "approachTips"],
          },
        },
        competitiveThreats: {
          type: "array",
          items: {
            type: "object",
            properties: {
              competitor: { type: "string" },
              threat: { type: "string" },
              counterStrategy: { type: "string" },
            },
            required: ["competitor", "threat", "counterStrategy"],
          },
        },
        talkingPoints: {
          type: "array",
          items: { type: "string" },
          description: "5-8 specific talking points to advance the deal, ordered by priority.",
        },
        questionsToAsk: {
          type: "array",
          items: { type: "string" },
          description: "5-8 strategic questions based on intelligence gaps — what we still need to learn.",
        },
        risksToWatch: {
          type: "array",
          items: { type: "string" },
          description: "Red flags or risks to monitor during the meeting.",
        },
        desiredOutcomes: {
          type: "array",
          items: { type: "string" },
          description: "What specific outcomes should we aim to achieve in this meeting?",
        },
        openingHook: {
          type: "string",
          description: "A personalized opening sentence the rep can say in the first 30 seconds. Reference something specific about the prospect's company, recent news, or situation. Write it as a direct quote they can use verbatim. Example: 'Cody, I saw Dillard Door just partnered with Shore Capital — curious how that's changing your approach to growth.'",
        },
        theOneInsight: {
          type: "string",
          description: "The single most important thing to know walking into this meeting. One sentence that changes how the rep approaches the call. This is the 'if you read nothing else' insight.",
        },
        landmines: {
          type: "array",
          items: { type: "string" },
          description: "2-3 things to absolutely NOT say or topics to avoid in this meeting. These are deal-killers based on what you know about the prospect, their objections, sensitivities, or competitive situation.",
        },
        keyQuestions: {
          type: "array",
          items: { type: "string" },
          description: "3-5 strategic questions ranked by importance that unlock the next stage. These should be specific to this deal — not generic discovery questions. Write them as direct quotes the rep can ask verbatim.",
        },
        meetingGoal: {
          type: "string",
          description: "The specific outcome to achieve in this meeting. Be concrete: 'Get verbal agreement to proceed to LOI review' not 'Advance the deal'. What does winning this meeting look like?",
        },
      },
      required: [
        "executiveSummary", "openActionItemsWeOwe", "openActionItemsTheyOwe",
        "unresolvedObjections", "stakeholderBriefing", "competitiveThreats",
        "talkingPoints", "questionsToAsk", "risksToWatch", "desiredOutcomes",
        "openingHook", "theOneInsight", "landmines", "keyQuestions", "meetingGoal",
      ],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { meetings, leadFields, dealIntelligence } = await req.json();

    // Allow prep even with no prior meetings — use lead context + deal intelligence
    const hasMeetings = meetings && meetings.length > 0;
    const hasContext = leadFields?.name || dealIntelligence;
    if (!hasMeetings && !hasContext) {
      return new Response(JSON.stringify({ error: "No meetings or lead context to prepare from" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build comprehensive context
    const contextParts: string[] = [];

    // Lead context
    if (leadFields) {
      const lf = leadFields;
      contextParts.push(`PROSPECT: ${lf.name || "Unknown"} — ${lf.role || ""} at ${lf.company || "Unknown Company"}`);
      contextParts.push(`Current Stage: ${lf.stage || "Unknown"} | Priority: ${lf.priority || "Unknown"} | Deal Value: $${lf.dealValue || 0} | Service: ${lf.serviceInterest || "TBD"}`);
    }

    // Deal intelligence
    if (dealIntelligence) {
      const di = dealIntelligence;
      if (di.dealNarrative) contextParts.push(`\nDEAL NARRATIVE:\n${di.dealNarrative}`);
      if (di.momentumSignals) contextParts.push(`Momentum: ${di.momentumSignals.momentum} | Completion Rate: ${di.momentumSignals.completionRate}%`);
      if (di.buyingCommittee) {
        contextParts.push(`Buying Committee: DM=${di.buyingCommittee.decisionMaker || "Unknown"}, Champion=${di.buyingCommittee.champion || "None"}, Blockers=${di.buyingCommittee.blockers?.join(", ") || "None"}`);
      }
      if (di.objectionTracker?.length) {
        contextParts.push(`\nOBJECTION TRACKER:\n${di.objectionTracker.map((o: any) => `- ${o.objection} [${o.status}]${o.resolution ? ": " + o.resolution : ""}`).join("\n")}`);
      }
      if (di.actionItemTracker?.length) {
        contextParts.push(`\nACTION ITEM TRACKER:\n${di.actionItemTracker.map((a: any) => `- ${a.item} (${a.owner}) [${a.status}]${a.deadline ? " due " + a.deadline : ""}`).join("\n")}`);
      }
      if (di.riskRegister?.length) {
        contextParts.push(`\nRISKS:\n${di.riskRegister.map((r: any) => `- ${r.risk} [${r.severity}] — ${r.mitigationStatus}`).join("\n")}`);
      }
      if (di.stakeholderMap?.length) {
        contextParts.push(`\nSTAKEHOLDERS:\n${di.stakeholderMap.map((s: any) => `- ${s.name} (${s.role} @ ${s.company}) — Stance: ${s.stance}, Influence: ${s.influence}${s.concerns?.length ? ", Concerns: " + s.concerns.join("; ") : ""}`).join("\n")}`);
      }
    }

    // All meeting summaries
    const sorted = [...meetings].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    contextParts.push(`\nMEETING HISTORY (${sorted.length} meetings):`);
    for (const m of sorted) {
      contextParts.push(`\n--- ${m.title} (${m.date}) ---`);
      if (m.intelligence) {
        contextParts.push(`Summary: ${m.intelligence.summary}`);
        if (m.intelligence.nextSteps?.length) {
          contextParts.push(`Next Steps: ${m.intelligence.nextSteps.map((ns: any) => `${ns.action} (${ns.owner})`).join("; ")}`);
        }
        if (m.intelligence.dealSignals) {
          contextParts.push(`Signals: Intent=${m.intelligence.dealSignals.buyingIntent}, Sentiment=${m.intelligence.dealSignals.sentiment}`);
        }
      } else if (m.summary) {
        contextParts.push(`Summary: ${m.summary}`);
      }
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
            content: `You are an elite sales strategist preparing a rep for their next meeting with a prospect. You have access to the full deal history, meeting transcripts, stakeholder profiles, and accumulated intelligence.

Your job is to create a BATTLE-READY prep brief that ensures the rep walks in fully informed, with a clear strategy, and leaves having advanced the deal.

Context: This is an M&A deal origination firm (Captarget / SourceCo) that helps PE firms and strategic acquirers source acquisitions. Services include off-market email origination, direct calling campaigns, and broker/banker coverage.

Be SPECIFIC. Reference actual names, dates, and discussion points from the meetings. Never be generic.
NEVER use em dashes (—), en dashes (–), or double hyphens (--). Use periods, commas, or line breaks instead.`,
          },
          { role: "user", content: contextParts.join("\n") },
        ],
        tools: [PREP_TOOL],
        tool_choice: { type: "function", function: { name: "meeting_prep_brief" } },
        stream: false,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await response.text();
      console.error("AI gateway error:", status, errText);
      return new Response(JSON.stringify({ error: "AI processing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "meeting_prep_brief") {
      return new Response(JSON.stringify({ error: "Failed to generate prep brief" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const brief = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ brief }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-meeting-prep error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
