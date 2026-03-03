import { useProcessing } from "@/contexts/ProcessingContext";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Zap, Loader2, Check } from "lucide-react";

export function GlobalProcessingOverlay() {
  const { bulkJob, leadJobs, cancelBulk, dismissBulk } = useProcessing();

  const searchingLeadJobs = Object.values(leadJobs).filter(j => j.searching);
  const bulkActive = bulkJob.phase === "fetching" || bulkJob.phase === "matching" || bulkJob.phase === "running";
  const bulkDone = bulkJob.phase === "done";
  const progressPercent = bulkJob.totalJobs > 0
    ? Math.round(((bulkJob.completedJobs + bulkJob.failedJobs) / bulkJob.totalJobs) * 100) : 0;

  if (!bulkActive && !bulkDone && searchingLeadJobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-background border border-border rounded-lg shadow-lg p-3 space-y-2">
      {/* Bulk progress */}
      {bulkActive && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              {bulkJob.phase === "fetching" && "Fetching transcripts..."}
              {bulkJob.phase === "matching" && "Matching to leads..."}
              {bulkJob.phase === "running" && `${bulkJob.completedJobs + bulkJob.failedJobs}/${bulkJob.totalJobs} leads`}
            </span>
            {bulkJob.phase === "running" && (
              <span className="text-muted-foreground">{progressPercent}%</span>
            )}
          </div>
          {bulkJob.phase === "running" && <Progress value={progressPercent} className="h-1.5" />}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{bulkJob.progressMessage}</p>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={cancelBulk}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bulk complete */}
      {bulkDone && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-primary" />
            Bulk complete — {bulkJob.completedJobs} processed{bulkJob.failedJobs > 0 ? `, ${bulkJob.failedJobs} failed` : ""}
          </span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={dismissBulk}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Individual searching jobs */}
      {searchingLeadJobs.map(j => (
        <div key={j.leadId} className="flex items-center gap-2 text-xs">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="truncate">Searching for {j.leadName}...</span>
        </div>
      ))}
    </div>
  );
}
