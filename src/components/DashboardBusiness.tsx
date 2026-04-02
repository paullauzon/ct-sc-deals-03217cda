import { useMemo } from "react";
import { Lead, LeadSource, Brand } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { BrandLogo } from "@/components/BrandLogo";
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

function BrandScorecard({ metrics }: { metrics: BrandMetrics }) {
  const borderColor = metrics.brand === "Captarget" ? "border-t-red-500" : "border-t-amber-500";

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
            <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
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
          <BrandScorecard metrics={ctMetrics} />
          <BrandScorecard metrics={scMetrics} />
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
