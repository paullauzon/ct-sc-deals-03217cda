import { useLeads } from "@/contexts/LeadContext";

export function Dashboard() {
  const { getMetrics, leads } = useLeads();
  const m = getMetrics();

  const activeStages = ["New Lead", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation"] as const;

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

      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Pipeline by Stage</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {activeStages.map((stage) => {
            const data = m.stageValues[stage];
            return (
              <div key={stage} className="border border-border rounded-md p-3">
                <p className="text-xs text-muted-foreground">{stage}</p>
                <p className="text-lg font-semibold tabular-nums">{data?.count || 0}</p>
                {(data?.value || 0) > 0 && (
                  <p className="text-xs text-muted-foreground tabular-nums">${data.value.toLocaleString()}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Recent Leads</h2>
        <div className="border border-border rounded-md divide-y divide-border">
          {leads.slice(0, 10).map((lead) => (
            <div key={lead.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{lead.name}</span>
                <span className="text-muted-foreground ml-2">{lead.role}</span>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
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
