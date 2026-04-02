import { useMemo } from "react";
import { Lead } from "@/types/lead";
import { BrandLogo } from "@/components/BrandLogo";
import { CalendarCheck, AlertTriangle, Target, MessageSquare, Shield, Lightbulb } from "lucide-react";
import { format, parseISO, differenceInDays, isBefore } from "date-fns";

export function PrepIntelTab({ leads, ownerFilter, onSelectLead }: { leads: Lead[]; ownerFilter: string; onSelectLead: (id: string) => void }) {
  const now = new Date();

  const upcomingMeetings = useMemo(() => {
    const filtered = ownerFilter === "All" ? leads
      : ownerFilter === "Unassigned" ? leads.filter(l => !l.assignedTo)
      : leads.filter(l => l.assignedTo === ownerFilter);

    return filtered
      .filter(l => l.meetingDate && !isBefore(parseISO(l.meetingDate), now) && differenceInDays(parseISO(l.meetingDate), now) <= 7)
      .sort((a, b) => new Date(a.meetingDate).getTime() - new Date(b.meetingDate).getTime());
  }, [leads, ownerFilter, now]);

  if (upcomingMeetings.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No meetings in the next 7 days — prep intel will appear here when meetings are scheduled</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{upcomingMeetings.length} meeting{upcomingMeetings.length !== 1 ? "s" : ""} in the next 7 days</p>

      {upcomingMeetings.map(lead => (
        <IntelCard key={lead.id} lead={lead} onSelect={() => onSelectLead(lead.id)} />
      ))}
    </div>
  );
}

function IntelCard({ lead, onSelect }: { lead: Lead; onSelect: () => void }) {
  const enrichment = lead.enrichment;
  const di = lead.dealIntelligence;
  const latestMeeting = lead.meetings?.length > 0 ? lead.meetings[lead.meetings.length - 1] : null;
  const signals = latestMeeting?.intelligence?.dealSignals;

  const openActions = di?.actionItemTracker?.filter(a => a.status === "Open") || [];
  const openObjections = di?.objectionTracker?.filter(o => o.status === "Open" || o.status === "Recurring") || [];
  const risks = di?.riskRegister?.filter(r => r.mitigationStatus !== "Mitigated") || [];

  // Prep brief from most recent meeting
  const meetings = lead.meetings || [];
  const prepBrief = meetings.length > 0 ? (meetings[meetings.length - 1] as any)?.prepBrief : null;

  return (
    <div onClick={onSelect} className="border border-border rounded-lg p-4 cursor-pointer hover:bg-secondary/20 transition-colors space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BrandLogo brand={lead.brand} size="xs" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">{lead.name}</span>
              {lead.assignedTo && (
                <span className="w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-semibold shrink-0">{lead.assignedTo[0]}</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{lead.role && `${lead.role} · `}{lead.company}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 font-medium shrink-0">
          <CalendarCheck className="h-3 w-3" />
          <span>{format(parseISO(lead.meetingDate), "EEE, MMM d 'at' h:mm a")}</span>
        </div>
      </div>

      {/* Context Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
        {lead.stage && (
          <div><span className="text-muted-foreground">Stage: </span><span className="font-medium">{lead.stage}</span></div>
        )}
        {lead.dealValue > 0 && (
          <div><span className="text-muted-foreground">Value: </span><span className="font-medium">${lead.dealValue.toLocaleString()}</span></div>
        )}
        {lead.serviceInterest && lead.serviceInterest !== "TBD" && (
          <div><span className="text-muted-foreground">Interest: </span><span className="font-medium">{lead.serviceInterest}</span></div>
        )}
        {signals?.buyingIntent && (
          <div><span className="text-muted-foreground">Intent: </span><span className={`font-medium ${signals.buyingIntent === "Strong" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{signals.buyingIntent}</span></div>
        )}
        {signals?.sentiment && (
          <div><span className="text-muted-foreground">Sentiment: </span><span className="font-medium">{signals.sentiment}</span></div>
        )}
        {di?.momentumSignals?.momentum && (
          <div><span className="text-muted-foreground">Momentum: </span><span className="font-medium">{di.momentumSignals.momentum}</span></div>
        )}
      </div>

      {/* Enrichment Highlights */}
      {enrichment && (enrichment.buyerMotivation || enrichment.urgency) && (
        <div className="border-t border-border pt-2 space-y-1">
          {enrichment.buyerMotivation && (
            <div className="flex gap-1.5 text-[11px]">
              <Target className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <span className="text-muted-foreground"><span className="font-medium text-foreground">Motivation:</span> {enrichment.buyerMotivation}</span>
            </div>
          )}
          {enrichment.urgency && (
            <div className="flex gap-1.5 text-[11px]">
              <Lightbulb className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground"><span className="font-medium text-foreground">Urgency:</span> {enrichment.urgency}</span>
            </div>
          )}
        </div>
      )}

      {/* Open Items */}
      {(openObjections.length > 0 || openActions.length > 0 || risks.length > 0) && (
        <div className="border-t border-border pt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
          {openObjections.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <MessageSquare className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Objections ({openObjections.length})</span>
              </div>
              <ul className="space-y-0.5">
                {openObjections.slice(0, 3).map((o, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground truncate">• {o.objection}</li>
                ))}
              </ul>
            </div>
          )}
          {openActions.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Target className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Action Items ({openActions.length})</span>
              </div>
              <ul className="space-y-0.5">
                {openActions.slice(0, 3).map((a, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground truncate">• {a.item} <span className="text-muted-foreground/60">({a.owner})</span></li>
                ))}
              </ul>
            </div>
          )}
          {risks.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Shield className="h-3 w-3 text-red-500" />
                <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Risks ({risks.length})</span>
              </div>
              <ul className="space-y-0.5">
                {risks.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground truncate">• {r.risk}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Deal Narrative snippet */}
      {di?.dealNarrative && (
        <div className="border-t border-border pt-2">
          <p className="text-[10px] text-muted-foreground line-clamp-2 italic">{di.dealNarrative}</p>
        </div>
      )}
    </div>
  );
}
