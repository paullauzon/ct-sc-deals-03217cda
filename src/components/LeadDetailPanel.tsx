import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLeads } from "@/contexts/LeadContext";
import { Lead, LeadStage } from "@/types/lead";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { computeDaysInStage } from "@/lib/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import { MeetingsSection } from "@/components/MeetingsSection";
import { EmailsSection } from "@/components/EmailsSection";
import { DealIntelligencePanel } from "@/components/DealIntelligencePanel";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import {
  Activity as ActivityIcon, Calendar, Mail, Brain, FolderOpen, MessageSquare,
  Zap, Trophy, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
} from "lucide-react";
import { LeadPanelHeader } from "./lead-panel/LeadPanelHeader";
import { LeadPanelLeftRail } from "./lead-panel/LeadPanelLeftRail";
import { LeadPanelRightRail } from "./lead-panel/LeadPanelRightRail";
import { LeadActivityTab } from "./lead-panel/LeadActivityTab";
import { LeadFilesTab } from "./lead-panel/LeadFilesTab";
import { LeadActionsTab } from "./lead-panel/LeadActionsTab";
import { LeadDebriefTab } from "./lead-panel/LeadDebriefTab";
import { LeadNotesTab } from "./lead-panel/LeadNotesTab";
import { DealHealthAlerts } from "./lead-panel/shared";
import { NoteDialog } from "./lead-panel/dialogs/NoteDialog";
import { TaskDialog } from "./lead-panel/dialogs/TaskDialog";
import { LogCallDialog } from "./lead-panel/dialogs/LogCallDialog";
import { EmailComposeDrawer } from "./lead-panel/dialogs/EmailComposeDrawer";
import { KeyboardCheatsheet } from "./lead-panel/KeyboardCheatsheet";

interface LeadDetailPanelProps {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
  /** "sheet" (default) renders inside an overlay; "page" renders in-place for /deal/:id */
  mode?: "sheet" | "page";
  /** Optional ordered list of lead IDs to enable prev/next navigation; defaults to all leads order */
  leadOrder?: string[];
  /** Called when prev/next is invoked. If omitted, internal navigation is used. */
  onNavigate?: (id: string) => void;
}

