import { useState } from "react";
import { useProcessing } from "@/contexts/ProcessingContext";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Zap, Loader2, Check, X, Search, Brain, AlertTriangle, Circle, Pause, Play, ChevronDown, ChevronUp, List } from "lucide-react";

export function GlobalProcessingOverlay() {
  const { bulkJob, leadJobs, cancelBulk, dismissBulk, pauseBulk, resumeBulk } = useProcessing();
  const [showErrors, setShowErrors] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const searchingLeadJobs = Object.values(leadJobs).filter(j => j.searching);
  const bulkActive = bulkJob.phase === "running";
  const bulkPaused = bulkJob.phase === "paused";
  const bulkDone = bulkJob.phase === "done";
  const progressPercent = bulkJob.totalJobs > 0
    ? Math.round(((bulkJob.completedJobs + bulkJob.failedJobs) / bulkJob.totalJobs) * 100) : 0;

  if (!bulkActive && !bulkPaused && !bulkDone && searchingLeadJobs.length === 0) return null;

  const getStepIcon = (msg: string) => {
    if (msg.includes("Searching") || msg.includes("searching")) return <Search className="h-3.5 w-3.5 text-primary animate-pulse" />;
    if (msg.includes("AI") || msg.includes("analyzing") || msg.includes("Synthesizing")) return <Brain className="h-3.5 w-3.5 text-primary animate-pulse" />;
    if (msg.includes("Failed")) return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    if (msg.includes("Found")) return <Check className="h-3.5 w-3.5 text-primary" />;
    if (msg.includes("No new")) return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
    if (msg.includes("Paused")) return <Pause className="h-3.5 w-3.5 text-amber-500" />;
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  };

  const leadsWithMeetings = bulkJob.completedJobs - bulkJob.noMeetings;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-background border border-border rounded-lg shadow-lg p-4 space-y-3">
      {/* Bulk progress (running or paused) */}
      {(bulkActive || bulkPaused) && (
        <div className="space-y-2">
          {/* Header with counter */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              {bulkPaused ? (
                <Pause className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <Zap className="h-3.5 w-3.5 text-primary" />
              )}
              Bulk Processing {bulkPaused ? "(Paused)" : ""}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Lead {bulkJob.currentLeadIndex + 1} of {bulkJob.totalJobs}
            </span>
          </div>

          {/* Current lead name */}
          <div className="text-sm font-medium text-foreground truncate">
            {bulkJob.currentLeadName}
          </div>

          {/* Progress bar */}
          <Progress value={progressPercent} className="h-1.5" />

          {/* Current step detail */}
          <div className="flex items-start gap-2 text-xs">
            {getStepIcon(bulkJob.progressMessage)}
            <span className="text-muted-foreground leading-snug">{bulkJob.progressMessage}</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-primary" />
              {leadsWithMeetings} found
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Circle className="h-3 w-3 text-muted-foreground" />
              {bulkJob.noMeetings} no meetings
            </span>
            {bulkJob.failedJobs > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-destructive">
                  <X className="h-3 w-3" />
                  {bulkJob.failedJobs} failed
                </span>
              </>
            )}
          </div>

          {/* Processed leads log (live) */}
          {bulkJob.processedLeads.length > 0 && (
            <div className="border border-border rounded p-2 space-y-1">
              <button
                onClick={() => setShowLog(!showLog)}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground w-full text-left"
              >
                <List className="h-3 w-3" />
                {bulkJob.processedLeads.length} processed — click to {showLog ? "hide" : "see"} details
                {showLog ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </button>
              {showLog && (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {bulkJob.processedLeads.map((pl, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                      {pl.status === "found" && <Check className="h-3 w-3 text-primary shrink-0" />}
                      {pl.status === "no_meetings" && <Circle className="h-3 w-3 text-muted-foreground shrink-0" />}
                      {pl.status === "failed" && <X className="h-3 w-3 text-destructive shrink-0" />}
                      <span className={`truncate ${pl.status === "failed" ? "text-destructive" : "text-foreground"}`}>
                        {pl.name}
                        {pl.status === "found" && pl.meetingsCount ? ` (${pl.meetingsCount} meeting${pl.meetingsCount > 1 ? "s" : ""})` : ""}
                        {pl.status === "no_meetings" ? " (no meetings)" : ""}
                        {pl.status === "failed" && pl.error ? ` — ${pl.error}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pause / Resume / Cancel */}
          <div className="flex justify-end gap-1">
            {bulkPaused ? (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={resumeBulk}>
                <Play className="h-3 w-3 mr-1" />
                Resume
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={pauseBulk}>
                <Pause className="h-3 w-3 mr-1" />
                Pause
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={cancelBulk}>
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bulk complete — persists until manually dismissed */}
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
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-primary" />
              {leadsWithMeetings} found
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Circle className="h-3 w-3 text-muted-foreground" />
              {bulkJob.noMeetings} no meetings
            </span>
            {bulkJob.failedJobs > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-destructive">
                  <X className="h-3 w-3" />
                  {bulkJob.failedJobs} failed
                </span>
              </>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {bulkJob.foundMeetings} total meetings discovered
          </div>

          {/* Full processed leads log */}
          {bulkJob.processedLeads.length > 0 && (
            <div className="border border-border rounded p-2 space-y-1">
              <button
                onClick={() => setShowLog(!showLog)}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground w-full text-left"
              >
                <List className="h-3 w-3" />
                {bulkJob.processedLeads.length} leads — click to {showLog ? "hide" : "see"} details
                {showLog ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </button>
              {showLog && (
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {bulkJob.processedLeads.map((pl, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                      {pl.status === "found" && <Check className="h-3 w-3 text-primary shrink-0" />}
                      {pl.status === "no_meetings" && <Circle className="h-3 w-3 text-muted-foreground shrink-0" />}
                      {pl.status === "failed" && <X className="h-3 w-3 text-destructive shrink-0" />}
                      <span className={`truncate ${pl.status === "failed" ? "text-destructive" : "text-foreground"}`}>
                        {pl.name}
                        {pl.status === "found" && pl.meetingsCount ? ` (${pl.meetingsCount} meeting${pl.meetingsCount > 1 ? "s" : ""})` : ""}
                        {pl.status === "no_meetings" ? " (no meetings)" : ""}
                        {pl.status === "failed" && pl.error ? ` — ${pl.error}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Expandable error list */}
          {bulkJob.failedLeads.length > 0 && (
            <div className="border border-destructive/20 rounded p-2 space-y-1">
              <button
                onClick={() => setShowErrors(!showErrors)}
                className="flex items-center gap-1 text-[10px] font-medium text-destructive w-full text-left"
              >
                <AlertTriangle className="h-3 w-3" />
                {bulkJob.failedLeads.length} failed — click to {showErrors ? "hide" : "see"} details
                {showErrors ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </button>
              {showErrors && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {bulkJob.failedLeads.map((fl, idx) => (
                    <div key={idx} className="text-[10px] pl-4 border-l-2 border-destructive/30">
                      <span className="font-medium text-foreground">{fl.name}</span>
                      <p className="text-destructive/80 break-words">{fl.error}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
