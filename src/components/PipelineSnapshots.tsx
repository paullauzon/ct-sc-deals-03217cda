import { useMemo, useEffect, useState } from "react";
import { Lead, LeadStage } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";

const STAGE_WEIGHTS: Record<string, number> = {
  "Unassigned": 0.05, "In Contact": 0.15, "Discovery Scheduled": 0.30, "Discovery Completed": 0.40,
  "Sample Sent": 0.50, "Proposal Sent": 0.60, "Negotiating": 0.75,
  "New Lead": 0.05, "Qualified": 0.15, "Contacted": 0.20, "Meeting Set": 0.30,
  "Meeting Held": 0.40, "Negotiation": 0.70, "Contract Sent": 0.90,
};

import { isClosedStage, normalizeStage } from "@/lib/leadUtils";
const CLOSED_STAGES = { has: (s: string) => isClosedStage(normalizeStage(s)) };

interface Snapshot {
  snapshot_date: string;
  total_pipeline_value: number;
  weighted_pipeline_value: number;
  deal_count: number;
  stage_data: Record<string, { count: number; value: number }>;
}

interface Props {
  leads: Lead[];
}

export function PipelineSnapshots({ leads }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // Save today's snapshot on mount (once per day)
  useEffect(() => {
    const saveSnapshot = async () => {
      const today = new Date().toISOString().split("T")[0];
      
      // Check if today's snapshot already exists
      const { data: existing } = await supabase
        .from("pipeline_snapshots" as any)
        .select("id")
        .eq("snapshot_date", today)
        .limit(1);
      
      if (existing && existing.length > 0) return;

      const activeLeads = leads.filter(l => !CLOSED_STAGES.has(l.stage));
      const stageData: Record<string, { count: number; value: number }> = {};
      for (const l of activeLeads) {
        if (!stageData[l.stage]) stageData[l.stage] = { count: 0, value: 0 };
        stageData[l.stage].count++;
        stageData[l.stage].value += l.dealValue;
      }
      const totalValue = activeLeads.reduce((s, l) => s + l.dealValue, 0);
      const weightedValue = activeLeads.reduce((s, l) => s + l.dealValue * (STAGE_WEIGHTS[l.stage] || 0), 0);

      await supabase.from("pipeline_snapshots" as any).insert({
        snapshot_date: today,
        total_pipeline_value: totalValue,
        weighted_pipeline_value: Math.round(weightedValue),
        deal_count: activeLeads.length,
        stage_data: stageData,
      } as any);
    };

    if (leads.length > 0) saveSnapshot();
  }, [leads]);

  // Fetch last 12 snapshots
  useEffect(() => {
    const fetchSnapshots = async () => {
      const { data } = await supabase
        .from("pipeline_snapshots" as any)
        .select("*")
        .order("snapshot_date", { ascending: false })
        .limit(12);
      if (data) setSnapshots(data as unknown as Snapshot[]);
    };
    fetchSnapshots();
  }, []);

  const comparison = useMemo(() => {
    if (snapshots.length < 2) return null;
    const current = snapshots[0];
    const prev = snapshots[1];
    const oldest = snapshots[snapshots.length - 1];
    return {
      current,
      prev,
      oldest,
      valueChange: current.total_pipeline_value - prev.total_pipeline_value,
      weightedChange: current.weighted_pipeline_value - prev.weighted_pipeline_value,
      dealCountChange: current.deal_count - prev.deal_count,
    };
  }, [snapshots]);

  if (snapshots.length === 0) {
    return (
      <div className="border border-border rounded-lg px-5 py-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Pipeline Trend</p>
        <p className="text-sm text-muted-foreground mt-2">Snapshots will appear after the first day of tracking.</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg px-5 py-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Pipeline Trend ({snapshots.length} snapshots)</p>
      
      {/* Sparkline */}
      <div className="flex items-end gap-1 h-12 mb-3">
        {snapshots.slice().reverse().map((s, i) => {
          const max = Math.max(...snapshots.map(s => s.weighted_pipeline_value), 1);
          const height = (s.weighted_pipeline_value / max) * 100;
          return (
            <div
              key={i}
              className="flex-1 bg-foreground/20 rounded-t hover:bg-foreground/40 transition-colors"
              style={{ height: `${Math.max(height, 4)}%` }}
              title={`${s.snapshot_date}: $${s.weighted_pipeline_value.toLocaleString()} weighted`}
            />
          );
        })}
      </div>

      {/* Comparison */}
      {comparison && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Pipeline Δ</p>
            <p className={`font-medium tabular-nums ${comparison.valueChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {comparison.valueChange >= 0 ? "+" : ""}${comparison.valueChange.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Weighted Δ</p>
            <p className={`font-medium tabular-nums ${comparison.weightedChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {comparison.weightedChange >= 0 ? "+" : ""}${comparison.weightedChange.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Deals Δ</p>
            <p className={`font-medium tabular-nums ${comparison.dealCountChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {comparison.dealCountChange >= 0 ? "+" : ""}{comparison.dealCountChange}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
