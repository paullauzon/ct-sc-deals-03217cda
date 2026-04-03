import { useState, useEffect, useRef, useCallback, DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { useLeads } from "@/contexts/LeadContext";
import { useProcessing } from "@/contexts/ProcessingContext";
import { LeadStage, Lead } from "@/types/lead";
import { LeadDetail } from "@/components/LeadsTable";
import { computeDaysInStage, getCompanyAssociates } from "@/lib/leadUtils";
import { PipelineFilterBar, PipelineFilters, matchesFilters } from "@/components/PipelineFilters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

import { Search, X, Sparkles, Loader2, Plus, CheckSquare, RefreshCw, Users, Check, Linkedin, CalendarCheck, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getBrandBorderClass } from "@/lib/brandColors";
import { BrandLogo } from "@/components/BrandLogo";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { computeDealHealthScore, getWinLoseCard, getStakeholderCoverage, getDroppedPromises, markActionItemDone } from "@/lib/dealHealthUtils";

const ALL_STAGES: LeadStage[] = [
  "New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent",
  "Closed Won", "Closed Lost", "Went Dark",
];

const CLOSED_STAGES: LeadStage[] = ["Closed Won", "Closed Lost", "Went Dark"];

const OWNER_COLORS: Record<string, string> = {
  Malik: "bg-foreground text-background",
  Valeria: "bg-foreground/70 text-background",
  Tomos: "bg-foreground/40 text-background",
};

function getClosingInsight(lead: Lead): { text: string } | null {
  const meetingsWithIntel = lead.meetings?.filter(m => m.intelligence).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = meetingsWithIntel?.[0]?.intelligence;
  if (!latest) return null;

  const trunc = (s: string) => s.length > 60 ? s.slice(0, 57) + "…" : s;

  if (latest.dealSignals?.objections?.length > 0) {
    return { text: trunc(latest.dealSignals.objections[0]) };
  }
  if (latest.painPoints?.length > 0) {
    return { text: trunc(latest.painPoints[0]) };
  }
  if (latest.dealSignals?.timeline && latest.dealSignals.timeline !== "Not mentioned" && latest.dealSignals.timeline !== "None mentioned") {
    return { text: trunc(latest.dealSignals.timeline) };
  }
  if (latest.dealSignals?.sentiment && latest.dealSignals?.buyingIntent) {
    return { text: trunc(`${latest.dealSignals.sentiment} · ${latest.dealSignals.buyingIntent} intent`) };
  }
  return null;
}

function OwnerBadge({ owner }: { owner: string }) {
  if (!owner) {
    return (
      <span className="w-6 h-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center text-[10px] text-muted-foreground/50 shrink-0" title="Unassigned">
        ?
      </span>
    );
  }
  const initial = owner[0];
  const colorClass = OWNER_COLORS[owner] || "bg-muted text-muted-foreground";
  return (
    <span
      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${colorClass}`}
      title={owner}
    >
      {initial}
    </span>
  );
}

function getAgingClass(days: number): string {
  if (days >= 21) return "border-foreground/30";
  return "border-border";
}

function QuickNote({ lead, onSave, onFollowUp }: { lead: Lead; onSave: (id: string, note: string) => void; onFollowUp: (id: string, date: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const handleSave = () => {
    if (!text.trim() && !followUpDate) return;
    if (text.trim()) {
      const timestamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const newNote = `[${timestamp}] ${text.trim()}`;
      const existing = lead.notes ? `${lead.notes}\n${newNote}` : newNote;
      onSave(lead.id, existing);
    }
    if (followUpDate) {
      onFollowUp(lead.id, followUpDate);
    }
    setText("");
    setFollowUpDate("");
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-secondary transition-colors"
          title="Quick note + follow-up"
        >
          <Plus className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium mb-1.5">Quick Note — {lead.name}</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="After the call…"
          className="text-xs min-h-[60px] mb-2"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave(); }}
        />
        <div className="mb-2">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Next Follow-up</label>
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={handleSave} className="text-xs px-2.5 py-1 bg-foreground text-background rounded hover:bg-foreground/80">Save</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Pipeline() {
  const { getLeadsByStage, updateLead, leads, isLeadNew, markLeadSeen } = useLeads();
  const pipelineNavigate = useNavigate();
  const { leadJobs } = useProcessing();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<PipelineFilters | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkAction = (field: string, value: string) => {
    const count = selectedIds.size;
    selectedIds.forEach(id => {
      updateLead(id, { [field]: value } as any);
    });
    toast.success(`Updated ${field} to "${value}" for ${count} deal${count !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleFiltersChange = useCallback((filters: PipelineFilters) => {
    setActiveFilters(filters);
  }, []);

  const handleQuickNote = useCallback((id: string, notes: string) => {
    updateLead(id, { notes });
  }, [updateLead]);

  const handleFollowUp = useCallback((id: string, date: string) => {
    updateLead(id, { nextFollowUp: date });
  }, [updateLead]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearchQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const matchesSearchAndFilters = (lead: Lead) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const searchMatch = [lead.name, lead.company, lead.role, lead.email, lead.serviceInterest, lead.notes]
        .some(f => f?.toLowerCase().includes(q));
      if (!searchMatch) return false;
    }
    if (activeFilters) {
      if (!matchesFilters(lead, activeFilters)) return false;
    }
    return true;
  };

  const handleDragStart = (e: DragEvent, leadId: string) => {
    e.dataTransfer.setData("text/plain", leadId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDragLeave = () => setDragOverStage(null);

  const handleDrop = (e: DragEvent, targetStage: LeadStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData("text/plain");
    if (leadId) {
      updateLead(leadId, { stage: targetStage });
    }
  };

  const isClosed = (stage: LeadStage) => CLOSED_STAGES.includes(stage);

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
            <span className="text-sm text-muted-foreground tabular-nums">${leads.reduce((s, l) => s + l.dealValue, 0).toLocaleString()} total value</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Drag deals between stages</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={selectMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
            className="h-8 text-xs gap-1.5"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectMode ? "Cancel" : "Select"}
          </Button>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deals…"
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        </div>
      </div>

      <PipelineFilterBar leads={leads} onFiltersChange={handleFiltersChange} />

      <div className="flex gap-4 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory">
        {ALL_STAGES.map((stage) => {
          const allStageLeads = getLeadsByStage(stage);
          const stageLeads = allStageLeads.filter(matchesSearchAndFilters);
          const totalValue = stageLeads.reduce((s, l) => s + l.dealValue, 0);
          const isOver = dragOverStage === stage;
          const closed = isClosed(stage);
          return (
            <div
              key={stage}
              className={`min-w-[280px] flex-shrink-0 snap-start rounded-md p-2 transition-colors ${closed ? "bg-muted/30" : ""} ${isOver ? "bg-secondary/50 ring-1 ring-foreground/20" : ""}`}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <div className="border-b-2 border-foreground pb-2 mb-3 flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wider">{stage}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {searchQuery ? `${stageLeads.length} of ${allStageLeads.length}` : stageLeads.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2 tabular-nums">${totalValue.toLocaleString()}</p>
              <div className="space-y-2">
                {stageLeads.map((lead) => {
                  const days = computeDaysInStage(lead.stageEnteredDate);
                  const brandAbbr = lead.brand === "Captarget" ? "CT" : "SC";
                  const associates = getCompanyAssociates(lead, leads);
                  return (
                    <div
                      key={lead.id}
                      draggable={!selectMode}
                      onDragStart={(e) => !selectMode && handleDragStart(e, lead.id)}
                      onClick={() => {
                        if (selectMode) { toggleSelect(lead.id); }
                        else { setSelectedLeadId(lead.id); markLeadSeen(lead.id); }
                      }}
                      className={cn(
                        "rounded-md p-4 transition-colors space-y-2.5",
                        getBrandBorderClass(lead.brand),
                        selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                        selectedIds.has(lead.id) ? "border-2 border-primary bg-primary/5" : "border border-border " + getAgingClass(days) + " hover:bg-secondary/30"
                      )}
                    >
                      {/* Row 1: Name + Owner */}
                      <div className="flex items-start gap-1.5">
                        {selectMode && (
                          <Checkbox
                            checked={selectedIds.has(lead.id)}
                            onCheckedChange={() => toggleSelect(lead.id)}
                            className="mt-0.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
                            <BrandLogo brand={lead.brand} size="xxs" />
                            {lead.name}
                            {isLeadNew(lead.id) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-foreground/10 text-foreground animate-pulse">NEW</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CompanyAvatar companyUrl={lead.companyUrl} email={lead.email} companyName={lead.company} size="xs" />
                            {lead.company || "—"} · {lead.role}
                          </p>
                        </div>
                        <QuickNote lead={lead} onSave={handleQuickNote} onFollowUp={handleFollowUp} />
                        <OwnerBadge owner={lead.assignedTo} />
                      </div>
                      {/* Row 2: Multi-submission / associates */}
                      {(lead.submissions?.length > 1 || associates.length > 0) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {lead.submissions?.length > 1 && (
                            <span className="flex items-center gap-0.5"><RefreshCw className="h-2.5 w-2.5" /> {lead.submissions.length} submissions</span>
                          )}
                          {associates.length > 0 && (
                            <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> {associates.length + 1} at {lead.company}</span>
                          )}
                        </div>
                      )}
                      {/* Row 3: Value + Priority + Closing insight */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}</span>
                        <div className="flex items-center gap-1">
                          {lead.preScreenCompleted && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-0.5" title="Pre-screen completed">
                              <Check className="h-2.5 w-2.5" /> PS
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${lead.priority === "High" ? "bg-foreground/10 font-medium" : ""}`}>{lead.priority}</span>
                        </div>
                      </div>
                      {/* Row 4: Days in stage + meetings + insight inline */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className={`tabular-nums ${days > 14 ? "text-foreground font-medium" : ""}`}>{days}d in stage</span>
                        <div className="flex items-center gap-1.5">
                          {lead.linkedinUrl && (
                            <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={lead.linkedinTitle || "LinkedIn"}>
                              <Linkedin className="h-3.5 w-3.5 text-[#0A66C2] hover:opacity-80 transition-colors" />
                            </a>
                          )}
                          {lead.calendlyBookedAt && lead.meetingDate && (
                            <div className="flex flex-col text-[10px] text-primary font-medium">
                              <span className="flex items-center gap-0.5">
                                <CalendarCheck className="h-3 w-3 shrink-0" />
                                <span className="whitespace-nowrap">{lead.calendlyEventName || "Calendly"}</span>
                              </span>
                              <span className="text-[9px] text-muted-foreground pl-3.5 whitespace-nowrap">
                                {lead.calendlyEventDuration ? `${lead.calendlyEventDuration} min` : ""}{lead.meetingDate ? ` · ${(() => { try { return format(new Date(lead.meetingDate), "MMM d, h:mm a"); } catch { return ""; } })()}` : ""}
                              </span>
                            </div>
                          )}
                          {lead.meetings?.length > 0 && (
                            <div className="flex items-center gap-1">
                              <BrandLogo brand={lead.brand} size="xxs" />
                              <img src="/fireflies-icon.svg" alt="Meetings" className="w-3.5 h-3.5" />
                              <span className="text-[10px] tabular-nums font-medium">{lead.meetings.length}</span>
                            </div>
                          )}
                          {lead.meetingOutcome && <span>{lead.meetingOutcome}</span>}
                        </div>
                      </div>
                      {/* Row 4b: Closing insight — own full-width row */}
                      {(() => {
                        const insight = getClosingInsight(lead);
                        return insight ? (
                          <p className="text-[10px] text-muted-foreground/70 italic truncate" title={insight.text}>
                            "{insight.text}"
                          </p>
                        ) : null;
                      })()}
                      {/* Row 5: Deal Health + Stakeholder Coverage + Intelligence */}
                      {(() => {
                        const health = computeDealHealthScore(lead);
                        const coverage = getStakeholderCoverage(lead);
                        const dropped = getDroppedPromises(lead);
                        const winLose = !closed ? getWinLoseCard(lead) : null;
                        const momentum = lead.dealIntelligence?.momentumSignals?.momentum;
                        const momentumLabel = momentum === "Accelerating" ? "Gaining speed" :
                          momentum === "Stalling" ? "Losing steam" :
                          momentum === "Stalled" ? "Gone quiet" :
                          momentum === "Steady" ? "Steady pace" : momentum;
                        const hasIntelBadges = health || coverage || momentum || dropped.length > 0;

                        return hasIntelBadges ? (
                          <div className="space-y-1.5 pt-2 border-t border-border/50">
                            <div className="flex items-center gap-2 text-[10px] flex-wrap">
                              {health && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="px-2 py-1 rounded bg-secondary text-foreground/70 font-medium tabular-nums">
                                      Health: {health.score}/100
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[220px] p-3">
                                    <div className="flex items-baseline gap-2 mb-2">
                                      <span className="text-lg font-semibold font-mono">{health.score}</span>
                                      <span className="text-xs text-muted-foreground">/ 100 · {health.label}</span>
                                    </div>
                                    <div className="space-y-0.5">
                                      {health.factors.map((f, i) => (
                                        <p key={i} className="text-xs text-muted-foreground font-mono">
                                          <span className="inline-block w-8 text-right">{f.impact > 0 ? "+" : ""}{f.impact}</span> {f.label}
                                        </p>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {coverage && (
                                <span className="px-2 py-1 rounded bg-secondary text-muted-foreground">
                                  {coverage.label}
                                </span>
                              )}
                              {momentumLabel && (
                                <span className="px-2 py-1 rounded bg-secondary text-muted-foreground">
                                  {momentumLabel}
                                </span>
                              )}
                              {lead.enrichment && (
                                <span className="px-2 py-1 rounded bg-secondary text-muted-foreground">AI</span>
                              )}
                            </div>
                            {/* Action summary — clean clickable line */}
                            {dropped.length > 0 && !closed && (
                              <div
                                onClick={(e) => { e.stopPropagation(); pipelineNavigate(`/deal/${lead.id}?tab=actions`); }}
                                className="mt-0.5 flex w-full items-center gap-1.5 px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 text-[11px] font-semibold text-foreground/80 hover:text-foreground cursor-pointer transition-all"
                              >
                                <span>{dropped.length} pending action{dropped.length > 1 ? "s" : ""}</span>
                                {lead.nextFollowUp && (() => {
                                  try {
                                    const d = new Date(lead.nextFollowUp);
                                    return <span className="ml-auto text-muted-foreground font-normal">Follow-up {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>;
                                  } catch { return null; }
                                })()}
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              </div>
                            )}
                            {!dropped.length && winLose && winLose.doNext !== "—" && !closed && (
                              <div
                                onClick={(e) => { e.stopPropagation(); pipelineNavigate(`/deal/${lead.id}?tab=actions`); }}
                                className="mt-0.5 flex w-full items-center gap-1.5 px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 text-[11px] font-semibold text-foreground/80 hover:text-foreground cursor-pointer transition-all"
                              >
                                <span className="truncate">{winLose.doNext}</span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-auto text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        ) : lead.dealIntelligence?.riskRegister?.filter(r => r.mitigationStatus !== "Mitigated").length ? (
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                              {lead.dealIntelligence.riskRegister!.filter(r => r.mitigationStatus !== "Mitigated").length} risks
                            </span>
                          </div>
                        ) : null;
                      })()}
                      {/* Pending suggestions indicator */}
                      {(() => {
                        const job = leadJobs[lead.id];
                        if (!job) return null;
                        if (job.searching) {
                          return (
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground animate-pulse">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Processing…</span>
                            </div>
                          );
                        }
                        if (job.pendingSuggestions?.length > 0) {
                          return (
                            <div className="flex items-center gap-1.5 text-[10px] px-1.5 py-1 rounded bg-secondary text-foreground font-medium">
                              <Sparkles className="h-3 w-3" />
                              <span>{job.pendingSuggestions.length} to review</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {closed && lead.closeReason && (
                        <p className="text-xs text-muted-foreground">Reason: {lead.closeReason}</p>
                      )}
                      {lead.nextFollowUp && !getDroppedPromises(lead).length && (
                        <p className="text-xs text-muted-foreground">Follow-up: {lead.nextFollowUp}</p>
                      )}
                    </div>
                  );
                })}
                {stageLeads.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 py-4 text-center">No deals</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />

      {/* Bulk Action Bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border rounded-lg shadow-lg px-4 py-3">
          <span className="text-sm font-medium tabular-nums">{selectedIds.size} selected</span>
          <div className="h-5 w-px bg-border" />
          <Select onValueChange={(v) => handleBulkAction("stage", v)}>
            <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Move to stage…" /></SelectTrigger>
            <SelectContent>
              {ALL_STAGES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => handleBulkAction("assignedTo", v)}>
            <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Assign to…" /></SelectTrigger>
            <SelectContent>
              {["Malik", "Valeria", "Tomos"].map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => handleBulkAction("priority", v)}>
            <SelectTrigger className="h-8 text-xs w-[100px]"><SelectValue placeholder="Priority…" /></SelectTrigger>
            <SelectContent>
              {["High", "Medium", "Low"].map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSelectedIds(new Set()); }}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
