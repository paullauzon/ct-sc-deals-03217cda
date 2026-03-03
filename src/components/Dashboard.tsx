import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead, LeadSource, Brand } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { LeadDetail } from "@/components/LeadsTable";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

const SOURCE_LABELS: Record<LeadSource, string> = {
  "CT Contact Form": "CT Contact",
  "CT Free Targets Form": "CT Targets",
  "SC Intro Call Form": "SC Intro",
  "SC Free Targets Form": "SC Targets",
};

const ACTIVE_STAGES = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"] as const;

export function Dashboard() {
  const { getMetrics, leads } = useLeads();
  const m = getMetrics();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // ---- Computed data ----
  const analytics = useMemo(() => {
    const now = new Date("2026-03-03");
    const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 86400000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 86400000);

    const leadsThisWeek = leads.filter((l) => new Date(l.dateSubmitted) >= oneWeekAgo).length;
    const leadsThisMonth = leads.filter((l) => new Date(l.dateSubmitted) >= oneMonthAgo).length;
    const leadsLastMonth = leads.filter((l) => {
      const d = new Date(l.dateSubmitted);
      return d >= twoMonthsAgo && d < oneMonthAgo;
    }).length;
    const momGrowth = leadsLastMonth > 0 ? Math.round(((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100) : 0;

    // Brand breakdown
    const ctLeads = leads.filter((l) => l.brand === "Captarget");
    const scLeads = leads.filter((l) => l.brand === "SourceCo");

    // Weekly volume (last 16 weeks)
    const weeklyData: { week: string; CT: number; SC: number }[] = [];
    for (let i = 15; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 86400000);
      const weekEnd = new Date(now.getTime() - i * 7 * 86400000);
      const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      weeklyData.push({
        week: label,
        CT: leads.filter((l) => l.brand === "Captarget" && new Date(l.dateSubmitted) >= weekStart && new Date(l.dateSubmitted) < weekEnd).length,
        SC: leads.filter((l) => l.brand === "SourceCo" && new Date(l.dateSubmitted) >= weekStart && new Date(l.dateSubmitted) < weekEnd).length,
      });
    }

    // Source breakdown
    const sourceBreakdown = (["CT Contact Form", "CT Free Targets Form", "SC Intro Call Form", "SC Free Targets Form"] as LeadSource[]).map((s) => ({
      source: SOURCE_LABELS[s],
      count: leads.filter((l) => l.source === s).length,
    }));

    // Role distribution
    const roleMap = new Map<string, number>();
    for (const l of leads) {
      const role = l.role || "Unknown";
      roleMap.set(role, (roleMap.get(role) || 0) + 1);
    }
    const roleData = Array.from(roleMap.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // Company leaderboard
    const companyMap = new Map<string, { count: number; value: number; sources: Set<string> }>();
    for (const l of leads) {
      const co = l.company || "(No Company)";
      if (!companyMap.has(co)) companyMap.set(co, { count: 0, value: 0, sources: new Set() });
      const entry = companyMap.get(co)!;
      entry.count++;
      entry.value += l.dealValue;
      entry.sources.add(l.brand === "Captarget" ? "CT" : "SC");
    }
    const companyLeaderboard = Array.from(companyMap.entries())
      .map(([company, data]) => ({ company, ...data, sources: Array.from(data.sources).join(", ") }))
      .filter((c) => c.company !== "(No Company)")
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Duplicates
    const duplicates = leads.filter((l) => l.isDuplicate);
    const duplicatePairs: { ctLead: Lead; scLead: Lead }[] = [];
    const seen = new Set<string>();
    for (const l of duplicates) {
      const pair = leads.find((o) => o.id === l.duplicateOf);
      if (pair && !seen.has(`${l.email.toLowerCase()}`)) {
        seen.add(l.email.toLowerCase());
        const ct = l.brand === "Captarget" ? l : pair;
        const sc = l.brand === "SourceCo" ? l : pair;
        duplicatePairs.push({ ctLead: ct, scLead: sc });
      }
    }

    // Where heard about us (SC only)
    const hearMap = new Map<string, number>();
    for (const l of scLeads) {
      if (l.hearAboutUs) {
        const key = l.hearAboutUs.toLowerCase().trim();
        const normalized = key.includes("google") ? "Google" :
          key.includes("linkedin") ? "LinkedIn" :
          key.includes("chatgpt") || key.includes("gpt") || key.includes("copilot") ? "ChatGPT/GPT" :
          key.includes("grok") ? "Grok" :
          key.includes("perplexity") ? "Perplexity" :
          key.includes("twitter") || key.includes("x.com") ? "Twitter/X" :
          key.includes("referral") || key.includes("friend") || key.includes("word of mouth") ? "Referral" :
          key.includes("tomos") ? "Tomos (team)" :
          l.hearAboutUs;
        hearMap.set(normalized, (hearMap.get(normalized) || 0) + 1);
      }
    }
    const hearData = Array.from(hearMap.entries())
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count);

    // Service Interest
    const serviceData = (["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "Other", "TBD"] as const).map((s) => ({
      label: s, count: leads.filter((l) => l.serviceInterest === s).length,
    })).filter((s) => s.count > 0);

    // Deals planned distribution
    const dealsMap = new Map<string, number>();
    for (const l of leads) {
      if (l.dealsPlanned) dealsMap.set(l.dealsPlanned, (dealsMap.get(l.dealsPlanned) || 0) + 1);
    }
    const dealsData = Array.from(dealsMap.entries())
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => b.count - a.count);

    // Day of week heatmap
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayOfWeek = dayNames.map((day, i) => ({
      day,
      count: leads.filter((l) => new Date(l.dateSubmitted).getDay() === i).length,
    }));

    // Pipeline funnel
    const stageFunnel = ACTIVE_STAGES.map((stage) => ({
      label: stage,
      count: m.stageValues[stage]?.count || 0,
      value: m.stageValues[stage]?.value || 0,
    }));
    const maxStageCount = Math.max(...stageFunnel.map((s) => s.count), 1);

    return {
      leadsThisWeek, leadsThisMonth, momGrowth,
      ctLeads, scLeads, weeklyData, sourceBreakdown, roleData,
      companyLeaderboard, duplicates, duplicatePairs, hearData,
      serviceData, dealsData, dayOfWeek, stageFunnel, maxStageCount,
    };
  }, [leads, m]);

  const secondaryMetrics = [
    { label: "Leads This Week", value: analytics.leadsThisWeek },
    { label: "Leads This Month", value: analytics.leadsThisMonth },
    { label: "MoM Growth", value: `${analytics.momGrowth > 0 ? "+" : ""}${analytics.momGrowth}%` },
    { label: "Meetings Set", value: m.meetingsSet },
    { label: "Closed Won", value: m.closedWon },
    { label: "Closed Lost", value: m.closedLost },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Analytics overview · {leads.length} total leads</p>
      </div>

      {/* Hero Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: String(m.totalLeads) },
          { label: "Pipeline Value", value: `$${m.totalPipelineValue.toLocaleString()}` },
          { label: "Win Rate", value: `${m.conversionRate}%` },
          { label: "Avg Days to Meeting", value: m.avgDaysToMeeting || "—" },
        ].map((stat) => (
          <div key={stat.label} className="border border-border border-t-2 border-t-foreground rounded-lg px-5 py-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-6 gap-3">
        {secondaryMetrics.map((stat) => (
          <div key={stat.label} className="border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Brand Comparison */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Brand Comparison</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { brand: "Captarget", data: analytics.ctLeads, abbr: "CT" },
            { brand: "SourceCo", data: analytics.scLeads, abbr: "SC" },
          ].map(({ brand, data, abbr }) => (
            <div key={brand} className="border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono px-1.5 py-0.5 border border-border rounded">{abbr}</span>
                <span className="text-sm font-medium">{brand}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold tabular-nums">{data.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Pipeline $</p><p className="font-semibold tabular-nums">${data.filter((l) => !["Closed Won", "Closed Lost", "Went Dark"].includes(l.stage)).reduce((s, l) => s + l.dealValue, 0).toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Won</p><p className="font-semibold tabular-nums">{data.filter((l) => l.stage === "Closed Won").length}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Volume Chart */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Lead Volume Over Time (16 weeks)</h2>
        <div className="border border-border rounded-lg p-4">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={analytics.weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
              <Tooltip contentStyle={{ fontSize: 12, border: "1px solid hsl(0,0%,85%)", background: "hsl(0,0%,100%)" }} />
              <Line type="monotone" dataKey="CT" stroke="hsl(0,0%,15%)" strokeWidth={2} dot={{ r: 2 }} name="Captarget" />
              <Line type="monotone" dataKey="SC" stroke="hsl(0,0%,60%)" strokeWidth={2} dot={{ r: 2 }} name="SourceCo" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pipeline Funnel */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Pipeline Funnel</h2>
        <div className="space-y-2">
          {analytics.stageFunnel.map((s, i) => {
            const prev = i > 0 ? analytics.stageFunnel[i - 1].count : null;
            const dropOff = prev && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
            return (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 shrink-0 text-right">{s.label}</span>
                <div className="flex-1 h-6 bg-secondary/50 rounded overflow-hidden">
                  <div className="h-full bg-foreground/20 rounded transition-all" style={{ width: `${Math.max((s.count / analytics.maxStageCount) * 100, 2)}%` }} />
                </div>
                <span className="text-xs tabular-nums w-8 text-right font-medium">{s.count}</span>
                <span className="text-xs tabular-nums text-muted-foreground w-20 text-right">${s.value.toLocaleString()}</span>
                {dropOff !== null && dropOff > 0 && (
                  <span className="text-xs text-muted-foreground w-12 text-right">-{dropOff}%</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Source Form Breakdown + Role Distribution */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Source Breakdown</h2>
          <div className="border border-border rounded-lg p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={analytics.sourceBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
                <YAxis dataKey="source" type="category" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" width={80} />
                <Tooltip contentStyle={{ fontSize: 12, border: "1px solid hsl(0,0%,85%)" }} />
                <Bar dataKey="count" fill="hsl(0,0%,25%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Role / Buyer Type</h2>
          <div className="border border-border rounded-md divide-y divide-border max-h-[240px] overflow-y-auto">
            {analytics.roleData.map((r) => (
              <div key={r.role} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-muted-foreground truncate">{r.role}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{r.count}</span>
                  <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{Math.round((r.count / leads.length) * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Company Leaderboard */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Company Leaderboard (Top 15)</h2>
        <div className="border border-border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Leads</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Deal Value</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sources</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {analytics.companyLeaderboard.map((c) => (
                <tr key={c.company} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-2 font-medium">{c.company}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{c.value ? `$${c.value.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">{c.sources}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Service Interest + Deals Planned + Day of Week */}
      <div className="grid grid-cols-3 gap-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Service Interest</h2>
          <div className="border border-border rounded-md divide-y divide-border">
            {analytics.serviceData.map((s) => (
              <div key={s.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-muted-foreground truncate">{s.label}</span>
                <span className="font-medium tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Deals Planned</h2>
          <div className="border border-border rounded-md divide-y divide-border">
            {analytics.dealsData.map((d) => (
              <div key={d.range} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{d.range}</span>
                <span className="font-medium tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Submissions by Day</h2>
          <div className="border border-border rounded-md divide-y divide-border">
            {analytics.dayOfWeek.map((d) => (
              <div key={d.day} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-muted-foreground">{d.day}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-3 bg-secondary/50 rounded overflow-hidden">
                    <div className="h-full bg-foreground/20 rounded" style={{ width: `${(d.count / Math.max(...analytics.dayOfWeek.map((x) => x.count), 1)) * 100}%` }} />
                  </div>
                  <span className="font-medium tabular-nums text-xs w-6 text-right">{d.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Where Heard About Us (SC) + Duplicate Analysis */}
      <div className="grid grid-cols-2 gap-6">
        {analytics.hearData.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">How SC Leads Found Us</h2>
            <div className="border border-border rounded-md divide-y divide-border">
              {analytics.hearData.map((h) => (
                <div key={h.channel} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">{h.channel}</span>
                  <span className="font-medium tabular-nums">{h.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Cross-Brand Duplicates <span className="text-xs font-normal ml-1">({analytics.duplicatePairs.length} pairs)</span>
          </h2>
          {analytics.duplicatePairs.length > 0 ? (
            <div className="border border-border rounded-md divide-y divide-border max-h-[300px] overflow-y-auto">
              {analytics.duplicatePairs.map((pair, i) => (
                <div key={i} className="px-4 py-2.5 text-sm space-y-0.5">
                  <p className="font-medium">{pair.ctLead.name}</p>
                  <p className="text-xs text-muted-foreground">{pair.ctLead.email}</p>
                  <div className="flex gap-2 text-xs">
                    <span className="px-1 py-0.5 border border-border rounded">CT: {pair.ctLead.source.replace("CT ", "")}</span>
                    <span className="px-1 py-0.5 border border-border rounded">SC: {pair.scLead.source.replace("SC ", "")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No cross-brand duplicates found</p>
          )}
        </div>
      </div>

      {/* Recent Leads */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Recent Leads</h2>
        <div className="border border-border rounded-md divide-y divide-border">
          {leads.slice(0, 15).map((lead) => (
            <div
              key={lead.id}
              onClick={() => setSelectedLeadId(lead.id)}
              className="flex items-center justify-between px-4 py-3 text-sm cursor-pointer hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[10px] font-mono px-1 py-0.5 border border-border rounded shrink-0">{lead.brand === "Captarget" ? "CT" : "SC"}</span>
                <span className="font-medium">{lead.name}</span>
                <span className="text-muted-foreground truncate">{lead.company || lead.role}</span>
                {lead.isDuplicate && <span className="text-[10px] px-1 py-0.5 bg-secondary rounded">DUP</span>}
              </div>
              <div className="flex items-center gap-4 text-muted-foreground shrink-0">
                <span className="text-xs tabular-nums">{computeDaysInStage(lead.stageEnteredDate)}d</span>
                <span className="text-xs">{lead.dateSubmitted}</span>
                <span className="text-xs px-1.5 py-0.5 border border-border rounded">{lead.stage}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
