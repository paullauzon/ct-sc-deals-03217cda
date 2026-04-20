import { useEffect, useMemo, useState } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { ACTIVE_STAGES, normalizeStage } from "@/lib/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import { TrendingDown, AlertTriangle, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pipeline Health v2 — operational health snapshot of the new 9-stage funnel.
 * Three sections:
 *  1. Stage drop-off % between consecutive active stages (lower = leak)
 *  2. SLA-stuck deals per stage (count of `sla-*` playbook tasks pending)
 *  3. Nurture sequence performance (active / re-engaged / completed / archived)
 */
export function PipelineHealthV2() {
  const { leads } = useLeads();
  const [slaTasksByLead, setSlaTasksByLead] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lead_tasks")
        .select("lead_id, playbook")
        .eq("status", "pending")
        .like("playbook", "sla-%")
        .limit(2000);
      if (cancelled) return;
      const map: Record<string, number> = {};
      for (const t of data || []) map[t.lead_id] = (map[t.lead_id] || 0) + 1;
      setSlaTasksByLead(map);
    })();
    return () => { cancelled = true; };
  }, [leads.length]);

  const { dropoffs, slaPerStage, nurtureCounts, totalActive } = useMemo(() => {
    const active = leads;
    const byStage: Record<string, number> = {};
    for (const l of active) {
      const s = normalizeStage(l.stage);
      byStage[s] = (byStage[s] || 0) + 1;
    }

    // Drop-off % from stage[i] → stage[i+1] across the 7 active stages.
    const dropoffs = ACTIVE_STAGES.slice(0, -1).map((from, i) => {
      const to = ACTIVE_STAGES[i + 1];
      const fromCount = byStage[from] || 0;
      const toCount = byStage[to] || 0;
      const pct = fromCount > 0 ? Math.round(((fromCount - toCount) / fromCount) * 100) : 0;
      return { from, to, fromCount, toCount, pct };
    });

    // SLA-stuck deals per stage.
    const slaPerStage: Record<string, number> = {};
    for (const l of active) {
      if (slaTasksByLead[l.id]) {
        const s = normalizeStage(l.stage);
        slaPerStage[s] = (slaPerStage[s] || 0) + 1;
      }
    }

    const nurtureCounts = {
      active: active.filter(l => l.nurtureSequenceStatus === "active").length,
      reEngaged: active.filter(l => l.nurtureSequenceStatus === "re_engaged").length,
      completed: active.filter(l => l.nurtureSequenceStatus === "completed").length,
      archived: active.filter(l => l.nurtureSequenceStatus === "archived").length,
    };

    return { dropoffs, slaPerStage, nurtureCounts, totalActive: active.length };
  }, [leads, slaTasksByLead]);

  const totalSlaStuck = Object.values(slaPerStage).reduce((s, n) => s + n, 0);
  const totalNurture = Object.values(nurtureCounts).reduce((s, n) => s + n, 0);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Pipeline Health v2</h3>
          <p className="text-xs text-muted-foreground mt-0.5">9-stage funnel · drop-off · SLA · nurture</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{totalActive} active</span>
      </div>

      {/* Section 1 — Stage drop-off */}
      <section>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          <TrendingDown className="h-3 w-3" /> Stage drop-off
        </div>
        <div className="space-y-1.5">
          {dropoffs.map(d => {
            const severity = d.pct >= 80 ? "critical" : d.pct >= 60 ? "warn" : "ok";
            return (
              <div key={d.from} className="flex items-center gap-3 text-xs">
                <div className="flex-1 truncate text-muted-foreground">
                  {d.from} → {d.to}
                </div>
                <div className="text-foreground/60 tabular-nums w-16 text-right">
                  {d.fromCount} → {d.toCount}
                </div>
                <div className={cn(
                  "tabular-nums font-medium w-12 text-right",
                  severity === "critical" && "text-foreground",
                  severity === "warn" && "text-foreground/80",
                  severity === "ok" && "text-muted-foreground",
                )}>
                  {d.pct}%
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2 — SLA stuck */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <AlertTriangle className="h-3 w-3" /> Deals past SLA
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{totalSlaStuck} flagged</span>
        </div>
        {totalSlaStuck === 0 ? (
          <p className="text-xs text-muted-foreground italic">No SLA breaches.</p>
        ) : (
          <div className="space-y-1.5">
            {ACTIVE_STAGES.filter(s => slaPerStage[s]).map(s => (
              <div key={s} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{s}</span>
                <span className="font-medium tabular-nums">{slaPerStage[s]} stuck</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 3 — Nurture */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <Sprout className="h-3 w-3" /> 90-day nurture
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{totalNurture} enrolled</span>
        </div>
        {totalNurture === 0 ? (
          <p className="text-xs text-muted-foreground italic">No leads in nurture sequence.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 text-center">
            <NurtureChip label="Active" value={nurtureCounts.active} />
            <NurtureChip label="Re-engaged" value={nurtureCounts.reEngaged} highlight />
            <NurtureChip label="Completed" value={nurtureCounts.completed} />
            <NurtureChip label="Archived" value={nurtureCounts.archived} />
          </div>
        )}
      </section>
    </div>
  );
}

function NurtureChip({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-md py-2 px-2 bg-secondary",
      highlight && value > 0 && "ring-1 ring-foreground/20"
    )}>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}
