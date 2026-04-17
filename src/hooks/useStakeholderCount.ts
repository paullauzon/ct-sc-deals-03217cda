import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Lightweight count-only fetch (no realtime) to avoid double-fetching the full StakeholderCard list. */
export function useStakeholderCount(leadId: string | undefined): { count: number; loading: boolean } {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { count: n } = await (supabase as any)
        .from("lead_stakeholders")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId);
      if (!cancelled) {
        setCount(typeof n === "number" ? n : 0);
        setLoading(false);
      }
    })();

    // Refresh on insert/delete only — sentiment edits don't change the count
    const channel = (supabase as any)
      .channel(`stakeholder-count-${leadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_stakeholders", filter: `lead_id=eq.${leadId}` }, () => setCount(c => c + 1))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "lead_stakeholders", filter: `lead_id=eq.${leadId}` }, () => setCount(c => Math.max(0, c - 1)))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [leadId]);

  return { count, loading };
}
