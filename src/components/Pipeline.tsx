import { useState, DragEvent } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { LeadStage } from "@/types/lead";
import { LeadDetail } from "@/components/LeadsTable";
import { computeDaysInStage } from "@/lib/leadUtils";

const ALL_STAGES: LeadStage[] = [
  "New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent",
  "Closed Won", "Closed Lost", "Went Dark",
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

  const isClosed = (stage: LeadStage) => CLOSED_STAGES.includes(stage);

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <span className="text-sm text-muted-foreground tabular-nums">${leads.reduce((s, l) => s + l.dealValue, 0).toLocaleString()} total value</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Drag deals between stages</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory">
        {ALL_STAGES.map((stage) => {
          const stageLeads = getLeadsByStage(stage);
          const totalValue = stageLeads.reduce((s, l) => s + l.dealValue, 0);
          const isOver = dragOverStage === stage;
          const closed = isClosed(stage);
          return (
            <div
              key={stage}
              className={`min-w-[280px] flex-shrink-0 snap-start rounded-md p-2 transition-colors ${closed ? "bg-muted/30" : ""} ${isOver ? "bg-secondary/50 ring-1 ring-foreground/20" : ""}`}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <div className="border-b-2 border-foreground pb-2 mb-3 flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wider">{stage}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{stageLeads.length}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2 tabular-nums">${totalValue.toLocaleString()}</p>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {stageLeads.map((lead) => {
                  const days = computeDaysInStage(lead.stageEnteredDate);
                  const brandAbbr = lead.brand === "Captarget" ? "CT" : "SC";
                  const sourceShort = lead.source.replace("CT ", "").replace("SC ", "");
                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="border border-border rounded-md p-3 cursor-grab active:cursor-grabbing hover:bg-secondary/30 transition-colors space-y-1.5"
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-mono px-1 py-0.5 border border-border rounded shrink-0 mt-0.5">{brandAbbr}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.company || "—"} · {lead.role}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{brandAbbr} · {sourceShort}</p>
                      {lead.isDuplicate && <p className="text-[10px] text-muted-foreground">⚑ Cross-brand duplicate</p>}
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
                      {closed && lead.closeReason && (
                        <p className="text-xs text-muted-foreground">Reason: {lead.closeReason}</p>
                      )}
                      {lead.nextFollowUp && (
                        <p className="text-xs text-muted-foreground">Follow-up: {lead.nextFollowUp}</p>
                      )}
                    </div>
                  );
                })}
                {stageLeads.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 py-4 text-center">No deals</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
