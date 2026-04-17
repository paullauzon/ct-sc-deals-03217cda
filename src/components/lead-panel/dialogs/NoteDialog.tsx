import { useEffect, useRef, useState } from "react";
import { Lead } from "@/types/lead";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

interface Props {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  save: (updates: Partial<Lead>) => void;
}

export function NoteDialog({ lead, open, onOpenChange, save }: Props) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open]);

  const onSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const stamp = `--- ${new Date().toISOString().split("T")[0]} · ${lead.assignedTo || "—"} ---`;
      const newNotes = lead.notes ? `${lead.notes}\n\n${stamp}\n${trimmed}` : `${stamp}\n${trimmed}`;
      save({ notes: newNotes });
      await logActivity(lead.id, "note_added", `Note: ${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}`);
      toast.success("Note added");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Add note</DialogTitle>
        </DialogHeader>
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Note about ${lead.name}…`}
          rows={6}
          className="text-sm resize-none"
        />
        <p className="text-[10px] text-muted-foreground">Saved to lead notes & activity log. ⌘+Enter to save.</p>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={!text.trim() || saving}>
            {saving ? "Saving…" : "Save note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
