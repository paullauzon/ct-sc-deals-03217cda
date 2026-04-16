import { Lead } from "@/types/lead";
import { CollapsibleCard } from "./CollapsibleCard";
import {
  Heart, Users, Shield, Crown, Trophy, ShieldAlert,
  TrendingUp, TrendingDown, Sparkles, Target, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeDealHealthScore,
  getStakeholderCoverage,
  findSimilarWonDeals,
  getDroppedPromises,
} from "@/lib/dealHealthUtils";

interface RightRailCardsProps {
  lead: Lead;
  allLeads: Lead[];
}

export function RightRailCards({ lead, allLeads }: RightRailCardsProps) {
  const dealHealth = computeDealHealthScore(lead);
  const coverage = getStakeholderCoverage(lead);
  const isClosed = lead.stage === "Closed Won" || lead.stage === "Lost";
  const similarWon = isClosed ? [] : findSimilarWonDeals(lead, allLeads);
  const droppedPromises = getDroppedPromises(lead);
  const intel = lead.dealIntelligence;
  const stakeholders = intel?.stakeholderMap || [];
  const risks = (intel?.riskRegister || []).filter(r => r.mitigationStatus !== "Mitigated");
  const sentimentTraj = intel?.momentumSignals?.sentimentTrajectory || [];

  return (
    <div className="divide-y divide-border">
      {/* Deal Health */}
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

      {/* Stakeholders */}
      {stakeholders.length > 0 && (
        <CollapsibleCard
          title="Stakeholders"
          icon={<Users className="h-3.5 w-3.5" />}
          count={stakeholders.length}
          defaultOpen
        >
          <div className="space-y-2">
            {stakeholders.map((s, i) => (
              <div key={i} className="rounded border border-border/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium truncate">{s.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                    {s.stance}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {s.role}{s.company ? ` · ${s.company}` : ""}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {s.influence} · {s.mentions} mentions
                </p>
                {s.concerns?.[0] && (
                  <p className="text-[10px] text-muted-foreground italic mt-0.5 line-clamp-2">
                    "{s.concerns[0]}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Open Commitments — what we owe */}
      {droppedPromises.length > 0 && (
        <CollapsibleCard
          title="Open Commitments"
          icon={<Target className="h-3.5 w-3.5" />}
          count={droppedPromises.length}
          defaultOpen
        >
          <div className="space-y-1.5">
            {droppedPromises.slice(0, 5).map((p, i) => (
              <div key={i} className="text-xs border border-border/60 rounded p-2">
                <p className="font-medium truncate">{p.item}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {p.owner}{p.daysOverdue > 0 ? ` · ${p.daysOverdue}d pending` : ""}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <CollapsibleCard
          title="Risks"
          icon={<Shield className="h-3.5 w-3.5" />}
          count={risks.length}
          defaultOpen
        >
          <div className="space-y-1.5">
            {risks.map((r, i) => (
              <div key={i} className={cn(
                "rounded border p-2 text-xs",
                r.severity === "Critical" && "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20",
                r.severity === "High" && "border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20",
                (r.severity !== "Critical" && r.severity !== "High") && "border-border/60",
              )}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-medium text-[10px] uppercase tracking-wider">{r.severity}</span>
                  <span className="text-[10px] text-muted-foreground">{r.mitigationStatus}</span>
                </div>
                <p className="text-muted-foreground leading-snug">{r.risk}</p>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Win Strategy */}
      {intel?.winStrategy && (
        <CollapsibleCard
          title="Win Strategy"
          icon={<Crown className="h-3.5 w-3.5" />}
          defaultOpen
        >
          <div className="space-y-2.5 text-xs">
            {intel.winStrategy.numberOneCloser && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">#1 Closer</p>
                <p className="text-foreground/90 leading-snug">{intel.winStrategy.numberOneCloser}</p>
              </div>
            )}
            {intel.winStrategy.powerMove && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Power Move</p>
                <p className="text-foreground/90 leading-snug">{intel.winStrategy.powerMove}</p>
              </div>
            )}
            {intel.winStrategy.landmines?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Landmines</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {intel.winStrategy.landmines.map((l, i) => (
                    <li key={i} className="leading-snug">· {l}</li>
                  ))}
                </ul>
              </div>
            )}
            {intel.winStrategy.dealTemperature && (
              <div className="pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                Temperature: <span className="text-foreground font-medium">{intel.winStrategy.dealTemperature}</span>
              </div>
            )}
          </div>
        </CollapsibleCard>
      )}

      {/* Buying Committee */}
      {intel?.buyingCommittee && (
        <CollapsibleCard
          title="Buying Committee"
          icon={<Users className="h-3.5 w-3.5" />}
          defaultOpen
        >
          <div className="space-y-1 text-xs">
            {intel.buyingCommittee.decisionMaker && (
              <p><span className="text-muted-foreground">Decision Maker:</span> <span className="font-medium">{intel.buyingCommittee.decisionMaker}</span></p>
            )}
            {intel.buyingCommittee.champion && (
              <p><span className="text-muted-foreground">Champion:</span> <span className="font-medium">{intel.buyingCommittee.champion}</span></p>
            )}
            {intel.buyingCommittee.influencers?.length > 0 && (
              <p><span className="text-muted-foreground">Influencers:</span> <span className="font-medium">{intel.buyingCommittee.influencers.join(", ")}</span></p>
            )}
            {intel.buyingCommittee.blockers?.length > 0 && (
              <p><span className="text-muted-foreground">Blockers:</span> <span className="text-red-600 dark:text-red-400 font-medium">{intel.buyingCommittee.blockers.join(", ")}</span></p>
            )}
          </div>
        </CollapsibleCard>
      )}

      {/* Similar Won Deals */}
      {similarWon.length > 0 && (
        <CollapsibleCard
          title="Similar Won Deals"
          icon={<Trophy className="h-3.5 w-3.5" />}
          count={similarWon.length}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {similarWon.slice(0, 4).map((s, i) => (
              <div key={i} className="text-xs border-b border-border/40 last:border-0 pb-1.5 last:pb-0">
                <p className="font-medium">{s.name}</p>
                <p className="text-[10px] text-muted-foreground">${s.dealValue.toLocaleString()}/mo</p>
                {s.winTactic && (
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5 italic">{s.winTactic}</p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Deal Narrative */}
      {intel?.dealNarrative && (
        <CollapsibleCard
          title="Deal Narrative"
          icon={<BookOpen className="h-3.5 w-3.5" />}
          defaultOpen={false}
        >
          <p className="text-xs text-muted-foreground leading-relaxed">
            {intel.dealNarrative}
          </p>
        </CollapsibleCard>
      )}
    </div>
  );
}
