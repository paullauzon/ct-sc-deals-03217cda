// Sequence catalog. Add new sequences here — the index page + detail view
// pick them up automatically. Today only S8 is live; S5 (sample stall),
// S3 (post-discovery cold), S10 (Closed Won onboarding) are placeholders.

import { Lead } from "@/types/lead";

export type SequenceStepKind = "ai-personalized" | "auto" | "manual";

export interface SequenceStep {
  key: "N0" | "N30" | "N45" | "N90" | "REFERRAL";
  day: number;
  label: string;
  kind: SequenceStepKind;
  subjectTemplate: string;
  bodyTemplate: string;
  inputs: string[];
}

export interface SequenceDef {
  id: string;
  name: string;
  oneLiner: string;
  trigger: string;
  triggerMatch: (lead: Lead) => boolean;
  status: "live" | "draft";
  steps: SequenceStep[];
}

export const SEQUENCES: SequenceDef[] = [
  {
    id: "s8-90day-nurture",
    name: "S8 — Core 90-day post-loss nurture",
    oneLiner: "Stay top of mind without being a drip campaign. Feels like a human relationship.",
    trigger: "Lead enters Closed Lost with lost reason ≠ Scope Mismatch",
    triggerMatch: (l) =>
      ["Closed Lost", "Lost", "Went Dark"].includes(l.stage) && l.lostReasonV2 !== "Scope Mismatch",
    status: "live",
    steps: [
      {
        key: "N0",
        day: 0,
        label: "Day 0 — Insight email",
        kind: "ai-personalized",
        subjectTemplate: "[AI: short, sector-specific]",
        bodyTemplate:
          "AI generates a 60-80 word insight email referencing the prospect's sector + EBITDA range, with the angle determined by their lost reason (DIY → data quality, Pricing → cost-per-deal math, etc.). Plain text, sent from Malik's mailbox.",
        inputs: ["lost_reason_v2", "deal_type / acquisition_strategy", "ebitda_min/max", "brand"],
      },
      {
        key: "N30",
        day: 30,
        label: "Day 30 — Market update",
        kind: "ai-personalized",
        subjectTemplate: "[AI: market read]",
        bodyTemplate:
          "If acquisition_timeline window is now active (e.g. 'Q3'), AI asks one direct question about whether they're deploying. Otherwise, one observation about their sector.",
        inputs: ["sector", "ebitda_min/max", "acq_timeline"],
      },
      {
        key: "N45",
        day: 45,
        label: "Day 45 — Manual call check-in",
        kind: "manual",
        subjectTemplate: "(no email — phone call)",
        bodyTemplate:
          "Malik picks up the phone. The Fireflies transcript link is surfaced in the task description so he can reference one specific moment from the original conversation in 60 seconds.",
        inputs: ["fireflies_url"],
      },
      {
        key: "N90",
        day: 90,
        label: "Day 90 — Re-open ask",
        kind: "ai-personalized",
        subjectTemplate: "[AI: direct ask]",
        bodyTemplate:
          "Reference recent work with similar buyer types at their EBITDA range. One direct ask: 'open to a quick reset?'. 7-day grace then auto-completes.",
        inputs: ["buyer_type", "sector", "ebitda_min/max"],
      },
    ],
  },
];

export function getSequence(id: string): SequenceDef | undefined {
  return SEQUENCES.find((s) => s.id === id);
}

export function leadEnrolledIn(seq: SequenceDef, lead: Lead): boolean {
  if (seq.id !== "s8-90day-nurture") return false;
  return ["active", "completed", "re_engaged", "exited_referral"].includes(
    lead.nurtureSequenceStatus ?? "",
  );
}

export function dayInSequence(lead: Lead): number | null {
  if (!lead.nurtureStartedAt) return null;
  const start = new Date(lead.nurtureStartedAt).getTime();
  return Math.max(0, Math.floor((Date.now() - start) / 86400000));
}

export function nextStepFor(lead: Lead): { key: string; day: number } | null {
  const day = dayInSequence(lead);
  if (day == null || lead.nurtureSequenceStatus !== "active") return null;
  const log = lead.nurtureStepLog ?? [];
  const sent = new Set(log.map((e) => e.step));
  for (const milestone of [0, 30, 45, 90] as const) {
    const key = `N${milestone}`;
    if (!sent.has(key as any) && day < milestone + 7) return { key, day: milestone };
  }
  return null;
}
