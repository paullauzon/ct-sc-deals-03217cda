import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lead, LeadStage } from "@/types/lead";
import { BrandLogo } from "@/components/BrandLogo";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Linkedin, X, Maximize2, Minimize2, Heart, ShieldAlert, Users, CalendarCheck,
  Mail, Calendar, FileText, CheckSquare, Zap, Phone, Sparkles, Archive, MoreHorizontal,
  ChevronLeft, ChevronRight, Link2, Check, Globe, Clock, ClipboardCopy, Keyboard,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { computeDealHealthScore, getStakeholderCoverage } from "@/lib/dealHealthUtils";
import { computeWinProbability, computeSlipRisk } from "@/lib/dealPredictions";
import { computeDossierCompleteness } from "@/lib/dealDossier";
import { ACTIVE_STAGES, TERMINAL_STAGES } from "@/lib/leadUtils";
import { isBackwardsMove, getGateForStage } from "@/lib/stageGates";
import { StageGateGuard } from "@/components/lead-panel/dialogs/StageGateGuard";
import { useLeads } from "@/contexts/LeadContext";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLog";
import { supabase } from "@/integrations/supabase/client";
import { StallReasonBanner } from "@/components/lead-panel/StallReasonBanner";

function ClickableProgressBar({ currentStage, onAdvance }: { currentStage: LeadStage; onAdvance: (s: LeadStage) => void }) {
  const currentIdx = ACTIVE_STAGES.indexOf(currentStage);
  const isClosed = TERMINAL_STAGES.includes(currentStage);
  return (
    <div className="flex items-center gap-0.5">
      {ACTIVE_STAGES.map((stage, i) => (
        <button
          key={stage}
          type="button"
          onClick={() => !isClosed && onAdvance(stage)}
          disabled={isClosed}
          className={cn(
            "h-1.5 flex-1 rounded-sm transition-all hover:h-2",
            isClosed ? "bg-muted cursor-not-allowed" :
            i < currentIdx ? "bg-primary/80 hover:bg-primary cursor-pointer" :
            i === currentIdx ? "bg-primary cursor-default" :
            "bg-muted hover:bg-muted-foreground/30 cursor-pointer"
          )}
          title={`${stage}${i === currentIdx ? " (current)" : i < currentIdx ? " — click to revert" : " — click to advance"}`}
        />
      ))}
    </div>
  );
}

function lastContactLabel(lead: Lead): string | null {
  const dates: number[] = [];
  if (lead.lastContactDate) {
    const t = new Date(lead.lastContactDate).getTime();
    if (!isNaN(t)) dates.push(t);
  }
  // Also consider most recent meeting date so the chip stays accurate
  // even when lastContactDate hasn't been written yet.
  for (const m of lead.meetings || []) {
    if (m.date) {
      const t = new Date(m.date).getTime();
      if (!isNaN(t)) dates.push(t);
    }
  }
  if (dates.length === 0) return null;
  const latest = Math.max(...dates);
  const days = Math.floor((Date.now() - latest) / 86400000);
  if (days < 0) return null;
  if (days === 0) return "Last contact today";
  if (days === 1) return "Last contact yesterday";
  if (days < 7) return `Last contact ${days}d ago`;
  if (days < 30) return `Last contact ${Math.floor(days / 7)}w ago`;
  return `Last contact ${Math.floor(days / 30)}mo ago`;
}

interface LeadPanelHeaderProps {
  lead: Lead;
  daysInStage: number;
  mode: "sheet" | "page";
  hasPrev: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEmail: () => void;
  onSchedule: () => void;
  onNote: () => void;
  onTask: () => void;
  onDraftAI: () => void;
  onLogCall: () => void;
  onEnrich: () => void;
  onArchive: () => void;
  onChangeStage: (stage: LeadStage) => void;
  onShowShortcuts: () => void;
  onAskAI: () => void;
  draftingAI?: boolean;
  enriching?: boolean;
  /** When true, shows a compact icon-only action strip in the header (used when the left rail is collapsed). */
  showCompactActions?: boolean;
}



