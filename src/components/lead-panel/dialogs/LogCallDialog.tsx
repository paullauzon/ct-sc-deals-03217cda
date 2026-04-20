import { useEffect, useRef, useState } from "react";
import { Lead } from "@/types/lead";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logActivity, bumpStakeholderContact } from "@/lib/activityLog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const OUTCOMES = ["Connected", "Voicemail", "No Answer", "Bad Number"] as const;
type Outcome = typeof OUTCOMES[number];

interface Props {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  save: (updates: Partial<Lead>) => void;
}

export function LogCallDialog({ lead, open, onOpenChange, save }: Props) {
  const [outcome, setOutcome] = useState<Outcome>("Connected");
  const [duration, setDuration] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setOutcome("Connected"); setDuration(""); setSummary("");
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open]);

  const onSave = async () => {
    const s = summary.trim();
    if (!s && outcome === "Connected") {
      toast.error("Add a summary for connected calls");
      return;
    }
    setSaving(true);
    try {
      const parts: string[] = [outcome];
      if (duration) parts.push(`${duration}m`);
      if (s) parts.push(s);

      // AI-extract structured intel for substantial summaries (≥40 chars).
      // Fire-and-tolerate: a failure here must not block the call from being logged.
      let intel: Record<string, unknown> | null = null;
      if (s.length >= 40) {
        try {
          const { data, error } = await supabase.functions.invoke("extract-call-intel", {
            body: { summary: s, outcome, duration },
          });
          if (!error && data && !data.skipped && data.intel) {
            intel = data.intel as Record<string, unknown>;
          }
        } catch (err) {
          console.warn("extract-call-intel failed (non-fatal):", err);
        }
      }

      const metadata: Record<string, unknown> = {
        outcome,
        duration_minutes: duration ? Number(duration) || 0 : 0,
        summary: s,
        ...(intel ? { intel } : {}),
      };

      await logActivity(
        lead.id,
        "call_logged",
        `Call logged: ${parts.join(" · ")}`,
        null,
        null,
        metadata,
      );
      // Connected calls bump last contact + stakeholder timestamp where applicable
      if (outcome === "Connected") {
        save({ lastContactDate: new Date().toISOString().split("T")[0] });
        if (lead.email) await bumpStakeholderContact(lead.id, [lead.email]);
      }
      toast.success(intel ? "Call logged with AI summary" : "Call logged");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Log call</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Outcome</label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration (min)</label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="0" className="h-9 text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Summary</label>
            <Textarea ref={ref} value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="What was discussed, next steps…" className="text-sm mt-1 resize-none" />
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              Summaries ≥40 chars are auto-enriched with decisions, action items, and next steps.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Log call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
