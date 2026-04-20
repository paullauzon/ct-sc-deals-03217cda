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

type SynthesizedCategory =
  | "Competitor Displacement"
  | "Blocker / Champion Issues"
  | "Stalled Momentum"
  | "Unresolved Objections"
  | "Risk Materialization"
  | "Engagement Decay"
  | "Budget"
  | "Timing"
  | "No Response"
  | "No Fit"
  | "Other";

function synthesizeLossReason(lead: Lead): SynthesizedCategory {
  const di = lead.dealIntelligence;
  const meetings = lead.meetings || [];

  // 1. Competitor displacement
  if (lead.closeReason === "Competitor") return "Competitor Displacement";
  const hasCompetitorSignals = meetings.some(m =>
    m.intelligence?.dealSignals?.competitors?.length
  ) || (di?.competitiveTimeline?.length ?? 0) > 0;
  if (hasCompetitorSignals && (lead.stage === "Lost" || lead.stage === "Closed Lost")) return "Competitor Displacement";

  // 2. Blocker/champion issues
  if (lead.closeReason === "Champion Left") return "Blocker / Champion Issues";
  const hasBlocker = di?.stakeholderMap?.some(s => s.stance === "Blocker");
  if (hasBlocker) return "Blocker / Champion Issues";

  // 3. Stalled momentum
  const momentum = di?.momentumSignals?.momentum;
  if (momentum === "Stalling" || momentum === "Stalled") return "Stalled Momentum";

  // 4. Unresolved objections
  const openOrRecurring = di?.objectionTracker?.filter(o => o.status === "Open" || o.status === "Recurring") || [];
  if (openOrRecurring.length >= 2) return "Unresolved Objections";

  // 5. Risk materialization
  const unmitigatedCritical = di?.riskRegister?.filter(r =>
    (r.severity === "Critical" || r.severity === "High") && r.mitigationStatus === "Unmitigated"
  ) || [];
  if (unmitigatedCritical.length >= 1) return "Risk Materialization";

  // 6. Engagement decay
  const lastMeeting = meetings[meetings.length - 1];
  const lastSentiment = lastMeeting?.intelligence?.dealSignals?.sentiment;
  const lastEngagement = lastMeeting?.intelligence?.engagementLevel;
  if (lastSentiment === "Negative" || lastSentiment === "Cautious" || lastEngagement === "Disengaged" || lastEngagement === "Passive") {
    return "Engagement Decay";
  }

  // 7. Fallback to rep-stated reason
  const cr = lead.closeReason || lead.lostReason || "";
  if (cr === "Budget") return "Budget";
  if (cr === "Timing") return "Timing";
  if (cr === "No Response") return "No Response";
  if (cr === "No Fit" || cr === "Not Qualified") return "No Fit";
  return "Other";
}

function getReengageAngle(lead: Lead, synthesized: SynthesizedCategory): string {
  const cd = parseDate(lead.closedDate) || parseDate(lead.stageEnteredDate);
  const daysAgo = cd ? daysBetween(cd, new Date()) : 0;

  if ((synthesized === "Budget" || synthesized === "Timing") && daysAgo >= 60) return "Timing may have shifted";
  if (synthesized === "Blocker / Champion Issues") return "Check if org changes occurred";
  if (synthesized === "Stalled Momentum") return "New value prop / case study outreach";
  if (synthesized === "No Response") return "Try different channel/contact";
  return "Re-engage with fresh angle";
}

