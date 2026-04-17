import { useEffect, useRef, useState } from "react";
import { Lead } from "@/types/lead";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

interface Props {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDialog({ lead, open, onOpenChange }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(""); setDescription(""); setDueDate(today);
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open]);

  const onSave = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("lead_tasks").insert({
        lead_id: lead.id, playbook: "manual", sequence_order: 0, task_type: "manual",
        title: t, description: description.trim(), due_date: dueDate, status: "pending",
      } as any);
      if (error) { toast.error("Failed to add task"); return; }
      await logActivity(lead.id, "field_update", `Task added: ${t}`);
      toast.success("Task added");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">New task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Title</label>
            <Input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" className="h-9 text-sm mt-1" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Due date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description (optional)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-sm mt-1 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={!title.trim() || saving}>
            {saving ? "Saving…" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
