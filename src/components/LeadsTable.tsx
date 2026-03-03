import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead, LeadStage, LeadSource, ServiceInterest, CloseReason, MeetingOutcome, ForecastCategory, IcpFit, Brand, DealOwner, LeadEnrichment, BillingFrequency, SuggestedUpdates, SuggestedFieldUpdate } from "@/types/lead";
import { toast } from "sonner";
import { MeetingsSection } from "@/components/MeetingsSection";
import { DealIntelligencePanel } from "@/components/DealIntelligencePanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeDaysInStage } from "@/lib/leadUtils";
import { FirefliesImportDialog } from "@/components/FirefliesImport";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, Shield, Users, Target, BarChart3, Check, X, ArrowRight, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

type SortKey = "name" | "company" | "stage" | "dealValue" | "days" | "priority" | "dateSubmitted" | "source" | "serviceInterest" | "role";
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
  const lead = leads.find((l) => l.id === leadId) || null;
  const [enriching, setEnriching] = useState(false);
  if (!lead) return null;

  const save = (updates: Partial<Lead>) => updateLead(lead.id, updates);
  const days = computeDaysInStage(lead.stageEnteredDate);
  const duplicate = lead.isDuplicate ? leads.find((l) => l.id === lead.duplicateOf) : null;

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
    setEnriching(true);
    try {
      const meetingIntel = aggregateMeetingIntelligence();
      const { data, error } = await supabase.functions.invoke("enrich-lead", {
        body: {
          companyUrl: lead.companyUrl,
          meetings: lead.meetings || [],
          leadName: lead.name,
          leadMessage: lead.message,
          leadRole: lead.role,
          leadCompany: lead.company,
          // Full lead context
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
          // Aggregated meeting intelligence
          meetingIntelligence: meetingIntel,
          // Accumulated deal intelligence
          dealIntelligence: lead.dealIntelligence || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.enrichment) {
        save({ enrichment: data.enrichment });
        const suggestions = data.enrichment.suggestedUpdates;
        const hasSuggestions = suggestions && Object.keys(suggestions).length > 0;
        toast.success(hasSuggestions ? "Lead enriched — review AI suggested updates" : "Lead enriched with AI intelligence");
      }
    } catch (e: any) {
      console.error("Enrichment failed:", e);
      toast.error(e.message || "Failed to enrich lead");
    } finally {
      setEnriching(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="overflow-y-auto" aria-describedby={undefined}>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-1.5 py-0.5 border border-border rounded">{lead.brand === "Captarget" ? "CT" : "SC"}</span>
            <SheetTitle className="text-lg font-semibold">{lead.name}</SheetTitle>
          </div>
          <p className="text-sm text-muted-foreground">{lead.role} · {lead.company || "No company"}</p>
          {lead.isDuplicate && (
            <p className="text-xs text-muted-foreground mt-1">⚑ Cross-brand duplicate{duplicate ? ` — also submitted via ${duplicate.brand} (${duplicate.source})` : ""}</p>
          )}
        </SheetHeader>

        <div className="space-y-8 mt-4">
          {/* Deal Health Alerts */}
          <DealHealthAlerts lead={lead} />

          {/* Deal Progress Bar */}
          <DealProgressBar currentStage={lead.stage} />

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
              <Field label="Source" value={SOURCE_LABELS[lead.source] || lead.source} />
              <Field label="Brand" value={lead.brand} />
              <Field label="Submitted" value={lead.dateSubmitted} />
              <Field label="Deals Planned" value={lead.dealsPlanned || "—"} />
              {lead.hearAboutUs && <Field label="Heard About Us" value={lead.hearAboutUs} />}
            </div>
          </Section>

          {/* Cross-Brand Submission */}
          {lead.isDuplicate && duplicate && (
            <Section title={`Also submitted via ${duplicate.brand}`}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Source" value={SOURCE_LABELS[duplicate.source] || duplicate.source} />
                <Field label="Submitted" value={duplicate.dateSubmitted} />
              </div>
              {duplicate.message && (
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{duplicate.message.length > 200 ? duplicate.message.slice(0, 200) + "…" : duplicate.message}</p>
              )}
            </Section>
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

          {/* Meetings (Multi-meeting with AI processing) */}
          <MeetingsSection lead={lead} />

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
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b border-border pb-1">AI Intelligence</h3>
        <Button onClick={onEnrich} disabled={enriching} variant="outline" size="sm" className="w-full gap-2">
          <Sparkles className="h-4 w-4" />
          {enriching ? "Enriching..." : "Enrich with AI"}
        </Button>
        <p className="text-xs text-muted-foreground">Analyzes transcripts, deal fields, company website, and web data to synthesize deal intelligence.</p>
      </div>
    );
  }

  const hasScorecard = enrichment.dealHealthScore || enrichment.engagementTrend || enrichment.likelihoodToClose;
  const hasSuggestions = enrichment.suggestedUpdates && Object.keys(enrichment.suggestedUpdates).length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">AI Intelligence</h3>
        <Button onClick={onEnrich} disabled={enriching} variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground">
          <RefreshCw className={`h-3 w-3 ${enriching ? "animate-spin" : ""}`} />
          {enriching ? "Enriching..." : "Re-enrich"}
        </Button>
      </div>

      {/* AI Suggested Updates - shown at top for visibility */}
      {hasSuggestions && (
        <AISuggestionsPanel
          suggestions={enrichment.suggestedUpdates!}
          lead={lead}
          onAccept={onAcceptSuggestion}
          onDismiss={onDismissSuggestion}
        />
      )}

      <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-3 text-sm">
        {/* Deal Scorecard */}
        {hasScorecard && (
          <div className="rounded-md border border-border bg-background/50 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <BarChart3 className="h-3.5 w-3.5" />
              Deal Scorecard
            </div>
            <div className="grid grid-cols-3 gap-2">
              {enrichment.dealHealthScore && (
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Health</p>
                  <ScorecardBadge value={enrichment.dealHealthScore} />
                </div>
              )}
              {enrichment.engagementTrend && (
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Engagement</p>
                  <ScorecardBadge value={enrichment.engagementTrend} />
                </div>
              )}
              {enrichment.likelihoodToClose && (
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Close Likelihood</p>
                  <ScorecardBadge value={enrichment.likelihoodToClose} />
                </div>
              )}
            </div>
          </div>
        )}

        {enrichment.companyDescription && enrichment.companyDescription !== "Not available from current data" && (
          <EnrichField label="Company" value={enrichment.companyDescription} />
        )}
        {enrichment.acquisitionCriteria && enrichment.acquisitionCriteria !== "Not available from current data" && (
          <EnrichField label="Acquisition Criteria" value={enrichment.acquisitionCriteria} />
        )}
        {enrichment.buyerMotivation && enrichment.buyerMotivation !== "Not available from current data" && (
          <EnrichField label="Buyer Motivation" value={enrichment.buyerMotivation} />
        )}
        {enrichment.urgency && enrichment.urgency !== "Not available from current data" && (
          <EnrichField label="Urgency" value={enrichment.urgency} />
        )}
        {enrichment.decisionMakers && enrichment.decisionMakers !== "Not available from current data" && (
          <EnrichField label="Decision Makers" value={enrichment.decisionMakers} icon={<Users className="h-3.5 w-3.5" />} />
        )}

        {enrichment.objectionsSummary && enrichment.objectionsSummary !== "Not available from current data" && (
          <EnrichField label="Objections" value={enrichment.objectionsSummary} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        )}
        {enrichment.dealRiskAssessment && enrichment.dealRiskAssessment !== "Not available from current data" && (
          <EnrichField label="Risk Assessment" value={enrichment.dealRiskAssessment} icon={<Shield className="h-3.5 w-3.5" />} />
        )}
        {enrichment.recommendedNextActions && enrichment.recommendedNextActions !== "Not available from current data" && (
          <EnrichField label="Recommended Actions" value={enrichment.recommendedNextActions} icon={<Target className="h-3.5 w-3.5" />} />
        )}
        {enrichment.competitiveLandscape && enrichment.competitiveLandscape !== "Not available from current data" && (
          <EnrichField label="Competitive Landscape" value={enrichment.competitiveLandscape} />
        )}
        {enrichment.relationshipMap && enrichment.relationshipMap !== "Not available from current data" && (
          <EnrichField label="Relationship Map" value={enrichment.relationshipMap} icon={<Users className="h-3.5 w-3.5" />} />
        )}
        {enrichment.sentimentAnalysis && enrichment.sentimentAnalysis !== "Not available from current data" && (
          <EnrichField label="Sentiment Analysis" value={enrichment.sentimentAnalysis} icon={<TrendingUp className="h-3.5 w-3.5" />} />
        )}
        {enrichment.competitorTools && enrichment.competitorTools !== "Not available from current data" && (
          <EnrichField label="Competitor Tools" value={enrichment.competitorTools} />
        )}
        {enrichment.keyInsights && (
          <EnrichField label="Key Insights" value={enrichment.keyInsights} />
        )}
        <div className="pt-1 border-t border-border/50 space-y-0.5">
          <p className="text-[10px] text-muted-foreground">Enriched {new Date(enrichment.enrichedAt).toLocaleDateString()}</p>
          {enrichment.dataSources && (
            <p className="text-[10px] text-muted-foreground">Sources: {enrichment.dataSources}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ScorecardBadge({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const variant = lower.includes("high") || lower.includes("strong") || lower.includes("good")
    ? "default"
    : lower.includes("low") || lower.includes("poor") || lower.includes("weak") || lower.includes("at risk")
      ? "destructive"
      : "secondary";
  return <Badge variant={variant} className="text-[10px] mt-0.5">{value}</Badge>;
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
  const { leads, addLead } = useLeads();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showFireflies, setShowFireflies] = useState(false);
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
        case "dateSubmitted": return dir * a.dateSubmitted.localeCompare(b.dateSubmitted);
        case "source": return dir * a.source.localeCompare(b.source);
        case "serviceInterest": return dir * a.serviceInterest.localeCompare(b.serviceInterest);
        default: return 0;
      }
    });
  }, [leads, search, stageFilter, brandFilter, sortKey, sortDir]);

  const exportCSV = () => {
    const headers = ["Brand","Name","Email","Phone","Company","Role","Source","Date Submitted","Stage","Service Interest","Deal Value","Priority","Assigned To","Meeting Date","Meeting Outcome","Forecast Category","ICP Fit","Days In Stage","Hours To Meeting Set","Close Reason","Won Reason","Lost Reason","Closed Date","Last Contact","Next Follow-up","Duplicate","Notes"];
    const rows = leads.map((l) => [
      l.brand, l.name, l.email, l.phone, l.company, l.role, l.source, l.dateSubmitted, l.stage, l.serviceInterest,
      l.dealValue || "", l.priority, l.assignedTo, l.meetingDate, l.meetingOutcome, l.forecastCategory,
      l.icpFit, computeDaysInStage(l.stageEnteredDate), l.hoursToMeetingSet ?? "", l.closeReason, l.wonReason, l.lostReason,
      l.closedDate, l.lastContactDate, l.nextFollowUp, l.isDuplicate ? "Yes" : "", `"${(l.notes || "").replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-export-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "role", label: "Role" },
    { key: "stage", label: "Stage" },
    { key: "serviceInterest", label: "Service" },
    { key: "dealValue", label: "Value" },
    { key: "days", label: "Days" },
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
          <Button variant="outline" size="sm" onClick={() => setShowFireflies(true)}><img src="/fireflies-icon.svg" alt="" className="w-4 h-4" /> Import Fireflies</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
          <Button size="sm" onClick={() => setShowNewLead(true)}>New Lead</Button>
        </div>
      </div>

      <div className="flex gap-3">
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
      </div>

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
              <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)} className="cursor-pointer hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono px-1 py-0.5 border border-border rounded shrink-0">{lead.brand === "Captarget" ? "CT" : "SC"}</span>
                    <div>
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </div>
                    {lead.isDuplicate && <span className="text-[10px] px-1 py-0.5 bg-secondary rounded ml-1">DUP</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{lead.company || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{lead.role}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-1.5 py-0.5 border border-border rounded">{lead.stage}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.serviceInterest !== "TBD" ? lead.serviceInterest : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{computeDaysInStage(lead.stageEnteredDate)}d</td>
                <td className="px-4 py-3 text-xs">{lead.priority}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.dateSubmitted}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{SOURCE_LABELS[lead.source] || lead.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      <NewLeadDialog open={showNewLead} onClose={() => setShowNewLead(false)} onSave={addLead} />
      <FirefliesImportDialog open={showFireflies} onOpenChange={setShowFireflies} />
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
      meetingOutcome: "" as const, forecastCategory: "" as const, icpFit: "" as const,
      wonReason: "", lostReason: "", targetCriteria: "", targetRevenue: "", geography: "", currentSourcing: "",
      isDuplicate: false, duplicateOf: "", hearAboutUs: "", acquisitionStrategy: "", buyerType: "",
      meetings: [],
      firefliesUrl: "", firefliesTranscript: "", firefliesSummary: "", firefliesNextSteps: "",
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
