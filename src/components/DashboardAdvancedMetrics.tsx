import { useMemo } from "react";
import { Lead, LeadSource, LeadStage } from "@/types/lead";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { normalizeStage, isClosedStage, ACTIVE_STAGES } from "@/lib/leadUtils";

const SOURCE_LABELS: Record<LeadSource, string> = {
  "CT Contact Form": "CT Contact",
  "CT Free Targets Form": "CT Targets",
  "SC Intro Call Form": "SC Intro",
  "SC Free Targets Form": "SC Targets",
};

// v2 stage weights — normalizeStage ensures legacy DB rows resolve correctly.
const STAGE_WEIGHTS: Record<string, number> = {
  "Unassigned": 0.05, "In Contact": 0.15, "Discovery Scheduled": 0.30,
  "Discovery Completed": 0.40, "Sample Sent": 0.50, "Proposal Sent": 0.65, "Negotiating": 0.85,
};

const isWonStage = (s: string) => normalizeStage(s) === "Closed Won";
const isLostStage = (s: string) => normalizeStage(s) === "Closed Lost";
// Shim for legacy `.has(stage)` callsites that still use CLOSED_STAGES.
const CLOSED_STAGES = { has: (s: string) => isClosedStage(s as any) };

interface Props {
  leads: Lead[];
  onSelectLead?: (id: string) => void;
  section: "pipeline" | "team";
  onDrillDown?: (title: string, leads: Lead[]) => void;
}

