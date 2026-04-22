// Phase 5 — schedule-send intelligence.
// Analyzes lead_emails.opens to determine when recipients are most likely to
// engage. Produces:
//   • per-recipient histogram (day-of-week × hour buckets)
//   • global histogram (across all our outbound emails) as a fallback
//   • top-3 recommended send slots in the next 7 days
//
// Open events are stored in lead_emails.opens as JSONB arrays. Each entry is
// expected to be an ISO timestamp string OR an object with a `ts` field.
// We're tolerant of both shapes.

import { supabase } from "@/integrations/supabase/client";

export interface OpenEvent {
  ts: string; // ISO
}

export interface HourBucketStats {
  /** 0..6 (Sun..Sat) */
  dow: number;
  /** 0..23 */
  hour: number;
  /** Number of opens in this bucket */
  count: number;
  /** Confidence (0..1) — count / max bucket count */
  intensity: number;
}

export interface RecommendedSlot {
  /** Concrete future Date in viewer's local timezone */
  when: Date;
  /** 0..1 confidence */
  score: number;
  /** Why we picked it — used for the chip subtitle */
  reason: string;
}

export interface SendTimeIntel {
  /** Total opens we found for this recipient (post-Google-filtering) */
  recipientSampleSize: number;
  /** Total opens we have across all outbound (excluding Google bots) */
  globalSampleSize: number;
  /** 24×7 = 168 buckets, sparse: only buckets with count > 0 */
  recipientBuckets: HourBucketStats[];
  /** Same shape, fallback when recipient is too cold */
  globalBuckets: HourBucketStats[];
  /** Top recommended future slots (capped at 3) */
  recommended: RecommendedSlot[];
  /** Whether we used global fallback (true means low-confidence per-recipient) */
  usedGlobalFallback: boolean;
  /** Mean time-to-open for this recipient (minutes), null if no data */
  meanLagMinutes: number | null;
}

/** How many opens we need before per-recipient stats are considered usable. */
const PER_RECIPIENT_MIN_SAMPLE = 4;

/** Look-back window for global stats. */
const GLOBAL_LOOKBACK_DAYS = 60;

/** Minimum delay before a "soonest" slot is allowed. */
const MIN_LEAD_MINUTES = 30;

function normalizeOpens(raw: unknown): OpenEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenEvent[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const d = new Date(item);
      if (!isNaN(d.getTime())) out.push({ ts: d.toISOString() });
    } else if (item && typeof item === "object") {
      const candidate = (item as any).ts || (item as any).timestamp || (item as any).at;
      if (typeof candidate === "string") {
        const d = new Date(candidate);
        if (!isNaN(d.getTime())) out.push({ ts: d.toISOString() });
      }
    }
  }
  return out;
}

