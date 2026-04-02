import { useMemo } from "react";
import { Lead } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, ReferenceLine } from "recharts";
import { addDays, format, startOfMonth, isBefore, isAfter, parseISO, differenceInDays } from "date-fns";
import { AlertTriangle, TrendingUp, Shield, Users } from "lucide-react";

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

const DEFAULT_DAYS_TO_CLOSE: Record<string, number> = {
  "New Lead": 90,
  "Qualified": 75,
  "Contacted": 60,
  "Meeting Set": 45,
  "Meeting Held": 30,
  "Proposal Sent": 21,
  "Negotiation": 14,
  "Contract Sent": 7,
};

const TERMINAL = ["Closed Won", "Closed Lost", "Went Dark", "Duplicate", "Disqualified"];
const MONTHLY_TARGET = 15000;

interface Props {
  leads: Lead[];
  onDrillDown: (title: string, leads: Lead[]) => void;
}

export function DashboardForecast({ leads, onDrillDown }: Props) {
  const activeLeads = useMemo(() => leads.filter(l => !TERMINAL.includes(l.stage)), [leads]);
  const wonLeads = useMemo(() => leads.filter(l => l.stage === "Closed Won"), [leads]);

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
        const daysToClose = DEFAULT_DAYS_TO_CLOSE[lead.stage] ?? 60;
        const weight = STAGE_WEIGHTS[lead.stage] ?? 0.1;
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
    const lost = leads.filter(l => l.stage === "Closed Lost" && l.lostReason);

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
      lostCount: leads.filter(l => l.stage === "Closed Lost").length,
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
