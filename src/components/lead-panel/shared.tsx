import * as React from "react";
import { useState } from "react";
import { Lead, LeadEnrichment, SuggestedFieldUpdate, SuggestedUpdates, Submission, LeadSource } from "@/types/lead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ArrowRight, Check, ChevronRight, RefreshCw, Shield, Sparkles, Target, Users, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const SOURCE_LABELS: Record<LeadSource, string> = {
  "CT Contact Form": "CT Contact",
  "CT Free Targets Form": "CT Targets",
  "SC Intro Call Form": "SC Intro",
  "SC Free Targets Form": "SC Targets",
};

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium">{value || <span className="text-muted-foreground/60">—</span>}</p>
    </div>
  );
}

export function SelectField({ label, value, options, onChange, placeholder }: { label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={placeholder || label} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function ClearableSelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

const SUGGESTION_LABELS: Record<string, string> = {
  stage: "Stage", priority: "Priority", forecastCategory: "Forecast",
  icpFit: "ICP Fit", nextFollowUp: "Next Follow-up", dealValue: "Deal Value",
  serviceInterest: "Service Interest", meetingOutcome: "Meeting Outcome",
};

export function AISuggestionsPanel({ suggestions, lead, onAccept, onDismiss, onAcceptAll }: {
  suggestions: SuggestedUpdates;
  lead: Lead;
  onAccept: (field: string, value: string | number) => void;
  onDismiss: (field: string) => void;
  onAcceptAll: () => void;
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
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary uppercase tracking-wider">
          <Zap className="h-3.5 w-3.5" /> AI Suggested Updates
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary hover:text-primary" onClick={onAcceptAll}>
          Accept All
        </Button>
      </div>
      <div className="space-y-1.5">
        {entries.map(([field, update]) => {
          const suggestion = update as SuggestedFieldUpdate;
          const current = getCurrentValue(field);
          const proposed = formatValue(field, suggestion.value);
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
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onAccept(field, suggestion.value)}>
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

function CollapsibleResearchSection({ icon, label, content, highlight }: { icon?: React.ReactNode; label: string; content: string; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const preview = content.length > 90 ? content.slice(0, 90).trim() + "…" : content;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={cn("w-full flex items-center gap-1.5 py-1.5 px-2 rounded-md text-left transition-colors hover:bg-background/60", highlight && "border border-primary/20 bg-primary/5")}>
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
        {icon && <span className={highlight ? "text-primary" : "text-muted-foreground"}>{icon}</span>}
        <span className={cn("text-xs font-medium uppercase tracking-wider", highlight ? "text-primary" : "text-muted-foreground")}>{label}</span>
        {!open && <span className="text-xs text-muted-foreground/60 truncate ml-1 font-normal normal-case">{preview}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn("rounded-md p-2.5 ml-4 mt-1 mb-1", highlight ? "border border-primary/20 bg-primary/5" : "border border-border bg-background/50")}>
          <p className="text-sm leading-relaxed whitespace-pre-line">{content}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function EnrichmentSection({ enrichment, onEnrich, enriching, lead, onAcceptSuggestion, onDismissSuggestion, onAcceptAll }: {
  enrichment?: LeadEnrichment;
  onEnrich: () => void;
  enriching: boolean;
  lead: Lead;
  onAcceptSuggestion: (field: string, value: string | number) => void;
  onDismissSuggestion: (field: string) => void;
  onAcceptAll: () => void;
}) {
  const [researchOpen, setResearchOpen] = useState(false);
  if (!enrichment) {
    return (
      <Section title="External Research">
        <Button onClick={onEnrich} disabled={enriching} variant="outline" size="sm" className="w-full gap-2">
          <Sparkles className="h-4 w-4" />
          {enriching ? "Researching..." : "Research & Recommend"}
        </Button>
        {enriching && (
          <div className="space-y-1 mt-1.5">
            <Progress value={undefined} className="h-1.5 [&>div]:animate-pulse" />
            <p className="text-[10px] text-muted-foreground">Scraping website, generating recommendations…</p>
          </div>
        )}
        {!enriching && <p className="text-xs text-muted-foreground mt-1.5">Scrapes company website, researches the prospect, recommends CRM updates.</p>}
      </Section>
    );
  }

  const hasSuggestions = enrichment.suggestedUpdates && Object.keys(enrichment.suggestedUpdates).length > 0;
  const enrichedAt = enrichment.enrichedAt ? new Date(enrichment.enrichedAt).getTime() : 0;
  const meetingsAfterEnrichment = (lead.meetings || []).filter(m => {
    const addedAt = m.addedAt ? new Date(m.addedAt).getTime() : 0;
    return addedAt > enrichedAt;
  });
  const isStale = meetingsAfterEnrichment.length > 0;

  return (
    <div className="space-y-3">
      {isStale && !enriching && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs flex-1">Research ran before {meetingsAfterEnrichment.length} meeting(s) were added. Re-research to include them.</p>
          <Button onClick={onEnrich} variant="outline" size="sm" className="h-6 text-[10px] shrink-0">Re-research</Button>
        </div>
      )}

      {hasSuggestions && (
        <AISuggestionsPanel
          suggestions={enrichment.suggestedUpdates!}
          lead={lead}
          onAccept={onAcceptSuggestion}
          onDismiss={onDismissSuggestion}
          onAcceptAll={onAcceptAll}
        />
      )}

      <Collapsible open={researchOpen} onOpenChange={setResearchOpen}>
        <div className="flex items-center justify-between border-b border-border pb-1">
          <CollapsibleTrigger className="flex items-center gap-1.5 group">
            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", researchOpen && "rotate-90")} />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">External Research</h3>
            {!researchOpen && <span className="text-[10px] text-muted-foreground/60 ml-1">· {new Date(enrichment.enrichedAt).toLocaleDateString()}</span>}
          </CollapsibleTrigger>
          <Button onClick={onEnrich} disabled={enriching} variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground">
            <RefreshCw className={`h-3 w-3 ${enriching ? "animate-spin" : ""}`} />
            {enriching ? "Researching..." : "Re-research"}
          </Button>
        </div>
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
            {enrichment.keyInsights && <CollapsibleResearchSection label="Key Insights" content={enrichment.keyInsights} />}
            <div className="pt-1 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground">Researched {new Date(enrichment.enrichedAt).toLocaleDateString()}</p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export type DealSignal = {
  /** Backwards-compat alias of `title` for legacy alert renderers. */
  message: string;
  title: string;
  description?: string;
  severity: "warning" | "critical" | "positive";
};

const sig = (severity: DealSignal["severity"], title: string, description?: string): DealSignal =>
  ({ severity, title, description, message: title });

/** Computes the same deal alerts surfaced at the top of the Activity tab.
 *  Extracted so the right-rail Signals card can show a count + the same list. */
export function getDealSignals(lead: Lead): DealSignal[] {
  const alerts: DealSignal[] = [];
  const today = new Date();

  const meetings = lead.meetings || [];
  if (meetings.length > 0 && !["Closed Won", "Lost", "Went Dark"].includes(lead.stage)) {
    const latestMeetingDate = meetings.map(m => m.date).filter(Boolean).sort().pop();
    if (latestMeetingDate) {
      const daysSince = Math.floor((today.getTime() - new Date(latestMeetingDate).getTime()) / 86400000);
      if (daysSince >= 21)
        alerts.push(sig("critical", `Deal stalling — ${daysSince}d since last meeting`,
          `No meeting logged in ${daysSince} days. Re-engage or move to Went Dark.`));
      else if (daysSince >= 14)
        alerts.push(sig("warning", `${daysSince} days since last meeting`,
          "Tempo slipping. Schedule a check-in to keep momentum."));
    }
  }

  if (lead.dealIntelligence?.actionItemTracker) {
    const overdue = lead.dealIntelligence.actionItemTracker.filter(a => a.status === "Overdue").length;
    if (overdue > 0)
      alerts.push(sig("critical", `${overdue} pending action item${overdue !== 1 ? "s" : ""}`,
        "Commitments past their deadline. Close the loop before the next call."));
    const open = lead.dealIntelligence.actionItemTracker.filter(a => a.status === "Open").length;
    if (open >= 5)
      alerts.push(sig("warning", `${open} open action items`,
        "Backlog building up. Prioritize and clear before they slip overdue."));
  }

  if (lead.dealIntelligence?.riskRegister?.length) {
    const unmitigated = lead.dealIntelligence.riskRegister.filter(r => r.mitigationStatus === "Unmitigated" && (r.severity === "Critical" || r.severity === "High"));
    if (unmitigated.length)
      alerts.push(sig("critical", `${unmitigated.length} unmitigated risk${unmitigated.length !== 1 ? "s" : ""}`,
        unmitigated[0].risk));
  }

  if (!["Closed Won", "Lost", "Went Dark"].includes(lead.stage)) {
    if (!lead.nextFollowUp)
      alerts.push(sig("warning", "No follow-up scheduled",
        "Add a next step so this deal stays on the calendar."));
    else if (new Date(lead.nextFollowUp) < today) {
      const daysOverdue = Math.floor((today.getTime() - new Date(lead.nextFollowUp).getTime()) / 86400000);
      alerts.push(sig("critical", `Follow-up pending ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`,
        "Auto-task was created but not completed. Snooze, draft, or mark contacted."));
    }
  }

  if (lead.dealIntelligence?.momentumSignals) {
    const ms = lead.dealIntelligence.momentumSignals;
    if (ms.momentum === "Stalled")
      alerts.push(sig("critical", "Deal momentum: Stalled", "Activity has flatlined. Surface a new hook or escalate."));
    else if (ms.momentum === "Stalling")
      alerts.push(sig("warning", "Deal momentum: Stalling", "Cadence is slipping. Re-establish a clear next step."));
    else if (ms.momentum === "Accelerating")
      alerts.push(sig("positive", "Deal momentum: Accelerating", "Engagement is rising. Press for the next milestone."));
  }

  if (lead.contractEnd) {
    const daysToExpiry = Math.floor((new Date(lead.contractEnd).getTime() - today.getTime()) / 86400000);
    if (daysToExpiry >= 0 && daysToExpiry <= 30) {
      alerts.push(sig(daysToExpiry <= 7 ? "critical" : "warning",
        `Contract expiring in ${daysToExpiry} day${daysToExpiry !== 1 ? "s" : ""}`,
        "Confirm renewal terms with the buyer to avoid lapse."));
    }
  }

  return alerts;
}

export function DealHealthAlerts({ lead }: { lead: Lead }) {
  const alerts = getDealSignals(lead);
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
        <div key={`w-${i}`} className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{a.message}</span>
        </div>
      ))}
    </div>
  );
}

export function SubmissionHistory({ submissions }: { submissions: Submission[] }) {
  const [expanded, setExpanded] = useState(false);
  const brands = new Set(submissions.map(s => s.brand));
  const brandLabel = brands.size > 1 ? "CT + SC" : brands.values().next().value === "Captarget" ? "CT" : "SC";

  return (
    <div className="space-y-2">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between border-b border-border pb-1 group">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Submission History ({submissions.length})</h3>
        <span className="text-xs text-muted-foreground">{expanded ? "▾" : "▸"} {brandLabel}</span>
      </button>
      {expanded && (
        <div className="space-y-2">
          {submissions.map((sub, i) => {
            const isLatest = i === submissions.length - 1;
            const sourceLabel = SOURCE_LABELS[sub.source] || sub.source;
            return (
              <div key={i} className={cn("rounded-md border p-2.5 space-y-1 text-xs", isLatest ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/20")}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{sourceLabel}</span>
                  <span className="text-muted-foreground">· {sub.dateSubmitted}</span>
                  {isLatest && <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">Latest</Badge>}
                </div>
                {sub.message && <p className="text-muted-foreground leading-relaxed">"{sub.message.length > 160 ? sub.message.slice(0, 160) + "…" : sub.message}"</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
