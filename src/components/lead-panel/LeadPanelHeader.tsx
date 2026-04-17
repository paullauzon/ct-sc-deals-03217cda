import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lead, LeadStage } from "@/types/lead";
import { BrandLogo } from "@/components/BrandLogo";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Linkedin, X, Maximize2, Minimize2, Heart, ShieldAlert, Users, CalendarCheck,
  Mail, Calendar, FileText, CheckSquare, Zap, Phone, Sparkles, Archive, MoreHorizontal,
  ChevronLeft, ChevronRight, Link2, Check, Globe, Clock,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { computeDealHealthScore, getStakeholderCoverage } from "@/lib/dealHealthUtils";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLog";

const ACTIVE_STAGES: LeadStage[] = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"];

function ClickableProgressBar({ currentStage, onAdvance }: { currentStage: LeadStage; onAdvance: (s: LeadStage) => void }) {
  const currentIdx = ACTIVE_STAGES.indexOf(currentStage);
  const isClosed = ["Closed Won", "Lost", "Went Dark"].includes(currentStage);
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
  draftingAI?: boolean;
  enriching?: boolean;
}

export function LeadPanelHeader({
  lead, daysInStage, mode, hasPrev, hasNext,
  onClose, onPrev, onNext, onEmail, onSchedule, onNote, onTask,
  onDraftAI, onLogCall, onEnrich, onArchive, onChangeStage,
  draftingAI, enriching,
}: LeadPanelHeaderProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const dealHealth = computeDealHealthScore(lead);
  const coverage = getStakeholderCoverage(lead);
  const lastContact = lastContactLabel(lead);
  const domain = lead.companyUrl?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || (lead.email?.split("@")[1] ?? "");

  const copyLink = async () => {
    const url = `${window.location.origin}/deal/${lead.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Deal link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleStageClick = async (stage: LeadStage) => {
    if (stage === lead.stage) return;
    const currentIdx = ACTIVE_STAGES.indexOf(lead.stage);
    const newIdx = ACTIVE_STAGES.indexOf(stage);
    if (newIdx < currentIdx) {
      if (!window.confirm(`Move stage back from "${lead.stage}" to "${stage}"?`)) return;
    }
    onChangeStage(stage);
    await logActivity(lead.id, "stage_change", `Stage: ${lead.stage} → ${stage}`, lead.stage, stage);
    toast.success(`Moved to ${stage}`);
  };

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

      {/* Clickable stage progress */}
      <div className="px-5 pb-2">
        <ClickableProgressBar currentStage={lead.stage} onAdvance={handleStageClick} />
      </div>

      {/* Quick action bar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-t border-border">
        {quickActions.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium",
                "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", a.animate && "animate-pulse")} />
              <span>{a.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
