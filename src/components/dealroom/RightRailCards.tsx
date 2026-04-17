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
 * Slimmed: only Deal Health remains. Win Strategy / Risks / Open Commitments /
 * Similar Won Deals / Deal Narrative now live inside the middle-panel tabs
 * (Intelligence + Actions) to eliminate duplication.
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
            </div>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium",
              dealHealth.color === "emerald" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              dealHealth.color === "amber" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              dealHealth.color === "red" && "bg-red-500/10 text-red-600 dark:text-red-400",
            )}>
              {dealHealth.label}
            </div>
            {intel?.momentumSignals?.momentum && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/40">
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
              <div className={cn("flex items-center gap-1.5 text-xs", coverage.colorClass)}>
                {coverage.coverage === "no-champion" ? <ShieldAlert className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {coverage.label}
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