function buildDealSummary(lead: Lead, daysInStage: number, lastContact: string | null): string {
  const lines: string[] = [];
  lines.push(`${lead.name}${lead.role ? `, ${lead.role}` : ""}${lead.company ? ` @ ${lead.company}` : ""}`);
  lines.push(`Stage: ${lead.stage} · ${daysInStage}d in stage`);
  if (lead.dealValue) {
    const tcv = lead.contractMonths ? lead.dealValue * lead.contractMonths : null;
    lines.push(`Value: $${lead.dealValue.toLocaleString()}/mo${tcv ? ` · TCV $${tcv.toLocaleString()}` : ""}${lead.closeConfidence ? ` · ${lead.closeConfidence}% confidence` : ""}`);
  }
  if (lastContact) lines.push(lastContact);
  if (lead.nextMutualStep) lines.push(`Next step: ${lead.nextMutualStep}${lead.nextMutualStepDate ? ` (${lead.nextMutualStepDate})` : ""}`);
  if (lead.competingBankers) lines.push(`Competing: ${lead.competingBankers}`);
  if (lead.assignedTo) lines.push(`Owner: ${lead.assignedTo}`);
  return lines.join("\n");
}

export function LeadPanelHeader({
  lead, daysInStage, mode, hasPrev, hasNext,
  onClose, onPrev, onNext, onEmail, onSchedule, onNote, onTask,
  onDraftAI, onLogCall, onEnrich, onArchive, onChangeStage, onShowShortcuts, onAskAI,
  draftingAI, enriching, showCompactActions,
}: LeadPanelHeaderProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [pendingStage, setPendingStage] = useState<LeadStage | null>(null);
  const [gateStage, setGateStage] = useState<LeadStage | null>(null);
  const [fillingGaps, setFillingGaps] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { updateLead } = useLeads();

  // Fetch unread inbound email count + subscribe to changes
  useEffect(() => {
    let cancelled = false;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id)
        .eq("direction", "inbound")
        .eq("is_read", false);
      if (!cancelled) setUnreadCount(count ?? 0);
    };
    fetchUnread();
    const ch = supabase
      .channel(`unread-${lead.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "lead_emails", filter: `lead_id=eq.${lead.id}` },
        () => fetchUnread())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [lead.id]);

  const dealHealth = computeDealHealthScore(lead);
  const coverage = getStakeholderCoverage(lead);
  const lastContact = lastContactLabel(lead);
  const winProb = computeWinProbability(lead);
  const slipRisk = computeSlipRisk(lead);
  const dossier = computeDossierCompleteness(lead);
  const domain = lead.companyUrl?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || (lead.email?.split("@")[1] ?? "");

  const tryCopy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for restricted iframes
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch { return false; }
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/deal/${lead.id}`;
    const ok = await tryCopy(url);
    if (!ok) { toast.error("Couldn't copy — your browser blocked clipboard access"); return; }
    setCopied(true);
    toast.success("Deal link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const copySummary = async () => {
    const text = buildDealSummary(lead, daysInStage, lastContact);
    const ok = await tryCopy(text);
    if (!ok) { toast.error("Couldn't copy — your browser blocked clipboard access"); return; }
    setSummaryCopied(true);
    toast.success("Deal summary copied");
    setTimeout(() => setSummaryCopied(false), 1500);
  };

  const handleStageClick = (stage: LeadStage) => {
    if (stage === lead.stage) return;
    if (isBackwardsMove(lead.stage, stage)) {
      setPendingStage(stage);
      return;
    }
    // Run v2 gate evaluation — if there's a gate for this destination, show it.
    // The guard handles "all clear" inline (rep clicks Move) so we always show it
    // for stages that have a gate, giving the rep a chance to confirm intent.
    const gate = getGateForStage(stage);
    if (gate) {
      setGateStage(stage);
      return;
    }
    commitStageChange(stage);
  };

  const commitStageChange = async (stage: LeadStage, extraUpdates?: Partial<Lead>) => {
    if (extraUpdates && Object.keys(extraUpdates).length > 0) {
      // Persist gate field edits before stage change so they're saved together
      updateLead(lead.id, extraUpdates);
    }
    onChangeStage(stage);
    await logActivity(lead.id, "stage_change", `Stage: ${lead.stage} → ${stage}`, lead.stage, stage);
    if (stage === "Closed Won") {
      toast.success("Account handed off to Valeria — Client Success pipeline updated");
    } else {
      toast.success(`Moved to ${stage}`);
    }
    setPendingStage(null);
    setGateStage(null);
  };

  // Listen for stage-change requests dispatched from PipelineStagesCard in the right rail
  // so we don't duplicate the close-won/move-back guard modals.
  useEffect(() => {
    const handler = (e: Event) => {
      const stage = (e as CustomEvent).detail?.stage;
      if (stage) handleStageClick(stage);
    };
    window.addEventListener("request-stage-change", handler);
    return () => window.removeEventListener("request-stage-change", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.stage, lead.subscriptionValue, lead.contractEnd]);

  const toggleMaximize = () => {
    if (mode === "sheet") {
      navigate(`/deal/${lead.id}`);
    } else {
      navigate(-1);
    }
  };

  const quickActions = [
    { icon: Mail, label: "Email", onClick: onEmail },
    { icon: Calendar, label: "Schedule", onClick: onSchedule },
    { icon: FileText, label: "Note", onClick: onNote },
    { icon: CheckSquare, label: "Task", onClick: onTask },
    { icon: Zap, label: draftingAI ? "Drafting…" : "Draft AI", onClick: onDraftAI, disabled: draftingAI, animate: draftingAI },
    { icon: Phone, label: "Log call", onClick: onLogCall },
    { icon: Sparkles, label: enriching ? "Enriching…" : "Enrich", onClick: onEnrich, disabled: enriching, animate: enriching },
    { icon: Sparkles, label: "Ask AI", onClick: onAskAI },
  ];

  return (
    <header className="border-b border-border bg-background shrink-0">
      {/* Identity row */}
      <div className="flex items-start gap-3 px-5 py-3">
        <CompanyAvatar
          companyUrl={lead.companyUrl}
          email={lead.email}
          companyName={lead.company}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-semibold truncate">{lead.name}</h1>
            {lead.linkedinUrl && (
              <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={lead.linkedinTitle || "LinkedIn"}>
                <Linkedin className="h-3.5 w-3.5" style={{ color: "#0A66C2" }} />
              </a>
            )}
            <BrandLogo brand={lead.brand} size="sm" />
            <Badge variant="outline" className="text-[10px]">{lead.stage}</Badge>
            {unreadCount > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-foreground/80 font-medium inline-flex items-center gap-1"
                title={`${unreadCount} unread inbound email${unreadCount === 1 ? "" : "s"}`}
              >
                <Mail className="h-2.5 w-2.5" /> {unreadCount} unread
              </span>
            )}
            {dealHealth && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium",
                dealHealth.color === "emerald" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                dealHealth.color === "amber" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                "bg-red-500/10 text-red-600 dark:text-red-400",
              )}>
                <Heart className="h-2.5 w-2.5" /> {dealHealth.score}
              </span>
            )}
            {lead.dealIntelligence?.momentumSignals?.momentum && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {lead.dealIntelligence.momentumSignals.momentum}
              </span>
            )}
            {coverage && (
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1", coverage.colorClass)}>
                {coverage.coverage === "no-champion" ? <ShieldAlert className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
                {coverage.label}
              </span>
            )}
            {winProb && winProb.probability > 0 && winProb.probability < 100 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-foreground/80 font-medium"
                title={`Win probability ${winProb.probability}% — ${winProb.label}\n\n${winProb.factors.map(f => `${f.impact > 0 ? "+" : ""}${f.impact}  ${f.label}`).join("\n")}`}
              >
                Win {winProb.probability}%
              </span>
            )}
            {slipRisk && slipRisk.band !== "on-track" && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  slipRisk.band === "critical" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                  slipRisk.band === "at-risk" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                  "bg-secondary text-muted-foreground",
                )}
                title={`${slipRisk.label}\n\n${slipRisk.reasons.join("\n")}`}
              >
                {slipRisk.label}
              </span>
            )}
            {dossier.pct < 60 && lead.brand === "SourceCo" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/70 font-medium transition-colors inline-flex items-center gap-0.5"
                    title={`Dossier ${dossier.filled} / ${dossier.total} fields populated — ${fillingGaps ? "filling…" : "click for actions"}`}
                  >
                    Dossier {dossier.pct}% {fillingGaps ? <Sparkles className="h-2.5 w-2.5 animate-pulse" /> : <ChevronRight className="h-2.5 w-2.5 rotate-90" />}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem
                    onClick={() => window.dispatchEvent(new CustomEvent("scroll-to-empty-dossier", { detail: { leadId: lead.id } }))}
                  >
                    <ChevronRight className="h-3.5 w-3.5 mr-2" />
                    Jump to first empty row
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={fillingGaps}
                    onClick={async () => {
                      setFillingGaps(true);
                      toast.info("Filling gaps with AI — this may take ~10s…");
                      try {
                        const { error } = await supabase.functions.invoke("enrich-lead", {
                          body: { leadId: lead.id },
                        });
                        if (error) throw error;
                        toast.success("Dossier enriched — refresh to see new AI suggestions");
                      } catch (err) {
                        toast.error("Enrich failed: " + (err as Error).message);
                      } finally {
                        setFillingGaps(false);
                      }
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-2" />
                    {fillingGaps ? "Filling gaps…" : "Fill gaps with AI"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("scroll-to-empty-dossier", { detail: { leadId: lead.id } }))}
                className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/70 font-medium transition-colors"
                title={`Dossier ${dossier.filled} / ${dossier.total} fields populated — click to jump to the first empty row`}
              >
                Dossier {dossier.pct}%
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5 flex-wrap">
            <span>{lead.role}{lead.role && lead.company ? " · " : ""}{lead.company || ""}</span>
            {domain && (
              <a
                href={lead.companyUrl?.startsWith("http") ? lead.companyUrl : `https://${domain}`}
                target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
                title={`Visit ${domain}`}
              >
                <Globe className="h-3 w-3" /> {domain}
              </a>
            )}
            {lead.email && <span>· {lead.email}</span>}
            {lead.phone && <span>· {lead.phone}</span>}
          </p>
          {lead.calendlyBookedAt && (
            <p className="flex items-center gap-1.5 text-[11px] text-primary font-medium mt-1">
              <CalendarCheck className="h-3 w-3 shrink-0" />
              {lead.calendlyEventName || "Calendly Meeting"}
              {lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration} min` : ""}
              {lead.meetingDate ? ` · ${(() => { try { return format(parseISO(lead.meetingDate), "EEE, MMM d 'at' h:mm a"); } catch { return lead.meetingDate; } })()}` : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-muted-foreground hidden lg:flex items-center gap-1 mr-1.5">
            <Clock className="h-3 w-3" />
            {daysInStage}d in stage
            {lead.dealValue ? ` · $${lead.dealValue.toLocaleString()}` : ""}
            {lastContact ? ` · ${lastContact}` : ""}
          </span>
          {lead.assignedTo && (
            <span className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold" title={lead.assignedTo}>
              {lead.assignedTo[0]}
            </span>
          )}

          {/* Prev / Next */}
          <div className="flex items-center border border-border rounded">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-6 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous deal (⌘[)"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="w-6 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-border"
              title="Next deal (⌘])"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={copyLink}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            title="Copy deal link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={copySummary}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            title="Copy deal summary for Slack/handoff"
          >
            {summaryCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={onShowShortcuts}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={toggleMaximize}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            title={mode === "sheet" ? "Open as full page" : "Back to overview"}
          >
            {mode === "sheet" ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onArchive} className="text-destructive focus:text-destructive">
                <Archive className="h-3.5 w-3.5 mr-2" /> Archive lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Stall reason prompt — only when a Proposal has been sitting > 14d with no reason */}
      <StallReasonBanner lead={lead} daysInStage={daysInStage} />

      {/* Clickable stage progress */}
      <div className="px-5 pb-2">
        <ClickableProgressBar currentStage={lead.stage} onAdvance={handleStageClick} />
      </div>

      {/* Compact action strip — only when left rail is collapsed (actions otherwise live in profile panel) */}
      {showCompactActions && (
        <div className="flex items-center gap-0.5 px-4 py-1 border-t border-border">
          {quickActions.map(a => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                disabled={a.disabled}
                title={a.label}
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded",
                  "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", a.animate && "animate-pulse")} />
              </button>
            );
          })}
        </div>
      )}
      <AlertDialog open={!!pendingStage} onOpenChange={(o) => { if (!o) setPendingStage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move stage backwards?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to move <span className="font-medium text-foreground">{lead.name}</span> from <span className="font-medium text-foreground">{lead.stage}</span> back to <span className="font-medium text-foreground">{pendingStage}</span>. This will reset stage timing and may affect forecast & playbook tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingStage && commitStageChange(pendingStage)}>
              Move back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
