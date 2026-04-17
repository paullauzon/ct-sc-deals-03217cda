import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { AlertTriangle, Bell } from "lucide-react";
import { getDealSignals } from "@/components/lead-panel/shared";

interface Props { lead: Lead }

export function SignalsCard({ lead }: Props) {
  const signals = getDealSignals(lead);
  if (signals.length === 0) return null;

  const criticals = signals.filter(s => s.severity === "critical").length;

  return (
    <CollapsibleCard
      title="Signals"
      icon={<Bell className="h-3.5 w-3.5" />}
      count={signals.length}
      defaultOpen={criticals > 0}
    >
      <ul className="space-y-1">
        {signals.map((s, i) => (
          <li
            key={i}
            className={
              s.severity === "critical"
                ? "flex items-start gap-1.5 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5"
                : "flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5"
            }
          >
            <AlertTriangle className={
              "h-3 w-3 shrink-0 mt-0.5 " + (s.severity === "critical" ? "text-destructive" : "text-amber-600")
            } />
            <span className={
              "text-[11px] font-medium " + (s.severity === "critical"
                ? "text-destructive"
                : "text-amber-700 dark:text-amber-400")
            }>
              {s.message}
            </span>
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  );
}
