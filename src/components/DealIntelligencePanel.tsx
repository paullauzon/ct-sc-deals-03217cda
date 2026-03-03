import { useState } from "react";
import { DealIntelligence } from "@/types/lead";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, AlertTriangle, Target, TrendingUp, Shield, Clock, Crosshair, Activity } from "lucide-react";

const stanceColors: Record<string, string> = {
  "Champion": "bg-green-500/15 text-green-700 border-green-500/30",
  "Supporter": "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  "Neutral": "bg-muted text-muted-foreground border-border",
  "Skeptic": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Blocker": "bg-red-500/15 text-red-700 border-red-500/30",
  "Unknown": "bg-muted text-muted-foreground border-border",
};

const objectionStatusColors: Record<string, string> = {
  "Open": "bg-red-500/15 text-red-700 border-red-500/30",
  "Addressed": "bg-green-500/15 text-green-700 border-green-500/30",
  "Recurring": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
};

const actionStatusColors: Record<string, string> = {
  "Open": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Completed": "bg-green-500/15 text-green-700 border-green-500/30",
  "Overdue": "bg-red-500/15 text-red-700 border-red-500/30",
  "Dropped": "bg-muted text-muted-foreground border-border",
};

const momentumColors: Record<string, string> = {
  "Accelerating": "bg-green-500/15 text-green-700 border-green-500/30",
  "Steady": "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  "Stalling": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Stalled": "bg-red-500/15 text-red-700 border-red-500/30",
};

const severityColors: Record<string, string> = {
  "Critical": "bg-red-500/15 text-red-700 border-red-500/30",
  "High": "bg-orange-500/15 text-orange-700 border-orange-500/30",
  "Medium": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Low": "bg-muted text-muted-foreground border-border",
};

