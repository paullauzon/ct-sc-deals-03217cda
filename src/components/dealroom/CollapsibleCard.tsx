import { ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
  title: string;
  icon?: ReactNode;
  count?: number | string;
  defaultOpen?: boolean;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}

/**
 * Premium monochrome collapsible section used across the Deal Room left & right rails.
 * Mirrors HubSpot's "About this contact" panel pattern.
 */
export function CollapsibleCard({
  title,
  icon,
  count,
  defaultOpen = true,
  rightSlot,
  children,
  className,
  dense,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("border-b border-border last:border-b-0", className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center gap-2 text-left group",
          dense ? "px-3 py-2" : "px-4 py-2.5"
        )}
      >
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80 flex-1">
          {title}
        </span>
        {count !== undefined && count !== null && count !== "" && (
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
        {rightSlot}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground/60 transition-transform shrink-0",
            !open && "-rotate-90"
          )}
        />
      </button>
      {open && (
        <div className={cn(dense ? "px-3 pb-3" : "px-4 pb-4")}>{children}</div>
      )}
    </div>
  );
}
