// Round 7 — Attribution Health 7-day sparkline. Reads the daily digest rows
// emitted by `daily-attribution-health` from `cron_run_log`. Renders a simple
// inline bar sparkline of unmatched_total over the last 7 days plus the
// current snapshot of the four key counters.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";

interface DailyRow {
  ran_at: string;
  details: {
    unmatched_total?: number;
    claimed_24h?: number;
    noise_routed_24h?: number;
    pending_intermediaries?: number;
    pending_attributions?: number;
    quarantined_leads?: number;
  };
}

export function AttributionHealthPanel() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sinceIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("cron_run_log")
        .select("ran_at, details")
        .eq("job_name", "daily-attribution-health")
        .gte("ran_at", sinceIso)
        .order("ran_at", { ascending: true })
        .limit(20);
      setRows(((data || []) as any[]).map((r) => ({ ran_at: r.ran_at, details: r.details || {} })));
      setLoading(false);
    })();
  }, []);

  if (loading) return null;
  if (rows.length === 0) return null;

  const latest = rows[rows.length - 1].details;
  const sparkData = rows.map((r) => r.details.unmatched_total ?? 0);
  const max = Math.max(1, ...sparkData);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Attribution health</span>
        <span className="text-[11px] text-muted-foreground ml-auto">last 7 days</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Unmatched" value={latest.unmatched_total ?? 0} />
        <Stat label="Claimed (24h)" value={latest.claimed_24h ?? 0} />
        <Stat label="Noise routed (24h)" value={latest.noise_routed_24h ?? 0} />
        <Stat label="Pending review" value={(latest.pending_attributions ?? 0) + (latest.pending_intermediaries ?? 0)} />
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-end gap-1 h-10">
          {sparkData.map((v, i) => (
            <div
              key={i}
              className="flex-1 bg-foreground/20 rounded-sm"
              style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
              title={`${v.toLocaleString()} unmatched on ${new Date(rows[i].ran_at).toLocaleDateString()}`}
            />
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 text-right">
          Unmatched total over time — lower is better
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
