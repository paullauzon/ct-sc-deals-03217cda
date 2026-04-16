import { useState, useEffect, useCallback } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead } from "@/types/lead";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { computeDaysInStage } from "@/lib/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import { MeetingsSection } from "@/components/MeetingsSection";
import { EmailsSection } from "@/components/EmailsSection";
import { DealIntelligencePanel } from "@/components/DealIntelligencePanel";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { Activity as ActivityIcon, Calendar, Mail, Brain, FolderOpen, MessageSquare, Layers, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { LeadPanelHeader } from "./lead-panel/LeadPanelHeader";
import { LeadPanelLeftRail } from "./lead-panel/LeadPanelLeftRail";
import { LeadPanelRightRail } from "./lead-panel/LeadPanelRightRail";
import { LeadOverviewTab } from "./lead-panel/LeadOverviewTab";
import { LeadActivityTab } from "./lead-panel/LeadActivityTab";
import { LeadFilesTab } from "./lead-panel/LeadFilesTab";

interface LeadDetailPanelProps {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}

export function LeadDetailPanel({ leadId, open, onClose }: LeadDetailPanelProps) {
  const { leads, updateLead, archiveLead } = useLeads();
  const lead = leads.find(l => l.id === leadId) || null;
  const [enriching, setEnriching] = useState(false);
  const [draftingAI, setDraftingAI] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => { if (open) setActiveTab("overview"); }, [leadId, open]);

  if (!lead) return null;

  const days = computeDaysInStage(lead.stageEnteredDate);
  const save = (updates: Partial<Lead>) => updateLead(lead.id, updates);

  const aggregateMeetingIntel = () => {
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
    return { objections: [...new Set(allObjections)], painPoints: [...new Set(allPainPoints)], competitors: [...new Set(allCompetitors)], champions: [...new Set(allChampions)], actionItems: allActionItems, sentiments, intents };
  };

  const handleEnrich = useCallback(async () => {
    if (!lead || lead.enrichmentStatus === "running") return;
    setEnriching(true);
    save({ enrichmentStatus: "running" as any });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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
          meetingIntelligence: aggregateMeetingIntel(), dealIntelligence: lead.dealIntelligence || null,
        }),
      });
      if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `Server error ${response.status}`); }
      const data = await response.json();
      if (data?.error) throw new Error(data.error);
      if (data?.enrichment) {
        save({ enrichment: data.enrichment, enrichmentStatus: "complete" as any });
        const hasSuggestions = data.enrichment.suggestedUpdates && Object.keys(data.enrichment.suggestedUpdates).length > 0;
        toast.success(hasSuggestions ? "Lead enriched — review AI suggestions" : "Lead enriched with AI intelligence");
      }
    } catch (e: any) {
      save({ enrichmentStatus: "failed" as any });
      toast.error(e.name === "AbortError" ? "Research timed out — try again" : (e.message || "Failed to enrich lead"));
    } finally { clearTimeout(timeout); setEnriching(false); }
  }, [lead, days]);

  const handleDraftAI = useCallback(async () => {
    if (!lead) return;
    setDraftingAI(true);
    try {
      const latestMeeting = lead.meetings?.filter(m => m.intelligence).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())?.[0];
      const meetingPayload = latestMeeting || { title: "Follow-up", date: new Date().toISOString().split("T")[0], intelligence: { summary: "Follow up on this deal.", nextSteps: [{ action: "Follow up", owner: lead.assignedTo }] } };
      const { data, error } = await supabase.functions.invoke("draft-followup", {
        body: {
          meeting: meetingPayload,
          leadFields: { name: lead.name, role: lead.role, company: lead.company, brand: lead.brand, serviceInterest: lead.serviceInterest, targetCriteria: lead.targetCriteria, targetRevenue: lead.targetRevenue, geography: lead.geography, stage: lead.stage, assignedTo: lead.assignedTo },
          dealIntelligence: lead.dealIntelligence,
          actionType: "default",
        },
      });
      if (error) throw error;
      if (data?.email) {
        await supabase.from("lead_drafts").upsert({
          lead_id: lead.id, action_key: "panel-quick-draft", content: data.email,
          draft_type: "default", context_label: "Quick AI draft", status: "draft", updated_at: new Date().toISOString(),
        } as any, { onConflict: "lead_id,action_key" });
        toast.success("Draft saved — view in Deal Room → Actions");
      }
    } catch { toast.error("Failed to generate draft"); }
    finally { setDraftingAI(false); }
  }, [lead]);

  const onEmail = () => setActiveTab("emails");
  const onSchedule = () => {
    if (lead.calendlyBookedAt) toast(lead.calendlyEventName || "Calendly meeting", { description: lead.meetingDate });
    else window.open("https://calendly.com", "_blank");
  };
  const onNote = () => setActiveTab("notes");
  const onTask = () => toast("Tasks live in the Deal Room", { description: "Open Deal Room → Actions to add a task" });
  const onLogCall = () => { setActiveTab("notes"); toast("Log call in Notes"); };
  const onArchive = () => setArchiveTarget({ id: lead.id, name: lead.name });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-screen max-w-none p-0 sm:max-w-none border-0"
        aria-describedby={undefined}
      >
        <div className="h-full w-full flex flex-col bg-background overflow-hidden">
          <LeadPanelHeader
            lead={lead}
            daysInStage={days}
            onClose={onClose}
            onEmail={onEmail}
            onSchedule={onSchedule}
            onNote={onNote}
            onTask={onTask}
            onDraftAI={handleDraftAI}
            onLogCall={onLogCall}
            onEnrich={handleEnrich}
            onArchive={onArchive}
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
                <LeadPanelLeftRail lead={lead} daysInStage={days} />
                <button onClick={() => setLeftOpen(false)} className="absolute top-2.5 right-2 text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/40" title="Hide panel">
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="border-b border-border px-4 shrink-0">
                  <TabsList className="bg-transparent h-10 p-0 gap-0">
                    <TabsTrigger value="overview" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                      <Layers className="h-3.5 w-3.5" /> Overview
                    </TabsTrigger>
                    <TabsTrigger value="activity" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                      <ActivityIcon className="h-3.5 w-3.5" /> Activity
                    </TabsTrigger>
                    <TabsTrigger value="meetings" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                      <Calendar className="h-3.5 w-3.5" /> Meetings ({lead.meetings?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="emails" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                      <Mail className="h-3.5 w-3.5" /> Emails
                    </TabsTrigger>
                    <TabsTrigger value="intelligence" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                      <Brain className="h-3.5 w-3.5" /> Intelligence
                    </TabsTrigger>
                    <TabsTrigger value="files" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                      <FolderOpen className="h-3.5 w-3.5" /> Files
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="text-xs gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none h-10">
                      <MessageSquare className="h-3.5 w-3.5" /> Notes
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <TabsContent value="overview" className="mt-0">
                    <LeadOverviewTab lead={lead} daysInStage={days} enriching={enriching} onEnrich={handleEnrich} save={save} />
                  </TabsContent>
                  <TabsContent value="activity" className="mt-0">
                    <LeadActivityTab lead={lead} />
                  </TabsContent>
                  <TabsContent value="meetings" className="p-6 mt-0 max-w-5xl mx-auto">
                    <MeetingsSection lead={lead} />
                  </TabsContent>
                  <TabsContent value="emails" className="p-6 mt-0 max-w-4xl mx-auto">
                    <EmailsSection leadId={lead.id} />
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
                    <LeadFilesTab lead={lead} />
                  </TabsContent>
                  <TabsContent value="notes" className="p-6 mt-0 max-w-3xl mx-auto">
                    <Textarea
                      value={lead.notes}
                      onChange={(e) => save({ notes: e.target.value })}
                      placeholder="Add notes about this lead..."
                      rows={20}
                      className="min-h-[400px] text-sm"
                    />
                  </TabsContent>
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
                <LeadPanelRightRail lead={lead} allLeads={leads} />
                <button onClick={() => setRightOpen(false)} className="absolute top-2.5 right-2 text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/40" title="Hide panel">
                  <PanelRightClose className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <ArchiveDialog
          open={!!archiveTarget}
          leadName={archiveTarget?.name || ""}
          onConfirm={(reason) => { if (archiveTarget) { archiveLead(archiveTarget.id, reason); setArchiveTarget(null); onClose(); } }}
          onCancel={() => setArchiveTarget(null)}
        />
      </SheetContent>
    </Sheet>
  );
}

// Backward-compatible alias used by all 6 import sites
export const LeadDetail = LeadDetailPanel;
