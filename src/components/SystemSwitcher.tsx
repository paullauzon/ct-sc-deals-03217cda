import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { BarChart3, Briefcase, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type System = "crm" | "business";

interface SystemSwitcherProps {
  current: System;
  onChange: (system: System) => void;
}

const SYSTEMS: { key: System; label: string; desc: string; icon: typeof BarChart3 }[] = [
  { key: "crm", label: "Sales CRM", desc: "Pipeline, leads & deals", icon: BarChart3 },
  { key: "business", label: "Business Ops", desc: "Metrics & forecasting", icon: Briefcase },
];

export function SystemSwitcher({ current, onChange }: SystemSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-sm font-bold tracking-tight hover:opacity-80 transition-opacity">
          CAPTARGET
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        {SYSTEMS.map(({ key, label, desc, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { onChange(key); setOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
              current === key
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{label}</div>
              <div className="text-[11px] text-muted-foreground">{desc}</div>
            </div>
            {current === key && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
