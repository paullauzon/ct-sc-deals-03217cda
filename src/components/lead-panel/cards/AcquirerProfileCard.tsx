import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Building2 } from "lucide-react";

interface Props { lead: Lead; }

/**
 * SourceCo-only card: surfaces the acquirer's stated buybox so the rep can
 * read it at a glance without diving into the Intelligence tab.
 */
export function AcquirerProfileCard({ lead }: Props) {
  if (lead.brand !== "SourceCo") return null;

  const rows: { label: string; value?: string }[] = [
    { label: "Buyer type", value: lead.buyerType },
    { label: "Strategy", value: lead.acquisitionStrategy },
    { label: "Target revenue", value: lead.targetRevenue },
    { label: "Geography", value: lead.geography },
    { label: "Current sourcing", value: lead.currentSourcing },
    { label: "Heard via", value: lead.hearAboutUs },
  ].filter(r => r.value && r.value.trim().length > 0);

  const filled = rows.length;

  return (
    <CollapsibleCard
      title="Acquirer Profile"
      icon={<Building2 className="h-3.5 w-3.5" />}
      count={filled || undefined}
      defaultOpen={filled > 0}
    >
      {filled === 0 ? (
        <p className="text-[11px] text-muted-foreground/60">
          No acquirer profile captured yet. Run enrichment or update from the intake form.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.label} className="flex items-start justify-between gap-3 text-xs">
              <span className="text-muted-foreground shrink-0">{r.label}</span>
              <span className="font-medium text-right text-foreground/90 break-words">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
