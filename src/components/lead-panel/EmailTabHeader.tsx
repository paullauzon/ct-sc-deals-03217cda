import { useEffect, useMemo, useState } from "react";
import { Lead } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Sparkles, PenSquare, X, ChevronRight, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDealSignals } from "@/components/lead-panel/shared";
import { supabase } from "@/integrations/supabase/client";

interface LeadEmailLite {
  id: string;
  direction: "inbound" | "outbound";
  email_date: string;
  opens?: Array<{ at?: string }> | number;
  clicks?: Array<{ at?: string }> | number;
  replied_at?: string | null;
  send_status?: string;
  email_type?: string;
  sequence_step?: string | null;
  from_address?: string;
}

interface Props {
  lead?: Lead;
  emails: LeadEmailLite[];
  threadCount: number;
  onCompose?: () => void;
  onSeeAllSignals?: () => void;
}

/** Count length-or-number safely. */
function len(v: Array<unknown> | number | undefined): number {
  if (Array.isArray(v)) return v.length;
  if (typeof v === "number") return v;
  return 0;
}

/** Derive a single recommended next email action from signals + email state. */
function deriveAiRecommendation(
  lead: Lead | undefined,
  emails: LeadEmailLite[],
): { headline: string; rationale: string; severity: "neutral" | "warning" | "positive" } | null {
  if (!lead) return null;
  const firstName = lead.name?.split(" ")[0] || "the lead";
  const delivered = emails.filter(e => e.send_status !== "scheduled");
  const lastInbound = delivered.filter(e => e.direction === "inbound").sort(
    (a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime(),
  )[0];
  const lastOutbound = delivered.filter(e => e.direction === "outbound").sort(
    (a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime(),
  )[0];

  const today = Date.now();
  const daysSince = (iso?: string) => iso ? Math.floor((today - new Date(iso).getTime()) / 86400000) : Infinity;

  // 1) Hot — recent burst of opens but no reply
  const recentOpens = delivered.reduce((sum, e) => {
    if (!Array.isArray(e.opens)) return sum;
    return sum + e.opens.filter(o => {
      const at = (o as { at?: string })?.at;
      if (!at) return false;
      return today - new Date(at).getTime() < 48 * 3600 * 1000;
    }).length;
  }, 0);
  if (recentOpens >= 3 && (!lastInbound || daysSince(lastInbound.email_date) > 2)) {
    return {
      headline: `${firstName} opened your last email ${recentOpens}× in 48h — no reply yet`,
      rationale: "High intent. Send a short, direct nudge with a single question.",
      severity: "positive",
    };
  }

  // 2) Awaiting reply — silent days
  if (lastOutbound && (!lastInbound || new Date(lastOutbound.email_date) > new Date(lastInbound.email_date))) {
    const d = daysSince(lastOutbound.email_date);
    if (d >= 14) {
      return {
        headline: `${d} days since your last email — no reply`,
        rationale: `Send a short break-up email to ${firstName} or move to nurture.`,
        severity: "warning",
      };
    }
    if (d >= 7) {
      return {
        headline: `${d} days since you emailed ${firstName} — silence`,
        rationale: "Send a value-add follow-up referencing the last conversation.",
        severity: "warning",
      };
    }
    if (d >= 3) {
      return {
        headline: `${d} days since your last email`,
        rationale: `Soft check-in is appropriate. Reference the last thread.`,
        severity: "neutral",
      };
    }
  }

  // 3) Inbound waiting on response
  if (lastInbound && (!lastOutbound || new Date(lastInbound.email_date) > new Date(lastOutbound.email_date))) {
    const d = daysSince(lastInbound.email_date);
    if (d >= 1) {
      return {
        headline: `${firstName} replied ${d === 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`} — awaiting your response`,
        rationale: "Reply with a clear next step. Keep it under 80 words.",
        severity: "warning",
      };
    }
    return {
      headline: `${firstName} just replied — respond within the hour for max momentum`,
      rationale: "Fast replies correlate with higher close rates. Acknowledge and propose a next step.",
      severity: "positive",
    };
  }

  // 4) Fallback to deal signals
  const dealSignals = getDealSignals(lead);
  const top = dealSignals[0];
  if (top) {
    return {
      headline: top.title,
      rationale: top.description || "Address this signal in your next outbound email.",
      severity: top.severity === "critical" ? "warning" : top.severity === "positive" ? "positive" : "neutral",
    };
  }

  // 5) No emails yet
  if (delivered.length === 0) {
    return {
      headline: `No emails with ${firstName} yet`,
      rationale: "Open the conversation with a tailored intro referencing their mandate.",
      severity: "neutral",
    };
  }

  return null;
}

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
  emphasis?: "default" | "warning" | "positive";
}

function KpiTile({ label, value, hint, emphasis = "default" }: KpiTileProps) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 first:pl-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">{label}</div>
      <div className={cn(
        "text-[13px] font-semibold tabular-nums leading-none",
        emphasis === "warning" && "text-amber-600 dark:text-amber-400",
        emphasis === "positive" && "text-emerald-600 dark:text-emerald-400",
      )}>{value}</div>
      {hint && <div className="text-[9px] text-muted-foreground/70 leading-tight">{hint}</div>}
    </div>
  );
}

export function EmailTabHeader({ lead, emails, threadCount, onCompose, onSeeAllSignals }: Props) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined" || !lead) return false;
    const key = `emailAiInsightDismissed:${lead.id}`;
    const ts = localStorage.getItem(key);
    if (!ts) return false;
    // Auto-undismiss after 24h so insights resurface
    return Date.now() - Number(ts) < 24 * 3600 * 1000;
  });

  const stats = useMemo(() => {
    const delivered = emails.filter(e => e.send_status !== "scheduled");
    const inbound = delivered.filter(e => e.direction === "inbound");
    const outbound = delivered.filter(e => e.direction === "outbound");
    const totalOpens = outbound.reduce((s, e) => s + len(e.opens), 0);
    const opensEligible = outbound.length;
    const openRate = opensEligible > 0 ? Math.round((outbound.filter(e => len(e.opens) > 0).length / opensEligible) * 100) : 0;
    const lastInboundDate = inbound.map(e => e.email_date).sort().pop();
    const daysSinceReply = lastInboundDate
      ? Math.floor((Date.now() - new Date(lastInboundDate).getTime()) / 86400000)
      : null;
    const sequenceSteps = Array.from(new Set(delivered.map(e => e.sequence_step).filter(Boolean))) as string[];
    const currentSequence = sequenceSteps.length > 0 ? sequenceSteps[sequenceSteps.length - 1] : null;
    return {
      threads: threadCount,
      total: delivered.length,
      sent: outbound.length,
      received: inbound.length,
      totalOpens,
      openRate,
      daysSinceReply,
      currentSequence,
    };
  }, [emails, threadCount]);

  const recommendation = useMemo(() => deriveAiRecommendation(lead, emails), [lead, emails]);

  const dismissInsight = () => {
    if (lead) localStorage.setItem(`emailAiInsightDismissed:${lead.id}`, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className="space-y-2 mb-3">
      {/* KPI strip */}
      <div className="rounded-md border border-border bg-secondary/30 px-1 py-1 flex flex-wrap items-stretch divide-x divide-border">
        <KpiTile label="Threads" value={String(stats.threads)} />
        <KpiTile label="Emails" value={String(stats.total)} hint={`${stats.sent} sent · ${stats.received} received`} />
        <KpiTile
          label="Open rate"
          value={stats.sent > 0 ? `${stats.openRate}%` : "—"}
          hint={stats.totalOpens > 0 ? `${stats.totalOpens} total opens` : undefined}
          emphasis={stats.openRate >= 50 ? "positive" : stats.sent > 0 && stats.openRate < 20 ? "warning" : "default"}
        />
        <KpiTile
          label="Last reply"
          value={stats.daysSinceReply === null ? "—" : stats.daysSinceReply === 0 ? "Today" : `${stats.daysSinceReply}d ago`}
          emphasis={stats.daysSinceReply !== null && stats.daysSinceReply >= 14 ? "warning" : "default"}
        />
        <KpiTile
          label="Sequence"
          value={stats.currentSequence || "—"}
          hint={stats.currentSequence ? "Most recent step" : undefined}
        />
      </div>

      {/* AI insight strip */}
      {recommendation && !dismissed && (
        <div className={cn(
          "rounded-md border px-3 py-2 flex items-start gap-2.5",
          "border-border bg-gradient-to-r from-secondary/40 via-background to-background",
        )}>
          <div className={cn(
            "h-6 w-6 rounded-full shrink-0 flex items-center justify-center mt-0.5",
            "bg-foreground/5 text-foreground/80",
          )}>
            <Sparkles className="h-3 w-3" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                AI suggests
              </span>
              <span className={cn(
                "h-1 w-1 rounded-full",
                recommendation.severity === "warning" && "bg-amber-500",
                recommendation.severity === "positive" && "bg-emerald-500",
                recommendation.severity === "neutral" && "bg-muted-foreground/40",
              )} />
            </div>
            <p className="text-[12px] font-medium text-foreground leading-snug mt-0.5">
              {recommendation.headline}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              {recommendation.rationale}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onCompose && (
              <Button size="sm" variant="default" onClick={onCompose} className="h-7 text-[11px] gap-1.5">
                <PenSquare className="h-3 w-3" /> Draft
              </Button>
            )}
            {onSeeAllSignals && (
              <Button size="sm" variant="ghost" onClick={onSeeAllSignals} className="h-7 text-[11px] gap-1 text-muted-foreground">
                See all <ChevronRight className="h-3 w-3" />
              </Button>
            )}
            <Button
              size="sm" variant="ghost" onClick={dismissInsight}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
              title="Dismiss for 24 hours"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
