import { useMemo } from "react";
import { Lead } from "@/types/lead";
import { normalizeStage, isClosedStage, ACTIVE_STAGES } from "@/lib/leadUtils";

const isWonStage = (s: string) => normalizeStage(s) === "Closed Won";
const isLostStage = (s: string) => {
  const n = normalizeStage(s);
  return n === "Closed Lost";
};
// Post-discovery v2 stages (anything past Discovery Scheduled)
const POST_MEETING_STAGES = new Set([
  "Discovery Scheduled", "Discovery Completed", "Sample Sent", "Proposal Sent", "Negotiating",
  "Closed Won", "Closed Lost",
]);
const ACTIVE_STAGE_ORDER = [...ACTIVE_STAGES];

function pct(n: number, d: number) { return d > 0 ? Math.round((n / d) * 100) : 0; }
function fmt$(v: number) { return v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`; }

function HBar({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex-1 h-2 bg-secondary/50 rounded overflow-hidden">
      <div className={`h-full rounded transition-all bg-foreground/25 ${className}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function StageBar({ leads }: { leads: Lead[] }) {
  const total = leads.length;
  if (!total) return <span className="text-xs text-muted-foreground">—</span>;
  const counts = ACTIVE_STAGE_ORDER.map(s => leads.filter(l => l.stage === s).length);
  return (
    <div className="flex h-2 rounded overflow-hidden bg-secondary/30 w-full">
      {counts.map((c, i) => c > 0 && (
        <div
          key={i}
          className="h-full transition-all"
          style={{
            width: `${(c / total) * 100}%`,
            opacity: 0.2 + (i / ACTIVE_STAGE_ORDER.length) * 0.8,
            backgroundColor: "hsl(var(--foreground))",
          }}
          title={`${ACTIVE_STAGE_ORDER[i]}: ${c}`}
        />
      ))}
    </div>
  );
}

interface Props {
  leads: Lead[];
  onSelectLead: (id: string) => void;
  onDrillDown?: (title: string, leads: Lead[]) => void;
}

export function DashboardPersonaMetrics({ leads, onSelectLead, onDrillDown }: Props) {
  const data = useMemo(() => {
    // ── Block 1: Buyer Type Matrix ──
    const buyerTypes = new Map<string, Lead[]>();
    for (const l of leads) {
      const bt = l.buyerType || "Unknown";
      if (!buyerTypes.has(bt)) buyerTypes.set(bt, []);
      buyerTypes.get(bt)!.push(l);
    }

    const buyerTypeRows = Array.from(buyerTypes.entries())
      .map(([type, group]) => {
        const active = group.filter(l => !CLOSED_STAGES.has(l.stage));
        const won = group.filter(l => l.stage === "Closed Won");
        const lost = group.filter(l => l.stage === "Lost" || l.stage === "Went Dark");
        const closed = won.length + lost.length;
        const wonCycleDays = won
          .map(l => {
            if (!l.dateSubmitted || !l.closedDate) return null;
            return Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000);
          })
          .filter((d): d is number => d !== null);
        const avgCycle = wonCycleDays.length ? Math.round(wonCycleDays.reduce((s, d) => s + d, 0) / wonCycleDays.length) : null;
        const icpStrong = group.filter(l => l.icpFit === "Strong").length;
        const icpMod = group.filter(l => l.icpFit === "Moderate").length;
        const icpWeak = group.filter(l => l.icpFit === "Weak").length;

        return {
          type: type === "Unknown" ? "—" : type,
          count: group.length,
          pipeValue: active.reduce((s, l) => s + l.dealValue, 0),
          wonCount: won.length,
          wonValue: won.reduce((s, l) => s + l.dealValue, 0),
          winRate: pct(won.length, closed),
          avgCycle,
          avgDealSize: won.length ? Math.round(won.reduce((s, l) => s + l.dealValue, 0) / won.length) : 0,
          icpStrong, icpMod, icpWeak,
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.wonValue - a.wonValue || b.count - a.count);

    // ── Block 2: Acquisition Intent ──
    const activelySourced = leads.filter(l => {
      const s = (l.acquisitionStrategy || "").toLowerCase();
      return s.includes("active") || s.includes("sourcing") || s.includes("looking");
    });
    const thesisBuilding = leads.filter(l => {
      const s = (l.acquisitionStrategy || "").toLowerCase();
      return s && !s.includes("active") && !s.includes("sourcing") && !s.includes("looking");
    });
    const noStrategy = leads.filter(l => !l.acquisitionStrategy);

    function intentRow(label: string, group: Lead[]) {
      const active = group.filter(l => !CLOSED_STAGES.has(l.stage));
      const won = group.filter(l => l.stage === "Closed Won");
      const closed = won.length + group.filter(l => l.stage === "Lost" || l.stage === "Went Dark").length;
      return {
        label,
        count: group.length,
        pipeValue: active.reduce((s, l) => s + l.dealValue, 0),
        winRate: pct(won.length, closed),
        meetingRate: pct(group.filter(l => POST_MEETING_STAGES.has(l.stage)).length, group.length),
        leads: group,
      };
    }
    const intentRows = [
      intentRow("Actively Sourcing", activelySourced),
      intentRow("Thesis-Building", thesisBuilding),
      ...(noStrategy.length > 0 ? [intentRow("Not Specified", noStrategy)] : []),
    ];

    // ── Block 3: Channel Attribution ──
    const channelMap = new Map<string, Lead[]>();
    for (const l of leads) {
      let ch = "";
      if (l.hearAboutUs) {
        const k = l.hearAboutUs.toLowerCase().trim();
        ch = k.includes("google") ? "Google" :
          k.includes("linkedin") ? "LinkedIn" :
          k.includes("chatgpt") || k.includes("gpt") || k.includes("copilot") ? "ChatGPT/AI" :
          k.includes("grok") ? "Grok" :
          k.includes("perplexity") ? "Perplexity" :
          k.includes("twitter") || k.includes("x.com") ? "Twitter/X" :
          k.includes("referral") || k.includes("friend") || k.includes("word of mouth") ? "Referral" :
          l.hearAboutUs;
      } else {
        ch = l.source.includes("Contact") ? "Contact Form" :
          l.source.includes("Targets") ? "Targets Form" : l.source;
      }
      if (!channelMap.has(ch)) channelMap.set(ch, []);
      channelMap.get(ch)!.push(l);
    }

    const channelRows = Array.from(channelMap.entries())
      .map(([channel, group]) => {
        const won = group.filter(l => l.stage === "Closed Won");
        const closed = won.length + group.filter(l => l.stage === "Lost" || l.stage === "Went Dark").length;
        return {
          channel,
          count: group.length,
          meetingRate: pct(group.filter(l => POST_MEETING_STAGES.has(l.stage)).length, group.length),
          winRate: pct(won.length, closed),
          avgDealValue: won.length ? Math.round(won.reduce((s, l) => s + l.dealValue, 0) / won.length) : 0,
          revenue: won.reduce((s, l) => s + l.dealValue, 0),
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count);

    // ── Block 4: Tier vs Outcomes ──
    const tierRows = [1, 2, 3, 4].map(t => {
      const group = leads.filter(l => l.tier === t);
      const active = group.filter(l => !CLOSED_STAGES.has(l.stage));
      const won = group.filter(l => l.stage === "Closed Won");
      const closed = won.length + group.filter(l => l.stage === "Lost" || l.stage === "Went Dark").length;
      return {
        tier: t,
        count: group.length,
        pipeValue: active.reduce((s, l) => s + l.dealValue, 0),
        winRate: pct(won.length, closed),
        avgDeal: won.length ? Math.round(won.reduce((s, l) => s + l.dealValue, 0) / won.length) : 0,
        leads: group,
      };
    });
    const untiered = leads.filter(l => !l.tier);

    const tiersWithWins = tierRows.filter(t => t.count > 0);
    let scoringAccuracy = "—";
    if (tiersWithWins.length >= 2) {
      const t1Win = tierRows[0].winRate;
      const t4Win = tierRows[3].winRate;
      if (t1Win > t4Win) scoringAccuracy = "Calibrated";
      else if (t1Win === t4Win) scoringAccuracy = "Flat — review model";
      else scoringAccuracy = "Inverted — recalibrate";
    }

    // ── Block 5: Geography Performance ──
    const geoMap = new Map<string, Lead[]>();
    for (const l of leads) {
      const geo = l.geography?.trim() || "Not Specified";
      if (!geoMap.has(geo)) geoMap.set(geo, []);
      geoMap.get(geo)!.push(l);
    }
    const geoRows = Array.from(geoMap.entries())
      .map(([region, group]) => {
        const active = group.filter(l => !CLOSED_STAGES.has(l.stage));
        const won = group.filter(l => l.stage === "Closed Won");
        const closed = won.length + group.filter(l => l.stage === "Lost" || l.stage === "Went Dark").length;
        return {
          region,
          count: group.length,
          pipeValue: active.reduce((s, l) => s + l.dealValue, 0),
          wonCount: won.length,
          winRate: pct(won.length, closed),
          avgDeal: won.length ? Math.round(won.reduce((s, l) => s + l.dealValue, 0) / won.length) : 0,
          revenue: won.reduce((s, l) => s + l.dealValue, 0),
          leads: group,
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count);

    // ── Block 6: Target Revenue Distribution ──
    const revBuckets: { label: string; min: number; max: number }[] = [
      { label: "<$5M", min: 0, max: 5 },
      { label: "$5M–$25M", min: 5, max: 25 },
      { label: "$25M–$100M", min: 25, max: 100 },
      { label: "$100M–$500M", min: 100, max: 500 },
      { label: "$500M+", min: 500, max: Infinity },
    ];
    function parseRevenue(s: string): number | null {
      if (!s) return null;
      const n = s.replace(/[^0-9.]/g, "");
      const val = parseFloat(n);
      if (isNaN(val)) return null;
      if (s.toLowerCase().includes("b")) return val * 1000;
      if (s.toLowerCase().includes("m")) return val;
      if (val > 1000) return val / 1000000;
      return val;
    }
    const revRows = revBuckets.map(bucket => {
      const group = leads.filter(l => {
        const rev = parseRevenue(l.targetRevenue);
        return rev !== null && rev >= bucket.min && rev < bucket.max;
      });
      const won = group.filter(l => l.stage === "Closed Won");
      const closed = won.length + group.filter(l => l.stage === "Lost" || l.stage === "Went Dark").length;
      return {
        label: bucket.label,
        count: group.length,
        winRate: pct(won.length, closed),
        avgDeal: won.length ? Math.round(won.reduce((s, l) => s + l.dealValue, 0) / won.length) : 0,
        revenue: won.reduce((s, l) => s + l.dealValue, 0),
        leads: group,
      };
    });
    const noRevData = leads.filter(l => !l.targetRevenue || parseRevenue(l.targetRevenue) === null).length;

    // ── Block 7: Deal Size Segmentation ──
    const sizeBuckets: { label: string; min: number; max: number }[] = [
      { label: "Small (<$5K)", min: 0, max: 5000 },
      { label: "Mid ($5K–$20K)", min: 5000, max: 20000 },
      { label: "Large ($20K–$50K)", min: 20000, max: 50000 },
      { label: "Enterprise ($50K+)", min: 50000, max: Infinity },
    ];
    const sizeRows = sizeBuckets.map(bucket => {
      const group = leads.filter(l => l.dealValue >= bucket.min && l.dealValue < bucket.max && l.dealValue > 0);
      const active = group.filter(l => !CLOSED_STAGES.has(l.stage));
      const won = group.filter(l => l.stage === "Closed Won");
      const closed = won.length + group.filter(l => l.stage === "Lost" || l.stage === "Went Dark").length;
      const wonCycleDays = won
        .map(l => {
          if (!l.dateSubmitted || !l.closedDate) return null;
          return Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000);
        })
        .filter((d): d is number => d !== null);
      return {
        label: bucket.label,
        count: group.length,
        pipeValue: active.reduce((s, l) => s + l.dealValue, 0),
        wonCount: won.length,
        winRate: pct(won.length, closed),
        avgCycle: wonCycleDays.length ? Math.round(wonCycleDays.reduce((s, d) => s + d, 0) / wonCycleDays.length) : null,
        leads: group,
      };
    });
    const noDealValue = leads.filter(l => l.dealValue === 0).length;

    // ── Block 8: ICP Fit Deep-Dive ──
    const icpCategories = ["Strong", "Moderate", "Weak"] as const;
    const icpRows = icpCategories.map(fit => {
      const group = leads.filter(l => l.icpFit === fit);
      const active = group.filter(l => !CLOSED_STAGES.has(l.stage));
      const won = group.filter(l => l.stage === "Closed Won");
      const closed = won.length + group.filter(l => l.stage === "Lost" || l.stage === "Went Dark").length;
      const wonCycleDays = won
        .map(l => {
          if (!l.dateSubmitted || !l.closedDate) return null;
          return Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000);
        })
        .filter((d): d is number => d !== null);
      return {
        fit,
        count: group.length,
        pipeValue: active.reduce((s, l) => s + l.dealValue, 0),
        wonCount: won.length,
        wonValue: won.reduce((s, l) => s + l.dealValue, 0),
        winRate: pct(won.length, closed),
        avgDeal: won.length ? Math.round(won.reduce((s, l) => s + l.dealValue, 0) / won.length) : 0,
        avgCycle: wonCycleDays.length ? Math.round(wonCycleDays.reduce((s, d) => s + d, 0) / wonCycleDays.length) : null,
        meetingRate: pct(group.filter(l => POST_MEETING_STAGES.has(l.stage)).length, group.length),
        leads: group,
      };
    });
    const unscored = leads.filter(l => !l.icpFit).length;

    return { buyerTypeRows, intentRows, channelRows, tierRows, untiered, scoringAccuracy, geoRows, revRows, noRevData, sizeRows, noDealValue, icpRows, unscored };
  }, [leads]);

  const maxBuyerCount = Math.max(...data.buyerTypeRows.map(r => r.count), 1);
  const maxChannelCount = Math.max(...data.channelRows.map(r => r.count), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Block 1: Buyer Type Matrix */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Buyer Type Performance</p>
          <div className="space-y-0">
            <div className="grid grid-cols-[1fr_40px_60px_40px_50px_50px_80px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
              <span>Type</span>
              <span className="text-right">Leads</span>
              <span className="text-right">Pipeline</span>
              <span className="text-right">Won</span>
              <span className="text-right">Win %</span>
              <span className="text-right">Cycle</span>
              <span className="text-right">ICP S/M/W</span>
            </div>
            {data.buyerTypeRows.map(r => {
              const typeLeads = leads.filter(l => (l.buyerType || "Unknown") === (r.type === "—" ? "Unknown" : r.type));
              return (
                <div
                  key={r.type}
                  className="grid grid-cols-[1fr_40px_60px_40px_50px_50px_80px] gap-1 text-xs py-1.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => onDrillDown?.(r.type === "—" ? "Unknown Buyer Type" : `${r.type} Leads`, typeLeads)}
                >
                  <span className="font-medium truncate">{r.type}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{r.count}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{fmt$(r.pipeValue)}</span>
                  <span className="text-right tabular-nums font-medium">{r.wonCount}</span>
                  <span className="text-right tabular-nums font-medium">{r.winRate > 0 ? `${r.winRate}%` : "—"}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{r.avgCycle !== null ? `${r.avgCycle}d` : "—"}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{r.icpStrong}/{r.icpMod}/{r.icpWeak}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Block 2: Acquisition Intent */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Acquisition Intent Segmentation</p>
          <div className="space-y-3">
            {data.intentRows.map(r => (
              <div key={r.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{r.label}</span>
                  <div className="flex gap-3 text-[10px] text-muted-foreground tabular-nums">
                    <span>{r.count} leads</span>
                    <span>{fmt$(r.pipeValue)} pipe</span>
                    <span>{r.meetingRate}% mtg</span>
                    <span className="font-medium text-foreground">{r.winRate}% win</span>
                  </div>
                </div>
                <StageBar leads={r.leads} />
              </div>
            ))}
          </div>
        </div>

        {/* Block 3: Channel Attribution */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Channel → Close Attribution</p>
          <div className="space-y-0">
            <div className="grid grid-cols-[1fr_40px_50px_50px_50px_60px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
              <span>Channel</span>
              <span className="text-right">Leads</span>
              <span className="text-right">Mtg %</span>
              <span className="text-right">Win %</span>
              <span className="text-right">Avg $</span>
              <span className="text-right">Revenue</span>
            </div>
            {data.channelRows.slice(0, 10).map(r => (
              <div key={r.channel} className="grid grid-cols-[1fr_40px_50px_50px_50px_60px] gap-1 text-xs py-1.5 border-b border-border/50 last:border-0">
                <span className="font-medium truncate">{r.channel}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.count}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.meetingRate}%</span>
                <span className="text-right tabular-nums font-medium">{r.winRate > 0 ? `${r.winRate}%` : "—"}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.avgDealValue > 0 ? fmt$(r.avgDealValue) : "—"}</span>
                <span className="text-right tabular-nums font-medium">{r.revenue > 0 ? fmt$(r.revenue) : "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Block 4: Tier vs Outcomes */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Lead Quality Tiers vs Outcomes</p>
          <div className="space-y-2">
            {data.tierRows.map(r => (
              <div key={r.tier} className="flex items-center gap-3">
                <span className="text-xs font-medium w-8">T{r.tier}</span>
                <HBar value={r.count} max={Math.max(...data.tierRows.map(t => t.count), 1)} />
                <div className="flex gap-3 text-[10px] tabular-nums text-muted-foreground shrink-0">
                  <span className="w-8 text-right">{r.count}</span>
                  <span className="w-12 text-right">{fmt$(r.pipeValue)}</span>
                  <span className="w-10 text-right font-medium text-foreground">{r.winRate > 0 ? `${r.winRate}%` : "—"}</span>
                  <span className="w-10 text-right">{r.avgDeal > 0 ? fmt$(r.avgDeal) : "—"}</span>
                </div>
              </div>
            ))}
            {data.untiered.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">{data.untiered.length} leads unscored</p>
            )}
          </div>
          <div className="mt-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Scoring Accuracy</span>
              <span className={`text-xs font-medium ${
                data.scoringAccuracy === "Calibrated" ? "text-emerald-600 dark:text-emerald-400" :
                data.scoringAccuracy.includes("Inverted") ? "text-red-600 dark:text-red-400" :
                "text-muted-foreground"
              }`}>{data.scoringAccuracy}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Phase 3 Blocks ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Block 5: Geography Performance */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Geography Performance</p>
          <div className="space-y-0">
            <div className="grid grid-cols-[1fr_40px_60px_40px_50px_50px_60px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
              <span>Region</span>
              <span className="text-right">Leads</span>
              <span className="text-right">Pipeline</span>
              <span className="text-right">Won</span>
              <span className="text-right">Win %</span>
              <span className="text-right">Avg $</span>
              <span className="text-right">Revenue</span>
            </div>
            {data.geoRows.slice(0, 10).map(r => (
              <div
                key={r.region}
                className="grid grid-cols-[1fr_40px_60px_40px_50px_50px_60px] gap-1 text-xs py-1.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => onDrillDown?.(`${r.region} Leads`, r.leads)}
              >
                <span className="font-medium truncate">{r.region}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.count}</span>
                <span className="text-right tabular-nums text-muted-foreground">{fmt$(r.pipeValue)}</span>
                <span className="text-right tabular-nums font-medium">{r.wonCount}</span>
                <span className="text-right tabular-nums font-medium">{r.winRate > 0 ? `${r.winRate}%` : "—"}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.avgDeal > 0 ? fmt$(r.avgDeal) : "—"}</span>
                <span className="text-right tabular-nums font-medium">{r.revenue > 0 ? fmt$(r.revenue) : "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Block 6: Target Revenue Distribution */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Target Revenue Correlation</p>
          <div className="space-y-2">
            {data.revRows.map(r => (
              <div key={r.label} className="flex items-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors rounded px-1 py-0.5" onClick={() => onDrillDown?.(`${r.label} Target Revenue`, r.leads)}>
                <span className="text-xs font-medium w-24 shrink-0">{r.label}</span>
                <HBar value={r.count} max={Math.max(...data.revRows.map(t => t.count), 1)} />
                <div className="flex gap-3 text-[10px] tabular-nums text-muted-foreground shrink-0">
                  <span className="w-8 text-right">{r.count}</span>
                  <span className="w-10 text-right font-medium text-foreground">{r.winRate > 0 ? `${r.winRate}%` : "—"}</span>
                  <span className="w-12 text-right">{r.avgDeal > 0 ? fmt$(r.avgDeal) : "—"}</span>
                  <span className="w-12 text-right">{r.revenue > 0 ? fmt$(r.revenue) : "—"}</span>
                </div>
              </div>
            ))}
            {data.noRevData > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">{data.noRevData} leads without target revenue data</p>
            )}
          </div>
        </div>

        {/* Block 7: Deal Size Segmentation */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Deal Size Segmentation</p>
          <div className="space-y-0">
            <div className="grid grid-cols-[1fr_40px_60px_40px_50px_50px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
              <span>Segment</span>
              <span className="text-right">Deals</span>
              <span className="text-right">Pipeline</span>
              <span className="text-right">Won</span>
              <span className="text-right">Win %</span>
              <span className="text-right">Cycle</span>
            </div>
            {data.sizeRows.map(r => (
              <div
                key={r.label}
                className="grid grid-cols-[1fr_40px_60px_40px_50px_50px] gap-1 text-xs py-1.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => onDrillDown?.(`${r.label} Deals`, r.leads)}
              >
                <span className="font-medium truncate">{r.label}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.count}</span>
                <span className="text-right tabular-nums text-muted-foreground">{fmt$(r.pipeValue)}</span>
                <span className="text-right tabular-nums font-medium">{r.wonCount}</span>
                <span className="text-right tabular-nums font-medium">{r.winRate > 0 ? `${r.winRate}%` : "—"}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.avgCycle !== null ? `${r.avgCycle}d` : "—"}</span>
              </div>
            ))}
            {data.noDealValue > 0 && (
              <p className="text-[10px] text-muted-foreground mt-2">{data.noDealValue} leads with $0 deal value</p>
            )}
          </div>
        </div>

        {/* Block 8: ICP Fit Deep-Dive */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">ICP Fit vs Outcomes</p>
          <div className="space-y-0">
            <div className="grid grid-cols-[1fr_40px_60px_40px_60px_50px_50px_50px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
              <span>Fit</span>
              <span className="text-right">Leads</span>
              <span className="text-right">Pipeline</span>
              <span className="text-right">Won</span>
              <span className="text-right">Won $</span>
              <span className="text-right">Win %</span>
              <span className="text-right">Mtg %</span>
              <span className="text-right">Cycle</span>
            </div>
            {data.icpRows.map(r => (
              <div
                key={r.fit}
                className="grid grid-cols-[1fr_40px_60px_40px_60px_50px_50px_50px] gap-1 text-xs py-1.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => onDrillDown?.(`ICP ${r.fit} Leads`, r.leads)}
              >
                <span className={`font-medium ${r.fit === "Strong" ? "text-emerald-600 dark:text-emerald-400" : r.fit === "Weak" ? "text-red-500" : "text-foreground"}`}>{r.fit}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.count}</span>
                <span className="text-right tabular-nums text-muted-foreground">{fmt$(r.pipeValue)}</span>
                <span className="text-right tabular-nums font-medium">{r.wonCount}</span>
                <span className="text-right tabular-nums font-medium">{r.wonValue > 0 ? fmt$(r.wonValue) : "—"}</span>
                <span className="text-right tabular-nums font-medium">{r.winRate > 0 ? `${r.winRate}%` : "—"}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.meetingRate}%</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.avgCycle !== null ? `${r.avgCycle}d` : "—"}</span>
              </div>
            ))}
            {data.unscored > 0 && (
              <p className="text-[10px] text-muted-foreground mt-2">{data.unscored} leads without ICP fit rating</p>
            )}
          </div>
          {data.icpRows[0]?.winRate > 0 && data.icpRows[2]?.winRate > 0 && (
            <div className="mt-3 pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground">
                Strong ICP wins at <span className="font-medium text-foreground">{data.icpRows[0].winRate}%</span> vs Weak at <span className="font-medium text-foreground">{data.icpRows[2].winRate}%</span>
                {data.icpRows[0].winRate > data.icpRows[2].winRate
                  ? " — ICP scoring validated"
                  : " — ICP criteria need review"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
