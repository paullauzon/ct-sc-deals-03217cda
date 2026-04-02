import { useMemo } from "react";
import { Lead } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { BrandLogo } from "@/components/BrandLogo";
import { TrendingUp, TrendingDown, Minus, Activity, DollarSign, Clock, CalendarCheck, AlertCircle } from "lucide-react";
import { format, parseISO, differenceInDays, addDays, isBefore } from "date-fns";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const ACTIVE_STAGES = new Set(["Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"]);

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof Activity; accent?: string }) {
  return (
    <div className="border border-border rounded-lg p-3 flex-1 min-w-[130px]">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${accent || "text-muted-foreground"}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function MomentumIcon({ momentum }: { momentum?: string }) {
  if (momentum === "Accelerating") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (momentum === "Stalling" || momentum === "Stalled") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function daysInStageColor(days: number): string {
  if (days < 7) return "text-emerald-600 dark:text-emerald-400";
  if (days <= 14) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function DealPulseTab({ leads, ownerFilter, onSelectLead }: { leads: Lead[]; ownerFilter: string; onSelectLead: (id: string) => void }) {
  const now = new Date();

  const filtered = useMemo(() => {
    if (ownerFilter === "All") return leads;
    if (ownerFilter === "Unassigned") return leads.filter(l => !l.assignedTo);
    return leads.filter(l => l.assignedTo === ownerFilter);
  }, [leads, ownerFilter]);

  const activeDeals = useMemo(() => filtered.filter(l => ACTIVE_STAGES.has(l.stage) || l.stage === "New Lead"), [filtered]);

  const kpis = useMemo(() => {
    const totalValue = activeDeals.reduce((s, l) => s + (l.dealValue || 0), 0);
    const daysArr = activeDeals.map(l => computeDaysInStage(l.stageEnteredDate)).filter(d => d > 0);
    const avgDays = daysArr.length > 0 ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length) : 0;
    const weekEnd = addDays(now, 7);
    const meetingsThisWeek = filtered.filter(l => l.meetingDate && !isBefore(parseISO(l.meetingDate), now) && isBefore(parseISO(l.meetingDate), weekEnd)).length;
    return { activeCount: activeDeals.length, totalValue, avgDays, meetingsThisWeek };
  }, [activeDeals, filtered, now]);

  const sortedDeals = useMemo(() => {
    return activeDeals
      .map(l => {
        const days = computeDaysInStage(l.stageEnteredDate);
        const momentum = l.dealIntelligence?.momentumSignals?.momentum || "";
        const riskScore = (days > 14 ? 100 : days > 7 ? 50 : 0) + (momentum === "Stalled" ? 80 : momentum === "Stalling" ? 40 : 0);
        return { lead: l, days, momentum, riskScore };
      })
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [activeDeals]);

  const renewals = useMemo(() => {
    return filtered
      .filter(l => l.stage === "Closed Won" && l.contractEnd)
      .map(l => ({ lead: l, daysUntil: differenceInDays(parseISO(l.contractEnd), now) }))
      .filter(r => r.daysUntil >= 0 && r.daysUntil <= 60)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [filtered, now]);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard label="Active Deals" value={String(kpis.activeCount)} icon={Activity} accent="text-primary" />
        <KpiCard label="Pipeline Value" value={`$${kpis.totalValue.toLocaleString()}`} icon={DollarSign} accent="text-emerald-500" />
        <KpiCard label="Avg Days in Stage" value={`${kpis.avgDays}d`} icon={Clock} accent="text-amber-500" />
        <KpiCard label="Meetings This Week" value={String(kpis.meetingsThisWeek)} icon={CalendarCheck} accent="text-blue-500" />
      </div>

      {/* Momentum Board */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Momentum Board</h3>
        <div className="border border-border rounded-md overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_70px_80px_80px_80px] gap-0 px-4 py-2 bg-secondary/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>Deal</span>
            <span>Stage</span>
            <span className="text-center">Days</span>
            <span className="text-right">Value</span>
            <span className="text-center">Momentum</span>
            <span className="text-right">Last Contact</span>
          </div>
          <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
            {sortedDeals.map(({ lead, days, momentum }) => {
              const isStalled = days > 14;
              const lastDate = lead.lastContactDate || lead.meetingDate || lead.stageEnteredDate;
              return (
                <div
                  key={lead.id}
                  onClick={() => onSelectLead(lead.id)}
                  className={`grid grid-cols-[1fr_100px_70px_80px_80px_80px] gap-0 px-4 py-2 cursor-pointer hover:bg-secondary/30 transition-colors ${isStalled ? "bg-red-500/5" : ""}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <BrandLogo brand={lead.brand} size="xxs" />
                    <span className="text-sm font-medium truncate">{lead.name}</span>
                    {lead.assignedTo && (
                      <span className="w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-semibold shrink-0">{lead.assignedTo[0]}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground self-center truncate">{lead.stage}</span>
                  <span className={`text-xs font-medium text-center self-center tabular-nums ${daysInStageColor(days)}`}>{days}d</span>
                  <span className="text-[10px] text-muted-foreground text-right self-center tabular-nums">
                    {lead.dealValue > 0 ? `$${lead.dealValue.toLocaleString()}` : "—"}
                  </span>
                  <div className="flex items-center justify-center"><MomentumIcon momentum={momentum} /></div>
                  <span className="text-[10px] text-muted-foreground text-right self-center tabular-nums">
                    {lastDate ? format(parseISO(lastDate), "MMM d") : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Renewals */}
      {renewals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-3.5 w-3.5 text-purple-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">Renewals Coming Up</h3>
            <span className="text-[10px] text-muted-foreground">({renewals.length})</span>
          </div>
          <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
            {renewals.map(({ lead, daysUntil }) => (
              <div key={lead.id} onClick={() => onSelectLead(lead.id)} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-secondary/30 transition-colors">
                <BrandLogo brand={lead.brand} size="xxs" />
                <span className="text-sm font-medium truncate">{lead.name}</span>
                <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{lead.company}</span>
                <span className={`text-xs font-medium ml-auto whitespace-nowrap ${daysUntil <= 14 ? "text-red-600 dark:text-red-400" : "text-purple-600 dark:text-purple-400"}`}>
                  {daysUntil}d left
                </span>
                {lead.subscriptionValue > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">${lead.subscriptionValue.toLocaleString()}/mo</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