export function DashboardAdvancedMetrics({ leads, onSelectLead, section, onDrillDown }: Props) {
  const data = useMemo(() => {
    const owners = ["Malik", "Valeria", "Tomos", ""] as const;

    // ─── Sales Velocity ───
    const activeDeals = leads.filter(l => !CLOSED_STAGES.has(l.stage));
    const wonLeads = leads.filter(l => l.stage === "Closed Won");
    const lostLeads = leads.filter(l => l.stage === "Lost");
    const totalClosed = wonLeads.length + lostLeads.length;
    const winRate = totalClosed > 0 ? wonLeads.length / totalClosed : 0;
    const avgDealValue = activeDeals.length > 0
      ? activeDeals.reduce((s, l) => s + l.dealValue, 0) / (activeDeals.filter(l => l.dealValue > 0).length || 1)
      : 0;
    const wonWithCycle = wonLeads.filter(l => l.dateSubmitted && l.closedDate);
    const avgSalesCycleDays = wonWithCycle.length > 0
      ? wonWithCycle.reduce((s, l) => s + Math.max(1, Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000)), 0) / wonWithCycle.length
      : 30;
    const salesVelocity = avgSalesCycleDays > 0
      ? Math.round((activeDeals.length * avgDealValue * winRate) / avgSalesCycleDays)
      : 0;

    // ─── Weighted Pipeline ───
    const rawPipeline = activeDeals.reduce((s, l) => s + l.dealValue, 0);
    const weightedPipeline = activeDeals.reduce((s, l) => s + l.dealValue * (STAGE_WEIGHTS[l.stage] || 0), 0);

    // ─── Win/Loss Analysis ───
    const closeReasonCounts: Record<string, number> = {};
    for (const l of lostLeads) {
      if (l.closeReason) closeReasonCounts[l.closeReason] = (closeReasonCounts[l.closeReason] || 0) + 1;
    }
    const closeReasonData = Object.entries(closeReasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    const avgCycleWon = wonWithCycle.length > 0
      ? Math.round(wonWithCycle.reduce((s, l) => s + Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000), 0) / wonWithCycle.length)
      : 0;
    const lostWithCycle = lostLeads.filter(l => l.dateSubmitted && l.closedDate);
    const avgCycleLost = lostWithCycle.length > 0
      ? Math.round(lostWithCycle.reduce((s, l) => s + Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000), 0) / lostWithCycle.length)
      : 0;

    // Win rate by source
    const winRateBySource = (["CT Contact Form", "CT Free Targets Form", "SC Intro Call Form", "SC Free Targets Form"] as LeadSource[]).map(source => {
      const srcLeads = leads.filter(l => l.source === source);
      const srcWon = srcLeads.filter(l => l.stage === "Closed Won");
      const srcClosed = srcLeads.filter(l => CLOSED_STAGES.has(l.stage)).length;
      return {
        source: SOURCE_LABELS[source],
        winRate: srcClosed > 0 ? Math.round((srcWon.length / srcClosed) * 100) : 0,
        won: srcWon.length,
        total: srcLeads.length,
      };
    });

    // ─── Rep Performance Scorecard ───
    const repScorecard = owners.map(owner => {
      const ownerLeads = leads.filter(l => l.assignedTo === owner);
      const ownerWon = ownerLeads.filter(l => l.stage === "Closed Won");
      const ownerLost = ownerLeads.filter(l => l.stage === "Lost");
      const ownerClosed = ownerWon.length + ownerLost.length;
      const ownerActive = ownerLeads.filter(l => !CLOSED_STAGES.has(l.stage));
      const ownerWonWithCycle = ownerWon.filter(l => l.dateSubmitted && l.closedDate);
      return {
        owner: owner || "Unassigned",
        totalDeals: ownerLeads.length,
        activeDeals: ownerActive.length,
        won: ownerWon.length,
        lost: ownerLost.length,
        winRate: ownerClosed > 0 ? Math.round((ownerWon.length / ownerClosed) * 100) : 0,
        avgDealSize: ownerWon.length > 0 ? Math.round(ownerWon.reduce((s, l) => s + l.dealValue, 0) / ownerWon.length) : 0,
        avgCycleDays: ownerWonWithCycle.length > 0 ? Math.round(ownerWonWithCycle.reduce((s, l) => s + Math.floor((new Date(l.closedDate).getTime() - new Date(l.dateSubmitted).getTime()) / 86400000), 0) / ownerWonWithCycle.length) : 0,
        pipelineValue: ownerActive.reduce((s, l) => s + l.dealValue, 0),
      };
    });

    // ─── Lead Source ROI ───
    const sourceROI = (["CT Contact Form", "CT Free Targets Form", "SC Intro Call Form", "SC Free Targets Form"] as LeadSource[]).map(source => {
      const srcLeads = leads.filter(l => l.source === source);
      const srcWon = srcLeads.filter(l => l.stage === "Closed Won");
      const srcActive = srcLeads.filter(l => !CLOSED_STAGES.has(l.stage));
      return {
        source: SOURCE_LABELS[source],
        leadCount: srcLeads.length,
        pipelineValue: srcActive.reduce((s, l) => s + l.dealValue, 0),
        wonCount: srcWon.length,
        wonValue: srcWon.reduce((s, l) => s + l.dealValue, 0),
        avgDealSize: srcWon.length > 0 ? Math.round(srcWon.reduce((s, l) => s + l.dealValue, 0) / srcWon.length) : 0,
        conversionRate: srcLeads.length > 0 ? Math.round((srcWon.length / srcLeads.length) * 100) : 0,
      };
    });

    // ─── Coaching Insights ───
    const repCoaching = owners.filter(o => o !== "").map(owner => {
      const ownerMeetings = leads
        .filter(l => l.assignedTo === owner)
        .flatMap(l => l.meetings || [])
        .filter(m => m.intelligence?.talkRatio);
      const avgTalk = ownerMeetings.length > 0
        ? Math.round(ownerMeetings.reduce((s, m) => s + (m.intelligence?.talkRatio || 0), 0) / ownerMeetings.length)
        : null;
      const qDist = { Strong: 0, Adequate: 0, Weak: 0 };
      const objDist = { Effective: 0, Partial: 0, Missed: 0 };
      for (const m of ownerMeetings) {
        const q = m.intelligence?.questionQuality;
        if (q && q in qDist) qDist[q as keyof typeof qDist]++;
        const o = m.intelligence?.objectionHandling;
        if (o && o in objDist) objDist[o as keyof typeof objDist]++;
      }
      const totalQ = qDist.Strong + qDist.Adequate + qDist.Weak;
      const weakPct = totalQ > 0 ? Math.round((qDist.Weak / totalQ) * 100) : 0;
      const needsCoaching = (avgTalk !== null && avgTalk > 60) || weakPct > 50;
      return {
        owner: owner as string,
        meetingCount: ownerMeetings.length,
        avgTalkRatio: avgTalk,
        questionQuality: qDist,
        objectionHandling: objDist,
        weakPct,
        needsCoaching,
      };
    });

    // ─── Contract Renewals ───
    const now = new Date();
    const renewals30 = wonLeads.filter(l => {
      if (!l.contractEnd) return false;
      const end = new Date(l.contractEnd);
      return end >= now && end <= new Date(now.getTime() + 30 * 86400000);
    });
    const renewals60 = wonLeads.filter(l => {
      if (!l.contractEnd) return false;
      const end = new Date(l.contractEnd);
      return end > new Date(now.getTime() + 30 * 86400000) && end <= new Date(now.getTime() + 60 * 86400000);
    });
    const renewals90 = wonLeads.filter(l => {
      if (!l.contractEnd) return false;
      const end = new Date(l.contractEnd);
      return end > new Date(now.getTime() + 60 * 86400000) && end <= new Date(now.getTime() + 90 * 86400000);
    });

    // ─── Rep Pipeline Distribution ───
    const repPipelineDist = owners.filter(o => o !== "").map(owner => {
      const ownerActive = leads.filter(l => l.assignedTo === owner && !CLOSED_STAGES.has(l.stage));
      const stageCounts = ACTIVE_STAGES.map(s => ({
        stage: s,
        count: ownerActive.filter(l => normalizeStage(l.stage) === s).length,
      }));
      return { owner: owner as string, total: ownerActive.length, stages: stageCounts };
    });

    return {
      salesVelocity, avgDealValue: Math.round(avgDealValue), winRate: Math.round(winRate * 100),
      avgSalesCycleDays: Math.round(avgSalesCycleDays), activeDealsCount: activeDeals.length,
      rawPipeline, weightedPipeline: Math.round(weightedPipeline),
      closeReasonData, avgCycleWon, avgCycleLost, winRateBySource,
      wonCount: wonLeads.length, lostCount: lostLeads.length,
      repScorecard, sourceROI, repCoaching, repPipelineDist,
      renewals30, renewals60, renewals90,
    };
  }, [leads]);

  if (section === "team") {
    return (
      <div className="space-y-6">
        {/* Rep Performance Scorecard */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Rep Performance Scorecard</h2>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Rep</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pipeline $</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Won</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Lost</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Win %</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Deal</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Cycle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.repScorecard.map(r => (
                  <tr
                    key={r.owner}
                    className="hover:bg-secondary/30 transition-colors cursor-pointer"
                    onClick={() => onDrillDown?.(
                      `${r.owner} Deals`,
                      leads.filter(l => (r.owner === "Unassigned" ? !l.assignedTo : l.assignedTo === r.owner))
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                      {r.owner !== "Unassigned" ? (
                        <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">{r.owner[0]}</span>
                      ) : (
                        <span className="w-6 h-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center text-[10px] text-muted-foreground/50 shrink-0">?</span>
                      )}
                      {r.owner}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.activeDeals}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">${r.pipelineValue.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{r.won}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{r.lost}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.winRate > 0 ? `${r.winRate}%` : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.avgDealSize > 0 ? `$${r.avgDealSize.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.avgCycleDays > 0 ? `${r.avgCycleDays}d` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coaching Insights */}
        {data.repCoaching.some(r => r.meetingCount > 0) && (
          <div>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Coaching Insights</h2>
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Rep</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Meetings</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Talk Ratio</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Q Quality</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Objections</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.repCoaching.map(r => (
                    <tr key={r.owner} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">{r.owner[0]}</span>
                        {r.owner}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.meetingCount}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${r.avgTalkRatio && r.avgTalkRatio > 60 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                        {r.avgTalkRatio !== null ? `${r.avgTalkRatio}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs">{r.questionQuality.Strong}S / {r.questionQuality.Adequate}A / {r.questionQuality.Weak}W</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs">{r.objectionHandling.Effective}E / {r.objectionHandling.Partial}P / {r.objectionHandling.Missed}M</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.needsCoaching && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Needs coaching</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Rep Pipeline Distribution */}
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Rep Pipeline Distribution</h2>
          <div className="border border-border rounded-md overflow-hidden">
            {data.repPipelineDist.map(rep => (
              <div key={rep.owner} className="px-4 py-3 border-b border-border last:border-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">{rep.owner[0]}</span>
                    <span className="text-sm font-medium">{rep.owner}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{rep.total} active</span>
                </div>
                <div className="flex h-3 rounded overflow-hidden bg-secondary/30">
                  {rep.stages.map((s, i) => s.count > 0 && (
                    <div
                      key={s.stage}
                      className="h-full transition-all"
                      style={{
                        width: `${(s.count / Math.max(rep.total, 1)) * 100}%`,
                        opacity: 0.2 + (i / rep.stages.length) * 0.8,
                        backgroundColor: "hsl(var(--foreground))",
                      }}
                      title={`${s.stage}: ${s.count}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {rep.stages.filter(s => s.count > 0).map(s => (
                    <span key={s.stage} className="text-[10px] text-muted-foreground tabular-nums">
                      {s.stage.split(" ").map(w => w[0]).join("")}:{s.count}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // section === "pipeline"
  return (
    <div className="space-y-6">
      {/* Sales Velocity + Weighted Pipeline */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-border border-t-2 border-t-foreground rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Sales Velocity</p>
          <p className="text-2xl font-bold tabular-nums mt-1">${data.salesVelocity.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/day</span></p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span>{data.activeDealsCount} active deals</span>
            <span>×</span>
            <span>${data.avgDealValue.toLocaleString()} avg</span>
            <span>×</span>
            <span>{data.winRate}% win rate</span>
            <span>÷</span>
            <span>{data.avgSalesCycleDays}d cycle</span>
          </div>
        </div>
        <div className="border border-border border-t-2 border-t-foreground rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Weighted Pipeline Forecast</p>
          <p className="text-2xl font-bold tabular-nums mt-1">${data.weightedPipeline.toLocaleString()}</p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span>Raw: ${data.rawPipeline.toLocaleString()}</span>
            <span>·</span>
            <span>Weighted applies stage probabilities (5%→90%)</span>
          </div>
          <div className="flex gap-1 mt-2">
            {Object.entries(STAGE_WEIGHTS).map(([stage, weight]) => (
              <span key={stage} className="text-[10px] text-muted-foreground/60 px-1 py-0.5 bg-secondary/50 rounded">
                {stage.split(" ").map(w => w[0]).join("")}:{Math.round(weight * 100)}%
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Win/Loss Analysis + Win Rate by Source */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Win/Loss Analysis</h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="border border-border rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground">Won</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{data.wonCount}</p>
              <p className="text-xs text-muted-foreground">{data.avgCycleWon}d avg cycle</p>
            </div>
            <div className="border border-border rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground">Lost</p>
              <p className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">{data.lostCount}</p>
              <p className="text-xs text-muted-foreground">{data.avgCycleLost}d avg cycle</p>
            </div>
            <div className="border border-border rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-lg font-semibold tabular-nums">{data.winRate}%</p>
              <p className="text-xs text-muted-foreground">of closed deals</p>
            </div>
          </div>
          {data.closeReasonData.length > 0 ? (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Close Reasons (Lost Deals)</p>
              <div className="border border-border rounded-lg p-4">
                <ResponsiveContainer width="100%" height={Math.max(120, data.closeReasonData.length * 28)}>
                  <BarChart data={data.closeReasonData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
                    <YAxis dataKey="reason" type="category" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" width={80} />
                    <Tooltip contentStyle={{ fontSize: 12, border: "1px solid hsl(0,0%,85%)", borderRadius: 6 }} />
                    <Bar dataKey="count" fill="hsl(0,0%,35%)" radius={[0, 4, 4, 0]} name="Deals Lost" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="border border-border rounded-md px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No lost deals with close reasons yet</p>
            </div>
          )}
        </div>

        {/* Win Rate by Source */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Win Rate by Source</h2>
          <div className="border border-border rounded-md divide-y divide-border">
            {data.winRateBySource.map(s => (
              <div key={s.source} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium">{s.source}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground tabular-nums">{s.won}/{s.total} closed</span>
                  <div className="w-20 h-3 bg-secondary/50 rounded overflow-hidden">
                    <div className="h-full bg-foreground/25 rounded" style={{ width: `${s.winRate}%` }} />
                  </div>
                  <span className="tabular-nums font-semibold w-10 text-right">{s.winRate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lead Source ROI */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Lead Source ROI</h2>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Leads</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pipeline $</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Won</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Won $</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Deal</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Conv %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.sourceROI.map(s => (
                <tr key={s.source} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{s.source}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.leadCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">${s.pipelineValue.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{s.wonCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">${s.wonValue.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{s.avgDealSize > 0 ? `$${s.avgDealSize.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{s.conversionRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract Renewals */}
      {(data.renewals30.length > 0 || data.renewals60.length > 0 || data.renewals90.length > 0) && (
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Contract Renewals
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Next 30 Days", items: data.renewals30, urgent: true },
              { label: "30–60 Days", items: data.renewals60, urgent: false },
              { label: "60–90 Days", items: data.renewals90, urgent: false },
            ].map(bucket => (
              <div key={bucket.label} className={`border rounded-lg px-4 py-3 ${bucket.urgent && bucket.items.length > 0 ? "border-foreground/40 border-l-2 border-l-foreground" : "border-border"}`}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{bucket.label}</p>
                <p className="text-lg font-semibold tabular-nums mt-1">{bucket.items.length}</p>
                {bucket.items.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ${bucket.items.reduce((s, l) => s + (l.subscriptionValue || 0), 0).toLocaleString()} at risk
                  </p>
                )}
                <div className="mt-2 space-y-1 max-h-[100px] overflow-y-auto">
                  {bucket.items.map(l => (
                    <p
                      key={l.id}
                      onClick={() => onSelectLead?.(l.id)}
                      className="text-xs text-muted-foreground cursor-pointer hover:text-foreground truncate"
                    >
                      {l.name} · {l.company} · {l.contractEnd}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
