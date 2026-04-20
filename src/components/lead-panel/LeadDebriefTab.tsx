import { Lead } from "@/types/lead";
import { Trophy, XCircle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDroppedPromises } from "@/lib/dealHealthUtils";

export function LeadDebriefTab({ lead }: { lead: Lead }) {
  const droppedPromises = getDroppedPromises(lead);

  return (
    <div className="p-6 mt-0 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        {lead.stage === "Closed Won" ? <Trophy className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
        <h2 className="text-lg font-semibold">{lead.stage === "Closed Won" ? "Win" : "Loss"} Debrief — {lead.name}</h2>
      </div>

      <div className={cn("rounded-lg p-4 space-y-2", lead.stage === "Closed Won" ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-red-500/5 border border-red-500/20")}>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground block text-xs">Deal Value</span>
            <span className="font-medium">${lead.subscriptionValue > 0 ? lead.subscriptionValue.toLocaleString() : lead.dealValue.toLocaleString()}{lead.billingFrequency ? `/${lead.billingFrequency}` : "/mo"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-xs">Meetings</span>
            <span className="font-medium">{lead.meetings?.length || 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-xs">Cycle Days</span>
            <span className="font-medium">{lead.closedDate && lead.dateSubmitted ? Math.max(1, Math.floor((new Date(lead.closedDate).getTime() - new Date(lead.dateSubmitted).getTime()) / 86400000)) : "—"}</span>
          </div>
        </div>
        {lead.stage === "Closed Won" && lead.wonReason && <p className="text-sm"><span className="text-muted-foreground">Won because: </span>{lead.wonReason}</p>}
        {(lead.stage === "Lost" || lead.stage === "Closed Lost") && (lead.lostReasonV2 || lead.lostReason) && <p className="text-sm"><span className="text-muted-foreground">Lost because: </span>{lead.lostReasonV2 || lead.lostReason}</p>}
      </div>

      {lead.dealIntelligence && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" /> What Went Right
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {lead.dealIntelligence.winStrategy?.numberOneCloser && <li>· {lead.dealIntelligence.winStrategy.numberOneCloser}</li>}
              {(lead.dealIntelligence.stakeholderMap || []).some(s => s.stance === "Champion") && <li>· Internal champion identified</li>}
              {lead.dealIntelligence.momentumSignals?.momentum === "Accelerating" && <li>· Accelerating momentum maintained</li>}
              {(lead.dealIntelligence.actionItemTracker || []).filter(a => a.status === "Completed").length > 0 && <li>· {(lead.dealIntelligence.actionItemTracker || []).filter(a => a.status === "Completed").length} action items completed</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
              <TrendingDown className="h-3.5 w-3.5" /> What Could Improve
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {droppedPromises.length > 0 && <li>· {droppedPromises.length} action items never completed</li>}
              {!(lead.dealIntelligence.stakeholderMap || []).some(s => s.stance === "Champion") && <li>· No champion identified — single-threaded risk</li>}
              {(lead.dealIntelligence.objectionTracker || []).filter(o => o.status === "Open" || o.status === "Recurring").length > 0 && <li>· {(lead.dealIntelligence.objectionTracker || []).filter(o => o.status === "Open" || o.status === "Recurring").length} objections unresolved</li>}
            </ul>
          </div>
        </div>
      )}

      {lead.dealIntelligence?.dealNarrative && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Deal Narrative</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{lead.dealIntelligence.dealNarrative}</p>
        </div>
      )}
    </div>
  );
}
