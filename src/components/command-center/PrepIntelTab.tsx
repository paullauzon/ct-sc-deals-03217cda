import { useState, useEffect, useMemo, useCallback } from "react";
import { Lead } from "@/types/lead";
import { BrandLogo } from "@/components/BrandLogo";
import { CalendarCheck, AlertTriangle, Target, MessageSquare, Shield, Lightbulb, Flame, Snowflake, Thermometer, Crown, Brain, Zap, Users, Mic, Mail, Loader2, X, ChevronDown, ChevronRight, Send, CheckCircle2, SkipForward, ListChecks, ExternalLink, Link2, Key, Building2, Swords, Settings2, BookOpen } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, parseISO, differenceInDays, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useLeads } from "@/contexts/LeadContext";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useLeadTasks } from "@/hooks/useLeadTasks";

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

// ─── Helper: strip wrapping double quotes ───
function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// ─── CitedText: parses inline citations into hyperlinks / superscript labels ───
// Patterns: (web search: URL), (website: URL), (URL), (website), (form submission), (notes)
function CitedText({ text, className }: { text: string; className?: string }) {
  // Regex to find citation patterns like (web search: https://...) or (website) or (https://...)
  const citationRegex = /\((?:(web search|website|form submission|notes|linkedin|LinkedIn profile|company website|firecrawl)[:\s]*)?((https?:\/\/[^\s)]+))?\)/gi;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex
  citationRegex.lastIndex = 0;

  while ((match = citationRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const sourceLabel = match[1]; // e.g. "web search", "website", "notes"
    const url = match[2]; // e.g. "https://..."
    const matchStart = match.index;

    // Text before this citation
    const beforeText = text.slice(lastIndex, matchStart);

    if (url) {
      // Make the preceding text segment a clickable link
      // Find the last sentence/clause boundary to determine what text to link
      const sentenceBreaks = /[.!?;•\n]/g;
      let linkStart = 0;
      let breakMatch: RegExpExecArray | null;
      sentenceBreaks.lastIndex = 0;
      // Search within beforeText for the last sentence break
      const searchIn = beforeText;
      let lastBreak = -1;
      while ((breakMatch = sentenceBreaks.exec(searchIn)) !== null) {
        lastBreak = breakMatch.index;
      }

      if (lastBreak >= 0) {
        // Add plain text up to and including the break
        const plainPart = beforeText.slice(0, lastBreak + 1);
        if (plainPart) parts.push(<span key={`p-${lastIndex}`}>{plainPart}</span>);
        // The linkable part is after the break
        const linkableText = beforeText.slice(lastBreak + 1).trimStart();
        if (linkableText) {
          parts.push(
            <a
              key={`a-${matchStart}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-blue-600 dark:text-blue-400 underline decoration-blue-400/40 hover:decoration-blue-500 transition-colors"
            >
              {linkableText}
            </a>
          );
        }
      } else {
        // No sentence break — link the entire preceding text
        if (beforeText.trim()) {
          parts.push(
            <a
              key={`a-${matchStart}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-blue-600 dark:text-blue-400 underline decoration-blue-400/40 hover:decoration-blue-500 transition-colors"
            >
              {beforeText}
            </a>
          );
        }
      }
    } else if (sourceLabel) {
      // Non-URL citation — render preceding text normally, add superscript label
      if (beforeText) parts.push(<span key={`t-${lastIndex}`}>{beforeText}</span>);
      parts.push(
        <sup
          key={`s-${matchStart}`}
          className="text-[8px] text-muted-foreground/60 font-medium ml-0.5"
        >
          [{sourceLabel}]
        </sup>
      );
    } else {
      // Fallback: just plain text
      if (beforeText) parts.push(<span key={`t-${lastIndex}`}>{beforeText}</span>);
    }

    lastIndex = matchStart + fullMatch.length;
  }

  // Remaining text after last citation
  const remaining = text.slice(lastIndex);
  if (remaining) parts.push(<span key={`r-${lastIndex}`}>{remaining}</span>);

  // If no citations found, just return plain text
  if (parts.length === 0) return <span className={className}>{text}</span>;

  return <span className={className}>{parts}</span>;
}

// ─── Source Citations Component (hyperlink pills + dropdown) ───
function SourcesCitation({ dataSources }: { dataSources: string }) {
  const sources = dataSources.split("\n").map(s => s.replace(/^[-•\d.]\s*/, "").trim()).filter(Boolean);
  if (sources.length === 0) return null;

  const urlRegex = /(https?:\/\/[^\s,)]+)/;
  const withUrls: { label: string; url: string }[] = [];
  const withoutUrls: string[] = [];

  for (const src of sources) {
    const match = src.match(urlRegex);
    if (match) {
      let label = src.replace(match[1], "").replace(/[:()\s]+$/, "").replace(/^[:()\s]+/, "").trim();
      if (!label) {
        try { label = new URL(match[1]).hostname.replace(/^www\./, ""); } catch { label = match[1].slice(0, 30); }
      }
      withUrls.push({ label, url: match[1] });
    } else {
      withoutUrls.push(src);
    }
  }

  if (withUrls.length === 0 && withoutUrls.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-1.5 flex-wrap">
      <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
      {withUrls.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-medium hover:bg-blue-500/20 transition-colors"
        >
          {s.label}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ))}
      {withoutUrls.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-medium hover:text-foreground transition-colors"
            >
              +{withoutUrls.length} more
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {withoutUrls.map((s, i) => (
              <DropdownMenuItem key={i} className="text-[11px] text-muted-foreground cursor-default">
                {s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
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
  openingHook?: string;
  theOneInsight?: string;
  landmines?: string[];
  keyQuestions?: string[];
  meetingGoal?: string;
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
  const { updateLead } = useLeads();
  const now = new Date();
  const [emailCounts, setEmailCounts] = useState<Map<string, number>>(new Map());
  const [briefData, setBriefData] = useState<{ leadId: string; leadName: string; brief: PrepBrief } | null>(null);
  const [draftLead, setDraftLead] = useState<Lead | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftContent, setDraftContent] = useState("");

  const upcomingMeetingLeadIds = useMemo(() => {
    const filtered = ownerFilter === "All" ? leads
      : ownerFilter === "Unassigned" ? leads.filter(l => !l.assignedTo)
      : leads.filter(l => l.assignedTo === ownerFilter);
    return filtered
      .filter(l => l.meetingDate && !isBefore(parseISO(l.meetingDate), now) && differenceInDays(parseISO(l.meetingDate), now) <= meetingHorizon)
      .map(l => l.id);
  }, [leads, ownerFilter, now, meetingHorizon]);

  const { tasks: meetingTasks, completeTask, skipTask } = useLeadTasks(upcomingMeetingLeadIds);

  const upcomingMeetings = useMemo(() => {
    const filtered = ownerFilter === "All" ? leads
      : ownerFilter === "Unassigned" ? leads.filter(l => !l.assignedTo)
      : leads.filter(l => l.assignedTo === ownerFilter);

    return filtered
      .filter(l => l.meetingDate && !isBefore(parseISO(l.meetingDate), now) && differenceInDays(parseISO(l.meetingDate), now) <= meetingHorizon)
      .sort((a, b) => new Date(a.meetingDate).getTime() - new Date(b.meetingDate).getTime());
  }, [leads, ownerFilter, now, meetingHorizon]);

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

  const handleDraftEmail = async (lead: Lead) => {
    setDraftLead(lead);
    setDraftContent("");
    setDraftLoading(true);
    try {
      const meetingCount = lead.meetings?.length || 0;
      const actionType = meetingCount > 0 ? "post-meeting" : "initial-outreach";
      const recentMeeting = meetingCount > 0 ? lead.meetings[lead.meetings.length - 1] : null;
      const { data, error } = await supabase.functions.invoke("generate-follow-up-action", {
        body: {
          actionType,
          lead: { name: lead.name, company: lead.company, role: lead.role, brand: lead.brand, stage: lead.stage, dealValue: lead.dealValue, serviceInterest: lead.serviceInterest, enrichment: lead.enrichment, dealIntelligence: lead.dealIntelligence },
          meetingContext: recentMeeting ? { title: recentMeeting.title, date: recentMeeting.date, summary: recentMeeting.summary || recentMeeting.intelligence?.summary, nextSteps: recentMeeting.nextSteps, intelligence: recentMeeting.intelligence } : undefined,
        },
      });
      if (error) throw error;
      setDraftContent(data.content || "");
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to generate draft", description: "Try again later.", variant: "destructive" });
    } finally {
      setDraftLoading(false);
    }
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
        <IntelCard key={lead.id} lead={lead} onSelect={() => onSelectLead(lead.id)} emailCount={emailCounts.get(lead.id) || 0} onBriefGenerated={handleBriefGenerated} onDraftEmail={handleDraftEmail} onUpdateLead={updateLead} />
      ))}

      {/* Playbook Tasks for upcoming meetings */}
      {meetingTasks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Playbook Tasks</span>
            <span className="text-[10px] text-muted-foreground">({meetingTasks.length})</span>
          </div>
          <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
            {meetingTasks.map(task => {
              const lead = leads.find(l => l.id === task.lead_id);
              const typeIcon = task.task_type === "email" ? "✉️" : task.task_type === "call" ? "📞" : task.task_type === "prep" ? "📋" : "📌";
              return (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2 hover:bg-secondary/20 transition-colors">
                  <span className="text-sm">{typeIcon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {lead && <BrandLogo brand={lead.brand} size="xxs" />}
                      <span className="text-xs font-medium truncate">{lead?.name || task.lead_id}</span>
                      <span className="text-[10px] text-muted-foreground">· {task.due_date}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{task.title}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { completeTask(task.id); toast({ title: `✓ ${task.title}` }); }} className="p-1 rounded hover:bg-primary/10 text-primary transition-colors" title="Complete">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { skipTask(task.id); toast({ title: `Skipped: ${task.title}` }); }} className="p-1 rounded hover:bg-secondary text-muted-foreground transition-colors" title="Skip">
                      <SkipForward className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PrepBriefSheet
        open={!!briefData}
        onClose={() => setBriefData(null)}
        brief={briefData?.brief || null}
        leadName={briefData?.leadName || ""}
      />

      {/* Draft Email Sheet */}
      <Sheet open={!!draftLead} onOpenChange={(o) => { if (!o) setDraftLead(null); }}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm">{draftLead?.meetings?.length ? "Draft Follow-Up" : "Draft Pre-Meeting Email"} — {draftLead?.name}</SheetTitle>
            <SheetDescription className="sr-only">AI-generated email draft for {draftLead?.name}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {draftLoading ? (
              <div className="flex items-center justify-center py-12 border border-border rounded-md">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-xs text-muted-foreground">Generating AI draft...</span>
              </div>
            ) : (
              <textarea
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                className="w-full min-h-[280px] text-sm font-mono leading-relaxed p-3 border border-border rounded-md bg-background resize-y"
                placeholder="AI draft will appear here..."
              />
            )}
            {draftContent && (
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(draftContent); toast({ title: "Copied to clipboard" }); }}
                  className="flex-1 text-xs py-2.5 rounded-md bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => { setDraftContent(""); handleDraftEmail(draftLead!); }}
                  className="text-xs px-3 py-2.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  Regenerate
                </button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Collapsible Enrichment Section ───
function EnrichmentCollapsible({ title, icon: Icon, iconColor, children }: { title: string; icon: typeof Target; iconColor: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-full px-4 py-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className={`h-3 w-3 ${iconColor}`} />
        {title}
      </button>
      {open && <div className="px-4 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

// ─── Enrichment Deep Sections ───
function EnrichmentSections({ enrichment, lead, onUpdateLead }: { enrichment: any; lead: Lead; onUpdateLead: (id: string, updates: Partial<Lead>) => void }) {
  const hasProspectProfile = !!enrichment.prospectProfile;
  const hasCompanyDossier = !!enrichment.companyDossier;
  const hasCompetitive = !!enrichment.competitivePositioning;
  const hasSuggested = enrichment.suggestedUpdates && typeof enrichment.suggestedUpdates === "object" && Object.keys(enrichment.suggestedUpdates).length > 0;
  const hasPreMeetingAmmo = enrichment.preMeetingAmmo && Array.isArray(enrichment.preMeetingAmmo) && enrichment.preMeetingAmmo.length > 0;
  const hasDecisionMakers = !!enrichment.decisionMakers;
  const hasAcquisitionCriteria = !!enrichment.acquisitionCriteria;

  const hasAnything = hasProspectProfile || hasCompanyDossier || hasCompetitive || hasSuggested || hasPreMeetingAmmo || hasDecisionMakers || hasAcquisitionCriteria;
  if (!hasAnything) return null;

  const handleApplySuggestion = (field: string, value: string) => {
    const updates: Partial<Lead> = {};
    if (field === "stage") updates.stage = value as Lead["stage"];
    else if (field === "priority") updates.priority = value as Lead["priority"];
    else if (field === "icp_fit" || field === "icpFit") updates.icpFit = value as Lead["icpFit"];
    else if (field === "buyer_type" || field === "buyerType") updates.buyerType = value as Lead["buyerType"];
    else if (field === "service_interest" || field === "serviceInterest") updates.serviceInterest = value as Lead["serviceInterest"];
    else return;
    onUpdateLead(lead.id, updates);
    toast({ title: `Updated ${field}`, description: `Set to "${value}"` });
  };

  return (
    <>
      {/* Prospect Profile */}
      {hasProspectProfile && (
        <EnrichmentCollapsible title="Prospect Profile" icon={Users} iconColor="text-purple-500">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{enrichment.prospectProfile}</p>
        </EnrichmentCollapsible>
      )}

      {/* Company Intel */}
      {(hasCompanyDossier || hasDecisionMakers || hasAcquisitionCriteria) && (
        <EnrichmentCollapsible title="Company Intel" icon={Building2} iconColor="text-blue-500">
          {hasCompanyDossier && <p className="text-[11px] text-muted-foreground leading-relaxed">{enrichment.companyDossier}</p>}
          {hasDecisionMakers && (
            <div className="mt-1.5">
              <span className="text-[10px] font-semibold text-foreground">Decision Makers: </span>
              <span className="text-[11px] text-muted-foreground">{enrichment.decisionMakers}</span>
            </div>
          )}
          {hasAcquisitionCriteria && (
            <div className="mt-1.5">
              <span className="text-[10px] font-semibold text-foreground">Acquisition Criteria: </span>
              <span className="text-[11px] text-muted-foreground">{enrichment.acquisitionCriteria}</span>
            </div>
          )}
        </EnrichmentCollapsible>
      )}

      {/* Pre-Meeting Ammo */}
      {hasPreMeetingAmmo && (
        <EnrichmentCollapsible title="Talking Points" icon={Zap} iconColor="text-amber-500">
          <ul className="space-y-1">
            {(enrichment.preMeetingAmmo as any[]).map((item: any, i: number) => (
              <li key={i} className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{typeof item === "string" ? item : item.point || item.topic}</span>
                {typeof item !== "string" && item.whyItMatters && (
                  <span className="text-muted-foreground"> — {item.whyItMatters}</span>
                )}
              </li>
            ))}
          </ul>
        </EnrichmentCollapsible>
      )}

      {/* Competitive Landscape */}
      {hasCompetitive && (
        <EnrichmentCollapsible title="Competitive Landscape" icon={Swords} iconColor="text-red-500">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{enrichment.competitivePositioning}</p>
          {enrichment.competitorTools && (
            <div className="mt-1.5">
              <span className="text-[10px] font-semibold text-foreground">Competitor Tools: </span>
              <span className="text-[11px] text-muted-foreground">{enrichment.competitorTools}</span>
            </div>
          )}
        </EnrichmentCollapsible>
      )}

      {/* Suggested CRM Updates */}
      {hasSuggested && (
        <EnrichmentCollapsible title="Suggested CRM Updates" icon={Settings2} iconColor="text-emerald-500">
          <div className="space-y-1.5">
            {Object.entries(enrichment.suggestedUpdates as Record<string, any>).map(([field, suggestion]: [string, any]) => {
              const value = typeof suggestion === "string" ? suggestion : suggestion?.value;
              const reason = typeof suggestion === "object" ? suggestion?.reason : "";
              if (!value) return null;
              return (
                <div key={field} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-medium text-foreground">{field}: </span>
                    <span className="text-[11px] text-muted-foreground">{value}</span>
                    {reason && <span className="text-[10px] text-muted-foreground/70 block">{reason}</span>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleApplySuggestion(field, value); }}
                    className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              );
            })}
          </div>
        </EnrichmentCollapsible>
      )}
    </>
  );
}

function IntelCard({ lead, onSelect, emailCount, onBriefGenerated, onDraftEmail, onUpdateLead }: { lead: Lead; onSelect: () => void; emailCount: number; onBriefGenerated: (leadId: string, leadName: string, brief: PrepBrief) => void; onDraftEmail: (lead: Lead) => void; onUpdateLead: (id: string, updates: Partial<Lead>) => void }) {
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [enrichmentUpdated, setEnrichmentUpdated] = useState(false);
  const [deepIntelOpen, setDeepIntelOpen] = useState(false);
  const [briefBattleCard, setBriefBattleCard] = useState<Partial<PrepBrief>>({});
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
  const weOwe = openActions.filter(a => a.owner?.toLowerCase() !== lead.name?.toLowerCase());
  const theyOwe = openActions.filter(a => a.owner?.toLowerCase() === lead.name?.toLowerCase());
  const openObjections = di?.objectionTracker?.filter(o => o.status === "Open" || o.status === "Recurring") || [];
  const risks = di?.riskRegister?.filter(r => r.mitigationStatus !== "Mitigated") || [];
  const hasPrepItems = openObjections.length > 0 || weOwe.length > 0 || theyOwe.length > 0 || risks.length > 0;

  // Context items
  const hasMessage = lead.message && lead.message.length > 0;
  const hasCompanyDesc = !!enrichment?.companyDescription;
  const hasMotivation = !!enrichment?.buyerMotivation;
  const hasUrgency = !!enrichment?.urgency;
  const hasContext = hasMessage || hasCompanyDesc || hasMotivation || hasUrgency;

  // Deep intel items
  const hasWinStrategy = winStrategy && (winStrategy.numberOneCloser || winStrategy.powerMove || buyingCommittee?.champion);
  const hasPsych = psych && (psych.realWhy || psych.unspokenAsk);
  const hasContextGrid = (lead.serviceInterest && lead.serviceInterest !== "TBD") || signals?.buyingIntent || di?.momentumSignals?.momentum || lead.buyerType && lead.buyerType !== "TBD";
  const hasDeepIntel = hasWinStrategy || hasPsych || hasContextGrid || di?.dealNarrative;

  const handleGeneratePrep = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setGeneratingPrep(true);
    try {
      const hasMeetings = lead.meetings && lead.meetings.length > 0;
      const fnName = hasMeetings ? "generate-meeting-prep" : "enrich-lead";
      const body = hasMeetings
        ? {
            meetings: lead.meetings,
            leadFields: {
              name: lead.name, company: lead.company, role: lead.role,
              stage: lead.stage, priority: lead.priority,
              dealValue: lead.dealValue, serviceInterest: lead.serviceInterest,
            },
            dealIntelligence: lead.dealIntelligence || null,
          }
        : {
            companyUrl: lead.companyUrl,
            leadName: lead.name,
            leadMessage: lead.message,
            leadRole: lead.role,
            leadCompany: lead.company,
            leadStage: lead.stage,
            leadPriority: lead.priority,
            leadDealValue: lead.dealValue,
            leadServiceInterest: lead.serviceInterest,
            leadBuyerType: lead.buyerType,
            leadTargetCriteria: lead.targetCriteria,
            leadTargetRevenue: lead.targetRevenue,
            leadGeography: lead.geography,
            leadAcquisitionStrategy: lead.acquisitionStrategy,
            leadNotes: lead.notes,
            leadLinkedinUrl: lead.linkedinUrl || "",
            leadLinkedinTitle: lead.linkedinTitle || "",
            meetings: lead.meetings || [],
            dealIntelligence: lead.dealIntelligence || null,
          };
      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      if (data?.brief) {
        setBriefBattleCard({
          openingHook: data.brief.openingHook,
          theOneInsight: data.brief.theOneInsight,
          landmines: data.brief.landmines,
          keyQuestions: data.brief.keyQuestions,
          meetingGoal: data.brief.meetingGoal,
        });
        onBriefGenerated(lead.id, lead.name, data.brief);
        toast({ title: "Prep brief ready", description: `Battle card generated for ${lead.name}` });
      } else if (!hasMeetings && data?.enrichment) {
        const { error: dbErr } = await supabase.from("leads").update({
          enrichment: data.enrichment,
          enrichment_status: "complete",
        }).eq("id", lead.id);
        if (dbErr) {
          toast({ title: "Failed to save research", description: dbErr.message, variant: "destructive" });
        } else {
          // Push enrichment into local React state so the card re-renders immediately
          onUpdateLead(lead.id, { enrichment: data.enrichment, enrichmentStatus: "complete" });
          setEnrichmentUpdated(true);
          toast({ title: "Prospect researched", description: `Battle card saved for ${lead.name}` });
        }
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
    <div onClick={onSelect} className="border border-border rounded-lg cursor-pointer hover:bg-secondary/10 transition-colors overflow-hidden">
      {/* ─── HEADER ─── */}
      <div className="px-4 pt-4 pb-3 space-y-2">
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

        {/* Signal strip */}
        <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
          {hasCalendly && lead.calendlyEventName && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
              <CalendarCheck className="h-2.5 w-2.5" />
              {lead.calendlyEventName}{lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration}m` : ""}
            </span>
          )}
          {meetingCount > 0 && (
            <span className="flex items-center gap-1"><Mic className="h-2.5 w-2.5" />{meetingCount} mtg{meetingCount !== 1 ? "s" : ""}</span>
          )}
          {emailCount > 0 && (
            <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{emailCount}</span>
          )}
          <span className={`tabular-nums font-medium ${lead.dealValue === 0 ? "text-muted-foreground" : ""}`}>${lead.dealValue.toLocaleString()}</span>
          {lead.stage && <span className="px-1.5 py-0.5 rounded bg-secondary">{lead.stage}</span>}
        </div>
      </div>

      {/* ─── ZONE 1: BATTLE CARD + ACTIONS ─── */}
      <div className="border-t border-border bg-secondary/20 px-4 py-3">
        <div className="flex gap-4">
          {/* Left: Battle card content */}
          <div className="flex-1 min-w-0 space-y-2.5">
            {/* Battle card fields from AI (meeting prep or enrichment) */}
            {(briefBattleCard.openingHook || enrichment?.openingHook) ? (
              <>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Opening</span>
                  </div>
                  <p className="text-[11px] text-foreground italic leading-relaxed">
                    "<CitedText text={stripQuotes((briefBattleCard.openingHook || enrichment?.openingHook) as string)} />"
                  </p>
                </div>

                {(briefBattleCard.theOneInsight || enrichment?.valueAngle) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Lightbulb className="h-3 w-3 text-amber-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        {briefBattleCard.theOneInsight ? "#1 Insight" : "Value Angle"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      <CitedText text={(briefBattleCard.theOneInsight || enrichment?.valueAngle) as string} />
                    </p>
                  </div>
                )}

                {/* KEY INSIGHTS */}
                {enrichment?.keyInsights && Array.isArray(enrichment.keyInsights) && (enrichment.keyInsights as string[]).length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Key className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Key Insights</span>
                    </div>
                    <ul className="space-y-0.5">
                      {(enrichment.keyInsights as string[]).slice(0, 5).map((insight: string, i: number) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary shrink-0">•</span><CitedText text={insight} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {briefBattleCard.meetingGoal && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Crown className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Goal</span>
                    </div>
                    <p className="text-[11px] font-medium text-foreground">{briefBattleCard.meetingGoal}</p>
                  </div>
                )}

                {((briefBattleCard.landmines && briefBattleCard.landmines.length > 0) || (enrichment?.watchOuts && (enrichment.watchOuts as string[]).length > 0)) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Don't Mention</span>
                    </div>
                    <ul className="space-y-0.5">
                      {(briefBattleCard.landmines || (enrichment?.watchOuts as string[]) || []).map((item: string, i: number) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <span className="text-red-500 shrink-0">⚠</span><CitedText text={item} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {((briefBattleCard.keyQuestions && briefBattleCard.keyQuestions.length > 0) || (enrichment?.discoveryQuestions && (enrichment.discoveryQuestions as string[]).length > 0)) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Brain className="h-3 w-3 text-purple-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Ask</span>
                    </div>
                    <ol className="space-y-0.5">
                      {(briefBattleCard.keyQuestions || (enrichment?.discoveryQuestions as string[]) || []).slice(0, 5).map((q: string, i: number) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <span className="text-purple-500 font-semibold shrink-0">{i + 1}.</span>
                          <span>"<CitedText text={stripQuotes(q)} />"</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {enrichment?.dataSources && (
                  <SourcesCitation dataSources={enrichment.dataSources as string} />
                )}
              </>
            ) : hasPrepItems ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">Prepare</span>
                </div>
                {openObjections.slice(0, 3).map((o, i) => (
                  <div key={`obj-${i}`} className="flex items-start gap-1.5 text-[11px]">
                    <MessageSquare className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground"><span className="font-medium text-foreground">Objection:</span> "{o.objection}"</span>
                  </div>
                ))}
                {weOwe.slice(0, 3).map((a, i) => (
                  <div key={`we-${i}`} className="flex items-start gap-1.5 text-[11px]">
                    <AlertTriangle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground"><span className="font-medium text-foreground">We owe:</span> {a.item}</span>
                  </div>
                ))}
                {theyOwe.slice(0, 2).map((a, i) => (
                  <div key={`they-${i}`} className="flex items-start gap-1.5 text-[11px]">
                    <Target className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground"><span className="font-medium text-foreground">They owe:</span> {a.item}</span>
                  </div>
                ))}
                {risks.slice(0, 2).map((r, i) => (
                  <div key={`risk-${i}`} className="flex items-start gap-1.5 text-[11px]">
                    <Shield className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground"><span className="font-medium text-foreground">Risk:</span> {r.risk}</span>
                  </div>
                ))}
              </div>
            ) : latestMeeting ? (
              (() => {
                const summary = (latestMeeting as any)?.intelligence?.summary || latestMeeting?.summary;
                return summary ? (
                  <p className="text-[10px] text-muted-foreground line-clamp-2 italic">
                    <span className="font-medium text-foreground not-italic">Last meeting: </span>{summary}
                  </p>
                ) : <p className="text-[11px] text-muted-foreground italic">Click Prep Brief to generate your battle card</p>;
              })()
            ) : (
              <p className="text-[11px] text-muted-foreground italic">No intel yet — click Research to generate a battle card</p>
            )}
          </div>

          {/* Right: Action buttons */}
          <div className="flex flex-col gap-1.5 shrink-0 w-[140px]">
            <button
              onClick={handleGeneratePrep}
              disabled={generatingPrep}
              className="text-[11px] py-1.5 px-2.5 rounded-md border border-border bg-background text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-1.5 font-medium"
            >
              {generatingPrep ? <Loader2 className="h-3 w-3 animate-spin" /> : meetingCount > 0 ? <Zap className="h-3 w-3" /> : enrichmentUpdated ? <Zap className="h-3 w-3 text-emerald-500" /> : <Target className="h-3 w-3" />}
              {generatingPrep ? "Working..." : meetingCount > 0 ? (hasIntel ? "Regen Brief" : "Prep Brief") : enrichmentUpdated ? "✓ Enriched" : "Research"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDraftEmail(lead); }}
              className="text-[11px] py-1.5 px-2.5 rounded-md border border-border bg-background text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-1.5 font-medium"
            >
              <Send className="h-3 w-3" />
              {meetingCount > 0 ? "Draft Follow-Up" : "Draft Email"}
            </button>
            <a
              href={`/deal-room/${lead.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] py-1.5 px-2.5 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-1.5"
            >
              Deal Room →
            </a>
          </div>
        </div>
      </div>

      {/* ─── ZONE 2: CONTEXT ─── */}
      {hasContext && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Context</span>
          </div>
          {hasMessage && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              <span className="font-medium text-foreground">Prospect said: </span>"{lead.message!.slice(0, 200)}{lead.message!.length > 200 ? "…" : ""}"
            </p>
          )}
          {hasCompanyDesc && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              <span className="font-medium text-foreground">Company: </span>{(enrichment!.companyDescription as string).slice(0, 200)}
            </p>
          )}
          {hasMotivation && (
            <p className="text-[11px] text-muted-foreground line-clamp-1">
              <span className="font-medium text-foreground">Motivation: </span>{enrichment!.buyerMotivation}
            </p>
          )}
          {hasUrgency && (
            <p className="text-[11px] text-muted-foreground line-clamp-1">
              <span className="font-medium text-foreground">Urgency: </span>{enrichment!.urgency}
            </p>
          )}
        </div>
      )}

      {/* ─── ZONE 2B: ENRICHMENT DEEP SECTIONS (collapsed) ─── */}
      {enrichment && (
        <EnrichmentSections enrichment={enrichment} lead={lead} onUpdateLead={onUpdateLead} />
      )}

      {hasDeepIntel && (
        <div className="border-t border-border">
          <button
            onClick={(e) => { e.stopPropagation(); setDeepIntelOpen(!deepIntelOpen); }}
            className="w-full px-4 py-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors"
          >
            {deepIntelOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Deep Intel
          </button>

          {deepIntelOpen && (
            <div className="px-4 pb-3 space-y-3">
              {/* Deal Narrative */}
              {di?.dealNarrative && (
                <p className="text-[10px] text-muted-foreground italic line-clamp-3">{di.dealNarrative}</p>
              )}

              {/* Win Strategy */}
              {hasWinStrategy && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Crown className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Win Strategy</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    {winStrategy!.numberOneCloser && <div><span className="text-muted-foreground">#1 Closer: </span><span className="font-medium">{winStrategy!.numberOneCloser}</span></div>}
                    {winStrategy!.powerMove && <div><span className="text-muted-foreground">Power Move: </span><span className="font-medium">{winStrategy!.powerMove}</span></div>}
                    {buyingCommittee?.champion && <div className="flex items-center gap-1"><Users className="h-3 w-3 text-emerald-500 shrink-0" /><span className="text-muted-foreground">Champion: </span><span className="font-medium">{buyingCommittee.champion}</span></div>}
                    {winStrategy!.negotiationStyle && <div><span className="text-muted-foreground">Negotiation: </span><span className="font-medium">{winStrategy!.negotiationStyle}</span></div>}
                    {winStrategy!.closingWindow && <div><span className="text-muted-foreground">Window: </span><span className="font-medium">{winStrategy!.closingWindow}</span></div>}
                  </div>
                </div>
              )}

              {/* Psychological Profile */}
              {hasPsych && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Brain className="h-3 w-3 text-purple-500" />
                    <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Psychology</span>
                  </div>
                  {psych!.realWhy && <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Core motivation:</span> {psych!.realWhy}</p>}
                  {psych!.unspokenAsk && <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Unspoken ask:</span> {psych!.unspokenAsk}</p>}
                  {psych!.fearFactor && <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Fear factor:</span> {psych!.fearFactor}</p>}
                </div>
              )}

              {/* Context Grid */}
              {hasContextGrid && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                  {lead.serviceInterest && lead.serviceInterest !== "TBD" && <div><span className="text-muted-foreground">Interest: </span><span className="font-medium">{lead.serviceInterest}</span></div>}
                  {signals?.buyingIntent && <div><span className="text-muted-foreground">Intent: </span><span className={`font-medium ${signals.buyingIntent === "Strong" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{signals.buyingIntent}</span></div>}
                  {signals?.sentiment && <div><span className="text-muted-foreground">Sentiment: </span><span className="font-medium">{signals.sentiment}</span></div>}
                  {di?.momentumSignals?.momentum && <div><span className="text-muted-foreground">Momentum: </span><span className="font-medium">{di.momentumSignals.momentum}</span></div>}
                  {lead.buyerType && lead.buyerType !== "TBD" && <div><span className="text-muted-foreground">Buyer: </span><span className="font-medium">{lead.buyerType}</span></div>}
                  {lead.geography && lead.geography !== "TBD" && <div><span className="text-muted-foreground">Geo: </span><span className="font-medium">{lead.geography}</span></div>}
                  {lead.targetCriteria && lead.targetCriteria !== "TBD" && <div className="col-span-2"><span className="text-muted-foreground">Criteria: </span><span className="font-medium">{lead.targetCriteria}</span></div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
