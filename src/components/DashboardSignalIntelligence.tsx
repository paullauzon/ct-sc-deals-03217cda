import { useMemo } from "react";
import { Lead } from "@/types/lead";
import { Radar, Target, Shield, Users } from "lucide-react";
import { normalizeStage, isClosedStage } from "@/lib/leadUtils";

const isLostStage = (s: string) => normalizeStage(s) === "Closed Lost";
const isWonStage = (s: string) => normalizeStage(s) === "Closed Won";

interface Props {
  leads: Lead[];
  onDrillDown?: (title: string, leads: Lead[]) => void;
}

const INTENT_COLORS: Record<string, string> = {
  Strong: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  Moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Low: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  "None detected": "bg-secondary text-muted-foreground",
};

const STANCE_ORDER = ["Champion", "Supporter", "Neutral", "Skeptic", "Blocker", "Unknown"] as const;

export function DashboardSignalIntelligence({ leads, onDrillDown }: Props) {
  const activeLeads = useMemo(() => leads.filter(l => !isClosedStage(l.stage)), [leads]);
  const wonLeads = useMemo(() => leads.filter(l => isWonStage(l.stage)), [leads]);

  // ─── Block 1: Buying Intent Radar ───
  const intentData = useMemo(() => {
    const buckets: Record<string, { leads: Lead[]; value: number }> = {
      Strong: { leads: [], value: 0 },
      Moderate: { leads: [], value: 0 },
      Low: { leads: [], value: 0 },
      "None detected": { leads: [], value: 0 },
    };

    for (const l of activeLeads) {
      // Get latest meeting's buying intent
      const meetings = l.meetings || [];
      let latestIntent = "None detected";
      for (let i = meetings.length - 1; i >= 0; i--) {
        const intent = meetings[i].intelligence?.dealSignals?.buyingIntent;
        if (intent) { latestIntent = intent; break; }
      }
      if (buckets[latestIntent]) {
        buckets[latestIntent].leads.push(l);
        buckets[latestIntent].value += l.dealValue;
      }
    }

    return buckets;
  }, [activeLeads]);

  // ─── Block 2: Pain Point Frequency Map ───
  const painPointData = useMemo(() => {
    const painMap = new Map<string, { count: number; wonCount: number; totalValue: number; leads: Lead[] }>();

    for (const l of leads) {
      const isWon = isWonStage(l.stage);
      const painPoints = new Set<string>();
      for (const m of l.meetings || []) {
        for (const p of m.intelligence?.painPoints || []) {
          painPoints.add(p.toLowerCase().trim());
        }
      }
      for (const p of painPoints) {
        if (!painMap.has(p)) painMap.set(p, { count: 0, wonCount: 0, totalValue: 0, leads: [] });
        const entry = painMap.get(p)!;
        entry.count++;
        entry.totalValue += l.dealValue;
        entry.leads.push(l);
        if (isWon) entry.wonCount++;
      }
    }

    return Array.from(painMap.entries())
      .map(([pain, data]) => ({
        pain: pain.charAt(0).toUpperCase() + pain.slice(1),
        ...data,
        conversionRate: data.count > 0 ? Math.round((data.wonCount / data.count) * 100) : 0,
        avgValue: data.count > 0 ? Math.round(data.totalValue / data.count) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [leads]);

  // ─── Block 3: Objection Readiness Score ───
  const objectionData = useMemo(() => {
    const objMap = new Map<string, { total: number; addressed: number; wonWith: number; lostWith: number }>();
    let totalOpen = 0;
    let totalAddressed = 0;

    for (const l of leads) {
      const tracker = l.dealIntelligence?.objectionTracker || [];
      const isWon = isWonStage(l.stage);
      const isLost = isLostStage(l.stage);
      for (const obj of tracker) {
        if (!objMap.has(obj.objection)) objMap.set(obj.objection, { total: 0, addressed: 0, wonWith: 0, lostWith: 0 });
        const entry = objMap.get(obj.objection)!;
        entry.total++;
        if (obj.status === "Addressed") {
          entry.addressed++;
          totalAddressed++;
        } else {
          totalOpen++;
        }
        if (isWon) entry.wonWith++;
        if (isLost) entry.lostWith++;
      }
    }

    const topObjections = Array.from(objMap.entries())
      .map(([objection, data]) => ({
        objection,
        ...data,
        resolutionRate: data.total > 0 ? Math.round((data.addressed / data.total) * 100) : 0,
        winCorrelation: (data.wonWith + data.lostWith) > 0 ? Math.round((data.wonWith / (data.wonWith + data.lostWith)) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const resolutionRate = (totalOpen + totalAddressed) > 0 ? Math.round((totalAddressed / (totalOpen + totalAddressed)) * 100) : 0;

    return { totalOpen, totalAddressed, resolutionRate, topObjections };
  }, [leads]);

  // ─── Block 4: Stakeholder Power Map ───
  const stakeholderData = useMemo(() => {
    const stanceMap: Record<string, { count: number; value: number; leads: Lead[] }> = {};
    for (const s of STANCE_ORDER) stanceMap[s] = { count: 0, value: 0, leads: [] };

    let dealsWithChampion = 0;
    let dealsWithBlocker = 0;
    const unchampionedLeads: Lead[] = [];

    for (const l of activeLeads) {
      const stakeholders = l.dealIntelligence?.stakeholderMap || [];
      if (stakeholders.length === 0) continue;

      let hasChampion = false;
      let hasBlocker = false;
      for (const s of stakeholders) {
        const stance = s.stance || "Unknown";
        if (stanceMap[stance]) {
          stanceMap[stance].count++;
          stanceMap[stance].value += l.dealValue;
          if (!stanceMap[stance].leads.includes(l)) stanceMap[stance].leads.push(l);
        }
        if (stance === "Champion") hasChampion = true;
        if (stance === "Blocker") hasBlocker = true;
      }
      if (hasChampion) dealsWithChampion++;
      else unchampionedLeads.push(l);
      if (hasBlocker) dealsWithBlocker++;
    }

    const dealsWithStakeholders = activeLeads.filter(l => (l.dealIntelligence?.stakeholderMap || []).length > 0).length;
    const unchampionedValue = unchampionedLeads.reduce((s, l) => s + l.dealValue, 0);

    return { stanceMap, dealsWithChampion, dealsWithBlocker, dealsWithStakeholders, unchampionedLeads, unchampionedValue };
  }, [activeLeads]);

  const hasAnyData = painPointData.length > 0 || objectionData.totalOpen + objectionData.totalAddressed > 0 ||
    stakeholderData.dealsWithStakeholders > 0 || Object.values(intentData).some(b => b.leads.length > 0 && b.leads.some(l => (l.meetings || []).some(m => m.intelligence)));

  if (!hasAnyData) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Radar className="w-4 h-4" />
        Intelligence Briefing
      </h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Block 1: Buying Intent Radar */}
        <div className="border border-border rounded-lg px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Buying Intent Radar</p>
          </div>
          <div className="space-y-2">
            {(["Strong", "Moderate", "Low", "None detected"] as const).map(intent => {
              const bucket = intentData[intent];
              if (!bucket || bucket.leads.length === 0) return null;
              const pct = activeLeads.length > 0 ? Math.round((bucket.leads.length / activeLeads.length) * 100) : 0;
              return (
                <div
                  key={intent}
                  className="flex items-center justify-between cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
                  onClick={() => onDrillDown?.(`${intent} Intent Deals`, bucket.leads)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${INTENT_COLORS[intent]}`}>{intent}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{bucket.leads.length} deals</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
                    <span className="text-sm font-semibold tabular-nums">${bucket.value.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {intentData.Strong.value > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">${intentData.Strong.value.toLocaleString()}</span> in strong-intent pipeline — your real forecast floor
              </p>
            </div>
          )}
        </div>

        {/* Block 2: Pain Point Frequency Map */}
        <div className="border border-border rounded-lg px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pain Point Map</p>
          </div>
          {painPointData.length > 0 ? (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {painPointData.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1 -mx-2 transition-colors"
                  onClick={() => onDrillDown?.(`Pain: ${p.pain}`, p.leads)}
                >
                  <span className="truncate max-w-[50%] text-foreground">{p.pain}</span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{p.count}×</span>
                    {p.conversionRate > 0 && (
                      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{p.conversionRate}% won</span>
                    )}
                    <span className="tabular-nums text-muted-foreground">${p.avgValue.toLocaleString()} avg</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No pain points captured yet</p>
          )}
        </div>

        {/* Block 3: Objection Readiness */}
        <div className="border border-border rounded-lg px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Objection Readiness</p>
          </div>
          {(objectionData.totalOpen + objectionData.totalAddressed > 0) ? (
            <>
              <div className="flex items-center gap-4 mb-3">
                <div>
                  <span className="text-lg font-bold tabular-nums">{objectionData.resolutionRate}%</span>
                  <span className="text-xs text-muted-foreground ml-1">resolved</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="tabular-nums">{objectionData.totalAddressed}</span> addressed · <span className="tabular-nums">{objectionData.totalOpen}</span> open
                </div>
              </div>
              <div className="space-y-1.5">
                {objectionData.topObjections.map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[45%] text-foreground">{o.objection}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">{o.total}×</span>
                      <span className={`tabular-nums ${o.resolutionRate >= 70 ? "text-emerald-600 dark:text-emerald-400" : o.resolutionRate >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                        {o.resolutionRate}% resolved
                      </span>
                      {o.winCorrelation > 0 && (
                        <span className="tabular-nums text-muted-foreground">{o.winCorrelation}% win</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No objections tracked yet</p>
          )}
        </div>

        {/* Block 4: Stakeholder Power Map */}
        <div className="border border-border rounded-lg px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Stakeholder Power Map</p>
          </div>
          {stakeholderData.dealsWithStakeholders > 0 ? (
            <>
              <div className="space-y-1.5 mb-3">
                {STANCE_ORDER.map(stance => {
                  const data = stakeholderData.stanceMap[stance];
                  if (data.count === 0) return null;
                  return (
                    <div
                      key={stance}
                      className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1 -mx-2 transition-colors"
                      onClick={() => onDrillDown?.(`Deals with ${stance}`, data.leads)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          stance === "Champion" ? "bg-emerald-500" :
                          stance === "Supporter" ? "bg-emerald-300" :
                          stance === "Neutral" ? "bg-secondary" :
                          stance === "Skeptic" ? "bg-amber-400" :
                          stance === "Blocker" ? "bg-red-500" : "bg-muted"
                        }`} />
                        <span>{stance}</span>
                        <span className="text-muted-foreground tabular-nums">{data.count}</span>
                      </div>
                      <span className="tabular-nums text-muted-foreground">${data.value.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 border-t border-border space-y-1">
                <p className="text-xs">
                  <span className="font-semibold text-foreground">{stakeholderData.dealsWithChampion}</span>
                  <span className="text-muted-foreground"> of {stakeholderData.dealsWithStakeholders} deals have a champion</span>
                </p>
                {stakeholderData.unchampionedLeads.length > 0 && (
                  <p
                    className="text-xs text-red-600 dark:text-red-400 cursor-pointer hover:underline"
                    onClick={() => onDrillDown?.("Unchampioned Deals", stakeholderData.unchampionedLeads)}
                  >
                    ${stakeholderData.unchampionedValue.toLocaleString()} pipeline without a champion
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No stakeholder data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
