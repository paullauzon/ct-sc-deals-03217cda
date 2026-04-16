import { Link } from "react-router-dom";
import { Lead, LeadStage } from "@/types/lead";
import { BrandLogo } from "@/components/BrandLogo";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Linkedin, ChevronRight, X, Maximize2, Heart, ShieldAlert, Users, CalendarCheck,
  Mail, Calendar, FileText, CheckSquare, Zap, Phone, Sparkles, Archive, MoreHorizontal, ExternalLink,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { computeDealHealthScore, getStakeholderCoverage } from "@/lib/dealHealthUtils";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const ACTIVE_STAGES: LeadStage[] = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"];

function DealProgressBar({ currentStage }: { currentStage: LeadStage }) {
  const currentIdx = ACTIVE_STAGES.indexOf(currentStage);
  const isClosed = ["Closed Won", "Lost", "Went Dark"].includes(currentStage);
  return (
    <div className="flex items-center gap-0.5">
      {ACTIVE_STAGES.map((stage, i) => (
        <div key={stage} className={cn("h-1 flex-1 rounded-sm transition-colors",
          isClosed ? "bg-muted" : i <= currentIdx ? "bg-primary" : "bg-muted")}
          title={stage}
        />
      ))}
    </div>
  );
}

interface LeadPanelHeaderProps {
  lead: Lead;
  daysInStage: number;
  onClose: () => void;
  onEmail: () => void;
  onSchedule: () => void;
  onNote: () => void;
  onTask: () => void;
  onDraftAI: () => void;
  onLogCall: () => void;
  onEnrich: () => void;
  onArchive: () => void;
  draftingAI?: boolean;
  enriching?: boolean;
}

export function LeadPanelHeader({
  lead, daysInStage, onClose, onEmail, onSchedule, onNote, onTask,
  onDraftAI, onLogCall, onEnrich, onArchive, draftingAI, enriching,
}: LeadPanelHeaderProps) {
  const dealHealth = computeDealHealthScore(lead);
  const coverage = getStakeholderCoverage(lead);

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
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {lead.role}{lead.role && lead.company ? " · " : ""}{lead.company || ""}
            {lead.email && <span> · {lead.email}</span>}
            {lead.phone && <span> · {lead.phone}</span>}
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
          <span className="text-[11px] text-muted-foreground hidden md:inline mr-2">
            {daysInStage}d in stage{lead.dealValue ? ` · $${lead.dealValue.toLocaleString()}` : ""}
          </span>
          {lead.assignedTo && (
            <span className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold" title={lead.assignedTo}>
              {lead.assignedTo[0]}
            </span>
          )}
          <Link
            to={`/deal/${lead.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            title="Open as full page"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEnrich} disabled={enriching}>
                <Sparkles className="h-3.5 w-3.5 mr-2" /> {enriching ? "Researching…" : "Research & Recommend"}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/deal/${lead.id}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open in new tab
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchive} className="text-destructive focus:text-destructive">
                <Archive className="h-3.5 w-3.5 mr-2" /> Archive lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-2">
        <DealProgressBar currentStage={lead.stage} />
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
