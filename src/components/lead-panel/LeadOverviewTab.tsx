import { Lead, LeadStage, ServiceInterest, CloseReason, MeetingOutcome, ForecastCategory, IcpFit, DealOwner, BillingFrequency } from "@/types/lead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Check, X, ArrowRight, RefreshCw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Section, Field, SelectField, ClearableSelectField, EnrichmentSection, DealHealthAlerts } from "./shared";
import { useProcessing } from "@/contexts/ProcessingContext";

const STAGES: LeadStage[] = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Revisit/Reconnect", "Lost", "Went Dark", "Closed Won"];
const SERVICES: ServiceInterest[] = ["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "SourceCo Retained Search", "Other", "TBD"];
const PRIORITIES = ["High", "Medium", "Low"] as const;
const OWNERS: DealOwner[] = ["Malik", "Valeria", "Tomos"];
const CLOSE_REASONS: CloseReason[] = ["Budget", "Timing", "Competitor", "No Fit", "No Response", "Not Qualified", "Champion Left", "Other"];
const MEETING_OUTCOMES: MeetingOutcome[] = ["Scheduled", "Held", "No-Show", "Rescheduled", "Cancelled"];
const FORECAST_CATEGORIES: ForecastCategory[] = ["Commit", "Best Case", "Pipeline", "Omit"];
const ICP_FITS: IcpFit[] = ["Strong", "Moderate", "Weak"];
const BILLING_FREQUENCIES: BillingFrequency[] = ["Monthly", "Quarterly", "Annually"];

interface LeadOverviewTabProps {
  lead: Lead;
  daysInStage: number;
  enriching: boolean;
  onEnrich: () => void;
  save: (updates: Partial<Lead>) => void;
}

export function LeadOverviewTab({ lead, daysInStage, enriching, onEnrich, save }: LeadOverviewTabProps) {
  const { leadJobs, acceptLeadSuggestion, dismissLeadSuggestion, acceptAllLeadSuggestions, dismissLeadJob } = useProcessing();
  const autoFindJob = leadJobs[lead.id];

  const handleAcceptEnrichSuggestion = (field: string, value: string | number) => {
    const updates: Partial<Lead> = { [field]: value } as Partial<Lead>;
    if (field === "stage") updates.stageEnteredDate = new Date().toISOString().split("T")[0];
    save(updates);
    if (lead.enrichment?.suggestedUpdates) {
      const newSuggested = { ...lead.enrichment.suggestedUpdates };
      delete (newSuggested as any)[field];
      save({ enrichment: { ...lead.enrichment, suggestedUpdates: Object.keys(newSuggested).length > 0 ? newSuggested : undefined } });
    }
  };

  const handleDismissEnrichSuggestion = (field: string) => {
    if (lead.enrichment?.suggestedUpdates) {
      const newSuggested = { ...lead.enrichment.suggestedUpdates };
      delete (newSuggested as any)[field];
      save({ enrichment: { ...lead.enrichment, suggestedUpdates: Object.keys(newSuggested).length > 0 ? newSuggested : undefined } });
    }
  };

  const handleAcceptAllEnrich = () => {
    const sug = lead.enrichment?.suggestedUpdates;
    if (!sug) return;
    Object.entries(sug).forEach(([f, v]) => {
      if (v) handleAcceptEnrichSuggestion(f, (v as any).value);
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Deal Health Alerts */}
      <DealHealthAlerts lead={lead} />

      {/* Auto-Find Suggestions */}
      {autoFindJob && (autoFindJob.searching || autoFindJob.pendingSuggestions.length > 0) && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary uppercase tracking-wider">
              <Zap className="h-3.5 w-3.5" />
              {autoFindJob.searching ? "Searching Meetings..." : `Meeting-Based Suggestions (${autoFindJob.pendingSuggestions.length})`}
            </div>
            {!autoFindJob.searching && autoFindJob.pendingSuggestions.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary" onClick={() => acceptAllLeadSuggestions(lead.id)}>
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
              {autoFindJob.pendingSuggestions.map(s => (
                <div key={s.field} className="rounded border border-border bg-background p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-xs font-medium">{s.label}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Badge variant="default" className="text-[10px] shrink-0">{String(s.value)}</Badge>
                    </div>
                    <div className="flex gap-0.5 shrink-0 ml-2">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => acceptLeadSuggestion(lead.id, s.field, s.value)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => dismissLeadSuggestion(lead.id, s.field)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{s.evidence}</p>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => dismissLeadJob(lead.id)}>
                  Skip All
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Suggestions + Research */}
      <EnrichmentSection
        enrichment={lead.enrichment}
        onEnrich={onEnrich}
        enriching={enriching}
        lead={lead}
        onAcceptSuggestion={handleAcceptEnrichSuggestion}
        onDismissSuggestion={handleDismissEnrichSuggestion}
        onAcceptAll={handleAcceptAllEnrich}
      />

      {/* Deal Management */}
      <Section title="Deal Management">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SelectField label="Stage" value={lead.stage} options={STAGES} onChange={v => save({ stage: v as LeadStage, stageEnteredDate: new Date().toISOString().split("T")[0] })} />
          <SelectField label="Priority" value={lead.priority} options={[...PRIORITIES]} onChange={v => save({ priority: v as "High" | "Medium" | "Low" })} />
          <ClearableSelectField label="Forecast" value={lead.forecastCategory} options={FORECAST_CATEGORIES} onChange={v => save({ forecastCategory: v as ForecastCategory })} />
          <ClearableSelectField label="ICP Fit" value={lead.icpFit} options={ICP_FITS} onChange={v => save({ icpFit: v as IcpFit })} />
          <SelectField label="Service" value={lead.serviceInterest} options={SERVICES} onChange={v => save({ serviceInterest: v as ServiceInterest })} />
          <ClearableSelectField label="Owner" value={lead.assignedTo} options={[...OWNERS]} onChange={v => save({ assignedTo: v as DealOwner })} />
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Deal Value ($)</label>
            <Input type="number" value={lead.dealValue || ""} onChange={e => save({ dealValue: Number(e.target.value) || 0 })} className="mt-1 h-9" placeholder="0" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Pre-Screen</label>
            <button
              onClick={() => save({ preScreenCompleted: !lead.preScreenCompleted })}
              className={cn(
                "mt-1 h-9 px-3 rounded border text-xs font-medium flex items-center gap-1.5 w-full justify-center transition-colors",
                lead.preScreenCompleted ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-foreground/30",
              )}
            >
              {lead.preScreenCompleted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {lead.preScreenCompleted ? "Completed" : "Not Done"}
            </button>
          </div>
        </div>
      </Section>

      {/* Revenue & Contract */}
      <Section title="Revenue & Contract">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Subscription ($/mo)</label>
            <Input type="number" value={lead.subscriptionValue || ""} onChange={e => save({ subscriptionValue: Number(e.target.value) || 0 })} className="mt-1 h-9" placeholder="0" />
          </div>
          <ClearableSelectField label="Billing" value={lead.billingFrequency} options={BILLING_FREQUENCIES} onChange={v => save({ billingFrequency: v as BillingFrequency })} />
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Contract Start</label>
            <Input type="date" value={lead.contractStart} onChange={e => save({ contractStart: e.target.value })} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Contract End</label>
            <Input type="date" value={lead.contractEnd} onChange={e => save({ contractEnd: e.target.value })} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Close Date</label>
            <Input type="date" value={lead.closedDate} onChange={e => save({ closedDate: e.target.value })} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Forecast Close</label>
            <Input type="date" value={lead.forecastedCloseDate} onChange={e => save({ forecastedCloseDate: e.target.value })} className="mt-1 h-9" />
          </div>
        </div>
      </Section>

      {/* Meeting Management */}
      <Section title="Meeting">
        {lead.calendlyBookedAt && (
          <div className="mb-3 flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-3">
            <CalendarCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{lead.calendlyEventName || "Booked via Calendly"}{lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration} min` : ""}</p>
              {lead.meetingDate && (
                <p className="text-sm text-muted-foreground">
                  {(() => { try { return format(parseISO(lead.meetingDate), "EEE, MMM d 'at' h:mm a"); } catch { return lead.meetingDate; } })()}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Booked on {(() => { try { return format(parseISO(lead.calendlyBookedAt), "MMM d, yyyy 'at' h:mm a"); } catch { return lead.calendlyBookedAt; } })()}
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ClearableSelectField label="Outcome" value={lead.meetingOutcome} options={MEETING_OUTCOMES} onChange={v => save({ meetingOutcome: v as MeetingOutcome })} />
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Meeting Date</label>
            <Input type="date" value={lead.meetingDate} onChange={e => save({ meetingDate: e.target.value, meetingSetDate: lead.meetingSetDate || new Date().toISOString().split("T")[0] })} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Next Follow-up</label>
            <Input type="date" value={lead.nextFollowUp} onChange={e => save({ nextFollowUp: e.target.value })} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Contact</label>
            <Input type="date" value={lead.lastContactDate} onChange={e => save({ lastContactDate: e.target.value })} className="mt-1 h-9" />
          </div>
        </div>
      </Section>

      {/* Won / Lost */}
      {lead.stage === "Closed Won" && (
        <Section title="Won Details">
          <Input value={lead.wonReason} onChange={e => save({ wonReason: e.target.value })} placeholder="Why did we win this deal?" />
        </Section>
      )}
      {(lead.stage === "Lost" || lead.stage === "Went Dark") && (
        <Section title="Lost / Dark Details">
          <div className="grid grid-cols-2 gap-3">
            <ClearableSelectField label="Close Reason" value={lead.closeReason} options={CLOSE_REASONS} onChange={v => save({ closeReason: v as CloseReason })} />
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Detail</label>
              <Input value={lead.lostReason} onChange={e => save({ lostReason: e.target.value })} className="mt-1 h-9" placeholder="Additional context..." />
            </div>
          </div>
        </Section>
      )}

      {/* Tracking */}
      <Section title="Tracking">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Days in Stage" value={`${daysInStage}d`} />
          <Field label="Hours to Meeting Set" value={lead.hoursToMeetingSet !== null ? `${lead.hoursToMeetingSet}h` : "—"} />
          <Field label="Stage Entered" value={lead.stageEnteredDate || "—"} />
          <Field label="Lead Score" value={lead.stage2Score ?? lead.stage1Score ?? "—"} />
        </div>
      </Section>
    </div>
  );
}
