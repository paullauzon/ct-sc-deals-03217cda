import { useMemo, useState } from "react";
import { Lead, LeadStage } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { differenceInDays, parseISO, format } from "date-fns";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { StageGateGuard } from "@/components/lead-panel/dialogs/StageGateGuard";
import { ArrowRight, XCircle, Clock, AlertCircle, Inbox, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeStage } from "@/lib/leadUtils";

interface Props {
  leads: Lead[];
  ownerFilter: string;
  onSelectLead: (id: string) => void;
}

/**
 * Discovery Triage Inbox — surfaces all leads stuck in "Discovery Completed"
 * with no sample sent and no outcome recorded. The make-or-break gate of v2.
 *
 * Each row offers three forcing-function actions:
 *   - Promote to Sample Sent (opens StageGateGuard pre-filled with today's date)
 *   - Close Lost (opens StageGateGuard for Closed Lost)
 *   - Snooze 3d (push the open triage task)
 */
export function DiscoveryTriageTab({ leads, ownerFilter, onSelectLead }: Props) {
  const { updateLead } = useLeads();
  const [gateLead, setGateLead] = useState<Lead | null>(null);
  const [gateTarget, setGateTarget] = useState<LeadStage | null>(null);

  const stuck = useMemo(() => {
    const filtered = ownerFilter === "All" ? leads
      : ownerFilter === "Unassigned" ? leads.filter(l => !l.assignedTo)
      : leads.filter(l => l.assignedTo === ownerFilter);

    const now = new Date();
    return filtered
      .filter(l => normalizeStage(l.stage) === "Discovery Completed")
      .filter(l => !l.sampleSentDate?.trim() && !l.sampleOutcome?.trim())
      .map(l => {
        const stageEntered = l.stageEnteredDate ? parseISO(l.stageEnteredDate) : null;
        const daysStuck = stageEntered ? differenceInDays(now, stageEntered) : 0;
        const lastMeeting = (l.meetings || []).slice(-1)[0];
        const meetingDate = lastMeeting?.date ? parseISO(lastMeeting.date) : null;
        const daysSinceMeeting = meetingDate ? differenceInDays(now, meetingDate) : null;
        return { lead: l, daysStuck, lastMeeting, daysSinceMeeting };
      })
      .sort((a, b) => b.daysStuck - a.daysStuck);
  }, [leads, ownerFilter]);

  const handlePromote = (lead: Lead) => {
    setGateLead(lead);
    setGateTarget("Sample Sent");
  };

  const handleClose = (lead: Lead) => {
    setGateLead(lead);
    setGateTarget("Closed Lost");
  };

  const handleSnooze = async (lead: Lead) => {
    // Push any triage task on this lead by 3 days
    const newDue = new Date();
    newDue.setDate(newDue.getDate() + 3);
    const dueStr = newDue.toISOString().split("T")[0];

    const { data: tasks } = await supabase
      .from("lead_tasks")
      .select("id, task_type, title")
      .eq("lead_id", lead.id)
      .eq("status", "pending");

    const triageTasks = (tasks || []).filter((t: any) =>
      (t.task_type || "").toLowerCase().includes("triage") ||
      (t.title || "").toLowerCase().includes("sample") ||
      (t.title || "").toLowerCase().includes("graveyard")
    );

    if (triageTasks.length === 0) {
      toast.info("No triage task to snooze");
      return;
    }

    const ids = triageTasks.map((t: any) => t.id);
    const { error } = await supabase.from("lead_tasks").update({ due_date: dueStr }).in("id", ids);
    if (error) {
      toast.error("Snooze failed");
      return;
    }
    toast.success(`Snoozed ${triageTasks.length} task${triageTasks.length === 1 ? "" : "s"} 3 days`);
  };

  const handleGateCommit = async (updates: Partial<Lead>, targetStage: LeadStage) => {
    if (!gateLead) return;
    // Pre-fill sample_sent_date if promoting to Sample Sent and not already in updates
    const finalUpdates: Partial<Lead> = { ...updates };
    if (targetStage === "Sample Sent" && !finalUpdates.sampleSentDate) {
      finalUpdates.sampleSentDate = new Date().toISOString().split("T")[0];
    }
    updateLead(gateLead.id, finalUpdates);
    toast.success(`${gateLead.company || gateLead.name} → ${targetStage}`);
    setGateLead(null);
    setGateTarget(null);
  };

  if (stuck.length === 0) {
    return (
      <div className="border border-border rounded-lg px-6 py-12 mt-3 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium">Triage inbox clear</p>
        <p className="text-xs text-muted-foreground mt-1">
          No deals stuck after Discovery without a sample decision.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3" />
            <span>
              {stuck.length} discovery deal{stuck.length === 1 ? "" : "s"} awaiting sample / close decision
            </span>
          </div>
          <span className="uppercase tracking-wider text-[10px]">Triage to clear graveyard</span>
        </div>

        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {stuck.map(({ lead, daysStuck, lastMeeting, daysSinceMeeting }) => {
            const isStale = daysStuck > 14;
            return (
              <div
                key={lead.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/30 transition-colors"
              >
                <button
                  onClick={() => onSelectLead(lead.id)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left group"
                >
                  <CompanyAvatar
                    domain={lead.companyUrl || lead.email}
                    name={lead.company || lead.name}
                    size={24}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate group-hover:underline">
                        {lead.company || lead.name}
                      </span>
                      {isStale && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-px rounded bg-secondary text-foreground/80 font-medium">
                          Stale
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {daysStuck}d in stage
                      </span>
                      {lastMeeting && daysSinceMeeting !== null && (
                        <>
                          <span>·</span>
                          <span>Met {format(parseISO(lastMeeting.date), "MMM d")} ({daysSinceMeeting}d ago)</span>
                        </>
                      )}
                      {lead.assignedTo && (
                        <>
                          <span>·</span>
                          <span>{lead.assignedTo}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handlePromote(lead)}
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-foreground bg-foreground text-background hover:bg-foreground/90 transition-colors"
                    title="Promote to Sample Sent (today)"
                  >
                    <Target className="h-2.5 w-2.5" />
                    Sample Sent
                  </button>
                  <button
                    onClick={() => handleClose(lead)}
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                    title="Move to Closed Lost"
                  >
                    <XCircle className="h-2.5 w-2.5" />
                    Close Lost
                  </button>
                  <button
                    onClick={() => handleSnooze(lead)}
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-transparent text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                    title="Snooze triage task 3 days"
                  >
                    <ArrowRight className="h-2.5 w-2.5" />
                    Snooze 3d
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {gateLead && gateTarget && (
        <StageGateGuard
          lead={gateLead}
          targetStage={gateTarget}
          onCommit={handleGateCommit}
          onCancel={() => { setGateLead(null); setGateTarget(null); }}
        />
      )}
    </>
  );
}
