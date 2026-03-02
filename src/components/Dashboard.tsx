import { useLeads } from "@/contexts/LeadContext";
import { ForecastCategory, IcpFit, ServiceInterest } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";

export function Dashboard() {
  const { getMetrics, leads } = useLeads();
  const m = getMetrics();

  const activeStages = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"] as const;

  const dealsWithValue = leads.filter((l) => l.dealValue > 0 && !["Closed Won", "Closed Lost", "Went Dark"].includes(l.stage));
  const avgDealValue = dealsWithValue.length ? Math.round(dealsWithValue.reduce((s, l) => s + l.dealValue, 0) / dealsWithValue.length) : 0;

  // Forecast breakdown
  const forecastData: { label: ForecastCategory; value: number; count: number }[] = (["Commit", "Best Case", "Pipeline", "Omit"] as ForecastCategory[]).map((cat) => {
    const inCat = leads.filter((l) => l.forecastCategory === cat);
    return { label: cat, value: inCat.reduce((s, l) => s + l.dealValue, 0), count: inCat.length };
  });
  const hasForecastData = forecastData.some((f) => f.count > 0);

  // ICP Fit distribution
  const icpData: { label: IcpFit; count: number }[] = (["Strong", "Moderate", "Weak"] as IcpFit[]).map((fit) => ({
    label: fit, count: leads.filter((l) => l.icpFit === fit).length,
  }));
  const hasIcpData = icpData.some((d) => d.count > 0);

  // Meeting outcomes
  const meetingOutcomes = ["Scheduled", "Held", "No-Show", "Rescheduled", "Cancelled"].map((o) => ({
    label: o, count: leads.filter((l) => l.meetingOutcome === o).length,
  }));
  const hasMeetingData = meetingOutcomes.some((o) => o.count > 0);

  // Service Interest breakdown
  const serviceData: { label: string; count: number }[] = (["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "Other", "TBD"] as ServiceInterest[]).map((s) => ({
    label: s, count: leads.filter((l) => l.serviceInterest === s).length,
  })).filter((s) => s.count > 0);

  // Source breakdown
  const sourceData = [
    { label: "Contact Form", count: leads.filter((l) => l.source === "Contact Form").length },
    { label: "Free Targets Form", count: leads.filter((l) => l.source === "Free Targets Form").length },
  ];

  // Stage funnel
  const stageFunnel = activeStages.map((stage) => ({
    label: stage,
    count: m.stageValues[stage]?.count || 0,
    value: m.stageValues[stage]?.value || 0,
  }));
  const maxStageCount = Math.max(...stageFunnel.map((s) => s.count), 1);

  // Secondary metrics
  const secondaryMetrics = [
    { label: "Meetings Set", value: m.meetingsSet },
    { label: "Closed Won", value: m.closedWon },
    { label: "Closed Lost", value: m.closedLost },
    { label: "Went Dark", value: m.wentDark },
    { label: "Avg Deal Value", value: avgDealValue > 0 ? `$${avgDealValue.toLocaleString()}` : "—" },
    { label: "Avg Days to Meeting", value: m.avgDaysToMeeting || "—" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Pipeline overview as of today</p>
      </div>

      {/* Tier 1: Hero Metrics */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Leads", value: String(m.totalLeads) },
          { label: "Pipeline Value", value: `$${m.totalPipelineValue.toLocaleString()}` },
          { label: "Win Rate", value: `${m.conversionRate}%` },
        ].map((stat) => (
          <div key={stat.label} className="border border-border rounded-lg px-6 py-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="text-4xl font-semibold tabular-nums mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tier 2: Pipeline Funnel */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Pipeline Funnel</h2>
        <div className="space-y-2">
          {stageFunnel.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0 text-right">{s.label}</span>
              <div className="flex-1 h-6 bg-secondary/50 rounded overflow-hidden">
                <div
                  className="h-full bg-foreground/15 rounded transition-all"
                  style={{ width: `${Math.max((s.count / maxStageCount) * 100, 2)}%` }}
                />
              </div>
              <span className="text-xs tabular-nums w-8 text-right font-medium">{s.count}</span>
              <span className="text-xs tabular-nums text-muted-foreground w-20 text-right">${s.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tier 3: Secondary Metrics Strip */}
      <div className="border border-border rounded-lg flex divide-x divide-border">
        {secondaryMetrics.map((stat) => (
          <div key={stat.label} className="flex-1 px-4 py-3 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{stat.label}</p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tier 4: Breakdowns — always-visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Lead Source</h2>
          <div className="grid grid-cols-2 gap-3">
            {sourceData.map((s) => (
              <div key={s.label} className="border border-border rounded-md p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-semibold tabular-nums">{s.count}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Service Interest</h2>
          <div className="border border-border rounded-md divide-y divide-border">
            {serviceData.map((s) => (
              <div key={s.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-medium tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tier 4b: Conditional breakdowns — hidden when all zeros */}
      {(hasForecastData || hasIcpData || hasMeetingData) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {hasForecastData && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Forecast</h2>
              <div className="border border-border rounded-md divide-y divide-border">
                {forecastData.filter((f) => f.count > 0).map((f) => (
                  <div key={f.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{f.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-medium tabular-nums">{f.count}</span>
                      {f.value > 0 && <span className="text-xs text-muted-foreground tabular-nums">${f.value.toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hasIcpData && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">ICP Fit</h2>
              <div className="border border-border rounded-md divide-y divide-border">
                {icpData.filter((d) => d.count > 0).map((d) => (
                  <div key={d.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-medium tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hasMeetingData && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Meeting Outcomes</h2>
              <div className="border border-border rounded-md divide-y divide-border">
                {meetingOutcomes.filter((o) => o.count > 0).map((o) => (
                  <div key={o.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{o.label}</span>
                    <span className="font-medium tabular-nums">{o.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tier 5: Recent Leads */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Recent Leads</h2>
        <div className="border border-border rounded-md divide-y divide-border">
          {leads.slice(0, 10).map((lead) => (
            <div key={lead.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{lead.name}</span>
                <span className="text-muted-foreground ml-2">{lead.company || lead.role}</span>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="text-xs tabular-nums">{computeDaysInStage(lead.stageEnteredDate)}d</span>
                <span className="text-xs">{lead.dateSubmitted}</span>
                <span className="text-xs px-2 py-0.5 border border-border rounded">{lead.stage}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
