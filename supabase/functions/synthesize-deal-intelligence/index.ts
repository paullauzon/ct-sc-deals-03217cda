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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const { meetings, leadFields } = await req.json();

    if (!meetings || meetings.length === 0) {
      return new Response(
        JSON.stringify({ error: "No meetings to synthesize" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build comprehensive meeting history for the AI
    const meetingDetails: string[] = [];
    for (const m of meetings) {
      let detail = `\n=== MEETING: "${m.title || "Untitled"}" (${m.date || "unknown"}) ===\n`;
      if (m.intelligence) {
        const intel = m.intelligence;
        detail += `Summary: ${intel.summary}\n`;
        if (intel.attendees?.length) {
          detail += `Attendees: ${intel.attendees.map((a: any) => `${a.name} (${a.role} @ ${a.company})`).join(", ")}\n`;
        }
        if (intel.keyTopics?.length) detail += `Topics: ${intel.keyTopics.join(", ")}\n`;
        if (intel.nextSteps?.length) {
          detail += `Next Steps: ${intel.nextSteps.map((ns: any) => `${ns.action} [${ns.owner}] ${ns.deadline ? `by ${ns.deadline}` : ""}`).join("; ")}\n`;
        }
        if (intel.actionItems?.length) {
          detail += `Action Items: ${intel.actionItems.map((ai: any) => `${ai.item} [${ai.owner}, ${ai.status}] ${ai.deadline ? `by ${ai.deadline}` : ""}`).join("; ")}\n`;
        }
        if (intel.decisions?.length) detail += `Decisions: ${intel.decisions.join("; ")}\n`;
        if (intel.dealSignals) {
          const ds = intel.dealSignals;
          detail += `Deal Signals: Intent=${ds.buyingIntent}, Sentiment=${ds.sentiment}, Timeline=${ds.timeline}, Budget=${ds.budgetMentioned}\n`;
          if (ds.champions?.length) detail += `Champions: ${ds.champions.join(", ")}\n`;
          if (ds.competitors?.length) detail += `Competitors: ${ds.competitors.join(", ")}\n`;
          if (ds.objections?.length) detail += `Objections: ${ds.objections.join("; ")}\n`;
          if (ds.riskFactors?.length) detail += `Risks: ${ds.riskFactors.join("; ")}\n`;
          if (ds.decisionProcess) detail += `Decision Process: ${ds.decisionProcess}\n`;
          if (ds.urgencyDrivers?.length) detail += `Urgency: ${ds.urgencyDrivers.join("; ")}\n`;
        }
        if (intel.priorFollowUps?.length) {
          detail += `Prior Follow-up Status: ${intel.priorFollowUps.map((f: any) => `"${f.item}" → ${f.status}`).join("; ")}\n`;
        }
        if (intel.painPoints?.length) detail += `Pain Points: ${intel.painPoints.join("; ")}\n`;
        if (intel.questionsAsked?.length) detail += `Questions: ${intel.questionsAsked.join("; ")}\n`;
        if (intel.valueProposition) detail += `Value Resonance: ${intel.valueProposition}\n`;
        detail += `Engagement: ${intel.engagementLevel}\n`;
        if (intel.competitiveIntel) detail += `Competitive Intel: ${intel.competitiveIntel}\n`;
        if (intel.pricingDiscussion) detail += `Pricing: ${intel.pricingDiscussion}\n`;
        if (intel.relationshipProgression) detail += `Relationship: ${intel.relationshipProgression}\n`;
        if (intel.talkRatio) detail += `Talk Ratio (us vs them): ${intel.talkRatio}%\n`;
        if (intel.questionQuality) detail += `Question Quality: ${intel.questionQuality}\n`;
        if (intel.objectionHandling) detail += `Objection Handling: ${intel.objectionHandling}\n`;
        if (intel.talkingPoints?.length) detail += `Talking Points: ${intel.talkingPoints.join("; ")}\n`;
      } else {
        if (m.summary) detail += `Summary: ${m.summary}\n`;
        if (m.nextSteps) detail += `Next Steps: ${m.nextSteps}\n`;
      }
      if (m.transcript) {
        // Include first 3000 chars of transcript for psychological analysis
        detail += `\nTRANSCRIPT EXCERPT:\n${m.transcript.substring(0, 3000)}\n`;
      }
      meetingDetails.push(detail);
    }

    // Build lead context
    const leadContext: string[] = [];
    if (leadFields) {
      const lf = leadFields;
      if (lf.name) leadContext.push(`Lead: ${lf.name}`);
      if (lf.company) leadContext.push(`Company: ${lf.company}`);
      if (lf.role) leadContext.push(`Role: ${lf.role}`);
      if (lf.stage) leadContext.push(`Current Stage: ${lf.stage}`);
      if (lf.priority) leadContext.push(`Priority: ${lf.priority}`);
      if (lf.dealValue) leadContext.push(`Deal Value: $${lf.dealValue}`);
      if (lf.serviceInterest) leadContext.push(`Service Interest: ${lf.serviceInterest}`);
      if (lf.message) leadContext.push(`Original Inquiry: ${lf.message}`);
      if (lf.targetCriteria) leadContext.push(`Target Criteria: ${lf.targetCriteria}`);
      if (lf.acquisitionStrategy) leadContext.push(`Acquisition Strategy: ${lf.acquisitionStrategy}`);
    }

    const systemPrompt = `You are an elite deal intelligence synthesizer operating at the intersection of FIVE disciplines:

1. FORTUNE 100 SVP OF SALES — 50+ years pattern recognition across thousands of enterprise deals. You see the deal mechanics, pipeline dynamics, and closing patterns that rookies miss.

2. FBI INTELLIGENCE ANALYST — You cross-reference data points across meetings to identify contradictions, evolving narratives, hidden agendas, and what's being deliberately withheld.

3. MASTER ORGANIZATIONAL PSYCHOLOGIST — You read between the lines of every conversation. You understand career motivations, personal ambitions, fear of failure, desire for recognition, and the politics of organizational decision-making. You know that every buyer has a PERSONAL reason (promotion, job security, impressing the board, looking innovative) layered on top of the business reason.

4. HOSTAGE NEGOTIATOR — You analyze communication patterns, emotional states, trust signals, and leverage points. You notice when someone's words don't match their energy. You identify the "tells" — repeated phrases, avoided topics, deflections, over-explanations.

5. BEHAVIORAL ECONOMIST — You spot cognitive biases at play: anchoring, loss aversion, status quo bias, social proof needs, authority influence. You understand how framing changes decisions.

Your job: Given ALL meetings with a prospect (chronologically), build a UNIFIED intelligence picture that goes BEYOND operational data into the HUMAN LAYER — the psychology, politics, fears, and desires that actually close deals.

CRITICAL INSTRUCTIONS FOR OPERATIONAL INTELLIGENCE:
1. STAKEHOLDER MAP: Build a profile for EVERY person. Track stance/concern evolution. For each person, infer their PERSONAL win condition (what closing means for their career), their communication style (Analytical/Driver/Amiable/Expressive), what decision trigger will move them, and what hidden concern they haven't voiced.
2. OBJECTION TRACKER: Track every objection across meetings with status.
3. ACTION ITEM TRACKER: Cross-reference action items across meetings.
4. MOMENTUM: Calculate meeting frequency, trajectory signals, completion rate.
5. MILESTONES: Key deal events chronologically.
6. RISK REGISTER: All risks with severity and mitigation status.
7. BUYING COMMITTEE: Full committee identification.
8. DEAL NARRATIVE: 3-5 sentence story of the deal arc.
9. DEAL STAGE EVIDENCE: Evidence for current stage.
10. COMPETITIVE TIMELINE: When competitors were mentioned.

CRITICAL INSTRUCTIONS FOR PSYCHOLOGICAL INTELLIGENCE:
11. POWER DYNAMICS: Map the REAL influence structure — who has actual power vs. title authority? What internal politics are at play? What tensions exist between stakeholders? In what ORDER must people be won over?
12. PSYCHOLOGICAL PROFILE:
   - The Real "Why": What's ACTUALLY driving this purchase at a human level? Not ROI — the personal motivation.
   - Fear Factor: What happens to the champion/decision-maker if they DON'T buy? What are they afraid of?
   - Trust Level: How much do they trust us? Cite specific evidence.
   - Emotional Triggers: What language, framing, or topics made them lean in? What resonated emotionally?
   - The Unspoken Ask: What do they want but haven't directly said? Read between the lines.
   - Cognitive Biases: What biases are at play that we can ethically leverage?
   - Recommended Approach: Specific psychological approach for the next interaction.
13. WIN STRATEGY:
   - #1 Thing That Closes This Deal: ONE sentence — the single most important thing.
   - Landmines: Topics, phrases, or approaches that could KILL this deal.
   - Power Move: The strategic action that would DRAMATICALLY accelerate this deal.
   - Relationship Leverage: Who to activate, who to neutralize, what relationships to build.
   - Deal Temperature: How hot is this deal RIGHT NOW?
   - Closing Window: When does the window close and why?
   - Negotiation Style: How should we negotiate with this specific buyer?

ANALYSIS TECHNIQUES — apply these to transcripts:
- Track question patterns: what they ask reveals what they fear
- Notice what they emphasize vs. what they avoid
- Meeting attendance patterns signal priority and politics
- Language choices reveal emotional state (hedging = uncertainty, "we" vs "I" = consensus vs authority)
- Response latency to follow-ups signals true interest level
- How they describe the problem reveals how they'll justify the purchase internally

Be SPECIFIC — use names, dates, inferred evidence. Never be generic or vague. If you must infer, explain WHY you're inferring it.`;

    const userContent = `LEAD CONTEXT:\n${leadContext.join("\n")}\n\nMEETING HISTORY (${meetings.length} meetings, chronological):\n${meetingDetails.join("\n")}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "synthesize_deal_intelligence",
              description: "Return unified cross-meeting deal intelligence synthesis with deep psychological analysis.",
              parameters: {
                type: "object",
                properties: {
                  dealNarrative: { type: "string", description: "3-5 sentence story of the entire deal arc." },
                  stakeholderMap: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        role: { type: "string" },
                        company: { type: "string" },
                        stance: { type: "string", enum: ["Champion", "Supporter", "Neutral", "Skeptic", "Blocker", "Unknown"] },
                        influence: { type: "string", enum: ["Decision Maker", "High", "Medium", "Low", "Unknown"] },
                        concerns: { type: "array", items: { type: "string" } },
                        mentions: { type: "number" },
                        firstSeen: { type: "string" },
                        lastSeen: { type: "string" },
                        personalWin: { type: "string", description: "What closing this deal means for THIS person's career/reputation/goals" },
                        careerRisk: { type: "string", description: "What they risk personally by championing or blocking this deal" },
                        communicationStyle: { type: "string", enum: ["Analytical", "Driver", "Amiable", "Expressive", ""], description: "Their dominant communication style" },
                        decisionTrigger: { type: "string", description: "What specific thing will make this person say yes" },
                        hiddenConcern: { type: "string", description: "What they're NOT saying but you can infer from their behavior/questions" },
                      },
                      required: ["name", "role", "company", "stance", "influence", "concerns", "mentions", "firstSeen", "lastSeen"],
                    },
                  },
                  objectionTracker: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        objection: { type: "string" },
                        raisedIn: { type: "string" },
                        status: { type: "string", enum: ["Open", "Addressed", "Recurring"] },
                        addressedIn: { type: "string" },
                        resolution: { type: "string" },
                      },
                      required: ["objection", "raisedIn", "status", "addressedIn", "resolution"],
                    },
                  },
                  actionItemTracker: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item: { type: "string" },
                        owner: { type: "string" },
                        createdIn: { type: "string" },
                        status: { type: "string", enum: ["Open", "Completed", "Overdue", "Dropped"] },
                        resolvedIn: { type: "string" },
                        deadline: { type: "string" },
                      },
                      required: ["item", "owner", "createdIn", "status", "resolvedIn", "deadline"],
                    },
                  },
                  momentumSignals: {
                    type: "object",
                    properties: {
                      meetingFrequencyDays: { type: "number" },
                      sentimentTrajectory: { type: "array", items: { type: "string" } },
                      intentTrajectory: { type: "array", items: { type: "string" } },
                      engagementTrajectory: { type: "array", items: { type: "string" } },
                      completionRate: { type: "number" },
                      momentum: { type: "string", enum: ["Accelerating", "Steady", "Stalling", "Stalled"] },
                    },
                    required: ["meetingFrequencyDays", "sentimentTrajectory", "intentTrajectory", "engagementTrajectory", "completionRate", "momentum"],
                  },
                  keyMilestones: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string" },
                        event: { type: "string" },
                        significance: { type: "string" },
                      },
                      required: ["date", "event", "significance"],
                    },
                  },
                  riskRegister: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        risk: { type: "string" },
                        severity: { type: "string", enum: ["Critical", "High", "Medium", "Low"] },
                        source: { type: "string" },
                        mitigationStatus: { type: "string", enum: ["Unmitigated", "Partially Mitigated", "Mitigated"] },
                      },
                      required: ["risk", "severity", "source", "mitigationStatus"],
                    },
                  },
                  competitiveTimeline: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string" },
                        event: { type: "string" },
                      },
                      required: ["date", "event"],
                    },
                  },
                  buyingCommittee: {
                    type: "object",
                    properties: {
                      decisionMaker: { type: "string" },
                      champion: { type: "string" },
                      influencers: { type: "array", items: { type: "string" } },
                      blockers: { type: "array", items: { type: "string" } },
                      unknowns: { type: "array", items: { type: "string" } },
                    },
                    required: ["decisionMaker", "champion", "influencers", "blockers", "unknowns"],
                  },
                  dealStageEvidence: { type: "string" },
                  // NEW: Psychological intelligence
                  powerDynamics: {
                    type: "object",
                    properties: {
                      realInfluenceMap: { type: "string", description: "Who has REAL influence vs title authority. Be specific with names." },
                      internalPolitics: { type: "string", description: "What organizational politics are at play?" },
                      relationshipTensions: { type: "string", description: "Tensions between stakeholders that affect the deal" },
                      winningOrder: { type: "array", items: { type: "string" }, description: "Names in the order they must be won over, with brief reason" },
                    },
                    required: ["realInfluenceMap", "internalPolitics", "relationshipTensions", "winningOrder"],
                  },
                  psychologicalProfile: {
                    type: "object",
                    properties: {
                      realWhy: { type: "string", description: "What's ACTUALLY driving this purchase at a human level — the personal motivation behind the business case" },
                      fearFactor: { type: "string", description: "What happens to the champion/DM if they DON'T buy? What are they genuinely afraid of?" },
                      trustLevel: { type: "string", description: "Assessment of how much they trust us and why" },
                      trustEvidence: { type: "array", items: { type: "string" }, description: "Specific evidence from transcripts supporting trust assessment" },
                      emotionalTriggers: { type: "array", items: { type: "string" }, description: "Language, framing, or topics that made them lean in emotionally" },
                      unspokenAsk: { type: "string", description: "What they want but haven't directly said — read between the lines" },
                      cognitivebiases: { type: "array", items: { type: "string" }, description: "Cognitive biases at play (e.g., 'Loss aversion — they keep mentioning what they'll lose without a solution')" },
                      recommendedApproach: { type: "string", description: "Specific psychological approach for the next interaction" },
                    },
                    required: ["realWhy", "fearFactor", "trustLevel", "trustEvidence", "emotionalTriggers", "unspokenAsk", "cognitivebiases", "recommendedApproach"],
                  },
                  winStrategy: {
                    type: "object",
                    properties: {
                      numberOneCloser: { type: "string", description: "ONE sentence — the single most important thing that closes this deal" },
                      landmines: { type: "array", items: { type: "string" }, description: "Topics, phrases, or approaches that could KILL this deal" },
                      powerMove: { type: "string", description: "The strategic action that would DRAMATICALLY accelerate this deal" },
                      relationshipLeverage: { type: "string", description: "Who to activate, who to neutralize, what relationships to build" },
                      dealTemperature: { type: "string", enum: ["On Fire", "Warm", "Lukewarm", "Cold", "Ice Cold"] },
                      closingWindow: { type: "string", description: "When does the window close and why?" },
                      negotiationStyle: { type: "string", description: "How should we negotiate with this specific buyer?" },
                    },
                    required: ["numberOneCloser", "landmines", "powerMove", "relationshipLeverage", "dealTemperature", "closingWindow", "negotiationStyle"],
                  },
                },
                required: [
                  "dealNarrative", "stakeholderMap", "objectionTracker", "actionItemTracker",
                  "momentumSignals", "keyMilestones", "riskRegister", "competitiveTimeline",
                  "buyingCommittee", "dealStageEvidence",
                  "powerDynamics", "psychologicalProfile", "winStrategy",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "synthesize_deal_intelligence" } },
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI synthesis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "AI did not return structured data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const dealIntelligence = JSON.parse(toolCall.function.arguments);
    dealIntelligence.synthesizedAt = new Date().toISOString();

    console.log("Deal intelligence synthesized:", meetings.length, "meetings");

    return new Response(
      JSON.stringify({ dealIntelligence }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("synthesize-deal-intelligence error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});