import { useLeads } from "@/contexts/LeadContext";
import { useProcessing } from "@/contexts/ProcessingContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, AlertTriangle } from "lucide-react";

export function BulkProcessingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { leads } = useLeads();
  const { startBulkProcessing } = useProcessing();

  const handleStart = () => {
    startBulkProcessing();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Process All Leads
          </DialogTitle>
          <DialogDescription>
            Bulk-fetch all Fireflies transcripts and process them for every lead.
          </DialogDescription>
        </DialogHeader>
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
                Processing runs in the background — you can navigate freely.
                You can cancel at any time — progress is saved.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleStart}>
              <Zap className="h-4 w-4 mr-1" />
              Start Processing
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
