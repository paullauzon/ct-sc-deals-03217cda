import { Lead } from "@/types/lead";
import { Trophy } from "lucide-react";
import { findSimilarWonDeals } from "@/lib/dealHealthUtils";

export function SimilarWonDealsSection({ lead, allLeads }: { lead: Lead; allLeads: Lead[] }) {
  const isClosed = lead.stage === "Closed Won" || lead.stage === "Lost";
  if (isClosed) return null;
  const similar = findSimilarWonDeals(lead, allLeads);
  if (similar.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Similar Won Deals</h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider ml-auto">
          {similar.length} comparable
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {similar.slice(0, 4).map((s, i) => (
          <div key={i} className="text-xs border border-border/60 rounded p-2.5">
            <p className="font-medium truncate">{s.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">${s.dealValue.toLocaleString()}/mo</p>
            {s.winTactic && (
              <p className="text-[11px] text-muted-foreground/90 mt-1.5 leading-snug italic">
                {s.winTactic}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
