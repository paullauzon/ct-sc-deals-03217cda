// Tab 2 — dead stages: Qualified, Contacted, Went Dark. Each gets a one-click
// resolution. Went Dark always becomes Closed Lost with reason set.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StageCounts } from "../PipelineMigrationPage";

interface Cleanup {
  key: string;
  from: string;
  to: string;
  count: keyof StageCounts;
  patch?: Record<string, any>;
  description: string;
}

const CLEANUPS: Cleanup[] = [
  {
    key: "qualified",
    from: "Qualified",
    to: "In Contact",
    count: "qualified",
    description: "Qualified is being merged into In Contact.",
  },
  {
    key: "contacted",
    from: "Contacted",
    to: "In Contact",
    count: "contacted",
    description: "Contacted is being merged into In Contact.",
  },
  {
    key: "wentDark",
    from: "Went Dark",
    to: "Closed Lost",
    count: "wentDark",
    patch: { lost_reason_v2: "Went Dark / No response" },
    description: "Went Dark becomes Closed Lost with the locked-dropdown lost reason set.",
  },
];

export function DeadStageCleanupTab({ counts, onChange }: { counts: StageCounts; onChange: () => void }) {
  const [running, setRunning] = useState<string | null>(null);

  const runCleanup = async (c: Cleanup) => {
    if (counts[c.count] === 0) return;
    setRunning(c.key);
    try {
      const { data: rows } = await supabase
        .from("leads")
        .select("id")
        .eq("stage", c.from)
        .is("archived_at", null);
      const ids = (rows || []).map((r: any) => r.id);

      const updatePayload: Record<string, any> = { stage: c.to, ...(c.patch || {}) };
      const { error } = await supabase
        .from("leads")
        // @ts-ignore — dynamic patch with optional v2 fields
        .update(updatePayload)
        .eq("stage", c.from)
        .is("archived_at", null);
      if (error) throw error;

      if (ids.length > 0) {
        const logs = ids.map(id => ({
          lead_id: id,
          event_type: "stage_migration_v2",
          description: `Dead-stage cleanup: ${c.from} → ${c.to}`,
          old_value: c.from,
          new_value: c.to,
        }));
        await supabase.from("lead_activity_log").insert(logs as any);
      }
      toast.success(`Resolved ${ids.length} ${c.from} deal${ids.length === 1 ? "" : "s"}.`);
      onChange();
    } catch (e: any) {
      toast.error(`Cleanup failed: ${e.message ?? e}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium mb-1">Dead stage cleanup</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Stages being killed. Empty rows simply disappear when their last deal is moved.
      </p>

      <div className="space-y-3">
        {CLEANUPS.map(c => {
          const count = counts[c.count];
          const done = count === 0;
          const isRunning = running === c.key;
          return (
            <div key={c.key} className="p-4 border border-border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1 text-sm">
                  <span className="font-mono px-2 py-0.5 rounded bg-secondary">{c.from}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono px-2 py-0.5 rounded bg-secondary">{c.to}</span>
                </div>
                <div className="text-sm text-muted-foreground tabular-nums w-20 text-right">
                  {count} deal{count === 1 ? "" : "s"}
                </div>
                {done ? (
                  <div className="flex items-center gap-1.5 text-xs text-foreground w-24 justify-end">
                    <CheckCircle2 className="h-4 w-4" />
                    Done
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled={isRunning}
                    onClick={() => runCleanup(c)}
                    className="w-24"
                  >
                    {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Resolve"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{c.description}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
