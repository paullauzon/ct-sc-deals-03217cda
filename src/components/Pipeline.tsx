import { useState, useEffect, useRef, DragEvent } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { LeadStage, Lead } from "@/types/lead";
import { LeadDetail } from "@/components/LeadsTable";
import { computeDaysInStage } from "@/lib/leadUtils";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const ALL_STAGES: LeadStage[] = [
  "New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent",
  "Closed Won", "Closed Lost", "Went Dark",
];

const CLOSED_STAGES: LeadStage[] = ["Closed Won", "Closed Lost", "Went Dark"];

const OWNER_COLORS: Record<string, string> = {
  Malik: "bg-foreground text-background",
  Valeria: "bg-foreground/70 text-background",
  Tomos: "bg-foreground/40 text-background",
};

function OwnerBadge({ owner }: { owner: string }) {
  if (!owner) {
    return (
      <span className="w-6 h-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center text-[10px] text-muted-foreground/50 shrink-0" title="Unassigned">
        ?
      </span>
    );
  }
  const initial = owner[0];
  const colorClass = OWNER_COLORS[owner] || "bg-muted text-muted-foreground";
  return (
    <span
      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${colorClass}`}
      title={owner}
    >
      {initial}
    </span>
  );
}

export function Pipeline() {
  const { getLeadsByStage, updateLead, leads } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearchQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const matchesSearch = (lead: Lead) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [lead.name, lead.company, lead.role, lead.email, lead.serviceInterest, lead.notes]
      .some(f => f?.toLowerCase().includes(q));
  };

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
            <span className="text-sm text-muted-foreground tabular-nums">${leads.reduce((s, l) => s + l.dealValue, 0).toLocaleString()} total value</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Drag deals between stages</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deals… ⌘K"
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory">
        {ALL_STAGES.map((stage) => {
          const allStageLeads = getLeadsByStage(stage);
          const stageLeads = allStageLeads.filter(matchesSearch);
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
                <span className="text-xs text-muted-foreground tabular-nums">
                  {searchQuery ? `${stageLeads.length} of ${allStageLeads.length}` : stageLeads.length}
                </span>
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
                      {/* Row 1: Brand badge + Name + Owner initial */}
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-mono px-1 py-0.5 border border-border rounded shrink-0 mt-0.5">{brandAbbr}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.company || "—"} · {lead.role}</p>
                        </div>
                        <OwnerBadge owner={lead.assignedTo} />
                      </div>
                      {/* Row 2: Source */}
                      <p className="text-[10px] text-muted-foreground">{brandAbbr} · {sourceShort}</p>
                      {lead.isDuplicate && <p className="text-[10px] text-muted-foreground">⚑ Also via {lead.brand === "Captarget" ? "SC" : "CT"}</p>}
                      {/* Row 3: Service interest */}
                      {lead.serviceInterest && lead.serviceInterest !== "TBD" && (
                        <p className="text-xs text-muted-foreground">{lead.serviceInterest}</p>
                      )}
                      {/* Row 4: Value + Priority */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${lead.priority === "High" ? "bg-foreground/10 font-medium" : ""}`}>{lead.priority}</span>
                      </div>
                      {/* Row 5: Days in stage + meeting outcome */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className={`tabular-nums ${days > 14 ? "text-foreground font-medium" : ""}`}>{days}d in stage</span>
                        <div className="flex items-center gap-1.5">
                          {lead.meetings?.length > 0 && (
                            <div className="flex items-center gap-0.5">
                              <img src="/fireflies-icon.svg" alt="Meetings" className="w-3.5 h-3.5" />
                              <span className="text-[10px] tabular-nums font-medium">{lead.meetings.length}</span>
                            </div>
                          )}
                          {lead.meetingOutcome && <span>{lead.meetingOutcome}</span>}
                        </div>
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
