import { useMemo, useEffect, useState } from "react";
import { Lead, LeadStage } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Clock, Users, Shield, TrendingUp, Zap } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const STAGE_WEIGHTS: Record<string, number> = {
  "New Lead": 0.05,
  "Qualified": 0.15,
  "Contacted": 0.20,
  "Meeting Set": 0.30,
  "Meeting Held": 0.40,
  "Proposal Sent": 0.60,
  "Negotiation": 0.75,
  "Contract Sent": 0.90,
};

const ACTIVE_STAGES: LeadStage[] = [
  "New Lead", "Qualified", "Contacted", "Meeting Set",
  "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent",
];

const TERMINAL_STAGES = ["Closed Won", "Lost", "Went Dark", "Duplicate", "Disqualified"];
const REP_CAPACITY_THRESHOLD = 25;
const QUARTERLY_TARGET_DEFAULT = 100000;

interface Props {
  leads: Lead[];
  onDrillDown: (title: string, leads: Lead[]) => void;
}

export function DashboardOperations({ leads, onDrillDown }: Props) {
  const activeLeads = useMemo(
    () => leads.filter((l) => !TERMINAL_STAGES.includes(l.stage)),
    [leads]
  );

  const brands = ["Captarget", "SourceCo"] as const;

  // --- Rep Capacity ---
  const repCapacity = useMemo(() => {
    const map: Record<string, { rep: string; brand: string; count: number; leads: Lead[] }> = {};
    activeLeads.forEach((l) => {
      if (!l.assignedTo) return;
      const key = `${l.assignedTo}|${l.brand}`;
      if (!map[key]) map[key] = { rep: l.assignedTo, brand: l.brand, count: 0, leads: [] };
      map[key].count++;
      map[key].leads.push(l);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [activeLeads]);

  // --- Coverage Ratio ---
  const coverageByBrand = useMemo(() => {
    const result: Record<string, { weighted: number; raw: number; count: number }> = {};
    brands.forEach((b) => {
      const bLeads = activeLeads.filter((l) => l.brand === b);
      const weighted = bLeads.reduce((s, l) => s + l.dealValue * (STAGE_WEIGHTS[l.stage] || 0), 0);
      const raw = bLeads.reduce((s, l) => s + l.dealValue, 0);
      result[b] = { weighted, raw, count: bLeads.length };
    });
    return result;
  }, [activeLeads]);

  // --- Pipeline Aging ---
  const agingData = useMemo(() => {
    const now = new Date();
    const rows: { stage: string; ct: { avg: number; count: number }; sc: { avg: number; count: number } }[] = [];
    ACTIVE_STAGES.forEach((stage) => {
      const calc = (brand: string) => {
        const matching = activeLeads.filter((l) => l.stage === stage && l.brand === brand);
        if (!matching.length) return { avg: 0, count: 0 };
        const total = matching.reduce((s, l) => {
          const entered = l.stageEnteredDate ? parseISO(l.stageEnteredDate) : now;
          return s + Math.max(0, differenceInDays(now, entered));
        }, 0);
        return { avg: Math.round(total / matching.length), count: matching.length };
      };
      rows.push({ stage, ct: calc("Captarget"), sc: calc("SourceCo") });
    });
    return rows;
  }, [activeLeads]);

  // --- Stale & Dark ---
  const { stale, goingDark } = useMemo(() => {
    const now = new Date();
    const staleLeads: Lead[] = [];
    const darkLeads: Lead[] = [];
    activeLeads.forEach((l) => {
      if (!l.lastContactDate) {
        staleLeads.push(l);
        return;
      }
      const days = differenceInDays(now, parseISO(l.lastContactDate));
      if (days > 30) staleLeads.push(l);
      else if (days >= 14) darkLeads.push(l);
    });
    return { stale: staleLeads, goingDark: darkLeads };
  }, [activeLeads]);

  const staleValue = stale.reduce((s, l) => s + l.dealValue, 0);
  const darkValue = goingDark.reduce((s, l) => s + l.dealValue, 0);

  const agingColor = (days: number) => {
    if (days >= 21) return "text-destructive font-semibold";
    if (days >= 14) return "text-orange-500 font-medium";
    if (days >= 7) return "text-yellow-600";
    return "text-muted-foreground";
  };

  const capacityColor = (count: number) => {
    const ratio = count / REP_CAPACITY_THRESHOLD;
    if (ratio >= 1) return "bg-destructive";
    if (ratio >= 0.8) return "bg-yellow-500";
    return "bg-primary";
  };

  const coverageColor = (ratio: number) => {
    if (ratio >= 3) return "text-green-600";
    if (ratio >= 1) return "text-yellow-600";
    return "text-destructive";
  };

  const fmt = (n: number) => `$${(n / 1000).toFixed(0)}K`;

  // --- Pipeline Momentum ---
  const momentum = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // New deals added this month
    const newDeals = leads.filter(l => l.dateSubmitted?.startsWith(thisMonth));
    const addedValue = newDeals.reduce((s, l) => s + l.dealValue, 0);

    // Deals lost/closed this month
    const closedOut = leads.filter(l =>
      ["Lost", "Went Dark", "Disqualified"].includes(l.stage) &&
      l.closedDate?.startsWith(thisMonth)
    );
    const lostValue = closedOut.reduce((s, l) => s + l.dealValue, 0);

    // Won this month
    const closedWon = leads.filter(l =>
      l.stage === "Closed Won" && l.closedDate?.startsWith(thisMonth)
    );
    const wonValue = closedWon.reduce((s, l) => s + l.dealValue, 0);

    const net = addedValue - lostValue - wonValue;
    return { addedValue, lostValue, wonValue, net, newCount: newDeals.length, lostCount: closedOut.length, wonCount: closedWon.length };
  }, [leads]);

  // --- Deal Velocity Timeline ---
  const TRANSITIONS = ACTIVE_STAGES.slice(0, -1).map((s, i) => ({
    from: s,
    to: ACTIVE_STAGES[i + 1],
    label: `${s} → ${ACTIVE_STAGES[i + 1]}`,
  }));

  const [velocityData, setVelocityData] = useState<
    { label: string; ct: { avg: number; count: number }; sc: { avg: number; count: number } }[]
  >([]);

  useEffect(() => {
    async function fetchVelocity() {
      const { data: logs } = await supabase
        .from("lead_activity_log" as any)
        .select("*")
        .eq("event_type", "stage_change")
        .order("created_at", { ascending: true })
        .limit(5000);

      if (!logs || logs.length === 0) {
        setVelocityData([]);
        return;
      }

      // Build lead→brand map
      const brandMap: Record<string, string> = {};
      for (const l of leads) brandMap[l.id] = l.brand;

      // Group logs by lead_id, sorted by time
      const byLead: Record<string, any[]> = {};
      for (const log of logs as any[]) {
        if (!byLead[log.lead_id]) byLead[log.lead_id] = [];
        byLead[log.lead_id].push(log);
      }

      // For each transition, collect durations
      const transMap: Record<string, Record<string, number[]>> = {};
      for (const t of TRANSITIONS) {
        transMap[t.label] = { Captarget: [], SourceCo: [] };
      }

      for (const [leadId, entries] of Object.entries(byLead)) {
        const brand = brandMap[leadId];
        if (!brand || (brand !== "Captarget" && brand !== "SourceCo")) continue;

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const oldVal = entry.old_value?.replace(/^"|"$/g, "") || "";
          const newVal = entry.new_value?.replace(/^"|"$/g, "") || "";
          const transLabel = `${oldVal} → ${newVal}`;
          if (transMap[transLabel]?.[brand] !== undefined) {
            // Find previous stage_change to this old_value to compute time delta
            // Use time from when old stage was entered to when new stage was entered
            let prevTime: string | null = null;
            for (let j = i - 1; j >= 0; j--) {
              if ((entries[j].new_value?.replace(/^"|"$/g, "") || "") === oldVal) {
                prevTime = entries[j].created_at;
                break;
              }
            }
            if (!prevTime) {
              // First transition — use lead's dateSubmitted
              const lead = leads.find(l => l.id === leadId);
              if (lead?.dateSubmitted) prevTime = lead.dateSubmitted;
            }
            if (prevTime) {
              const days = Math.max(0, differenceInDays(parseISO(entry.created_at), parseISO(prevTime)));
              transMap[transLabel][brand].push(days);
            }
          }
        }
      }

      const result = TRANSITIONS.map(t => {
        const ctDays = transMap[t.label].Captarget;
        const scDays = transMap[t.label].SourceCo;
        return {
          label: t.label,
          ct: { avg: ctDays.length > 0 ? Math.round(ctDays.reduce((a, b) => a + b, 0) / ctDays.length) : 0, count: ctDays.length },
          sc: { avg: scDays.length > 0 ? Math.round(scDays.reduce((a, b) => a + b, 0) / scDays.length) : 0, count: scDays.length },
        };
      });
      setVelocityData(result);
    }
    fetchVelocity();
  }, [leads]);

  const velocityColor = (days: number) => {
    if (days >= 21) return "text-destructive font-semibold";
    if (days >= 14) return "text-orange-500 font-medium";
    if (days >= 7) return "text-yellow-600";
    return "text-emerald-500 font-medium";
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Momentum */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Pipeline Momentum (This Month)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-lg font-semibold text-emerald-500 tabular-nums">+{fmt(momentum.addedValue)}</p>
              <p className="text-[10px] text-muted-foreground">{momentum.newCount} new deals</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-destructive tabular-nums">-{fmt(momentum.lostValue)}</p>
              <p className="text-[10px] text-muted-foreground">{momentum.lostCount} lost</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-blue-500 tabular-nums">-{fmt(momentum.wonValue)}</p>
              <p className="text-[10px] text-muted-foreground">{momentum.wonCount} won</p>
            </div>
            <div className="border-l border-border pl-3">
              <p className={`text-lg font-bold tabular-nums ${momentum.net >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                {momentum.net >= 0 ? "+" : ""}{fmt(momentum.net)}
              </p>
              <p className="text-[10px] text-muted-foreground">Net Change</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deal Velocity Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" /> Deal Velocity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {velocityData.length === 0 ? (
            <p className="text-xs text-muted-foreground">No stage transition data in activity log yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Transition</TableHead>
                  <TableHead className="text-xs text-right">CT Avg Days</TableHead>
                  <TableHead className="text-xs text-right">CT Count</TableHead>
                  <TableHead className="text-xs text-right">SC Avg Days</TableHead>
                  <TableHead className="text-xs text-right">SC Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {velocityData.filter(r => r.ct.count > 0 || r.sc.count > 0).map(r => (
                  <TableRow key={r.label}>
                    <TableCell className="text-xs font-medium">{r.label}</TableCell>
                    <TableCell className={`text-xs text-right ${r.ct.count ? velocityColor(r.ct.avg) : "text-muted-foreground/40"}`}>
                      {r.ct.count ? `${r.ct.avg}d` : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">{r.ct.count || "-"}</TableCell>
                    <TableCell className={`text-xs text-right ${r.sc.count ? velocityColor(r.sc.avg) : "text-muted-foreground/40"}`}>
                      {r.sc.count ? `${r.sc.avg}d` : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">{r.sc.count || "-"}</TableCell>
                  </TableRow>
                ))}
                {velocityData.every(r => r.ct.count === 0 && r.sc.count === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-4">
                      No transitions recorded yet — data populates as deals move through stages
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rep Capacity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" /> Rep Capacity Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          {repCapacity.length === 0 ? (
            <p className="text-xs text-muted-foreground">No reps with active deals</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {repCapacity.map((r) => (
                <button
                  key={`${r.rep}-${r.brand}`}
                  onClick={() => onDrillDown(`${r.rep} (${r.brand})`, r.leads)}
                  className="text-left p-3 rounded-md border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium">{r.rep}</span>
                    <span className="text-muted-foreground">{r.brand} · {r.count}/{REP_CAPACITY_THRESHOLD}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${capacityColor(r.count)}`}
                      style={{ width: `${Math.min(100, (r.count / REP_CAPACITY_THRESHOLD) * 100)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coverage Ratio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {brands.map((brand) => {
          const d = coverageByBrand[brand] || { weighted: 0, raw: 0, count: 0 };
          const ratio = QUARTERLY_TARGET_DEFAULT > 0 ? d.weighted / QUARTERLY_TARGET_DEFAULT : 0;
          return (
            <Card key={brand}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" /> {brand} Coverage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Weighted Pipeline</span>
                  <span className="font-medium">{fmt(d.weighted)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Raw Pipeline</span>
                  <span>{fmt(d.raw)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Quarterly Target</span>
                  <span>{fmt(QUARTERLY_TARGET_DEFAULT)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-border">
                  <span className="font-medium">Coverage Ratio</span>
                  <span className={`font-semibold ${coverageColor(ratio)}`}>
                    {ratio.toFixed(1)}x
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Active Deals</span>
                  <span>{d.count}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline Aging */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" /> Pipeline Aging by Stage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Stage</TableHead>
                <TableHead className="text-xs text-right">CT Avg Days</TableHead>
                <TableHead className="text-xs text-right">CT Deals</TableHead>
                <TableHead className="text-xs text-right">SC Avg Days</TableHead>
                <TableHead className="text-xs text-right">SC Deals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agingData.filter((r) => r.ct.count > 0 || r.sc.count > 0).map((r) => (
                <TableRow key={r.stage}>
                  <TableCell className="text-xs font-medium">{r.stage}</TableCell>
                  <TableCell className={`text-xs text-right ${r.ct.count ? agingColor(r.ct.avg) : "text-muted-foreground/40"}`}>
                    {r.ct.count ? `${r.ct.avg}d` : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">{r.ct.count || "-"}</TableCell>
                  <TableCell className={`text-xs text-right ${r.sc.count ? agingColor(r.sc.avg) : "text-muted-foreground/40"}`}>
                    {r.sc.count ? `${r.sc.avg}d` : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">{r.sc.count || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sales Coaching Scorecard */}
      <SalesCoachingScorecard leads={leads} />

      {/* Stuck Pipeline Alert */}
      <StuckPipelineAlert leads={leads} onDrillDown={onDrillDown} />

      {/* Action Item Completion Tracker */}
      <ActionItemTracker leads={leads} onDrillDown={onDrillDown} />

      {/* Deal Temperature & Momentum Grid */}
      <DealTemperatureMomentum leads={leads} onDrillDown={onDrillDown} />

      {/* Meeting Count vs Outcome */}
      <MeetingCountOutcome leads={leads} />

      {/* At-Risk Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${stale.length > 0 ? "border-destructive/30" : ""}`}
          onClick={() => stale.length > 0 && onDrillDown("Stale Pipeline (30+ days no contact)", stale)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Stale Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Deals with no contact 30+ days</span>
              <span className="font-semibold text-destructive">{stale.length}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-muted-foreground">Value at risk</span>
              <span className="font-medium">{fmt(staleValue)}</span>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${goingDark.length > 0 ? "border-yellow-500/30" : ""}`}
          onClick={() => goingDark.length > 0 && onDrillDown("Going Dark (14-30 days no contact)", goingDark)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" /> Going Dark
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Approaching stale (14-30 days)</span>
              <span className="font-semibold text-yellow-600">{goingDark.length}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-muted-foreground">Value at risk</span>
              <span className="font-medium">{fmt(darkValue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Sales Coaching Scorecard ──
function SalesCoachingScorecard({ leads }: { leads: Lead[] }) {
  const scorecard = useMemo(() => {
    const repStats: Record<string, {
      rep: string;
      talkRatios: number[];
      qStrong: number; qAdequate: number; qWeak: number; qTotal: number;
      oEffective: number; oPartial: number; oMissed: number; oTotal: number;
      meetingCount: number;
    }> = {};

    // Won deal benchmarks
    const wonTalkRatios: number[] = [];

    for (const lead of leads) {
      for (const m of lead.meetings || []) {
        if (!m.intelligence) continue;
        const intel = m.intelligence;
        const rep = lead.assignedTo || "Unassigned";

        if (!repStats[rep]) {
          repStats[rep] = { rep, talkRatios: [], qStrong: 0, qAdequate: 0, qWeak: 0, qTotal: 0, oEffective: 0, oPartial: 0, oMissed: 0, oTotal: 0, meetingCount: 0 };
        }
        const s = repStats[rep];
        s.meetingCount++;

        if (typeof intel.talkRatio === "number") {
          s.talkRatios.push(intel.talkRatio);
          if (lead.stage === "Closed Won") wonTalkRatios.push(intel.talkRatio);
        }
        if (intel.questionQuality) {
          s.qTotal++;
          if (intel.questionQuality === "Strong") s.qStrong++;
          else if (intel.questionQuality === "Adequate") s.qAdequate++;
          else s.qWeak++;
        }
        if (intel.objectionHandling) {
          s.oTotal++;
          if (intel.objectionHandling === "Effective") s.oEffective++;
          else if (intel.objectionHandling === "Partial") s.oPartial++;
          else s.oMissed++;
        }
      }
    }

    const reps = Object.values(repStats).filter(r => r.meetingCount > 0).sort((a, b) => b.meetingCount - a.meetingCount);
    const wonBenchmark = wonTalkRatios.length > 0
      ? Math.round(wonTalkRatios.reduce((a, b) => a + b, 0) / wonTalkRatios.length * 10) / 10
      : null;

    // Count flagged meetings (Weak questions or Missed objections)
    let flaggedCount = 0;
    for (const r of reps) {
      flaggedCount += r.qWeak + r.oMissed;
    }

    return { reps, wonBenchmark, flaggedCount };
  }, [leads]);

  if (scorecard.reps.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" /> Sales Coaching Scorecard
          </CardTitle>
          {scorecard.flaggedCount > 0 && (
            <span className="text-[10px] text-destructive font-medium">
              ⚠ {scorecard.flaggedCount} meetings flagged Weak/Missed
            </span>
          )}
        </div>
        {scorecard.wonBenchmark !== null && (
          <p className="text-[10px] text-muted-foreground">
            Won deal benchmark: {scorecard.wonBenchmark}% talk ratio
          </p>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Rep</TableHead>
              <TableHead className="text-xs text-right">Meetings</TableHead>
              <TableHead className="text-xs text-right">Avg Talk%</TableHead>
              <TableHead className="text-xs text-right">Q.Quality</TableHead>
              <TableHead className="text-xs text-right">Obj.Handling</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scorecard.reps.map(r => {
              const avgTalk = r.talkRatios.length > 0
                ? Math.round(r.talkRatios.reduce((a, b) => a + b, 0) / r.talkRatios.length * 10) / 10
                : null;
              const talkColor = avgTalk !== null
                ? (avgTalk <= 30 ? "text-emerald-500" : avgTalk <= 40 ? "text-yellow-600" : "text-destructive")
                : "text-muted-foreground";
              const qPct = r.qTotal > 0 ? Math.round((r.qStrong / r.qTotal) * 100) : null;
              const oPct = r.oTotal > 0 ? Math.round((r.oEffective / r.oTotal) * 100) : null;

              return (
                <TableRow key={r.rep}>
                  <TableCell className="text-xs font-medium">{r.rep}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.meetingCount}</TableCell>
                  <TableCell className={`text-xs text-right tabular-nums font-medium ${talkColor}`}>
                    {avgTalk !== null ? `${avgTalk}%` : "N/A"}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {qPct !== null ? (
                      <span className={qPct >= 80 ? "text-emerald-500" : qPct >= 60 ? "text-yellow-600" : "text-destructive"}>
                        {qPct}% Strong
                      </span>
                    ) : "N/A"}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {oPct !== null ? (
                      <span className={oPct >= 80 ? "text-emerald-500" : oPct >= 60 ? "text-yellow-600" : "text-destructive"}>
                        {oPct}% Eff
                      </span>
                    ) : "N/A"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Stuck Pipeline Alert ──
function StuckPipelineAlert({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (title: string, leads: Lead[]) => void }) {
  const stuckDeals = useMemo(() => {
    const now = new Date();
    return leads.filter(lead => {
      if (!["Meeting Held", "Proposal Sent"].includes(lead.stage)) return false;
      const daysInStage = lead.stageEnteredDate
        ? differenceInDays(now, parseISO(lead.stageEnteredDate))
        : 0;
      if (daysInStage < 14) return false;

      // Check if any meeting showed Strong intent or Highly Engaged
      const hasStrongSignal = (lead.meetings || []).some(m => {
        if (!m.intelligence) return false;
        return m.intelligence.dealSignals?.buyingIntent === "Strong" ||
               m.intelligence.engagementLevel === "Highly Engaged";
      });
      return hasStrongSignal;
    }).sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0));
  }, [leads]);

  if (stuckDeals.length === 0) return null;

  const totalValue = stuckDeals.reduce((s, l) => s + l.dealValue, 0);

  return (
    <Card className="border-orange-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" /> High-Intent Stuck Deals
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {stuckDeals.length} deals · ${totalValue.toLocaleString()} at risk
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Strong intent / Highly Engaged but stuck in Meeting Held or Proposal Sent for 14+ days
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Company</TableHead>
              <TableHead className="text-xs">Stage</TableHead>
              <TableHead className="text-xs text-right">Days</TableHead>
              <TableHead className="text-xs text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stuckDeals.slice(0, 10).map(l => {
              const days = l.stageEnteredDate
                ? differenceInDays(new Date(), parseISO(l.stageEnteredDate))
                : 0;
              return (
                <TableRow
                  key={l.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onDrillDown(l.name, [l])}
                >
                  <TableCell className="text-xs font-medium">{l.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.company}</TableCell>
                  <TableCell className="text-xs">{l.stage}</TableCell>
                  <TableCell className={`text-xs text-right tabular-nums ${days >= 30 ? "text-destructive font-semibold" : "text-orange-500"}`}>
                    {days}d
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-medium">
                    ${l.dealValue.toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {stuckDeals.length > 10 && (
          <button
            className="text-xs text-primary hover:underline mt-2"
            onClick={() => onDrillDown("All High-Intent Stuck Deals", stuckDeals)}
          >
            View all {stuckDeals.length} deals →
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Action Item Completion Tracker ──
function ActionItemTracker({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (title: string, leads: Lead[]) => void }) {
  const data = useMemo(() => {
    const repItems: Record<string, { rep: string; open: number; completed: number; overdue: number; dropped: number; total: number; leads: Lead[] }> = {};
    let totalOpen = 0, totalCompleted = 0, totalDropped = 0, totalItems = 0;

    for (const lead of leads) {
      const di = lead.dealIntelligence as any;
      if (!di?.actionItemTracker?.length) continue;
      const rep = lead.assignedTo || "Unassigned";
      if (!repItems[rep]) repItems[rep] = { rep, open: 0, completed: 0, overdue: 0, dropped: 0, total: 0, leads: [] };
      repItems[rep].leads.push(lead);

      for (const item of di.actionItemTracker) {
        repItems[rep].total++;
        totalItems++;
        if (item.status === "Completed") { repItems[rep].completed++; totalCompleted++; }
        else if (item.status === "Dropped") { repItems[rep].dropped++; totalDropped++; }
        else { repItems[rep].open++; totalOpen++; if (item.status === "Overdue") repItems[rep].overdue++; }
      }
    }

    const reps = Object.values(repItems).sort((a, b) => b.total - a.total);
    const completionRate = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;
    return { reps, totalOpen, totalCompleted, totalDropped, totalItems, completionRate };
  }, [leads]);

  if (data.totalItems === 0) return null;

  return (
    <Card className={data.completionRate < 20 ? "border-destructive/30" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Action Item Completion Tracker
          </CardTitle>
          <div className="text-right">
            <span className={`text-lg font-bold ${data.completionRate < 20 ? "text-destructive" : data.completionRate < 50 ? "text-orange-500" : "text-emerald-500"}`}>
              {data.completionRate}%
            </span>
            <p className="text-[10px] text-muted-foreground">{data.totalCompleted}/{data.totalItems} completed</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {data.totalOpen} open · {data.totalDropped} dropped — promises from meetings not followed through
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Rep</TableHead>
              <TableHead className="text-xs text-right">Total</TableHead>
              <TableHead className="text-xs text-right">Open</TableHead>
              <TableHead className="text-xs text-right">Done</TableHead>
              <TableHead className="text-xs text-right">Dropped</TableHead>
              <TableHead className="text-xs text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.reps.map(r => {
              const rate = r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0;
              return (
                <TableRow key={r.rep} className="cursor-pointer hover:bg-muted/50" onClick={() => onDrillDown(`${r.rep} Action Items`, r.leads)}>
                  <TableCell className="text-xs font-medium">{r.rep}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.total}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-orange-500 font-medium">{r.open}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-emerald-500">{r.completed}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground">{r.dropped}</TableCell>
                  <TableCell className={`text-xs text-right tabular-nums font-semibold ${rate < 20 ? "text-destructive" : rate < 50 ? "text-orange-500" : "text-emerald-500"}`}>
                    {rate}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Deal Temperature & Momentum Grid ──
function DealTemperatureMomentum({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (title: string, leads: Lead[]) => void }) {
  const grid = useMemo(() => {
    const temps = ["On Fire", "Warm", "Lukewarm", "Cold", "Ice Cold"] as const;
    const moms = ["Accelerating", "Steady", "Stalling", "Stalled"] as const;
    const cells: Record<string, { leads: Lead[]; value: number }> = {};

    for (const t of temps) for (const m of moms) cells[`${t}|${m}`] = { leads: [], value: 0 };

    const activeWithDI = leads.filter(l => {
      if (TERMINAL_STAGES.includes(l.stage)) return false;
      const di = l.dealIntelligence as any;
      return di?.winStrategy?.dealTemperature && di?.momentumSignals?.momentum;
    });

    for (const l of activeWithDI) {
      const di = l.dealIntelligence as any;
      const key = `${di.winStrategy.dealTemperature}|${di.momentumSignals.momentum}`;
      if (cells[key]) {
        cells[key].leads.push(l);
        cells[key].value += l.dealValue;
      }
    }

    return { cells, temps, moms, total: activeWithDI.length };
  }, [leads]);

  if (grid.total === 0) return null;

  const tempColor = (t: string) => {
    if (t === "On Fire") return "text-red-500 font-bold";
    if (t === "Warm") return "text-orange-500";
    if (t === "Lukewarm") return "text-yellow-600";
    return "text-blue-500";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Deal Temperature × Momentum ({grid.total} deals)
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">Click cells to drill into specific deal clusters</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Temp \ Momentum</TableHead>
              {grid.moms.map(m => <TableHead key={m} className="text-xs text-center">{m}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grid.temps.map(t => {
              const hasAny = grid.moms.some(m => grid.cells[`${t}|${m}`].leads.length > 0);
              if (!hasAny) return null;
              return (
                <TableRow key={t}>
                  <TableCell className={`text-xs font-medium ${tempColor(t)}`}>{t}</TableCell>
                  {grid.moms.map(m => {
                    const cell = grid.cells[`${t}|${m}`];
                    return (
                      <TableCell
                        key={m}
                        className={`text-xs text-center ${cell.leads.length > 0 ? "cursor-pointer hover:bg-muted/50" : ""}`}
                        onClick={() => cell.leads.length > 0 && onDrillDown(`${t} + ${m}`, cell.leads)}
                      >
                        {cell.leads.length > 0 ? (
                          <div>
                            <span className="font-semibold tabular-nums">{cell.leads.length}</span>
                            <p className="text-[9px] text-muted-foreground">${(cell.value / 1000).toFixed(0)}K</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Meeting Count vs Outcome ──
function MeetingCountOutcome({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const buckets: Record<string, { label: string; won: number; lost: number; active: number; total: number }> = {
      "1": { label: "1 meeting", won: 0, lost: 0, active: 0, total: 0 },
      "2": { label: "2 meetings", won: 0, lost: 0, active: 0, total: 0 },
      "3": { label: "3 meetings", won: 0, lost: 0, active: 0, total: 0 },
      "4+": { label: "4+ meetings", won: 0, lost: 0, active: 0, total: 0 },
    };

    const leadsWithMeetings = leads.filter(l => (l.meetings || []).length > 0);
    for (const l of leadsWithMeetings) {
      const count = l.meetings.length;
      const key = count >= 4 ? "4+" : String(count);
      buckets[key].total++;
      if (l.stage === "Closed Won") buckets[key].won++;
      else if (["Lost", "Went Dark"].includes(l.stage)) buckets[key].lost++;
      else buckets[key].active++;
    }

    return Object.values(buckets).filter(b => b.total > 0);
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" /> Meeting Count vs Outcome
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">Optimal meeting cadence — what's the "sweet spot"?</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Meetings</TableHead>
              <TableHead className="text-xs text-right">Total</TableHead>
              <TableHead className="text-xs text-right">Won</TableHead>
              <TableHead className="text-xs text-right">Lost</TableHead>
              <TableHead className="text-xs text-right">Active</TableHead>
              <TableHead className="text-xs text-right">Win Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(b => {
              const closed = b.won + b.lost;
              const winRate = closed > 0 ? Math.round((b.won / closed) * 100) : null;
              return (
                <TableRow key={b.label}>
                  <TableCell className="text-xs font-medium">{b.label}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{b.total}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-emerald-500 font-medium">{b.won}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-destructive">{b.lost}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground">{b.active}</TableCell>
                  <TableCell className={`text-xs text-right tabular-nums font-semibold ${winRate !== null && winRate >= 50 ? "text-emerald-500" : winRate !== null ? "text-orange-500" : "text-muted-foreground"}`}>
                    {winRate !== null ? `${winRate}%` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
