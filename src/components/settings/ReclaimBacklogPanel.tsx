// Round 7 — admin-triggered "Reclaim the unmatched backlog" tile.
// Shows the live unmatched count and runs `reclaim-unmatched-backlog` on
// click. Polls until the count stops dropping or the function reports done.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2, Inbox } from "lucide-react";
import { toast } from "sonner";

interface ReclaimResult {
  ok: boolean;
  scanned?: number;
  reclassified?: number;
  thread_claimed?: number;
  forward_claimed?: number;
  cc_claimed?: number;
  internal_claimed?: number;
  noise_routed?: number;
  remaining_unmatched_in_run?: number;
  error?: string;
}

export function ReclaimBacklogPanel({ onComplete }: { onComplete?: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ReclaimResult | null>(null);

  const refresh = async () => {
    const { count: c } = await supabase
      .from("lead_emails")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", "unmatched");
    setCount(c ?? 0);
  };

  useEffect(() => { refresh(); }, []);

  const reclaim = async () => {
    if (!count) return;
    if (!window.confirm(`Re-process ${count.toLocaleString()} unmatched emails through the full classification pipeline? This may take 1–3 minutes per chunk.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("reclaim-unmatched-backlog", { body: {} });
      if (error) throw error;
      const r = (data || {}) as ReclaimResult;
      setLastResult(r);
      if (!r.ok) throw new Error(r.error || "Reclaim failed");
      toast.success(
        `Reclaimed ${r.reclassified ?? 0} of ${r.scanned ?? 0} scanned`,
        { description: `${r.thread_claimed ?? 0} thread · ${r.cc_claimed ?? 0} CC · ${r.forward_claimed ?? 0} forwards · ${r.noise_routed ?? 0} noise · ${r.internal_claimed ?? 0} internal` },
      );
      await refresh();
      onComplete?.();
    } catch (e: any) {
      toast.error(e.message || "Reclaim failed");
    } finally {
      setBusy(false);
    }
  };

  if (count === null) return null;
  if (count === 0 && !lastResult) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Reclaim historical unmatched backlog</span>
      </div>
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm">
            <span className="font-medium tabular-nums">{count.toLocaleString()}</span>
            <span className="text-muted-foreground"> email{count === 1 ? "" : "s"} still in unmatched</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Re-runs noise classification, thread continuity, CC overlap, forwarded-sender extraction, and internal-team routing across every existing unmatched row.
          </div>
          {lastResult && lastResult.ok && (
            <div className="text-[11px] text-muted-foreground mt-1">
              Last run: scanned {lastResult.scanned ?? 0} ·
              {" "}thread {lastResult.thread_claimed ?? 0} ·
              {" "}CC {lastResult.cc_claimed ?? 0} ·
              {" "}forwards {lastResult.forward_claimed ?? 0} ·
              {" "}noise {lastResult.noise_routed ?? 0} ·
              {" "}internal {lastResult.internal_claimed ?? 0}
            </div>
          )}
        </div>
        <Button size="sm" onClick={reclaim} disabled={busy || count === 0}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
          Reclaim now
        </Button>
      </div>
    </div>
  );
}
