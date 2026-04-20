import { useMemo } from "react";
import { Lead } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, ReferenceLine } from "recharts";
import { addDays, format, startOfMonth, isBefore, isAfter, parseISO, differenceInDays } from "date-fns";
import { AlertTriangle, TrendingUp, Shield, Users } from "lucide-react";

// v2 stage weights — using normalizeStage() so legacy DB rows still resolve.
import { normalizeStage } from "@/lib/leadUtils";

const STAGE_WEIGHTS: Record<string, number> = {
  "Unassigned": 0.05,
  "In Contact": 0.15,
  "Discovery Scheduled": 0.30,
  "Discovery Completed": 0.40,
  "Sample Sent": 0.50,
  "Proposal Sent": 0.65,
  "Negotiating": 0.85,
};

const DEFAULT_DAYS_TO_CLOSE: Record<string, number> = {
  "Unassigned": 90,
  "In Contact": 60,
  "Discovery Scheduled": 45,
  "Discovery Completed": 30,
  "Sample Sent": 21,
  "Proposal Sent": 14,
  "Negotiating": 7,
};

import { isClosedStage } from "@/lib/leadUtils";
const isTerminal = (s: string) => isClosedStage(normalizeStage(s)) || ["Duplicate", "Disqualified"].includes(s);
const MONTHLY_TARGET = 15000;

interface Props {
  leads: Lead[];
  onDrillDown: (title: string, leads: Lead[]) => void;
}

