import { useState, useEffect, useMemo } from "react";
import { Lead, LeadSource, LeadStage, Brand } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { differenceInDays, parseISO, format, subMonths } from "date-fns";
import { DollarSign, TrendingUp, TrendingDown, Clock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const ACTIVE_STAGES = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"] as const;

const SOURCE_LABELS: Record<LeadSource, string> = {
  "CT Contact Form": "CT Contact",
  "CT Free Targets Form": "CT Targets",
  "SC Intro Call Form": "SC Intro",
  "SC Free Targets Form": "SC Targets",
};

interface BrandMetrics {
  brand: Brand;
  totalLeads: number;
  activePipeline: number;
  mrr: number;
  winRate: number;
  avgDealSize: number;
  avgCycleDays: number;
  leadsPerRep: Record<string, number>;
  wonCount: number;
  lostCount: number;
}

function computeBrandMetrics(leads: Lead[], brand: Brand): BrandMetrics {
  const brandLeads = leads.filter(l => l.brand === brand);
  const active = brandLeads.filter(l => !CLOSED_STAGES.has(l.stage));
  const won = brandLeads.filter(l => l.stage === "Closed Won");
  const lost = brandLeads.filter(l => l.stage === "Closed Lost");
  const totalClosed = won.length + lost.length;

  const mrr = won.reduce((s, l) => {
    if (!l.subscriptionValue) return s;
    if (l.billingFrequency === "Quarterly") return s + l.subscriptionValue / 3;
    if (l.billingFrequency === "Annually") return s + l.subscriptionValue / 12;
    return s + l.subscriptionValue;
  }, 0);

  const wonWithCycle = won.filter(l => l.dateSubmitted && l.closedDate);
  const avgCycleDays = wonWithCycle.length > 0
    ? Math.round(wonWithCycle.reduce((s, l) => s + Math.max(1, Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000)), 0) / wonWithCycle.length)
    : 0;

  const activeWithValue = active.filter(l => l.dealValue > 0);
  const avgDealSize = activeWithValue.length > 0
    ? Math.round(activeWithValue.reduce((s, l) => s + l.dealValue, 0) / activeWithValue.length)
    : 0;

  // Leads per rep
  const repMap: Record<string, number> = {};
  for (const l of brandLeads) {
    const rep = l.assignedTo || "Unassigned";
    repMap[rep] = (repMap[rep] || 0) + 1;
  }

  return {
    brand,
    totalLeads: brandLeads.length,
    activePipeline: active.reduce((s, l) => s + l.dealValue, 0),
    mrr: Math.round(mrr),
    winRate: totalClosed > 0 ? Math.round((won.length / totalClosed) * 100) : 0,
    avgDealSize,
    avgCycleDays,
    leadsPerRep: repMap,
    wonCount: won.length,
    lostCount: lost.length,
  };
}

// ── Sparkline SVG Component ──
function Sparkline({ data, color = "currentColor" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 48;
  const h = 16;
  const pad = 2;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const trend = data[data.length - 1] >= data[0];
  const strokeColor = color !== "currentColor" ? color : trend ? "hsl(var(--success, 142 71% 45%))" : "hsl(var(--destructive))";

  return (
    <svg width={w} height={h} className="inline-block ml-1.5 align-middle">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return <circle key={i} cx={x} cy={y} r="1.5" fill={strokeColor} />;
      })}
    </svg>
  );
}