function bucketize(opens: OpenEvent[]): HourBucketStats[] {
  const map = new Map<string, number>();
  for (const o of opens) {
    const d = new Date(o.ts);
    const dow = d.getDay();
    const hour = d.getHours();
    const key = `${dow}:${hour}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  const max = Math.max(1, ...Array.from(map.values()));
  const out: HourBucketStats[] = [];
  for (const [key, count] of map.entries()) {
    const [dowStr, hourStr] = key.split(":");
    out.push({
      dow: parseInt(dowStr, 10),
      hour: parseInt(hourStr, 10),
      count,
      intensity: count / max,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Combine recipient + global with weights: 70% recipient, 30% global. */
function blendedScoreMap(
  recipient: HourBucketStats[],
  global: HourBucketStats[],
  recipientWeight = 0.7,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of recipient) {
    map.set(`${b.dow}:${b.hour}`, b.intensity * recipientWeight);
  }
  for (const b of global) {
    const key = `${b.dow}:${b.hour}`;
    map.set(key, (map.get(key) || 0) + b.intensity * (1 - recipientWeight));
  }
  return map;
}

/** Score each upcoming hour (within next 7 days) using the blended map. */
function scoreUpcomingHours(
  scoreMap: Map<string, number>,
  workHoursOnly: boolean,
): RecommendedSlot[] {
  const now = new Date();
  const minTime = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);
  const slots: RecommendedSlot[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    for (let hour = 0; hour < 24; hour++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate < minTime) continue;
      // Skip weekends entirely for B2B sales context
      const dow = candidate.getDay();
      if (dow === 0 || dow === 6) continue;
      // Optional: restrict to "work hours" 7 AM – 8 PM local
      if (workHoursOnly && (hour < 7 || hour > 20)) continue;
      const key = `${dow}:${hour}`;
      const score = scoreMap.get(key) || 0;
      if (score <= 0) continue;
      slots.push({
        when: candidate,
        score,
        reason: describeSlot(candidate, score),
      });
    }
  }

  // De-duplicate close-together slots (keep best per 3-hour window)
  slots.sort((a, b) => b.score - a.score);
  const kept: RecommendedSlot[] = [];
  for (const s of slots) {
    const tooClose = kept.some(k => Math.abs(k.when.getTime() - s.when.getTime()) < 3 * 60 * 60 * 1000);
    if (!tooClose) kept.push(s);
    if (kept.length >= 3) break;
  }
  return kept;
}

function describeSlot(when: Date, score: number): string {
  const day = when.toLocaleDateString(undefined, { weekday: "short" });
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const tier = score > 0.6 ? "Peak" : score > 0.3 ? "Strong" : "Active";
  return `${tier} window · ${day} ${time}`;
}

/** Mean delay between send and first open, in minutes. */
function meanOpenLag(rows: Array<{ email_date: string; opens: OpenEvent[] }>): number | null {
  const lags: number[] = [];
  for (const r of rows) {
    if (!r.opens?.length) continue;
    const sent = new Date(r.email_date).getTime();
    const firstOpen = Math.min(...r.opens.map(o => new Date(o.ts).getTime()));
    if (firstOpen > sent) lags.push((firstOpen - sent) / 60_000);
  }
  if (!lags.length) return null;
  return Math.round(lags.reduce((a, b) => a + b, 0) / lags.length);
}

/**
 * Compute send-time intelligence for a specific recipient.
 * Pulls outbound emails sent TO that recipient, plus a global sample.
 */
export async function computeSendTimeIntel(opts: {
  leadId?: string;
  recipientEmail?: string;
  /** Restrict to specific mailbox (sender's connection). Optional. */
  fromConnectionId?: string;
}): Promise<SendTimeIntel> {
  const { leadId, recipientEmail } = opts;

  // ───────── per-recipient query ─────────
  const recipientOpens: OpenEvent[] = [];
  const recipientRows: Array<{ email_date: string; opens: OpenEvent[] }> = [];
  if (leadId || recipientEmail) {
    let q = supabase
      .from("lead_emails")
      .select("email_date, opens, to_addresses")
      .eq("direction", "outbound")
      .not("opens", "is", null)
      .order("email_date", { ascending: false })
      .limit(200);
    if (leadId) q = q.eq("lead_id", leadId);
    const { data } = await q;
    for (const row of (data || [])) {
      if (recipientEmail) {
        const tos = (row.to_addresses || []) as string[];
        const match = tos.some(t => t?.toLowerCase() === recipientEmail.toLowerCase());
        if (!match) continue;
      }
      const opens = normalizeOpens((row as any).opens);
      if (opens.length === 0) continue;
      recipientRows.push({ email_date: row.email_date, opens });
      recipientOpens.push(...opens);
    }
  }

  // ───────── global query (last 60 days) ─────────
  const since = new Date();
  since.setDate(since.getDate() - GLOBAL_LOOKBACK_DAYS);
  const { data: globalRows } = await supabase
    .from("lead_emails")
    .select("email_date, opens")
    .eq("direction", "outbound")
    .gte("email_date", since.toISOString())
    .not("opens", "is", null)
    .order("email_date", { ascending: false })
    .limit(2000);

  const globalOpens: OpenEvent[] = [];
  for (const row of (globalRows || [])) {
    globalOpens.push(...normalizeOpens((row as any).opens));
  }

  const recipientBuckets = bucketize(recipientOpens);
  const globalBuckets = bucketize(globalOpens);

  const usedGlobalFallback = recipientOpens.length < PER_RECIPIENT_MIN_SAMPLE;
  const recipientWeight = usedGlobalFallback ? 0.2 : 0.7;
  const scoreMap = blendedScoreMap(recipientBuckets, globalBuckets, recipientWeight);
  const recommended = scoreUpcomingHours(scoreMap, true);

  return {
    recipientSampleSize: recipientOpens.length,
    globalSampleSize: globalOpens.length,
    recipientBuckets,
    globalBuckets,
    recommended,
    usedGlobalFallback,
    meanLagMinutes: meanOpenLag(recipientRows),
  };
}

/** Quick formatter for "in 2h" / "tomorrow 9 AM" used in chip subtitles. */
export function formatRelativeSlot(when: Date): string {
  const now = new Date();
  const diffMs = when.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `in ${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `in ${diffH}h`;
  const sameWeek = when.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;
  const day = when.toLocaleDateString(undefined, { weekday: sameWeek ? "long" : "short" });
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} ${time}`;
}

export const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
export const DOW_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
