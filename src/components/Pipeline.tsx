import { useState } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { LeadStage, Lead } from "@/types/lead";
import { LeadDetail } from "@/components/LeadsTable";

const PIPELINE_STAGES: LeadStage[] = [
  "New Lead", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation",
];

const CLOSED_STAGES: LeadStage[] = ["Closed Won", "Closed Lost", "Went Dark"];

export function Pipeline() {
  const { getLeadsByStage } = useLeads();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">Birds-eye view of all deals by stage</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const leads = getLeadsByStage(stage);
          const totalValue = leads.reduce((s, l) => s + l.dealValue, 0);
          return (
            <div key={stage} className="min-w-[260px] flex-shrink-0">
              <div className="border-b-2 border-foreground pb-2 mb-3 flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wider">{stage}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{leads.length}</span>
              </div>
              {totalValue > 0 && (
                <p className="text-xs text-muted-foreground mb-2 tabular-nums">${totalValue.toLocaleString()}</p>
              )}
              <div className="space-y-2">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="border border-border rounded-md p-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                  >
                    <p className="text-sm font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{lead.role}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span className="tabular-nums">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}</span>
                      <span className="tabular-nums">{lead.daysInCurrentStage}d</span>
                    </div>
                  </div>
                ))}
                {leads.length === 0 && (
                  <p className="text-xs text-muted-foreground py-8 text-center">No deals</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Closed stages */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Closed</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CLOSED_STAGES.map((stage) => {
            const leads = getLeadsByStage(stage);
            return (
              <div key={stage} className="border border-border rounded-md p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-wider">{stage}</span>
                  <span className="text-xs text-muted-foreground">{leads.length}</span>
                </div>
                <div className="space-y-1">
                  {leads.map((lead) => (
                    <div key={lead.id} onClick={() => setSelectedLead(lead)} className="text-sm cursor-pointer hover:bg-secondary/30 px-2 py-1.5 rounded transition-colors flex justify-between">
                      <span>{lead.name}</span>
                      <span className="text-xs text-muted-foreground">{lead.closeReason || "—"}</span>
                    </div>
                  ))}
                  {leads.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">None</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LeadDetail lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
