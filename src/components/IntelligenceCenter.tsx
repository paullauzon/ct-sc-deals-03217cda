import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead } from "@/types/lead";
import { LeadDetail } from "@/components/LeadsTable";
import { DashboardSignalIntelligence } from "@/components/DashboardSignalIntelligence";
import { DashboardCompetitiveRadar } from "@/components/DashboardCompetitiveRadar";
import { DashboardLossIntelligence } from "@/components/DashboardLossIntelligence";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Radar, Crosshair, ShieldAlert, GraduationCap, Megaphone,
  TrendingUp, TrendingDown, Brain, HeartPulse, Lightbulb, Zap,
  AlertTriangle, Timer, Mic, HelpCircle, Target, BarChart3,
  Route, Shield, Handshake, Lock
} from "lucide-react";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);

type SubTab = "signals" | "competitors" | "risks" | "coaching" | "gtm";

const SUB_TABS: { key: SubTab; label: string; icon: typeof Radar }[] = [
  { key: "signals", label: "Signals", icon: Radar },
  { key: "competitors", label: "Competitors", icon: Crosshair },
  { key: "risks", label: "Risks", icon: ShieldAlert },
  { key: "coaching", label: "Coaching", icon: GraduationCap },
  { key: "gtm", label: "GTM Insights", icon: Megaphone },
];

interface DrillDown {
  title: string;
  leads: Lead[];
}

