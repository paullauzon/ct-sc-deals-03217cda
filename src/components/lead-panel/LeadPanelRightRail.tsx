import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { RightRailCards } from "@/components/dealroom/RightRailCards";
import { EmailMetricsCard } from "@/components/EmailMetricsCard";
import { Building2, FileInput, Zap, Target, Sparkles, ArrowRight, Check, X, RefreshCw, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyAssociates, getSharedIntelligence } from "@/lib/leadUtils";
import { EnrichmentSection, SubmissionHistory } from "./shared";
import { useProcessing } from "@/contexts/ProcessingContext";

interface LeadPanelRightRailProps {
  lead: Lead;
  allLeads: Lead[];
  enriching: boolean;
  onEnrich: () => void;
  save: (updates: Partial<Lead>) => void;
}

function CompanyActivityCard({ lead, allLeads }: { lead: Lead; allLeads: Lead[] }) {
  const associates = getCompanyAssociates(lead, allLeads);
  if (associates.length === 0) return null;
  const shared = getSharedIntelligence([lead, ...associates]);
  const trunc = (s: string) => s.length > 80 ? s.slice(0, 77) + "…" : s;

  return (
    <CollapsibleCard
      title={`Company · ${lead.company || "—"}`}
      icon={<Building2 className="h-3.5 w-3.5" />}
      count={associates.length + 1}
      defaultOpen
    >
      <p className="text-[11px] text-muted-foreground mb-2">
        {associates.length + 1} contacts · {shared.totalMeetings} meeting{shared.totalMeetings !== 1 ? "s" : ""}
      </p>
      <div className="space-y-1">
        {associates.map(a => (
          <div key={a.id} className="flex items-center justify-between text-xs border border-border/60 rounded px-2 py-1.5">
            <div className="min-w-0">
              <p className="font-medium truncate">{a.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{a.role}</p>
            </div>
            <Badge variant="outline" className="text-[9px] shrink-0 ml-1">{a.stage}</Badge>
          </div>
        ))}
      </div>
      {(shared.objections.length > 0 || shared.painPoints.length > 0) && (
        <div className="mt-2.5 pt-2 border-t border-border/40 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Shared Intelligence</p>
          {shared.objections.slice(0, 3).map((o, i) => (
            <p key={`o-${i}`} className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Zap className="h-3 w-3 shrink-0 mt-0.5" /> <span>{trunc(o)}</span>
            </p>
          ))}
          {shared.painPoints.slice(0, 3).map((p, i) => (
            <p key={`p-${i}`} className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Target className="h-3 w-3 shrink-0 mt-0.5" /> <span>{trunc(p)}</span>
            </p>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function AIInsightsCard({ lead, enriching, onEnrich, save }: { lead: Lead; enriching: boolean; onEnrich: () => void; save: (u: Partial<Lead>) => void }) {
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

  const showAutoFind = autoFindJob && (autoFindJob.searching || autoFindJob.pendingSuggestions.length > 0);
  const lastResearched = (lead.enrichment as any)?.researchedAt || (lead.enrichment as any)?.fetchedAt;

  return (
    <CollapsibleCard
      title="AI Insights"
      icon={<Sparkles className="h-3.5 w-3.5" />}
      defaultOpen
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            {lead.enrichment ? (lastResearched ? `Refreshed ${new Date(lastResearched).toLocaleDateString()}` : "Research available") : "No research yet"}
          </p>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={onEnrich} disabled={enriching}>
            {enriching ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {enriching ? "Researching…" : (lead.enrichment ? "Re-run" : "Research")}
          </Button>
        </div>

        {showAutoFind && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-primary uppercase tracking-wider">
                <Zap className="h-3 w-3" />
                {autoFindJob.searching ? "Searching meetings…" : `Meeting suggestions (${autoFindJob.pendingSuggestions.length})`}
              </div>
              {!autoFindJob.searching && autoFindJob.pendingSuggestions.length > 0 && (
                <Button variant="ghost" size="sm" className="h-5 text-[10px] text-primary px-1.5" onClick={() => acceptAllLeadSuggestions(lead.id)}>
                  Accept All
                </Button>
              )}
            </div>
            {autoFindJob.searching && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span className="truncate">Processing {autoFindJob.leadName}…</span>
              </div>
            )}
            {!autoFindJob.searching && autoFindJob.pendingSuggestions.length > 0 && (
              <div className="space-y-1">
                {autoFindJob.pendingSuggestions.map(s => (
                  <div key={s.field} className="rounded border border-border bg-background p-1.5 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[11px] font-medium truncate">{s.label}</span>
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                        <Badge variant="default" className="text-[9px] shrink-0">{String(s.value)}</Badge>
                      </div>
                      <div className="flex gap-0 shrink-0">
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => acceptLeadSuggestion(lead.id, s.field, s.value)}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => dismissLeadSuggestion(lead.id, s.field)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{s.evidence}</p>
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] text-muted-foreground px-1.5" onClick={() => dismissLeadJob(lead.id)}>
                    Skip All
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <EnrichmentSection
          enrichment={lead.enrichment}
          onEnrich={onEnrich}
          enriching={enriching}
          lead={lead}
          onAcceptSuggestion={handleAcceptEnrichSuggestion}
          onDismissSuggestion={handleDismissEnrichSuggestion}
          onAcceptAll={handleAcceptAllEnrich}
        />
      </div>
    </CollapsibleCard>
  );
}

function EmailActivityCard({ leadId }: { leadId: string }) {
  const [unanswered, setUnanswered] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lead_email_metrics")
        .select("total_received,total_replies,last_received_date,last_replied_date")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (cancelled || !data) return;
      // Inbound emails received without an outbound reply since
      const lastReceived = (data as any).last_received_date ? new Date((data as any).last_received_date).getTime() : 0;
      const lastReplied = (data as any).last_replied_date ? new Date((data as any).last_replied_date).getTime() : 0;
      setUnanswered(lastReceived > lastReplied ? 1 : 0);
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  return (
    <CollapsibleCard
      title="Email Activity"
      icon={<Mail className="h-3.5 w-3.5" />}
      defaultOpen={false}
      titleAccessory={unanswered > 0 ? <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" title="Inbound awaiting reply" /> : undefined}
    >
      <EmailMetricsCard leadId={leadId} />
    </CollapsibleCard>
  );
}

export function LeadPanelRightRail({ lead, allLeads, enriching, onEnrich, save }: LeadPanelRightRailProps) {
  const submissionsCount = lead.submissions?.length || 0;
  return (
    <aside className="w-[320px] shrink-0 border-l border-border overflow-y-auto bg-background">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Intelligence</span>
      </div>
      <AIInsightsCard lead={lead} enriching={enriching} onEnrich={onEnrich} save={save} />
      <EmailActivityCard leadId={lead.id} />
      <RightRailCards lead={lead} allLeads={allLeads} />
      <CompanyActivityCard lead={lead} allLeads={allLeads} />
      {submissionsCount > 0 && (
        <CollapsibleCard
          title="Submissions"
          icon={<FileInput className="h-3.5 w-3.5" />}
          count={submissionsCount}
          defaultOpen={submissionsCount >= 2}
        >
          <SubmissionHistory submissions={lead.submissions} />
        </CollapsibleCard>
      )}
      <div className="h-6" />
    </aside>
  );
}
