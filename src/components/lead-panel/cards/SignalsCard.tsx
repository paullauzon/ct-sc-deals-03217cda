import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Bell } from "lucide-react";
import { getDealSignals } from "@/components/lead-panel/shared";
import { useEmailEngagementSignals } from "@/lib/emailSignals";
import { cn } from "@/lib/utils";

interface Props { lead: Lead }

export function SignalsCard({ lead }: Props) {
  const dealSignals = getDealSignals(lead);
  const emailSignals = useEmailEngagementSignals(lead.id);
  const signals = [...dealSignals, ...emailSignals];
  if (signals.length === 0) return null;

  const criticals = signals.filter(s => s.severity === "critical").length;

  return (
    <CollapsibleCard
      title="Signals"
      icon={<Bell className="h-3.5 w-3.5" />}
      count={signals.length}
      defaultOpen={criticals > 0}
    >
      <ul className="space-y-2">
        {signals.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0",
                s.severity === "critical" && "bg-red-500",
                s.severity === "warning" && "bg-amber-500",
                s.severity === "positive" && "bg-emerald-500",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className={cn(
                "text-[11px] font-medium leading-tight",
                s.severity === "critical" && "text-foreground",
                s.severity === "warning" && "text-foreground",
                s.severity === "positive" && "text-foreground",
              )}>
                {s.title}
              </p>
              {s.description && (
                <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{s.description}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  );
}