export function IntelligenceCenter() {
  const { leads } = useLeads();
  const [subTab, setSubTab] = useState<SubTab>("signals");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);

  const handleDrillDown = (title: string, drillLeads: Lead[]) => {
    setDrillDown({ title, leads: drillLeads });
  };

  const activeLeads = useMemo(() => leads.filter(l => !CLOSED_STAGES.has(l.stage)), [leads]);
  const wonLeads = useMemo(() => leads.filter(l => l.stage === "Closed Won"), [leads]);
  const lostLeads = useMemo(() => leads.filter(l => l.stage === "Closed Lost" || l.stage === "Went Dark"), [leads]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 border-b border-border">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              subTab === key
                ? "border-foreground text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ═══ SIGNALS TAB ═══ */}
      {subTab === "signals" && (
        <div className="space-y-8">
          {/* Existing 4-block Signal Intelligence */}
          <DashboardSignalIntelligence leads={leads} onDrillDown={handleDrillDown} />

          {/* Block 5: Sentiment Tracker */}
          <SentimentTracker leads={leads} activeLeads={activeLeads} onDrillDown={handleDrillDown} />

          {/* Block 6: Fear & Motivation Map */}
          <FearMotivationMap leads={leads} wonLeads={wonLeads} lostLeads={lostLeads} onDrillDown={handleDrillDown} />

          {/* Block 7: Decision Process Intelligence */}
          <DecisionProcessIntel leads={leads} onDrillDown={handleDrillDown} />

          {/* Block 8: Buyer Journey Distribution */}
          <BuyerJourneyDistribution leads={activeLeads} onDrillDown={handleDrillDown} />

          {/* Block 9: Champion Strength Overview */}
          <ChampionStrengthOverview leads={leads} activeLeads={activeLeads} wonLeads={wonLeads} lostLeads={lostLeads} onDrillDown={handleDrillDown} />
        </div>
      )}

      {/* ═══ COMPETITORS TAB ═══ */}
      {subTab === "competitors" && (
        <div className="space-y-8">
          {/* Current Solutions Map */}
          <CurrentSolutionsMap leads={leads} activeLeads={activeLeads} onDrillDown={handleDrillDown} />

          <DashboardCompetitiveRadar leads={leads} onDrillDown={handleDrillDown} onSelectLead={setSelectedLeadId} />

          {/* Evaluation Criteria Frequency */}
          <EvaluationCriteriaFrequency leads={leads} wonLeads={wonLeads} lostLeads={lostLeads} onDrillDown={handleDrillDown} />

          {/* Block 4: Competitive Win/Loss Deep Dive */}
          <CompetitiveWinLoss leads={leads} onDrillDown={handleDrillDown} />

          {/* Switching Barriers Analysis */}
          <SwitchingBarriersAnalysis leads={leads} activeLeads={activeLeads} lostLeads={lostLeads} onDrillDown={handleDrillDown} />

          {/* Block 5: Competitive Positioning */}
          <CompetitivePositioning leads={leads} onDrillDown={handleDrillDown} />
        </div>
      )}

      {/* ═══ RISKS TAB ═══ */}
      {subTab === "risks" && (
        <div className="space-y-8">
          <DashboardLossIntelligence leads={leads} onDrillDown={handleDrillDown} />

          {/* Block 7: Active Deal Risk Radar */}
          <ActiveRiskRadar leads={activeLeads} onDrillDown={handleDrillDown} />

          {/* Block 8: Momentum Decay Early Warning */}
          <MomentumDecayWarning leads={activeLeads} onDrillDown={handleDrillDown} />
        </div>
      )}

      {/* ═══ COACHING TAB ═══ */}
      {subTab === "coaching" && (
        <div className="space-y-8">
          <CoachingScorecard leads={leads} />
          <TalkRatioDeepDive leads={leads} />
          <MeetingQualityTrends leads={leads} />
          <DiscoveryQuality leads={leads} />
        </div>
      )}

      {/* ═══ GTM INSIGHTS TAB ═══ */}
      {subTab === "gtm" && (
        <div className="space-y-8">
          <BuyerLanguageMap leads={leads} wonLeads={wonLeads} />
          <ValuePropEffectiveness leads={leads} wonLeads={wonLeads} lostLeads={lostLeads} />
          <UrgencyDriverMap leads={leads} wonLeads={wonLeads} lostLeads={lostLeads} />
          <ChannelIntelCorrelation leads={leads} />
          <ICPValidation leads={leads} />
        </div>
      )}

      {/* Drill-down sheet */}
      <Sheet open={!!drillDown} onOpenChange={() => setDrillDown(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg">{drillDown?.title}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {drillDown?.leads.map(l => (
              <div
                key={l.id}
                className="border border-border rounded-md px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => { setSelectedLeadId(l.id); setDrillDown(null); }}
              >
                <div className="flex justify-between">
                  <div>
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.company} · {l.stage}</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">${l.dealValue.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}

// ════════════════════════════════════════════════════════
// SIGNALS SUB-TAB COMPONENTS
// ════════════════════════════════════════════════════════

function SentimentTracker({ leads, activeLeads, onDrillDown }: { leads: Lead[]; activeLeads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const sentimentBuckets: Record<string, { leads: Lead[]; value: number }> = {
      "Very Positive": { leads: [], value: 0 },
      Positive: { leads: [], value: 0 },
      Neutral: { leads: [], value: 0 },
      Cautious: { leads: [], value: 0 },
      Negative: { leads: [], value: 0 },
    };
    let improving = 0, declining = 0, stable = 0;

    for (const l of leads) {
      const meetings = (l.meetings || []).filter(m => m.intelligence?.dealSignals?.sentiment);
      if (meetings.length === 0) continue;
      const lastSentiment = meetings[meetings.length - 1].intelligence!.dealSignals.sentiment;
      if (sentimentBuckets[lastSentiment]) {
        sentimentBuckets[lastSentiment].leads.push(l);
        sentimentBuckets[lastSentiment].value += l.dealValue;
      }
      if (meetings.length >= 2) {
        const order = ["Negative", "Cautious", "Neutral", "Positive", "Very Positive"];
        const first = order.indexOf(meetings[0].intelligence!.dealSignals.sentiment);
        const last = order.indexOf(lastSentiment);
        if (last > first) improving++;
        else if (last < first) declining++;
        else stable++;
      }
    }
    const total = improving + declining + stable;
    return { sentimentBuckets, improving, declining, stable, total };
  }, [leads]);

  const sentimentColors: Record<string, string> = {
    "Very Positive": "bg-emerald-500", Positive: "bg-emerald-300",
    Neutral: "bg-secondary", Cautious: "bg-amber-400", Negative: "bg-red-500",
  };

  if (data.total === 0 && Object.values(data.sentimentBuckets).every(b => b.leads.length === 0)) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <HeartPulse className="w-4 h-4" />
        Sentiment Tracker — All Pipeline
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Current Sentiment Distribution</p>
          <div className="space-y-2">
            {Object.entries(data.sentimentBuckets).map(([sentiment, bucket]) => {
              if (bucket.leads.length === 0) return null;
              return (
                <div
                  key={sentiment}
                  className="flex items-center justify-between cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
                  onClick={() => onDrillDown(`${sentiment} Sentiment`, bucket.leads)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${sentimentColors[sentiment]}`} />
                    <span className="text-xs">{sentiment}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{bucket.leads.length} deals</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">${bucket.value.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Sentiment Shift (First → Last Meeting)</p>
          {data.total > 0 ? (
            <div className="space-y-3">
              {[
                { label: "Improving", count: data.improving, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
                { label: "Stable", count: data.stable, icon: Target, color: "text-muted-foreground" },
                { label: "Declining", count: data.declining, icon: TrendingDown, color: "text-red-600 dark:text-red-400" },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <row.icon className={`w-3.5 h-3.5 ${row.color}`} />
                    <span className="text-xs">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold tabular-nums ${row.color}`}>{row.count}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{data.total > 0 ? Math.round((row.count / data.total) * 100) : 0}%</span>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{data.total > 0 ? Math.round((data.improving / data.total) * 100) : 0}%</span> of deals show improving sentiment — the leading indicator of pipeline health
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Need 2+ meetings per deal to track shifts</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FearMotivationMap({ leads, wonLeads, lostLeads, onDrillDown }: { leads: Lead[]; wonLeads: Lead[]; lostLeads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const fears = new Map<string, { count: number; wonCount: number; lostCount: number; leads: Lead[] }>();
    const motivations = new Map<string, { count: number; wonCount: number; lostCount: number; leads: Lead[] }>();

    for (const l of leads) {
      const di = l.dealIntelligence;
      if (!di?.psychologicalProfile) continue;
      const isWon = l.stage === "Closed Won";
      const isLost = l.stage === "Closed Lost";

      const fear = di.psychologicalProfile.fearFactor?.trim();
      if (fear && fear.length > 2) {
        if (!fears.has(fear)) fears.set(fear, { count: 0, wonCount: 0, lostCount: 0, leads: [] });
        const e = fears.get(fear)!;
        e.count++; e.leads.push(l);
        if (isWon) e.wonCount++;
        if (isLost) e.lostCount++;
      }

      for (const trigger of di.psychologicalProfile.emotionalTriggers || []) {
        const t = trigger.trim();
        if (!t || t.length < 3) continue;
        if (!motivations.has(t)) motivations.set(t, { count: 0, wonCount: 0, lostCount: 0, leads: [] });
        const e = motivations.get(t)!;
        e.count++; e.leads.push(l);
        if (isWon) e.wonCount++;
        if (isLost) e.lostCount++;
      }

      const realWhy = di.psychologicalProfile.realWhy?.trim();
      if (realWhy && realWhy.length > 2) {
        if (!motivations.has(realWhy)) motivations.set(realWhy, { count: 0, wonCount: 0, lostCount: 0, leads: [] });
        const e = motivations.get(realWhy)!;
        e.count++; e.leads.push(l);
        if (isWon) e.wonCount++;
        if (isLost) e.lostCount++;
      }
    }

    const topFears = Array.from(fears.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 8)
      .map(([text, d]) => ({ text, ...d, wonPct: (d.wonCount + d.lostCount) > 0 ? Math.round((d.wonCount / (d.wonCount + d.lostCount)) * 100) : null }));

    const topMotivations = Array.from(motivations.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 8)
      .map(([text, d]) => ({ text, ...d, wonPct: (d.wonCount + d.lostCount) > 0 ? Math.round((d.wonCount / (d.wonCount + d.lostCount)) * 100) : null }));

    return { topFears, topMotivations };
  }, [leads]);

  if (data.topFears.length === 0 && data.topMotivations.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Brain className="w-4 h-4" />
        Fear & Motivation Map
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Top Fears (Psychological Barriers)</p>
          {data.topFears.length > 0 ? (
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {data.topFears.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1 -mx-2 transition-colors"
                  onClick={() => onDrillDown(`Fear: ${f.text}`, f.leads)}
                >
                  <span className="truncate max-w-[55%] text-foreground">{f.text}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{f.count}×</span>
                    {f.wonPct !== null && (
                      <span className={`tabular-nums ${f.wonPct >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {f.wonPct}% won
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No psychological profiles yet</p>
          )}
        </div>
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Top Motivations (Real "Why")</p>
          {data.topMotivations.length > 0 ? (
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {data.topMotivations.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1 -mx-2 transition-colors"
                  onClick={() => onDrillDown(`Motivation: ${m.text}`, m.leads)}
                >
                  <span className="truncate max-w-[55%] text-foreground">{m.text}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{m.count}×</span>
                    {m.wonPct !== null && (
                      <span className={`tabular-nums ${m.wonPct >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {m.wonPct}% won
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No emotional triggers captured yet</p>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">Use these in marketing messaging — fears overcome + motivations amplified = conversion</p>
    </div>
  );
}

function DecisionProcessIntel({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const processMap = new Map<string, { leads: Lead[]; avgCycleDays: number[]; wonCount: number; lostCount: number; avgCommitteeSize: number[] }>();

    for (const l of leads) {
      const processes = new Set<string>();
      for (const m of l.meetings || []) {
        const dp = m.intelligence?.dealSignals?.decisionProcess?.trim();
        if (dp && dp.length > 2) processes.add(dp);
      }
      const isWon = l.stage === "Closed Won";
      const isLost = l.stage === "Closed Lost";
      const cycleDays = (l.closedDate && l.dateSubmitted)
        ? Math.max(0, Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000))
        : null;

      const bc = l.dealIntelligence?.buyingCommittee;
      const committeeSize = bc ? (bc.influencers?.length || 0) + (bc.blockers?.length || 0) + (bc.decisionMaker ? 1 : 0) + (bc.champion ? 1 : 0) : null;

      for (const p of processes) {
        if (!processMap.has(p)) processMap.set(p, { leads: [], avgCycleDays: [], wonCount: 0, lostCount: 0, avgCommitteeSize: [] });
        const e = processMap.get(p)!;
        e.leads.push(l);
        if (cycleDays !== null) e.avgCycleDays.push(cycleDays);
        if (isWon) e.wonCount++;
        if (isLost) e.lostCount++;
        if (committeeSize !== null) e.avgCommitteeSize.push(committeeSize);
      }
    }

    return Array.from(processMap.entries())
      .sort(([, a], [, b]) => b.leads.length - a.leads.length)
      .slice(0, 8)
      .map(([process, d]) => ({
        process,
        count: d.leads.length,
        leads: d.leads,
        avgCycle: d.avgCycleDays.length > 0 ? Math.round(d.avgCycleDays.reduce((s, v) => s + v, 0) / d.avgCycleDays.length) : null,
        winRate: (d.wonCount + d.lostCount) > 0 ? Math.round((d.wonCount / (d.wonCount + d.lostCount)) * 100) : null,
        avgCommittee: d.avgCommitteeSize.length > 0 ? (d.avgCommitteeSize.reduce((s, v) => s + v, 0) / d.avgCommitteeSize.length).toFixed(1) : null,
      }));
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Lightbulb className="w-4 h-4" />
        Decision Process Intelligence
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-2">
          {data.map((d, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
              onClick={() => onDrillDown(`Process: ${d.process}`, d.leads)}
            >
              <span className="truncate max-w-[40%] text-foreground font-medium">{d.process}</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{d.count} deals</span>
                {d.avgCycle !== null && <span className="tabular-nums text-muted-foreground">{d.avgCycle}d avg cycle</span>}
                {d.winRate !== null && (
                  <span className={`tabular-nums font-medium ${d.winRate >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {d.winRate}% win
                  </span>
                )}
                {d.avgCommittee && <span className="tabular-nums text-muted-foreground">{d.avgCommittee} avg committee</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPETITORS SUB-TAB COMPONENTS
// ════════════════════════════════════════════════════════

function CompetitiveWinLoss({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const compMap = new Map<string, { won: Lead[]; lost: Lead[]; active: Lead[]; objections: string[]; painPoints: string[] }>();

    for (const l of leads) {
      const competitors = new Set<string>();
      for (const m of l.meetings || []) {
        for (const c of m.intelligence?.dealSignals?.competitors || []) competitors.add(c.trim());
      }
      for (const c of competitors) {
        if (!compMap.has(c)) compMap.set(c, { won: [], lost: [], active: [], objections: [], painPoints: [] });
        const e = compMap.get(c)!;
        if (l.stage === "Closed Won") e.won.push(l);
        else if (l.stage === "Closed Lost" || l.stage === "Went Dark") e.lost.push(l);
        else if (!CLOSED_STAGES.has(l.stage)) e.active.push(l);

        for (const m of l.meetings || []) {
          for (const o of m.intelligence?.dealSignals?.objections || []) e.objections.push(o);
          for (const p of m.intelligence?.painPoints || []) e.painPoints.push(p);
        }
      }
    }

    return Array.from(compMap.entries())
      .sort(([, a], [, b]) => (b.won.length + b.lost.length + b.active.length) - (a.won.length + a.lost.length + a.active.length))
      .slice(0, 6)
      .map(([name, d]) => {
        const topObj = mode(d.objections);
        const topPain = mode(d.painPoints);
        const total = d.won.length + d.lost.length;
        return {
          name,
          won: d.won.length,
          lost: d.lost.length,
          active: d.active.length,
          winRate: total > 0 ? Math.round((d.won.length / total) * 100) : null,
          topObjection: topObj,
          topPainPoint: topPain,
          allLeads: [...d.won, ...d.lost, ...d.active],
        };
      });
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Crosshair className="w-4 h-4" />
        Competitive Win/Loss Deep Dive
      </h2>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Competitor</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Won</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Lost</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Active</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Win %</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Top Objection</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map(c => (
              <tr
                key={c.name}
                className="hover:bg-secondary/30 transition-colors cursor-pointer"
                onClick={() => onDrillDown(`Deals vs ${c.name}`, c.allLeads)}
              >
                <td className="px-4 py-2.5 font-medium">{c.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{c.won}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{c.lost}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.active}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${c.winRate !== null && c.winRate >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {c.winRate !== null ? `${c.winRate}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[180px]">{c.topObjection || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompetitivePositioning({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const compMap = new Map<string, { leads: Lead[]; totalValue: number; stages: string[] }>();

    for (const l of leads) {
      const competitors = new Set<string>();
      for (const m of l.meetings || []) {
        for (const c of m.intelligence?.dealSignals?.competitors || []) competitors.add(c.trim());
      }
      for (const c of competitors) {
        if (!compMap.has(c)) compMap.set(c, { leads: [], totalValue: 0, stages: [] });
        const e = compMap.get(c)!;
        e.leads.push(l);
        e.totalValue += l.dealValue;
        e.stages.push(l.stage);
      }
    }

    // Also check enrichment.competitivePositioning
    for (const l of leads) {
      const cp = l.enrichment?.competitivePositioning;
      if (!cp) continue;
      // just note it exists — hard to parse free-text into competitor names
    }

    return Array.from(compMap.entries())
      .sort(([, a], [, b]) => b.totalValue - a.totalValue)
      .slice(0, 8)
      .map(([name, d]) => ({
        name,
        dealCount: d.leads.length,
        totalValue: d.totalValue,
        avgValue: d.leads.length > 0 ? Math.round(d.totalValue / d.leads.length) : 0,
        leads: d.leads,
      }));
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <BarChart3 className="w-4 h-4" />
        Competitive Positioning — Deal Value Analysis
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-2">
          {data.map((c, i) => {
            const maxVal = data[0]?.totalValue || 1;
            return (
              <div key={i} className="cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors" onClick={() => onDrillDown(`Deals vs ${c.name}`, c.leads)}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{c.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{c.dealCount} deals</span>
                    <span className="tabular-nums text-muted-foreground">${c.avgValue.toLocaleString()} avg</span>
                    <span className="tabular-nums font-semibold">${c.totalValue.toLocaleString()}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-secondary/50 rounded">
                  <div className="h-full bg-foreground/20 rounded" style={{ width: `${(c.totalValue / maxVal) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// RISKS SUB-TAB COMPONENTS
// ════════════════════════════════════════════════════════

function ActiveRiskRadar({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const risks: { lead: Lead; risk: string; severity: string; mitigationStatus: string }[] = [];

    for (const l of leads) {
      for (const r of l.dealIntelligence?.riskRegister || []) {
        if (r.mitigationStatus === "Unmitigated" && (r.severity === "Critical" || r.severity === "High")) {
          risks.push({ lead: l, risk: r.risk, severity: r.severity, mitigationStatus: r.mitigationStatus });
        }
      }
    }

    const criticalCount = risks.filter(r => r.severity === "Critical").length;
    const highCount = risks.filter(r => r.severity === "High").length;
    const atRiskValue = [...new Set(risks.map(r => r.lead.id))].reduce((s, id) => {
      const l = leads.find(l2 => l2.id === id);
      return s + (l?.dealValue || 0);
    }, 0);

    return {
      risks: risks.sort((a, b) => b.lead.dealValue - a.lead.dealValue).slice(0, 10),
      criticalCount,
      highCount,
      totalRisks: risks.length,
      atRiskValue,
    };
  }, [leads]);

  if (data.totalRisks === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        Active Deal Risk Radar
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="flex items-center gap-4 mb-4">
          <div>
            <span className="text-2xl font-bold tabular-nums">{data.totalRisks}</span>
            <span className="text-xs text-muted-foreground ml-1">unmitigated risks</span>
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="text-red-600 dark:text-red-400 font-medium">{data.criticalCount} critical</span>
            {" · "}
            <span className="text-amber-600 dark:text-amber-400 font-medium">{data.highCount} high</span>
          </div>
          <div className="ml-auto text-right">
            <span className="text-sm font-semibold tabular-nums">${data.atRiskValue.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground ml-1">at risk</span>
          </div>
        </div>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {data.risks.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
              onClick={() => onDrillDown(`Risk: ${r.risk}`, [r.lead])}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  r.severity === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}>{r.severity}</span>
                <span className="truncate max-w-[250px]">{r.risk}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-muted-foreground truncate max-w-[100px]">{r.lead.name}</span>
                <span className="tabular-nums font-medium">${r.lead.dealValue.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MomentumDecayWarning({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const flagged: { lead: Lead; momentum: string; sentimentTrend: string; daysSinceMeeting: number | null }[] = [];

    for (const l of leads) {
      const momentum = l.dealIntelligence?.momentumSignals?.momentum;
      if (momentum !== "Stalling" && momentum !== "Stalled") continue;

      const lastMeeting = (l.meetings || []).slice(-1)[0];
      const daysSinceMeeting = lastMeeting?.date
        ? Math.floor((Date.now() - new Date(lastMeeting.date).getTime()) / 86400000)
        : null;

      const trajectory = l.dealIntelligence?.momentumSignals?.sentimentTrajectory || [];
      let sentimentTrend = "—";
      if (trajectory.length >= 2) {
        const last = trajectory[trajectory.length - 1];
        const prev = trajectory[trajectory.length - 2];
        const order = ["Negative", "Cautious", "Neutral", "Positive", "Very Positive"];
        const li = order.indexOf(last);
        const pi = order.indexOf(prev);
        sentimentTrend = li < pi ? "Declining" : li > pi ? "Improving" : "Flat";
      }

      flagged.push({ lead: l, momentum, sentimentTrend, daysSinceMeeting });
    }

    return flagged.sort((a, b) => b.lead.dealValue - a.lead.dealValue);
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Timer className="w-4 h-4" />
        Momentum Decay — Save These Deals
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <p className="text-xs text-muted-foreground mb-3">
          <span className="font-semibold text-foreground">{data.length}</span> active deals with stalling/stalled momentum —
          <span className="font-semibold text-foreground"> ${data.reduce((s, d) => s + d.lead.dealValue, 0).toLocaleString()}</span> total value
        </p>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {data.map((d, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
              onClick={() => onDrillDown(d.lead.name, [d.lead])}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  d.momentum === "Stalled" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}>{d.momentum}</span>
                <span className="truncate max-w-[140px] font-medium">{d.lead.name}</span>
                <span className="text-muted-foreground truncate max-w-[100px]">{d.lead.company}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {d.sentimentTrend === "Declining" && (
                  <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" /> Declining</span>
                )}
                {d.daysSinceMeeting !== null && (
                  <span className="text-muted-foreground tabular-nums">{d.daysSinceMeeting}d since mtg</span>
                )}
                <span className="tabular-nums font-semibold">${d.lead.dealValue.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COACHING SUB-TAB COMPONENTS
// ════════════════════════════════════════════════════════

function CoachingScorecard({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const owners = ["Malik", "Valeria", "Tomos"] as const;
    const wonLeads = leads.filter(l => l.stage === "Closed Won");

    // Portfolio averages
    const allMeetings = leads.flatMap(l => l.meetings || []).filter(m => m.intelligence?.talkRatio);
    const portfolioAvgTalk = allMeetings.length > 0
      ? Math.round(allMeetings.reduce((s, m) => s + (m.intelligence?.talkRatio || 0), 0) / allMeetings.length) : null;
    const wonMeetings = wonLeads.flatMap(l => l.meetings || []).filter(m => m.intelligence?.talkRatio);
    const wonAvgTalk = wonMeetings.length > 0
      ? Math.round(wonMeetings.reduce((s, m) => s + (m.intelligence?.talkRatio || 0), 0) / wonMeetings.length) : null;

    // Portfolio objection miss rate
    const allObj = allMeetings.map(m => m.intelligence?.objectionHandling).filter(Boolean);
    const portfolioMissRate = allObj.length > 0
      ? Math.round((allObj.filter(o => o === "Missed").length / allObj.length) * 100) : 0;

    const reps = owners.map(owner => {
      const ownerMeetings = leads.filter(l => l.assignedTo === owner).flatMap(l => l.meetings || []).filter(m => m.intelligence?.talkRatio);
      const avgTalk = ownerMeetings.length > 0
        ? Math.round(ownerMeetings.reduce((s, m) => s + (m.intelligence?.talkRatio || 0), 0) / ownerMeetings.length) : null;

      const qDist = { Strong: 0, Adequate: 0, Weak: 0 };
      const objDist = { Effective: 0, Partial: 0, Missed: 0 };
      for (const m of ownerMeetings) {
        const q = m.intelligence?.questionQuality;
        if (q && q in qDist) qDist[q as keyof typeof qDist]++;
        const o = m.intelligence?.objectionHandling;
        if (o && o in objDist) objDist[o as keyof typeof objDist]++;
      }
      const totalObj = objDist.Effective + objDist.Partial + objDist.Missed;
      const missRate = totalObj > 0 ? Math.round((objDist.Missed / totalObj) * 100) : 0;

      return { owner, meetingCount: ownerMeetings.length, avgTalk, qDist, objDist, missRate };
    });

    return { reps, portfolioAvgTalk, wonAvgTalk, portfolioMissRate };
  }, [leads]);

  const hasData = data.reps.some(r => r.meetingCount > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground text-center py-8">No coaching data available yet — process meetings to generate insights</p>;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <GraduationCap className="w-4 h-4" />
        Rep Coaching Scorecard
      </h2>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Rep</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Meetings</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Talk Ratio</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Q Quality (S/A/W)</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Obj Handling (E/P/M)</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Miss Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.reps.filter(r => r.meetingCount > 0).map(r => (
              <tr key={r.owner} className="hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">{r.owner[0]}</span>
                  {r.owner}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.meetingCount}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${r.avgTalk && r.avgTalk > 60 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                  {r.avgTalk !== null ? `${r.avgTalk}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums">{r.qDist.Strong}S / {r.qDist.Adequate}A / {r.qDist.Weak}W</td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums">{r.objDist.Effective}E / {r.objDist.Partial}P / {r.objDist.Missed}M</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${r.missRate > data.portfolioMissRate + 10 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {r.missRate}%
                  {r.missRate > data.portfolioMissRate + 10 && <span className="text-[10px] ml-1">(avg {data.portfolioMissRate}%)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
        {data.portfolioAvgTalk !== null && <span>Portfolio avg talk ratio: {data.portfolioAvgTalk}%</span>}
        {data.wonAvgTalk !== null && <span>Won deal avg talk ratio: {data.wonAvgTalk}%</span>}
      </div>
    </div>
  );
}

function TalkRatioDeepDive({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const stageRatios: Record<string, number[]> = {};
    const repTrends: Record<string, { month: string; ratio: number }[]> = {};

    for (const l of leads) {
      for (const m of l.meetings || []) {
        const ratio = m.intelligence?.talkRatio;
        if (!ratio) continue;
        if (!stageRatios[l.stage]) stageRatios[l.stage] = [];
        stageRatios[l.stage].push(ratio);

        const owner = l.assignedTo || "Unassigned";
        if (!repTrends[owner]) repTrends[owner] = [];
        const month = m.date ? new Date(m.date).toISOString().slice(0, 7) : "Unknown";
        repTrends[owner].push({ month, ratio });
      }
    }

    const byStage = Object.entries(stageRatios)
      .map(([stage, ratios]) => ({
        stage,
        avg: Math.round(ratios.reduce((s, v) => s + v, 0) / ratios.length),
        count: ratios.length,
      }))
      .sort((a, b) => {
        const order = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won", "Closed Lost"];
        return order.indexOf(a.stage) - order.indexOf(b.stage);
      });

    return { byStage };
  }, [leads]);

  if (data.byStage.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Mic className="w-4 h-4" />
        Talk Ratio by Stage
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-2">
          {data.byStage.map(s => (
            <div key={s.stage}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">{s.stage} <span className="tabular-nums">({s.count})</span></span>
                <span className={`font-semibold tabular-nums ${s.avg > 55 ? "text-amber-600 dark:text-amber-400" : s.avg > 45 ? "" : "text-emerald-600 dark:text-emerald-400"}`}>{s.avg}%</span>
              </div>
              <div className="h-2 bg-secondary/50 rounded overflow-hidden">
                <div className="h-full rounded bg-foreground/20" style={{ width: `${s.avg}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">
          Best performers talk less in discovery (&lt;40%) and more in proposals/negotiations (45-55%)
        </p>
      </div>
    </div>
  );
}

function MeetingQualityTrends({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const owners = ["Malik", "Valeria", "Tomos"];
    const engagementOrder = ["Disengaged", "Passive", "Engaged", "Highly Engaged"];

    return owners.map(owner => {
      const meetings = leads
        .filter(l => l.assignedTo === owner)
        .flatMap(l => l.meetings || [])
        .filter(m => m.intelligence?.engagementLevel)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (meetings.length === 0) return null;

      const avgEngagement = meetings.reduce((s, m) => {
        return s + engagementOrder.indexOf(m.intelligence!.engagementLevel);
      }, 0) / meetings.length;

      const highlyEngagedPct = Math.round((meetings.filter(m => m.intelligence!.engagementLevel === "Highly Engaged").length / meetings.length) * 100);

      return { owner, meetingCount: meetings.length, avgEngagement: avgEngagement.toFixed(1), highlyEngagedPct };
    }).filter(Boolean) as { owner: string; meetingCount: number; avgEngagement: string; highlyEngagedPct: number }[];
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4" />
        Meeting Quality — Prospect Engagement
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.owner} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">{d.owner[0]}</span>
                <span className="font-medium">{d.owner}</span>
                <span className="text-muted-foreground tabular-nums">({d.meetingCount} meetings)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">"Highly Engaged":</span>
                <span className={`tabular-nums font-semibold ${d.highlyEngagedPct >= 50 ? "text-emerald-600 dark:text-emerald-400" : d.highlyEngagedPct >= 30 ? "" : "text-amber-600 dark:text-amber-400"}`}>
                  {d.highlyEngagedPct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscoveryQuality({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const owners = ["Malik", "Valeria", "Tomos"];
    return owners.map(owner => {
      const meetings = leads
        .filter(l => l.assignedTo === owner)
        .flatMap(l => l.meetings || [])
        .filter(m => m.intelligence?.questionsAsked);
      const totalQuestions = meetings.reduce((s, m) => s + (m.intelligence?.questionsAsked?.length || 0), 0);
      const avgPerMeeting = meetings.length > 0 ? (totalQuestions / meetings.length).toFixed(1) : null;
      return { owner, meetings: meetings.length, totalQuestions, avgPerMeeting };
    }).filter(d => d.meetings > 0);
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <HelpCircle className="w-4 h-4" />
        Discovery Quality — Questions Per Meeting
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.owner} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">{d.owner[0]}</span>
                <span className="font-medium">{d.owner}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground tabular-nums">{d.totalQuestions} total questions</span>
                <span className="tabular-nums font-semibold">{d.avgPerMeeting} avg/meeting</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">
          Top closers average 8-12 questions per meeting. More questions = deeper discovery = higher win rates.
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// GTM INSIGHTS SUB-TAB COMPONENTS
// ════════════════════════════════════════════════════════

function BuyerLanguageMap({ leads, wonLeads }: { leads: Lead[]; wonLeads: Lead[] }) {
  const data = useMemo(() => {
    const themeMap = new Map<string, { count: number; wonCount: number }>();
    const wonIds = new Set(wonLeads.map(l => l.id));

    for (const l of leads) {
      const themes = new Set<string>();
      for (const m of l.meetings || []) {
        for (const p of m.intelligence?.painPoints || []) themes.add(p.toLowerCase().trim());
        for (const t of m.intelligence?.keyTopics || []) themes.add(t.toLowerCase().trim());
      }
      for (const t of themes) {
        if (t.length < 3) continue;
        if (!themeMap.has(t)) themeMap.set(t, { count: 0, wonCount: 0 });
        const e = themeMap.get(t)!;
        e.count++;
        if (wonIds.has(l.id)) e.wonCount++;
      }
    }

    return Array.from(themeMap.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 15)
      .map(([theme, d]) => ({
        theme: theme.charAt(0).toUpperCase() + theme.slice(1),
        count: d.count,
        wonCount: d.wonCount,
        winCorrelation: d.count > 0 ? Math.round((d.wonCount / d.count) * 100) : 0,
      }));
  }, [leads, wonLeads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Megaphone className="w-4 h-4" />
        Buyer Language Map — Words That Win
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <p className="text-xs text-muted-foreground mb-3">Themes from conversations. High win correlation = put in your marketing.</p>
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[50%] text-foreground">{d.theme}</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{d.count}×</span>
                {d.wonCount > 0 && (
                  <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{d.winCorrelation}% won</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ValuePropEffectiveness({ leads, wonLeads, lostLeads }: { leads: Lead[]; wonLeads: Lead[]; lostLeads: Lead[] }) {
  const data = useMemo(() => {
    const vpMap = new Map<string, { count: number; wonCount: number; lostCount: number }>();
    const wonIds = new Set(wonLeads.map(l => l.id));
    const lostIds = new Set(lostLeads.map(l => l.id));

    for (const l of leads) {
      const vps = new Set<string>();
      for (const m of l.meetings || []) {
        const vp = m.intelligence?.valueProposition?.trim();
        if (vp && vp.length > 3) vps.add(vp.toLowerCase());
      }
      for (const vp of vps) {
        if (!vpMap.has(vp)) vpMap.set(vp, { count: 0, wonCount: 0, lostCount: 0 });
        const e = vpMap.get(vp)!;
        e.count++;
        if (wonIds.has(l.id)) e.wonCount++;
        if (lostIds.has(l.id)) e.lostCount++;
      }
    }

    return Array.from(vpMap.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 8)
      .map(([vp, d]) => ({
        vp: vp.charAt(0).toUpperCase() + vp.slice(1),
        count: d.count,
        winRate: (d.wonCount + d.lostCount) > 0 ? Math.round((d.wonCount / (d.wonCount + d.lostCount)) * 100) : null,
      }));
  }, [leads, wonLeads, lostLeads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Target className="w-4 h-4" />
        Value Proposition Effectiveness
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[55%] text-foreground">{d.vp}</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{d.count}×</span>
                {d.winRate !== null && (
                  <span className={`tabular-nums font-medium ${d.winRate >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {d.winRate}% win
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UrgencyDriverMap({ leads, wonLeads, lostLeads }: { leads: Lead[]; wonLeads: Lead[]; lostLeads: Lead[] }) {
  const data = useMemo(() => {
    const driverMap = new Map<string, { count: number; wonCount: number; lostCount: number; leads: Lead[] }>();
    const wonIds = new Set(wonLeads.map(l => l.id));
    const lostIds = new Set(lostLeads.map(l => l.id));

    for (const l of leads) {
      const drivers = new Set<string>();
      for (const m of l.meetings || []) {
        for (const u of m.intelligence?.dealSignals?.urgencyDrivers || []) {
          const d = u.trim().toLowerCase();
          if (d.length > 2) drivers.add(d);
        }
      }
      for (const d of drivers) {
        if (!driverMap.has(d)) driverMap.set(d, { count: 0, wonCount: 0, lostCount: 0, leads: [] });
        const e = driverMap.get(d)!;
        e.count++; e.leads.push(l);
        if (wonIds.has(l.id)) e.wonCount++;
        if (lostIds.has(l.id)) e.lostCount++;
      }
    }

    return Array.from(driverMap.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([driver, d]) => ({
        driver: driver.charAt(0).toUpperCase() + driver.slice(1),
        count: d.count,
        winRate: (d.wonCount + d.lostCount) > 0 ? Math.round((d.wonCount / (d.wonCount + d.lostCount)) * 100) : null,
        leads: d.leads,
      }));
  }, [leads, wonLeads, lostLeads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4" />
        Urgency Drivers — What Triggers Action
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-1.5">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[55%] text-foreground">{d.driver}</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{d.count}×</span>
                {d.winRate !== null && (
                  <span className={`tabular-nums font-medium ${d.winRate >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {d.winRate}% won
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">
          When a prospect mentions these triggers, prioritize — they close.
        </p>
      </div>
    </div>
  );
}

function ChannelIntelCorrelation({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const sources = ["CT Contact Form", "CT Free Targets Form", "SC Intro Call Form", "SC Free Targets Form"] as const;
    return sources.map(source => {
      const srcLeads = leads.filter(l => l.source === source);
      const withMeetings = srcLeads.filter(l => (l.meetings || []).length > 0);
      const won = srcLeads.filter(l => l.stage === "Closed Won");
      const closed = srcLeads.filter(l => ["Closed Won", "Closed Lost", "Went Dark"].includes(l.stage));
      const avgMeetings = srcLeads.length > 0
        ? (srcLeads.reduce((s, l) => s + (l.meetings?.length || 0), 0) / srcLeads.length).toFixed(1)
        : "0";
      return {
        source: source.replace("CT ", "CT ").replace("SC ", "SC "),
        totalLeads: srcLeads.length,
        withMeetings: withMeetings.length,
        avgMeetings,
        winRate: closed.length > 0 ? Math.round((won.length / closed.length) * 100) : null,
        wonValue: won.reduce((s, l) => s + l.dealValue, 0),
      };
    }).filter(s => s.totalLeads > 0);
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <BarChart3 className="w-4 h-4" />
        Channel → Intelligence → Outcome
      </h2>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Channel</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Leads</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Avg Mtgs</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Win Rate</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Won Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map(d => (
              <tr key={d.source} className="hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-2.5 font-medium text-xs">{d.source}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{d.totalLeads}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{d.avgMeetings}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${d.winRate !== null && d.winRate >= 30 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                  {d.winRate !== null ? `${d.winRate}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">${d.wonValue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ICPValidation({ leads }: { leads: Lead[] }) {
  const data = useMemo(() => {
    const icpGroups: Record<string, { leads: Lead[]; avgIntent: number; wonCount: number; lostCount: number; avgValue: number }> = {};

    for (const l of leads) {
      const fit = l.icpFit || "";
      if (!fit) continue;
      if (!icpGroups[fit]) icpGroups[fit] = { leads: [], avgIntent: 0, wonCount: 0, lostCount: 0, avgValue: 0 };
      const g = icpGroups[fit];
      g.leads.push(l);
      if (l.stage === "Closed Won") g.wonCount++;
      if (l.stage === "Closed Lost") g.lostCount++;

      const intentOrder = { "Strong": 3, "Moderate": 2, "Low": 1, "None detected": 0 };
      const lastMtg = (l.meetings || []).slice(-1)[0];
      const intent = lastMtg?.intelligence?.dealSignals?.buyingIntent;
      if (intent) g.avgIntent += intentOrder[intent] || 0;
    }

    return (["Strong", "Moderate", "Weak"] as const)
      .filter(fit => icpGroups[fit])
      .map(fit => {
        const g = icpGroups[fit];
        const total = g.leads.length;
        const closed = g.wonCount + g.lostCount;
        return {
          fit,
          count: total,
          winRate: closed > 0 ? Math.round((g.wonCount / closed) * 100) : null,
          avgIntent: total > 0 ? (g.avgIntent / total).toFixed(1) : "—",
          avgValue: total > 0 ? Math.round(g.leads.reduce((s, l) => s + l.dealValue, 0) / total) : 0,
        };
      });
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Target className="w-4 h-4" />
        ICP Validation from Conversations
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.fit} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  d.fit === "Strong" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                  d.fit === "Moderate" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}>{d.fit} ICP</span>
                <span className="text-muted-foreground tabular-nums">{d.count} leads</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">Intent: <span className="tabular-nums font-medium text-foreground">{d.avgIntent}/3</span></span>
                {d.winRate !== null && (
                  <span className={`tabular-nums font-medium ${d.winRate >= 40 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{d.winRate}% win</span>
                )}
                <span className="tabular-nums text-muted-foreground">${d.avgValue.toLocaleString()} avg</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">
          If "Strong ICP" leads don't show stronger buying signals, your ICP model needs recalibration.
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// SIGNALS: Buyer Journey Distribution
// ════════════════════════════════════════════════════════

function BuyerJourneyDistribution({ leads, onDrillDown }: { leads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const stages = ["Problem Aware", "Solution Aware", "Evaluating", "Deciding", "Negotiating"] as const;
  const data = useMemo(() => {
    const buckets: Record<string, { leads: Lead[]; value: number }> = {};
    for (const s of stages) buckets[s] = { leads: [], value: 0 };
    for (const l of leads) {
      const meetings = (l.meetings || []).filter(m => m.intelligence?.buyerJourney);
      if (meetings.length === 0) continue;
      const last = meetings[meetings.length - 1].intelligence!.buyerJourney!;
      if (buckets[last]) {
        buckets[last].leads.push(l);
        buckets[last].value += l.dealValue;
      }
    }
    return stages.map(s => ({ stage: s, count: buckets[s].leads.length, value: buckets[s].value, leads: buckets[s].leads }));
  }, [leads]);

  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Route className="w-4 h-4" />
        Buyer Journey Distribution
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="space-y-2">
          {data.map(d => (
            <div
              key={d.stage}
              className="flex items-center gap-3 text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
              onClick={() => d.leads.length > 0 && onDrillDown(`${d.stage} Deals`, d.leads)}
            >
              <span className="w-28 text-muted-foreground">{d.stage}</span>
              <div className="flex-1 h-3 bg-secondary/30 rounded overflow-hidden">
                {total > 0 && <div className="h-full bg-foreground/20 rounded" style={{ width: `${(d.count / total) * 100}%` }} />}
              </div>
              <span className="tabular-nums font-medium w-8 text-right">{d.count}</span>
              <span className="tabular-nums text-muted-foreground w-20 text-right">${(d.value / 1000).toFixed(0)}k</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">
          Shows where active pipeline deals are in their buying journey. Healthy pipelines have deals spread across stages.
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// SIGNALS: Champion Strength Overview
// ════════════════════════════════════════════════════════

function ChampionStrengthOverview({ leads, activeLeads, wonLeads, lostLeads, onDrillDown }: { leads: Lead[]; activeLeads: Lead[]; wonLeads: Lead[]; lostLeads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const strengths = ["Strong", "Emerging", "Weak", "None"] as const;
  const data = useMemo(() => {
    const getStrength = (l: Lead) => {
      const meetings = (l.meetings || []).filter(m => m.intelligence?.internalChampionStrength);
      if (meetings.length === 0) return null;
      return meetings[meetings.length - 1].intelligence!.internalChampionStrength!;
    };

    return strengths.map(s => {
      const active = activeLeads.filter(l => getStrength(l) === s);
      const won = wonLeads.filter(l => getStrength(l) === s);
      const lost = lostLeads.filter(l => getStrength(l) === s);
      const winRate = (won.length + lost.length) > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
      return {
        strength: s,
        activeCount: active.length,
        activeValue: active.reduce((sum, l) => sum + l.dealValue, 0),
        wonCount: won.length,
        lostCount: lost.length,
        winRate,
        leads: [...active, ...won, ...lost],
      };
    });
  }, [activeLeads, wonLeads, lostLeads]);

  const total = data.reduce((s, d) => s + d.activeCount, 0);
  if (total === 0) return null;

  const colors: Record<string, string> = { Strong: "text-emerald-600 dark:text-emerald-400", Emerging: "text-blue-600 dark:text-blue-400", Weak: "text-amber-600 dark:text-amber-400", None: "text-red-600 dark:text-red-400" };

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Shield className="w-4 h-4" />
        Internal Champion Strength
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <div className="grid grid-cols-4 gap-4">
          {data.map(d => (
            <div
              key={d.strength}
              className="text-center cursor-pointer hover:bg-secondary/20 rounded p-3 transition-colors"
              onClick={() => d.leads.length > 0 && onDrillDown(`${d.strength} Champion Deals`, d.leads)}
            >
              <p className={`text-2xl font-bold tabular-nums ${colors[d.strength]}`}>{d.activeCount}</p>
              <p className="text-xs text-muted-foreground mt-1">{d.strength}</p>
              <p className="text-xs tabular-nums text-muted-foreground">${(d.activeValue / 1000).toFixed(0)}k</p>
              {d.winRate !== null && (
                <p className={`text-[10px] mt-1 tabular-nums ${d.winRate >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {d.winRate}% win rate
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">
          Champion strength is the #1 predictor of deal outcome. Deals with "None" need immediate attention.
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPETITORS: Current Solutions Map
// ════════════════════════════════════════════════════════

function CurrentSolutionsMap({ leads, activeLeads, onDrillDown }: { leads: Lead[]; activeLeads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const solMap = new Map<string, { leads: Lead[]; value: number }>();
    for (const l of leads) {
      const meetings = (l.meetings || []).filter(m => m.intelligence?.dealSignals?.currentSolution);
      if (meetings.length === 0) continue;
      const sol = meetings[meetings.length - 1].intelligence!.dealSignals.currentSolution!.trim();
      if (!sol || sol.toLowerCase() === "none" || sol.toLowerCase() === "n/a") continue;
      const normalized = sol.length > 50 ? sol.substring(0, 50) + "…" : sol;
      if (!solMap.has(normalized)) solMap.set(normalized, { leads: [], value: 0 });
      solMap.get(normalized)!.leads.push(l);
      solMap.get(normalized)!.value += l.dealValue;
    }
    return Array.from(solMap.entries())
      .map(([name, d]) => ({ name, count: d.leads.length, value: d.value, leads: d.leads }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Handshake className="w-4 h-4" />
        Current Solutions Map
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <p className="text-xs text-muted-foreground mb-3">What prospects currently use — the solutions we're displacing.</p>
        <div className="space-y-2">
          {data.map(d => (
            <div
              key={d.name}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
              onClick={() => onDrillDown(`Current: ${d.name}`, d.leads)}
            >
              <span className="font-medium text-foreground truncate max-w-[50%]">{d.name}</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{d.count} deals</span>
                <span className="tabular-nums text-muted-foreground">${(d.value / 1000).toFixed(0)}k</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPETITORS: Evaluation Criteria Frequency
// ════════════════════════════════════════════════════════

function EvaluationCriteriaFrequency({ leads, wonLeads, lostLeads, onDrillDown }: { leads: Lead[]; wonLeads: Lead[]; lostLeads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const criteriaMap = new Map<string, { total: Lead[]; won: number; lost: number }>();
    for (const l of leads) {
      const allCriteria = new Set<string>();
      for (const m of l.meetings || []) {
        for (const c of m.intelligence?.dealSignals?.evaluationCriteria || []) {
          allCriteria.add(c.trim().toLowerCase());
        }
      }
      for (const c of allCriteria) {
        if (!criteriaMap.has(c)) criteriaMap.set(c, { total: [], won: 0, lost: 0 });
        const entry = criteriaMap.get(c)!;
        entry.total.push(l);
        if (l.stage === "Closed Won") entry.won++;
        if (l.stage === "Closed Lost" || l.stage === "Went Dark") entry.lost++;
      }
    }
    return Array.from(criteriaMap.entries())
      .map(([name, d]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count: d.total.length,
        winRate: (d.won + d.lost) > 0 ? Math.round((d.won / (d.won + d.lost)) * 100) : null,
        leads: d.total,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [leads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <BarChart3 className="w-4 h-4" />
        Evaluation Criteria Frequency
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <p className="text-xs text-muted-foreground mb-3">What criteria prospects use to compare options — and which we win on.</p>
        <div className="space-y-2">
          {data.map(d => (
            <div
              key={d.name}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
              onClick={() => onDrillDown(`Criterion: ${d.name}`, d.leads)}
            >
              <span className="font-medium text-foreground truncate max-w-[40%]">{d.name}</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{d.count} mentions</span>
                {d.winRate !== null && (
                  <span className={`tabular-nums font-medium ${d.winRate >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {d.winRate}% win
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPETITORS: Switching Barriers Analysis
// ════════════════════════════════════════════════════════

function SwitchingBarriersAnalysis({ leads, activeLeads, lostLeads, onDrillDown }: { leads: Lead[]; activeLeads: Lead[]; lostLeads: Lead[]; onDrillDown: (t: string, l: Lead[]) => void }) {
  const data = useMemo(() => {
    const barrierMap = new Map<string, { active: Lead[]; lost: Lead[]; total: number }>();
    for (const l of leads) {
      const allBarriers = new Set<string>();
      for (const m of l.meetings || []) {
        for (const b of m.intelligence?.dealSignals?.switchingBarriers || []) {
          allBarriers.add(b.trim());
        }
      }
      for (const b of allBarriers) {
        if (!barrierMap.has(b)) barrierMap.set(b, { active: [], lost: [], total: 0 });
        const entry = barrierMap.get(b)!;
        entry.total++;
        if (lostLeads.includes(l)) entry.lost.push(l);
        else if (activeLeads.includes(l)) entry.active.push(l);
      }
    }
    return Array.from(barrierMap.entries())
      .map(([name, d]) => ({ name, activeCount: d.active.length, lostCount: d.lost.length, total: d.total, leads: [...d.active, ...d.lost] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [leads, activeLeads, lostLeads]);

  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Lock className="w-4 h-4" />
        Switching Barriers
      </h2>
      <div className="border border-border rounded-lg px-5 py-4">
        <p className="text-xs text-muted-foreground mb-3">What's keeping prospects with their current solution — and which barriers correlate with losses.</p>
        <div className="space-y-2">
          {data.map(d => (
            <div
              key={d.name}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-2 transition-colors"
              onClick={() => d.leads.length > 0 && onDrillDown(`Barrier: ${d.name}`, d.leads)}
            >
              <span className="font-medium text-foreground truncate max-w-[50%]">{d.name}</span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-muted-foreground">{d.activeCount} active</span>
                {d.lostCount > 0 && <span className="tabular-nums text-red-600 dark:text-red-400">{d.lostCount} lost</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════════════════════

function mode(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const v of arr) {
    if (!v || v === "—") continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) { best = k; bestCount = v; }
  }
  return best;
}
