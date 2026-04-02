import { useState, useEffect, useMemo } from "react";
import { Lead } from "@/types/lead";
import { BrandLogo } from "@/components/BrandLogo";
import { CalendarCheck, AlertTriangle, Target, MessageSquare, Shield, Lightbulb, Flame, Snowflake, Thermometer, Crown, Brain, Zap, Users, Mic, Mail, Loader2, X, ChevronDown, ChevronRight } from "lucide-react";
import { format, parseISO, differenceInDays, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

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

// ─── Prep Brief Sheet ───
interface PrepBrief {
  executiveSummary?: string;
  openActionItemsWeOwe?: { item: string; deadline: string; context: string }[];
  openActionItemsTheyOwe?: { item: string; followUpApproach: string }[];
  unresolvedObjections?: { objection: string; recommendedApproach: string; evidence: string }[];
  stakeholderBriefing?: { name: string; role: string; stance: string; keyInterests: string; approachTips: string }[];
  competitiveThreats?: { competitor: string; threat: string; counterStrategy: string }[];
  talkingPoints?: string[];
  questionsToAsk?: string[];
  risksToWatch?: string[];
  desiredOutcomes?: string[];
}

function BriefSection({ title, icon: Icon, iconColor, children, defaultOpen = true }: { title: string; icon: typeof Target; iconColor: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 py-2.5 text-left hover:bg-secondary/20 transition-colors">
        <Icon className={`h-3.5 w-3.5 ${iconColor} shrink-0`} />
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" /> : <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

function PrepBriefSheet({ open, onClose, brief, leadName }: { open: boolean; onClose: () => void; brief: PrepBrief | null; leadName: string }) {
  if (!brief) return null;
  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">Prep Brief — {leadName}</SheetTitle>
          <SheetDescription className="sr-only">AI-generated meeting preparation brief for {leadName}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-0">
          {/* Executive Summary */}
          {brief.executiveSummary && (
            <div className="bg-secondary/30 rounded-lg p-3 mb-4">
              <p className="text-xs leading-relaxed">{brief.executiveSummary}</p>
            </div>
          )}

          {/* Our Open Items */}
          {brief.openActionItemsWeOwe && brief.openActionItemsWeOwe.length > 0 && (
            <BriefSection title={`We Owe (${brief.openActionItemsWeOwe.length})`} icon={AlertTriangle} iconColor="text-red-500">
              <ul className="space-y-2">
                {brief.openActionItemsWeOwe.map((a, i) => (
                  <li key={i} className="text-xs pl-5">
                    <span className="font-medium">{a.item}</span>
                    {a.deadline && <span className="text-muted-foreground"> — by {a.deadline}</span>}
                    <p className="text-muted-foreground mt-0.5">{a.context}</p>
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* They Owe */}
          {brief.openActionItemsTheyOwe && brief.openActionItemsTheyOwe.length > 0 && (
            <BriefSection title={`They Owe (${brief.openActionItemsTheyOwe.length})`} icon={Target} iconColor="text-blue-500">
              <ul className="space-y-2">
                {brief.openActionItemsTheyOwe.map((a, i) => (
                  <li key={i} className="text-xs pl-5">
                    <span className="font-medium">{a.item}</span>
                    <p className="text-muted-foreground mt-0.5 italic">{a.followUpApproach}</p>
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Objections */}
          {brief.unresolvedObjections && brief.unresolvedObjections.length > 0 && (
            <BriefSection title={`Objections (${brief.unresolvedObjections.length})`} icon={MessageSquare} iconColor="text-amber-500">
              <ul className="space-y-2">
                {brief.unresolvedObjections.map((o, i) => (
                  <li key={i} className="text-xs pl-5">
                    <span className="font-medium">"{o.objection}"</span>
                    <p className="text-muted-foreground mt-0.5">→ {o.recommendedApproach}</p>
                    {o.evidence && <p className="text-muted-foreground/70 mt-0.5 text-[10px]">Evidence: {o.evidence}</p>}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Stakeholders */}
          {brief.stakeholderBriefing && brief.stakeholderBriefing.length > 0 && (
            <BriefSection title={`Stakeholders (${brief.stakeholderBriefing.length})`} icon={Users} iconColor="text-emerald-500">
              <ul className="space-y-2">
                {brief.stakeholderBriefing.map((s, i) => (
                  <li key={i} className="text-xs pl-5">
                    <span className="font-medium">{s.name}</span> <span className="text-muted-foreground">({s.role}) — {s.stance}</span>
                    <p className="text-muted-foreground mt-0.5">{s.approachTips}</p>
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Competitive Threats */}
          {brief.competitiveThreats && brief.competitiveThreats.length > 0 && (
            <BriefSection title={`Competitive Threats (${brief.competitiveThreats.length})`} icon={Shield} iconColor="text-red-500">
              <ul className="space-y-2">
                {brief.competitiveThreats.map((c, i) => (
                  <li key={i} className="text-xs pl-5">
                    <span className="font-medium">{c.competitor}</span>: {c.threat}
                    <p className="text-muted-foreground mt-0.5 italic">Counter: {c.counterStrategy}</p>
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Talking Points */}
          {brief.talkingPoints && brief.talkingPoints.length > 0 && (
            <BriefSection title="Talking Points" icon={Lightbulb} iconColor="text-amber-500">
              <ol className="space-y-1 list-decimal list-inside">
                {brief.talkingPoints.map((p, i) => (
                  <li key={i} className="text-xs pl-3">{p}</li>
                ))}
              </ol>
            </BriefSection>
          )}

          {/* Questions to Ask */}
          {brief.questionsToAsk && brief.questionsToAsk.length > 0 && (
            <BriefSection title="Questions to Ask" icon={Brain} iconColor="text-purple-500">
              <ol className="space-y-1 list-decimal list-inside">
                {brief.questionsToAsk.map((q, i) => (
                  <li key={i} className="text-xs pl-3">{q}</li>
                ))}
              </ol>
            </BriefSection>
          )}

          {/* Risks */}
          {brief.risksToWatch && brief.risksToWatch.length > 0 && (
            <BriefSection title="Risks to Watch" icon={AlertTriangle} iconColor="text-red-500" defaultOpen={false}>
              <ul className="space-y-1">
                {brief.risksToWatch.map((r, i) => (
                  <li key={i} className="text-xs pl-5">• {r}</li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Desired Outcomes */}
          {brief.desiredOutcomes && brief.desiredOutcomes.length > 0 && (
            <BriefSection title="Desired Outcomes" icon={Crown} iconColor="text-amber-500">
              <ul className="space-y-1">
                {brief.desiredOutcomes.map((d, i) => (
                  <li key={i} className="text-xs pl-5 flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">✓</span> {d}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function PrepIntelTab({ leads, ownerFilter, onSelectLead, meetingHorizon = 7 }: { leads: Lead[]; ownerFilter: string; onSelectLead: (id: string) => void; meetingHorizon?: number }) {
  const now = new Date();
  const [emailCounts, setEmailCounts] = useState<Map<string, number>>(new Map());
  const [briefData, setBriefData] = useState<{ leadId: string; leadName: string; brief: PrepBrief } | null>(null);

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
    supabase.from("lead_emails").select("lead_id").in("lead_id", ids).limit(5000).then(({ data }) => {
      if (!data) return;
      const counts = new Map<string, number>();
      for (const row of data) counts.set(row.lead_id, (counts.get(row.lead_id) || 0) + 1);
      setEmailCounts(counts);
    });
  }, [upcomingMeetings]);

  const handleBriefGenerated = (leadId: string, leadName: string, brief: PrepBrief) => {
    setBriefData({ leadId, leadName, brief });
  };

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
        <IntelCard key={lead.id} lead={lead} onSelect={() => onSelectLead(lead.id)} emailCount={emailCounts.get(lead.id) || 0} onBriefGenerated={handleBriefGenerated} />
      ))}

      <PrepBriefSheet
        open={!!briefData}
        onClose={() => setBriefData(null)}
        brief={briefData?.brief || null}
        leadName={briefData?.leadName || ""}
      />
    </div>
  );
}

function IntelCard({ lead, onSelect, emailCount, onBriefGenerated }: { lead: Lead; onSelect: () => void; emailCount: number; onBriefGenerated: (leadId: string, leadName: string, brief: PrepBrief) => void }) {
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
      const { data, error } = await supabase.functions.invoke("generate-meeting-prep", {
        body: {
          meetings: lead.meetings || [],
          leadFields: {
            name: lead.name,
            company: lead.company,
            role: lead.role,
            stage: lead.stage,
            priority: lead.priority,
            dealValue: lead.dealValue,
            serviceInterest: lead.serviceInterest,
          },
          dealIntelligence: lead.dealIntelligence || null,
        },
      });
      if (error) throw error;
      if (data?.brief) {
        onBriefGenerated(lead.id, lead.name, data.brief);
        toast({ title: "Prep brief ready", description: `Intelligence generated for ${lead.name}` });
      } else if (data?.error) {
        toast({ title: "Could not generate brief", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Try again later";
      if (msg.includes("No meetings")) {
        toast({ title: "No meeting data yet", description: "Schedule a meeting first or process an existing one.", variant: "destructive" });
      } else {
        toast({ title: "Failed to generate prep", description: msg, variant: "destructive" });
      }
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
        <span className={`tabular-nums font-medium ${lead.dealValue === 0 ? "text-muted-foreground" : ""}`}>${lead.dealValue.toLocaleString()}</span>
        {lead.stage && (
          <span className="px-1.5 py-0.5 rounded bg-secondary">{lead.stage}</span>
        )}
      </div>

      {/* Generate Prep button */}
      <button
        onClick={handleGeneratePrep}
        disabled={generatingPrep}
        className="w-full text-xs py-2 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors flex items-center justify-center gap-2"
      >
        {generatingPrep ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        {generatingPrep ? "Generating prep brief..." : hasIntel ? "Regenerate Prep Brief" : "Generate Prep Brief"}
      </button>

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

      {/* Company description from enrichment */}
      {enrichment?.companyDescription && (
        <div className="text-[10px] text-muted-foreground bg-secondary/30 rounded px-2.5 py-1.5 line-clamp-2">
          <span className="font-medium text-foreground">Company: </span>{(enrichment.companyDescription as string).slice(0, 150)}{(enrichment.companyDescription as string).length > 150 ? "…" : ""}
        </div>
      )}

      {/* Lead message as prep context */}
      {lead.message && lead.message.length > 0 && (
        <div className="text-[10px] text-muted-foreground bg-secondary/30 rounded px-2.5 py-1.5 line-clamp-3">
          <span className="font-medium text-foreground">Prospect said: </span>"{lead.message.slice(0, 200)}{lead.message.length > 200 ? "…" : ""}"
        </div>
      )}

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
        {/* Enrichment fields */}
        {lead.acquisitionStrategy && lead.acquisitionStrategy !== "TBD" && (
          <div><span className="text-muted-foreground">Strategy: </span><span className="font-medium">{lead.acquisitionStrategy}</span></div>
        )}
        {lead.buyerType && lead.buyerType !== "TBD" && (
          <div><span className="text-muted-foreground">Buyer: </span><span className="font-medium">{lead.buyerType}</span></div>
        )}
        {lead.geography && lead.geography !== "TBD" && (
          <div><span className="text-muted-foreground">Geo: </span><span className="font-medium">{lead.geography}</span></div>
        )}
        {lead.targetCriteria && lead.targetCriteria !== "TBD" && (
          <div className="col-span-2"><span className="text-muted-foreground">Criteria: </span><span className="font-medium">{lead.targetCriteria}</span></div>
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
