import { useMemo } from "react";
import { Lead, LeadStage } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Clock, Users, Shield } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

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

const TERMINAL_STAGES = ["Closed Won", "Closed Lost", "Went Dark"];
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

  return (
    <div className="space-y-6">
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
