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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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
      } else {
        if (m.summary) detail += `Summary: ${m.summary}\n`;
        if (m.nextSteps) detail += `Next Steps: ${m.nextSteps}\n`;
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
    }

    const systemPrompt = `You are an elite cross-meeting deal intelligence synthesizer — combining the analytical rigor of a Fortune 100 SVP of Sales/Marketing with the pattern-recognition of an FBI intelligence analyst.

Your job: Given ALL meetings with a prospect (chronologically), build a UNIFIED accumulated intelligence picture. This is NOT a per-meeting analysis — it's a cross-meeting synthesis that tracks threads, patterns, contradictions, and evolution across the entire relationship.

CRITICAL INSTRUCTIONS:
1. STAKEHOLDER MAP: Build a profile for EVERY person mentioned across all meetings. Track how their stance, concerns, and engagement evolved. Note first/last appearance.
2. OBJECTION TRACKER: Track every objection across meetings. If objection from meeting 1 was addressed in meeting 2, mark it "Addressed" with the resolution. If it resurfaces, mark "Recurring". Only mark "Open" if unresolved.
3. ACTION ITEM TRACKER: Track every action item across meetings. Cross-reference with follow-up statuses in later meetings. Mark completed items as "Completed" with which meeting resolved them. Mark items never addressed as "Dropped" or "Overdue".
4. MOMENTUM: Calculate meeting frequency. Track sentiment/intent/engagement trajectories across meetings. Compute action item completion rate. Determine overall momentum.
5. MILESTONES: Identify key deal events: first meeting, champion identified, budget discussed, proposal requested, objection overcome, decision timeline set, etc.
6. RISK REGISTER: Aggregate all risks. Assess severity. Note which are mitigated by later meetings.
7. BUYING COMMITTEE: Identify the full buying committee: decision maker, champion, influencers, blockers.
8. DEAL NARRATIVE: Write a 3-5 sentence story of the entire deal arc — how it started, evolved, where it stands, what's next.
9. DEAL STAGE EVIDENCE: What evidence supports the current stage? What evidence suggests it should advance or regress?
10. COMPETITIVE TIMELINE: Track when competitors were mentioned, evaluated, or dismissed.

Be SPECIFIC — use names, dates, quotes from meetings. Never be vague.`;

    const userContent = `LEAD CONTEXT:\n${leadContext.join("\n")}\n\nMEETING HISTORY (${meetings.length} meetings, chronological):\n${meetingDetails.join("\n")}`;

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
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "synthesize_deal_intelligence",
              description: "Return unified cross-meeting deal intelligence synthesis.",
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
                        firstSeen: { type: "string", description: "Meeting title where first appeared" },
                        lastSeen: { type: "string", description: "Meeting title where last appeared" },
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
                        raisedIn: { type: "string", description: "Meeting title where raised" },
                        status: { type: "string", enum: ["Open", "Addressed", "Recurring"] },
                        addressedIn: { type: "string", description: "Meeting title where addressed, or empty" },
                        resolution: { type: "string", description: "How it was resolved, or empty" },
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
                        createdIn: { type: "string", description: "Meeting title" },
                        status: { type: "string", enum: ["Open", "Completed", "Overdue", "Dropped"] },
                        resolvedIn: { type: "string", description: "Meeting title where resolved, or empty" },
                        deadline: { type: "string" },
                      },
                      required: ["item", "owner", "createdIn", "status", "resolvedIn", "deadline"],
                    },
                  },
                  momentumSignals: {
                    type: "object",
                    properties: {
                      meetingFrequencyDays: { type: "number", description: "Avg days between meetings" },
                      sentimentTrajectory: { type: "array", items: { type: "string" }, description: "Sentiment per meeting chronologically" },
                      intentTrajectory: { type: "array", items: { type: "string" }, description: "Intent per meeting chronologically" },
                      engagementTrajectory: { type: "array", items: { type: "string" }, description: "Engagement per meeting chronologically" },
                      completionRate: { type: "number", description: "Percentage of action items completed (0-100)" },
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
                        source: { type: "string", description: "Meeting where identified" },
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
                  dealStageEvidence: { type: "string", description: "Evidence supporting current stage + evidence for advancement/regression." },
                },
                required: [
                  "dealNarrative", "stakeholderMap", "objectionTracker", "actionItemTracker",
                  "momentumSignals", "keyMilestones", "riskRegister", "competitiveTimeline",
                  "buyingCommittee", "dealStageEvidence",
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
