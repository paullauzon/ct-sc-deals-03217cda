import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LastRunSummary {
  matched: number;
  scanned: number;
  remaining: number | null;
  ranAt: string;
  kind: "rematch" | "cleanup";
}

const STORAGE_KEY = "lovable.matcher.last-run";

function readLastRun(): LastRunSummary | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastRunSummary;
  } catch {
    return null;
  }
}

function writeLastRun(summary: LastRunSummary) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {
    // ignore storage errors
  }
}

/**
 * Shared controls for the email matcher. Used by both the Mailboxes tab
 * (Email matching strip) and the Unmatched inbox header so there is one
 * source of truth for re-match / cleanup-sweep behavior.
 */
export function useMatcherControls() {
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<LastRunSummary | null>(() => readLastRun());
  const [busy, setBusy] = useState(false);

  const refreshUnmatchedCount = useCallback(async () => {
    const { count } = await supabase
      .from("lead_emails")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", "unmatched");
    setUnmatchedCount(count ?? 0);
  }, []);

  useEffect(() => {
    refreshUnmatchedCount();
  }, [refreshUnmatchedCount]);

  const persistRun = (summary: LastRunSummary) => {
    setLastRun(summary);
    writeLastRun(summary);
  };

  const rematchAll = useCallback(
    async (opts?: { confirm?: boolean; limit?: number }): Promise<boolean> => {
      if (busy) return false;
      const limit = opts?.limit ?? 2000;
      if (opts?.confirm !== false) {
        const ok = window.confirm(
          `Re-run the matcher across unmatched emails (up to ${limit})? Rows linked to a lead will move out of the inbox automatically.`,
        );
        if (!ok) return false;
      }
      setBusy(true);
      const toastId = toast.loading("Re-matching unmatched emails…");
      try {
        const { data, error } = await supabase.functions.invoke("rematch-unmatched-emails", {
          body: { limit },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Re-match failed");
        const matched = data.matched ?? 0;
        const scanned = data.scanned ?? 0;
        const remaining = data.remaining_unmatched ?? null;
        toast.success(
          matched === 0
            ? "No new matches — remaining rows are genuinely unclaimable"
            : `Matched ${matched} email${matched === 1 ? "" : "s"}${remaining != null ? ` · ${remaining} still unmatched` : ""}`,
          { id: toastId, duration: 5000 },
        );
        persistRun({
          matched,
          scanned,
          remaining,
          ranAt: new Date().toISOString(),
          kind: "rematch",
        });
        await refreshUnmatchedCount();
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Re-match failed", { id: toastId });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, refreshUnmatchedCount],
  );

  const cleanupSweep = useCallback(
    async (opts?: { confirm?: boolean }): Promise<boolean> => {
      if (busy) return false;
      if (opts?.confirm !== false) {
        const ok = window.confirm(
          "Run cleanup sweep? This unstaples wrongly-matched emails (personal-provider domains, ambiguous matches, duplicate-lead routing) and re-runs the matcher with the corrected logic. Safe to re-run anytime.",
        );
        if (!ok) return false;
      }
      setBusy(true);
      const toastId = toast.loading("Step 1 of 2 — un-stapling wrong matches…");
      try {
        const { data: unclaimRes, error: unclaimErr } = await supabase.functions.invoke("unclaim-bad-matches", {});
        if (unclaimErr) throw unclaimErr;
        if (!unclaimRes?.ok) throw new Error(unclaimRes?.error || "Cleanup failed");
        const unclaimed = unclaimRes.unclaimed ?? 0;
        const redirected = unclaimRes.redirected_to_canonical ?? 0;

        toast.loading(`Step 2 of 2 — re-matching ${unclaimed} freed emails…`, { id: toastId });
        const { data: rematchRes, error: rematchErr } = await supabase.functions.invoke("rematch-unmatched-emails", {
          body: { limit: 5000 },
        });
        if (rematchErr) throw rematchErr;
        const matched = rematchRes?.matched ?? 0;
        const scanned = rematchRes?.scanned ?? 0;
        const remaining = rematchRes?.remaining_unmatched ?? null;

        toast.success(
          `Cleanup complete · ${unclaimed} un-stapled · ${redirected} redirected to canonical · ${matched} re-matched${remaining != null ? ` · ${remaining} unmatched` : ""}`,
          { id: toastId, duration: 8000 },
        );
        persistRun({
          matched,
          scanned,
          remaining,
          ranAt: new Date().toISOString(),
          kind: "cleanup",
        });
        await refreshUnmatchedCount();
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Cleanup failed", { id: toastId });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, refreshUnmatchedCount],
  );

  return {
    unmatchedCount,
    lastRun,
    busy,
    rematchAll,
    cleanupSweep,
    refreshUnmatchedCount,
  };
}
