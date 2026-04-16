import { useState, useEffect, useCallback } from "react";
import { Lead, MeetingPrepBrief } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Clock, Calendar, Target, Shield, AlertTriangle, ChevronLeft, CheckCircle2, XCircle,
  Zap, Check, Loader2, Mail, AlertCircle, UserCheck, FileText, BarChart3, RefreshCw, Trash2, Save, Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getDroppedPromises, getNextBestAction, getUnifiedActionCount,
  markActionItemDone, getObjectionPlaybook,
} from "@/lib/dealHealthUtils";
import { useUnansweredEmails } from "@/hooks/useUnansweredEmails";
import { useLeadTasks } from "@/hooks/useLeadTasks";
import { PrepBriefDialog } from "@/components/MeetingsSection";

// ─── AI Draft Card ─────────────────────────────────────────────
function DraftCard({ content, onSave, onRegenerate, onDiscard, isRegenerating }: {
  content: string;
  onSave: (text: string) => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  isRegenerating?: boolean;
}) {
  const [editText, setEditText] = useState(content);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setEditText(content); setDirty(false); }, [content]);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">AI Draft</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(editText); toast.success("Copied to clipboard"); }}>
          <Copy className="h-3 w-3" /> Copy
        </Button>
      </div>
      <Textarea
        value={editText}
        onChange={e => { setEditText(e.target.value); setDirty(true); }}
        className="text-xs font-sans leading-relaxed min-h-[120px] bg-background/50"
      />
      <div className="flex items-center gap-2 justify-end">
        {dirty && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { onSave(editText); setDirty(false); toast.success("Draft saved"); }}>
            <Save className="h-3 w-3" /> Save
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onRegenerate} disabled={isRegenerating}>
          {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Regenerate
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={onDiscard}>
          <Trash2 className="h-3 w-3" /> Discard
        </Button>
      </div>
    </div>
  );
}

interface LeadActionsTabProps {
  lead: Lead;
  allLeads: Lead[];
  save: (updates: Partial<Lead>) => void;
  /** External trigger from QuickActionBar "Draft AI" — same key used to bind to NBA card */
  draftSignal?: number;
}

