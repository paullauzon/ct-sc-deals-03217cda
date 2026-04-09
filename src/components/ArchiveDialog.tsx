import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Archive } from "lucide-react";

interface ArchiveDialogProps {
  open: boolean;
  leadName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ArchiveDialog({ open, leadName, onConfirm, onCancel }: ArchiveDialogProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason("");
  };

  const handleCancel = () => {
    setReason("");
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" /> Archive {leadName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Why are you archiving this lead?</label>
          <Textarea
            placeholder="e.g. Test lead, Duplicate, Not a real prospect..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[80px]"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason.trim()}>
            <Archive className="h-3.5 w-3.5 mr-1" /> Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
