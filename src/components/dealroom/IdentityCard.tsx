import { Lead } from "@/types/lead";
import { isClosedStage, normalizeStage } from "@/lib/leadUtils";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Linkedin, Mail, Phone, Globe, Building2, Copy,
  Calendar, FileText, CheckSquare, Zap, Sparkles, MessageSquareQuote,
  MoreHorizontal, Link2, ClipboardCopy, Archive, Keyboard, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface IdentityCardProps {
  lead: Lead;
  onEmail?: () => void;
  onSchedule?: () => void;
  onNote?: () => void;
  onTask?: () => void;
  onDraftAI?: () => void;
  onLogCall?: () => void;
  onEnrich?: () => void;
  onAskAI?: () => void;
  onArchive?: () => void;
  onCopyLink?: () => void;
  onCopySummary?: () => void;
  onShowShortcuts?: () => void;
  draftingAI?: boolean;
  enriching?: boolean;
}

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

function lastTouchpoint(lead: Lead): { label: string; source: string } | null {
  const candidates: { t: number; source: string }[] = [];
  if (lead.lastContactDate) {
    const t = new Date(lead.lastContactDate).getTime();
    if (!isNaN(t)) candidates.push({ t, source: "Contact" });
  }
  for (const m of lead.meetings || []) {
    if (m.date) {
      const t = new Date(m.date).getTime();
      if (!isNaN(t)) candidates.push({ t, source: "Meeting" });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.t - a.t);
  const latest = candidates[0];
  const days = Math.floor((Date.now() - latest.t) / 86400000);
  let label: string;
  if (days < 0) label = "Upcoming";
  else if (days === 0) label = "today";
  else if (days === 1) label = "1d ago";
  else if (days < 7) label = `${days}d ago`;
  else if (days < 30) label = `${Math.floor(days / 7)}w ago`;
  else label = `${Math.floor(days / 30)}mo ago`;
  return { label, source: latest.source };
}

/**
 * Smart-highlight: returns the label of the next-best action based on lead state.
 * Uses subtle 1px ring (foreground) — no color, monochrome per design memory.
 */
function getSuggestedAction(lead: Lead): string | null {
  const norm = normalizeStage(lead.stage);
  if (isClosedStage(norm)) return null;
  // No meeting booked yet → suggest Schedule
  const hasMeeting = (lead.meetings || []).length > 0 || !!lead.calendlyBookedAt || !!lead.meetingDate;
  if (!hasMeeting && ["Unassigned", "In Contact"].includes(norm)) {
    return "Schedule";
  }
  // Overdue follow-up → suggest Email
  if (lead.nextFollowUp) {
    const due = new Date(lead.nextFollowUp).getTime();
    if (!isNaN(due) && due < Date.now()) return "Email";
  }
  // Stale (no contact in 7+ days) → suggest Email
  if (lead.lastContactDate) {
    const days = Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86400000);
    if (days >= 7) return "Email";
  }
  return null;
}