export function LeadActionsTab({ lead, allLeads, save, draftSignal }: LeadActionsTabProps) {
  const [showPrepDialog, setShowPrepDialog] = useState(false);
  const [prepBrief, setPrepBrief] = useState<MeetingPrepBrief | null>(null);
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [draftingPriority, setDraftingPriority] = useState<string | null>(null);
  const [draftedPriorityEmails, setDraftedPriorityEmails] = useState<Record<string, string>>({});

  const leadIdArray = lead?.id ? [lead.id] : [];
  const { unansweredIds } = useUnansweredEmails(leadIdArray);
  const { tasks: playbookTasks } = useLeadTasks(leadIdArray);

  // Load existing drafts
  useEffect(() => {
    if (!lead?.id) return;
    (async () => {
      const { data } = await supabase.from("lead_drafts").select("*").eq("lead_id", lead.id).eq("status", "draft");
      if (data && data.length > 0) {
        const loaded: Record<string, string> = {};
        (data as any[]).forEach(d => { loaded[d.action_key] = d.content; });
        setDraftedPriorityEmails(loaded);
      }
    })();
  }, [lead?.id]);

  const saveDraftToDb = useCallback(async (actionKey: string, content: string, draftType: string, contextLabel: string) => {
    if (!lead?.id) return;
    await supabase.from("lead_drafts").upsert({
      lead_id: lead.id, action_key: actionKey, content, draft_type: draftType,
      context_label: contextLabel, status: "draft", updated_at: new Date().toISOString(),
    } as any, { onConflict: "lead_id,action_key" });
  }, [lead?.id]);

  const discardDraft = useCallback(async (actionKey: string) => {
    if (!lead?.id) return;
    setDraftedPriorityEmails(prev => {
      const next = { ...prev };
      delete next[actionKey];
      return next;
    });
    await supabase.from("lead_drafts").update({ status: "discarded" } as any).eq("lead_id", lead.id).eq("action_key", actionKey);
    toast("Draft discarded");
  }, [lead?.id]);

  const handleGeneratePrep = async () => {
    setGeneratingPrep(true);
    setPrepBrief(null);
    setShowPrepDialog(true);
    try {
      const meetings = lead.meetings || [];
      const { data, error } = await supabase.functions.invoke("generate-meeting-prep", {
        body: {
          meetings,
          leadFields: {
            name: lead.name, company: lead.company, role: lead.role,
            stage: lead.stage, priority: lead.priority, dealValue: lead.dealValue,
            serviceInterest: lead.serviceInterest, brand: lead.brand,
          },
          dealIntelligence: lead.dealIntelligence || null,
        },
      });
      if (error) throw error;
      if (data?.brief) setPrepBrief(data.brief);
      else throw new Error("No brief generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate prep brief");
      setShowPrepDialog(false);
    } finally {
      setGeneratingPrep(false);
    }
  };

  const handleDraftPriorityAction = useCallback(async (actionKey: string, contextOverride?: string) => {
    setDraftingPriority(actionKey);
    try {
      const latestMeeting = lead.meetings?.filter(m => m.intelligence).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())?.[0];
      let aiActionType = "default";
      let actionSpecificContext = "";

      if (actionKey.startsWith("objection")) { aiActionType = "objection"; actionSpecificContext = contextOverride || "Address this objection directly with evidence."; }
      else if (actionKey.startsWith("waiting")) { aiActionType = "nudge"; actionSpecificContext = contextOverride || "They owe us something. Nudge with new value."; }
      else if (actionKey.startsWith("strategic")) { aiActionType = "strategic"; actionSpecificContext = contextOverride || "Expand the deal footprint."; }
      else if (actionKey.startsWith("playbook")) {
        const titleLower = (contextOverride || "").toLowerCase();
        if (titleLower.includes("agenda") || titleLower.includes("talking points")) aiActionType = "agenda";
        else if (titleLower.includes("recap") || titleLower.includes("post-meeting")) aiActionType = "post-meeting";
        else if (titleLower.includes("check-in") || titleLower.includes("no response")) aiActionType = "nudge";
        else if (titleLower.includes("re-engage") || titleLower.includes("breakup")) aiActionType = "re-engagement";
        else if (titleLower.includes("value-add")) aiActionType = "nudge";
        else if (titleLower.includes("question") || titleLower.includes("proposal")) aiActionType = "proposal-followup";
        else if (titleLower.includes("scarcity") || titleLower.includes("final attempt")) aiActionType = "re-engagement";
        actionSpecificContext = contextOverride || "";
      } else if (actionKey === "nba") {
        const nbaText = (contextOverride || "").toLowerCase();
        if (nbaText.includes("re-engage") || nbaText.includes("dark")) aiActionType = "re-engagement";
        else if (nbaText.includes("proposal")) aiActionType = "proposal-followup";
        else if (nbaText.includes("nudge") || nbaText.includes("waiting")) aiActionType = "nudge";
        else if (nbaText.includes("outreach") || nbaText.includes("first contact")) aiActionType = "outreach";
        actionSpecificContext = contextOverride || "";
      } else {
        const typeMap: Record<string, string> = {
          email: "post-meeting", dark: "re-engagement", followup: "post-meeting",
          stale: "outreach", renewal: "nudge",
        };
        aiActionType = typeMap[actionKey] || "default";
      }

      const contextMap: Record<string, string> = {
        email: `Reply to their unanswered email. Be direct and reference the conversation.`,
        dark: `Re-engage a prospect who has gone dark for ${lead.lastContactDate ? Math.floor((new Date().getTime() - new Date(lead.lastContactDate).getTime()) / 86400000) : "several"}+ days.`,
        followup: `Overdue follow-up was due ${lead.nextFollowUp}. Deliver something of value.`,
        stale: `First outreach to a new lead. Make it sharp and relevant to ${lead.company} in ${lead.geography || "their market"}.${lead.targetCriteria ? ` Criteria: ${lead.targetCriteria}.` : ""}${lead.targetRevenue ? ` Revenue target: ${lead.targetRevenue}.` : ""}`,
        renewal: `Contract ending ${lead.contractEnd}. Start renewal conversation.${lead.subscriptionValue ? ` Current value: $${lead.subscriptionValue.toLocaleString()}.` : ""}`,
      };
      const actionContext = contextOverride || contextMap[actionKey] || "Follow up on this deal.";
      const meetingPayload = latestMeeting
        ? { ...latestMeeting, actionSpecificContext: actionSpecificContext || actionContext }
        : { title: "Follow-up", date: new Date().toISOString().split("T")[0], intelligence: { summary: actionContext, nextSteps: [{ action: actionContext, owner: lead.assignedTo }] }, actionSpecificContext: actionSpecificContext || actionContext };

      const { data, error } = await supabase.functions.invoke("draft-followup", {
        body: {
          meeting: meetingPayload,
          leadFields: {
            name: lead.name, role: lead.role, company: lead.company, brand: lead.brand,
            serviceInterest: lead.serviceInterest, targetCriteria: lead.targetCriteria,
            targetRevenue: lead.targetRevenue, geography: lead.geography,
            stage: lead.stage, assignedTo: lead.assignedTo,
          },
          dealIntelligence: lead.dealIntelligence,
          actionType: aiActionType,
        },
      });
      if (error) throw error;
      setDraftedPriorityEmails(prev => ({ ...prev, [actionKey]: data.email }));
      const draftType = actionKey.startsWith("objection") ? "objection" : actionKey.startsWith("waiting") ? "nudge" : actionKey.startsWith("strategic") ? "strategic" : actionKey.startsWith("playbook") ? "playbook" : actionKey;
      saveDraftToDb(actionKey, data.email, draftType, actionContext.slice(0, 100));
    } catch {
      toast.error("Failed to generate draft");
    } finally {
      setDraftingPriority(null);
    }
  }, [lead, saveDraftToDb]);

  // Computed signals
  const dealHealth = lead.dealIntelligence;
  const droppedPromises = getDroppedPromises(lead);
  const isClosed = lead.stage === "Closed Won" || lead.stage === "Lost";
  const nextBestAction = isClosed ? null : getNextBestAction(lead);
  const actionItems = lead.dealIntelligence?.actionItemTracker || [];
  const completedActions = actionItems.filter(a => a.status === "Completed");

  const hasUnansweredEmail = unansweredIds.has(lead.id);
  const hasMeetingPrep = !!(lead.meetingDate && (() => {
    try {
      const d = new Date(lead.meetingDate);
      const diff = Math.floor((d.getTime() - new Date().getTime()) / 86400000);
      return diff >= 0 && diff <= 7;
    } catch { return false; }
  })());
  const unifiedCount = getUnifiedActionCount(lead, playbookTasks.length, { hasUnansweredEmail, hasMeetingPrep });

  const theyOweItems = (lead.dealIntelligence?.actionItemTracker || []).filter(
    (a: any) => (a.status === "Open" || a.status === "Overdue") && a.owner?.toLowerCase() === lead.name?.toLowerCase()
  );
  const openObjections = (lead.dealIntelligence?.objectionTracker || []).filter(
    (o: any) => o.status === "Open" || o.status === "Recurring"
  );

  const priorityActions: { icon: any; title: string; subtitle: string; type: string }[] = [];
  if (hasUnansweredEmail) priorityActions.push({ icon: Mail, title: `Reply to ${lead.name}'s email`, subtitle: "They reached out and are awaiting your reply", type: "email" });
  if (unifiedCount.breakdown.goingDark) {
    const daysSilent = lead.lastContactDate ? Math.floor((new Date().getTime() - new Date(lead.lastContactDate).getTime()) / 86400000) : 0;
    priorityActions.push({ icon: AlertCircle, title: `Re-engage — ${daysSilent}d since last contact`, subtitle: "Deal is going dark in active stage", type: "dark" });
  }
  if (hasMeetingPrep) {
    let dateStr = "upcoming";
    try { const d = new Date(lead.meetingDate); dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch {}
    priorityActions.push({ icon: FileText, title: `Prep for meeting ${dateStr}`, subtitle: "No prep brief generated yet", type: "prep" });
  }
  if (unifiedCount.breakdown.overdueFollowUp) {
    priorityActions.push({ icon: Clock, title: "Follow-up pending", subtitle: `Was due ${lead.nextFollowUp}`, type: "followup" });
  }
  if (unifiedCount.breakdown.staleNewLead) {
    priorityActions.push({ icon: Zap, title: "Make first contact", subtitle: "New lead with no outreach yet — 2+ days old", type: "stale" });
  }
  if (unifiedCount.breakdown.contractRenewal) {
    let daysToRenewal = 0;
    try { daysToRenewal = Math.floor((new Date(lead.contractEnd).getTime() - new Date().getTime()) / 86400000); } catch {}
    priorityActions.push({ icon: Calendar, title: `Renewal in ${daysToRenewal}d — start conversation`, subtitle: "Contract ending soon", type: "renewal" });
  }

  const strategicActions: { title: string; subtitle: string }[] = [];
  if (unifiedCount.breakdown.noChampion) strategicActions.push({ title: "Find a champion", subtitle: "No internal advocate identified among stakeholders" });
  if (unifiedCount.breakdown.logMeetingOutcome) strategicActions.push({ title: "Log meeting outcome", subtitle: "Meeting held but outcome not recorded — data hygiene" });
  if (unifiedCount.breakdown.sentimentDeclining) {
    const traj = lead.dealIntelligence?.momentumSignals?.sentimentTrajectory;
    strategicActions.push({ title: `Sentiment declining`, subtitle: traj ? `Was ${traj[0]}, now ${traj[traj.length - 1]}` : "Trend is downward across meetings" });
  }
  if (unifiedCount.breakdown.highIntent) {
    const subCount = Array.isArray((lead as any).submissions) ? (lead as any).submissions.length : 0;
    strategicActions.push({ title: `High intent — submitted ${subCount} times`, subtitle: "Prioritize outreach for this engaged prospect" });
  }

  // External draft trigger from QuickActionBar
  useEffect(() => {
    if (!draftSignal) return;
    if (nextBestAction) handleDraftPriorityAction("nba", `${nextBestAction.action}. Context: ${nextBestAction.reason}.`);
    else if (priorityActions[0]) handleDraftPriorityAction(priorityActions[0].type);
    else toast("Nothing urgent to draft", { description: "All actions are complete." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSignal]);

  return (
    <div className="p-6 mt-0 space-y-5 max-w-3xl mx-auto">
      {/* Next Best Action */}
      {nextBestAction && priorityActions.length === 0 && droppedPromises.length === 0 && (() => {
        const nbaKey = "nba";
        const isDrafting = draftingPriority === nbaKey;
        const draftedEmail = draftedPriorityEmails[nbaKey];
        return (
          <div className="space-y-2">
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next Best Action</span>
                  <p className="text-sm font-medium mt-0.5">{nextBestAction.action}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{nextBestAction.reason}</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => handleDraftPriorityAction(nbaKey, `${nextBestAction.action}. Context: ${nextBestAction.reason}. Draft an email that executes this action.`)} disabled={isDrafting}>
                  {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft"}
                </Button>
              </div>
            </div>
            {draftedEmail && (
              <div className="ml-11">
                <DraftCard content={draftedEmail}
                  onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [nbaKey]: text })); saveDraftToDb(nbaKey, text, "nba", nextBestAction.action.slice(0, 100)); }}
                  onRegenerate={() => handleDraftPriorityAction(nbaKey, `${nextBestAction.action}. Context: ${nextBestAction.reason}.`)}
                  onDiscard={() => discardDraft(nbaKey)} isRegenerating={isDrafting} />
              </div>
            )}
          </div>
        );
      })()}

      {/* Priority Actions */}
      {priorityActions.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Priority Actions
          </h3>
          <div className="space-y-2">
            {priorityActions.map((pa, i) => {
              const Icon = pa.icon;
              const isDrafting = draftingPriority === pa.type;
              const draftedEmail = draftedPriorityEmails[pa.type];
              const isPrep = pa.type === "prep";
              const isDraftable = ["email", "dark", "followup", "stale", "renewal"].includes(pa.type);
              const buttonLabels: Record<string, string> = { prep: "Generate Prep", email: "Draft Reply", dark: "Draft Re-engagement", followup: "Draft Follow-up", stale: "Draft Outreach", renewal: "Draft Renewal" };
              return (
                <div key={i} className="space-y-2">
                  <div className="rounded-lg border border-border bg-secondary/20 p-3 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-secondary text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{pa.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{pa.subtitle}</p>
                    </div>
                    {isPrep && (
                      <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={handleGeneratePrep} disabled={generatingPrep}>
                        {generatingPrep ? <Loader2 className="h-3 w-3 animate-spin" /> : buttonLabels[pa.type]}
                      </Button>
                    )}
                    {isDraftable && (
                      <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => handleDraftPriorityAction(pa.type)} disabled={isDrafting}>
                        {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : buttonLabels[pa.type]}
                      </Button>
                    )}
                  </div>
                  {draftedEmail && (
                    <div className="ml-10">
                      <DraftCard content={draftedEmail}
                        onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [pa.type]: text })); saveDraftToDb(pa.type, text, pa.type, pa.title.slice(0, 100)); }}
                        onRegenerate={() => handleDraftPriorityAction(pa.type)}
                        onDiscard={() => discardDraft(pa.type)} isRegenerating={isDrafting} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open Commitments */}
      {droppedPromises.length > 0 && (() => {
        const openActions = actionItems.filter(a => a.status === "Open" || a.status === "Overdue");
        return (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Open Commitments ({droppedPromises.length})
            </h3>
            <div className="space-y-2">
              {openActions.filter(a => a.owner?.toLowerCase() !== lead.name?.toLowerCase()).map((a, i) => {
                const origIdx = actionItems.indexOf(a);
                const now = new Date();
                let daysOverdue = 0;
                if (a.deadline) { try { daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(a.deadline).getTime()) / 86400000)); } catch {} }
                const commitKey = `commitment-${origIdx}`;
                const isDrafting = draftingPriority === commitKey;
                const draftedEmail = draftedPriorityEmails[commitKey];
                const handleDraft = () => handleDraftPriorityAction(commitKey, `We committed to "${a.item}" for ${lead.name}${a.deadline ? ` by ${a.deadline}` : ""}. Draft an email that fulfills or addresses this commitment directly.`);
                return (
                  <div key={i} className="space-y-2">
                    <div className={cn("rounded-lg border p-3 flex items-start gap-3 group", daysOverdue > 0 ? "border-destructive/30 bg-destructive/5" : "border-border")}>
                      <button onClick={() => { const updates = markActionItemDone(lead, origIdx); if (Object.keys(updates).length) { save(updates); toast.success(`Marked "${a.item.slice(0, 40)}" done`); } }}
                        className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center shrink-0 mt-0.5 hover:border-primary hover:bg-primary/10 transition-colors group-hover:border-primary/50" title="Mark done">
                        <Check className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.item}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {a.owner && <span>{a.owner}</span>}
                          {a.deadline && <span>Due: {a.deadline}</span>}
                          {daysOverdue > 0 && <span className="text-destructive font-medium">{daysOverdue}d pending</span>}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={handleDraft} disabled={isDrafting}>
                        {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft"}
                      </Button>
                    </div>
                    {draftedEmail && (
                      <div className="ml-9">
                        <DraftCard content={draftedEmail}
                          onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [commitKey]: text })); saveDraftToDb(commitKey, text, "commitment", a.item.slice(0, 100)); }}
                          onRegenerate={handleDraft} onDiscard={() => discardDraft(commitKey)} isRegenerating={isDrafting} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Playbook Tasks */}
      {playbookTasks.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Playbook Tasks ({playbookTasks.length})
          </h3>
          <div className="space-y-2">
            {playbookTasks.map((task) => {
              const pbKey = `playbook-${task.id}`;
              const isDrafting = draftingPriority === pbKey;
              const draftedEmail = draftedPriorityEmails[pbKey];
              const isEmail = task.task_type === "email";
              return (
                <div key={task.id} className="space-y-2">
                  <div className="rounded-lg border border-border p-3 flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{task.playbook}</span>
                        <span>Due: {task.due_date}</span>
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
                    </div>
                    {isEmail && (
                      <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => handleDraftPriorityAction(pbKey, `${task.title}. ${task.description || ""} The lead is in stage "${lead.stage}". Draft this email.`)} disabled={isDrafting}>
                        {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft"}
                      </Button>
                    )}
                  </div>
                  {draftedEmail && (
                    <div className="ml-8">
                      <DraftCard content={draftedEmail}
                        onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [pbKey]: text })); saveDraftToDb(pbKey, text, "playbook", task.title.slice(0, 100)); }}
                        onRegenerate={() => handleDraftPriorityAction(pbKey, `${task.title}. ${task.description || ""} The lead is in stage "${lead.stage}". Draft this email.`)}
                        onDiscard={() => discardDraft(pbKey)} isRegenerating={draftingPriority === pbKey} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Waiting on them */}
      {theyOweItems.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Waiting on Them ({theyOweItems.length})
          </h3>
          <div className="space-y-2">
            {theyOweItems.map((a, i) => {
              const waitKey = `waiting-${i}`;
              const isDrafting = draftingPriority === waitKey;
              const draftedEmail = draftedPriorityEmails[waitKey];
              return (
                <div key={i} className="space-y-2">
                  <div className="rounded-lg border border-border bg-secondary/10 p-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm"><span className="font-medium">{lead.name}</span> <span className="text-muted-foreground">owes:</span> "{a.item}"</p>
                      {a.deadline && <p className="text-xs text-muted-foreground mt-0.5">Due: {a.deadline}</p>}
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => handleDraftPriorityAction(waitKey, `The prospect (${lead.name}) committed to "${a.item}"${a.deadline ? ` by ${a.deadline}` : ""} but hasn't delivered. Draft a gentle nudge that adds new value or context.`)} disabled={isDrafting}>
                      {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft Nudge"}
                    </Button>
                  </div>
                  {draftedEmail && (
                    <div className="ml-4">
                      <DraftCard content={draftedEmail}
                        onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [waitKey]: text })); saveDraftToDb(waitKey, text, "nudge", `Nudge: ${a.item.slice(0, 80)}`); }}
                        onRegenerate={() => handleDraftPriorityAction(waitKey, `The prospect (${lead.name}) committed to "${a.item}"${a.deadline ? ` by ${a.deadline}` : ""} but hasn't delivered. Draft a gentle nudge that adds new value.`)}
                        onDiscard={() => discardDraft(waitKey)} isRegenerating={draftingPriority === waitKey} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Objections */}
      {openObjections.length > 0 && (() => {
        const playbookEntries = getObjectionPlaybook(lead, allLeads);
        const playbookMap = new Map(playbookEntries.map(p => [p.objection, p]));
        return (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Objections to Address ({openObjections.length})
            </h3>
            <div className="space-y-2">
              {openObjections.map((o: any, i: number) => {
                const match = playbookMap.get(o.objection);
                const objKey = `objection-${i}`;
                const isDrafting = draftingPriority === objKey;
                const draftedEmail = draftedPriorityEmails[objKey];
                return (
                  <div key={i} className="space-y-2">
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">"{o.objection}"</p>
                        <Badge variant="outline" className="text-[9px] shrink-0">{o.status}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {o.raisedIn && <span>Raised in: <span className="text-foreground/70">{o.raisedIn}</span></span>}
                        {o.raisedBy && <span>By: <span className="text-foreground/70">{o.raisedBy}</span></span>}
                      </div>
                      {match && (
                        <div className="rounded-md bg-emerald-500/5 border border-emerald-500/15 p-2 text-xs">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Won deal approach</span>
                          <span className="text-muted-foreground"> ({match.wonDealName}): </span>
                          <span className="text-foreground/80">{match.wonDealApproach}</span>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDraftPriorityAction(objKey, `Address this specific objection from the prospect: "${o.objection}". ${match ? `A similar won deal (${match.wonDealName}) handled this by: ${match.wonDealApproach}. Use a similar approach.` : "Provide a compelling, data-backed response."} Be specific.`)} disabled={isDrafting}>
                          {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft Response"}
                        </Button>
                      </div>
                    </div>
                    {draftedEmail && (
                      <div className="ml-4">
                        <DraftCard content={draftedEmail}
                          onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [objKey]: text })); saveDraftToDb(objKey, text, "objection", `Objection: ${o.objection.slice(0, 80)}`); }}
                          onRegenerate={() => handleDraftPriorityAction(objKey, `Address this specific objection from the prospect: "${o.objection}". ${match ? `A similar won deal (${match.wonDealName}) handled this by: ${match.wonDealApproach}.` : "Provide a compelling, data-backed response."}`)}
                          onDiscard={() => discardDraft(objKey)} isRegenerating={draftingPriority === objKey} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Strategic */}
      {strategicActions.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5" /> Strategic Actions
          </h3>
          <div className="space-y-2">
            {strategicActions.map((sa, i) => {
              const stratKey = `strategic-${i}`;
              const isDrafting = draftingPriority === stratKey;
              const draftedEmail = draftedPriorityEmails[stratKey];
              const contextMap: Record<string, string> = {
                "Find a champion": `We need to identify and cultivate an internal champion at ${lead.company}. Draft an email to a potential ally inside the organization.`,
                "Sentiment declining": `Sentiment is declining across recent meetings with ${lead.name}. Draft an email that resets the tone.`,
                "Log meeting outcome": `Meeting was held but outcome wasn't recorded. This is an internal reminder.`,
              };
              const defaultCtx = `Strategic action: "${sa.title}" — ${sa.subtitle}. Draft an email that advances this strategic goal.`;
              const isInternal = sa.title === "Log meeting outcome";
              return (
                <div key={i} className="space-y-2">
                  <div className="rounded-lg border border-border bg-secondary/10 p-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{sa.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{sa.subtitle}</p>
                    </div>
                    {!isInternal && (
                      <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => handleDraftPriorityAction(stratKey, contextMap[sa.title] || defaultCtx)} disabled={isDrafting}>
                        {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft"}
                      </Button>
                    )}
                  </div>
                  {draftedEmail && (
                    <div className="ml-4">
                      <DraftCard content={draftedEmail}
                        onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [stratKey]: text })); saveDraftToDb(stratKey, text, "strategic", sa.title.slice(0, 100)); }}
                        onRegenerate={() => handleDraftPriorityAction(stratKey, contextMap[sa.title] || defaultCtx)}
                        onDiscard={() => discardDraft(stratKey)} isRegenerating={draftingPriority === stratKey} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {unifiedCount.total === 0 && !nextBestAction && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500/40" />
          <p>All actions completed — deal is on track</p>
        </div>
      )}

      {/* Completed */}
      {completedActions.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full group pt-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/60" />
            <span>{completedActions.length} completed</span>
            <ChevronLeft className="h-3 w-3 ml-auto transition-transform group-data-[state=open]:rotate-[-90deg]" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1.5">
              {completedActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground py-1.5 pl-1">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500/50 mt-0.5" />
                  <span className="line-through opacity-60">{a.item}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <PrepBriefDialog open={showPrepDialog} onOpenChange={setShowPrepDialog} brief={prepBrief} loading={generatingPrep} leadName={lead.name} />
    </div>
  );
}
