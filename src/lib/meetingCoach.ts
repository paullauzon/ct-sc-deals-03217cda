import { Meeting, Lead, LeadStage } from "@/types/lead";

// Curated question checklist by stage. If any of these wasn't asked,
// it surfaces as a "question gap" coaching signal.
// v2 stage keys are primary; legacy keys mirror them so old data still scores.
const DISCOVERY_SCHEDULED_CHECKLIST = [
  { label: "Acquisition criteria (size/sector/geo)", keywords: ["criteria", "buybox", "size range", "ebitda", "revenue range", "geography", "sector"] },
  { label: "Decision process", keywords: ["decision", "approve", "ic ", "investment committee", "who else"] },
  { label: "Timeline / urgency", keywords: ["timeline", "when", "by end of", "this quarter", "this year"] },
  { label: "Current sourcing approach", keywords: ["currently", "today", "right now", "in-house", "banker", "broker"] },
  { label: "Budget / spend today", keywords: ["budget", "spending", "paying", "cost", "investment"] },
];
const DISCOVERY_COMPLETED_CHECKLIST = [
  { label: "Champion buy-in", keywords: ["champion", "internally", "team thinks", "partners think"] },
  { label: "Other stakeholders", keywords: ["who else", "anyone else", "your team", "partner"] },
  { label: "Competitive evaluation", keywords: ["others", "evaluating", "comparing", "alternatives", "vendors"] },
  { label: "Success metric", keywords: ["success", "looks like", "measure", "outcome", "win"] },
  { label: "Specific next step", keywords: ["next step", "follow up", "send you", "schedule"] },
];
const STAGE_QUESTION_CHECKLIST: Partial<Record<LeadStage, { label: string; keywords: string[] }[]>> = {
  // v2 keys (primary)
  "Discovery Scheduled": DISCOVERY_SCHEDULED_CHECKLIST,
  "Discovery Completed": DISCOVERY_COMPLETED_CHECKLIST,
  "Sample Sent": [
    { label: "Sample reaction captured", keywords: ["thoughts", "reaction", "feedback", "useful", "what did you think"] },
    { label: "Decision criteria reaffirmed", keywords: ["criteria", "looking for", "must have", "important"] },
    { label: "Pricing temperature check", keywords: ["price", "investment", "fee", "budget"] },
  ],
  "Proposal Sent": [
    { label: "Pricing reaction", keywords: ["price", "pricing", "investment", "fee", "cost"] },
    { label: "Approval path", keywords: ["approve", "sign off", "decide", "committee"] },
    { label: "Timeline to decision", keywords: ["timeline", "by when", "when will", "deciding"] },
    { label: "Open concerns", keywords: ["concern", "worry", "hesitation", "question"] },
  ],
  "Negotiating": [
    { label: "Final blockers", keywords: ["blocker", "hold up", "needs", "before signing"] },
    { label: "Decision-maker buy-in", keywords: ["partner", "principal", "managing", "boss"] },
    { label: "Specific close date", keywords: ["sign", "close", "by", "this week", "next week"] },
  ],
  // Legacy aliases — same checklists so old data still scores
  "Meeting Set": DISCOVERY_SCHEDULED_CHECKLIST,
  "Meeting Held": DISCOVERY_COMPLETED_CHECKLIST,
  "Negotiation": [
    { label: "Final blockers", keywords: ["blocker", "hold up", "needs", "before signing"] },
    { label: "Decision-maker buy-in", keywords: ["partner", "principal", "managing", "boss"] },
    { label: "Specific close date", keywords: ["sign", "close", "by", "this week", "next week"] },
  ],
};

export interface MissedSignal {
  type: "buying-signal" | "question-gap" | "objection-deflected" | "next-step-vague";
  label: string;
  detail: string;
}

export interface CoachingInsight {
  overallRating: "Strong" | "Adequate" | "Needs work";
  ratingReason: string;
  missedSignals: MissedSignal[];
  questionGaps: string[];
  objectionHandlingNote: string | null;
  whatToDoNext: string;
}

function transcriptText(meeting: Meeting): string {
  return (meeting.transcript || "").toLowerCase();
}

function questionsAskedText(meeting: Meeting): string {
  const arr = meeting.intelligence?.questionsAsked || [];
  return arr.join(" ").toLowerCase();
}