export function IdentityCard({
  lead, onEmail, onSchedule, onNote, onTask, onDraftAI, onLogCall, onEnrich, onAskAI,
  onArchive, onCopyLink, onCopySummary, onShowShortcuts, draftingAI, enriching,
}: IdentityCardProps) {
  const touchpoint = lastTouchpoint(lead);
  const suggested = getSuggestedAction(lead);

  // Only render the actions grid if any handler is supplied (back-compat).
  const hasActions = !!(onEmail || onSchedule || onNote || onTask || onDraftAI || onLogCall || onEnrich || onAskAI);

  const actions: { label: string; icon: any; onClick?: () => void; disabled?: boolean; animate?: boolean }[] = [
    { label: "Email", icon: Mail, onClick: onEmail },
    { label: "Schedule", icon: Calendar, onClick: onSchedule },
    { label: "Note", icon: FileText, onClick: onNote },
    { label: "Task", icon: CheckSquare, onClick: onTask },
    { label: "Call", icon: Phone, onClick: onLogCall },
    { label: draftingAI ? "Drafting…" : "Draft AI", icon: Zap, onClick: onDraftAI, disabled: draftingAI, animate: draftingAI },
    { label: enriching ? "Enriching…" : "Enrich", icon: Sparkles, onClick: onEnrich, disabled: enriching, animate: enriching },
    { label: "Ask AI", icon: MessageSquareQuote, onClick: onAskAI },
  ];

  const hasOverflow = !!(onCopyLink || onCopySummary || onArchive || onShowShortcuts);

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex flex-col items-center text-center">
        <CompanyAvatar
          companyUrl={lead.companyUrl}
          email={lead.email}
          companyName={lead.company}
          size="lg"
        />
        <h2 className="mt-2.5 text-base font-semibold leading-tight">{lead.name}</h2>
        {lead.role && (
          <p className="text-xs text-muted-foreground mt-0.5">{lead.role}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <BrandLogo brand={lead.brand} size="sm" />
          {lead.company && (
            <span className="text-xs text-muted-foreground">· {lead.company}</span>
          )}
        </div>
      </div>

      {hasActions && (
        <>
          {/* Last touchpoint chip */}
          {touchpoint && (
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              <span>Last {touchpoint.source.toLowerCase()} {touchpoint.label}</span>
            </div>
          )}

          {/* Quick actions: 2x4 grid */}
          <div className="grid grid-cols-4 gap-1">
            {actions.map(a => {
              const Icon = a.icon;
              const isSuggested = suggested === a.label && !a.disabled;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  disabled={a.disabled || !a.onClick}
                  title={isSuggested ? `${a.label} · suggested next action` : a.label}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-md",
                    "text-[10px] font-medium text-muted-foreground",
                    "bg-secondary/40 hover:bg-secondary hover:text-foreground",
                    "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    isSuggested && "ring-1 ring-foreground/60 text-foreground bg-secondary",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", a.animate && "animate-pulse")} />
                  <span className="truncate w-full text-center leading-none">{a.label}</span>
                </button>
              );
            })}
          </div>

          {/* More overflow menu */}
          {hasOverflow && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground bg-secondary/30 hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <MoreHorizontal className="h-3 w-3" />
                  More
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                {onCopyLink && (
                  <DropdownMenuItem onClick={onCopyLink}>
                    <Link2 className="h-3.5 w-3.5 mr-2" /> Copy deal link
                  </DropdownMenuItem>
                )}
                {onCopySummary && (
                  <DropdownMenuItem onClick={onCopySummary}>
                    <ClipboardCopy className="h-3.5 w-3.5 mr-2" /> Copy summary
                  </DropdownMenuItem>
                )}
                {onShowShortcuts && (
                  <DropdownMenuItem onClick={onShowShortcuts}>
                    <Keyboard className="h-3.5 w-3.5 mr-2" /> Shortcuts
                  </DropdownMenuItem>
                )}
                {onArchive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onArchive} className="text-destructive focus:text-destructive">
                      <Archive className="h-3.5 w-3.5 mr-2" /> Archive lead
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}

      <div className="space-y-1 pt-1">
        {lead.email && (
          <button
            onClick={() => copy(lead.email, "Email")}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors group"
          >
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate flex-1 text-left">{lead.email}</span>
            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50 shrink-0" />
          </button>
        )}
        {lead.phone && (
          <button
            onClick={() => copy(lead.phone, "Phone")}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors group"
          >
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate flex-1 text-left">{lead.phone}</span>
            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50 shrink-0" />
          </button>
        )}
        {lead.companyUrl && (
          <a
            href={lead.companyUrl.startsWith("http") ? lead.companyUrl : `https://${lead.companyUrl}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors"
          >
            <Globe className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.companyUrl.replace(/^https?:\/\//, "")}</span>
          </a>
        )}
        {lead.linkedinUrl && (
          <a
            href={lead.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 text-xs hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors"
            style={{ color: "#0A66C2" }}
          >
            <Linkedin className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.linkedinTitle || "LinkedIn Profile"}</span>
          </a>
        )}
        {lead.googleDriveLink && (
          <a
            href={lead.googleDriveLink}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors"
          >
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">Drive folder</span>
          </a>
        )}
      </div>
    </div>
  );
}
