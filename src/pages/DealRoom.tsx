import { useState, useMemo, useEffect, useCallback } from "react";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useLeads } from "@/contexts/LeadContext";
import { useProcessing } from "@/contexts/ProcessingContext";
import { Lead, LeadStage, MeetingPrepBrief } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { MeetingsSection } from "@/components/MeetingsSection";
import { PrepBriefDialog } from "@/components/MeetingsSection";
import { EmailsSection } from "@/components/EmailsSection";
import { DealIntelligencePanel } from "@/components/DealIntelligencePanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchActivityLog, type ActivityLogEntry } from "@/lib/activityLog";
import { ArrowLeft, ArrowRight, Clock, GitCommit, MessageSquare, Calendar, Target, Shield, AlertTriangle, Users, ChevronLeft, ChevronRight, CalendarCheck, Heart, Crown, ShieldAlert, Trophy, TrendingUp, TrendingDown, CheckCircle2, XCircle, Zap, Check, Loader2, Copy, Mail, AlertCircle, UserCheck, FileText, BarChart3, RefreshCw, Trash2, Save, Archive, Linkedin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/BrandLogo";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { computeDealHealthScore, getWinLoseCard, getStakeholderCoverage, getDroppedPromises, findSimilarWonDeals, getNextBestAction, getUnifiedActionCount, markActionItemDone, getObjectionPlaybook } from "@/lib/dealHealthUtils";
import { useUnansweredEmails } from "@/hooks/useUnansweredEmails";
import { useLeadTasks } from "@/hooks/useLeadTasks";

// Reusable editable draft card with Save/Regenerate/Discard
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
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(editText); toast.success("Copied to clipboard"); }}>
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </div>
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { leads, loading, updateLead, addMeeting, archiveLead } = useLeads();
  const lead = leads.find(l => l.id === id);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  
  
  // Priority action states
  const [showPrepDialog, setShowPrepDialog] = useState(false);
  const [prepBrief, setPrepBrief] = useState<MeetingPrepBrief | null>(null);
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [draftingPriority, setDraftingPriority] = useState<string | null>(null);
  const [draftedPriorityEmails, setDraftedPriorityEmails] = useState<Record<string, string>>({});

  // Hooks must be called before any early returns
  const leadIdArray = useMemo(() => id ? [id] : [], [id]);
  const { unansweredIds } = useUnansweredEmails(leadIdArray);
  const { tasks: playbookTasks } = useLeadTasks(leadIdArray);

  // Load saved drafts from DB on mount
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from("lead_drafts").select("*").eq("lead_id", id).eq("status", "draft");
      if (data && data.length > 0) {
        const loaded: Record<string, string> = {};
        (data as any[]).forEach(d => { loaded[d.action_key] = d.content; });
        setDraftedPriorityEmails(loaded);
      }
    })();
  }, [id]);

  // Upsert draft to DB
  const saveDraftToDb = useCallback(async (actionKey: string, content: string, draftType: string, contextLabel: string) => {
    if (!id) return;
    await supabase.from("lead_drafts").upsert({
      lead_id: id,
      action_key: actionKey,
      content,
      draft_type: draftType,
      context_label: contextLabel,
      status: "draft",
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "lead_id,action_key" });
  }, [id]);

  const discardDraft = useCallback(async (actionKey: string) => {
    if (!id) return;
    setDraftedPriorityEmails(prev => {
      const next = { ...prev };
      delete next[actionKey];
      return next;
    });
    await supabase.from("lead_drafts").update({ status: "discarded" } as any).eq("lead_id", id).eq("action_key", actionKey);
    toast("Draft discarded");
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchActivityLog(id).then(setActivityLog);
    }
  }, [id]);

  if (!lead && loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading deal…</span>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Deal not found</p>
          <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")} className="text-sm text-muted-foreground hover:text-foreground underline">Back to pipeline</button>
        </div>
      </div>
    );
  }

  const days = computeDaysInStage(lead.stageEnteredDate);
  const save = (updates: Partial<Lead>) => updateLead(lead.id, updates);

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
      console.error("Prep brief error:", e);
      toast.error(e.message || "Failed to generate prep brief");
      setShowPrepDialog(false);
    } finally {
      setGeneratingPrep(false);
    }
  };

  const handleDraftPriorityAction = async (actionKey: string, contextOverride?: string) => {
    setDraftingPriority(actionKey);
    try {
      const latestMeeting = lead.meetings?.filter(m => m.intelligence).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())?.[0];

      // Derive the AI actionType from the action key
      let aiActionType = "default";
      let actionSpecificContext = "";

      if (actionKey.startsWith("objection")) {
        aiActionType = "objection";
        actionSpecificContext = contextOverride || "Address this objection directly with evidence.";
      } else if (actionKey.startsWith("waiting")) {
        aiActionType = "nudge";
        actionSpecificContext = contextOverride || "They owe us something. Nudge with new value.";
      } else if (actionKey.startsWith("strategic")) {
        aiActionType = "strategic";
        actionSpecificContext = contextOverride || "Expand the deal footprint.";
      } else if (actionKey.startsWith("playbook")) {
        // Derive from task title keywords
        const titleLower = (contextOverride || "").toLowerCase();
        if (titleLower.includes("agenda") || titleLower.includes("talking points")) aiActionType = "agenda";
        else if (titleLower.includes("recap") || titleLower.includes("post-meeting") || titleLower.includes("follow-up with recap")) aiActionType = "post-meeting";
        else if (titleLower.includes("check-in") || titleLower.includes("no response")) aiActionType = "nudge";
        else if (titleLower.includes("re-engage") || titleLower.includes("breakup")) aiActionType = "re-engagement";
        else if (titleLower.includes("value-add")) aiActionType = "nudge";
        else if (titleLower.includes("question") || titleLower.includes("proposal")) aiActionType = "proposal-followup";
        else if (titleLower.includes("scarcity") || titleLower.includes("final attempt")) aiActionType = "re-engagement";
        else aiActionType = "default";
        actionSpecificContext = contextOverride || "";
      } else if (actionKey === "nba") {
        const nbaText = (contextOverride || "").toLowerCase();
        if (nbaText.includes("re-engage") || nbaText.includes("dark")) aiActionType = "re-engagement";
        else if (nbaText.includes("proposal")) aiActionType = "proposal-followup";
        else if (nbaText.includes("nudge") || nbaText.includes("waiting")) aiActionType = "nudge";
        else if (nbaText.includes("outreach") || nbaText.includes("first contact")) aiActionType = "outreach";
        else aiActionType = "default";
        actionSpecificContext = contextOverride || "";
      } else {
        // Map from priority action types
        const typeMap: Record<string, string> = {
          email: "post-meeting",
          dark: "re-engagement",
          followup: "post-meeting",
          stale: "outreach",
          renewal: "nudge",
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

      // Build richer meeting context with action-specific details
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
      // Persist to DB
      const draftType = actionKey.startsWith("objection") ? "objection" : actionKey.startsWith("waiting") ? "nudge" : actionKey.startsWith("strategic") ? "strategic" : actionKey.startsWith("playbook") ? "playbook" : actionKey;
      saveDraftToDb(actionKey, data.email, draftType, actionContext.slice(0, 100));
    } catch (err) {
      toast.error("Failed to generate draft");
    } finally {
      setDraftingPriority(null);
    }
  };

  const momentum = lead.dealIntelligence?.momentumSignals?.momentum;
  const healthScore = lead.dealIntelligence?.winStrategy?.dealTemperature;
  const stakeholders = lead.dealIntelligence?.stakeholderMap || [];
  const risks = lead.dealIntelligence?.riskRegister || [];
  const actionItems = lead.dealIntelligence?.actionItemTracker || [];
  const unmitigatedRisks = risks.filter(r => r.mitigationStatus !== "Mitigated");
  const openActions = actionItems.filter(a => a.status === "Open" || a.status === "Overdue");
  const hasSidebarContent = stakeholders.length > 0 || unmitigatedRisks.length > 0 || openActions.length > 0 || lead.dealIntelligence?.winStrategy || lead.dealIntelligence?.buyingCommittee;

  const dealHealth = computeDealHealthScore(lead);
  const winLose = getWinLoseCard(lead);
  const coverage = getStakeholderCoverage(lead);
  const isClosed = lead.stage === "Closed Won" || lead.stage === "Closed Lost";
  const similarWon = isClosed ? [] : findSimilarWonDeals(lead, leads);
  const droppedPromises = getDroppedPromises(lead);
  const nextBestAction = isClosed ? null : getNextBestAction(lead);
  const completedActions = actionItems.filter(a => a.status === "Completed");

  // Compute unified action count
  const hasUnansweredEmail = id ? unansweredIds.has(id) : false;
  const hasMeetingPrep = !!(lead.meetingDate && (() => {
    try {
      const d = new Date(lead.meetingDate);
      const now = new Date();
      const diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
      return diff >= 0 && diff <= 7;
    } catch { return false; }
  })());
  const unifiedCount = getUnifiedActionCount(lead, playbookTasks.length, { hasUnansweredEmail, hasMeetingPrep });

  // Build structured action sections for the Actions tab
  const theyOweItems = (lead.dealIntelligence?.actionItemTracker || []).filter(
    (a: any) => (a.status === "Open" || a.status === "Overdue") && a.owner?.toLowerCase() === lead.name?.toLowerCase()
  );
  const openObjections = (lead.dealIntelligence?.objectionTracker || []).filter(
    (o: any) => o.status === "Open" || o.status === "Recurring"
  );

  // Priority actions: contextual signals that need immediate attention
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
    priorityActions.push({ icon: Clock, title: "Follow-up overdue", subtitle: `Was due ${lead.nextFollowUp}`, type: "followup" });
  }
  if (unifiedCount.breakdown.staleNewLead) {
    priorityActions.push({ icon: Zap, title: "Make first contact", subtitle: "New lead with no outreach yet — 2+ days old", type: "stale" });
  }
  if (unifiedCount.breakdown.contractRenewal) {
    let daysToRenewal = 0;
    try { daysToRenewal = Math.floor((new Date(lead.contractEnd).getTime() - new Date().getTime()) / 86400000); } catch {}
    priorityActions.push({ icon: Calendar, title: `Renewal in ${daysToRenewal}d — start conversation`, subtitle: "Contract ending soon", type: "renewal" });
  }

  // Strategic actions
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

  // Prev/Next navigation
  const currentIdx = leads.findIndex(l => l.id === id);
  const prevLead = currentIdx > 0 ? leads[currentIdx - 1] : null;
  const nextLead = currentIdx < leads.length - 1 ? leads[currentIdx + 1] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="border-b border-border px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center gap-4">
          <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <CompanyAvatar companyUrl={lead.companyUrl} email={lead.email} companyName={lead.company} size="md" />
              <h1 className="text-lg font-semibold truncate">{lead.name}</h1>
              <BrandLogo brand={lead.brand} size="md" />
              <Badge variant="outline" className="text-xs">{lead.stage}</Badge>
              {momentum && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground")}>
                  {momentum}
                </span>
              )}
              {dealHealth && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded flex items-center gap-1 font-medium",
                  dealHealth.color === "emerald" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                  dealHealth.color === "amber" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                  "bg-red-500/10 text-red-600 dark:text-red-400"
                )}>
                  <Heart className="h-3 w-3" /> {dealHealth.score} {dealHealth.label}
                </span>
              )}
              {coverage && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded flex items-center gap-1", coverage.colorClass)}>
                  {coverage.coverage === "no-champion" ? <ShieldAlert className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  {coverage.label}
                </span>
              )}
              {healthScore && !dealHealth && (
                <span className="text-xs text-muted-foreground">{healthScore}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{lead.company} · {lead.role} · {days}d in stage · ${lead.dealValue.toLocaleString()}</p>
            {lead.calendlyBookedAt && (
              <p className="text-xs text-primary flex items-center gap-1 mt-0.5">
                <CalendarCheck className="h-3 w-3 shrink-0" />
                {lead.calendlyEventName || "Calendly Meeting"}{lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration} min` : ""}
                {lead.meetingDate && (() => { try { const d = new Date(lead.meetingDate); return ` · ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`; } catch { return ""; } })()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lead.assignedTo && (
              <span className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold">{lead.assignedTo[0]}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
              onClick={() => setArchiveTarget({ id: lead.id, name: lead.name })}
            >
              <Archive className="h-3.5 w-3.5" /> Archive
            </Button>
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
            {lead.linkedinUrl ? (
              <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-[#0A66C2] hover:underline mt-1">
                <Linkedin className="h-3.5 w-3.5" />
                {lead.linkedinTitle || "LinkedIn Profile"}
              </a>
            ) : (
              <LinkedInOverride leadId={lead.id} onSuccess={(url, title) => {
                updateLead(lead.id, { linkedinUrl: url, linkedinTitle: title || "" });
              }} />
            )}
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
          {winLose && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1"><Crown className="h-3 w-3" /> Win / Lose</p>
              <div className="space-y-1.5 text-xs">
                <p className="text-emerald-600 dark:text-emerald-400">✓ {winLose.win}</p>
                <p className="text-red-600 dark:text-red-400">✗ {winLose.lose}</p>
                <p className="font-medium text-foreground">→ {winLose.doNext}</p>
              </div>
            </div>
          )}

          {/* Deal Narrative */}
          {lead.dealIntelligence?.dealNarrative && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Deal Narrative</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{lead.dealIntelligence.dealNarrative}</p>
            </div>
          )}

          {/* Similar Deals Won */}
          {similarWon.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1"><Trophy className="h-3 w-3" /> Similar Won ({similarWon.length})</p>
              <div className="space-y-1.5">
                {similarWon.slice(0, 3).map((s, i) => (
                  <div key={i} className="text-xs">
                    <p className="font-medium">{s.name} · ${s.dealValue.toLocaleString()}/mo</p>
                    <p className="text-[10px] text-muted-foreground">{s.winTactic}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: Tabbed Workspace */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <Tabs defaultValue={searchParams.get("tab") || (isClosed ? "debrief" : unifiedCount.total > 0 ? "actions" : "timeline")} className="h-full">
            <div className="border-b border-border px-4">
              <TabsList className="bg-transparent h-10">
                {isClosed && <TabsTrigger value="debrief" className="text-xs">Debrief</TabsTrigger>}
                {!isClosed && <TabsTrigger value="actions" className="text-xs">Actions {unifiedCount.total > 0 ? `(${unifiedCount.total})` : ""}</TabsTrigger>}
                <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
                <TabsTrigger value="meetings" className="text-xs">Meetings ({lead.meetings?.length || 0})</TabsTrigger>
                <TabsTrigger value="intelligence" className="text-xs">Intelligence</TabsTrigger>
                <TabsTrigger value="emails" className="text-xs">Emails</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
              </TabsList>
            </div>
            {/* Win/Loss Debrief Tab */}
            {isClosed && (
              <TabsContent value="debrief" className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  {lead.stage === "Closed Won" ? <Trophy className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                  <h2 className="text-lg font-semibold">{lead.stage === "Closed Won" ? "Win" : "Loss"} Debrief — {lead.name}</h2>
                </div>

                {/* Outcome Summary */}
                <div className={cn("rounded-lg p-4 space-y-2", lead.stage === "Closed Won" ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-red-500/5 border border-red-500/20")}>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><span className="text-muted-foreground block text-xs">Deal Value</span><span className="font-medium">${lead.subscriptionValue > 0 ? lead.subscriptionValue.toLocaleString() : lead.dealValue.toLocaleString()}{lead.billingFrequency ? `/${lead.billingFrequency}` : "/mo"}</span></div>
                    <div><span className="text-muted-foreground block text-xs">Meetings</span><span className="font-medium">{lead.meetings?.length || 0}</span></div>
                    <div><span className="text-muted-foreground block text-xs">Cycle Days</span><span className="font-medium">{lead.closedDate && lead.dateSubmitted ? Math.max(1, Math.floor((new Date(lead.closedDate).getTime() - new Date(lead.dateSubmitted).getTime()) / 86400000)) : "—"}</span></div>
                  </div>
                  {lead.stage === "Closed Won" && lead.wonReason && <p className="text-sm"><span className="text-muted-foreground">Won because: </span>{lead.wonReason}</p>}
                  {lead.stage === "Closed Lost" && lead.lostReason && <p className="text-sm"><span className="text-muted-foreground">Lost because: </span>{lead.lostReason}</p>}
                </div>

                {/* What Went Right / Wrong */}
                {lead.dealIntelligence && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><TrendingUp className="h-3.5 w-3.5" /> What Went Right</div>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {lead.dealIntelligence.winStrategy?.numberOneCloser && <li>✓ {lead.dealIntelligence.winStrategy.numberOneCloser}</li>}
                        {(lead.dealIntelligence.stakeholderMap || []).some(s => s.stance === "Champion") && <li>✓ Internal champion identified</li>}
                        {lead.dealIntelligence.momentumSignals?.momentum === "Accelerating" && <li>✓ Deal maintained accelerating momentum</li>}
                        {(lead.dealIntelligence.actionItemTracker || []).filter(a => a.status === "Completed").length > 0 && <li>✓ {(lead.dealIntelligence.actionItemTracker || []).filter(a => a.status === "Completed").length} action items completed</li>}
                        {(lead.dealIntelligence.objectionTracker || []).filter(o => o.status === "Addressed").length > 0 && <li>✓ {(lead.dealIntelligence.objectionTracker || []).filter(o => o.status === "Addressed").length} objections resolved</li>}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400"><TrendingDown className="h-3.5 w-3.5" /> What Could Improve</div>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {droppedPromises.length > 0 && <li>⚠ {droppedPromises.length} action items never completed</li>}
                        {!(lead.dealIntelligence.stakeholderMap || []).some(s => s.stance === "Champion") && <li>⚠ No champion identified — single-threaded risk</li>}
                        {(lead.dealIntelligence.objectionTracker || []).filter(o => o.status === "Open" || o.status === "Recurring").length > 0 && <li>⚠ {(lead.dealIntelligence.objectionTracker || []).filter(o => o.status === "Open" || o.status === "Recurring").length} objections unresolved</li>}
                        {(lead.dealIntelligence.riskRegister || []).filter(r => r.mitigationStatus !== "Mitigated").length > 0 && <li>⚠ {(lead.dealIntelligence.riskRegister || []).filter(r => r.mitigationStatus !== "Mitigated").length} risks unmitigated</li>}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Deal Narrative */}
                {lead.dealIntelligence?.dealNarrative && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Deal Narrative</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{lead.dealIntelligence.dealNarrative}</p>
                  </div>
                )}
              </TabsContent>
            )}

            {/* Actions Tab */}
            {!isClosed && (
              <TabsContent value="actions" className="p-4 space-y-5">
                {/* Next Best Action highlight */}
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
                          <DraftCard
                            content={draftedEmail}
                            onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [nbaKey]: text })); saveDraftToDb(nbaKey, text, "nba", nextBestAction.action.slice(0, 100)); }}
                            onRegenerate={() => handleDraftPriorityAction(nbaKey, `${nextBestAction.action}. Context: ${nextBestAction.reason}. Draft an email that executes this action.`)}
                            onDiscard={() => discardDraft(nbaKey)}
                            isRegenerating={draftingPriority === nbaKey}
                          />
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
                        const buttonLabels: Record<string, string> = {
                          prep: "Generate Prep",
                          email: "Draft Reply",
                          dark: "Draft Re-engagement",
                          followup: "Draft Follow-up",
                          stale: "Draft Outreach",
                          renewal: "Draft Renewal",
                        };
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
                                <DraftCard
                                  content={draftedEmail}
                                  onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [pa.type]: text })); saveDraftToDb(pa.type, text, pa.type, pa.title.slice(0, 100)); }}
                                  onRegenerate={() => handleDraftPriorityAction(pa.type)}
                                  onDiscard={() => discardDraft(pa.type)}
                                  isRegenerating={draftingPriority === pa.type}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Open Commitments (our action items from transcripts) */}
                {droppedPromises.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" /> Open Commitments ({droppedPromises.length})
                    </h3>
                    <div className="space-y-2">
                      {openActions.filter(a => a.owner?.toLowerCase() !== lead.name?.toLowerCase()).map((a, i) => {
                        const origIdx = actionItems.indexOf(a);
                        const now = new Date();
                        let daysOverdue = 0;
                        if (a.deadline) {
                          try { daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(a.deadline).getTime()) / 86400000)); } catch {}
                        }
                        const commitKey = `commitment-${origIdx}`;
                        const isDrafting = draftingPriority === commitKey;
                        const draftedEmail = draftedPriorityEmails[commitKey];

                        const handleDraft = () => handleDraftPriorityAction(commitKey, `We committed to "${a.item}" for ${lead.name}${a.deadline ? ` by ${a.deadline}` : ""}. Draft an email that fulfills or addresses this commitment directly.`);

                        return (
                          <div key={i} className="space-y-2">
                            <div className={cn("rounded-lg border p-3 flex items-start gap-3 group",
                              daysOverdue > 0 ? "border-destructive/30 bg-destructive/5" : "border-border"
                            )}>
                              <button
                                onClick={() => {
                                  const updates = markActionItemDone(lead, origIdx);
                                  if (Object.keys(updates).length) {
                                    save(updates);
                                    toast.success(`Marked "${a.item.slice(0, 40)}" done`);
                                  }
                                }}
                                className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center shrink-0 mt-0.5 hover:border-primary hover:bg-primary/10 transition-colors group-hover:border-primary/50"
                                title="Mark done"
                              >
                                <Check className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{a.item}</p>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  {a.owner && <span>{a.owner}</span>}
                                  {a.deadline && <span>Due: {a.deadline}</span>}
                                  {daysOverdue > 0 && (
                                    <span className="text-destructive font-medium">{daysOverdue}d overdue</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs shrink-0"
                                onClick={handleDraft}
                                disabled={isDrafting}
                              >
                                {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft"}
                              </Button>
                            </div>
                            {draftedEmail && (
                              <div className="ml-9">
                                <DraftCard
                                  content={draftedEmail}
                                  onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [commitKey]: text })); saveDraftToDb(commitKey, text, "commitment", a.item.slice(0, 100)); }}
                                  onRegenerate={handleDraft}
                                  onDiscard={() => discardDraft(commitKey)}
                                  isRegenerating={isDrafting}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                                <DraftCard
                                  content={draftedEmail}
                                  onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [pbKey]: text })); saveDraftToDb(pbKey, text, "playbook", task.title.slice(0, 100)); }}
                                  onRegenerate={() => handleDraftPriorityAction(pbKey, `${task.title}. ${task.description || ""} The lead is in stage "${lead.stage}". Draft this email.`)}
                                  onDiscard={() => discardDraft(pbKey)}
                                  isRegenerating={draftingPriority === pbKey}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Waiting on Them */}
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
                              <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => handleDraftPriorityAction(waitKey, `The prospect (${lead.name}) committed to "${a.item}"${a.deadline ? ` by ${a.deadline}` : ""} but hasn't delivered. Draft a gentle nudge that adds new value or context rather than just asking "did you get a chance to...". Reference something specific to keep the conversation moving forward.`)} disabled={isDrafting}>
                                {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft Nudge"}
                              </Button>
                            </div>
                            {draftedEmail && (
                              <div className="ml-4">
                                <DraftCard
                                  content={draftedEmail}
                                  onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [waitKey]: text })); saveDraftToDb(waitKey, text, "nudge", `Nudge: ${a.item.slice(0, 80)}`); }}
                                  onRegenerate={() => handleDraftPriorityAction(waitKey, `The prospect (${lead.name}) committed to "${a.item}"${a.deadline ? ` by ${a.deadline}` : ""} but hasn't delivered. Draft a gentle nudge that adds new value or context rather than just asking "did you get a chance to...". Reference something specific to keep the conversation moving forward.`)}
                                  onDiscard={() => discardDraft(waitKey)}
                                  isRegenerating={draftingPriority === waitKey}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Objections to Address */}
                {openObjections.length > 0 && (() => {
                  const playbookEntries = getObjectionPlaybook(lead, leads);
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
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDraftPriorityAction(objKey, `Address this specific objection from the prospect: "${o.objection}". ${match ? `A similar won deal (${match.wonDealName}) handled this by: ${match.wonDealApproach}. Use a similar approach.` : "Provide a compelling, data-backed response."} Be specific and address their concern directly.`)} disabled={isDrafting}>
                                  {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Draft Response"}
                                </Button>
                              </div>
                            </div>
                            {draftedEmail && (
                              <div className="ml-4">
                                <DraftCard
                                  content={draftedEmail}
                                  onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [objKey]: text })); saveDraftToDb(objKey, text, "objection", `Objection: ${o.objection.slice(0, 80)}`); }}
                                  onRegenerate={() => handleDraftPriorityAction(objKey, `Address this specific objection from the prospect: "${o.objection}". ${match ? `A similar won deal (${match.wonDealName}) handled this by: ${match.wonDealApproach}. Use a similar approach.` : "Provide a compelling, data-backed response."} Be specific and address their concern directly.`)}
                                  onDiscard={() => discardDraft(objKey)}
                                  isRegenerating={draftingPriority === objKey}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })()}

                {/* Strategic Actions */}
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
                          "Find a champion": `We need to identify and cultivate an internal champion at ${lead.company}. Draft an email to a potential ally inside the organization who could advocate for this deal internally. Reference shared goals and mutual benefit.`,
                          "Sentiment declining": `Sentiment is declining across recent meetings with ${lead.name}. Draft an email that resets the tone, acknowledges any concerns indirectly, and re-anchors on the value we deliver. Don't be defensive.`,
                          "Log meeting outcome": `Meeting was held but outcome wasn't recorded. This is an internal reminder — no email needed.`,
                        };
                        const defaultCtx = `Strategic action: "${sa.title}" — ${sa.subtitle}. Draft an email to ${lead.name} at ${lead.company} that advances this strategic goal.`;
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
                                <DraftCard
                                  content={draftedEmail}
                                  onSave={(text) => { setDraftedPriorityEmails(prev => ({ ...prev, [stratKey]: text })); saveDraftToDb(stratKey, text, "strategic", sa.title.slice(0, 100)); }}
                                  onRegenerate={() => handleDraftPriorityAction(stratKey, contextMap[sa.title] || defaultCtx)}
                                  onDiscard={() => discardDraft(stratKey)}
                                  isRegenerating={draftingPriority === stratKey}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {unifiedCount.total === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500/40" />
                    <p>All actions completed — deal is on track</p>
                  </div>
                )}

                {/* Completed Items */}
                {completedActions.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full group">
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
              </TabsContent>
            )}

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

        {/* Right: Stakeholders, Risks, Actions — only if content exists */}
        {hasSidebarContent && (
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
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
                {openActions.map((a, i) => {
                  const origIdx = actionItems.indexOf(a);
                  return (
                    <div key={i} className={cn("border border-border rounded-md p-2 text-xs group",
                      a.status === "Overdue" ? "border-red-300 dark:border-red-800" : ""
                    )}>
                      <div className="flex items-start gap-1.5">
                        <button
                          onClick={() => {
                            const updates = markActionItemDone(lead, origIdx);
                            if (Object.keys(updates).length) {
                              save(updates);
                              toast.success(`Done: "${a.item.slice(0, 30)}…"`);
                            }
                          }}
                          className="w-4 h-4 rounded border border-muted-foreground/30 flex items-center justify-center shrink-0 mt-0.5 hover:border-primary hover:bg-primary/10 transition-colors"
                          title="Mark done"
                        >
                          <Check className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{a.item}</p>
                          <div className="flex items-center justify-between mt-0.5 text-muted-foreground">
                            <span>{a.owner}</span>
                            <span className={a.status === "Overdue" ? "text-red-600 dark:text-red-400" : ""}>{a.status} · {a.deadline || "No deadline"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
        )}
      </div>
      <PrepBriefDialog open={showPrepDialog} onOpenChange={setShowPrepDialog} brief={prepBrief} loading={generatingPrep} leadName={lead.name} />
      <ArchiveDialog
        open={!!archiveTarget}
        leadName={archiveTarget?.name || ""}
        onConfirm={(reason) => { if (archiveTarget) { archiveLead(archiveTarget.id, reason); setArchiveTarget(null); navigate("/"); } }}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}