// ── Compute monthly snapshots for sparklines ──
function computeMonthlySnapshots(leads: Lead[], brand: Brand) {
  const now = new Date();
  const months: string[] = [];
  for (let i = 3; i >= 0; i--) {
    months.push(format(subMonths(now, i), "yyyy-MM"));
  }

  return months.map(month => {
    const brandLeads = leads.filter(l => l.brand === brand);
    const leadsThisMonth = brandLeads.filter(l => l.dateSubmitted?.startsWith(month));
    const wonThisMonth = brandLeads.filter(l => l.stage === "Closed Won" && l.closedDate?.startsWith(month));
    const lostThisMonth = brandLeads.filter(l => l.stage === "Closed Lost" && l.closedDate?.startsWith(month));
    const totalClosed = wonThisMonth.length + lostThisMonth.length;
    const pipelineLeads = brandLeads.filter(l => l.dateSubmitted && l.dateSubmitted <= `${month}-31` && !["Closed Won", "Closed Lost", "Went Dark", "Duplicate", "Disqualified"].includes(l.stage));

    const mrr = wonThisMonth.reduce((s, l) => {
      if (!l.subscriptionValue) return s;
      if (l.billingFrequency === "Quarterly") return s + l.subscriptionValue / 3;
      if (l.billingFrequency === "Annually") return s + l.subscriptionValue / 12;
      return s + l.subscriptionValue;
    }, 0);

    return {
      month,
      leads: leadsThisMonth.length,
      pipeline: pipelineLeads.reduce((s, l) => s + l.dealValue, 0),
      mrr: Math.round(mrr),
      winRate: totalClosed > 0 ? Math.round((wonThisMonth.length / totalClosed) * 100) : 0,
    };
  });
}

