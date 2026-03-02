import { useState, DragEvent } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { LeadStage } from "@/types/lead";
import { LeadDetail } from "@/components/LeadsTable";
import { computeDaysInStage } from "@/lib/leadUtils";

const PIPELINE_STAGES: LeadStage[] = [
  "New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent",
];

const CLOSED_STAGES: LeadStage[] = ["Closed Won", "Closed Lost", "Went Dark"];

export function Pipeline() {
  const { getLeadsByStage, updateLead, leads } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const handleDragStart = (e: DragEvent, leadId: string) => {
    e.dataTransfer.setData("text/plain", leadId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDragLeave = () => setDragOverStage(null);

  const handleDrop = (e: DragEvent, targetStage: LeadStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData("text/plain");
    if (leadId) {
      updateLead(leadId, { stage: targetStage });
    }
  };

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Drag deals between stages</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">${leads.reduce((s, l) => s + l.dealValue, 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total pipeline value</p>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const leads = getLeadsByStage(stage);
          const totalValue = leads.reduce((s, l) => s + l.dealValue, 0);
          const isOver = dragOverStage === stage;
          return (
            <div
              key={stage}
              className={`min-w-[260px] flex-shrink-0 rounded-md p-2 transition-colors ${isOver ? "bg-secondary/50 ring-1 ring-foreground/20" : ""}`}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <div className="border-b-2 border-foreground pb-2 mb-3 flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wider">{stage}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{leads.length}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2 tabular-nums">${totalValue.toLocaleString()}</p>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {leads.map((lead) => {
                  const days = computeDaysInStage(lead.stageEnteredDate);
                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="border border-border rounded-md p-3 cursor-grab active:cursor-grabbing hover:bg-secondary/30 transition-colors space-y-1.5"
                    >
                      <div>
                        <p className="text-sm font-medium">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">{lead.company || "—"} · {lead.role}</p>
                      </div>
                      {lead.serviceInterest && lead.serviceInterest !== "TBD" && (
                        <p className="text-xs text-muted-foreground">{lead.serviceInterest}</p>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}</span>
                        <span>{lead.priority}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">{days}d in stage</span>
                        {lead.meetingOutcome && <span>{lead.meetingOutcome}</span>}
                      </div>
                      {lead.nextFollowUp && (
                        <p className="text-xs text-muted-foreground">Follow-up: {lead.nextFollowUp}</p>
                      )}
                    </div>
                  );
                })}
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
            const isOver = dragOverStage === stage;
            return (
              <div
                key={stage}
                className={`border border-border rounded-md p-4 transition-colors ${isOver ? "bg-secondary/50 ring-1 ring-foreground/20" : ""}`}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-wider">{stage}</span>
                  <span className="text-xs text-muted-foreground">{leads.length}</span>
                </div>
                <div className="space-y-1">
                  {leads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="text-sm cursor-grab active:cursor-grabbing hover:bg-secondary/30 px-2 py-1.5 rounded transition-colors flex justify-between items-center"
                    >
                      <span>{lead.name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {lead.dealValue > 0 && <span className="tabular-nums">${lead.dealValue.toLocaleString()}</span>}
                        <span>{lead.closeReason || "—"}</span>
                      </div>
                    </div>
                  ))}
                  {leads.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">None</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
