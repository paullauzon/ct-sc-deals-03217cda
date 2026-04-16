import { useMemo, useEffect, useState } from "react";
import { Lead } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  leads: Lead[];
}

interface Snapshot {
  snapshot_date: string;
  weighted_pipeline_value: number;
  total_pipeline_value: number;
}

function parseDate(d: string): Date | null {
  if (!d) return null;
  const p = new Date(d);
  return isNaN(p.getTime()) ? null : p;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()} Q${q}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

export function DashboardTrends({ leads }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("pipeline_snapshots")
        .select("snapshot_date, weighted_pipeline_value, total_pipeline_value")
        .order("snapshot_date", { ascending: true })
        .limit(52);
      if (data) setSnapshots(data as Snapshot[]);
    };
    fetch();
  }, []);

  // Block 1: Win Rate Over Time (by month)
  const winRateData = useMemo(() => {
    const months: Record<string, { won: number; lost: number }> = {};
    for (const l of leads) {
      if (!["Closed Won", "Lost"].includes(l.stage)) continue;
      const d = parseDate(l.closedDate);
      if (!d) continue;
      const mk = monthKey(d);
      if (!months[mk]) months[mk] = { won: 0, lost: 0 };
      if (l.stage === "Closed Won") months[mk].won++;
      else months[mk].lost++;
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([month, { won, lost }]) => ({
        month: month.slice(5), // "MM"
        rate: Math.round((won / (won + lost)) * 100),
        won,
        total: won + lost,
      }));
  }, [leads]);

  // Block 2: Sales Cycle Trend (avg days for won deals by month)
  const cycleData = useMemo(() => {
    const months: Record<string, number[]> = {};
    for (const l of leads) {
      if (l.stage !== "Closed Won") continue;
      const cd = parseDate(l.closedDate);
      const sd = parseDate(l.dateSubmitted);
      if (!cd || !sd) continue;
      const mk = monthKey(cd);
      if (!months[mk]) months[mk] = [];
      months[mk].push(daysBetween(sd, cd));
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([month, days]) => ({
        month: month.slice(5),
        avg: Math.round(days.reduce((s, d) => s + d, 0) / days.length),
        count: days.length,
      }));
  }, [leads]);

  // Block 3: Pipeline Value Trend (from snapshots)
  const pipelineData = useMemo(() => {
    return snapshots.slice(-12).map(s => ({
      date: s.snapshot_date.slice(5), // "MM-DD"
      weighted: Math.round(Number(s.weighted_pipeline_value)),
      total: Math.round(Number(s.total_pipeline_value)),
    }));
  }, [snapshots]);

  // Block 4: Cohort Analysis
  const cohortData = useMemo(() => {
    const cohorts: Record<string, { count: number; metSet: number; won: number; closed: number; totalDealValue: number }> = {};
    for (const l of leads) {
      const d = parseDate(l.dateSubmitted);
      if (!d) continue;
      const qk = quarterKey(d);
      if (!cohorts[qk]) cohorts[qk] = { count: 0, metSet: 0, won: 0, closed: 0, totalDealValue: 0 };
      cohorts[qk].count++;
      if (l.meetingDate || l.meetingSetDate) cohorts[qk].metSet++;
      if (l.stage === "Closed Won") { cohorts[qk].won++; cohorts[qk].totalDealValue += l.dealValue; }
      if (["Closed Won", "Lost"].includes(l.stage)) cohorts[qk].closed++;
    }
    return Object.entries(cohorts)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([quarter, d]) => ({
        quarter,
        count: d.count,
        meetingRate: d.count > 0 ? Math.round((d.metSet / d.count) * 100) : 0,
        winRate: d.closed > 0 ? Math.round((d.won / d.closed) * 100) : 0,
        avgDeal: d.won > 0 ? Math.round(d.totalDealValue / d.won) : 0,
      }));
  }, [leads]);

  const fmt$ = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Trend Analytics</h2>
      <div className="grid grid-cols-2 gap-4">
        {/* Block 1: Win Rate Over Time */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Win Rate Over Time</p>
          {winRateData.length > 1 ? (
            <>
              <div className="flex items-end gap-1 h-16">
                {winRateData.map((d, i) => {
                  const max = Math.max(...winRateData.map(x => x.rate), 1);
                  const h = (d.rate / max) * 100;
                  const isLast = i === winRateData.length - 1;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <span className="text-[9px] tabular-nums text-muted-foreground">{d.rate}%</span>
                      <div
                        className={`w-full rounded-t transition-colors ${isLast ? "bg-foreground/40" : "bg-foreground/15"}`}
                        style={{ height: `${Math.max(h, 6)}%` }}
                        title={`${d.month}: ${d.rate}% (${d.won}/${d.total})`}
                      />
                      <span className="text-[9px] text-muted-foreground">{d.month}</span>
                    </div>
                  );
                })}
              </div>
              {winRateData.length >= 2 && (
                <p className="text-[10px] text-muted-foreground mt-2 text-center">
                  {winRateData[winRateData.length - 1].rate >= winRateData[winRateData.length - 2].rate
                    ? "↑ Improving" : "↓ Declining"} vs prior month
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Insufficient closed deal data</p>
          )}
        </div>

        {/* Block 2: Sales Cycle Trend */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Sales Cycle Trend</p>
          {cycleData.length > 1 ? (
            <>
              <div className="flex items-end gap-1 h-16">
                {cycleData.map((d, i) => {
                  const max = Math.max(...cycleData.map(x => x.avg), 1);
                  const h = (d.avg / max) * 100;
                  const isLast = i === cycleData.length - 1;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <span className="text-[9px] tabular-nums text-muted-foreground">{d.avg}d</span>
                      <div
                        className={`w-full rounded-t transition-colors ${isLast ? "bg-foreground/40" : "bg-foreground/15"}`}
                        style={{ height: `${Math.max(h, 6)}%` }}
                        title={`${d.month}: avg ${d.avg}d (${d.count} deals)`}
                      />
                      <span className="text-[9px] text-muted-foreground">{d.month}</span>
                    </div>
                  );
                })}
              </div>
              {cycleData.length >= 2 && (
                <p className="text-[10px] text-muted-foreground mt-2 text-center">
                  {cycleData[cycleData.length - 1].avg <= cycleData[cycleData.length - 2].avg
                    ? "↑ Getting faster" : "↓ Getting slower"} vs prior month
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Insufficient won deal data</p>
          )}
        </div>

        {/* Block 3: Pipeline Value Trend */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Pipeline Value Trend</p>
          {pipelineData.length > 1 ? (
            <>
              <div className="flex items-end gap-1 h-16">
                {pipelineData.map((d, i) => {
                  const max = Math.max(...pipelineData.map(x => x.weighted), 1);
                  const h = (d.weighted / max) * 100;
                  const isLast = i === pipelineData.length - 1;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className={`w-full rounded-t transition-colors ${isLast ? "bg-foreground/40" : "bg-foreground/15"}`}
                        style={{ height: `${Math.max(h, 4)}%` }}
                        title={`${d.date}: ${fmt$(d.weighted)} weighted / ${fmt$(d.total)} total`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                <span>{pipelineData[0].date}</span>
                <span>{fmt$(pipelineData[pipelineData.length - 1].weighted)} weighted</span>
                <span>{pipelineData[pipelineData.length - 1].date}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Snapshots will appear after tracking begins</p>
          )}
        </div>

        {/* Block 4: Cohort Analysis */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Cohort Analysis</p>
          {cohortData.length > 0 ? (
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_40px_50px_50px_50px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                <span>Cohort</span>
                <span className="text-right">Leads</span>
                <span className="text-right">Mtg %</span>
                <span className="text-right">Win %</span>
                <span className="text-right">Avg $</span>
              </div>
              {cohortData.map((c) => (
                <div key={c.quarter} className="grid grid-cols-[1fr_40px_50px_50px_50px] gap-1 text-xs py-1.5 border-b border-border/50">
                  <span className="font-medium">{c.quarter}</span>
                  <span className="text-right tabular-nums">{c.count}</span>
                  <span className="text-right tabular-nums">{c.meetingRate}%</span>
                  <span className={`text-right tabular-nums ${c.winRate >= 30 ? "text-emerald-600 dark:text-emerald-400" : c.winRate > 0 ? "text-foreground" : "text-muted-foreground"}`}>{c.winRate > 0 ? `${c.winRate}%` : "—"}</span>
                  <span className="text-right tabular-nums">{c.avgDeal > 0 ? fmt$(c.avgDeal) : "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No cohort data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