function BrandScorecard({ metrics, leads }: { metrics: BrandMetrics; leads: Lead[] }) {
  const borderColor = metrics.brand === "Captarget" ? "border-t-red-500" : "border-t-amber-500";
  const snapshots = useMemo(() => computeMonthlySnapshots(leads, metrics.brand), [leads, metrics.brand]);

  const sparkData: Record<string, number[]> = {
    "Total Leads": snapshots.map(s => s.leads),
    "Active Pipeline": snapshots.map(s => s.pipeline),
    "MRR (Won)": snapshots.map(s => s.mrr),
    "Win Rate": snapshots.map(s => s.winRate),
  };

  return (
    <div className={`border border-border border-t-2 ${borderColor} rounded-lg p-5 space-y-4`}>
      <div className="flex items-center gap-2">
        <BrandLogo brand={metrics.brand} size="sm" />
        <h3 className="font-semibold text-sm uppercase tracking-wider">{metrics.brand}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Total Leads", value: String(metrics.totalLeads) },
          { label: "Active Pipeline", value: `$${metrics.activePipeline.toLocaleString()}` },
          { label: "MRR (Won)", value: metrics.mrr > 0 ? `$${metrics.mrr.toLocaleString()}` : "$0" },
          { label: "Win Rate", value: metrics.wonCount + metrics.lostCount > 0 ? `${metrics.winRate}%` : "N/A" },
          { label: "Avg Deal Size", value: metrics.avgDealSize > 0 ? `$${metrics.avgDealSize.toLocaleString()}` : "N/A" },
          { label: "Avg Cycle (days)", value: metrics.avgCycleDays > 0 ? String(metrics.avgCycleDays) : "N/A" },
        ].map(stat => (
          <div key={stat.label}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <div className="flex items-center">
              <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
              {sparkData[stat.label] && sparkData[stat.label].some(v => v > 0) && (
                <Sparkline data={sparkData[stat.label]} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Leads per Rep */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Leads per Rep</p>
        <div className="space-y-1">
          {Object.entries(metrics.leadsPerRep)
            .sort((a, b) => b[1] - a[1])
            .map(([rep, count]) => (
              <div key={rep} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{rep}</span>
                <span className="font-medium tabular-nums">{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

interface SourceFunnelData {
  source: string;
  total: number;
  qualified: number;
  meetingSet: number;
  meetingHeld: number;
  proposal: number;
  won: number;
  conversionRate: number;
}

function computeSourceFunnels(leads: Lead[]): SourceFunnelData[] {
  const advancedStages = new Set(["Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won"]);
  const meetingPlusStages = new Set(["Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won"]);
  const meetingHeldPlus = new Set(["Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won"]);
  const proposalPlus = new Set(["Proposal Sent", "Negotiation", "Contract Sent", "Closed Won"]);

  return (Object.keys(SOURCE_LABELS) as LeadSource[]).map(source => {
    const sourceLeads = leads.filter(l => l.source === source);
    const total = sourceLeads.length;
    const won = sourceLeads.filter(l => l.stage === "Closed Won").length;

    return {
      source: SOURCE_LABELS[source],
      total,
      qualified: sourceLeads.filter(l => advancedStages.has(l.stage)).length,
      meetingSet: sourceLeads.filter(l => meetingPlusStages.has(l.stage)).length,
      meetingHeld: sourceLeads.filter(l => meetingHeldPlus.has(l.stage)).length,
      proposal: sourceLeads.filter(l => proposalPlus.has(l.stage)).length,
      won,
      conversionRate: total > 0 ? Math.round((won / total) * 100) : 0,
    };
  }).filter(s => s.total > 0);
}

interface Props {
  leads: Lead[];
  onDrillDown: (title: string, leads: Lead[]) => void;
}

export function DashboardBusiness({ leads, onDrillDown }: Props) {
  const ctMetrics = useMemo(() => computeBrandMetrics(leads, "Captarget"), [leads]);
  const scMetrics = useMemo(() => computeBrandMetrics(leads, "SourceCo"), [leads]);
  const sourceFunnels = useMemo(() => computeSourceFunnels(leads), [leads]);

  const funnelStages = ["total", "qualified", "meetingSet", "meetingHeld", "proposal", "won"] as const;
  const funnelLabels: Record<string, string> = {
    total: "Total",
    qualified: "Qualified+",
    meetingSet: "Meeting Set+",
    meetingHeld: "Meeting Held+",
    proposal: "Proposal+",
    won: "Won",
  };

  // Bar chart data for source comparison
  const barData = sourceFunnels.map(s => ({
    source: s.source,
    "Lead → Qualified": s.total > 0 ? Math.round((s.qualified / s.total) * 100) : 0,
    "Lead → Meeting": s.total > 0 ? Math.round((s.meetingSet / s.total) * 100) : 0,
    "Lead → Won": s.conversionRate,
  }));

  return (
    <div className="space-y-8">
      {/* ── Brand Scorecards ── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Brand Comparison</h2>
        <div className="grid grid-cols-2 gap-4">
          <BrandScorecard metrics={ctMetrics} leads={leads} />
          <BrandScorecard metrics={scMetrics} leads={leads} />
        </div>
      </div>

      {/* ── Source Conversion Funnel ── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Source Conversion Funnel</h2>

        {/* Funnel Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase tracking-wider">Source</th>
                {funnelStages.map(stage => (
                  <th key={stage} className="text-right px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider">
                    {funnelLabels[stage]}
                  </th>
                ))}
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground uppercase tracking-wider">Conv %</th>
              </tr>
            </thead>
            <tbody>
              {sourceFunnels.map((row, i) => (
                <tr key={row.source} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-secondary/10"}`}>
                  <td className="px-4 py-2.5 font-medium">{row.source}</td>
                  {funnelStages.map(stage => (
                    <td key={stage} className="text-right px-3 py-2.5 tabular-nums">
                      {row[stage]}
                    </td>
                  ))}
                  <td className="text-right px-4 py-2.5 tabular-nums font-medium">
                    {row.conversionRate > 0 ? `${row.conversionRate}%` : "0%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Source Conversion Bar Chart */}
        <div className="mt-4 border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Conversion Rates by Source (%)</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={75} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
                  formatter={(value: number) => [`${value}%`]}
                />
                <Bar dataKey="Lead → Qualified" fill="hsl(var(--muted-foreground))" radius={[0, 2, 2, 0]} barSize={8} />
                <Bar dataKey="Lead → Meeting" fill="hsl(var(--foreground) / 0.5)" radius={[0, 2, 2, 0]} barSize={8} />
                <Bar dataKey="Lead → Won" fill="hsl(var(--success))" radius={[0, 2, 2, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Brand P&L Summary ── */}
      <BrandPnL leads={leads} />

      {/* ── Stage Conversion Waterfall ── */}
      <StageWaterfall leads={leads} />

      {/* ── Lead Response Time ── */}
      <LeadResponseTime leads={leads} />

      {/* ── Quick Insights ── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Key Observations</h2>
        <div className="grid grid-cols-3 gap-3">
          {(() => {
            const insights: { label: string; value: string; sub?: string }[] = [];

            // SourceCo lead utilization
            const scNew = leads.filter(l => l.brand === "SourceCo" && l.stage === "New Lead").length;
            const scTotal = leads.filter(l => l.brand === "SourceCo").length;
            if (scTotal > 0) {
              const pct = Math.round((scNew / scTotal) * 100);
              insights.push({
                label: "SC Untouched",
                value: `${pct}%`,
                sub: `${scNew} of ${scTotal} at New Lead`,
              });
            }

            // Captarget pipeline concentration
            const ctActive = leads.filter(l => l.brand === "Captarget" && !CLOSED_STAGES.has(l.stage));
            const ctMalik = ctActive.filter(l => l.assignedTo === "Malik").length;
            if (ctActive.length > 0) {
              insights.push({
                label: "CT Rep Concentration",
                value: `${Math.round((ctMalik / ctActive.length) * 100)}%`,
                sub: `Malik owns ${ctMalik} of ${ctActive.length} active`,
              });
            }

            // Stale pipeline (no contact > 30 days)
            const now = Date.now();
            const staleActive = leads.filter(l => {
              if (CLOSED_STAGES.has(l.stage)) return false;
              if (!l.lastContactDate) return true;
              return (now - new Date(l.lastContactDate).getTime()) > 30 * 86400000;
            });
            const staleValue = staleActive.reduce((s, l) => s + l.dealValue, 0);
            insights.push({
              label: "Stale Pipeline",
              value: `$${staleValue.toLocaleString()}`,
              sub: `${staleActive.length} deals, no contact 30+ days`,
            });

            return insights.map(ins => (
              <div
                key={ins.label}
                className="border border-border rounded-lg px-4 py-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => {
                  if (ins.label === "Stale Pipeline") onDrillDown("Stale Pipeline (30+ days)", staleActive);
                  if (ins.label === "SC Untouched") onDrillDown("SourceCo New Leads", leads.filter(l => l.brand === "SourceCo" && l.stage === "New Lead"));
                }}
              >
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{ins.label}</p>
                <p className="text-xl font-semibold tabular-nums mt-0.5">{ins.value}</p>
                {ins.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{ins.sub}</p>}
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Brand P&L Summary ──
const BRANDS_LIST: Brand[] = ["Captarget", "SourceCo"];

function BrandPnL({ leads }: { leads: Lead[] }) {
  const [costs, setCosts] = useState<Record<Brand, { sales_cost: number; tool_cost: number; ad_spend: number }>>({
    Captarget: { sales_cost: 0, tool_cost: 0, ad_spend: 0 },
    SourceCo: { sales_cost: 0, tool_cost: 0, ad_spend: 0 },
  });

  useEffect(() => {
    const month = format(new Date(), "yyyy-MM");
    supabase.from("business_cost_inputs" as any).select("*").eq("month", month).then(({ data }) => {
      const rows = (data || []) as any[];
      const next = { ...costs };
      for (const r of rows) {
        if (r.brand === "Captarget" || r.brand === "SourceCo") {
          next[r.brand as Brand] = {
            sales_cost: Number(r.sales_cost) || 0,
            tool_cost: Number(r.tool_cost) || 0,
            ad_spend: Number(r.ad_spend) || 0,
          };
        }
      }
      setCosts(next);
    });
  }, []);

  const pnl = useMemo(() => {
    return BRANDS_LIST.map(brand => {
      const won = leads.filter(l => l.brand === brand && l.stage === "Closed Won");
      const mrr = won.reduce((s, l) => {
        if (!l.subscriptionValue) return s;
        if (l.billingFrequency === "Quarterly") return s + l.subscriptionValue / 3;
        if (l.billingFrequency === "Annually") return s + l.subscriptionValue / 12;
        return s + l.subscriptionValue;
      }, 0);
      const c = costs[brand];
      const totalCost = c.sales_cost + c.tool_cost + c.ad_spend;
      const profit = mrr - totalCost;
      return { brand, mrr: Math.round(mrr), totalCost: Math.round(totalCost), profit: Math.round(profit) };
    });
  }, [leads, costs]);

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString()}`;

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Brand P&L Summary</h2>
      <div className="grid grid-cols-2 gap-4">
        {pnl.map(p => {
          const borderColor = p.brand === "Captarget" ? "border-t-red-500" : "border-t-amber-500";
          const profitColor = p.profit >= 0 ? "text-emerald-500" : "text-destructive";
          return (
            <Card key={p.brand} className={`border-t-2 ${borderColor}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {p.brand} Monthly P&L
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Monthly Revenue (MRR)</span>
                  <span className="font-medium">{fmt(p.mrr)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Monthly Costs</span>
                  <span className="font-medium">-{fmt(p.totalCost)}</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-border">
                  <span className="font-semibold flex items-center gap-1">
                    {p.profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {p.profit >= 0 ? "Net Margin" : "Monthly Burn"}
                  </span>
                  <span className={`text-lg font-bold ${profitColor}`}>
                    {p.profit >= 0 ? "" : "-"}{fmt(p.profit)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Stage Conversion Waterfall ──
const WATERFALL_STAGES: LeadStage[] = [
  "New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held",
  "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won",
];

// Stages at or past a given index
function atOrPast(stage: string, idx: number): boolean {
  const stageIdx = WATERFALL_STAGES.indexOf(stage as LeadStage);
  return stageIdx >= idx;
}

function StageWaterfall({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    return BRANDS_LIST.map(brand => {
      const brandLeads = leads.filter(l => l.brand === brand);
      const total = brandLeads.length;
      const stages = WATERFALL_STAGES.map((stage, idx) => {
        const count = brandLeads.filter(l => atOrPast(l.stage, idx)).length;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return { stage, count, pct };
      });
      return { brand, total, stages };
    });
  }, [leads]);

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Stage Conversion Waterfall</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map(d => {
          const borderColor = d.brand === "Captarget" ? "border-t-red-500" : "border-t-amber-500";
          return (
            <div key={d.brand} className={`border border-border border-t-2 ${borderColor} rounded-lg overflow-hidden`}>
              <div className="px-4 py-2.5 bg-secondary/20 flex items-center gap-2">
                <BrandLogo brand={d.brand as Brand} size="sm" />
                <span className="text-xs font-medium">{d.brand}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{d.total} total leads</span>
              </div>
              <div className="divide-y divide-border">
                {d.stages.map((s, i) => {
                  const prevCount = i > 0 ? d.stages[i - 1].count : d.total;
                  const dropoff = prevCount > 0 ? Math.round(((prevCount - s.count) / prevCount) * 100) : 0;
                  return (
                    <div key={s.stage} className="flex items-center px-4 py-1.5 text-xs">
                      <span className="w-28 text-muted-foreground truncate">{s.stage}</span>
                      <div className="flex-1 mx-2">
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full rounded-full ${d.brand === "Captarget" ? "bg-red-500/70" : "bg-amber-500/70"}`}
                            style={{ width: `${s.pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-8 text-right tabular-nums font-medium">{s.count}</span>
                      <span className="w-10 text-right tabular-nums text-muted-foreground">{s.pct}%</span>
                      {i > 0 && dropoff > 0 && (
                        <span className="w-12 text-right text-[10px] text-destructive/70">-{dropoff}%</span>
                      )}
                      {(i === 0 || dropoff === 0) && <span className="w-12" />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Lead Response Time ──
function LeadResponseTime({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    return BRANDS_LIST.map(brand => {
      const brandLeads = leads.filter(l => l.brand === brand && l.dateSubmitted);
      const withResponse = brandLeads.filter(l => l.lastContactDate || l.stageEnteredDate);
      if (withResponse.length === 0) return { brand, avg: null, count: 0 };

      const total = withResponse.reduce((s, l) => {
        const submitted = new Date(l.dateSubmitted).getTime();
        const responded = l.lastContactDate
          ? new Date(l.lastContactDate).getTime()
          : l.stageEnteredDate
            ? new Date(l.stageEnteredDate).getTime()
            : submitted;
        return s + Math.max(0, Math.floor((responded - submitted) / 86400000));
      }, 0);
      return { brand, avg: Math.round(total / withResponse.length), count: withResponse.length };
    });
  }, [leads]);

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Lead Response Time</h2>
      <div className="grid grid-cols-2 gap-4">
        {data.map(d => {
          const borderColor = d.brand === "Captarget" ? "border-t-red-500" : "border-t-amber-500";
          return (
            <Card key={d.brand} className={`border-t-2 ${borderColor}`}>
              <CardContent className="pt-4 text-center">
                <Clock className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-2xl font-bold tabular-nums">
                  {d.avg != null ? `${d.avg}d` : "N/A"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {d.brand} avg response ({d.count} leads)
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
