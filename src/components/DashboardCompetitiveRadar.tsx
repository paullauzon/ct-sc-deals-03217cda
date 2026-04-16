import { useMemo } from "react";
import { Lead } from "@/types/lead";
import { Crosshair, TrendingUp, Mic } from "lucide-react";

const CLOSED_STAGES = new Set(["Closed Won", "Lost", "Went Dark"]);

const SENTIMENT_COLORS: Record<string, string> = {
  "Very Positive": "bg-emerald-500",
  Positive: "bg-emerald-300",
  Neutral: "bg-secondary",
  Cautious: "bg-amber-400",
  Negative: "bg-red-500",
};

const ENGAGEMENT_LABEL: Record<string, string> = {
  "Highly Engaged": "🟢",
  Engaged: "🟡",
  Passive: "🟠",
  Disengaged: "🔴",
};

interface Props {
  leads: Lead[];
  onDrillDown?: (title: string, leads: Lead[]) => void;
  onSelectLead?: (id: string) => void;
}

export function DashboardCompetitiveRadar({ leads, onDrillDown, onSelectLead }: Props) {
  const activeLeads = useMemo(() => leads.filter(l => !CLOSED_STAGES.has(l.stage)), [leads]);
  const lostLeads = useMemo(() => leads.filter(l => l.stage === "Lost"), [leads]);

  // ─── Block 1: Competitor Mentions ───
  const competitorData = useMemo(() => {
    const compMap = new Map<string, { active: Lead[]; lost: Lead[]; won: Lead[]; topStrength: string; topWeakness: string }>();

    for (const l of leads) {
      // Collect structured details if available
      const detailsMap = new Map<string, { strengths: string[]; weaknesses: string[] }>();
      for (const m of l.meetings || []) {
        for (const cd of m.intelligence?.dealSignals?.competitorDetails || []) {
          const name = cd.name.trim();
          if (!detailsMap.has(name)) detailsMap.set(name, { strengths: [], weaknesses: [] });
          const d = detailsMap.get(name)!;
          d.strengths.push(...cd.strengthsMentioned);
          d.weaknesses.push(...cd.weaknessesMentioned);
        }
      }

      // Also collect from flat competitors array for backward compat
      const competitors = new Set<string>();
      for (const m of l.meetings || []) {
        for (const c of m.intelligence?.dealSignals?.competitors || []) {
          competitors.add(c.trim());
        }
        for (const cd of m.intelligence?.dealSignals?.competitorDetails || []) {
          competitors.add(cd.name.trim());
        }
      }

      for (const c of competitors) {
        if (!compMap.has(c)) compMap.set(c, { active: [], lost: [], won: [], topStrength: "", topWeakness: "" });
        const entry = compMap.get(c)!;
        if (l.stage === "Closed Won") entry.won.push(l);
        else if (l.stage === "Lost") entry.lost.push(l);
        else if (!CLOSED_STAGES.has(l.stage)) entry.active.push(l);

        // Aggregate top strength/weakness from details
        const details = detailsMap.get(c);
        if (details) {
          if (details.strengths.length > 0 && !entry.topStrength) entry.topStrength = details.strengths[0];
          if (details.weaknesses.length > 0 && !entry.topWeakness) entry.topWeakness = details.weaknesses[0];
        }
      }
    }

    return Array.from(compMap.entries())
      .map(([name, data]) => ({
        name,
        activeCount: data.active.length,
        lostCount: data.lost.length,
        wonCount: data.won.length,
        total: data.active.length + data.lost.length + data.won.length,
        winRate: (data.won.length + data.lost.length) > 0 ? Math.round((data.won.length / (data.won.length + data.lost.length)) * 100) : null,
        leads: [...data.active, ...data.lost, ...data.won],
        topStrength: data.topStrength,
        topWeakness: data.topWeakness,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [leads]);

  // ─── Block 2: Sentiment & Engagement Heatmap ───
  const sentimentHeatmap = useMemo(() => {
    return activeLeads
      .filter(l => (l.meetings || []).some(m => m.intelligence))
      .sort((a, b) => b.dealValue - a.dealValue)
      .slice(0, 15)
      .map(l => {
        const meetings = (l.meetings || []).filter(m => m.intelligence).slice(-3);
        const trajectory = meetings.map(m => ({
          sentiment: m.intelligence?.dealSignals?.sentiment || "Neutral",
          engagement: m.intelligence?.engagementLevel || "Passive",
          date: m.date,
        }));
        const momentum = l.dealIntelligence?.momentumSignals?.momentum;
        return { lead: l, trajectory, momentum };
      });
  }, [activeLeads]);

  // ─── Block 3: Talk Ratio vs Outcome ───
  const talkRatioData = useMemo(() => {
    const wonRatios: number[] = [];
    const lostRatios: number[] = [];
    const activeRatios: number[] = [];

    for (const l of leads) {
      const ratios = (l.meetings || [])
        .map(m => m.intelligence?.talkRatio)
        .filter((r): r is number => r != null && r > 0);
      if (ratios.length === 0) continue;
      const avg = Math.round(ratios.reduce((s, r) => s + r, 0) / ratios.length);

      if (l.stage === "Closed Won") wonRatios.push(avg);
      else if (l.stage === "Lost") lostRatios.push(avg);
      else if (!CLOSED_STAGES.has(l.stage)) activeRatios.push(avg);
    }

    const average = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

    return {
      wonAvg: average(wonRatios),
      lostAvg: average(lostRatios),
      activeAvg: average(activeRatios),
      wonCount: wonRatios.length,
      lostCount: lostRatios.length,
      activeCount: activeRatios.length,
      insight: (() => {
        const wa = average(wonRatios);
        const la = average(lostRatios);
        if (wa !== null && la !== null && la > wa + 5) {
          return `Won deals average ${wa}% talk ratio vs ${la}% for lost — listen more, close more.`;
        }
        if (wa !== null && wa < 45) {
          return `Winners talk ${wa}% of the time — the sweet spot is under 45%.`;
        }
        return null;
      })(),
    };
  }, [leads]);

  const hasAnyData = competitorData.length > 0 || sentimentHeatmap.length > 0 || talkRatioData.wonCount + talkRatioData.lostCount > 0;

  if (!hasAnyData) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Crosshair className="w-4 h-4" />
        Competitive & Engagement Intelligence
      </h2>

      <div className="grid grid-cols-3 gap-4">
        {/* Block 1: Competitor Mentions */}
        <div className="border border-border rounded-lg px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Crosshair className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Competitor Radar</p>
          </div>
          {competitorData.length > 0 ? (
            <div className="space-y-2">
              {competitorData.map(c => (
            <div
              key={c.name}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
              onClick={() => onDrillDown?.(`Deals vs ${c.name}`, c.leads)}
            >
              <div className="max-w-[45%]">
                <span className="font-medium text-foreground truncate block">{c.name}</span>
                {(c.topStrength || c.topWeakness) && (
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {c.topStrength && <span className="text-emerald-600 dark:text-emerald-400">+{c.topStrength}</span>}
                    {c.topStrength && c.topWeakness && " · "}
                    {c.topWeakness && <span className="text-red-600 dark:text-red-400">−{c.topWeakness}</span>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-muted-foreground">{c.activeCount} active</span>
                {c.wonCount > 0 && <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{c.wonCount}W</span>}
                {c.lostCount > 0 && <span className="tabular-nums text-red-600 dark:text-red-400">{c.lostCount}L</span>}
                {c.winRate !== null && (
                  <span className={`tabular-nums font-medium ${c.winRate >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {c.winRate}%
                  </span>
                )}
              </div>
            </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No competitors detected yet</p>
          )}
        </div>

        {/* Block 2: Sentiment Heatmap */}
        <div className="border border-border rounded-lg px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Sentiment Trajectory</p>
          </div>
          {sentimentHeatmap.length > 0 ? (
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {sentimentHeatmap.map(({ lead, trajectory, momentum }) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1 -mx-2 transition-colors"
                  onClick={() => onSelectLead?.(lead.id)}
                >
                  <span className="truncate w-24 text-foreground" title={lead.name}>
                    {lead.name.split(" ")[0]}
                  </span>
                  <div className="flex items-center gap-1 flex-1">
                    {trajectory.map((t, i) => (
                      <div
                        key={i}
                        className={`w-4 h-4 rounded-sm ${SENTIMENT_COLORS[t.sentiment] || "bg-secondary"}`}
                        title={`${t.sentiment} · ${t.engagement} · ${t.date}`}
                      />
                    ))}
                    {trajectory.length < 3 && Array.from({ length: 3 - trajectory.length }).map((_, i) => (
                      <div key={`empty-${i}`} className="w-4 h-4 rounded-sm border border-border/50" />
                    ))}
                  </div>
                  <span className="tabular-nums text-muted-foreground w-16 text-right">${(lead.dealValue / 1000).toFixed(0)}k</span>
                  {momentum && (
                    <span className={`text-[10px] px-1 rounded ${
                      momentum === "Accelerating" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      momentum === "Stalling" || momentum === "Stalled" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-secondary text-muted-foreground"
                    }`}>
                      {momentum}
                    </span>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                {Object.entries(SENTIMENT_COLORS).map(([label, cls]) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
                    <span className="text-[10px] text-muted-foreground">{label.replace("Very ", "V.")}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No meeting intelligence yet</p>
          )}
        </div>

        {/* Block 3: Talk Ratio Correlation */}
        <div className="border border-border rounded-lg px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Talk Ratio × Outcome</p>
          </div>
          {(talkRatioData.wonCount > 0 || talkRatioData.lostCount > 0) ? (
            <>
              <div className="space-y-3">
                {[
                  { label: "Won Deals", avg: talkRatioData.wonAvg, count: talkRatioData.wonCount, color: "bg-emerald-500" },
                  { label: "Lost Deals", avg: talkRatioData.lostAvg, count: talkRatioData.lostCount, color: "bg-red-500" },
                  { label: "Active Deals", avg: talkRatioData.activeAvg, count: talkRatioData.activeCount, color: "bg-foreground/30" },
                ].map(row => row.avg !== null && (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{row.label} <span className="tabular-nums">({row.count})</span></span>
                      <span className="font-semibold tabular-nums">{row.avg}%</span>
                    </div>
                    <div className="h-2 bg-secondary/50 rounded overflow-hidden">
                      <div className={`h-full rounded ${row.color}`} style={{ width: `${row.avg}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {talkRatioData.insight && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground italic">{talkRatioData.insight}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No talk ratio data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