export function LeadDetailPanel({ leadId, open, onClose, mode = "sheet", leadOrder, onNavigate }: LeadDetailPanelProps) {
  const { leads, updateLead, archiveLead } = useLeads();
  const navigate = useNavigate();
  // Internal lead override — lets prev/next swap the displayed lead without parent cooperation
  const [internalLeadId, setInternalLeadId] = useState<string | null>(leadId);
  useEffect(() => { setInternalLeadId(leadId); }, [leadId]);
  const activeLeadId = internalLeadId ?? leadId;
  const lead = leads.find(l => l.id === activeLeadId) || null;

  const [enriching, setEnriching] = useState(false);
  const [draftingAI, setDraftingAI] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("activity");
  const [draftSignal, setDraftSignal] = useState(0);
  // Density toggle persists across sessions; "comfortable" is default for premium feel.
  const [density, setDensity] = useState<"compact" | "comfortable">(() => {
    if (typeof window === "undefined") return "comfortable";
    return (localStorage.getItem("lead-panel-density") as any) === "compact" ? "compact" : "comfortable";
  });
  useEffect(() => { localStorage.setItem("lead-panel-density", density); }, [density]);

  // Dialogs
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [emailDrawerOpen, setEmailDrawerOpen] = useState(false);
  const [emailDrawerPreset, setEmailDrawerPreset] = useState<"follow-up" | "default" | undefined>(undefined);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Email count for tab badge
  const [emailCount, setEmailCount] = useState<number>(0);

  // Prev/next navigation order
  const order = useMemo(() => leadOrder && leadOrder.length > 0 ? leadOrder : leads.map(l => l.id), [leadOrder, leads]);
  const idx = activeLeadId ? order.indexOf(activeLeadId) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < order.length - 1;
  const goTo = (id: string) => {
    if (onNavigate) onNavigate(id);
    else if (mode === "page") navigate(`/deal/${id}`);
    else setInternalLeadId(id); // sheet-mode internal swap
  };
  const onPrev = () => { if (hasPrev) goTo(order[idx - 1]); };
  const onNext = () => { if (hasNext) goTo(order[idx + 1]); };

  useEffect(() => {
    if (open) setActiveTab("activity");
  }, [activeLeadId, open]);

  // Fetch email count for tab label
  useEffect(() => {
    if (!activeLeadId) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", activeLeadId);
      if (!cancelled && typeof count === "number") setEmailCount(count);
    })();
    return () => { cancelled = true; };
  }, [activeLeadId]);

  // Keyboard shortcuts (only when open and not typing in input)
  useEffect(() => {
    if (!open) return;
    const isTyping = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    };
    const hasTextSelection = () => {
      const sel = window.getSelection?.();
      return !!(sel && sel.toString().trim().length > 0);
    };
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      // Cmd/Ctrl shortcuts
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "[") { e.preventDefault(); onPrev(); return; }
        if (e.key === "]") { e.preventDefault(); onNext(); return; }
        return;
      }
      // `?` (Shift+/) opens cheatsheet — handled before the shift early-return
      if (e.key === "?") { e.preventDefault(); setShortcutsOpen(true); return; }
      // Modifier-free single keys (avoid clashing with cmd+k)
      if (e.altKey || e.shiftKey) return;
      // Don't hijack tab keys when user is selecting text (Cmd-C UX)
      if (hasTextSelection()) return;
      // Bracket toggles for left/right rails (no modifier)
      if (e.key === "[") { e.preventDefault(); setLeftOpen(v => !v); return; }
      if (e.key === "]") { e.preventDefault(); setRightOpen(v => !v); return; }
      switch (e.key.toLowerCase()) {
        case "a": setActiveTab("activity"); break;
        case "c": setActiveTab("actions"); break;
        case "m": setActiveTab("meetings"); break;
        case "e": setActiveTab("emails"); break;
        case "i": setActiveTab("intelligence"); break;
        case "f": setActiveTab("files"); break;
        case "n": setActiveTab("notes"); break;
        case "d": setDensity(d => d === "compact" ? "comfortable" : "compact"); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx, order.length]);

  // Keep emails tab badge in sync with realtime inserts
  useEffect(() => {
    if (!activeLeadId) return;
    const channel = supabase
      .channel(`panel-email-count-${activeLeadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_emails", filter: `lead_id=eq.${activeLeadId}` },
        () => setEmailCount(c => c + 1)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeLeadId]);

  const handleEnrich = useCallback(async () => {
    if (!lead || lead.enrichmentStatus === "running") return;
    setEnriching(true);
    updateLead(lead.id, { enrichmentStatus: "running" as any });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const m = lead.meetings || [];
      const allObjections: string[] = [], allPainPoints: string[] = [], allCompetitors: string[] = [], allChampions: string[] = [], allActionItems: string[] = [];
      const sentiments: string[] = [], intents: string[] = [];
      for (const mt of m) {
        const intel = mt.intelligence; if (!intel) continue;
        if (intel.dealSignals?.objections) allObjections.push(...intel.dealSignals.objections);
        if (intel.dealSignals?.competitors) allCompetitors.push(...intel.dealSignals.competitors);
        if (intel.dealSignals?.champions) allChampions.push(...intel.dealSignals.champions);
        if (intel.painPoints) allPainPoints.push(...intel.painPoints);
        if (intel.actionItems) allActionItems.push(...intel.actionItems.map(a => `${a.item} (${a.owner})`));
        if (intel.dealSignals?.sentiment) sentiments.push(intel.dealSignals.sentiment);
        if (intel.dealSignals?.buyingIntent) intents.push(intel.dealSignals.buyingIntent);
      }
      const meetingIntelligence = { objections: [...new Set(allObjections)], painPoints: [...new Set(allPainPoints)], competitors: [...new Set(allCompetitors)], champions: [...new Set(allChampions)], actionItems: allActionItems, sentiments, intents };
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const days = computeDaysInStage(lead.stageEnteredDate);
      const response = await fetch(`${supabaseUrl}/functions/v1/enrich-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          companyUrl: lead.companyUrl, meetings: lead.meetings || [], leadName: lead.name, leadMessage: lead.message,
          leadRole: lead.role, leadCompany: lead.company, leadStage: lead.stage, leadPriority: lead.priority,
          leadDealValue: lead.dealValue, leadServiceInterest: lead.serviceInterest, leadForecastCategory: lead.forecastCategory,
          leadIcpFit: lead.icpFit, leadSubscriptionValue: lead.subscriptionValue, leadContractStart: lead.contractStart,
          leadContractEnd: lead.contractEnd, leadCloseReason: lead.closeReason, leadWonReason: lead.wonReason,
          leadLostReason: lead.lostReason, leadNotes: lead.notes, leadTargetCriteria: lead.targetCriteria,
          leadTargetRevenue: lead.targetRevenue, leadGeography: lead.geography, leadAcquisitionStrategy: lead.acquisitionStrategy,
          leadBuyerType: lead.buyerType, leadDaysInStage: days, leadStageEnteredDate: lead.stageEnteredDate,
          meetingIntelligence, dealIntelligence: lead.dealIntelligence || null,
        }),
      });
      if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `Server error ${response.status}`); }
      const data = await response.json();
      if (data?.error) throw new Error(data.error);
      if (data?.enrichment) {
        updateLead(lead.id, { enrichment: data.enrichment, enrichmentStatus: "complete" as any });
        const hasSuggestions = data.enrichment.suggestedUpdates && Object.keys(data.enrichment.suggestedUpdates).length > 0;
        toast.success(hasSuggestions ? "Lead enriched — review AI suggestions" : "Lead enriched with AI intelligence");
      }
    } catch (e: any) {
      if (lead) updateLead(lead.id, { enrichmentStatus: "failed" as any });
      toast.error(e.name === "AbortError" ? "Research timed out — try again" : (e.message || "Failed to enrich lead"));
    } finally { clearTimeout(timeout); setEnriching(false); }
  }, [lead, updateLead]);

  const handleDraftAI = useCallback(() => {
    setActiveTab("actions");
    setDraftSignal(s => s + 1);
    setDraftingAI(true);
    setTimeout(() => setDraftingAI(false), 1500);
  }, []);

  if (!lead) return null;

  const days = computeDaysInStage(lead.stageEnteredDate);
  const save = (updates: Partial<Lead>) => updateLead(lead.id, updates);
  const isClosed = lead.stage === "Closed Won" || lead.stage === "Lost" || lead.stage === "Went Dark";

  const onEmail = () => { setEmailDrawerPreset(undefined); setEmailDrawerOpen(true); };
  const onSchedule = () => {
    if (lead.calendlyBookedAt) {
      toast(lead.calendlyEventName || "Calendly meeting", {
        description: lead.meetingDate || "Booking exists",
        action: { label: "View tab", onClick: () => setActiveTab("meetings") },
      });
    } else {
      window.open("https://calendly.com", "_blank");
    }
  };
  const onNote = () => setNoteOpen(true);
  const onTask = () => setTaskOpen(true);
  const onLogCall = () => setCallOpen(true);
  const onArchive = () => setArchiveTarget({ id: lead.id, name: lead.name });
  const onChangeStage = (stage: LeadStage) =>
    save({ stage, stageEnteredDate: new Date().toISOString().split("T")[0] });
  const onDraftFollowUp = () => { setEmailDrawerPreset("follow-up"); setEmailDrawerOpen(true); };

  const notesCount = lead.notes ? lead.notes.split(/\n--- /).filter(Boolean).length : 0;
  const filesCount =
    (lead.googleDriveLink ? 1 : 0) +
    (lead.meetings || []).filter(m => m.firefliesUrl).length +
    (lead.meetings || []).reduce((acc, m: any) => acc + ((m.attachments?.length) || 0), 0);

  const workspace = (
    <div className="h-full w-full flex flex-col bg-background overflow-hidden">
      <LeadPanelHeader
        lead={lead}
        daysInStage={days}
        mode={mode}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
        onEmail={onEmail}
        onSchedule={onSchedule}
        onNote={onNote}
        onTask={onTask}
        onDraftAI={handleDraftAI}
        onLogCall={onLogCall}
        onEnrich={handleEnrich}
        onArchive={onArchive}
        onChangeStage={onChangeStage}
        onShowShortcuts={() => setShortcutsOpen(true)}
        draftingAI={draftingAI}
        enriching={enriching}
      />

      <div className="flex-1 flex min-h-0">
        {!leftOpen && (
          <button onClick={() => setLeftOpen(true)} className="w-7 shrink-0 border-r border-border flex items-start justify-center pt-3 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors" title="Show panel">
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        {leftOpen && (
          <div className="relative">
            <LeadPanelLeftRail lead={lead} daysInStage={days} save={save} />
            <button onClick={() => setLeftOpen(false)} className="absolute top-2.5 right-2 text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/40" title="Hide panel">
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-border px-4 shrink-0">
              <TabsList className="bg-transparent h-10 p-0 gap-0">
                <TabsTrigger value="activity" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                  <ActivityIcon className="h-3.5 w-3.5" /> Activity
                </TabsTrigger>
                {!isClosed && (
                  <TabsTrigger value="actions" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                    <Zap className="h-3.5 w-3.5" /> Actions
                  </TabsTrigger>
                )}
                <TabsTrigger value="meetings" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                  <Calendar className="h-3.5 w-3.5" /> Meetings ({lead.meetings?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="emails" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                  <Mail className="h-3.5 w-3.5" /> Emails{emailCount > 0 ? ` (${emailCount})` : ""}
                </TabsTrigger>
                <TabsTrigger value="intelligence" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                  <Brain className="h-3.5 w-3.5" /> Intelligence
                </TabsTrigger>
                <TabsTrigger value="files" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                  <FolderOpen className="h-3.5 w-3.5" /> Files{filesCount > 0 ? ` (${filesCount})` : ""}
                </TabsTrigger>
                <TabsTrigger value="notes" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                  <MessageSquare className="h-3.5 w-3.5" /> Notes{notesCount > 0 ? ` (${notesCount})` : ""}
                </TabsTrigger>
                {isClosed && (
                  <TabsTrigger value="debrief" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                    <Trophy className="h-3.5 w-3.5" /> Debrief
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="activity" className="mt-0">
                <div className="px-6 pt-4 max-w-3xl mx-auto">
                  <DealHealthAlerts lead={lead} />
                </div>
                <LeadActivityTab lead={lead} save={save} onDraftFollowUp={onDraftFollowUp} />
              </TabsContent>
              {!isClosed && (
                <TabsContent value="actions" className="mt-0">
                  <LeadActionsTab lead={lead} allLeads={leads} save={save} draftSignal={draftSignal} />
                </TabsContent>
              )}
              <TabsContent value="meetings" className="p-6 mt-0 max-w-5xl mx-auto">
                <MeetingsSection lead={lead} />
              </TabsContent>
              <TabsContent value="emails" className="p-6 mt-0 max-w-4xl mx-auto">
                <EmailsSection leadId={lead.id} onCompose={onEmail} />
              </TabsContent>
              <TabsContent value="intelligence" className="p-6 mt-0 max-w-5xl mx-auto">
                {lead.dealIntelligence ? (
                  <DealIntelligencePanel intel={lead.dealIntelligence} lead={lead} />
                ) : (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>No deal intelligence synthesized yet.</p>
                    <p className="text-xs mt-1">Process meetings to surface stakeholder maps, momentum, and win strategy.</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="files" className="mt-0">
                <LeadFilesTab lead={lead} save={save} />
              </TabsContent>
              <TabsContent value="notes" className="mt-0">
                <LeadNotesTab lead={lead} save={save} onAddNote={() => setNoteOpen(true)} />
              </TabsContent>
              {isClosed && (
                <TabsContent value="debrief" className="mt-0">
                  <LeadDebriefTab lead={lead} />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </main>

        {!rightOpen && (
          <button onClick={() => setRightOpen(true)} className="w-7 shrink-0 border-l border-border flex items-start justify-center pt-3 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors" title="Show panel">
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
        {rightOpen && (
          <div className="relative">
            <LeadPanelRightRail lead={lead} allLeads={leads} enriching={enriching} onEnrich={handleEnrich} save={save} />
            <button onClick={() => setRightOpen(false)} className="absolute top-2.5 right-2 text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/40" title="Hide panel">
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <ArchiveDialog
        open={!!archiveTarget}
        leadName={archiveTarget?.name || ""}
        onConfirm={(reason) => { if (archiveTarget) { archiveLead(archiveTarget.id, reason); setArchiveTarget(null); onClose(); } }}
        onCancel={() => setArchiveTarget(null)}
      />

      <NoteDialog lead={lead} open={noteOpen} onOpenChange={setNoteOpen} save={save} />
      <TaskDialog lead={lead} open={taskOpen} onOpenChange={setTaskOpen} />
      <LogCallDialog lead={lead} open={callOpen} onOpenChange={setCallOpen} save={save} />
      <EmailComposeDrawer lead={lead} open={emailDrawerOpen} onOpenChange={setEmailDrawerOpen} save={save} presetAction={emailDrawerPreset} />
      <KeyboardCheatsheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );

  if (mode === "page") {
    return <div className="h-screen w-screen overflow-hidden">{workspace}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-screen max-w-none p-0 sm:max-w-none border-0"
        aria-describedby={undefined}
      >
        <VisuallyHidden>
          <SheetTitle>{lead.name} — {lead.company}</SheetTitle>
        </VisuallyHidden>
        {workspace}
      </SheetContent>
    </Sheet>
  );
}

// Backward-compatible alias used by all import sites
export const LeadDetail = LeadDetailPanel;