export function DashboardLossIntelligence({ leads, onDrillDown }: Props) {
  const lostLeads = useMemo(() => leads.filter(l => l.stage === "Lost" || l.stage === "Went Dark" || l.stage === "Closed Lost"), [leads]);
  const darkLeads = useMemo(() => leads.filter(l => l.stage === "Went Dark"), [leads]);

  // Block 1: Synthesized Loss Reasons
  const synthesizedReasons = useMemo(() => {
    const categories: Record<string, { count: number; leads: Lead[] }> = {};
    for (const l of lostLeads) {
      const cat = synthesizeLossReason(l);
      if (!categories[cat]) categories[cat] = { count: 0, leads: [] };
      categories[cat].count++;
      categories[cat].leads.push(l);
    }
    return Object.entries(categories)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        leads: data.leads,
        pct: lostLeads.length > 0 ? Math.round((data.count / lostLeads.length) * 100) : 0,
      }));
  }, [lostLeads]);

  // Block 2: Deal Autopsy Cards — top lost deals by value with intelligence
  const autopsyCards = useMemo(() => {
    return lostLeads
      .filter(l => l.dealValue > 0 && (l.dealIntelligence || l.meetings?.some(m => m.intelligence)))
      .sort((a, b) => b.dealValue - a.dealValue)
      .slice(0, 5)
      .map(l => {
        const di = l.dealIntelligence;
        const lastMtg = l.meetings?.[l.meetings.length - 1];
        const lastIntel = lastMtg?.intelligence;
        const submitted = parseDate(l.dateSubmitted);
        const closed = parseDate(l.closedDate) || parseDate(l.stageEnteredDate);
        const daysInPipeline = submitted && closed ? daysBetween(submitted, closed) : null;

        const blocker = di?.stakeholderMap?.find(s => s.stance === "Blocker");
        const keyUnresolved = di?.objectionTracker?.find(o => o.status === "Open" || o.status === "Recurring");
        const topRisk = di?.riskRegister?.find(r => r.severity === "Critical" || r.severity === "High");

        return {
          lead: l,
          repReason: l.closeReason || l.lostReason || "Not stated",
          synthesized: synthesizeLossReason(l),
          daysInPipeline,
          lastSentiment: lastIntel?.dealSignals?.sentiment || "—",
          lastEngagement: lastIntel?.engagementLevel || "—",
          keyIssue: keyUnresolved?.objection || topRisk?.risk || "—",
          blockerName: blocker ? `${blocker.name} (${blocker.role})` : null,
        };
      });
  }, [lostLeads]);

  // Block 3: Engagement Decay Signals
  const engagementDecay = useMemo(() => {
    const buckets: Record<string, { count: number; leads: Lead[]; sentiments: string[]; engagements: string[]; momentums: string[] }> = {
      "0-14d": { count: 0, leads: [], sentiments: [], engagements: [], momentums: [] },
      "15-30d": { count: 0, leads: [], sentiments: [], engagements: [], momentums: [] },
      "31-60d": { count: 0, leads: [], sentiments: [], engagements: [], momentums: [] },
      "60d+": { count: 0, leads: [], sentiments: [], engagements: [], momentums: [] },
    };
    let totalWithDecline = 0;
    let totalMeetings = 0;
    let totalStalled = 0;

    for (const l of darkLeads) {
      const start = parseDate(l.dateSubmitted);
      const end = parseDate(l.closedDate) || parseDate(l.stageEnteredDate);
      if (!start || !end) continue;
      const days = daysBetween(start, end);
      const bucket = days <= 14 ? "0-14d" : days <= 30 ? "15-30d" : days <= 60 ? "31-60d" : "60d+";
      buckets[bucket].count++;
      buckets[bucket].leads.push(l);

      totalMeetings += l.meetings?.length || 0;

      const lastMtg = l.meetings?.[l.meetings.length - 1];
      const sentiment = lastMtg?.intelligence?.dealSignals?.sentiment || "—";
      const engagement = lastMtg?.intelligence?.engagementLevel || "—";
      const momentum = l.dealIntelligence?.momentumSignals?.momentum || "—";

      buckets[bucket].sentiments.push(sentiment);
      buckets[bucket].engagements.push(engagement);
      buckets[bucket].momentums.push(momentum);

      if (["Negative", "Cautious"].includes(sentiment) || ["Disengaged", "Passive"].includes(engagement)) totalWithDecline++;
      if (momentum === "Stalling" || momentum === "Stalled") totalStalled++;
    }

    const totalDark = darkLeads.length;
    return {
      buckets: Object.entries(buckets).map(([label, data]) => {
        const dominantSentiment = mode(data.sentiments);
        const dominantEngagement = mode(data.engagements);
        const dominantMomentum = mode(data.momentums);
        return { label, count: data.count, leads: data.leads, dominantSentiment, dominantEngagement, dominantMomentum };
      }),
      declineRate: totalDark > 0 ? Math.round((totalWithDecline / totalDark) * 100) : 0,
      avgMeetings: totalDark > 0 ? (totalMeetings / totalDark).toFixed(1) : "0",
      stalledRate: totalDark > 0 ? Math.round((totalStalled / totalDark) * 100) : 0,
    };
  }, [darkLeads]);

  // Block 4: Risk Factor Frequency Map
  const riskData = useMemo(() => {
    const riskMap: Record<string, { count: number; mitigated: number; unmitigated: number; lostWhenMitigated: number; totalOutcomed: number }> = {};

    for (const l of lostLeads) {
      const di = l.dealIntelligence;
      // From risk register
      for (const r of di?.riskRegister || []) {
        const key = r.risk.trim().toLowerCase().slice(0, 80);
        if (!key) continue;
        if (!riskMap[key]) riskMap[key] = { count: 0, mitigated: 0, unmitigated: 0, lostWhenMitigated: 0, totalOutcomed: 0 };
        riskMap[key].count++;
        if (r.mitigationStatus === "Mitigated" || r.mitigationStatus === "Partially Mitigated") {
          riskMap[key].mitigated++;
          riskMap[key].totalOutcomed++;
          if (l.stage === "Lost" || l.stage === "Closed Lost") riskMap[key].lostWhenMitigated++;
        } else {
          riskMap[key].unmitigated++;
        }
      }
      // From meeting deal signals
      for (const m of l.meetings || []) {
        for (const rf of m.intelligence?.dealSignals?.riskFactors || []) {
          const key = rf.trim().toLowerCase().slice(0, 80);
          if (!key || riskMap[key]) continue; // avoid double-counting
          riskMap[key] = { count: 1, mitigated: 0, unmitigated: 1, lostWhenMitigated: 0, totalOutcomed: 0 };
        }
        for (const obj of m.intelligence?.dealSignals?.objections || []) {
          const key = obj.trim().toLowerCase().slice(0, 80);
          if (!key) continue;
          if (!riskMap[key]) riskMap[key] = { count: 0, mitigated: 0, unmitigated: 0, lostWhenMitigated: 0, totalOutcomed: 0 };
          riskMap[key].count++;
        }
      }
    }

    return Object.entries(riskMap)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 12)
      .map(([text, d]) => ({
        text: text.charAt(0).toUpperCase() + text.slice(1),
        count: d.count,
        mitigatedPct: d.count > 0 ? Math.round((d.mitigated / d.count) * 100) : 0,
        fatalPct: d.totalOutcomed > 0 ? Math.round((d.lostWhenMitigated / d.totalOutcomed) * 100) : null,
      }));
  }, [lostLeads]);

  // Block 5: Dropped Ball Tracker
  const droppedBalls = useMemo(() => {
    const itemMap: Record<string, { count: number; owners: Record<string, number> }> = {};
    const ownerMap: Record<string, number> = {};

    for (const l of lostLeads) {
      const di = l.dealIntelligence;
      for (const ai of di?.actionItemTracker || []) {
        if (ai.status !== "Dropped" && ai.status !== "Overdue") continue;
        const key = ai.item.trim().toLowerCase().slice(0, 80);
        if (!key) continue;
        if (!itemMap[key]) itemMap[key] = { count: 0, owners: {} };
        itemMap[key].count++;
        const owner = ai.owner || "Unassigned";
        itemMap[key].owners[owner] = (itemMap[key].owners[owner] || 0) + 1;
        ownerMap[owner] = (ownerMap[owner] || 0) + 1;
      }
    }

    const items = Object.entries(itemMap)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 8)
      .map(([text, d]) => ({
        text: text.charAt(0).toUpperCase() + text.slice(1),
        count: d.count,
        topOwner: Object.entries(d.owners).sort(([, a], [, b]) => b - a)[0]?.[0] || "—",
      }));

    const owners = Object.entries(ownerMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return { items, owners, total: Object.values(ownerMap).reduce((s, v) => s + v, 0) };
  }, [lostLeads]);

  // Block 6: Re-engagement Opportunities (enhanced)
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
      .map(l => {
        const synth = synthesizeLossReason(l);
        const icpWeight = l.icpFit === "Strong" ? 3 : l.icpFit === "Moderate" ? 2 : 1;
        const cd = parseDate(l.closedDate) || parseDate(l.stageEnteredDate);
        const daysAgo = cd ? daysBetween(cd, new Date()) : 90;
        const recencyScore = Math.max(0, 90 - daysAgo);
        const compositeScore = icpWeight * 1000 + l.dealValue + recencyScore * 10;
        return { lead: l, synthesized: synth, angle: getReengageAngle(l, synth), daysAgo, compositeScore };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 8);
  }, [darkLeads, leads]);

  if (lostLeads.length === 0) return null;

  const fmt$ = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;
  const maxSynth = Math.max(...synthesizedReasons.map(p => p.count), 1);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Loss & Competitive Intelligence</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Block 1: Synthesized Loss Reasons */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Synthesized Loss Reasons <span className="text-[10px] font-normal ml-1">({lostLeads.length} deals)</span>
          </p>
          <div className="space-y-1.5">
            {synthesizedReasons.map((p) => (
              <div
                key={p.reason}
                className="cursor-pointer hover:bg-secondary/20 rounded px-1 -mx-1 transition-colors"
                onClick={() => onDrillDown?.(`Loss: ${p.reason}`, p.leads)}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate max-w-[160px]">{p.reason}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{p.count}</span>
                    <span className="text-muted-foreground tabular-nums w-8 text-right">{p.pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-secondary/50 rounded mt-0.5">
                  <div className="h-full bg-destructive/40 rounded" style={{ width: `${(p.count / maxSynth) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 pt-1 border-t border-border">
            Derived from transcripts, risk registers, objections & momentum signals
          </p>
        </div>

        {/* Block 2: Deal Autopsy Cards */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Deal Autopsy — Top Losses</p>
          {autopsyCards.length > 0 ? (
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto">
              {autopsyCards.map((c) => {
                const discrepancy = c.repReason !== c.synthesized && c.repReason !== "Not stated";
                return (
                  <div
                    key={c.lead.id}
                    className="border border-border/60 rounded-md px-3 py-2 cursor-pointer hover:bg-secondary/20 transition-colors"
                    onClick={() => onDrillDown?.(`Autopsy: ${c.lead.name}`, [c.lead])}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{c.lead.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{c.lead.company}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-xs font-medium tabular-nums">{fmt$(c.lead.dealValue)}</p>
                        {c.daysInPipeline !== null && <p className="text-[10px] text-muted-foreground">{c.daysInPipeline}d in pipe</p>}
                      </div>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">Rep said: </span>
                        <span className={discrepancy ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>{c.repReason}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Likely: </span>
                        <span className="font-medium">{c.synthesized}</span>
                      </div>
                    </div>
                    <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                      <span>Sentiment: {c.lastSentiment}</span>
                      <span>Engage: {c.lastEngagement}</span>
                      {c.blockerName && <span className="text-destructive">Blocker: {c.blockerName}</span>}
                    </div>
                    {c.keyIssue !== "—" && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">⚠ {c.keyIssue}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No lost deals with meeting/deal intelligence data</p>
          )}
        </div>

        {/* Block 3: Engagement Decay Signals */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Engagement Decay Signals <span className="text-[10px] font-normal ml-1">({darkLeads.length} went dark)</span>
          </p>
          {darkLeads.length > 0 ? (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[52px_1fr_56px_56px_56px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                <span>Window</span>
                <span>Dist</span>
                <span className="text-right">Sentmnt</span>
                <span className="text-right">Engage</span>
                <span className="text-right">Momntm</span>
              </div>
              {engagementDecay.buckets.map((b) => {
                const maxB = Math.max(...engagementDecay.buckets.map(x => x.count), 1);
                return (
                  <div
                    key={b.label}
                    className="grid grid-cols-[52px_1fr_56px_56px_56px] gap-1 items-center text-xs cursor-pointer hover:bg-secondary/20 rounded px-1 -mx-1 transition-colors"
                    onClick={() => onDrillDown?.(`Went Dark (${b.label})`, b.leads)}
                  >
                    <span className="font-medium text-[11px]">{b.label}</span>
                    <div className="h-3.5 bg-secondary/50 rounded overflow-hidden flex items-center">
                      <div className="h-full bg-foreground/20 rounded" style={{ width: `${(b.count / maxB) * 100}%` }} />
                      <span className="text-[9px] ml-1 tabular-nums">{b.count}</span>
                    </div>
                    <span className="text-right text-[10px] truncate">{b.dominantSentiment}</span>
                    <span className="text-right text-[10px] truncate">{b.dominantEngagement}</span>
                    <span className="text-right text-[10px] truncate">{b.dominantMomentum}</span>
                  </div>
                );
              })}
              <div className="text-[10px] text-muted-foreground mt-2 pt-1 border-t border-border space-y-0.5">
                <p>{engagementDecay.declineRate}% showed declining engagement before going dark</p>
                <p>Avg {engagementDecay.avgMeetings} meetings before dark · {engagementDecay.stalledRate}% had stalled momentum</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No went-dark leads</p>
          )}
        </div>

        {/* Block 4: Risk Factor Frequency Map */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Risk Factor Frequency Map</p>
          {riskData.length > 0 ? (
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_30px_40px_40px] gap-1 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                <span>Risk / Objection</span>
                <span className="text-right">#</span>
                <span className="text-right">Mitig</span>
                <span className="text-right">Fatal</span>
              </div>
              {riskData.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_30px_40px_40px] gap-1 text-xs py-1 border-b border-border/50">
                  <span className="truncate" title={r.text}>{r.text}</span>
                  <span className="text-right tabular-nums">{r.count}</span>
                  <span className={`text-right tabular-nums ${r.mitigatedPct >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{r.mitigatedPct}%</span>
                  <span className={`text-right tabular-nums ${r.fatalPct !== null && r.fatalPct >= 50 ? "text-destructive" : "text-muted-foreground"}`}>
                    {r.fatalPct !== null ? `${r.fatalPct}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No risk/objection data from deal intelligence</p>
          )}
        </div>

        {/* Block 5: Dropped Ball Tracker */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Dropped Ball Tracker {droppedBalls.total > 0 && <span className="text-[10px] font-normal ml-1">({droppedBalls.total} dropped/overdue)</span>}
          </p>
          {droppedBalls.items.length > 0 ? (
            <div className="space-y-3">
              <div className="space-y-1">
                {droppedBalls.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[200px]" title={item.text}>{item.text}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-muted-foreground">{item.topOwner}</span>
                      <span className="tabular-nums text-destructive font-medium">{item.count}×</span>
                    </div>
                  </div>
                ))}
              </div>
              {droppedBalls.owners.length > 0 && (
                <div className="pt-1.5 border-t border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">By Owner</p>
                  <div className="flex flex-wrap gap-2">
                    {droppedBalls.owners.map((o) => (
                      <span key={o.name} className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                        {o.name}: {o.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No dropped/overdue action items found across lost deals</p>
          )}
        </div>

        {/* Block 6: Re-engagement Opportunities */}
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Re-engagement Opportunities
            {reengagement.length > 0 && <span className="text-[10px] font-normal ml-1">({reengagement.length} high-value)</span>}
          </p>
          {reengagement.length > 0 ? (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {reengagement.map((r) => (
                <div
                  key={r.lead.id}
                  className="cursor-pointer hover:bg-secondary/20 rounded px-2 py-1.5 -mx-1 transition-colors"
                  onClick={() => onDrillDown?.("Re-engagement Candidates", reengagement.map(x => x.lead))}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.lead.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.lead.company} · {r.lead.icpFit} fit{r.lead.tier ? ` · T${r.lead.tier}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="tabular-nums font-medium">{fmt$(r.lead.dealValue)}</p>
                      <p className="text-[10px] text-muted-foreground">{r.daysAgo}d ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{r.synthesized}</span>
                    <span className="text-[10px] text-muted-foreground italic">{r.angle}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No high-value re-engagement candidates in the last 90 days</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper: find most common value in an array
function mode(arr: string[]): string {
  const counts: Record<string, number> = {};
  for (const v of arr) {
    if (v === "—") continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] || "—";
}
