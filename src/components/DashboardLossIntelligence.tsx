import { useMemo } from "react";
import { Lead } from "@/types/lead";

interface Props {
  leads: Lead[];
  onDrillDown?: (title: string, leads: Lead[]) => void;
}

function parseDate(d: string): Date | null {
  if (!d) return null;
  const p = new Date(d);
  return isNaN(p.getTime()) ? null : p;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

export function DashboardLossIntelligence({ leads, onDrillDown }: Props) {
  const lostLeads = useMemo(() => leads.filter(l => l.stage === "Closed Lost" || l.stage === "Went Dark"), [leads]);
  const darkLeads = useMemo(() => leads.filter(l => l.stage === "Went Dark"), [leads]);

  // Block 1: Loss Pattern Analysis - which close reasons dominate, cross-referenced with buyer type
  const lossPatterns = useMemo(() => {
    const reasons: Record<string, { count: number; leads: Lead[]; byBuyer: Record<string, number> }> = {};
    for (const l of lostLeads) {
      const reason = l.closeReason || l.lostReason || "Unknown";
      if (!reasons[reason]) reasons[reason] = { count: 0, leads: [], byBuyer: {} };
      reasons[reason].count++;
      reasons[reason].leads.push(l);
      const bt = l.buyerType || "Unknown";
      reasons[reason].byBuyer[bt] = (reasons[reason].byBuyer[bt] || 0) + 1;
    }
    return Object.entries(reasons)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 8)
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        leads: data.leads,
        pct: lostLeads.length > 0 ? Math.round((data.count / lostLeads.length) * 100) : 0,
        topBuyer: Object.entries(data.byBuyer).sort(([, a], [, b]) => b - a)[0]?.[0] || "—",
      }));
  }, [lostLeads]);

  // Block 2: Time-to-Dark Analysis
  const darkBuckets = useMemo(() => {
    const buckets: Record<string, { count: number; hadMeeting: number; leads: Lead[] }> = {
      "0-14d": { count: 0, hadMeeting: 0, leads: [] },
      "15-30d": { count: 0, hadMeeting: 0, leads: [] },
      "31-60d": { count: 0, hadMeeting: 0, leads: [] },
      "60d+": { count: 0, hadMeeting: 0, leads: [] },
    };
    for (const l of darkLeads) {
      const start = parseDate(l.dateSubmitted);
      const end = parseDate(l.closedDate) || parseDate(l.stageEnteredDate);
      if (!start || !end) continue;
      const days = daysBetween(start, end);
      const bucket = days <= 14 ? "0-14d" : days <= 30 ? "15-30d" : days <= 60 ? "31-60d" : "60d+";
      buckets[bucket].count++;
      buckets[bucket].leads.push(l);
      if (l.meetings.length > 0 || l.meetingDate) buckets[bucket].hadMeeting++;
    }
    return Object.entries(buckets).map(([label, data]) => ({
      label,
      count: data.count,
      hadMeeting: data.hadMeeting,
      noMeeting: data.count - data.hadMeeting,
      leads: data.leads,
    }));
  }, [darkLeads]);

  // Block 3: Objection Frequency Map
  const objectionData = useMemo(() => {
    const objMap: Record<string, { count: number; open: number; addressed: number; recurring: number; wonAfter: number; totalWithOutcome: number }> = {};
    
    for (const l of leads) {
      const di = l.dealIntelligence;
      if (!di?.objectionTracker?.length) continue;
      for (const obj of di.objectionTracker) {
        const key = obj.objection.trim().toLowerCase().slice(0, 60);
        if (!key) continue;
        if (!objMap[key]) objMap[key] = { count: 0, open: 0, addressed: 0, recurring: 0, wonAfter: 0, totalWithOutcome: 0 };
        objMap[key].count++;
        if (obj.status === "Open") objMap[key].open++;
        else if (obj.status === "Addressed") objMap[key].addressed++;
        else if (obj.status === "Recurring") objMap[key].recurring++;
        if (["Closed Won", "Closed Lost"].includes(l.stage)) {
          objMap[key].totalWithOutcome++;
          if (l.stage === "Closed Won" && obj.status === "Addressed") objMap[key].wonAfter++;
        }
      }
    }

    // Also aggregate closeReason for lost deals
    const closeReasons: Record<string, number> = {};
    for (const l of leads.filter(x => x.stage === "Closed Lost")) {
      const r = l.closeReason || l.lostReason || "Unknown";
      closeReasons[r] = (closeReasons[r] || 0) + 1;
    }

    return {
      objections: Object.entries(objMap)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 10)
        .map(([text, d]) => ({
          text: text.charAt(0).toUpperCase() + text.slice(1),
          count: d.count,
          open: d.open,
          addressed: d.addressed,
          recurring: d.recurring,
          resolutionRate: d.addressed + d.recurring > 0 ? Math.round((d.addressed / (d.addressed + d.recurring + d.open)) * 100) : 0,
          winAfterResolve: d.totalWithOutcome > 0 ? Math.round((d.wonAfter / d.totalWithOutcome) * 100) : null,
        })),
      closeReasons: Object.entries(closeReasons)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6),
    };
  }, [leads]);

  // Block 4: Re-engagement Opportunities
  const reengagement = useMemo(() => {
    const now = new Date();
    const medianDealValue = (() => {
      const values = leads.map(l => l.dealValue).filter(v => v > 0).sort((a, b) => a - b);
      if (!values.length) return 0;
      return values[Math.floor(values.length / 2)];
    })();

    return darkLeads
      .filter(l => {
        const fit = l.icpFit === "Strong" || l.icpFit === "Moderate";
        const goodTier = l.tier !== null && l.tier <= 2;
        const highValue = l.dealValue > medianDealValue;
        const cd = parseDate(l.closedDate) || parseDate(l.stageEnteredDate);
        const recent = cd ? daysBetween(cd, now) <= 90 : false;
        return (fit || goodTier) && highValue && recent;
      })
      .sort((a, b) => b.dealValue - a.dealValue)
      .slice(0, 8);
  }, [darkLeads, leads]);

  if (lostLeads.length === 0) {
    return null; // No loss data to analyze
  }

  const fmt$ = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;
  const maxLossCount = Math.max(...lossPatterns.map(p => p.count), 1);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Loss & Competitive Intelligence</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Block 1: Loss Pattern Analysis */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Loss Patterns <span className="text-[10px] font-normal ml-1">({lostLeads.length} lost/dark)</span>
          </p>
          <div className="space-y-1.5">
            {lossPatterns.map((p) => (
              <div
                key={p.reason}
                className="cursor-pointer hover:bg-secondary/20 rounded px-1 -mx-1 transition-colors"
                onClick={() => onDrillDown?.(`Lost: ${p.reason}`, p.leads)}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate max-w-[140px]">{p.reason}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px]">{p.topBuyer}</span>
                    <span className="tabular-nums">{p.count}</span>
                    <span className="text-muted-foreground tabular-nums w-8 text-right">{p.pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-secondary/50 rounded mt-0.5">
                  <div className="h-full bg-destructive/40 rounded" style={{ width: `${(p.count / maxLossCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Block 2: Time-to-Dark Analysis */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Time-to-Dark <span className="text-[10px] font-normal ml-1">({darkLeads.length} went dark)</span>
          </p>
          {darkLeads.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[60px_1fr_50px_50px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                <span>Window</span>
                <span>Distribution</span>
                <span className="text-right">Had Mtg</span>
                <span className="text-right">No Mtg</span>
              </div>
              {darkBuckets.map((b) => {
                const maxBucket = Math.max(...darkBuckets.map(x => x.count), 1);
                return (
                  <div
                    key={b.label}
                    className="grid grid-cols-[60px_1fr_50px_50px] gap-1 items-center text-xs cursor-pointer hover:bg-secondary/20 rounded px-1 -mx-1 transition-colors"
                    onClick={() => onDrillDown?.(`Went Dark (${b.label})`, b.leads)}
                  >
                    <span className="font-medium">{b.label}</span>
                    <div className="h-4 bg-secondary/50 rounded overflow-hidden">
                      <div className="h-full bg-foreground/20 rounded" style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{b.hadMeeting}</span>
                    <span className="text-right tabular-nums text-muted-foreground">{b.noMeeting}</span>
                  </div>
                );
              })}
              {(() => {
                const totalHadMtg = darkBuckets.reduce((s, b) => s + b.hadMeeting, 0);
                const totalCount = darkBuckets.reduce((s, b) => s + b.count, 0);
                return totalCount > 0 ? (
                  <p className="text-[10px] text-muted-foreground mt-1 pt-1 border-t border-border">
                    {Math.round((totalHadMtg / totalCount) * 100)}% had at least one meeting before going dark
                  </p>
                ) : null;
              })()}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No went-dark leads</p>
          )}
        </div>

        {/* Block 3: Objection Frequency Map */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Objection Frequency Map</p>
          {objectionData.objections.length > 0 ? (
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_30px_30px_30px_40px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                <span>Objection</span>
                <span className="text-right">Open</span>
                <span className="text-right">Addr</span>
                <span className="text-right">Recur</span>
                <span className="text-right">Res %</span>
              </div>
              {objectionData.objections.map((o, i) => (
                <div key={i} className="grid grid-cols-[1fr_30px_30px_30px_40px] gap-1 text-xs py-1 border-b border-border/50">
                  <span className="truncate" title={o.text}>{o.text}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{o.open}</span>
                  <span className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{o.addressed}</span>
                  <span className="text-right tabular-nums text-amber-600 dark:text-amber-400">{o.recurring}</span>
                  <span className={`text-right tabular-nums ${o.resolutionRate >= 60 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{o.resolutionRate}%</span>
                </div>
              ))}
            </div>
          ) : objectionData.closeReasons.length > 0 ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-2">No objection tracking data. Showing close reasons:</p>
              <div className="space-y-1">
                {objectionData.closeReasons.map(([reason, count]) => (
                  <div key={reason} className="flex justify-between text-xs">
                    <span>{reason}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No objection or loss data</p>
          )}
        </div>

        {/* Block 4: Re-engagement Opportunities */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Re-engagement Opportunities
            {reengagement.length > 0 && <span className="text-[10px] font-normal ml-1">({reengagement.length} high-value)</span>}
          </p>
          {reengagement.length > 0 ? (
            <div className="space-y-1 max-h-[220px] overflow-y-auto">
              {reengagement.map((l) => {
                const cd = parseDate(l.closedDate) || parseDate(l.stageEnteredDate);
                const daysAgo = cd ? daysBetween(cd, new Date()) : null;
                return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-1 transition-colors"
                    onClick={() => onDrillDown?.("Re-engagement Candidates", reengagement)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{l.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{l.company} · {l.icpFit} fit{l.tier ? ` · T${l.tier}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="tabular-nums font-medium">{fmt$(l.dealValue)}</p>
                      {daysAgo !== null && <p className="text-[10px] text-muted-foreground">{daysAgo}d ago</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No high-value re-engagement candidates in the last 90 days</p>
          )}
        </div>
      </div>
    </div>
  );
}
