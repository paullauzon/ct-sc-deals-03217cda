import { Lead } from "@/types/lead";
import { Sparkles, Zap, ArrowRight, Check, X, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProcessing } from "@/contexts/ProcessingContext";
import { EnrichmentSection } from "./shared";

interface Props {
  lead: Lead;
  enriching: boolean;
  onEnrich: () => void;
  save: (updates: Partial<Lead>) => void;
}

/**
 * AI Research & Insights — surfaced inside the Intelligence tab.
 * Includes the Research / Re-run action, auto-find meeting suggestions,
 * and the EnrichmentSection (suggested CRM updates + research detail).
 */
export function AIResearchSection({ lead, enriching, onEnrich, save }: Props) {
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
    <section className="rounded-lg border border-border bg-card">
      {/* Header + primary actions */}
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> AI Research & Insights
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {lead.enrichment
              ? (lastResearched ? `Last refreshed ${new Date(lastResearched).toLocaleDateString()}` : "Research available")
              : "Scrape company site, infer signals, and recommend CRM updates."}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={onEnrich} disabled={enriching}>
            {enriching
              ? <><RefreshCw className="h-3 w-3 animate-spin" /> Researching…</>
              : <><Sparkles className="h-3 w-3" /> {lead.enrichment ? "Re-run research" : "Research"}</>}
          </Button>
        </div>
      </header>

      <div className="p-4 space-y-3">
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
    </section>
  );
}
