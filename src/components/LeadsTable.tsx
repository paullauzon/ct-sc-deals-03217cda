import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLeads } from "@/contexts/LeadContext";
import { useProcessing } from "@/contexts/ProcessingContext";
import { Lead, LeadStage, LeadSource, ServiceInterest, CloseReason, MeetingOutcome, ForecastCategory, IcpFit, Brand, DealOwner, LeadEnrichment, BillingFrequency, SuggestedUpdates, SuggestedFieldUpdate, Submission } from "@/types/lead";
import { toast } from "sonner";
import { MeetingsSection } from "@/components/MeetingsSection";
import { EmailsSection } from "@/components/EmailsSection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DealIntelligencePanel } from "@/components/DealIntelligencePanel";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { BrandLogo } from "@/components/BrandLogo";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getBrandBorderClass } from "@/lib/brandColors";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeDaysInStage, getCompanyAssociates, getSharedIntelligence } from "@/lib/leadUtils";
import { fetchActivityLog, type ActivityLogEntry } from "@/lib/activityLog";
import { format, parseISO } from "date-fns";

import { FirefliesImportDialog } from "@/components/FirefliesImport";
import { BulkProcessingDialog } from "@/components/BulkProcessingDialog";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw, AlertTriangle, Shield, Users, Target, Check, X, ArrowRight, Zap, ChevronRight, Clock, GitCommit, MessageSquare, Calendar, Search as SearchIcon, Linkedin, CalendarCheck, Archive } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STAGES: LeadStage[] = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won", "Closed Lost", "Went Dark"];
const ACTIVE_STAGES: LeadStage[] = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"];
const SERVICES: ServiceInterest[] = ["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "SourceCo Retained Search", "Other", "TBD"];
const PRIORITIES = ["High", "Medium", "Low"] as const;
const OWNERS: DealOwner[] = ["Malik", "Valeria", "Tomos"];
const CLOSE_REASONS: CloseReason[] = ["Budget", "Timing", "Competitor", "No Fit", "No Response", "Not Qualified", "Champion Left", "Other"];
const MEETING_OUTCOMES: MeetingOutcome[] = ["Scheduled", "Held", "No-Show", "Rescheduled", "Cancelled"];
const FORECAST_CATEGORIES: ForecastCategory[] = ["Commit", "Best Case", "Pipeline", "Omit"];
const ICP_FITS: IcpFit[] = ["Strong", "Moderate", "Weak"];
const BILLING_FREQUENCIES: BillingFrequency[] = ["Monthly", "Quarterly", "Annually"];

const SOURCE_LABELS: Record<LeadSource, string> = {
  "CT Contact Form": "CT Contact",
  "CT Free Targets Form": "CT Targets",
  "SC Intro Call Form": "SC Intro",
  "SC Free Targets Form": "SC Targets",
};

type SortKey = "name" | "company" | "stage" | "dealValue" | "days" | "priority" | "dateSubmitted" | "source" | "serviceInterest" | "role" | "score" | "tier";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function DealProgressBar({ currentStage }: { currentStage: LeadStage }) {
  const currentIdx = ACTIVE_STAGES.indexOf(currentStage);
  const isClosed = ["Closed Won", "Closed Lost", "Went Dark"].includes(currentStage);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Deal Progress</p>
        {isClosed && (
          <Badge variant={currentStage === "Closed Won" ? "default" : "destructive"} className="text-[10px]">
            {currentStage}
          </Badge>
        )}
      </div>
      <div className="flex gap-0.5">
        {ACTIVE_STAGES.map((stage, i) => (
          <div
            key={stage}
            className={cn(
              "h-2 flex-1 rounded-sm transition-colors",
              isClosed
                ? "bg-muted"
                : i <= currentIdx
                  ? i === currentIdx ? "bg-primary" : "bg-primary/50"
                  : "bg-muted"
            )}
            title={stage}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>New Lead</span>
        <span>Contract Sent</span>
      </div>
    </div>
  );
}

export function LeadDetail({ leadId, open, onClose }: { leadId: string | null; open: boolean; onClose: () => void }) {
  const { leads, updateLead } = useLeads();
  const { leadJobs, acceptLeadSuggestion, dismissLeadSuggestion, acceptAllLeadSuggestions, dismissLeadJob } = useProcessing();
  const lead = leads.find((l) => l.id === leadId) || null;
  const [enriching, setEnriching] = useState(false);
  const [activityKey, setActivityKey] = useState(0);
  if (!lead) return null;
  const autoFindJob = leadJobs[lead.id];

  const save = (updates: Partial<Lead>) => {
    updateLead(lead.id, updates);
    // Bump activity key so ActivityTimeline re-fetches after field/stage changes
    setTimeout(() => setActivityKey(k => k + 1), 500);
  };
  const days = computeDaysInStage(lead.stageEnteredDate);
  

  // Aggregate meeting intelligence for enrichment
  const aggregateMeetingIntelligence = () => {
    const meetings = lead.meetings || [];
    const allObjections: string[] = [];
    const allPainPoints: string[] = [];
    const allCompetitors: string[] = [];
    const allChampions: string[] = [];
    const allActionItems: string[] = [];
    const sentiments: string[] = [];
    const intents: string[] = [];

    for (const m of meetings) {
      if (!m.intelligence) continue;
      const intel = m.intelligence;
      if (intel.dealSignals?.objections) allObjections.push(...intel.dealSignals.objections);
      if (intel.dealSignals?.competitors) allCompetitors.push(...intel.dealSignals.competitors);
      if (intel.dealSignals?.champions) allChampions.push(...intel.dealSignals.champions);
      if (intel.painPoints) allPainPoints.push(...intel.painPoints);
      if (intel.actionItems) allActionItems.push(...intel.actionItems.map(a => `${a.item} (${a.owner})`));
      if (intel.dealSignals?.sentiment) sentiments.push(intel.dealSignals.sentiment);
      if (intel.dealSignals?.buyingIntent) intents.push(intel.dealSignals.buyingIntent);
    }

    return {
      objections: [...new Set(allObjections)],
      painPoints: [...new Set(allPainPoints)],
      competitors: [...new Set(allCompetitors)],
      champions: [...new Set(allChampions)],
      actionItems: allActionItems,
      sentiments,
      intents,
    };
  };

  const handleEnrich = async () => {
    if (lead.enrichmentStatus === "running") return; // prevent double-click
    setEnriching(true);
    save({ enrichmentStatus: "running" as any });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const meetingIntel = aggregateMeetingIntelligence();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/enrich-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          companyUrl: lead.companyUrl,
          meetings: lead.meetings || [],
          leadName: lead.name,
          leadMessage: lead.message,
          leadRole: lead.role,
          leadCompany: lead.company,
          leadStage: lead.stage,
          leadPriority: lead.priority,
          leadDealValue: lead.dealValue,
          leadServiceInterest: lead.serviceInterest,
          leadForecastCategory: lead.forecastCategory,
          leadIcpFit: lead.icpFit,
          leadSubscriptionValue: lead.subscriptionValue,
          leadContractStart: lead.contractStart,
          leadContractEnd: lead.contractEnd,
          leadCloseReason: lead.closeReason,
          leadWonReason: lead.wonReason,
          leadLostReason: lead.lostReason,
          leadNotes: lead.notes,
          leadTargetCriteria: lead.targetCriteria,
          leadTargetRevenue: lead.targetRevenue,
          leadGeography: lead.geography,
          leadAcquisitionStrategy: lead.acquisitionStrategy,
          leadBuyerType: lead.buyerType,
          leadDaysInStage: days,
          leadStageEnteredDate: lead.stageEnteredDate,
          meetingIntelligence: meetingIntel,
          dealIntelligence: lead.dealIntelligence || null,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${response.status}`);
      }
      const data = await response.json();
      if (data?.error) throw new Error(data.error);
      if (data?.enrichment) {
        save({ enrichment: data.enrichment, enrichmentStatus: "complete" as any });
        const suggestions = data.enrichment.suggestedUpdates;
        const hasSuggestions = suggestions && Object.keys(suggestions).length > 0;
        toast.success(hasSuggestions ? "Lead enriched — review AI suggested updates" : "Lead enriched with AI intelligence");
      }
    } catch (e: any) {
      console.error("Enrichment failed:", e);
      save({ enrichmentStatus: "failed" as any });
      if (e.name === "AbortError") {
        toast.error("Research timed out — the AI took too long. Try again or check network.");
      } else {
        toast.error(e.message || "Failed to enrich lead");
      }
    } finally {
      clearTimeout(timeout);
      setEnriching(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="overflow-y-auto" aria-describedby={undefined}>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <BrandLogo brand={lead.brand} size="sm" />
            <SheetTitle className="text-lg font-semibold">{lead.name}</SheetTitle>
            {lead.linkedinUrl && (
              <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={lead.linkedinTitle || "LinkedIn Profile"}>
                <Linkedin className="h-4 w-4 text-[#0A66C2] hover:opacity-70 transition-opacity" />
              </a>
            )}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5"><CompanyAvatar companyUrl={lead.companyUrl} email={lead.email} companyName={lead.company} size="sm" />{lead.role} · {lead.company || "No company"}</p>
          {lead.calendlyBookedAt && (
            <p className="flex items-center gap-1.5 text-xs text-primary font-medium mt-0.5">
              <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
              {lead.calendlyEventName || "Calendly Meeting"}
              {lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration} min` : ""}
              {lead.meetingDate ? ` · ${(() => { try { return format(parseISO(lead.meetingDate), "EEE, MMM d 'at' h:mm a"); } catch { return lead.meetingDate; } })()}` : ""}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {lead.submissions && lead.submissions.length > 1 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                <RefreshCw className="h-2.5 w-2.5 mr-1 inline" />
                {lead.submissions.length} submissions
                {new Set(lead.submissions.map(s => s.brand)).size > 1 ? " (CT + SC)" : ""}
              </Badge>
            )}
            <Link
              to={`/deal/${lead.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors ml-auto"
              onClick={onClose}
            >
              Open Deal Room <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </SheetHeader>

        <div className="space-y-8 mt-4">
          {/* Deal Health Alerts */}
          <DealHealthAlerts lead={lead} />

          {/* Deal Progress Bar */}
          <DealProgressBar currentStage={lead.stage} />

          {/* Auto-Find Inline Suggestions */}
          {autoFindJob && (autoFindJob.searching || autoFindJob.pendingSuggestions.length > 0) && (
            <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary uppercase tracking-wider">
                  <Zap className="h-3.5 w-3.5" />
                  {autoFindJob.searching ? "Searching Meetings..." : `Meeting-Based Suggestions (${autoFindJob.pendingSuggestions.length})`}
                </div>
                {!autoFindJob.searching && autoFindJob.pendingSuggestions.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary hover:text-primary"
                    onClick={() => acceptAllLeadSuggestions(lead.id)}>
                    Accept All
                  </Button>
                )}
              </div>
              {autoFindJob.searching && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Processing meetings for {autoFindJob.leadName}...</span>
                </div>
              )}
              {!autoFindJob.searching && autoFindJob.pendingSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  {autoFindJob.pendingSuggestions.map((s) => (
                    <div key={s.field} className="rounded border border-border bg-background p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="text-xs font-medium">{s.label}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <Badge variant="default" className="text-[10px] shrink-0">{String(s.value)}</Badge>
                        </div>
                        <div className="flex gap-0.5 shrink-0 ml-2">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => acceptLeadSuggestion(lead.id, s.field, s.value)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => dismissLeadSuggestion(lead.id, s.field)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{s.evidence}</p>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground"
                      onClick={() => dismissLeadJob(lead.id)}>
                      Skip All
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Enrichment */}
          <EnrichmentSection enrichment={lead.enrichment} onEnrich={handleEnrich} enriching={enriching} lead={lead} onAcceptSuggestion={(field, value) => {
            const updates: Partial<Lead> = { [field]: value };
            // When accepting stage, update stageEnteredDate
            if (field === "stage") {
              updates.stageEnteredDate = new Date().toISOString().split("T")[0];
            }
            save(updates);
            // Remove this suggestion from enrichment
            if (lead.enrichment?.suggestedUpdates) {
              const newSuggested = { ...lead.enrichment.suggestedUpdates };
              delete (newSuggested as any)[field];
              save({ enrichment: { ...lead.enrichment, suggestedUpdates: Object.keys(newSuggested).length > 0 ? newSuggested : undefined } });
            }
            toast.success(`Updated ${field} to "${value}"`);
          }} onDismissSuggestion={(field) => {
            if (lead.enrichment?.suggestedUpdates) {
              const newSuggested = { ...lead.enrichment.suggestedUpdates };
              delete (newSuggested as any)[field];
              save({ enrichment: { ...lead.enrichment, suggestedUpdates: Object.keys(newSuggested).length > 0 ? newSuggested : undefined } });
            }
          }} />

          {/* Contact Info */}
          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Email" value={lead.email} />
              <Field label="Phone" value={lead.phone || "—"} />
              <Field label="Website" value={lead.companyUrl ? <a href={lead.companyUrl} target="_blank" rel="noreferrer" className="underline">{lead.companyUrl}</a> : "—"} />
              <Field label="LinkedIn" value={lead.linkedinUrl ? (
                <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline" onClick={e => e.stopPropagation()}>
                  <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />{lead.linkedinTitle || "Profile"}
                </a>
              ) : <span className="text-muted-foreground">—</span>} />
              <Field label="Source" value={SOURCE_LABELS[lead.source] || lead.source} />
              <Field label="Brand" value={lead.brand} />
              <Field label="Submitted" value={lead.dateSubmitted} />
              <Field label="Deals Planned" value={lead.dealsPlanned || "—"} />
              {lead.hearAboutUs && <Field label="Heard About Us" value={lead.hearAboutUs} />}
            </div>
          </Section>

          {/* Company Activity — cross-synced associates */}
          <CompanyActivitySection lead={lead} allLeads={leads} onSelectLead={(id) => { /* handled via LeadDetail re-open */ }} />

          {/* Submission History */}
          {lead.submissions && lead.submissions.length > 1 && (
            <SubmissionHistory submissions={lead.submissions} currentLead={lead} />
          )}

          {/* Message */}
          <Section title="Original Message">
            <p className="text-sm leading-relaxed">{lead.message}</p>
          </Section>

          {/* Target Criteria (if available) */}
          {lead.targetCriteria && (
            <Section title="Target Criteria">
              <p className="text-sm leading-relaxed">{lead.targetCriteria}</p>
              <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                <Field label="Revenue Range" value={lead.targetRevenue || "—"} />
                <Field label="Geography" value={lead.geography || "—"} />
                <Field label="Current Sourcing" value={lead.currentSourcing || "—"} />
                {lead.acquisitionStrategy && <Field label="Acq. Strategy" value={lead.acquisitionStrategy} />}
              </div>
            </Section>
          )}

          {/* Deal Management - 4 column grid */}
          <Section title="Deal Management">
            <div className="grid grid-cols-4 gap-3">
              <SelectField label="Stage" value={lead.stage} options={STAGES} onChange={(v) => save({ stage: v as LeadStage })} />
              <SelectField label="Priority" value={lead.priority} options={[...PRIORITIES]} onChange={(v) => save({ priority: v as "High" | "Medium" | "Low" })} />
              <ClearableSelectField label="Forecast" value={lead.forecastCategory} options={FORECAST_CATEGORIES} onChange={(v) => save({ forecastCategory: v as ForecastCategory })} />
              <ClearableSelectField label="ICP Fit" value={lead.icpFit} options={ICP_FITS} onChange={(v) => save({ icpFit: v as IcpFit })} />
              <div className="flex flex-col justify-end">
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pre-Screen</label>
                <button
                  onClick={() => save({ preScreenCompleted: !lead.preScreenCompleted })}
                  className={cn(
                    "h-9 px-3 rounded border text-xs font-medium flex items-center gap-1.5 transition-colors",
                    lead.preScreenCompleted
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  )}
                >
                  {lead.preScreenCompleted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {lead.preScreenCompleted ? "Completed" : "Not Done"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              <SelectField label="Service" value={lead.serviceInterest} options={SERVICES} onChange={(v) => save({ serviceInterest: v as ServiceInterest })} />
              <ClearableSelectField label="Owner" value={lead.assignedTo} options={[...OWNERS]} onChange={(v) => save({ assignedTo: v as DealOwner })} />
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Deal Value ($)</label>
                <Input type="number" value={lead.dealValue || ""} onChange={(e) => save({ dealValue: Number(e.target.value) || 0 })} className="mt-1" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Close Date</label>
                <Input type="date" value={lead.closedDate} onChange={(e) => save({ closedDate: e.target.value })} className="mt-1" />
              </div>
            </div>
          </Section>

          {/* Revenue & Contract */}
          <Section title="Revenue & Contract">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Subscription ($/mo)</label>
                <Input type="number" value={lead.subscriptionValue || ""} onChange={(e) => save({ subscriptionValue: Number(e.target.value) || 0 })} className="mt-1" placeholder="0" />
              </div>
              <ClearableSelectField label="Billing" value={lead.billingFrequency} options={BILLING_FREQUENCIES} onChange={(v) => save({ billingFrequency: v as BillingFrequency })} />
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Contract Start</label>
                <Input type="date" value={lead.contractStart} onChange={(e) => save({ contractStart: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Contract End</label>
                <Input type="date" value={lead.contractEnd} onChange={(e) => save({ contractEnd: e.target.value })} className="mt-1" />
              </div>
            </div>
          </Section>

          {/* Meeting Management */}
          <Section title="Meeting">
            {lead.calendlyBookedAt && (
              <div className="mb-3 flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                <CalendarCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{lead.calendlyEventName || "Booked via Calendly"}{lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration} min` : ""}</p>
                  {lead.meetingDate && (
                    <p className="text-sm text-muted-foreground">
                      {(() => {
                        try {
                          const d = parseISO(lead.meetingDate);
                          return format(d, "EEE, MMM d 'at' h:mm a");
                        } catch {
                          return lead.meetingDate;
                        }
                      })()}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Booked on {(() => {
                      try { return format(parseISO(lead.calendlyBookedAt), "MMM d, yyyy 'at' h:mm a"); }
                      catch { return lead.calendlyBookedAt; }
                    })()}
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 gap-3">
              <ClearableSelectField label="Outcome" value={lead.meetingOutcome} options={MEETING_OUTCOMES} onChange={(v) => save({ meetingOutcome: v as MeetingOutcome })} />
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Meeting Date</label>
                <Input type="date" value={lead.meetingDate} onChange={(e) => save({ meetingDate: e.target.value, meetingSetDate: lead.meetingSetDate || new Date().toISOString().split("T")[0] })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Next Follow-up</label>
                <Input type="date" value={lead.nextFollowUp} onChange={(e) => save({ nextFollowUp: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Last Contact</label>
                <Input type="date" value={lead.lastContactDate} onChange={(e) => save({ lastContactDate: e.target.value })} className="mt-1" />
              </div>
            </div>
          </Section>

          {/* Meetings, Emails & Activity Tabs */}
          <Tabs defaultValue="meetings" className="w-full">
            <TabsList className="w-full justify-start h-9 p-1">
              <TabsTrigger value="meetings" className="text-xs h-7">Meetings</TabsTrigger>
              <TabsTrigger value="emails" className="text-xs h-7">Emails</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs h-7">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="meetings">
              <MeetingsSection lead={lead} />
            </TabsContent>
            <TabsContent value="emails">
              <EmailsSection leadId={lead.id} />
            </TabsContent>
            <TabsContent value="activity">
              <ActivityTimeline leadId={lead.id} refreshKey={activityKey} />
            </TabsContent>
          </Tabs>

          {/* Deal Intelligence (Cross-Meeting Synthesis) */}
          {lead.dealIntelligence && (
            <DealIntelligencePanel intel={lead.dealIntelligence} lead={lead} />
          )}

          {/* Close Reasons */}
          {lead.stage === "Closed Won" && (
            <Section title="Won Details">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Won Reason</label>
                <Input value={lead.wonReason} onChange={(e) => save({ wonReason: e.target.value })} className="mt-1" placeholder="Why did we win this deal?" />
              </div>
            </Section>
          )}

          {(lead.stage === "Closed Lost" || lead.stage === "Went Dark") && (
            <Section title="Lost / Dark Details">
              <div className="grid grid-cols-2 gap-4">
                <ClearableSelectField label="Close Reason" value={lead.closeReason} options={CLOSE_REASONS} onChange={(v) => save({ closeReason: v as CloseReason })} />
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Detail</label>
                  <Input value={lead.lostReason} onChange={(e) => save({ lostReason: e.target.value })} className="mt-1" placeholder="Additional context..." />
                </div>
              </div>
            </Section>
          )}

          {/* Tracking */}
          <Section title="Tracking">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Field label="Days in Stage" value={days} />
              <Field label="Hours to Meeting Set" value={lead.hoursToMeetingSet !== null ? lead.hoursToMeetingSet : "—"} />
              <Field label="Stage Entered" value={lead.stageEnteredDate || "—"} />
            </div>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <Textarea
              value={lead.notes}
              onChange={(e) => save({ notes: e.target.value })}
              placeholder="Add notes about this lead..."
              rows={4}
            />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Deal Health Alerts ───

function DealHealthAlerts({ lead }: { lead: Lead }) {
  const alerts: { message: string; severity: "warning" | "critical" }[] = [];
  const today = new Date();

  // Stalling: no meetings in 14+ days
  const meetings = lead.meetings || [];
  if (meetings.length > 0 && !["Closed Won", "Closed Lost", "Went Dark"].includes(lead.stage)) {
    const latestMeetingDate = meetings.map(m => m.date).filter(Boolean).sort().pop();
    if (latestMeetingDate) {
      const daysSince = Math.floor((today.getTime() - new Date(latestMeetingDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 21) {
        alerts.push({ message: `Deal stalling: ${daysSince} days since last meeting`, severity: "critical" });
      } else if (daysSince >= 14) {
        alerts.push({ message: `${daysSince} days since last meeting`, severity: "warning" });
      }
    }
  }

  // Overdue action items
  if (lead.dealIntelligence?.actionItemTracker) {
    const overdue = lead.dealIntelligence.actionItemTracker.filter(a => a.status === "Overdue").length;
    if (overdue > 0) {
      alerts.push({ message: `${overdue} overdue action item${overdue !== 1 ? "s" : ""}`, severity: "critical" });
    }
    const open = lead.dealIntelligence.actionItemTracker.filter(a => a.status === "Open").length;
    if (open >= 5) {
      alerts.push({ message: `${open} open action items`, severity: "warning" });
    }
  }

  // Unmitigated high risks
  if (lead.dealIntelligence?.riskRegister?.length) {
    const unmitigated = lead.dealIntelligence.riskRegister.filter(
      r => r.mitigationStatus === "Unmitigated" && (r.severity === "Critical" || r.severity === "High")
    );
    if (unmitigated.length) {
      alerts.push({ message: `${unmitigated.length} unmitigated high/critical risk${unmitigated.length !== 1 ? "s" : ""}`, severity: "critical" });
    }
  }

  // No follow-up scheduled or overdue
  if (!["Closed Won", "Closed Lost", "Went Dark"].includes(lead.stage)) {
    if (!lead.nextFollowUp) {
      alerts.push({ message: "No follow-up scheduled", severity: "warning" });
    } else if (new Date(lead.nextFollowUp) < today) {
      const daysOverdue = Math.floor((today.getTime() - new Date(lead.nextFollowUp).getTime()) / (1000 * 60 * 60 * 24));
      alerts.push({ message: `Follow-up overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`, severity: "critical" });
    }
  }

  // Momentum stalling/stalled
  if (lead.dealIntelligence?.momentumSignals) {
    const ms = lead.dealIntelligence.momentumSignals;
    if (ms.momentum === "Stalled") {
      alerts.push({ message: "Deal momentum: Stalled", severity: "critical" });
    } else if (ms.momentum === "Stalling") {
      alerts.push({ message: "Deal momentum: Stalling", severity: "warning" });
    }
  }

  // Contract expiring
  if (lead.contractEnd) {
    const daysToExpiry = Math.floor((new Date(lead.contractEnd).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysToExpiry >= 0 && daysToExpiry <= 30) {
      alerts.push({ message: `Contract expiring in ${daysToExpiry} day${daysToExpiry !== 1 ? "s" : ""}`, severity: daysToExpiry <= 7 ? "critical" : "warning" });
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1">
      {alerts.filter(a => a.severity === "critical").map((a, i) => (
        <div key={`c-${i}`} className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-xs text-destructive font-medium">{a.message}</span>
        </div>
      ))}
      {alerts.filter(a => a.severity === "warning").map((a, i) => (
        <div key={`w-${i}`} className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
          <span className="text-xs text-yellow-700 font-medium">{a.message}</span>
        </div>
      ))}
    </div>
  );
}
const SUGGESTION_LABELS: Record<string, string> = {
  stage: "Stage", priority: "Priority", forecastCategory: "Forecast",
  icpFit: "ICP Fit", nextFollowUp: "Next Follow-up", dealValue: "Deal Value",
  serviceInterest: "Service Interest", meetingOutcome: "Meeting Outcome",
};

function AISuggestionsPanel({ suggestions, lead, onAccept, onDismiss }: {
  suggestions: SuggestedUpdates;
  lead: Lead;
  onAccept: (field: string, value: string | number) => void;
  onDismiss: (field: string) => void;
}) {
  const entries = Object.entries(suggestions).filter(([, v]) => v && (v as SuggestedFieldUpdate).value !== undefined);
  if (entries.length === 0) return null;

  const getCurrentValue = (field: string): string => {
    const val = (lead as any)[field];
    if (val === undefined || val === null || val === "") return "Not set";
    if (field === "dealValue") return `$${val.toLocaleString()}`;
    return String(val);
  };

  const formatValue = (field: string, value: string | number): string => {
    if (field === "dealValue") return `$${Number(value).toLocaleString()}`;
    return String(value);
  };

  return (
    <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary uppercase tracking-wider">
          <Zap className="h-3.5 w-3.5" />
          AI Suggested Updates
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] text-primary hover:text-primary"
          onClick={() => entries.forEach(([field, update]) => onAccept(field, (update as SuggestedFieldUpdate).value))}
        >
          Accept All
        </Button>
      </div>
      <div className="space-y-1.5">
        {entries.map(([field, update]) => {
          const suggestion = update as SuggestedFieldUpdate;
          const current = getCurrentValue(field);
          const proposed = formatValue(field, suggestion.value);
          const isChange = current !== proposed && current !== "Not set";

          return (
            <div key={field} className="rounded border border-border bg-background p-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-xs font-medium">{SUGGESTION_LABELS[field] || field}</span>
                  <span className="text-xs text-muted-foreground truncate">{current}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <Badge variant="default" className="text-[10px] shrink-0">{proposed}</Badge>
                </div>
                <div className="flex gap-0.5 shrink-0 ml-2">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => onAccept(field, suggestion.value)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDismiss(field)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{suggestion.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnrichmentSection({ enrichment, onEnrich, enriching, lead, onAcceptSuggestion, onDismissSuggestion }: {
  enrichment?: LeadEnrichment;
  onEnrich: () => void;
  enriching: boolean;
  lead: Lead;
  onAcceptSuggestion: (field: string, value: string | number) => void;
  onDismissSuggestion: (field: string) => void;
}) {
  if (!enrichment) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b border-border pb-1">External Research</h3>
        <Button onClick={onEnrich} disabled={enriching} variant="outline" size="sm" className="w-full gap-2">
          <Sparkles className="h-4 w-4" />
          {enriching ? "Researching..." : "Research & Recommend"}
        </Button>
        {enriching && (
          <div className="space-y-1">
            <Progress value={undefined} className="h-1.5 [&>div]:animate-pulse" />
            <p className="text-[10px] text-muted-foreground">Scraping website, researching prospect, generating recommendations...</p>
          </div>
        )}
        {!enriching && <p className="text-xs text-muted-foreground">Scrapes company website, searches the web for prospect intelligence, and recommends CRM field updates.</p>}
      </div>
    );
  }

  const hasSuggestions = enrichment.suggestedUpdates && Object.keys(enrichment.suggestedUpdates).length > 0;
  const [researchOpen, setResearchOpen] = useState(false);

  // Detect stale enrichment: meetings added after last research run
  const enrichedAt = enrichment.enrichedAt ? new Date(enrichment.enrichedAt).getTime() : 0;
  const meetingsAfterEnrichment = (lead.meetings || []).filter(m => {
    const addedAt = m.addedAt ? new Date(m.addedAt).getTime() : 0;
    return addedAt > enrichedAt;
  });
  const hadNoMeetings = enrichment.dataSources && !enrichment.dataSources.toLowerCase().includes("meeting");
  const nowHasMeetings = (lead.meetings || []).length > 0 && lead.meetings.some(m => m.intelligence);
  const isStale = meetingsAfterEnrichment.length > 0 || (hadNoMeetings && nowHasMeetings);
  const staleMeetingCount = meetingsAfterEnrichment.length || (lead.meetings || []).length;

  return (
    <div className="space-y-3">
      {/* Stale enrichment warning */}
      {isStale && !enriching && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-200 flex-1">
            Research ran before {staleMeetingCount} meeting(s) were added. Re-research to include meeting intelligence.
          </p>
          <Button onClick={(e) => { e.stopPropagation(); onEnrich(); }} variant="outline" size="sm" className="h-6 text-[10px] shrink-0 border-amber-500/40 text-amber-400 hover:bg-amber-500/20">
            Re-research
          </Button>
        </div>
      )}

      {/* AI Suggested Updates - always visible at top */}
      {hasSuggestions && (
        <AISuggestionsPanel
          suggestions={enrichment.suggestedUpdates!}
          lead={lead}
          onAccept={onAcceptSuggestion}
          onDismiss={onDismissSuggestion}
        />
      )}

      <Collapsible open={researchOpen} onOpenChange={setResearchOpen}>
        <div className="flex items-center justify-between border-b border-border pb-1">
          <CollapsibleTrigger className="flex items-center gap-1.5 group">
            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", researchOpen && "rotate-90")} />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">External Research</h3>
            {!researchOpen && (
              <span className="text-[10px] text-muted-foreground/60 ml-1">· {new Date(enrichment.enrichedAt).toLocaleDateString()}</span>
            )}
          </CollapsibleTrigger>
          <Button onClick={(e) => { e.stopPropagation(); onEnrich(); }} disabled={enriching} variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground">
            <RefreshCw className={`h-3 w-3 ${enriching ? "animate-spin" : ""}`} />
            {enriching ? "Researching..." : "Re-research"}
          </Button>
        </div>
        {enriching && (
          <div className="space-y-1 mt-1">
            <Progress value={undefined} className="h-1.5 [&>div]:animate-pulse" />
            <p className="text-[10px] text-muted-foreground">Re-researching prospect...</p>
          </div>
        )}

        <CollapsibleContent>
          <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-1 text-sm mt-2">
            {enrichment.companyDossier && enrichment.companyDossier !== "Not available from current data" && (
              <CollapsibleResearchSection icon={<Shield className="h-3.5 w-3.5" />} label="Company Dossier" content={enrichment.companyDossier} />
            )}
            {enrichment.prospectProfile && enrichment.prospectProfile !== "Not available from current data" && (
              <CollapsibleResearchSection icon={<Users className="h-3.5 w-3.5" />} label="Prospect Profile" content={enrichment.prospectProfile} />
            )}
            {enrichment.preMeetingAmmo && enrichment.preMeetingAmmo !== "Not available from current data" && (
              <CollapsibleResearchSection icon={<Zap className="h-3.5 w-3.5" />} label="Pre-Meeting Ammunition" content={enrichment.preMeetingAmmo} highlight />
            )}
            {enrichment.competitivePositioning && enrichment.competitivePositioning !== "Not available from current data" && (
              <CollapsibleResearchSection icon={<Target className="h-3.5 w-3.5" />} label="Competitive Positioning" content={enrichment.competitivePositioning} />
            )}
            {enrichment.companyDescription && enrichment.companyDescription !== "Not available from current data" && (
              <CollapsibleResearchSection label="Company Overview" content={enrichment.companyDescription} />
            )}
            {enrichment.acquisitionCriteria && enrichment.acquisitionCriteria !== "Not available from current data" && (
              <CollapsibleResearchSection label="Acquisition Criteria" content={enrichment.acquisitionCriteria} />
            )}
            {enrichment.buyerMotivation && enrichment.buyerMotivation !== "Not available from current data" && (
              <CollapsibleResearchSection label="Buyer Motivation" content={enrichment.buyerMotivation} />
            )}
            {enrichment.urgency && enrichment.urgency !== "Not available from current data" && (
              <CollapsibleResearchSection label="Urgency" content={enrichment.urgency} />
            )}
            {enrichment.decisionMakers && enrichment.decisionMakers !== "Not available from current data" && (
              <CollapsibleResearchSection icon={<Users className="h-3.5 w-3.5" />} label="Key People" content={enrichment.decisionMakers} />
            )}
            {enrichment.competitorTools && enrichment.competitorTools !== "Not available from current data" && (
              <CollapsibleResearchSection label="Other Advisors/Tools" content={enrichment.competitorTools} />
            )}
            {enrichment.keyInsights && (
              <CollapsibleResearchSection label="Key Insights" content={enrichment.keyInsights} />
            )}
            <div className="pt-1 border-t border-border/50 space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Researched {new Date(enrichment.enrichedAt).toLocaleDateString()}</p>
              {enrichment.dataSources && (
                <p className="text-[10px] text-muted-foreground">Sources: {enrichment.dataSources}</p>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

  // M: LinkedIn coverage stats
  const linkedinStats = useMemo(() => {
    const total = leads.length;
    const found = leads.filter(l => l.linkedinUrl && l.linkedinUrl.includes("linkedin.com/in/")).length;
    const notFound = leads.filter(l => l.linkedinUrl === "").length;
    const pending = total - found - notFound;
    const pct = total > 0 ? Math.round((found / total) * 100) : 0;
    return { total, found, notFound, pending, pct };
  }, [leads]);

function CollapsibleResearchSection({ icon, label, content, highlight }: { icon?: React.ReactNode; label: string; content: string; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const preview = content.length > 90 ? content.slice(0, 90).trim() + "…" : content;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={cn(
        "w-full flex items-center gap-1.5 py-1.5 px-2 rounded-md text-left transition-colors hover:bg-background/60",
        highlight && "border border-primary/20 bg-primary/5"
      )}>
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
        {icon && <span className={highlight ? "text-primary" : "text-muted-foreground"}>{icon}</span>}
        <span className={cn("text-xs font-medium uppercase tracking-wider", highlight ? "text-primary" : "text-muted-foreground")}>{label}</span>
        {!open && <span className="text-xs text-muted-foreground/60 truncate ml-1 font-normal normal-case">{preview}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn(
          "rounded-md p-2.5 ml-4 mt-1 mb-1",
          highlight ? "border border-primary/20 bg-primary/5" : "border border-border bg-background/50"
        )}>
          <p className="text-sm leading-relaxed whitespace-pre-line">{content}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EnrichField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line">{value}</p>
    </div>
  );
}

function SubmissionHistory({ submissions, currentLead }: { submissions: Submission[]; currentLead: Lead }) {
  const [expanded, setExpanded] = useState(false);
  const brands = new Set(submissions.map(s => s.brand));
  const brandLabel = brands.size > 1 ? "CT + SC" : brands.values().next().value === "Captarget" ? "CT" : "SC";

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between border-b border-border pb-1 group"
      >
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Submission History ({submissions.length})
        </h3>
        <span className="text-xs text-muted-foreground">{expanded ? "▾" : "▸"} {brandLabel}</span>
      </button>
      {expanded && (
        <div className="space-y-3">
          {submissions.map((sub, i) => {
            const isLatest = i === submissions.length - 1;
            const prev = i > 0 ? submissions[i - 1] : null;
            const brandAbbr = sub.brand === "Captarget" ? "CT" : "SC";
            const sourceLabel = SOURCE_LABELS[sub.source] || sub.source;

            // Detect changed fields from previous submission
            const changes: string[] = [];
            if (prev) {
              if (prev.role !== sub.role && sub.role) changes.push("role");
              if (prev.message !== sub.message && sub.message) changes.push("message");
              if (prev.dealsPlanned !== sub.dealsPlanned && sub.dealsPlanned) changes.push("deals");
              if (prev.targetRevenue !== sub.targetRevenue && sub.targetRevenue) changes.push("revenue");
              if (prev.geography !== sub.geography && sub.geography) changes.push("geography");
              if (prev.targetCriteria !== sub.targetCriteria && sub.targetCriteria) changes.push("criteria");
              if (prev.currentSourcing !== sub.currentSourcing && sub.currentSourcing) changes.push("sourcing");
              if (prev.acquisitionStrategy !== sub.acquisitionStrategy && sub.acquisitionStrategy) changes.push("strategy");
              if (prev.phone !== sub.phone && sub.phone) changes.push("phone");
            }

            return (
              <div key={i} className={cn(
                "rounded-md border p-3 space-y-1.5 text-sm",
                isLatest ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/20"
              )}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{sourceLabel}</span>
                  <span className="text-xs text-muted-foreground">· {sub.dateSubmitted}</span>
                  {isLatest && <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">Latest</Badge>}
                </div>
                {sub.message && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    "{sub.message.length > 200 ? sub.message.slice(0, 200) + "…" : sub.message}"
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {sub.role && <span>Role: {sub.role}</span>}
                  {sub.dealsPlanned && <span>Deals: {sub.dealsPlanned}</span>}
                  {sub.targetRevenue && <span>Rev: {sub.targetRevenue}</span>}
                  {sub.geography && <span>Geo: {sub.geography}</span>}
                </div>
                {changes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {changes.map(c => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                        ← {c} changed
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b border-border pb-1">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function SelectField({ label, value, options, onChange, placeholder }: { label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1"><SelectValue placeholder={placeholder || label} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function ClearableSelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="mt-1"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function LeadsTable() {
  const { leads, addLead, isLeadNew, markLeadSeen, archiveLead, refreshLeads } = useLeads();
  const { startBulkProcessing } = useProcessing();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showFireflies, setShowFireflies] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [scoringAll, setScoringAll] = useState(false);
  const [linkedinEnriching, setLinkedinEnriching] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [archivedLeads, setArchivedLeads] = useState<any[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("dateSubmitted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    const filtered = leads.filter((l) => {
      const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.email.toLowerCase().includes(search.toLowerCase()) || l.company.toLowerCase().includes(search.toLowerCase());
      const matchStage = stageFilter === "all" || l.stage === stageFilter;
      const matchBrand = brandFilter === "all" || l.brand === brandFilter;
      return matchSearch && matchStage && matchBrand;
    });

    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name": return dir * a.name.localeCompare(b.name);
        case "company": return dir * (a.company || "").localeCompare(b.company || "");
        case "role": return dir * a.role.localeCompare(b.role);
        case "stage": return dir * STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) * (dir > 0 ? 1 : -1) || 0;
        case "dealValue": return dir * (a.dealValue - b.dealValue);
        case "days": return dir * (computeDaysInStage(a.stageEnteredDate) - computeDaysInStage(b.stageEnteredDate));
        case "priority": return dir * ((PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));
        case "dateSubmitted": return dir * (a.createdAt || a.dateSubmitted).localeCompare(b.createdAt || b.dateSubmitted);
        case "source": return dir * a.source.localeCompare(b.source);
        case "serviceInterest": return dir * a.serviceInterest.localeCompare(b.serviceInterest);
        case "score": return dir * ((a.stage2Score ?? a.stage1Score ?? -1) - (b.stage2Score ?? b.stage1Score ?? -1));
        case "tier": return dir * ((a.tier ?? 99) - (b.tier ?? 99));
        default: return 0;
      }
    });
  }, [leads, search, stageFilter, brandFilter, sortKey, sortDir]);

  const exportCSV = () => {
    const headers = ["Brand","Name","Email","Phone","Company","Role","Source","Date Submitted","Stage","Service Interest","Deal Value","Subscription Value","Billing Frequency","Contract Start","Contract End","Lead Score","Tier","Priority","Assigned To","Meeting Date","Meeting Outcome","Forecast Category","ICP Fit","Days In Stage","Hours To Meeting Set","Close Reason","Won Reason","Lost Reason","Closed Date","Last Contact","Next Follow-up","Duplicate","Meetings","Enriched","Momentum","Notes"];
    const rows = leads.map((l) => {
      const avgTalk = l.meetings?.length ? Math.round(l.meetings.filter(m => m.intelligence?.talkRatio).reduce((s, m) => s + (m.intelligence?.talkRatio || 0), 0) / l.meetings.filter(m => m.intelligence?.talkRatio).length) || "" : "";
      return [
        l.brand, l.name, l.email, l.phone, l.company, l.role, l.source, l.dateSubmitted, l.stage, l.serviceInterest,
        l.dealValue || "", l.subscriptionValue || "", l.billingFrequency || "", l.contractStart || "", l.contractEnd || "",
        l.stage2Score ?? l.stage1Score ?? "", l.tier ?? "",
        l.priority, l.assignedTo, l.meetingDate, l.meetingOutcome, l.forecastCategory,
        l.icpFit, computeDaysInStage(l.stageEnteredDate), l.hoursToMeetingSet ?? "", l.closeReason, l.wonReason, l.lostReason,
        l.closedDate, l.lastContactDate, l.nextFollowUp, l.isDuplicate ? "Yes" : "",
        l.meetings?.length || 0, l.enrichment ? "Yes" : "No",
        l.dealIntelligence?.momentumSignals?.momentum || "",
        `"${(l.notes || "").replace(/"/g, '""')}"`
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-export-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const unscoredCount = useMemo(() => leads.filter(l => l.stage1Score == null).length, [leads]);

  const handleScoreAll = async () => {
    setScoringAll(true);
    try {
      let totalScored = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("backfill-lead-scores");
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        totalScored += data?.scored || 0;
        hasMore = data?.hasMore || false;
      }
      toast.success(`Scored ${totalScored} lead${totalScored !== 1 ? "s" : ""}`);
    } catch (e: any) {
      console.error("Score all failed:", e);
      toast.error(e.message || "Failed to score leads");
    } finally {
      setScoringAll(false);
    }
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "role", label: "Role" },
    { key: "stage", label: "Stage" },
    { key: "serviceInterest", label: "Service" },
    { key: "dealValue", label: "Value" },
    { key: "days", label: "Days" },
    { key: "score", label: "Score" },
    { key: "tier", label: "Tier" },
    { key: "priority", label: "Priority" },
    { key: "dateSubmitted", label: "Date" },
    { key: "source", label: "Source" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">{sorted.length} of {leads.length} leads</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={backfilling} onClick={async () => {
            setBackfilling(true);
            toast.info("Starting backfill — syncing Calendly then scanning Fireflies...");
            try {
              // 1. Clean up zombie jobs (stuck >15min)
              const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
              await supabase.from("processing_jobs")
                .update({ acknowledged: true, status: "failed", error: "Timed out (zombie cleanup)" })
                .in("status", ["queued", "processing"])
                .lt("created_at", fifteenMinAgo);

              // 2. Calendly sync
              toast.info("Running Calendly sync...");
              const res = await supabase.functions.invoke("backfill-calendly");
              const calendlyResults = res.data?.results?.filter((r: any) => r.status === "advanced_to_meeting_set" || r.status === "stamped_only") || [];
              toast.success(`Calendly: ${calendlyResults.length} matches found`);

               // 3. Refresh context so startBulkProcessing uses fresh data
               await refreshLeads();

               // 4. Fresh DB query for unprocessed leads (all stages, not just New Lead)
               const { data: freshLeads } = await supabase.from("leads").select("id, meetings").is("archived_at", null);
               const { data: doneJobs } = await supabase.from("processing_jobs").select("lead_id").in("status", ["done", "completed"]).neq("new_meetings", "[]");
               const doneIds = new Set((doneJobs || []).map((r: any) => r.lead_id));
               const unprocessed = (freshLeads || []).filter((l: any) => {
                 const meetings = Array.isArray(l.meetings) ? l.meetings : [];
                 return meetings.length === 0 && !doneIds.has(l.id);
               });

               if (unprocessed.length > 0) {
                 toast.info(`Queuing ${unprocessed.length} leads for Fireflies search...`);
                 startBulkProcessing(unprocessed.length);
              } else {
                toast.success("All leads already processed!");
              }
            } catch (err) {
              toast.error("Backfill failed: " + (err as Error).message);
            } finally {
              setBackfilling(false);
            }
          }}>
            {backfilling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {backfilling ? "Backfilling..." : "Backfill All Meetings"}
          </Button>
          {unscoredCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleScoreAll} disabled={scoringAll}>
              <Target className="w-4 h-4" />
              {scoringAll ? "Scoring..." : `Score ${unscoredCount} Leads`}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={linkedinEnriching} onClick={async () => {
            setLinkedinEnriching(true);
            toast.info("Starting LinkedIn enrichment for all unenriched leads...");
            try {
              const { data, error } = await supabase.functions.invoke("backfill-linkedin", { body: { retry_failed: true } });
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              const found = data?.results?.filter((r: any) => r.linkedin_url)?.length || 0;
              const total = data?.results?.length || 0;
              toast.success(`LinkedIn enrichment complete: ${found}/${total} profiles found`);
              refreshLeads();
            } catch (err) {
              toast.error("LinkedIn enrichment failed: " + (err as Error).message);
            } finally {
              setLinkedinEnriching(false);
            }
          }}>
            {linkedinEnriching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Linkedin className="w-4 h-4" />}
            {linkedinEnriching ? "Enriching..." : "LinkedIn Enrich"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowBulk(true)}>
            <Zap className="w-4 h-4" /> Process Leads
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFireflies(true)}><img src="/fireflies-icon.svg" alt="" className="w-4 h-4" /> Import Fireflies</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
          <Button size="sm" onClick={() => setShowNewLead(true)}>New Lead</Button>
        </div>
      </div>
      {scoringAll && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Target className="h-3.5 w-3.5 animate-pulse text-primary" />
            <span>Scoring leads in batches...</span>
          </div>
          <Progress value={undefined} className="h-1.5 [&>div]:animate-pulse" />
        </div>
      )}

      <div className="flex gap-3 items-center">
        <div className="flex rounded-md border border-border overflow-hidden mr-2">
          <button
            onClick={() => setViewMode("active")}
            className={cn("px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "active" ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted")}
          >Active</button>
          <button
            onClick={() => {
              setViewMode("archived");
              setLoadingArchived(true);
              supabase.from("leads").select("id, name, company, stage, archive_reason, archived_at, brand").not("archived_at", "is", null).order("archived_at", { ascending: false }).then(({ data }) => {
                setArchivedLeads(data || []);
                setLoadingArchived(false);
              });
            }}
            className={cn("px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "archived" ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted")}
          >Archived</button>
        </div>
        {viewMode === "active" && (
          <>
            <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Stages" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="All Brands" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                <SelectItem value="Captarget">Captarget</SelectItem>
                <SelectItem value="SourceCo">SourceCo</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {viewMode === "archived" ? (
        <div className="border border-border rounded-md overflow-x-auto">
          {loadingArchived ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading archived leads...</div>
          ) : archivedLeads.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No archived leads</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Stage</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Archive Reason</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Archived</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {archivedLeads.map((al: any) => (
                  <tr key={al.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <BrandLogo brand={al.brand} size="xxs" />
                        {al.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{al.company || "—"}</td>
                    <td className="px-4 py-3 text-xs">{al.stage}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{al.archive_reason || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{al.archived_at ? format(parseISO(al.archived_at), "MMM d, yyyy") : "—"}</td>
                    <td className="px-2 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          supabase.from("leads").update({ archived_at: null, archive_reason: '' } as any).eq("id", al.id).then(({ error }) => {
                            if (error) { toast.error("Failed to restore"); return; }
                            setArchivedLeads(prev => prev.filter(a => a.id !== al.id));
                            refreshLeads();
                            toast.success(`${al.name} restored`);
                          });
                        }}
                      >Restore</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
      <div className="border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none transition-colors"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((lead) => (
              <tr key={lead.id} onClick={() => { setSelectedLeadId(lead.id); markLeadSeen(lead.id); }} className={cn("cursor-pointer hover:bg-secondary/30 transition-colors", getBrandBorderClass(lead.brand))}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div>
                      <div className="font-medium flex items-center gap-1.5">
                        <BrandLogo brand={lead.brand} size="xxs" />
                        {lead.name}
                        {lead.linkedinUrl && (
                          <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={lead.linkedinTitle || "LinkedIn Profile"}>
                            <Linkedin className="h-3.5 w-3.5 text-[#0A66C2] hover:opacity-70 transition-opacity" />
                          </a>
                        )}
                        {isLeadNew(lead.id) && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 animate-pulse">NEW</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </div>
                    {lead.isDuplicate && <span className="text-[10px] px-1 py-0.5 bg-secondary rounded ml-1">DUP</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground"><span className="flex items-center gap-1.5"><CompanyAvatar companyUrl={lead.companyUrl} email={lead.email} companyName={lead.company} size="xs" />{lead.company || "—"}</span></td>
                <td className="px-4 py-3 text-muted-foreground">{lead.role}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs px-1.5 py-0.5 border border-border rounded w-fit">{lead.stage}</span>
                    {lead.calendlyBookedAt && (
                      <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium whitespace-nowrap">
                        <CalendarCheck className="h-3 w-3 shrink-0" />
                        {lead.calendlyEventName || "Calendly"}{lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration}m` : ""}{lead.meetingDate ? ` · ${(() => { try { return format(parseISO(lead.meetingDate), "MMM d, h:mm a"); } catch { return ""; } })()}` : ""}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.serviceInterest !== "TBD" ? lead.serviceInterest : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{computeDaysInStage(lead.stageEnteredDate)}d</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{lead.stage2Score ?? lead.stage1Score ?? "—"}</td>
                <td className="px-4 py-3">
                  {lead.tier != null ? (
                    <span className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded",
                      lead.tier === 1 && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                      lead.tier === 2 && "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                      lead.tier === 3 && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      lead.tier === 4 && "bg-orange-500/15 text-orange-700 dark:text-orange-400",
                      lead.tier === 5 && "bg-red-500/15 text-red-700 dark:text-red-400",
                    )}>T{lead.tier}</span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-xs">{lead.priority}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.createdAt ? format(parseISO(lead.createdAt), "MMM d, h:mm a") : lead.dateSubmitted}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{SOURCE_LABELS[lead.source] || lead.source}</td>
                <td className="px-2 py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); setArchiveTarget({ id: lead.id, name: lead.name }); }}
                    className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Archive lead"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      <NewLeadDialog open={showNewLead} onClose={() => setShowNewLead(false)} onSave={addLead} />
      <FirefliesImportDialog open={showFireflies} onOpenChange={setShowFireflies} />
      <BulkProcessingDialog open={showBulk} onOpenChange={setShowBulk} />
      <ArchiveDialog
        open={!!archiveTarget}
        leadName={archiveTarget?.name || ""}
        onConfirm={(reason) => { if (archiveTarget) { archiveLead(archiveTarget.id, reason); setArchiveTarget(null); } }}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

function NewLeadDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (lead: any) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", companyUrl: "", role: "", message: "", dealsPlanned: "0-2" });
  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.name || !form.email) return;
    const today = new Date().toISOString().split("T")[0];
    onSave({
      brand: "Captarget" as Brand,
      name: form.name, email: form.email, phone: form.phone, company: form.company,
      companyUrl: form.companyUrl, role: form.role, message: form.message, dealsPlanned: form.dealsPlanned,
      source: "CT Contact Form" as LeadSource, dateSubmitted: today,
      stage: "New Lead" as LeadStage, serviceInterest: "TBD" as const, dealValue: 0, assignedTo: "",
      meetingDate: "", meetingSetDate: "", closeReason: "" as const, closedDate: "", notes: "",
      lastContactDate: "", nextFollowUp: "", priority: "Medium" as const,
      meetingOutcome: "" as const, forecastCategory: "" as const, icpFit: "" as const, preScreenCompleted: false,
      wonReason: "", lostReason: "", targetCriteria: "", targetRevenue: "", geography: "", currentSourcing: "",
      isDuplicate: false, duplicateOf: "", hearAboutUs: "", acquisitionStrategy: "", buyerType: "",
      meetings: [],
      subscriptionValue: 0, billingFrequency: "" as const, contractStart: "", contractEnd: "",
      firefliesUrl: "", firefliesTranscript: "", firefliesSummary: "", firefliesNextSteps: "",
      stage1Score: null, stage2Score: null, tier: null, tierOverride: false, enrichmentStatus: "",
      linkedinUrl: "", linkedinTitle: "", createdAt: new Date().toISOString(),
      calendlyBookedAt: "",
    });
    setForm({ name: "", email: "", phone: "", company: "", companyUrl: "", role: "", message: "", dealsPlanned: "0-2" });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="sm:max-w-md" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>New Lead</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder="Name *" value={form.name} onChange={(e) => update("name", e.target.value)} />
          <Input placeholder="Email *" value={form.email} onChange={(e) => update("email", e.target.value)} />
          <Input placeholder="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          <Input placeholder="Company" value={form.company} onChange={(e) => update("company", e.target.value)} />
          <Input placeholder="Role" value={form.role} onChange={(e) => update("role", e.target.value)} />
          <Textarea placeholder="Message / Notes" value={form.message} onChange={(e) => update("message", e.target.value)} rows={3} />
          <Button onClick={handleSave} className="w-full" disabled={!form.name || !form.email}>Create Lead</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Company Activity Section ───

function CompanyActivitySection({ lead, allLeads, onSelectLead }: { lead: Lead; allLeads: Lead[]; onSelectLead: (id: string) => void }) {
  const associates = getCompanyAssociates(lead, allLeads);
  if (associates.length === 0) return null;

  const shared = getSharedIntelligence([lead, ...associates]);
  const trunc = (s: string) => s.length > 80 ? s.slice(0, 77) + "…" : s;

  return (
    <Section title={`Company Activity · ${lead.company}`}>
      <p className="text-xs text-muted-foreground mb-2">
        {associates.length + 1} contacts at this company · {shared.totalMeetings} total meeting{shared.totalMeetings !== 1 ? "s" : ""}
      </p>

      {/* Associated contacts */}
      <div className="space-y-1.5">
        {associates.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-sm border border-border rounded px-2.5 py-1.5">
            <div className="min-w-0">
              <span className="font-medium">{a.name}</span>
              <span className="text-muted-foreground ml-1.5">· {a.role}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-[10px]">{a.stage}</Badge>
              {a.meetings?.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{a.meetings.length} mtg{a.meetings.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Shared intelligence highlights */}
      {(shared.objections.length > 0 || shared.painPoints.length > 0) && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shared Intelligence</p>
          {shared.objections.map((o, i) => (
            <p key={`o-${i}`} className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3 shrink-0" /> {trunc(o)}</p>
          ))}
          {shared.painPoints.map((p, i) => (
            <p key={`p-${i}`} className="text-xs text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3 shrink-0" /> {trunc(p)}</p>
          ))}
        </div>
      )}
    </Section>
  );
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  stage_change: <GitCommit className="h-3.5 w-3.5 text-primary" />,
  field_update: <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />,
  meeting_added: <Calendar className="h-3.5 w-3.5 text-primary" />,
  note_added: <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />,
  enrichment_run: <Sparkles className="h-3.5 w-3.5 text-primary" />,
  bulk_update: <Users className="h-3.5 w-3.5 text-muted-foreground" />,
};

function ActivityTimeline({ leadId, refreshKey = 0 }: { leadId: string; refreshKey?: number }) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchActivityLog(leadId).then((data) => {
      if (!cancelled) {
        setEntries(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [leadId, refreshKey]);

  if (loading) return <p className="text-xs text-muted-foreground py-4 text-center">Loading activity…</p>;
  if (entries.length === 0) return <p className="text-xs text-muted-foreground py-4 text-center">No activity recorded yet</p>;

  return (
    <div className="space-y-1 py-2">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2.5 py-1.5 border-b border-border/50 last:border-0">
          <div className="mt-0.5 shrink-0">
            {EVENT_ICONS[entry.event_type] || <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed">{entry.description}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {new Date(entry.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
