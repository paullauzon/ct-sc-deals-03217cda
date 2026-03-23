import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead, LeadSource, Brand } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { LeadDetail } from "@/components/LeadsTable";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { DashboardAdvancedMetrics } from "@/components/DashboardAdvancedMetrics";
import { DashboardPersonaMetrics } from "@/components/DashboardPersonaMetrics";
import { PipelineSnapshots } from "@/components/PipelineSnapshots";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend,
} from "recharts";

const SOURCE_LABELS: Record<LeadSource, string> = {
  "CT Contact Form": "CT Contact",
  "CT Free Targets Form": "CT Targets",
  "SC Intro Call Form": "SC Intro",
  "SC Free Targets Form": "SC Targets",
};

const ACTIVE_STAGES = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"] as const;

const ALL_SERVICES = ["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "SourceCo Retained Search", "Other", "TBD"] as const;

export function Dashboard() {
  const { getMetrics, leads } = useLeads();
  const m = getMetrics();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const analytics = useMemo(() => {
    const now = new Date("2026-03-03");
    const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 86400000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 86400000);

    const leadsThisWeek = leads.filter((l) => new Date(l.dateSubmitted) >= oneWeekAgo).length;
    const leadsThisMonth = leads.filter((l) => new Date(l.dateSubmitted) >= oneMonthAgo).length;
    const leadsLastMonth = leads.filter((l) => {
      const d = new Date(l.dateSubmitted);
      return d >= twoMonthsAgo && d < oneMonthAgo;
    }).length;
    const momGrowth = leadsLastMonth > 0 ? Math.round(((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100) : 0;

    const ctLeads = leads.filter((l) => l.brand === "Captarget");
    const scLeads = leads.filter((l) => l.brand === "SourceCo");

    // Weekly volume (last 16 weeks) with cumulative
    const weeklyData: { week: string; CT: number; SC: number; total: number; cumulative: number }[] = [];
    let cumulative = 0;
    for (let i = 15; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 86400000);
      const weekEnd = new Date(now.getTime() - i * 7 * 86400000);
      const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      const ct = leads.filter((l) => l.brand === "Captarget" && new Date(l.dateSubmitted) >= weekStart && new Date(l.dateSubmitted) < weekEnd).length;
      const sc = leads.filter((l) => l.brand === "SourceCo" && new Date(l.dateSubmitted) >= weekStart && new Date(l.dateSubmitted) < weekEnd).length;
      cumulative += ct + sc;
      weeklyData.push({ week: label, CT: ct, SC: sc, total: ct + sc, cumulative });
    }

    // Source breakdown
    const sourceBreakdown = (["CT Contact Form", "CT Free Targets Form", "SC Intro Call Form", "SC Free Targets Form"] as LeadSource[]).map((s) => ({
      source: SOURCE_LABELS[s],
      count: leads.filter((l) => l.source === s).length,
    }));

    // Role distribution
    const roleMap = new Map<string, number>();
    for (const l of leads) {
      const role = l.role || "Unknown";
      roleMap.set(role, (roleMap.get(role) || 0) + 1);
    }
    const roleData = Array.from(roleMap.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // Company leaderboard
    const companyMap = new Map<string, { count: number; value: number; sources: Set<string> }>();
    for (const l of leads) {
      const co = l.company || "(No Company)";
      if (!companyMap.has(co)) companyMap.set(co, { count: 0, value: 0, sources: new Set() });
      const entry = companyMap.get(co)!;
      entry.count++;
      entry.value += l.dealValue;
      entry.sources.add(l.brand === "Captarget" ? "CT" : "SC");
    }
    const companyLeaderboard = Array.from(companyMap.entries())
      .map(([company, data]) => ({ company, ...data, sources: Array.from(data.sources).join(", ") }))
      .filter((c) => c.company !== "(No Company)")
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Duplicates
    const duplicates = leads.filter((l) => l.isDuplicate);
    const duplicatePairs: { ctLead: Lead; scLead: Lead }[] = [];
    const seen = new Set<string>();
    for (const l of duplicates) {
      const pair = leads.find((o) => o.id === l.duplicateOf);
      if (pair && !seen.has(`${l.email.toLowerCase()}`)) {
        seen.add(l.email.toLowerCase());
        const ct = l.brand === "Captarget" ? l : pair;
        const sc = l.brand === "SourceCo" ? l : pair;
        duplicatePairs.push({ ctLead: ct, scLead: sc });
      }
    }

    // Where heard about us (SC only)
    const hearMap = new Map<string, number>();
    for (const l of scLeads) {
      if (l.hearAboutUs) {
        const key = l.hearAboutUs.toLowerCase().trim();
        const normalized = key.includes("google") ? "Google" :
          key.includes("linkedin") ? "LinkedIn" :
          key.includes("chatgpt") || key.includes("gpt") || key.includes("copilot") ? "ChatGPT/GPT" :
          key.includes("grok") ? "Grok" :
          key.includes("perplexity") ? "Perplexity" :
          key.includes("twitter") || key.includes("x.com") ? "Twitter/X" :
          key.includes("referral") || key.includes("friend") || key.includes("word of mouth") ? "Referral" :
          key.includes("tomos") ? "Tomos (team)" :
          l.hearAboutUs;
        hearMap.set(normalized, (hearMap.get(normalized) || 0) + 1);
      }
    }
    const hearData = Array.from(hearMap.entries())
      .map(([channel, count]) => ({ channel, count, pct: Math.round((count / scLeads.length) * 100) }))
      .sort((a, b) => b.count - a.count);

    // Service Interest (all brands)
    const serviceData = ALL_SERVICES.map((s) => ({
      label: s, count: leads.filter((l) => l.serviceInterest === s).length,
    })).filter((s) => s.count > 0);

    // Service Interest by Brand
    const serviceByBrand = ALL_SERVICES.map((s) => ({
      service: s === "Off-Market Email Origination" ? "Email Orig." :
        s === "Banker/Broker Coverage" ? "Banker/Broker" :
        s === "Full Platform (All 3)" ? "Full Platform" :
        s === "SourceCo Retained Search" ? "SC Retained" :
        s,
      CT: ctLeads.filter((l) => l.serviceInterest === s).length,
      SC: scLeads.filter((l) => l.serviceInterest === s).length,
    })).filter((s) => s.CT > 0 || s.SC > 0);

    // Deals planned
    const dealsMap = new Map<string, number>();
    for (const l of leads) {
      if (l.dealsPlanned) dealsMap.set(l.dealsPlanned, (dealsMap.get(l.dealsPlanned) || 0) + 1);
    }
    const dealsData = Array.from(dealsMap.entries())
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => b.count - a.count);

    // Day of week
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayOfWeek = dayNames.map((day, i) => ({
      day,
      count: leads.filter((l) => new Date(l.dateSubmitted).getDay() === i).length,
    }));

    // Pipeline funnel
    const stageFunnel = ACTIVE_STAGES.map((stage) => ({
      label: stage,
      count: m.stageValues[stage]?.count || 0,
      value: m.stageValues[stage]?.value || 0,
    }));
    const maxStageCount = Math.max(...stageFunnel.map((s) => s.count), 1);

    // Conversion funnel by brand
    const conversionByBrand = ACTIVE_STAGES.map((stage) => ({
      stage,
      CT: ctLeads.filter((l) => l.stage === stage).length,
      SC: scLeads.filter((l) => l.stage === stage).length,
    }));

    // Lead Velocity Rate: qualified leads per week (last 4 weeks vs prior 4 weeks)
    const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);
    const eightWeeksAgo = new Date(now.getTime() - 56 * 86400000);
    const qualifiedStages = new Set(["Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won"]);
    const qualifiedRecent = leads.filter((l) => new Date(l.dateSubmitted) >= fourWeeksAgo && qualifiedStages.has(l.stage)).length;
    const qualifiedPrior = leads.filter((l) => {
      const d = new Date(l.dateSubmitted);
      return d >= eightWeeksAgo && d < fourWeeksAgo && qualifiedStages.has(l.stage);
    }).length;
    const lvrCurrent = Math.round(qualifiedRecent / 4 * 10) / 10;
    const lvrPrior = Math.round(qualifiedPrior / 4 * 10) / 10;
    const lvrChange = lvrPrior > 0 ? Math.round(((lvrCurrent - lvrPrior) / lvrPrior) * 100) : 0;

    // Stale leads (>14 days in stage, excluding closed)
    const closedStages = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
    const staleLeads = leads
      .filter((l) => !closedStages.has(l.stage) && computeDaysInStage(l.stageEnteredDate) > 14)
      .sort((a, b) => computeDaysInStage(b.stageEnteredDate) - computeDaysInStage(a.stageEnteredDate));

    // Priority distribution
    const priorityData = (["High", "Medium", "Low"] as const).map((p) => ({
      priority: p,
      count: leads.filter((l) => l.priority === p && !closedStages.has(l.stage)).length,
    }));

    // Forecast summary
    const forecastData = (["Commit", "Best Case", "Pipeline", "Omit"] as const).map((cat) => {
      const inCat = leads.filter((l) => l.forecastCategory === cat);
      return { category: cat, count: inCat.length, value: inCat.reduce((s, l) => s + l.dealValue, 0) };
    }).filter((f) => f.count > 0);

    // Owner breakdown
    const owners = ["Malik", "Valeria", "Tomos", ""] as const;
    const ownerData = owners.map((owner) => {
      const owned = leads.filter((l) => l.assignedTo === owner && !closedStages.has(l.stage));
      return {
        owner: owner || "Unassigned",
        count: owned.length,
        value: owned.reduce((s, l) => s + l.dealValue, 0),
        won: leads.filter((l) => l.assignedTo === owner && l.stage === "Closed Won").length,
      };
    });

    // Intelligence metrics
    const closedWonLeads = leads.filter((l) => l.stage === "Closed Won");
    const totalMRR = closedWonLeads.reduce((s, l) => {
      if (!l.subscriptionValue) return s;
      if (l.billingFrequency === "Quarterly") return s + l.subscriptionValue / 3;
      if (l.billingFrequency === "Annually") return s + l.subscriptionValue / 12;
      return s + l.subscriptionValue; // Monthly or default
    }, 0);
    const totalContractValue = closedWonLeads.reduce((s, l) => s + (l.subscriptionValue || 0), 0);

    const leadsWithMeetings = leads.filter((l) => l.meetings?.length > 0).length;
    const leadsWithIntel = leads.filter((l) => l.meetings?.some((m) => m.intelligence)).length;
    const leadsWithDealIntel = leads.filter((l) => l.dealIntelligence).length;

    const momentumDist = { Accelerating: 0, Steady: 0, Stalling: 0, Stalled: 0 };
    for (const l of leads) {
      const mom = l.dealIntelligence?.momentumSignals?.momentum;
      if (mom && mom in momentumDist) momentumDist[mom as keyof typeof momentumDist]++;
    }

    // Coaching aggregates
    const allMeetingsWithCoaching = leads.flatMap((l) => l.meetings || []).filter((m) => m.intelligence?.talkRatio);
    const avgTalkRatio = allMeetingsWithCoaching.length
      ? Math.round(allMeetingsWithCoaching.reduce((s, m) => s + (m.intelligence?.talkRatio || 0), 0) / allMeetingsWithCoaching.length)
      : null;
    const questionQualityDist = { Strong: 0, Adequate: 0, Weak: 0 };
    for (const m of allMeetingsWithCoaching) {
      const q = m.intelligence?.questionQuality;
      if (q && q in questionQualityDist) questionQualityDist[q as keyof typeof questionQualityDist]++;
    }

    // Deal health summary
    const activeLeads = leads.filter((l) => !closedStages.has(l.stage));
    let criticalAlerts = 0;
    let warningAlerts = 0;
    let atRiskRevenue = 0;
    const atRiskLeads: Lead[] = [];
    for (const l of activeLeads) {
      const daysSinceContact = l.lastContactDate ? Math.floor((Date.now() - new Date(l.lastContactDate).getTime()) / 86400000) : 999;
      const overdueItems = l.dealIntelligence?.actionItemTracker?.filter((a) => a.status === "Overdue" || a.status === "Open").length || 0;
      const unmitigatedRisks = l.dealIntelligence?.riskRegister?.filter((r) => r.mitigationStatus === "Unmitigated" && (r.severity === "Critical" || r.severity === "High")).length || 0;
      const momentum = l.dealIntelligence?.momentumSignals?.momentum;
      const isAtRisk = daysSinceContact > 21 || unmitigatedRisks > 0 || momentum === "Stalling" || momentum === "Stalled";
      if (isAtRisk) {
        atRiskRevenue += l.dealValue;
        atRiskLeads.push(l);
      }
      if (daysSinceContact > 21 || unmitigatedRisks > 0) criticalAlerts++;
      else if (daysSinceContact > 14 || overdueItems > 2) warningAlerts++;
    }
    const cleanDeals = activeLeads.length - criticalAlerts - warningAlerts;

    // Stage-to-stage conversion rates
    const stageConversions = ACTIVE_STAGES.slice(0, -1).map((stage, i) => {
      const nextStage = ACTIVE_STAGES[i + 1];
      const inThisOrLater = leads.filter(l => {
        const idx = ACTIVE_STAGES.indexOf(l.stage as any);
        return idx >= i || l.stage === "Closed Won";
      }).length;
      const inNextOrLater = leads.filter(l => {
        const idx = ACTIVE_STAGES.indexOf(l.stage as any);
        return idx >= i + 1 || l.stage === "Closed Won";
      }).length;
      const rate = inThisOrLater > 0 ? Math.round((inNextOrLater / inThisOrLater) * 100) : 0;
      return { from: stage, to: nextStage, rate, fromCount: inThisOrLater, toCount: inNextOrLater };
    });
    const weakestLink = stageConversions.reduce((min, s) => s.rate < min.rate ? s : min, stageConversions[0]);

    // Forecast gap analysis
    const forecastTarget = parseInt(localStorage.getItem("captarget_quarterly_target") || "500000");
    const commitValue = leads.filter(l => l.forecastCategory === "Commit").reduce((s, l) => s + l.dealValue, 0);
    const bestCaseValue = leads.filter(l => l.forecastCategory === "Best Case").reduce((s, l) => s + l.dealValue, 0);
    const pipelineValue = leads.filter(l => l.forecastCategory === "Pipeline").reduce((s, l) => s + l.dealValue, 0);
    const coverageRatio = forecastTarget > 0 ? ((commitValue + bestCaseValue) / forecastTarget) : 0;
    const forecastGap = Math.max(0, forecastTarget - commitValue);

    return {
      leadsThisWeek, leadsThisMonth, momGrowth, lvrCurrent, lvrChange,
      ctLeads, scLeads, weeklyData, sourceBreakdown, roleData,
      companyLeaderboard, duplicates, duplicatePairs, hearData,
      serviceData, serviceByBrand, dealsData, dayOfWeek,
      stageFunnel, maxStageCount, conversionByBrand,
      staleLeads, priorityData, forecastData, ownerData,
      totalMRR, totalContractValue, leadsWithMeetings, leadsWithIntel, leadsWithDealIntel,
      momentumDist, avgTalkRatio, questionQualityDist,
      criticalAlerts, warningAlerts, cleanDeals,
      atRiskRevenue, atRiskLeads, stageConversions, weakestLink,
      forecastTarget, commitValue, bestCaseValue, pipelineValue: pipelineValue, coverageRatio, forecastGap,
    };
  }, [leads, m]);

  const [moreOpen, setMoreOpen] = useState(false);

  const secondaryMetrics = [
    { label: "This Week", value: analytics.leadsThisWeek },
    { label: "This Month", value: analytics.leadsThisMonth },
    { label: "MoM Growth", value: `${analytics.momGrowth > 0 ? "+" : ""}${analytics.momGrowth}%` },
    { label: "LVR / wk", value: analytics.lvrCurrent, sub: analytics.lvrChange !== 0 ? `${analytics.lvrChange > 0 ? "+" : ""}${analytics.lvrChange}%` : undefined },
    { label: "Meetings Set", value: m.meetingsSet },
    { label: "Won / Lost", value: `${m.closedWon} / ${m.closedLost}` },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">{leads.length} leads · Pipeline health & deal intelligence</p>
      </div>

      {/* Row 1: Hero Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: String(m.totalLeads) },
          { label: "Pipeline Value", value: `$${m.totalPipelineValue.toLocaleString()}` },
          { label: "Win Rate", value: `${m.conversionRate}%` },
          { label: "Avg Days to Meeting", value: m.avgDaysToMeeting || "—" },
        ].map((stat) => (
          <div key={stat.label} className="border border-border border-t-2 border-t-foreground rounded-lg px-5 py-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Row 2: Action Strip */}
      <div className="grid grid-cols-6 gap-3">
        {secondaryMetrics.map((stat) => (
          <div key={stat.label} className="border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
              {stat.sub && <span className={`text-xs tabular-nums ${stat.sub.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>{stat.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Row 2b: Intelligence & Revenue Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">MRR (Won)</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">${Math.round(analytics.totalMRR).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">ARR: ${Math.round(analytics.totalMRR * 12).toLocaleString()}</p>
        </div>
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Intelligence Coverage</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-semibold tabular-nums">{analytics.leadsWithMeetings}</p>
            <span className="text-xs text-muted-foreground">w/ meetings</span>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{analytics.leadsWithIntel} processed</span>
            <span>{analytics.leadsWithDealIntel} synthesized</span>
          </div>
        </div>
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Deal Momentum</p>
          <div className="flex items-center gap-2 mt-2">
            {Object.entries(analytics.momentumDist).map(([key, val]) => val > 0 && (
              <span key={key} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {val} {key}
              </span>
            ))}
            {Object.values(analytics.momentumDist).every(v => v === 0) && (
              <span className="text-xs text-muted-foreground">No data yet</span>
            )}
          </div>
        </div>
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Deal Health</p>
          <div className="flex items-center gap-2 mt-2">
            {analytics.criticalAlerts > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-foreground font-medium">
                {analytics.criticalAlerts} critical
              </span>
            )}
            {analytics.warningAlerts > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {analytics.warningAlerts} warning
              </span>
            )}
            {analytics.cleanDeals > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {analytics.cleanDeals} healthy
              </span>
            )}
          </div>
          {analytics.avgTalkRatio !== null && (
            <p className="text-xs text-muted-foreground mt-1">Avg talk ratio: {analytics.avgTalkRatio}%</p>
          )}
        </div>
      </div>

      {/* Pipeline Snapshots + At Risk Revenue + Forecast Gap */}
      <PipelineSnapshots leads={leads} />
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-border border-t-2 border-t-foreground rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Revenue at Risk</p>
          <p className="text-2xl font-bold tabular-nums mt-1">${analytics.atRiskRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{analytics.atRiskLeads.length} deals stalling, dark, or high-risk</p>
          {analytics.atRiskLeads.length > 0 && (
            <div className="mt-2 space-y-1 max-h-[80px] overflow-y-auto">
              {analytics.atRiskLeads.slice(0, 5).map(l => (
                <p key={l.id} onClick={() => setSelectedLeadId(l.id)} className="text-xs text-muted-foreground cursor-pointer hover:text-foreground truncate">
                  {l.name} · ${l.dealValue.toLocaleString()}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="border border-border border-t-2 border-t-foreground rounded-lg px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Forecast vs Target</p>
            <input
              type="number"
              defaultValue={analytics.forecastTarget}
              onBlur={(e) => localStorage.setItem("captarget_quarterly_target", e.target.value)}
              className="w-24 text-xs text-right border border-border rounded px-2 py-1 bg-background tabular-nums"
              title="Edit quarterly target"
            />
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span>Commit</span><span className="tabular-nums font-medium">${analytics.commitValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Best Case</span><span className="tabular-nums">${analytics.bestCaseValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pipeline</span><span className="tabular-nums">${analytics.pipelineValue.toLocaleString()}</span>
            </div>
            <div className="w-full h-3 bg-secondary/50 rounded overflow-hidden mt-1.5">
              <div className="h-full bg-foreground/30 rounded transition-all" style={{ width: `${Math.min(100, (analytics.commitValue / analytics.forecastTarget) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className={analytics.forecastGap > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                Gap: ${analytics.forecastGap.toLocaleString()}
              </span>
              <span className={`tabular-nums ${analytics.coverageRatio < 2 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {analytics.coverageRatio.toFixed(1)}x coverage
              </span>
            </div>
          </div>
        </div>
        <div className="border border-border rounded-lg px-5 py-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Stage Conversion Funnel</p>
          <div className="mt-2 space-y-1">
            {analytics.stageConversions.map(s => (
              <div key={s.from} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-muted-foreground truncate text-right">{s.from.split(" ").map(w => w[0]).join("")}</span>
                <span className="text-muted-foreground">→</span>
                <div className="flex-1 h-2 bg-secondary/50 rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${s === analytics.weakestLink ? "bg-red-400 dark:bg-red-500" : "bg-foreground/25"}`}
                    style={{ width: `${s.rate}%` }}
                  />
                </div>
                <span className={`w-10 text-right tabular-nums font-medium ${s === analytics.weakestLink ? "text-red-600 dark:text-red-400" : ""}`}>{s.rate}%</span>
              </div>
            ))}
          </div>
          {analytics.weakestLink && (
            <p className="text-[10px] text-muted-foreground mt-2">Weakest: {analytics.weakestLink.from} → {analytics.weakestLink.to} ({analytics.weakestLink.rate}%)</p>
          )}
        </div>
      </div>

      {/* Buyer Persona Intelligence */}
      <DashboardPersonaMetrics leads={leads} onSelectLead={setSelectedLeadId} />

      {/* Advanced Metrics: Sales Velocity, Weighted Pipeline, Win/Loss, Rep Scorecard, Source ROI */}
      <DashboardAdvancedMetrics leads={leads} onSelectLead={setSelectedLeadId} />


      {/* More Analytics (Collapsible) */}
      <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <span>{moreOpen ? "▾" : "▸"}</span>
          <span className="uppercase tracking-wider font-medium text-xs">More Analytics</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 mt-4">
          {/* Pipeline Funnel + Owner Workload */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Pipeline Funnel</h2>
              <div className="space-y-2">
                {analytics.stageFunnel.map((s, i) => {
                  const prev = i > 0 ? analytics.stageFunnel[i - 1].count : null;
                  const dropOff = prev && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
                  return (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-28 shrink-0 text-right">{s.label}</span>
                      <div className="flex-1 h-6 bg-secondary/50 rounded overflow-hidden">
                        <div className="h-full bg-foreground/20 rounded transition-all" style={{ width: `${Math.max((s.count / analytics.maxStageCount) * 100, 2)}%` }} />
                      </div>
                      <span className="text-xs tabular-nums w-8 text-right font-medium">{s.count}</span>
                      <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">${s.value.toLocaleString()}</span>
                      {dropOff !== null && dropOff > 0 && (
                        <span className="text-xs text-muted-foreground w-12 text-right">-{dropOff}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Owner Workload</h2>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Owner</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pipeline $</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Won</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analytics.ownerData.map((o) => (
                      <tr key={o.owner}>
                        <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                          {o.owner !== "Unassigned" ? (
                            <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">{o.owner[0]}</span>
                          ) : (
                            <span className="w-6 h-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center text-[10px] text-muted-foreground/50 shrink-0">?</span>
                          )}
                          {o.owner}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{o.count}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">${o.value.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{o.won}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Stale Leads + Forecast */}
          <div className="grid grid-cols-2 gap-6">
            {analytics.staleLeads.length > 0 ? (
              <div>
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Stale Leads <span className="text-xs font-normal ml-1">({analytics.staleLeads.length} stuck &gt;14d)</span>
                </h2>
                <div className="border border-border rounded-md divide-y divide-border max-h-[280px] overflow-y-auto">
                  {analytics.staleLeads.slice(0, 10).map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono px-1 py-0.5 border border-border rounded">{lead.brand === "Captarget" ? "CT" : "SC"}</span>
                        <span className="font-medium">{lead.name}</span>
                        <span className="text-muted-foreground truncate text-xs">{lead.company}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                        <span className="text-xs px-1.5 py-0.5 border border-border rounded">{lead.stage}</span>
                        <span className="text-xs tabular-nums font-medium">{computeDaysInStage(lead.stageEnteredDate)}d</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Stale Leads</h2>
                <div className="border border-border rounded-md px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No stale leads — all deals are moving</p>
                </div>
              </div>
            )}
            <div>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Forecast Summary</h2>
              {analytics.forecastData.length > 0 ? (
                <div className="border border-border rounded-md divide-y divide-border">
                  {analytics.forecastData.map((f) => (
                    <div key={f.category} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="font-medium">{f.category}</span>
                      <div className="flex items-center gap-4">
                        <span className="tabular-nums text-muted-foreground">{f.count} leads</span>
                        <span className="tabular-nums font-semibold">${f.value.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 text-sm bg-secondary/30">
                    <span className="font-medium">Total Forecasted</span>
                    <span className="tabular-nums font-semibold">${analytics.forecastData.reduce((s, f) => s + f.value, 0).toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <div className="border border-border rounded-md px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No forecast categories assigned yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Set forecast categories on individual leads</p>
                </div>
              )}
            </div>
          </div>

          {/* Lead Volume */}
          <div>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Lead Volume (16 weeks)</h2>
            <div className="border border-border rounded-lg p-4">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={analytics.weeklyData}>
                  <defs>
                    <linearGradient id="gradCT" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0,0%,15%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(0,0%,15%)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradSC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0,0%,55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(0,0%,55%)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="hsl(0,0%,75%)" />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid hsl(0,0%,85%)", background: "hsl(0,0%,100%)", borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="left" type="monotone" dataKey="CT" stackId="1" stroke="hsl(0,0%,15%)" fill="url(#gradCT)" strokeWidth={2} name="Captarget" />
                  <Area yAxisId="left" type="monotone" dataKey="SC" stackId="1" stroke="hsl(0,0%,55%)" fill="url(#gradSC)" strokeWidth={2} name="SourceCo" />
                  <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="hsl(0,0%,40%)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Cumulative" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Brand Comparison + Service by Brand */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Brand Comparison</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { brand: "Captarget", data: analytics.ctLeads, abbr: "CT" },
                  { brand: "SourceCo", data: analytics.scLeads, abbr: "SC" },
                ].map(({ brand, data, abbr }) => (
                  <div key={brand} className="border border-border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 border border-border rounded">{abbr}</span>
                      <span className="text-sm font-medium">{brand}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold tabular-nums">{data.length}</p></div>
                      <div><p className="text-xs text-muted-foreground">Pipeline</p><p className="font-semibold tabular-nums">${data.filter((l) => !["Closed Won", "Closed Lost", "Went Dark"].includes(l.stage)).reduce((s, l) => s + l.dealValue, 0).toLocaleString()}</p></div>
                      <div><p className="text-xs text-muted-foreground">Won</p><p className="font-semibold tabular-nums">{data.filter((l) => l.stage === "Closed Won").length}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Service Interest by Brand</h2>
              <div className="border border-border rounded-lg p-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={analytics.serviceByBrand} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
                    <YAxis dataKey="service" type="category" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" width={85} />
                    <Tooltip contentStyle={{ fontSize: 12, border: "1px solid hsl(0,0%,85%)", borderRadius: 6 }} />
                    <Bar dataKey="CT" fill="hsl(0,0%,20%)" radius={[0, 3, 3, 0]} name="Captarget" />
                    <Bar dataKey="SC" fill="hsl(0,0%,65%)" radius={[0, 3, 3, 0]} name="SourceCo" />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          {/* Stage Distribution by Brand */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Stage Distribution by Brand</h2>
            <div className="border border-border rounded-lg p-4">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.conversionByBrand} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
                  <YAxis dataKey="stage" type="category" tick={{ fontSize: 9 }} stroke="hsl(0,0%,60%)" width={85} />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid hsl(0,0%,85%)", borderRadius: 6 }} />
                  <Bar dataKey="CT" fill="hsl(0,0%,20%)" radius={[0, 3, 3, 0]} name="Captarget" />
                  <Bar dataKey="SC" fill="hsl(0,0%,65%)" radius={[0, 3, 3, 0]} name="SourceCo" />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Source + How SC Found Us */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Source Breakdown</h2>
              <div className="border border-border rounded-lg p-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={analytics.sourceBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
                    <YAxis dataKey="source" type="category" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" width={80} />
                    <Tooltip contentStyle={{ fontSize: 12, border: "1px solid hsl(0,0%,85%)", borderRadius: 6 }} />
                    <Bar dataKey="count" fill="hsl(0,0%,25%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {analytics.hearData.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">How SC Leads Found Us</h2>
                <div className="border border-border rounded-lg p-4">
                  <ResponsiveContainer width="100%" height={Math.max(180, analytics.hearData.length * 32)}>
                    <BarChart data={analytics.hearData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" />
                      <YAxis dataKey="channel" type="category" tick={{ fontSize: 10 }} stroke="hsl(0,0%,60%)" width={90} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, border: "1px solid hsl(0,0%,85%)", borderRadius: 6 }}
                        formatter={(value: number, _: string, props: any) => [`${value} (${props.payload.pct}%)`, "Leads"]}
                      />
                      <Bar dataKey="count" fill="hsl(0,0%,45%)" radius={[0, 4, 4, 0]}>
                        {analytics.hearData.map((_, i) => (
                          <Cell key={i} fill={`hsl(0,0%,${25 + i * 5}%)`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Priority + Role */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Active Pipeline by Priority</h2>
              <div className="border border-border rounded-md divide-y divide-border">
                {analytics.priorityData.map((p) => {
                  const total = analytics.priorityData.reduce((s, x) => s + x.count, 0);
                  return (
                    <div key={p.priority} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${p.priority === "High" ? "bg-foreground" : p.priority === "Medium" ? "bg-foreground/50" : "bg-foreground/20"}`} />
                        <span className="font-medium">{p.priority}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-3 bg-secondary/50 rounded overflow-hidden">
                          <div className="h-full bg-foreground/20 rounded" style={{ width: `${total > 0 ? (p.count / total) * 100 : 0}%` }} />
                        </div>
                        <span className="tabular-nums font-medium w-8 text-right">{p.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Role / Buyer Type</h2>
              <div className="border border-border rounded-md divide-y divide-border max-h-[200px] overflow-y-auto">
                {analytics.roleData.map((r) => (
                  <div key={r.role} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-muted-foreground truncate">{r.role}</span>
                    <span className="font-medium tabular-nums">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Service Interest + Deals + Day of Week */}
          <div className="grid grid-cols-3 gap-6">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Service Interest (All)</h2>
              <div className="border border-border rounded-md divide-y divide-border">
                {analytics.serviceData.map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground truncate">{s.label}</span>
                    <span className="font-medium tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Deals Planned</h2>
              <div className="border border-border rounded-md divide-y divide-border">
                {analytics.dealsData.map((d) => (
                  <div key={d.range} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{d.range}</span>
                    <span className="font-medium tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Submissions by Day</h2>
              <div className="border border-border rounded-md divide-y divide-border">
                {analytics.dayOfWeek.map((d) => (
                  <div key={d.day} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-muted-foreground">{d.day}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-3 bg-secondary/50 rounded overflow-hidden">
                        <div className="h-full bg-foreground/20 rounded" style={{ width: `${(d.count / Math.max(...analytics.dayOfWeek.map((x) => x.count), 1)) * 100}%` }} />
                      </div>
                      <span className="font-medium tabular-nums text-xs w-6 text-right">{d.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Company Leaderboard */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Company Leaderboard (Top 15)</h2>
            <div className="border border-border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Leads</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Deal Value</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sources</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {analytics.companyLeaderboard.map((c) => (
                    <tr key={c.company} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2 font-medium">{c.company}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.count}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{c.value ? `$${c.value.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">{c.sources}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Duplicates */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Cross-Brand Duplicates <span className="text-xs font-normal ml-1">({analytics.duplicatePairs.length} pairs)</span>
            </h2>
            {analytics.duplicatePairs.length > 0 ? (
              <div className="border border-border rounded-md divide-y divide-border max-h-[240px] overflow-y-auto">
                {analytics.duplicatePairs.map((pair, i) => (
                  <div key={i} className="px-4 py-2.5 text-sm space-y-0.5">
                    <p className="font-medium">{pair.ctLead.name}</p>
                    <p className="text-xs text-muted-foreground">{pair.ctLead.email}</p>
                    <div className="flex gap-2 text-xs">
                      <span className="px-1 py-0.5 border border-border rounded">CT: {pair.ctLead.source.replace("CT ", "")}</span>
                      <span className="px-1 py-0.5 border border-border rounded">SC: {pair.scLead.source.replace("SC ", "")}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No cross-brand duplicates found</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
