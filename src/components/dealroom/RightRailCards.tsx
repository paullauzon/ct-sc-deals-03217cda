import { Lead } from "@/types/lead";
import { CollapsibleCard } from "./CollapsibleCard";
import {
  Heart, Users, ShieldAlert, TrendingUp, TrendingDown, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { computeDealHealthScore, getStakeholderCoverage } from "@/lib/dealHealthUtils";

interface RightRailCardsProps {
  lead: Lead;
  allLeads: Lead[];
}

/**
 * Right-rail Deal Health card.
 * Shows score + gradient bar + factor breakdown (matches wireframe), plus
 * momentum + sentiment + stakeholder coverage below the divider.
 */
export function RightRailCards({ lead }: RightRailCardsProps) {
  const dealHealth = computeDealHealthScore(lead);
  const coverage = getStakeholderCoverage(lead);
  const intel = lead.dealIntelligence;
  const sentimentTraj = intel?.momentumSignals?.sentimentTrajectory || [];

  return (
    <div className="divide-y divide-border">
      <CollapsibleCard
        title="Deal Health"
        icon={<Heart className="h-3.5 w-3.5" />}
        defaultOpen
      >
        {dealHealth ? (
          <div className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{dealHealth.score}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">/ 100</span>
              <span className={cn(
                "ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                dealHealth.color === "emerald" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                dealHealth.color === "amber" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                dealHealth.color === "red" && "bg-red-500/10 text-red-600 dark:text-red-400",
              )}>
                {dealHealth.label}
              </span>
            </div>

            {/* Gradient progress bar (green→amber→red, fill width = score) */}
            <div className="relative h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  dealHealth.color === "emerald" && "bg-emerald-500",
                  dealHealth.color === "amber" && "bg-amber-500",
                  dealHealth.color === "red" && "bg-red-500",
                )}
                style={{ width: `${dealHealth.score}%` }}
              />
            </div>

            {/* Factor breakdown */}
            {dealHealth.factors.length > 0 && (
              <ul className="space-y-1 pt-1">
                {dealHealth.factors.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground truncate">{f.label}</span>
                    <span className={cn(
                      "tabular-nums font-medium shrink-0",
                      f.impact > 0 ? "text-emerald-600 dark:text-emerald-400"
                        : f.impact < 0 ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    )}>
                      {f.impact > 0 ? "+" : ""}{f.impact}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {(intel?.momentumSignals?.momentum || sentimentTraj.length > 1 || coverage) && (
              <div className="pt-2 border-t border-border/40 space-y-1">
                {intel?.momentumSignals?.momentum && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {intel.momentumSignals.momentum === "Accelerating"
                      ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                      : intel.momentumSignals.momentum === "Stalled" || intel.momentumSignals.momentum === "Stalling"
                        ? <TrendingDown className="h-3 w-3 text-red-500" />
                        : <Sparkles className="h-3 w-3" />}
                    Momentum: <span className="text-foreground font-medium">{intel.momentumSignals.momentum}</span>
                  </div>
                )}
                {sentimentTraj.length > 1 && (
                  <div className="text-[11px] text-muted-foreground">
                    Sentiment: {sentimentTraj[0]} → <span className="text-foreground">{sentimentTraj[sentimentTraj.length - 1]}</span>
                  </div>
                )}
                {coverage && (
                  <div className={cn("flex items-center gap-1.5 text-[11px]", coverage.colorClass)}>
                    {coverage.coverage === "no-champion" ? <ShieldAlert className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                    {coverage.label}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Process meetings to compute deal health.</p>
        )}
      </CollapsibleCard>
    </div>
  );
}