export function DealIntelligencePanel({ intel }: { intel: DealIntelligence }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          Deal Intelligence
        </h3>
        <p className="text-[10px] text-muted-foreground">
          Synthesized {new Date(intel.synthesizedAt).toLocaleDateString()}
        </p>
      </div>

      {/* Deal Narrative */}
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm leading-relaxed">{intel.dealNarrative}</p>
      </div>

      {/* Momentum + Buying Committee Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-secondary/30 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <TrendingUp className="h-3 w-3" /> Momentum
          </div>
          <Badge className={`text-[10px] ${momentumColors[intel.momentumSignals.momentum] || ""}`}>
            {intel.momentumSignals.momentum}
          </Badge>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
            <span>Frequency: {intel.momentumSignals.meetingFrequencyDays}d</span>
            <span>Completion: {intel.momentumSignals.completionRate}%</span>
          </div>
        </div>
        <div className="rounded-md border border-border bg-secondary/30 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Users className="h-3 w-3" /> Buying Committee
          </div>
          <div className="space-y-0.5 text-[10px]">
            {intel.buyingCommittee.decisionMaker && <p>🎯 <span className="font-medium">DM:</span> {intel.buyingCommittee.decisionMaker}</p>}
            {intel.buyingCommittee.champion && <p>⭐ <span className="font-medium">Champion:</span> {intel.buyingCommittee.champion}</p>}
            {intel.buyingCommittee.blockers?.length > 0 && <p>🚫 <span className="font-medium">Blockers:</span> {intel.buyingCommittee.blockers.join(", ")}</p>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="stakeholders" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-0.5 p-1">
          <TabsTrigger value="stakeholders" className="text-xs h-7">Stakeholders</TabsTrigger>
          <TabsTrigger value="objections" className="text-xs h-7">Objections</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs h-7">Actions</TabsTrigger>
          <TabsTrigger value="risks" className="text-xs h-7">Risks</TabsTrigger>
          <TabsTrigger value="milestones" className="text-xs h-7">Milestones</TabsTrigger>
          <TabsTrigger value="stage" className="text-xs h-7">Stage Evidence</TabsTrigger>
        </TabsList>

        {/* Stakeholders */}
        <TabsContent value="stakeholders" className="space-y-2">
          {intel.stakeholderMap.map((s, i) => (
            <div key={i} className="rounded border border-border bg-background p-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{s.name}</span>
                  <span className="text-[10px] text-muted-foreground">{s.role} @ {s.company}</span>
                </div>
                <div className="flex gap-1">
                  <Badge className={`text-[9px] h-4 ${stanceColors[s.stance] || ""}`}>{s.stance}</Badge>
                  <Badge variant="outline" className="text-[9px] h-4">{s.influence}</Badge>
                </div>
              </div>
              {s.concerns?.length > 0 && (
                <p className="text-[10px] text-muted-foreground">Concerns: {s.concerns.join("; ")}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Mentions: {s.mentions} · First: {s.firstSeen} · Last: {s.lastSeen}
              </p>
            </div>
          ))}
        </TabsContent>

        {/* Objections */}
        <TabsContent value="objections" className="space-y-2">
          {intel.objectionTracker.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No objections tracked.</p>
          ) : (
            intel.objectionTracker.map((o, i) => (
              <div key={i} className="rounded border border-border bg-background p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{o.objection}</span>
                  <Badge className={`text-[9px] h-4 ${objectionStatusColors[o.status] || ""}`}>{o.status}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Raised in: {o.raisedIn}
                  {o.addressedIn && ` · Addressed in: ${o.addressedIn}`}
                </p>
                {o.resolution && <p className="text-[10px] text-muted-foreground">Resolution: {o.resolution}</p>}
              </div>
            ))
          )}
        </TabsContent>

        {/* Action Items */}
        <TabsContent value="actions" className="space-y-2">
          {intel.actionItemTracker.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No action items tracked.</p>
          ) : (
            intel.actionItemTracker.map((a, i) => (
              <div key={i} className="rounded border border-border bg-background p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex-1 mr-2">{a.item}</span>
                  <Badge className={`text-[9px] h-4 shrink-0 ${actionStatusColors[a.status] || ""}`}>{a.status}</Badge>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>👤 {a.owner}</span>
                  <span>Created: {a.createdIn}</span>
                  {a.deadline && <span>📅 {a.deadline}</span>}
                  {a.resolvedIn && <span>✓ {a.resolvedIn}</span>}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* Risks */}
        <TabsContent value="risks" className="space-y-2">
          {intel.riskRegister.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No risks identified.</p>
          ) : (
            intel.riskRegister.map((r, i) => (
              <div key={i} className="rounded border border-border bg-background p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex-1 mr-2">{r.risk}</span>
                  <Badge className={`text-[9px] h-4 shrink-0 ${severityColors[r.severity] || ""}`}>{r.severity}</Badge>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>Source: {r.source}</span>
                  <span>{r.mitigationStatus}</span>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* Milestones */}
        <TabsContent value="milestones" className="space-y-1.5">
          {intel.keyMilestones.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No milestones yet.</p>
          ) : (
            <div className="relative pl-4 border-l-2 border-primary/20 space-y-3 py-1">
              {intel.keyMilestones.map((m, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary/50 border-2 border-background" />
                  <p className="text-[10px] text-muted-foreground">{m.date}</p>
                  <p className="text-xs font-medium">{m.event}</p>
                  <p className="text-[10px] text-muted-foreground">{m.significance}</p>
                </div>
              ))}
            </div>
          )}

          {/* Competitive Timeline */}
          {intel.competitiveTimeline?.length > 0 && (
            <div className="mt-3 pt-2 border-t border-border">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                <Crosshair className="h-3 w-3" /> Competitive Timeline
              </div>
              {intel.competitiveTimeline.map((c, i) => (
                <div key={i} className="text-[10px] flex gap-2 py-0.5">
                  <span className="text-muted-foreground shrink-0">{c.date}</span>
                  <span>⚔️ {c.event}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Stage Evidence */}
        <TabsContent value="stage" className="space-y-2">
          <div className="rounded-md border border-border bg-secondary/30 p-3">
            <p className="text-sm leading-relaxed whitespace-pre-line">{intel.dealStageEvidence}</p>
          </div>

          {/* Trajectory Visualization */}
          {intel.momentumSignals.sentimentTrajectory?.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Signal Trajectory</label>
              <div className="grid grid-cols-3 gap-2">
                <TrajectoryDisplay label="Sentiment" values={intel.momentumSignals.sentimentTrajectory} />
                <TrajectoryDisplay label="Intent" values={intel.momentumSignals.intentTrajectory} />
                <TrajectoryDisplay label="Engagement" values={intel.momentumSignals.engagementTrajectory} />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TrajectoryDisplay({ label, values }: { label: string; values: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center justify-center gap-0.5">
        {values.map((v, i) => (
          <span key={i} className="text-[9px]" title={`Meeting ${i + 1}: ${v}`}>
            {i > 0 && <span className="text-muted-foreground mx-0.5">→</span>}
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