export function deriveCoachingInsights(meeting: Meeting, lead: Lead): CoachingInsight | null {
  const intel = meeting.intelligence;
  if (!intel) return null;

  const missedSignals: MissedSignal[] = [];

  // 1. Buying signals not acknowledged: strong intent + objection-handling missed
  const intent = intel.dealSignals?.buyingIntent;
  if (intent === "Strong" && intel.objectionHandling === "Missed") {
    missedSignals.push({
      type: "buying-signal",
      label: "Strong buying intent went unacknowledged",
      detail: "Prospect signaled high intent, but objections weren't handled effectively.",
    });
  }
  if (intel.engagementLevel === "Highly Engaged" && (intel.nextSteps?.length || 0) === 0) {
    missedSignals.push({
      type: "next-step-vague",
      label: "Highly engaged — no concrete next step set",
      detail: "Engagement was strong; lock in a specific next step before momentum decays.",
    });
  }

  // 2. Decisions captured but no owner/deadline
  for (const ai of intel.actionItems || []) {
    if (ai.item && (!ai.owner || !ai.deadline)) {
      missedSignals.push({
        type: "next-step-vague",
        label: `Action item without ${!ai.owner ? "owner" : "deadline"}`,
        detail: ai.item.length > 80 ? ai.item.slice(0, 77) + "…" : ai.item,
      });
      break; // one is enough as a flag
    }
  }

  // 3. Objections that got deflected (mentioned in transcript but absent from intelligence summary)
  if ((intel.dealSignals?.objections?.length || 0) > 0 && intel.objectionHandling === "Missed") {
    missedSignals.push({
      type: "objection-deflected",
      label: `${intel.dealSignals.objections.length} objection${intel.dealSignals.objections.length > 1 ? "s" : ""} raised, not addressed`,
      detail: intel.dealSignals.objections[0],
    });
  }

  // 4. Question gaps — checklist for the lead's current (or meeting-time) stage
  const stageChecklist = STAGE_QUESTION_CHECKLIST[lead.stage] || [];
  const haystack = `${transcriptText(meeting)} ${questionsAskedText(meeting)}`;
  const questionGaps: string[] = [];
  if (haystack.length > 50) {
    for (const q of stageChecklist) {
      const asked = q.keywords.some(kw => haystack.includes(kw));
      if (!asked) questionGaps.push(q.label);
    }
  }

  // 5. Objection-handling note
  let objectionHandlingNote: string | null = null;
  if (intel.objectionHandling === "Missed") {
    objectionHandlingNote = "Objections raised on this call were not directly addressed. Open with them next touch.";
  } else if (intel.objectionHandling === "Partial") {
    objectionHandlingNote = "Some objections were addressed but not closed out — circle back to confirm resolution.";
  }

  // 6. Overall rating
  const negativeCount =
    (intel.objectionHandling === "Missed" ? 2 : intel.objectionHandling === "Partial" ? 1 : 0) +
    (intel.questionQuality === "Weak" ? 2 : intel.questionQuality === "Adequate" ? 1 : 0) +
    (typeof intel.talkRatio === "number" && intel.talkRatio > 65 ? 1 : 0) +
    (missedSignals.length >= 2 ? 1 : 0) +
    (questionGaps.length >= 3 ? 1 : 0);

  const overallRating: CoachingInsight["overallRating"] =
    negativeCount === 0 ? "Strong" :
    negativeCount <= 2 ? "Adequate" : "Needs work";

  const ratingReason =
    overallRating === "Strong" ? "Strong execution: questions, handling, and next steps all on point." :
    overallRating === "Adequate" ? "Solid call with clear room to sharpen next time." :
    "Several coaching opportunities — prioritize before the next touch.";

  // 7. What to do next
  let whatToDoNext = "Lock in the agreed next step in writing within 24h.";
  if (missedSignals.find(s => s.type === "objection-deflected")) {
    whatToDoNext = "Open the next conversation by directly addressing the objection raised on this call.";
  } else if (missedSignals.find(s => s.type === "next-step-vague")) {
    whatToDoNext = "Send a written next-step confirmation today with owner + date — engagement was high.";
  } else if (questionGaps.length >= 3) {
    whatToDoNext = `Cover the missing discovery topics next call: ${questionGaps.slice(0, 2).join(", ")}.`;
  } else if (intel.questionQuality === "Weak") {
    whatToDoNext = "Use open-ended discovery questions next call — fewer features, more curiosity.";
  } else if (typeof intel.talkRatio === "number" && intel.talkRatio > 65) {
    whatToDoNext = `You spoke ${intel.talkRatio}% — aim for under 50% next call to surface their priorities.`;
  }

  return {
    overallRating,
    ratingReason,
    missedSignals,
    questionGaps,
    objectionHandlingNote,
    whatToDoNext,
  };
}

// ─── Lightweight objection detector for inbound emails ───
// Used by EmailsSection to decide whether to surface "Suggest responses".

const OBJECTION_PATTERNS: { label: string; phrases: string[] }[] = [
  { label: "Pricing", phrases: ["too expensive", "pricing", "cost is", "budget", "can't afford", "cheaper", "discount", "out of budget"] },
  { label: "Timing", phrases: ["not right now", "not the right time", "next quarter", "next year", "circle back", "revisit later", "bad timing"] },
  { label: "Bandwidth", phrases: ["bandwidth", "too busy", "swamped", "no capacity", "can't take on"] },
  { label: "Authority", phrases: ["need to check with", "need to discuss with", "not my decision", "have to ask", "need approval"] },
  { label: "Existing solution", phrases: ["we already", "currently using", "have a vendor", "have someone", "in-house"] },
  { label: "Skepticism", phrases: ["not sure", "skeptical", "doesn't seem", "don't see how", "concerned that"] },
  { label: "Pass / Decline", phrases: ["pass on this", "not interested", "not a fit", "won't be moving forward", "decided against"] },
];

export interface DetectedObjection {
  label: string;
  matchedPhrase: string;
}

export function detectEmailObjections(text: string): DetectedObjection[] {
  if (!text) return [];
  const lc = text.toLowerCase();
  const found: DetectedObjection[] = [];
  for (const o of OBJECTION_PATTERNS) {
    for (const p of o.phrases) {
      if (lc.includes(p)) {
        found.push({ label: o.label, matchedPhrase: p });
        break;
      }
    }
  }
  // De-dupe by label
  const seen = new Set<string>();
  return found.filter(o => (seen.has(o.label) ? false : (seen.add(o.label), true)));
}
