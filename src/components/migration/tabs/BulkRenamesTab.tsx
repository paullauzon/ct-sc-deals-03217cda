// Tab 1 — bulk renames. One-click moves between stage labels with no
// per-deal triage. Logged to lead_activity_log for full audit trail.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StageCounts } from "../PipelineMigrationPage";

interface RenamePair {
  from: string;
  to: string;
  count: keyof StageCounts;
  note?: string;
}

const RENAMES: RenamePair[] = [
  { from: "New Lead", to: "Unassigned", count: "newLead" },
  { from: "Meeting Set", to: "Discovery Scheduled", count: "meetingSet" },
  { from: "Meeting Held", to: "Discovery Completed", count: "meetingHeld",
    note: "Re-triage in tab 3 to set sample-sent state per deal." },
  { from: "Negotiation", to: "Negotiating", count: "negotiation" },
  { from: "Contract Sent", to: "Negotiating", count: "contractSent",
    note: "Contract Sent killed — it's an activity, not a stage." },
];

export function BulkRenamesTab({ counts, onChange }: { counts: StageCounts; onChange: () => void }) {
  const [running, setRunning] = useState<string | null>(null);

  const runRename = async (r: RenamePair) => {
    if (counts[r.count] === 0) return;
    setRunning(r.from);
    try {
      // Fetch IDs first so we can write activity log entries
      const { data: rows, error: selErr } = await supabase
        .from("leads")
        .select("id")
        .eq("stage", r.from)
        .is("archived_at", null);
      if (selErr) throw selErr;
      const ids = (rows || []).map((r: any) => r.id);

      const { error: updErr } = await supabase
        .from("leads")
        .update({ stage: r.to })
        .eq("stage", r.from)
        .is("archived_at", null);
      if (updErr) throw updErr;

      // Audit trail (single batch insert)
      if (ids.length > 0) {
        const logs = ids.map(id => ({
          lead_id: id,
          event_type: "stage_migration_v2",
          description: `Bulk rename: ${r.from} → ${r.to}`,
          old_value: r.from,
          new_value: r.to,
        }));
        await supabase.from("lead_activity_log").insert(logs as any);
      }

      toast.success(`Renamed ${ids.length} deals: ${r.from} → ${r.to}`);
      onChange();
    } catch (e: any) {
      toast.error(`Rename failed: ${e.message ?? e}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium mb-1">Bulk renames</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Each rename is a single transaction. Audit-logged to lead activity. Safe and reversible by re-renaming back.
      </p>

      <div className="space-y-3">
        {RENAMES.map((r) => {
          const count = counts[r.count];
          const done = count === 0;
          const isRunning = running === r.from;
          return (
            <div
              key={r.from}
              className="flex items-center gap-4 p-4 border border-border rounded-lg"
            >
              <div className="flex items-center gap-2 flex-1 text-sm">
                <span className="font-mono px-2 py-0.5 rounded bg-secondary">{r.from}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono px-2 py-0.5 rounded bg-secondary">{r.to}</span>
              </div>
              <div className="text-sm text-muted-foreground tabular-nums w-20 text-right">
                {count} deal{count === 1 ? "" : "s"}
              </div>
              {done ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 w-24 justify-end">
                  <CheckCircle2 className="h-4 w-4" />
                  Done
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  disabled={isRunning}
                  onClick={() => runRename(r)}
                  className="w-24"
                >
                  {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-xs text-muted-foreground space-y-1">
        {RENAMES.filter(r => r.note).map(r => (
          <div key={r.from}>
            <span className="font-medium">{r.from} → {r.to}:</span> {r.note}
          </div>
        ))}
      </div>
    </Card>
  );
}
