import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { useProcessing } from "@/contexts/ProcessingContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, AlertTriangle } from "lucide-react";

export function BulkProcessingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { leads } = useLeads();
  const { startBulkProcessing } = useProcessing();

  const unprocessedCount = useMemo(
    () => leads.filter(l => !l.meetings || l.meetings.length === 0).length,
    [leads]
  );

  const [count, setCount] = useState<number | "">(unprocessedCount);

  // Sync default when dialog opens
  useMemo(() => {
    if (open) setCount(unprocessedCount);
  }, [open, unprocessedCount]);

  const handleStart = () => {
    const limit = typeof count === "number" && count > 0 ? count : unprocessedCount;
    startBulkProcessing(limit);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Process Leads Without Meetings
          </DialogTitle>
          <DialogDescription>
            Search Fireflies for transcripts and process them for leads that don't have any meetings yet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>{unprocessedCount}</strong> of {leads.length} leads have no meetings attached.
              {unprocessedCount === 0 && " All leads already have meetings — nothing to process."}
            </p>
            {unprocessedCount > 0 && (
              <>
                <div className="flex items-center gap-3 mt-3">
                  <Label htmlFor="count-input" className="whitespace-nowrap text-foreground">
                    Leads to process:
                  </Label>
                  <Input
                    id="count-input"
                    type="number"
                    min={1}
                    max={unprocessedCount}
                    value={count}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCount(v === "" ? "" : Math.min(Math.max(1, parseInt(v) || 1), unprocessedCount));
                    }}
                    className="w-24"
                  />
                  <span className="text-xs text-muted-foreground">of {unprocessedCount}</span>
                </div>
                <p className="mt-2">This will:</p>
                <ol className="list-decimal ml-5 space-y-1">
                  <li>Search both CT and SC Fireflies accounts for each lead</li>
                  <li>Match transcripts by email, domain, name, and speaker</li>
                  <li>Process each transcript with AI to extract intelligence</li>
                  <li>Auto-update high-confidence CRM fields (stage, dates, etc.)</li>
                  <li>Synthesize deal intelligence for each lead</li>
                </ol>
                <div className="flex items-start gap-2 mt-3 p-3 bg-secondary/50 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs">
                    Leads that already have meetings attached will not be touched.
                    Processing runs in the background — you can navigate freely.
                    You can pause or cancel at any time — progress is saved.
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleStart} disabled={unprocessedCount === 0}>
              <Zap className="h-4 w-4 mr-1" />
              Process {typeof count === "number" ? count : unprocessedCount} Lead{(typeof count === "number" ? count : unprocessedCount) !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
