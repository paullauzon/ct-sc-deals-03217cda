import { useState, useMemo } from "react";
import { Lead } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { BrandLogo } from "@/components/BrandLogo";
import { TrendingUp, TrendingDown, Minus, Activity, DollarSign, Clock, CalendarCheck, AlertCircle, Flame, Snowflake, Thermometer, Gauge, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays, addDays, isBefore } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const ACTIVE_STAGES = new Set(["Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"]);

function KpiCard({ label, value, subValue, icon: Icon, accent }: { label: string; value: string; subValue?: string; icon: typeof Activity; accent?: string }) {
  return (
    <div className="border border-border rounded-lg p-3 flex-1 min-w-[130px]">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${accent || "text-muted-foreground"}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {subValue && <span className="text-[10px] text-muted-foreground ml-1">{subValue}</span>}
    </div>
  );
}

function MomentumIcon({ momentum }: { momentum?: string }) {
  if (momentum === "Accelerating") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (momentum === "Stalling" || momentum === "Stalled") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function DealTempIcon({ temp }: { temp?: string }) {
  if (temp === "On Fire") return <Flame className="h-3.5 w-3.5 text-red-500" />;
  if (temp === "Warm") return <Thermometer className="h-3.5 w-3.5 text-amber-500" />;
  if (temp === "Lukewarm") return <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />;
  if (temp === "Cold" || temp === "Ice Cold") return <Snowflake className="h-3.5 w-3.5 text-blue-500" />;
  return null;
}

function daysInStageColor(days: number): string {
  if (days < 7) return "text-emerald-600 dark:text-emerald-400";
  if (days <= 14) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

type MomentumSort = "risk" | "value" | "days" | "name";

export function DealPulseTab({ leads, ownerFilter, onSelectLead }: { leads: Lead[]; ownerFilter: string; onSelectLead: (id: string) => void }) {
  const now = new Date();
  const [momentumSort, setMomentumSort] = useState<MomentumSort>("risk");
  const [momentumSortDir, setMomentumSortDir] = useState<"asc" | "desc">("desc");
  const [showIntelOnly, setShowIntelOnly] = useState(false);

  const filtered = useMemo(() => {
    if (ownerFilter === "All") return leads;
    if (ownerFilter === "Unassigned") return leads.filter(l => !l.assignedTo);
    return leads.filter(l => l.assignedTo === ownerFilter);
  }, [leads, ownerFilter]);

  const activeDeals = useMemo(() => filtered.filter(l => ACTIVE_STAGES.has(l.stage)), [filtered]);

  // Forecast KPIs
  const forecast = useMemo(() => {
    const commit = filtered.filter(l => l.forecastCategory === "Commit").reduce((s, l) => s + (l.dealValue || 0), 0);
    const bestCase = filtered.filter(l => l.forecastCategory === "Best Case").reduce((s, l) => s + (l.dealValue || 0), 0);
    const pipeline = filtered.filter(l => l.forecastCategory === "Pipeline").reduce((s, l) => s + (l.dealValue || 0), 0);
    return { commit, bestCase, pipeline };
  }, [filtered]);

  const kpis = useMemo(() => {
    const totalValue = activeDeals.reduce((s, l) => s + (l.dealValue || 0), 0);
    const daysArr = activeDeals.map(l => computeDaysInStage(l.stageEnteredDate)).filter(d => d > 0);
    const avgDays = daysArr.length > 0 ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length) : 0;
    const weekEnd = addDays(now, 7);
    const meetingsThisWeek = filtered.filter(l => l.meetingDate && !isBefore(parseISO(l.meetingDate), now) && isBefore(parseISO(l.meetingDate), weekEnd)).length;
    return { activeCount: activeDeals.length, totalValue, avgDays, meetingsThisWeek };
  }, [activeDeals, filtered, now]);

  const sortedDeals = useMemo(() => {
    const mapped = activeDeals.map(l => {
      const days = computeDaysInStage(l.stageEnteredDate);
      const momentum = l.dealIntelligence?.momentumSignals?.momentum || "";
      const dealTemp = l.dealIntelligence?.winStrategy?.dealTemperature || "";
      const closingWindow = l.dealIntelligence?.winStrategy?.closingWindow || "";
      const riskScore = (days > 14 ? 100 : days > 7 ? 50 : 0) + (momentum === "Stalled" ? 80 : momentum === "Stalling" ? 40 : 0);
      return { lead: l, days, momentum, dealTemp, closingWindow, riskScore };
    });
    const sorted = [...mapped].sort((a, b) => {
      let cmp = 0;
      switch (momentumSort) {
        case "risk": cmp = a.riskScore - b.riskScore; break;
        case "value": cmp = (a.lead.dealValue || 0) - (b.lead.dealValue || 0); break;
        case "days": cmp = a.days - b.days; break;
        case "name": cmp = a.lead.name.localeCompare(b.lead.name); break;
      }
      return momentumSortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [activeDeals, momentumSort, momentumSortDir]);

  // Pipeline velocity by stage
  const velocity = useMemo(() => {
    const stageMap = new Map<string, { total: number; count: number }>();
    for (const l of activeDeals) {
      if (!ACTIVE_STAGES.has(l.stage)) continue;
      const days = computeDaysInStage(l.stageEnteredDate);
      const entry = stageMap.get(l.stage) || { total: 0, count: 0 };
      entry.total += days;
      entry.count += 1;
      stageMap.set(l.stage, entry);
    }
    return Array.from(stageMap.entries())
      .map(([stage, { total, count }]) => ({ stage, avgDays: Math.round(total / count), count }))
      .sort((a, b) => b.avgDays - a.avgDays);
  }, [activeDeals]);

  const renewals = useMemo(() => {
    return filtered
      .filter(l => l.stage === "Closed Won" && l.contractEnd)
      .map(l => ({ lead: l, daysUntil: differenceInDays(parseISO(l.contractEnd), now) }))
      .filter(r => r.daysUntil >= 0 && r.daysUntil <= 60)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [filtered, now]);

  const hasForecast = forecast.commit > 0 || forecast.bestCase > 0 || forecast.pipeline > 0;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* KPIs */}
        <div className="flex gap-3 flex-wrap">
          <KpiCard label="Active Deals" value={String(kpis.activeCount)} icon={Activity} accent="text-primary" />
          <KpiCard label="Pipeline Value" value={`$${kpis.totalValue.toLocaleString()}`} icon={DollarSign} accent="text-emerald-500" />
          <KpiCard label="Avg Days in Stage" value={`${kpis.avgDays}d`} subValue={kpis.avgDays <= 7 ? "on track" : kpis.avgDays <= 14 ? "watch" : "above target"} icon={Clock} accent={daysInStageColor(kpis.avgDays)} />
          <KpiCard label="Meetings This Week" value={String(kpis.meetingsThisWeek)} icon={CalendarCheck} accent="text-blue-500" />
        </div>

        {/* Forecast Strip */}
        {hasForecast && (
          <div className="flex gap-3 flex-wrap">
            <div className="border border-border rounded-lg p-2.5 flex-1 min-w-[110px] bg-emerald-500/5">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-semibold">Commit</span>
              <p className="text-lg font-semibold tabular-nums">${forecast.commit.toLocaleString()}</p>
            </div>
            <div className="border border-border rounded-lg p-2.5 flex-1 min-w-[110px] bg-blue-500/5">
              <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wider font-semibold">Best Case</span>
              <p className="text-lg font-semibold tabular-nums">${forecast.bestCase.toLocaleString()}</p>
            </div>
            <div className="border border-border rounded-lg p-2.5 flex-1 min-w-[110px] bg-amber-500/5">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-semibold">Pipeline</span>
              <p className="text-lg font-semibold tabular-nums">${forecast.pipeline.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Momentum Board */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Momentum Board</h3>
            <button
              onClick={() => setShowIntelOnly(v => !v)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors ml-2",
                showIntelOnly ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              Has Intel ({sortedDeals.filter(d => !!(d.lead.dealIntelligence)).length})
            </button>
            <div className="flex items-center gap-1 ml-auto">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              {(["risk", "value", "days", "name"] as const).map(s => (
                <button key={s} onClick={() => { if (momentumSort === s) setMomentumSortDir(d => d === "asc" ? "desc" : "asc"); else { setMomentumSort(s); setMomentumSortDir("desc"); } }} className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors", momentumSort === s ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                  {s === "risk" ? "Risk" : s === "value" ? "Value" : s === "days" ? "Days" : "Name"}{momentumSort === s ? (momentumSortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="border border-border rounded-md overflow-hidden overflow-x-auto">
            <div className="grid grid-cols-[1fr_100px_70px_80px_50px_50px_80px] gap-0 px-4 py-2 bg-secondary/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[600px]">
              <span>Deal</span>
              <span>Stage</span>
              <span className="text-center">Days</span>
              <span className="text-right">Value</span>
              <span className="text-center">Temp</span>
              <span className="text-center">Mom.</span>
              <span className="text-right">Last Contact</span>
            </div>
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto min-w-[600px]">
              {sortedDeals.length === 0 && (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No active deals match the current filter</p>
                </div>
              )}
              {sortedDeals.map(({ lead, days, momentum, dealTemp, closingWindow }) => {
                const isStalled = days > 14;
                const lastDate = lead.lastContactDate || lead.meetingDate || lead.stageEnteredDate;
                return (
                  <div
                    key={lead.id}
                    onClick={() => onSelectLead(lead.id)}
                    className={`grid grid-cols-[1fr_100px_70px_80px_50px_50px_80px] gap-0 px-4 py-2 cursor-pointer hover:bg-secondary/30 transition-colors ${isStalled ? "bg-red-500/5" : ""}`}
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
                    <div className="flex items-center justify-center">
                      {dealTemp ? (
                        <Tooltip>
                          <TooltipTrigger asChild><span><DealTempIcon temp={dealTemp} /></span></TooltipTrigger>
                          <TooltipContent className="text-xs">
                            <p className="font-medium">{dealTemp}</p>
                            {closingWindow && <p className="text-muted-foreground">{closingWindow}</p>}
                          </TooltipContent>
                        </Tooltip>
                      ) : <span className="text-[10px] text-muted-foreground">—</span>}
                    </div>
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

        {/* Pipeline Velocity */}
        {velocity.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Velocity</h3>
            </div>
            <div className="flex gap-2 flex-wrap">
              {velocity.map(({ stage, avgDays, count }) => {
                const benchmark = avgDays <= 7 ? { label: "on track", cls: "text-emerald-600 dark:text-emerald-400" } : avgDays <= 14 ? { label: "watch", cls: "text-amber-600 dark:text-amber-400" } : { label: "above target", cls: "text-red-600 dark:text-red-400" };
                return (
                  <div key={stage} className="border border-border rounded-md px-3 py-2 min-w-[120px]">
                    <p className="text-[10px] text-muted-foreground truncate">{stage}</p>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-sm font-semibold tabular-nums ${daysInStageColor(avgDays)}`}>{avgDays}d</span>
                      <span className="text-[9px] text-muted-foreground">avg</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground">{count} deal{count !== 1 ? "s" : ""}</span>
                      <span className={`text-[9px] font-medium ${benchmark.cls}`}>{benchmark.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
    </TooltipProvider>
  );
}
