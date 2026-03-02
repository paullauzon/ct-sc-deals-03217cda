import { useLeads } from "@/contexts/LeadContext";
import { ForecastCategory, IcpFit, ServiceInterest } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";

export function Dashboard() {
  const { getMetrics, leads } = useLeads();
  const m = getMetrics();

  const activeStages = ["New Lead", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation"] as const;

  // Avg deal value (active deals with value > 0)
  const dealsWithValue = leads.filter((l) => l.dealValue > 0 && !["Closed Won", "Closed Lost", "Went Dark"].includes(l.stage));
  const avgDealValue = dealsWithValue.length ? Math.round(dealsWithValue.reduce((s, l) => s + l.dealValue, 0) / dealsWithValue.length) : 0;

  // Forecast breakdown
  const forecastData: { label: ForecastCategory; value: number; count: number }[] = (["Commit", "Best Case", "Pipeline", "Omit"] as ForecastCategory[]).map((cat) => {
    const inCat = leads.filter((l) => l.forecastCategory === cat);
    return { label: cat, value: inCat.reduce((s, l) => s + l.dealValue, 0), count: inCat.length };
  });

  // ICP Fit distribution
  const icpData: { label: IcpFit; count: number }[] = (["Strong", "Moderate", "Weak"] as IcpFit[]).map((fit) => ({
    label: fit, count: leads.filter((l) => l.icpFit === fit).length,
  }));

  // Meeting outcomes
  const meetingOutcomes = ["Scheduled", "Held", "No-Show", "Rescheduled", "Cancelled"].map((o) => ({
    label: o, count: leads.filter((l) => l.meetingOutcome === o).length,
  }));

  // Service Interest breakdown
  const serviceData: { label: string; count: number }[] = (["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "Other", "TBD"] as ServiceInterest[]).map((s) => ({
    label: s, count: leads.filter((l) => l.serviceInterest === s).length,
  })).filter((s) => s.count > 0);

  // Source breakdown
  const sourceData = [
    { label: "Contact Form", count: leads.filter((l) => l.source === "Contact Form").length },
    { label: "Free Targets Form", count: leads.filter((l) => l.source === "Free Targets Form").length },
  ];

  // Stage funnel (max count for bar width)
  const stageFunnel = activeStages.map((stage) => ({
    label: stage,
    count: m.stageValues[stage]?.count || 0,
    value: m.stageValues[stage]?.value || 0,
  }));
  const maxStageCount = Math.max(...stageFunnel.map((s) => s.count), 1);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Pipeline overview as of today</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: m.totalLeads },
          { label: "Pipeline Value", value: `$${m.totalPipelineValue.toLocaleString()}` },
          { label: "Avg Deal Value", value: avgDealValue > 0 ? `$${avgDealValue.toLocaleString()}` : "—" },
          { label: "Meetings Set", value: m.meetingsSet },
          { label: "Closed Won", value: m.closedWon },
          { label: "Closed Lost", value: m.closedLost },
          { label: "Went Dark", value: m.wentDark },
          { label: "Win Rate", value: `${m.conversionRate}%` },
          { label: "Avg Days to Meeting", value: m.avgDaysToMeeting || "—" },
        ].map((stat) => (
          <div key={stat.label} className="border border-border rounded-md p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Stage Funnel */}
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

      {/* Forecast Category */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Forecast</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {forecastData.map((f) => (
            <div key={f.label} className="border border-border rounded-md p-3">
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="text-lg font-semibold tabular-nums">{f.count}</p>
              {f.value > 0 && <p className="text-xs text-muted-foreground tabular-nums">${f.value.toLocaleString()}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Service Interest + Source */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
      </div>

      {/* ICP Fit + Meeting Outcomes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">ICP Fit</h2>
          <div className="grid grid-cols-3 gap-3">
            {icpData.map((d) => (
              <div key={d.label} className="border border-border rounded-md p-3">
                <p className="text-xs text-muted-foreground">{d.label}</p>
                <p className="text-lg font-semibold tabular-nums">{d.count}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Meeting Outcomes</h2>
          <div className="grid grid-cols-3 gap-3">
            {meetingOutcomes.filter((o) => o.count > 0 || ["Scheduled", "Held", "No-Show"].includes(o.label)).map((o) => (
              <div key={o.label} className="border border-border rounded-md p-3">
                <p className="text-xs text-muted-foreground">{o.label}</p>
                <p className="text-lg font-semibold tabular-nums">{o.count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

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
