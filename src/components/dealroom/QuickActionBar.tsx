import { Lead } from "@/types/lead";
import { Mail, Calendar, FileText, CheckSquare, Zap, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface QuickAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

interface QuickActionBarProps {
  lead: Lead;
  onEmail: () => void;
  onSchedule: () => void;
  onNote: () => void;
  onTask: () => void;
  onDraftAI: () => void;
  onLogCall: () => void;
  draftingAI?: boolean;
}

export function QuickActionBar({
  lead,
  onEmail,
  onSchedule,
  onNote,
  onTask,
  onDraftAI,
  onLogCall,
  draftingAI,
}: QuickActionBarProps) {
  const actions: QuickAction[] = [
    { icon: <Mail className="h-3.5 w-3.5" />, label: "Email", onClick: onEmail },
    { icon: <Calendar className="h-3.5 w-3.5" />, label: "Schedule", onClick: onSchedule },
    { icon: <FileText className="h-3.5 w-3.5" />, label: "Note", onClick: onNote },
    { icon: <CheckSquare className="h-3.5 w-3.5" />, label: "Task", onClick: onTask },
    { icon: <Zap className={cn("h-3.5 w-3.5", draftingAI && "animate-pulse")} />, label: draftingAI ? "Drafting..." : "Draft AI", onClick: onDraftAI, disabled: draftingAI },
    { icon: <Phone className="h-3.5 w-3.5" />, label: "Log call", onClick: onLogCall },
  ];

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background">
      {actions.map(a => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          disabled={a.disabled}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium",
            "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            "transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {a.icon}
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
