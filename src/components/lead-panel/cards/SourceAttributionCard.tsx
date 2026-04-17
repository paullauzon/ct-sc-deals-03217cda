import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Compass } from "lucide-react";

interface Props { lead: Lead; }

function fmt(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

export function SourceAttributionCard({ lead }: Props) {
  const subs = (lead.submissions || []).filter(s => s.dateSubmitted).slice().sort(
    (a, b) => new Date(a.dateSubmitted).getTime() - new Date(b.dateSubmitted).getTime()
  );
  if (subs.length === 0) return null;

  const first = subs[0];
  const latest = subs[subs.length - 1];
  const channelCounts = new Map<string, number>();
  subs.forEach(s => channelCounts.set(s.source, (channelCounts.get(s.source) || 0) + 1));
  const channels = Array.from(channelCounts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <CollapsibleCard
      title="Source & Attribution"
      icon={<Compass className="h-3.5 w-3.5" />}
      count={subs.length}
      defaultOpen={false}
    >
      <div className="space-y-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">First touch</p>
          <p className="text-xs font-medium mt-0.5">{first.source}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{fmt(first.dateSubmitted)}</p>
        </div>

        {subs.length > 1 && (
          <div className="border-t border-border/40 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latest touch</p>
            <p className="text-xs font-medium mt-0.5">{latest.source}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{fmt(latest.dateSubmitted)}</p>
          </div>
        )}

        {channels.length > 1 && (
          <div className="border-t border-border/40 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Channel mix</p>
            <div className="space-y-0.5">
              {channels.map(([ch, n]) => (
                <div key={ch} className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground/80 truncate">{ch}</span>
                  <span className="text-muted-foreground tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
