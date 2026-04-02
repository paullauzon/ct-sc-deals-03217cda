import { useState, useEffect, useMemo } from "react";
import { Lead } from "@/types/lead";
import { BrandLogo } from "@/components/BrandLogo";
import { CalendarCheck, AlertTriangle, Target, MessageSquare, Shield, Lightbulb, Flame, Snowflake, Thermometer, Crown, Brain, Zap, Users, Mic, Mail, Loader2 } from "lucide-react";
import { format, parseISO, differenceInDays, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function DealTempBadge({ temp }: { temp?: string }) {
  if (!temp) return null;
  const config: Record<string, { icon: typeof Flame; color: string }> = {
    "On Fire": { icon: Flame, color: "text-red-500 bg-red-500/10" },
    "Warm": { icon: Thermometer, color: "text-amber-500 bg-amber-500/10" },
    "Lukewarm": { icon: Thermometer, color: "text-muted-foreground bg-secondary" },
    "Cold": { icon: Snowflake, color: "text-blue-500 bg-blue-500/10" },
    "Ice Cold": { icon: Snowflake, color: "text-blue-600 bg-blue-500/10" },
  };
  const c = config[temp] || config["Lukewarm"]!;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.color}`}>
      <Icon className="h-3 w-3" />{temp}
    </span>
  );
}

export function PrepIntelTab({ leads, ownerFilter, onSelectLead, meetingHorizon = 7 }: { leads: Lead[]; ownerFilter: string; onSelectLead: (id: string) => void; meetingHorizon?: number }) {
  const now = new Date();
  const [emailCounts, setEmailCounts] = useState<Map<string, number>>(new Map());

  const upcomingMeetings = useMemo(() => {
    const filtered = ownerFilter === "All" ? leads
      : ownerFilter === "Unassigned" ? leads.filter(l => !l.assignedTo)
      : leads.filter(l => l.assignedTo === ownerFilter);

    return filtered
      .filter(l => l.meetingDate && !isBefore(parseISO(l.meetingDate), now) && differenceInDays(parseISO(l.meetingDate), now) <= meetingHorizon)
      .sort((a, b) => new Date(a.meetingDate).getTime() - new Date(b.meetingDate).getTime());
  }, [leads, ownerFilter, now, meetingHorizon]);

  // Fetch email counts for upcoming meeting leads
  useEffect(() => {
    const ids = upcomingMeetings.map(l => l.id);
    if (ids.length === 0) { setEmailCounts(new Map()); return; }
    supabase.from("lead_emails").select("lead_id").in("lead_id", ids).then(({ data }) => {
      if (!data) return;
      const counts = new Map<string, number>();
      for (const row of data) counts.set(row.lead_id, (counts.get(row.lead_id) || 0) + 1);
      setEmailCounts(counts);
    });
  }, [upcomingMeetings]);

  if (upcomingMeetings.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No meetings in the next {meetingHorizon} days — prep intel will appear here when meetings are scheduled</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{upcomingMeetings.length} meeting{upcomingMeetings.length !== 1 ? "s" : ""} in the next {meetingHorizon} days</p>

      {upcomingMeetings.map(lead => (
        <IntelCard key={lead.id} lead={lead} onSelect={() => onSelectLead(lead.id)} emailCount={emailCounts.get(lead.id) || 0} />
      ))}
    </div>
  );
}

function IntelCard({ lead, onSelect, emailCount }: { lead: Lead; onSelect: () => void; emailCount: number }) {
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const enrichment = lead.enrichment;
  const di = lead.dealIntelligence;
  const latestMeeting = lead.meetings?.length > 0 ? lead.meetings[lead.meetings.length - 1] : null;
  const signals = latestMeeting?.intelligence?.dealSignals;
  const winStrategy = di?.winStrategy;
  const psych = di?.psychologicalProfile;
  const buyingCommittee = di?.buyingCommittee;
  const meetingCount = lead.meetings?.length || 0;
  const hasCalendly = !!lead.calendlyBookedAt;
  const hasIntel = !!(di || enrichment?.buyerMotivation);

  const openActions = di?.actionItemTracker?.filter(a => a.status === "Open") || [];
  const openObjections = di?.objectionTracker?.filter(o => o.status === "Open" || o.status === "Recurring") || [];
  const risks = di?.riskRegister?.filter(r => r.mitigationStatus !== "Mitigated") || [];

  const handleGeneratePrep = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setGeneratingPrep(true);
    try {
      const { error } = await supabase.functions.invoke("generate-meeting-prep", {
        body: { leadId: lead.id },
      });
      if (error) throw error;
      toast({ title: "Prep brief queued", description: `Generating intelligence for ${lead.name}...` });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to generate prep", variant: "destructive" });
    } finally {
      setGeneratingPrep(false);
    }
  };

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
              {winStrategy?.dealTemperature && <DealTempBadge temp={winStrategy.dealTemperature} />}
            </div>
            <p className="text-[11px] text-muted-foreground">{lead.role && `${lead.role} · `}{lead.company}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 font-medium shrink-0">
          <CalendarCheck className="h-3 w-3" />
          <span>{format(parseISO(lead.meetingDate), "EEE, MMM d 'at' h:mm a")}</span>
        </div>
      </div>

      {/* Calendly + Signal Strip */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
        {hasCalendly && lead.calendlyEventName && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
            <CalendarCheck className="h-2.5 w-2.5" />
            {lead.calendlyEventName}{lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration}m` : ""}
          </span>
        )}
        {meetingCount > 0 && (
          <span className="flex items-center gap-1">
            <Mic className="h-2.5 w-2.5" />{meetingCount} meeting{meetingCount !== 1 ? "s" : ""}
          </span>
        )}
        {emailCount > 0 && (
          <span className="flex items-center gap-1">
            <Mail className="h-2.5 w-2.5" />{emailCount} email{emailCount !== 1 ? "s" : ""}
          </span>
        )}
        <span className={cn("tabular-nums font-medium", lead.dealValue === 0 && "text-muted-foreground")}>${lead.dealValue.toLocaleString()}</span>
        {lead.stage && (
          <span className="px-1.5 py-0.5 rounded bg-secondary">{lead.stage}</span>
        )}
      </div>

      {/* Generate Prep button when no intel exists */}
      {!hasIntel && (
        <button
          onClick={handleGeneratePrep}
          disabled={generatingPrep}
          className="w-full text-xs py-2 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors flex items-center justify-center gap-2"
        >
          {generatingPrep ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {generatingPrep ? "Generating prep brief..." : "Generate Prep Brief"}
        </button>
      )}

      {/* Prior meeting summary */}
      {meetingCount > 0 && (() => {
        const latestMeeting = lead.meetings[lead.meetings.length - 1] as any;
        const summary = latestMeeting?.intelligence?.summary || latestMeeting?.summary;
        if (!summary) return null;
        return (
          <div className="text-[10px] text-muted-foreground bg-secondary/30 rounded px-2.5 py-1.5 line-clamp-2 italic">
            <span className="font-medium text-foreground not-italic">Last meeting: </span>{summary}
          </div>
        );
      })()}

      {/* Context Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
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
        {winStrategy?.closingWindow && (
          <div><span className="text-muted-foreground">Window: </span><span className="font-medium">{winStrategy.closingWindow}</span></div>
        )}
      </div>

      {/* Win Strategy Section */}
      {winStrategy && (winStrategy.numberOneCloser || winStrategy.powerMove || buyingCommittee?.champion) && (
        <div className="border-t border-border pt-2 space-y-1.5">
          <div className="flex items-center gap-1 mb-1">
            <Crown className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Win Strategy</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {winStrategy.numberOneCloser && (
              <div><span className="text-muted-foreground">#1 Closer: </span><span className="font-medium">{winStrategy.numberOneCloser}</span></div>
            )}
            {winStrategy.powerMove && (
              <div><span className="text-muted-foreground">Power Move: </span><span className="font-medium">{winStrategy.powerMove}</span></div>
            )}
            {buyingCommittee?.champion && (
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="text-muted-foreground">Champion: </span><span className="font-medium">{buyingCommittee.champion}</span>
              </div>
            )}
            {winStrategy.negotiationStyle && (
              <div><span className="text-muted-foreground">Negotiation: </span><span className="font-medium">{winStrategy.negotiationStyle}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Psychological Profile */}
      {psych && (psych.realWhy || psych.unspokenAsk) && (
        <div className="border-t border-border pt-2 space-y-1">
          <div className="flex items-center gap-1 mb-1">
            <Brain className="h-3 w-3 text-purple-500" />
            <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">The Real Why</span>
          </div>
          {psych.realWhy && (
            <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Core motivation:</span> {psych.realWhy}</p>
          )}
          {psych.unspokenAsk && (
            <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Unspoken ask:</span> {psych.unspokenAsk}</p>
          )}
          {psych.fearFactor && (
            <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Fear factor:</span> {psych.fearFactor}</p>
          )}
        </div>
      )}

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
