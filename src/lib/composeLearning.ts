// Phase 6 — client-side helpers for the email-compose learning loop.
//
// Captures:
//   • which of the 3 AI drafts (or "scratch") was picked
//   • how much the user edited it before sending
//   • whether the do-not-train flag was set
//
// Edit distance is computed cheaply via Levenshtein on length-capped strings —
// good enough as a proxy for "how much did the user trust the AI draft".

import { supabase } from "@/integrations/supabase/client";

export type Approach = "direct" | "data_led" | "question_led";

export interface ComposeDraftSnapshot {
  approach: Approach;
  label: string;
  subject: string;
  body: string;
}

export interface ComposeEventInput {
  leadId: string;
  emailId?: string | null;
  brand?: string;
  stage?: string;
  firmType?: string;
  purpose?: string;

  draftsOffered: ComposeDraftSnapshot[];
  recommendedApproach: Approach | "";
  draftPicked: Approach | "scratch" | "";
  pickedIndex: number;
  initialSubject: string;
  initialBody: string;
  finalSubject: string;
  finalBody: string;

  sent: boolean;
  scheduled?: boolean;
  doNotTrain?: boolean;
  model?: string;
}

/** Cap-protected Levenshtein. Returns char-edits between a and b. */
function levenshtein(a: string, b: string, cap = 4000): number {
  const A = a.slice(0, cap);
  const B = b.slice(0, cap);
  const m = A.length;
  const n = B.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function editDistancePct(initial: string, final: string): number {
  const total = Math.max(initial.length, final.length, 1);
  const d = levenshtein(initial, final);
  return Math.min(100, Math.round((d / total) * 100));
}

export async function logComposeEvent(input: ComposeEventInput): Promise<string | null> {
  try {
    const editSubject = levenshtein(input.initialSubject, input.finalSubject);
    const editBody = levenshtein(input.initialBody, input.finalBody);
    const pct = editDistancePct(input.initialBody, input.finalBody);

    const { data, error } = await supabase
      .from("email_compose_events" as any)
      .insert({
        lead_id: input.leadId,
        email_id: input.emailId || null,
        brand: input.brand || "Captarget",
        stage: input.stage || "",
        firm_type: input.firmType || "",
        purpose: input.purpose || "free_form",
        drafts_offered: input.draftsOffered,
        recommended_approach: input.recommendedApproach,
        draft_picked: input.draftPicked,
        picked_index: input.pickedIndex,
        initial_subject: input.initialSubject,
        initial_body: input.initialBody,
        final_subject: input.finalSubject,
        final_body: input.finalBody,
        edit_distance_subject: editSubject,
        edit_distance_body: editBody,
        edit_distance_pct: pct,
        sent: input.sent,
        sent_at: input.sent ? new Date().toISOString() : null,
        scheduled: !!input.scheduled,
        do_not_train: !!input.doNotTrain,
        model: input.model || "",
      } as any)
      .select("id")
      .single();
    if (error) {
      console.warn("[composeLearning] log failed", error);
      return null;
    }
    return (data as any)?.id || null;
  } catch (e) {
    console.warn("[composeLearning] log threw", e);
    return null;
  }
}

/**
 * Fetch aggregated compose patterns for the recent past — used by the AI
 * Learning settings tab to render the firm-type × stage matrix.
 */
export interface PatternRow {
  brand: string;
  stage: string;
  purpose: string;
  approach: string;
  picks: number;
  totalShows: number;
  pickRate: number;
  meanEditPct: number;
  replyRate: number;
}

export async function fetchComposePatterns(brand?: string): Promise<PatternRow[]> {
  // Pull last 200 events (clients are small; ~few hundred at most for the foreseeable future)
  let q = supabase
    .from("email_compose_events" as any)
    .select("brand, stage, purpose, draft_picked, recommended_approach, edit_distance_pct, drafts_offered, email_id, sent")
    .eq("sent", true)
    .eq("do_not_train", false)
    .order("created_at", { ascending: false })
    .limit(500);
  if (brand) q = q.eq("brand", brand);
  const { data: events } = await q;
  const rows: any[] = (events as any) || [];

  // Pull outcomes for those email_ids
  const emailIds = rows.map(r => r.email_id).filter(Boolean);
  let outcomes: Record<string, any> = {};
  if (emailIds.length > 0) {
    const { data: outRows } = await supabase
      .from("email_compose_outcomes" as any)
      .select("email_id, replied")
      .in("email_id", emailIds);
    for (const o of (outRows as any) || []) outcomes[o.email_id] = o;
  }

  // Aggregate
  type Key = string;
  const map = new Map<Key, {
    brand: string; stage: string; purpose: string; approach: string;
    picks: number; shows: number; editSum: number; replies: number; outcomeCount: number;
  }>();

  for (const row of rows) {
    const offered: any[] = Array.isArray(row.drafts_offered) ? row.drafts_offered : [];
    // Count "shows" once per (brand,stage,purpose,approach) for each draft offered
    for (const d of offered) {
      const k = `${row.brand}|${row.stage}|${row.purpose}|${d.approach}`;
      let agg = map.get(k);
      if (!agg) {
        agg = { brand: row.brand, stage: row.stage, purpose: row.purpose, approach: d.approach,
                picks: 0, shows: 0, editSum: 0, replies: 0, outcomeCount: 0 };
        map.set(k, agg);
      }
      agg.shows += 1;
    }
    // Count the pick once
    if (row.draft_picked && row.draft_picked !== "scratch") {
      const k = `${row.brand}|${row.stage}|${row.purpose}|${row.draft_picked}`;
      let agg = map.get(k);
      if (!agg) {
        agg = { brand: row.brand, stage: row.stage, purpose: row.purpose, approach: row.draft_picked,
                picks: 0, shows: 0, editSum: 0, replies: 0, outcomeCount: 0 };
        map.set(k, agg);
      }
      agg.picks += 1;
      agg.editSum += Number(row.edit_distance_pct || 0);
      const o = row.email_id ? outcomes[row.email_id] : null;
      if (o) {
        agg.outcomeCount += 1;
        if (o.replied) agg.replies += 1;
      }
    }
  }

  const out: PatternRow[] = [];
  for (const v of map.values()) {
    out.push({
      brand: v.brand,
      stage: v.stage || "(any)",
      purpose: v.purpose || "free_form",
      approach: v.approach,
      picks: v.picks,
      totalShows: v.shows,
      pickRate: v.shows > 0 ? Math.round((v.picks / v.shows) * 100) : 0,
      meanEditPct: v.picks > 0 ? Math.round(v.editSum / v.picks) : 0,
      replyRate: v.outcomeCount > 0 ? Math.round((v.replies / v.outcomeCount) * 100) : 0,
    });
  }
  return out.sort((a, b) => b.picks - a.picks);
}
