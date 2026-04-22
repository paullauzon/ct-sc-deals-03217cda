// Phase 7 — shared client-side helpers for surfacing email signals across the
// CRM (Overview tab, Signals card, Deal Health). Reads from `lead_emails`,
// `lead_email_metrics`, and `email_thread_intelligence`.
//
// Everything here is safe to call repeatedly and returns a stable object
// shape. The hooks use a small in-memory cache keyed by lead id to avoid
// thrashing the network when Overview + Signals + Health all render at once.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EmailHighlight {
  id: string;
  threadId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  emailDate: string;
  direction: "inbound" | "outbound";
  scheduledFor: string | null;
  isHot: boolean;        // many opens in short window OR thread flagged hot
  isAwaitingReply: boolean; // inbound, no reply yet from us
  bodyPreview: string;
  reason: string;        // why this surfaced — "Reply received", "Opened 5×", etc.
}

export interface EmailEngagementSignal {
  title: string;
  description: string;
  severity: "warning" | "critical" | "positive";
}

export interface EmailHealthFactors {
  replyVelocityImpact: number;     // +5 fast reply, 0 otherwise
  engagementImpact: number;        // up to +10 if open rate >50%
  sentimentImpact: number;         // -15..+15 from thread intelligence
  factors: { label: string; impact: number }[];
}

interface RawEmail {
  id: string;
  thread_id: string | null;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  email_date: string;
  direction: string;
  body_preview: string | null;
  opens: any;
  replied_at: string | null;
  scheduled_for: string | null;
  send_status: string;
}

interface RawThreadIntel {
  thread_id: string;
  sentiment: string;
  hot_flag: boolean;
  signal_tags: string[];
  recommended_action: string;
  summary: string;
  last_email_at: string | null;
  email_count: number;
}

interface RawMetrics {
  total_sent: number;
  total_opens: number;
  total_replies: number;
  last_replied_date: string | null;
  last_received_date: string | null;
  last_sent_date: string | null;
}

const cache = new Map<string, { data: any; ts: number }>();
const TTL = 60 * 1000;

