import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLeads } from "@/contexts/LeadContext";
import { useProcessing } from "@/contexts/ProcessingContext";
import { Lead, LeadStage } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { MeetingsSection } from "@/components/MeetingsSection";
import { EmailsSection } from "@/components/EmailsSection";
import { DealIntelligencePanel } from "@/components/DealIntelligencePanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchActivityLog, type ActivityLogEntry } from "@/lib/activityLog";
import { ArrowLeft, ArrowRight, Clock, GitCommit, MessageSquare, Calendar, Target, Shield, AlertTriangle, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const ACTIVE_STAGES: LeadStage[] = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"];

function DealProgressBar({ currentStage }: { currentStage: LeadStage }) {
  const currentIdx = ACTIVE_STAGES.indexOf(currentStage);
  const isClosed = ["Closed Won", "Closed Lost", "Went Dark"].includes(currentStage);
  return (
    <div className="space-y-1">
      <div className="flex gap-0.5">
        {ACTIVE_STAGES.map((stage, i) => (
          <div
            key={stage}
            className={cn(
              "h-2 flex-1 rounded-sm transition-colors",
              isClosed ? "bg-muted" : i <= currentIdx ? i === currentIdx ? "bg-primary" : "bg-primary/50" : "bg-muted"
            )}
            title={stage}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>New Lead</span>
        <span>{currentStage}</span>
        <span>Contract Sent</span>
      </div>
    </div>
  );
}

export default function DealRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { leads, updateLead, addMeeting } = useLeads();
  const lead = leads.find(l => l.id === id);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);

  useEffect(() => {
    if (id) {
      fetchActivityLog(id).then(setActivityLog);
    }
  }, [id]);

  if (!lead) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Deal not found</p>
          <button onClick={() => navigate("/")} className="text-sm text-muted-foreground hover:text-foreground underline">Back to pipeline</button>
        </div>
      </div>
    );
  }

  const days = computeDaysInStage(lead.stageEnteredDate);
  const save = (updates: Partial<Lead>) => updateLead(lead.id, updates);

  const momentum = lead.dealIntelligence?.momentumSignals?.momentum;
  const healthScore = lead.dealIntelligence?.winStrategy?.dealTemperature;
  const stakeholders = lead.dealIntelligence?.stakeholderMap || [];
  const risks = lead.dealIntelligence?.riskRegister || [];
  const actionItems = lead.dealIntelligence?.actionItemTracker || [];
  const unmitigatedRisks = risks.filter(r => r.mitigationStatus !== "Mitigated");
  const openActions = actionItems.filter(a => a.status === "Open" || a.status === "Overdue");
  const hasSidebarContent = stakeholders.length > 0 || unmitigatedRisks.length > 0 || openActions.length > 0 || lead.dealIntelligence?.winStrategy || lead.dealIntelligence?.buyingCommittee;

  // Prev/Next navigation
  const currentIdx = leads.findIndex(l => l.id === id);
  const prevLead = currentIdx > 0 ? leads[currentIdx - 1] : null;
  const nextLead = currentIdx < leads.length - 1 ? leads[currentIdx + 1] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="border-b border-border px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold truncate">{lead.name}</h1>
              <span className="text-xs font-mono px-1.5 py-0.5 border border-border rounded">{lead.brand === "Captarget" ? "CT" : "SC"}</span>
              <Badge variant="outline" className="text-xs">{lead.stage}</Badge>
              {momentum && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground")}>
                  {momentum}
                </span>
              )}
              {healthScore && (
                <span className="text-xs text-muted-foreground">{healthScore}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{lead.company} · {lead.role} · {days}d in stage · ${lead.dealValue.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            {lead.assignedTo && (
              <span className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold">{lead.assignedTo[0]}</span>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => prevLead && navigate(`/deal/${prevLead.id}`)}
                disabled={!prevLead}
                className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous deal"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => nextLead && navigate(`/deal/${nextLead.id}`)}
                disabled={!nextLead}
                className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next deal"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Deal Progress */}
      <div className="border-b border-border px-6 py-2">
        <div className="max-w-[1600px] mx-auto">
          <DealProgressBar currentStage={lead.stage} />
        </div>
      </div>

      {/* Three-Column Layout */}
      <div className="max-w-[1600px] mx-auto flex gap-0 min-h-[calc(100vh-120px)]">
        {/* Left: Deal Vitals */}
        <div className="w-72 shrink-0 border-r border-border p-4 space-y-4 overflow-y-auto">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Deal Value</p>
            <p className="text-xl font-bold tabular-nums">${lead.dealValue.toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stage</p>
              <p className="text-sm font-medium">{lead.stage}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Priority</p>
              <p className="text-sm font-medium">{lead.priority}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Forecast</p>
              <p className="text-sm">{lead.forecastCategory || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ICP Fit</p>
              <p className="text-sm">{lead.icpFit || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Owner</p>
              <p className="text-sm">{lead.assignedTo || "Unassigned"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Service</p>
              <p className="text-sm">{lead.serviceInterest}</p>
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Contact</p>
            <p className="text-sm">{lead.email}</p>
            {lead.phone && <p className="text-sm text-muted-foreground">{lead.phone}</p>}
            {lead.companyUrl && <p className="text-xs text-muted-foreground truncate">{lead.companyUrl}</p>}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Dates</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Submitted: {lead.dateSubmitted}</p>
              <p>Last Contact: {lead.lastContactDate || "—"}</p>
              <p>Next Follow-up: {lead.nextFollowUp || "—"}</p>
              {lead.contractStart && <p>Contract: {lead.contractStart} → {lead.contractEnd}</p>}
            </div>
          </div>
          {lead.subscriptionValue > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Revenue</p>
              <p className="text-sm font-medium tabular-nums">${lead.subscriptionValue.toLocaleString()} {lead.billingFrequency}</p>
            </div>
          )}

          {/* Deal Narrative */}
          {lead.dealIntelligence?.dealNarrative && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Deal Narrative</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{lead.dealIntelligence.dealNarrative}</p>
            </div>
          )}
        </div>

        {/* Center: Tabbed Workspace */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <Tabs defaultValue="timeline" className="h-full">
            <div className="border-b border-border px-4">
              <TabsList className="bg-transparent h-10">
                <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
                <TabsTrigger value="meetings" className="text-xs">Meetings ({lead.meetings?.length || 0})</TabsTrigger>
                <TabsTrigger value="intelligence" className="text-xs">Intelligence</TabsTrigger>
                <TabsTrigger value="emails" className="text-xs">Emails</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="timeline" className="p-4 space-y-2">
              {activityLog.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet</p>
              ) : (
                <div className="space-y-1">
                  {activityLog.map(entry => {
                    const icon = entry.event_type === "stage_change" ? <GitCommit className="h-3.5 w-3.5" /> :
                      entry.event_type === "meeting_added" ? <Calendar className="h-3.5 w-3.5" /> :
                      entry.event_type === "note_added" ? <MessageSquare className="h-3.5 w-3.5" /> :
                      <Clock className="h-3.5 w-3.5" />;
                    return (
                      <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5 text-muted-foreground">
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{entry.description}</p>
                          <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
            <TabsContent value="meetings" className="p-4">
              <MeetingsSection lead={lead} />
            </TabsContent>
            <TabsContent value="intelligence" className="p-4">
              {lead.dealIntelligence ? (
                <DealIntelligencePanel intel={lead.dealIntelligence} lead={lead} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No deal intelligence synthesized yet. Process meetings first.</p>
              )}
            </TabsContent>
            <TabsContent value="emails" className="p-4">
              <EmailsSection leadId={lead.id} />
            </TabsContent>
            <TabsContent value="notes" className="p-4">
              <Textarea
                value={lead.notes}
                onChange={(e) => save({ notes: e.target.value })}
                placeholder="Add notes about this deal..."
                rows={12}
                className="min-h-[300px]"
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Stakeholders, Risks, Actions */}
        <div className="w-80 shrink-0 border-l border-border p-4 space-y-4 overflow-y-auto">
          {/* Stakeholder Map */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Users className="h-3.5 w-3.5" /> Stakeholders ({stakeholders.length})
            </h3>
            {stakeholders.length > 0 ? (
              <div className="space-y-2">
                {stakeholders.map((s, i) => (
                  <div key={i} className="border border-border rounded-md p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{s.name}</p>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                        s.stance === "Champion" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                        s.stance === "Blocker" || s.stance === "Skeptic" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        "bg-secondary text-muted-foreground"
                      )}>
                        {s.stance}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.role} · {s.company}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{s.influence} influence · {s.mentions} mentions</p>
                    {s.concerns.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 italic">{s.concerns[0]}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No stakeholders mapped yet</p>
            )}
          </div>

          {/* Risk Register */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Shield className="h-3.5 w-3.5" /> Risks ({unmitigatedRisks.length} active)
            </h3>
            {unmitigatedRisks.length > 0 ? (
              <div className="space-y-1.5">
                {unmitigatedRisks.map((r, i) => (
                  <div key={i} className={cn("border rounded-md p-2 text-xs",
                    r.severity === "Critical" ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20" :
                    r.severity === "High" ? "border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20" :
                    "border-border"
                  )}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium">{r.severity}</span>
                      <span className="text-muted-foreground">{r.mitigationStatus}</span>
                    </div>
                    <p className="text-muted-foreground">{r.risk}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No active risks</p>
            )}
          </div>

          {/* Action Items */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Target className="h-3.5 w-3.5" /> Action Items ({openActions.length} open)
            </h3>
            {openActions.length > 0 ? (
              <div className="space-y-1.5">
                {openActions.map((a, i) => (
                  <div key={i} className={cn("border border-border rounded-md p-2 text-xs",
                    a.status === "Overdue" ? "border-red-300 dark:border-red-800" : ""
                  )}>
                    <p className="font-medium">{a.item}</p>
                    <div className="flex items-center justify-between mt-0.5 text-muted-foreground">
                      <span>{a.owner}</span>
                      <span className={a.status === "Overdue" ? "text-red-600 dark:text-red-400" : ""}>{a.status} · {a.deadline || "No deadline"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No open action items</p>
            )}
          </div>

          {/* Win Strategy */}
          {lead.dealIntelligence?.winStrategy && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Win Strategy</h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">#1 Closer</p>
                  <p>{lead.dealIntelligence.winStrategy.numberOneCloser}</p>
                </div>
                {lead.dealIntelligence.winStrategy.powerMove && (
                  <div>
                    <p className="font-medium text-foreground">Power Move</p>
                    <p>{lead.dealIntelligence.winStrategy.powerMove}</p>
                  </div>
                )}
                {lead.dealIntelligence.winStrategy.landmines?.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Landmines</p>
                    <ul className="list-disc list-inside">
                      {lead.dealIntelligence.winStrategy.landmines.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Buying Committee */}
          {lead.dealIntelligence?.buyingCommittee && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Buying Committee</h3>
              <div className="space-y-1 text-xs">
                {lead.dealIntelligence.buyingCommittee.decisionMaker && (
                  <p><span className="text-muted-foreground">Decision Maker:</span> <span className="font-medium">{lead.dealIntelligence.buyingCommittee.decisionMaker}</span></p>
                )}
                {lead.dealIntelligence.buyingCommittee.champion && (
                  <p><span className="text-muted-foreground">Champion:</span> <span className="font-medium">{lead.dealIntelligence.buyingCommittee.champion}</span></p>
                )}
                {lead.dealIntelligence.buyingCommittee.blockers?.length > 0 && (
                  <p><span className="text-muted-foreground">Blockers:</span> <span className="text-red-600 dark:text-red-400">{lead.dealIntelligence.buyingCommittee.blockers.join(", ")}</span></p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
