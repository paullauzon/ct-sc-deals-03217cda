import { useProcessing } from "@/contexts/ProcessingContext";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Zap, Loader2, Check, X, Search, Brain, AlertTriangle } from "lucide-react";

export function GlobalProcessingOverlay() {
  const { bulkJob, leadJobs, cancelBulk, dismissBulk } = useProcessing();

  const searchingLeadJobs = Object.values(leadJobs).filter(j => j.searching);
  const bulkActive = bulkJob.phase === "running";
  const bulkDone = bulkJob.phase === "done";
  const progressPercent = bulkJob.totalJobs > 0
    ? Math.round(((bulkJob.completedJobs + bulkJob.failedJobs) / bulkJob.totalJobs) * 100) : 0;

  if (!bulkActive && !bulkDone && searchingLeadJobs.length === 0) return null;

  // Determine the icon for current step from progress message
  const getStepIcon = (msg: string) => {
    if (msg.includes("Searching") || msg.includes("searching")) return <Search className="h-3.5 w-3.5 text-primary animate-pulse" />;
    if (msg.includes("AI") || msg.includes("analyzing") || msg.includes("Synthesizing")) return <Brain className="h-3.5 w-3.5 text-primary animate-pulse" />;
    if (msg.includes("Failed")) return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    if (msg.includes("Found")) return <Check className="h-3.5 w-3.5 text-primary" />;
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-background border border-border rounded-lg shadow-lg p-4 space-y-3">
      {/* Bulk progress */}
      {bulkActive && (
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Bulk Processing
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {bulkJob.currentLeadIndex + 1} / {bulkJob.totalJobs}
            </span>
          </div>

          {/* Progress bar */}
          <Progress value={progressPercent} className="h-1.5" />

          {/* Current lead & step detail */}
          <div className="flex items-start gap-2 text-xs">
            {getStepIcon(bulkJob.progressMessage)}
            <span className="text-foreground leading-snug">{bulkJob.progressMessage}</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-primary" />
              {bulkJob.completedJobs} done
            </span>
            <span>·</span>
            <span>{bulkJob.foundMeetings} meetings found</span>
            {bulkJob.failedJobs > 0 && (
              <>
                <span>·</span>
                <span className="text-destructive">{bulkJob.failedJobs} failed</span>
              </>
            )}
          </div>

          {/* Cancel */}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={cancelBulk}>
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bulk complete */}
      {bulkDone && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" />
              Bulk Processing Complete
            </span>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={dismissBulk}>
              Dismiss
            </Button>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{bulkJob.completedJobs} processed</span>
            <span>·</span>
            <span>{bulkJob.foundMeetings} meetings found</span>
            {bulkJob.failedJobs > 0 && (
              <>
                <span>·</span>
                <span className="text-destructive">{bulkJob.failedJobs} failed</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Individual searching jobs (non-bulk) */}
      {searchingLeadJobs.map(j => (
        <div key={j.leadId} className="flex items-center gap-2 text-xs">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="truncate">Searching for {j.leadName}...</span>
        </div>
      ))}
    </div>
  );
}
