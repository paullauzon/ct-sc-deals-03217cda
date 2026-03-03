import { useProcessing } from "@/contexts/ProcessingContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Check, X, Zap, Loader2 } from "lucide-react";

export function GlobalProcessingOverlay() {
  const {
    bulkJob, leadJobs,
    cancelBulk, dismissBulk,
    acceptBulkSuggestion, dismissBulkSuggestion, acceptAllBulkSuggestions, skipAllBulkSuggestions,
    acceptLeadSuggestion, dismissLeadSuggestion, acceptAllLeadSuggestions, dismissLeadJob,
  } = useProcessing();

  const progressPercent = bulkJob.progress && bulkJob.progress.total > 0
    ? Math.round((bulkJob.progress.current / bulkJob.progress.total) * 100) : 0;

  const allBulkPending = bulkJob.results.flatMap(r =>
    r.pendingSuggestions.map(s => ({ ...s, leadId: r.leadId, leadName: r.leadName }))
  );

  // Lead jobs with pending suggestions
  const pendingLeadJobs = Object.values(leadJobs).filter(j => !j.searching && j.pendingSuggestions.length > 0);
  const searchingLeadJobs = Object.values(leadJobs).filter(j => j.searching);

  return (
    <>
      {/* ─── Floating progress bar (bottom-right) ─── */}
      {(bulkJob.phase === "running" || searchingLeadJobs.length > 0) && (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-background border border-border rounded-lg shadow-lg p-3 space-y-2">
          {bulkJob.phase === "running" && bulkJob.progress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  {bulkJob.progress.phase === "fetching" && "Fetching transcripts..."}
                  {bulkJob.progress.phase === "matching" && "Matching to leads..."}
                  {bulkJob.progress.phase === "processing" && (
                    <>{bulkJob.progress.current}/{bulkJob.progress.total} — {bulkJob.progress.currentLeadName}</>
                  )}
                </span>
                <span className="text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{bulkJob.progress.message}</p>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={cancelBulk}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {searchingLeadJobs.map(j => (
            <div key={j.leadId} className="flex items-center gap-2 text-xs">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="truncate">Searching for {j.leadName}...</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Bulk Review Modal ─── */}
      <Dialog open={bulkJob.phase === "review"} onOpenChange={() => {}}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Review Suggested Updates
            </DialogTitle>
            <DialogDescription>
              {allBulkPending.length} suggestion{allBulkPending.length !== 1 ? "s" : ""} across {bulkJob.results.filter(r => r.pendingSuggestions.length > 0).length} leads need your review.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[40vh]">
            <div className="space-y-3 pr-3">
              {bulkJob.results.filter(r => r.pendingSuggestions.length > 0).map(r => (
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
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-primary hover:bg-primary/10"
                          onClick={() => acceptBulkSuggestion(r.leadId, s.field, s.value)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-destructive/10"
                          onClick={() => dismissBulkSuggestion(r.leadId, s.field)}>
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
            <Button variant="outline" onClick={skipAllBulkSuggestions}>Skip All</Button>
            <Button onClick={acceptAllBulkSuggestions}>
              <Check className="h-4 w-4 mr-1" />
              Accept All ({allBulkPending.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Done Modal ─── */}
      <Dialog open={bulkJob.phase === "done" && bulkJob.results.length > 0} onOpenChange={dismissBulk}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              Bulk Processing Complete
            </DialogTitle>
            <DialogDescription>
              Summary of processed leads.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-4 text-xs text-muted-foreground py-2">
            <span>{bulkJob.results.filter(r => r.newMeetingsCount > 0).length} leads updated</span>
            <span>{bulkJob.results.reduce((s, r) => s + r.newMeetingsCount, 0)} meetings added</span>
            <span>{bulkJob.results.reduce((s, r) => s + r.appliedFields.length, 0)} fields set</span>
          </div>
          {bulkJob.results.filter(r => r.newMeetingsCount > 0).length > 0 && (
            <ScrollArea className="h-48 border border-border rounded-md p-2">
              <div className="space-y-1">
                {bulkJob.results.filter(r => r.newMeetingsCount > 0).map(r => (
                  <div key={r.leadId} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                    <span className="font-medium">{r.leadName}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{r.newMeetingsCount} mtg{r.newMeetingsCount !== 1 ? "s" : ""}</Badge>
                      {r.appliedFields.length > 0 && <Badge className="text-[10px] bg-primary/20 text-primary">{r.appliedFields.length} fields</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          {bulkJob.results.filter(r => r.error).length > 0 && (
            <div className="text-xs text-destructive space-y-1">
              <p className="font-medium">Errors:</p>
              {bulkJob.results.filter(r => r.error).map(r => (
                <p key={r.leadId}>{r.leadName}: {r.error}</p>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={dismissBulk}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Individual Lead Suggestion Modals ─── */}
      {pendingLeadJobs.map(job => (
        <Dialog key={job.leadId} open onOpenChange={() => dismissLeadJob(job.leadId)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Suggestions for {job.leadName}</DialogTitle>
              <DialogDescription>
                {job.pendingSuggestions.length} field{job.pendingSuggestions.length !== 1 ? "s" : ""} to review.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {job.pendingSuggestions.map(s => (
                <div key={s.field} className="flex items-start justify-between gap-3 text-xs bg-secondary/30 rounded px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-primary">→ {s.value}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{s.evidence}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-primary hover:bg-primary/10"
                      onClick={() => acceptLeadSuggestion(job.leadId, s.field, s.value)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-destructive/10"
                      onClick={() => dismissLeadSuggestion(job.leadId, s.field)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => dismissLeadJob(job.leadId)}>Skip All</Button>
              <Button size="sm" onClick={() => acceptAllLeadSuggestions(job.leadId)}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Accept All
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </>
  );
}
