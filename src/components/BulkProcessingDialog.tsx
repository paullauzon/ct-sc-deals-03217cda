import { useState, useRef, useCallback } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Check, X, Zap, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { runBulkProcessing, BulkLeadResult, BulkProgressUpdate } from "@/lib/bulkProcessing";

export function BulkProcessingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { leads, updateLead } = useLeads();
  const [phase, setPhase] = useState<"idle" | "running" | "review" | "done">("idle");
  const [progress, setProgress] = useState<BulkProgressUpdate | null>(null);
  const [results, setResults] = useState<BulkLeadResult[]>([]);
  const cancelRef = useRef({ current: false });

  const handleStart = useCallback(async () => {
    setPhase("running");
    cancelRef.current = { current: false };
    setResults([]);

    const finalResults = await runBulkProcessing(
      leads,
      updateLead,
      (update) => setProgress(update),
      cancelRef.current
    );

    setResults(finalResults);

    const hasPending = finalResults.some(r => r.pendingSuggestions.length > 0);
    setPhase(hasPending ? "review" : "done");

    const totalMeetings = finalResults.reduce((s, r) => s + r.newMeetingsCount, 0);
    const totalApplied = finalResults.reduce((s, r) => s + r.appliedFields.length, 0);
    if (totalMeetings > 0) {
      toast.success(`Bulk processing complete`, {
        description: `${totalMeetings} meetings added across ${finalResults.filter(r => r.newMeetingsCount > 0).length} leads. ${totalApplied} fields auto-updated.`,
        duration: 8000,
      });
    }
  }, [leads, updateLead]);

  const handleCancel = () => {
    cancelRef.current.current = true;
  };

  const handleAcceptSuggestion = (leadId: string, field: string, value: string | number) => {
    updateLead(leadId, { [field]: value });
    setResults(prev => prev.map(r => {
      if (r.leadId !== leadId) return r;
      return {
        ...r,
        pendingSuggestions: r.pendingSuggestions.filter(s => s.field !== field),
        appliedFields: [...r.appliedFields, `${field}: ${value}`],
      };
    }));
    toast.success(`Updated ${field} for lead`);
  };

  const handleDismissSuggestion = (leadId: string, field: string) => {
    setResults(prev => prev.map(r => {
      if (r.leadId !== leadId) return r;
      return { ...r, pendingSuggestions: r.pendingSuggestions.filter(s => s.field !== field) };
    }));
  };

  const handleAcceptAll = () => {
    for (const r of results) {
      for (const s of r.pendingSuggestions) {
        updateLead(r.leadId, { [s.field]: s.value });
      }
    }
    setResults(prev => prev.map(r => ({
      ...r,
      appliedFields: [...r.appliedFields, ...r.pendingSuggestions.map(s => `${s.label}: ${s.value}`)],
      pendingSuggestions: [],
    })));
    toast.success("Applied all suggestions");
    setPhase("done");
  };

  const allPending = results.flatMap(r => r.pendingSuggestions.map(s => ({ ...s, leadId: r.leadId, leadName: r.leadName })));
  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const handleClose = () => {
    if (phase === "running") return;
    setPhase("idle");
    setProgress(null);
    setResults([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Process All Leads
          </DialogTitle>
          <DialogDescription>
            {phase === "idle" && "Bulk-fetch all Fireflies transcripts and process them for every lead."}
            {phase === "running" && "Processing in progress..."}
            {phase === "review" && "Review suggested field updates before applying."}
            {phase === "done" && "Processing complete."}
          </DialogDescription>
        </DialogHeader>

        {/* Idle state */}
        {phase === "idle" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>This will:</p>
              <ol className="list-decimal ml-5 space-y-1">
                <li>Fetch <strong>all</strong> transcripts from both CT and SC Fireflies accounts</li>
                <li>Match them to your {leads.length} leads by email, domain, and name</li>
                <li>Process each transcript with AI to extract intelligence</li>
                <li>Auto-update high-confidence CRM fields (stage, dates, etc.)</li>
                <li>Synthesize deal intelligence for each lead</li>
              </ol>
              <div className="flex items-start gap-2 mt-3 p-3 bg-secondary/50 rounded-md">
                <AlertTriangle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs">
                  This may take 15–30 minutes depending on how many transcripts are found.
                  Leads that already have matching transcripts will be skipped.
                  You can cancel at any time — progress is saved.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleStart}>
                <Zap className="h-4 w-4 mr-1" />
                Start Processing
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Running state */}
        {phase === "running" && progress && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {progress.phase === "fetching" && "Fetching transcripts..."}
                  {progress.phase === "matching" && "Matching to leads..."}
                  {progress.phase === "processing" && (
                    <>Processing {progress.current}/{progress.total} — <span className="text-primary">{progress.currentLeadName}</span></>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground">{progress.message}</p>

            {/* Live results feed */}
            {results.length > 0 && (
              <ScrollArea className="h-40 border border-border rounded-md p-2">
                <div className="space-y-1">
                  {results.map(r => (
                    <div key={r.leadId} className="flex items-center justify-between text-xs py-0.5">
                      <span>{r.leadName}</span>
                      <div className="flex items-center gap-2">
                        {r.newMeetingsCount > 0 && <Badge variant="outline" className="text-[10px]">{r.newMeetingsCount} mtg{r.newMeetingsCount !== 1 ? "s" : ""}</Badge>}
                        {r.appliedFields.length > 0 && <Badge className="text-[10px] bg-primary/20 text-primary">{r.appliedFields.length} updated</Badge>}
                        {r.error && <Badge variant="destructive" className="text-[10px]">Error</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Cancel
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Review state */}
        {phase === "review" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {allPending.length} suggested update{allPending.length !== 1 ? "s" : ""} across {results.filter(r => r.pendingSuggestions.length > 0).length} leads need your review:
            </p>
            <ScrollArea className="h-[40vh]">
              <div className="space-y-3 pr-3">
                {results.filter(r => r.pendingSuggestions.length > 0).map(r => (
                  <div key={r.leadId} className="border border-border rounded-md p-3 space-y-2">
                    <p className="text-sm font-medium">{r.leadName}</p>
                    {r.pendingSuggestions.map(s => (
                      <div key={s.field} className="flex items-start justify-between gap-3 text-xs bg-secondary/30 rounded px-2.5 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.label}</span>
                            <span className="text-primary">→ {s.value}</span>
                          </div>
                          <p className="text-muted-foreground mt-0.5">{s.evidence}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-primary hover:bg-primary/10"
                            onClick={() => handleAcceptSuggestion(r.leadId, s.field, s.value)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:bg-destructive/10"
                            onClick={() => handleDismissSuggestion(r.leadId, s.field)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPhase("done")}>Skip All</Button>
              <Button onClick={handleAcceptAll}>
                <Check className="h-4 w-4 mr-1" />
                Accept All ({allPending.length})
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Done state */}
        {phase === "done" && (
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <Check className="h-10 w-10 text-primary mx-auto" />
              <p className="text-sm font-medium">Bulk processing complete</p>
              <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                <span>{results.filter(r => r.newMeetingsCount > 0).length} leads updated</span>
                <span>{results.reduce((s, r) => s + r.newMeetingsCount, 0)} meetings added</span>
                <span>{results.reduce((s, r) => s + r.appliedFields.length, 0)} fields auto-set</span>
              </div>
            </div>

            {/* Summary of results */}
            {results.filter(r => r.newMeetingsCount > 0).length > 0 && (
              <ScrollArea className="h-48 border border-border rounded-md p-2">
                <div className="space-y-1">
                  {results.filter(r => r.newMeetingsCount > 0).map(r => (
                    <div key={r.leadId} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                      <span className="font-medium">{r.leadName}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{r.newMeetingsCount} mtg{r.newMeetingsCount !== 1 ? "s" : ""}</Badge>
                        {r.appliedFields.length > 0 && (
                          <Badge className="text-[10px] bg-primary/20 text-primary">{r.appliedFields.length} fields</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {results.filter(r => r.error).length > 0 && (
              <div className="text-xs text-destructive space-y-1">
                <p className="font-medium">Errors:</p>
                {results.filter(r => r.error).map(r => (
                  <p key={r.leadId}>{r.leadName}: {r.error}</p>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