async function fetchEmailContext(leadId: string): Promise<{
  emails: RawEmail[];
  threadIntel: RawThreadIntel[];
  metrics: RawMetrics | null;
}> {
  const cacheKey = `emailctx:${leadId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [emailsRes, intelRes, metricsRes] = await Promise.all([
    supabase
      .from("lead_emails")
      .select("id, thread_id, subject, from_name, from_address, email_date, direction, body_preview, opens, replied_at, scheduled_for, send_status")
      .eq("lead_id", leadId)
      .gte("email_date", since)
      .order("email_date", { ascending: false })
      .limit(40),
    supabase
      .from("email_thread_intelligence" as any)
      .select("thread_id, sentiment, hot_flag, signal_tags, recommended_action, summary, last_email_at, email_count")
      .eq("lead_id", leadId)
      .order("last_email_at", { ascending: false })
      .limit(20),
    supabase
      .from("lead_email_metrics")
      .select("total_sent, total_opens, total_replies, last_replied_date, last_received_date, last_sent_date")
      .eq("lead_id", leadId)
      .maybeSingle(),
  ]);

  const out = {
    emails: (emailsRes.data ?? []) as RawEmail[],
    threadIntel: (intelRes.data ?? []) as unknown as RawThreadIntel[],
    metrics: (metricsRes.data ?? null) as RawMetrics | null,
  };
  cache.set(cacheKey, { data: out, ts: Date.now() });
  return out;
}

function opensIn48h(opens: any): number {
  if (!Array.isArray(opens)) return 0;
  const cutoff = Date.now() - 48 * 3600 * 1000;
  return opens.filter((o: any) => {
    const ts = new Date(o?.timestamp || o?.ts || o).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
}

/**
 * Top 3 emails worth showing on the Overview tab.
 * Priority: scheduled-today > recent inbound replies > hot unreplied outbound.
 */
export function useEmailHighlights(leadId: string): EmailHighlight[] {
  const [data, setData] = useState<EmailHighlight[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { emails, threadIntel } = await fetchEmailContext(leadId);
      if (cancelled) return;

      const intelByThread = new Map<string, RawThreadIntel>();
      threadIntel.forEach(t => intelByThread.set(t.thread_id, t));

      const candidates: EmailHighlight[] = [];
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

      for (const e of emails) {
        const intel = e.thread_id ? intelByThread.get(e.thread_id) : undefined;
        const hot48 = opensIn48h(e.opens);
        const isScheduledToday = e.scheduled_for &&
          new Date(e.scheduled_for) >= todayStart &&
          new Date(e.scheduled_for) < todayEnd;

        let reason = "";
        let priority = 0;

        if (isScheduledToday && e.send_status === "scheduled") {
          reason = `Scheduled to send ${new Date(e.scheduled_for!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
          priority = 100;
        } else if (e.direction === "inbound") {
          reason = `New reply from ${e.from_name || e.from_address.split("@")[0]}`;
          priority = 80;
        } else if (intel?.hot_flag || hot48 >= 3) {
          reason = hot48 > 0 ? `Opened ${hot48}× in last 48h` : "Thread flagged hot";
          priority = 70;
        } else if (e.direction === "outbound" && !e.replied_at && hot48 > 0) {
          reason = `Opened ${hot48}× — no reply yet`;
          priority = 50;
        } else {
          continue;
        }

        candidates.push({
          id: e.id,
          threadId: e.thread_id || "",
          subject: e.subject || "(no subject)",
          fromName: e.from_name || "",
          fromAddress: e.from_address,
          emailDate: e.email_date,
          direction: e.direction as "inbound" | "outbound",
          scheduledFor: e.scheduled_for,
          isHot: !!intel?.hot_flag || hot48 >= 3,
          isAwaitingReply: e.direction === "inbound",
          bodyPreview: (e.body_preview || "").slice(0, 120),
          reason,
        });

        // Inline priority sort marker
        (candidates[candidates.length - 1] as any).__p = priority;
      }

      candidates.sort((a: any, b: any) => b.__p - a.__p);
      // De-dup by thread — keep top of each thread only
      const seenThreads = new Set<string>();
      const top: EmailHighlight[] = [];
      for (const c of candidates) {
        const key = c.threadId || c.id;
        if (seenThreads.has(key)) continue;
        seenThreads.add(key);
        top.push(c);
        if (top.length >= 3) break;
      }
      setData(top);
    })();
    return () => { cancelled = true; };
  }, [leadId]);
  return data;
}

/**
 * Engagement-derived signal bullets for the right-rail Signals card.
 */