export function DashboardForecast({ leads, onDrillDown }: Props) {
  const activeLeads = useMemo(() => leads.filter(l => !isTerminal(l.stage)), [leads]);
  const wonLeads = useMemo(() => leads.filter(l => normalizeStage(l.stage) === "Closed Won"), [leads]);

  // 1. 3-Month Revenue Projection
  const projectionData = useMemo(() => {
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
      months.push({ label: format(d, "MMM yyyy"), start: d, end });
    }

    return months.map(m => {
      let captarget = 0;
      let sourceco = 0;
      for (const lead of activeLeads) {
        const normStage = normalizeStage(lead.stage);
        const daysToClose = DEFAULT_DAYS_TO_CLOSE[normStage] ?? 60;
        const weight = STAGE_WEIGHTS[normStage] ?? 0.1;
        const expectedClose = addDays(new Date(), daysToClose);
        const closeMonth = startOfMonth(expectedClose);
        if (closeMonth.getTime() === m.start.getTime()) {
          const weighted = (lead.dealValue || lead.subscriptionValue || 0) * weight;
          if (lead.brand === "SourceCo") {
            sourceco += weighted;
          } else {
            captarget += weighted;
          }
        }
      }
      return { month: m.label, Captarget: Math.round(captarget), SourceCo: Math.round(sourceco) };
    });
  }, [activeLeads]);

  // 2. Monthly Bookings
  const bookingsData = useMemo(() => {
    const now = new Date();
    const months: { label: string; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: format(d, "MMM"), key: format(d, "yyyy-MM") });
    }

    return months.map(m => {
      let booked = 0;
      for (const lead of wonLeads) {
        if (lead.closedDate) {
          try {
            const cd = format(parseISO(lead.closedDate), "yyyy-MM");
            if (cd === m.key) {
              booked += lead.subscriptionValue || lead.dealValue || 0;
            }
          } catch { /* skip */ }
        }
      }
      return { month: m.label, booked: Math.round(booked), target: MONTHLY_TARGET };
    });
  }, [wonLeads]);

  // 3. NRR
  const nrrData = useMemo(() => {
    const now = new Date();
    const withContracts = wonLeads.filter(l => l.contractStart && l.contractEnd);
    if (withContracts.length === 0) return null;

    let startingMRR = 0;
    let currentMRR = 0;
    for (const l of withContracts) {
      const mrr = l.subscriptionValue || l.dealValue || 0;
      startingMRR += mrr;
      try {
        const end = parseISO(l.contractEnd);
        if (isAfter(end, now)) {
          currentMRR += mrr;
        }
      } catch {
        currentMRR += mrr;
      }
    }
    const nrr = startingMRR > 0 ? (currentMRR / startingMRR) * 100 : 0;
    return { startingMRR, currentMRR, nrr: Math.round(nrr), count: withContracts.length };
  }, [wonLeads]);

  // 4. Revenue Concentration
  const concentrationData = useMemo(() => {
    const totalMRR = wonLeads.reduce((s, l) => s + (l.subscriptionValue || l.dealValue || 0), 0);
    if (totalMRR === 0) return { customers: [], totalMRR: 0, hasRisk: false };

    const customers = wonLeads
      .map(l => ({
        lead: l,
        name: l.company || l.name,
        brand: l.brand,
        mrr: l.subscriptionValue || l.dealValue || 0,
        pct: ((l.subscriptionValue || l.dealValue || 0) / totalMRR) * 100,
      }))
      .sort((a, b) => b.mrr - a.mrr);

    return {
      customers,
      totalMRR,
      hasRisk: customers.some(c => c.pct > 25),
    };
  }, [wonLeads]);

  const projectionChart = {
    Captarget: { label: "Captarget", color: "hsl(var(--primary))" },
    SourceCo: { label: "SourceCo", color: "hsl(var(--accent))" },
  };

  const bookingsChart = {
    booked: { label: "Booked MRR", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6">
      {/* 3-Month Revenue Projection */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">3-Month Revenue Projection</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Weighted pipeline value by expected close month (deal value x stage probability)
          </p>
        </CardHeader>
        <CardContent>
          <ChartContainer config={projectionChart} className="h-[260px] w-full">
            <BarChart data={projectionData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="Captarget" stackId="a" fill="var(--color-Captarget)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="SourceCo" stackId="a" fill="var(--color-SourceCo)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Bookings + NRR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Bookings */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Bookings vs Target</CardTitle>
            <p className="text-xs text-muted-foreground">
              New MRR booked from Closed Won deals (target: ${MONTHLY_TARGET.toLocaleString()}/mo)
            </p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={bookingsChart} className="h-[200px] w-full">
              <LineChart data={bookingsData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine y={MONTHLY_TARGET} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: "Target", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Line type="monotone" dataKey="booked" stroke="var(--color-booked)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* NRR */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Net Revenue Retention</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {nrrData ? (
              <div className="space-y-4">
                <div className="flex items-baseline gap-3">
                  <span className={`text-4xl font-bold ${nrrData.nrr >= 100 ? "text-emerald-600" : nrrData.nrr >= 80 ? "text-amber-600" : "text-destructive"}`}>
                    {nrrData.nrr}%
                  </span>
                  <Badge variant={nrrData.nrr >= 100 ? "default" : "destructive"} className="text-[10px]">
                    {nrrData.nrr >= 100 ? "Healthy" : nrrData.nrr >= 80 ? "At Risk" : "Churning"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Starting MRR</p>
                    <p className="font-medium">${nrrData.startingMRR.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Current MRR</p>
                    <p className="font-medium">${nrrData.currentMRR.toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Based on {nrrData.count} deals with contract data</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[160px] text-center">
                <Shield className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No contract data available</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Populate contract_start and contract_end on won deals to enable retention tracking
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Win/Loss Analysis */}
      <WinLossAnalysis leads={leads} />

      {/* Objection & Competitor Heatmap */}
      <ObjectionCompetitorHeatmap leads={leads} />

      {/* Stakeholder Risk Heatmap */}
      <StakeholderRiskHeatmap leads={leads} onDrillDown={onDrillDown} />

      {/* Decision Process Complexity */}
      <DecisionProcessComplexity leads={leads} />

      {/* Risk Portfolio View */}
      <RiskPortfolioView leads={leads} onDrillDown={onDrillDown} />

      {/* Revenue Concentration Risk */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Revenue Concentration Risk</CardTitle>
            </div>
            {concentrationData.hasRisk && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                <AlertTriangle className="h-3 w-3" />
                High Concentration
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Customer share of total MRR (${concentrationData.totalMRR.toLocaleString()})
          </p>
        </CardHeader>
        <CardContent>
          {concentrationData.customers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Brand</TableHead>
                  <TableHead className="text-xs text-right">MRR</TableHead>
                  <TableHead className="text-xs text-right">Share</TableHead>
                  <TableHead className="text-xs text-right">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {concentrationData.customers.map((c, i) => (
                  <TableRow
                    key={c.lead.id}
                    className="cursor-pointer"
                    onClick={() => onDrillDown(c.name, [c.lead])}
                  >
                    <TableCell className="text-xs font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.brand}</TableCell>
                    <TableCell className="text-xs text-right">${c.mrr.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{c.pct.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      {c.pct > 25 ? (
                        <Badge variant="destructive" className="text-[10px]">High</Badge>
                      ) : c.pct > 15 ? (
                        <Badge variant="secondary" className="text-[10px]">Watch</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">OK</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              No Closed Won deals to analyze
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Objection & Competitor Heatmap ──
function ObjectionCompetitorHeatmap({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const objectionMap: Record<string, { count: number; stages: Set<string>; brands: Set<string> }> = {};
    const competitorMap: Record<string, number> = {};

    for (const lead of leads) {
      for (const m of lead.meetings || []) {
        if (!m.intelligence?.dealSignals) continue;
        const ds = m.intelligence.dealSignals;

        for (const obj of ds.objections || []) {
          if (!obj || obj.length < 3) continue;
          const normalized = obj.length > 60 ? obj.slice(0, 60) + "…" : obj;
          if (!objectionMap[normalized]) objectionMap[normalized] = { count: 0, stages: new Set(), brands: new Set() };
          objectionMap[normalized].count++;
          objectionMap[normalized].stages.add(lead.stage);
          objectionMap[normalized].brands.add(lead.brand);
        }

        for (const comp of ds.competitors || []) {
          if (!comp || comp.length < 2) continue;
          competitorMap[comp] = (competitorMap[comp] || 0) + 1;
        }

        for (const cd of ds.competitorDetails || []) {
          if (cd.name && !competitorMap[cd.name]) competitorMap[cd.name] = 0;
          if (cd.name) competitorMap[cd.name]++;
        }
      }
    }

    const objections = Object.entries(objectionMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([obj, d]) => ({
        objection: obj,
        count: d.count,
        stages: Array.from(d.stages).slice(0, 3).join(", "),
        brands: Array.from(d.brands).join(", "),
      }));

    const competitors = Object.entries(competitorMap)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    return { objections, competitors };
  }, [leads]);

  if (data.objections.length === 0 && data.competitors.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {data.objections.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <CardTitle className="text-sm font-medium">Top Objections (from transcripts)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.objections.map((o, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground w-4 shrink-0 pt-0.5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{o.objection}</span>
                      <span className="font-medium tabular-nums shrink-0">{o.count}×</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{o.brands} · {o.stages}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.competitors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Competitor Mentions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.competitors.map(c => (
                <Badge key={c.name} variant="secondary" className="text-xs gap-1.5">
                  {c.name}
                  <span className="text-[10px] font-semibold tabular-nums opacity-70">{c.count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Win/Loss Analysis ──
function WinLossAnalysis({ leads }: { leads: Lead[] }) {
  const analysis = useMemo(() => {
    const won = leads.filter(l => l.stage === "Closed Won" && l.wonReason);
    const lost = leads.filter(l => l.stage === "Lost" && l.lostReason);

    const countReasons = (items: Lead[], field: "wonReason" | "lostReason") => {
      const map: Record<string, number> = {};
      for (const l of items) {
        const reason = l[field] || "Unknown";
        map[reason] = (map[reason] || 0) + 1;
      }
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));
    };

    return {
      wonReasons: countReasons(won, "wonReason"),
      lostReasons: countReasons(lost, "lostReason"),
      wonCount: leads.filter(l => l.stage === "Closed Won").length,
      lostCount: leads.filter(l => l.stage === "Lost").length,
    };
  }, [leads]);

  if (analysis.wonCount === 0 && analysis.lostCount === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Won Reasons */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <CardTitle className="text-sm font-medium">Why We Win ({analysis.wonCount})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {analysis.wonReasons.length > 0 ? (
            <div className="space-y-2">
              {analysis.wonReasons.map((r, i) => (
                <div key={r.reason} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs">
                      <span>{r.reason}</span>
                      <span className="font-medium tabular-nums">{r.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500/60"
                        style={{ width: `${(r.count / analysis.wonCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">No won reasons recorded yet</p>
          )}
        </CardContent>
      </Card>

      {/* Lost Reasons */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <CardTitle className="text-sm font-medium">Why We Lose ({analysis.lostCount})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {analysis.lostReasons.length > 0 ? (
            <div className="space-y-2">
              {analysis.lostReasons.map((r, i) => (
                <div key={r.reason} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs">
                      <span>{r.reason}</span>
                      <span className="font-medium tabular-nums">{r.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-destructive/60"
                        style={{ width: `${(r.count / analysis.lostCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">No lost reasons recorded yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stakeholder Risk Heatmap ──
function StakeholderRiskHeatmap({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (title: string, leads: Lead[]) => void }) {
  const data = useMemo(() => {
    const TERMINAL_SET = { has: (s: string) => normalizeStage(s) === "Closed Won" || normalizeStage(s) === "Closed Lost" };
    const atRisk: { lead: Lead; issue: string; value: number }[] = [];
    let totalStakeholders = 0;
    const stanceCounts: Record<string, number> = {};
    const influenceCounts: Record<string, number> = {};

    for (const lead of leads) {
      if (TERMINAL_SET.has(lead.stage)) continue;
      const di = lead.dealIntelligence as any;
      if (!di?.stakeholderMap?.length) continue;

      for (const s of di.stakeholderMap) {
        totalStakeholders++;
        stanceCounts[s.stance] = (stanceCounts[s.stance] || 0) + 1;
        influenceCounts[s.influence] = (influenceCounts[s.influence] || 0) + 1;
      }

      // Flag deals where decision maker is neutral/skeptic and no champion
      const hasChampion = di.stakeholderMap.some((s: any) => s.stance === "Champion");
      const neutralDM = di.stakeholderMap.some((s: any) =>
        (s.influence === "Decision Maker" || s.influence === "High") &&
        (s.stance === "Neutral" || s.stance === "Skeptic" || s.stance === "Unknown")
      );
      if (neutralDM && !hasChampion) {
        atRisk.push({ lead, issue: "No champion + neutral/skeptic DM", value: lead.dealValue });
      }
    }

    return {
      atRisk: atRisk.sort((a, b) => b.value - a.value),
      totalStakeholders,
      stanceCounts,
      influenceCounts,
      totalValue: atRisk.reduce((s, r) => s + r.value, 0),
    };
  }, [leads]);

  if (data.totalStakeholders === 0) return null;

  const stances = ["Champion", "Supporter", "Neutral", "Skeptic", "Blocker", "Unknown"];
  const stanceColor = (s: string) => {
    if (s === "Champion") return "text-emerald-500";
    if (s === "Supporter") return "text-blue-500";
    if (s === "Neutral") return "text-yellow-600";
    if (s === "Skeptic") return "text-orange-500";
    if (s === "Blocker") return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <Card className={data.atRisk.length > 0 ? "border-orange-500/30" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" /> Stakeholder Risk Heatmap ({data.totalStakeholders} mapped)
          </CardTitle>
          {data.atRisk.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {data.atRisk.length} deals at risk · ${data.totalValue.toLocaleString()}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stance distribution */}
        <div className="flex flex-wrap gap-3">
          {stances.map(s => {
            const count = data.stanceCounts[s] || 0;
            if (count === 0) return null;
            return (
              <div key={s} className="text-center">
                <p className={`text-lg font-bold tabular-nums ${stanceColor(s)}`}>{count}</p>
                <p className="text-[10px] text-muted-foreground">{s}</p>
              </div>
            );
          })}
        </div>

        {/* At-risk deals */}
        {data.atRisk.length > 0 && (
          <div>
            <p className="text-xs font-medium text-destructive mb-2">⚠ Deals without a champion (neutral/skeptic decision makers)</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Deal</TableHead>
                  <TableHead className="text-xs">Company</TableHead>
                  <TableHead className="text-xs text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.atRisk.slice(0, 8).map(r => (
                  <TableRow key={r.lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onDrillDown(r.lead.name, [r.lead])}>
                    <TableCell className="text-xs font-medium">{r.lead.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.lead.company}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-medium">${r.value.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.atRisk.length > 8 && (
              <button className="text-xs text-primary hover:underline mt-2" onClick={() => onDrillDown("All At-Risk (No Champion)", data.atRisk.map(r => r.lead))}>
                View all {data.atRisk.length} →
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Decision Process Complexity ──
function DecisionProcessComplexity({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const categories: Record<string, { label: string; count: number; won: number; lost: number; avgCycle: number; cycleDays: number[] }> = {
      solo: { label: "Solo Decision Maker", count: 0, won: 0, lost: 0, avgCycle: 0, cycleDays: [] },
      partner: { label: "Partner Discussion", count: 0, won: 0, lost: 0, avgCycle: 0, cycleDays: [] },
      committee: { label: "Committee/Board", count: 0, won: 0, lost: 0, avgCycle: 0, cycleDays: [] },
      other: { label: "Other/Unknown", count: 0, won: 0, lost: 0, avgCycle: 0, cycleDays: [] },
    };

    const seen = new Set<string>();
    for (const lead of leads) {
      for (const m of lead.meetings || []) {
        if (!m.intelligence?.dealSignals?.decisionProcess) continue;
        if (seen.has(lead.id)) continue;
        seen.add(lead.id);

        const dp = m.intelligence.dealSignals.decisionProcess.toLowerCase();
        let cat = "other";
        if (dp.includes("sole") || dp.includes("solo") || dp.includes("single") || dp.includes("himself") || dp.includes("herself")) cat = "solo";
        else if (dp.includes("partner") || dp.includes("wife") || dp.includes("husband") || dp.includes("co-founder")) cat = "partner";
        else if (dp.includes("committee") || dp.includes("board") || dp.includes("team") || dp.includes("internal review") || dp.includes("leadership")) cat = "committee";

        categories[cat].count++;
        if (normalizeStage(lead.stage) === "Closed Won") categories[cat].won++;
        if (normalizeStage(lead.stage) === "Closed Lost") categories[cat].lost++;

        if (lead.dateSubmitted && lead.closedDate) {
          const days = differenceInDays(parseISO(lead.closedDate), parseISO(lead.dateSubmitted));
          if (days > 0) categories[cat].cycleDays.push(days);
        }
      }
    }

    for (const cat of Object.values(categories)) {
      cat.avgCycle = cat.cycleDays.length > 0 ? Math.round(cat.cycleDays.reduce((a, b) => a + b, 0) / cat.cycleDays.length) : 0;
    }

    return Object.values(categories).filter(c => c.count > 0);
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" /> Decision Process Complexity
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">How decision-making structure affects cycle time and win rate</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Decision Type</TableHead>
              <TableHead className="text-xs text-right">Deals</TableHead>
              <TableHead className="text-xs text-right">Won</TableHead>
              <TableHead className="text-xs text-right">Lost</TableHead>
              <TableHead className="text-xs text-right">Win Rate</TableHead>
              <TableHead className="text-xs text-right">Avg Cycle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(d => {
              const closed = d.won + d.lost;
              const winRate = closed > 0 ? Math.round((d.won / closed) * 100) : null;
              return (
                <TableRow key={d.label}>
                  <TableCell className="text-xs font-medium">{d.label}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{d.count}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-emerald-500">{d.won}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-destructive">{d.lost}</TableCell>
                  <TableCell className={`text-xs text-right tabular-nums font-semibold ${winRate !== null && winRate >= 50 ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {winRate !== null ? `${winRate}%` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {d.avgCycle > 0 ? `${d.avgCycle}d` : "—"}
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

// ── Risk Portfolio View ──
function RiskPortfolioView({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (title: string, leads: Lead[]) => void }) {
  const data = useMemo(() => {
    const TERMINAL_SET = { has: (s: string) => normalizeStage(s) === "Closed Won" || normalizeStage(s) === "Closed Lost" };
    const severityCounts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    const mitigationCounts: Record<string, number> = { Unmitigated: 0, "Partially Mitigated": 0, Mitigated: 0 };
    const riskPatterns: Record<string, number> = {};
    let totalRisks = 0;
    const unmitCriticalLeads: Lead[] = [];

    for (const lead of leads) {
      if (TERMINAL_SET.has(lead.stage)) continue;
      const di = lead.dealIntelligence as any;
      if (!di?.riskRegister?.length) continue;

      let hasUnmitCrit = false;
      for (const risk of di.riskRegister) {
        totalRisks++;
        if (risk.severity) severityCounts[risk.severity] = (severityCounts[risk.severity] || 0) + 1;
        if (risk.mitigationStatus) mitigationCounts[risk.mitigationStatus] = (mitigationCounts[risk.mitigationStatus] || 0) + 1;
        
        // Categorize risk
        const r = (risk.risk || "").toLowerCase();
        let pattern = "Other";
        if (r.includes("budget") || r.includes("cost") || r.includes("price")) pattern = "Budget/Pricing";
        else if (r.includes("competitor") || r.includes("alternative")) pattern = "Competitive";
        else if (r.includes("timeline") || r.includes("delay") || r.includes("timing")) pattern = "Timeline";
        else if (r.includes("decision") || r.includes("approval") || r.includes("committee")) pattern = "Decision Process";
        else if (r.includes("champion") || r.includes("internal")) pattern = "Internal Advocacy";
        else if (r.includes("capacity") || r.includes("resource")) pattern = "Resource Constraints";
        riskPatterns[pattern] = (riskPatterns[pattern] || 0) + 1;

        if (risk.severity === "Critical" && risk.mitigationStatus === "Unmitigated") hasUnmitCrit = true;
      }
      if (hasUnmitCrit) unmitCriticalLeads.push(lead);
    }

    const patterns = Object.entries(riskPatterns).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { severityCounts, mitigationCounts, totalRisks, patterns, unmitCriticalLeads };
  }, [leads]);

  if (data.totalRisks === 0) return null;

  const sevColor = (s: string) => {
    if (s === "Critical") return "text-destructive font-bold";
    if (s === "High") return "text-orange-500 font-semibold";
    if (s === "Medium") return "text-yellow-600";
    return "text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" /> Pipeline Risk Portfolio ({data.totalRisks} risks)
          </CardTitle>
          {data.unmitCriticalLeads.length > 0 && (
            <Badge variant="destructive" className="text-[10px] cursor-pointer" onClick={() => onDrillDown("Unmitigated Critical Risks", data.unmitCriticalLeads)}>
              {data.unmitCriticalLeads.length} critical unmitigated
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Severity */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">By Severity</p>
            <div className="space-y-1">
              {["Critical", "High", "Medium", "Low"].map(s => (
                <div key={s} className="flex justify-between text-xs">
                  <span className={sevColor(s)}>{s}</span>
                  <span className="tabular-nums">{data.severityCounts[s] || 0}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Mitigation */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">By Mitigation</p>
            <div className="space-y-1">
              {["Unmitigated", "Partially Mitigated", "Mitigated"].map(s => (
                <div key={s} className="flex justify-between text-xs">
                  <span className={s === "Unmitigated" ? "text-destructive" : s === "Mitigated" ? "text-emerald-500" : "text-yellow-600"}>{s}</span>
                  <span className="tabular-nums">{data.mitigationCounts[s] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Risk patterns */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Common Risk Patterns</p>
          <div className="flex flex-wrap gap-2">
            {data.patterns.map(([pattern, count]) => (
              <Badge key={pattern} variant="secondary" className="text-xs gap-1.5">
                {pattern}
                <span className="text-[10px] font-semibold tabular-nums opacity-70">{count}</span>
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