export function useEmailEngagementSignals(leadId: string): EmailEngagementSignal[] {
  const [signals, setSignals] = useState<EmailEngagementSignal[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { emails, threadIntel, metrics } = await fetchEmailContext(leadId);
      if (cancelled) return;

      const out: EmailEngagementSignal[] = [];
      const now = Date.now();

      // Hot thread / hot-flag from intel
      for (const t of threadIntel) {
        if (t.hot_flag) {
          out.push({
            severity: "positive",
            title: "Engagement spike detected",
            description: t.recommended_action || t.summary?.slice(0, 120) || "Recent opens suggest the buyer is re-engaging.",
          });
          break; // only one hot bullet
        }
      }

      // Reply velocity / awaiting reply
      const lastInbound = metrics?.last_received_date;
      const lastSent = metrics?.last_sent_date;
      if (lastInbound && lastSent) {
        const inboundT = new Date(lastInbound).getTime();
        const sentT = new Date(lastSent).getTime();
        if (inboundT > sentT) {
          const hoursSinceInbound = (now - inboundT) / 3600000;
          if (hoursSinceInbound > 24) {
            out.push({
              severity: hoursSinceInbound > 72 ? "critical" : "warning",
              title: `Awaiting your reply ${Math.round(hoursSinceInbound / 24)}d`,
              description: "Inbound message hasn't been answered yet.",
            });
          }
        } else if (inboundT < sentT) {
          const daysSinceSent = (now - sentT) / 86400000;
          if (daysSinceSent >= 5) {
            out.push({
              severity: daysSinceSent >= 10 ? "critical" : "warning",
              title: `${Math.round(daysSinceSent)}d silence after last send`,
              description: "Consider a break-up note or value-add nudge.",
            });
          }
        }
      }

      // Open rate
      if (metrics && metrics.total_sent >= 3) {
        const openRate = metrics.total_opens / metrics.total_sent;
        if (openRate > 0.5) {
          out.push({
            severity: "positive",
            title: `Open rate ${Math.round(openRate * 100)}%`,
            description: `${metrics.total_opens} opens across ${metrics.total_sent} sends — content is landing.`,
          });
        } else if (openRate < 0.1 && metrics.total_sent >= 5) {
          out.push({
            severity: "warning",
            title: `Low engagement — ${Math.round(openRate * 100)}% open rate`,
            description: "Subject lines may need a refresh, or the address is filtering aggressively.",
          });
        }
      }

      // Sentiment trend (latest thread)
      const latest = threadIntel[0];
      if (latest && latest.sentiment) {
        const s = latest.sentiment.toLowerCase();
        if (s === "negative" || s === "cold") {
          out.push({
            severity: "critical",
            title: `Thread sentiment: ${latest.sentiment}`,
            description: latest.summary?.slice(0, 120) || "Tone has cooled — review recent exchange.",
          });
        }
      }

      setSignals(out);
    })();
    return () => { cancelled = true; };
  }, [leadId]);
  return signals;
}

/**
 * Pulls computed health-impact factors from email engagement.
 * Returns nulls until data loads to keep the UI score stable.
 */
export function useEmailHealthFactors(leadId: string): EmailHealthFactors | null {
  const [data, setData] = useState<EmailHealthFactors | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { metrics, threadIntel } = await fetchEmailContext(leadId);
      if (cancelled) return;

      let replyVelocityImpact = 0;
      let engagementImpact = 0;
      let sentimentImpact = 0;
      const factors: { label: string; impact: number }[] = [];

      if (metrics?.last_replied_date && metrics?.last_sent_date) {
        const repliedT = new Date(metrics.last_replied_date).getTime();
        const sentT = new Date(metrics.last_sent_date).getTime();
        const hours = Math.abs(repliedT - sentT) / 3600000;
        if (repliedT > sentT && hours < 24) {
          replyVelocityImpact = 5;
          factors.push({ label: "Fast reply <24h", impact: 5 });
        } else if (repliedT > sentT && hours < 72) {
          replyVelocityImpact = 2;
          factors.push({ label: "Reply <72h", impact: 2 });
        }
      }

      if (metrics && metrics.total_sent >= 3) {
        const openRate = metrics.total_opens / metrics.total_sent;
        if (openRate > 0.5) {
          engagementImpact = 10;
          factors.push({ label: `Open rate ${Math.round(openRate * 100)}%`, impact: 10 });
        } else if (openRate > 0.25) {
          engagementImpact = 5;
          factors.push({ label: `Open rate ${Math.round(openRate * 100)}%`, impact: 5 });
        } else if (openRate < 0.1 && metrics.total_sent >= 5) {
          engagementImpact = -5;
          factors.push({ label: `Open rate ${Math.round(openRate * 100)}%`, impact: -5 });
        }
      }

      const latest = threadIntel[0];
      if (latest?.sentiment) {
        const s = latest.sentiment.toLowerCase();
        if (s === "positive" || s === "warm") {
          sentimentImpact = 15;
          factors.push({ label: "Email sentiment positive", impact: 15 });
        } else if (s === "negative" || s === "cold") {
          sentimentImpact = -15;
          factors.push({ label: "Email sentiment negative", impact: -15 });
        } else if (s === "cautious") {
          sentimentImpact = -5;
          factors.push({ label: "Email sentiment cautious", impact: -5 });
        }
      }

      setData({ replyVelocityImpact, engagementImpact, sentimentImpact, factors });
    })();
    return () => { cancelled = true; };
  }, [leadId]);
  return data;
}
