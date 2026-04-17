import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Compass, ExternalLink, Globe } from "lucide-react";
import { SubmissionHistory } from "../shared";

interface Props { lead: Lead; }

function fmt(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

/**
 * Unified Source & Engagement card.
 * Replaces SourceAttributionCard + Submissions + WebsiteActivityCard.
 * Three internal sub-sections: Touchpoints, Submission history, Website.
 */
export function SourceEngagementCard({ lead }: Props) {
  const subs = (lead.submissions || []).filter(s => s.dateSubmitted).slice().sort(
    (a, b) => new Date(a.dateSubmitted).getTime() - new Date(b.dateSubmitted).getTime()
  );
  const hasSubs = subs.length > 0;
  const first = hasSubs ? subs[0] : null;
  const latest = hasSubs ? subs[subs.length - 1] : null;
  const channelCounts = new Map<string, number>();
  subs.forEach(s => channelCounts.set(s.source, (channelCounts.get(s.source) || 0) + 1));
  const channels = Array.from(channelCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Calendly-only / no-touch fallback
  const calendlyDate = lead.calendlyBookedAt || lead.meetingDate || "";
  const created = lead.dateSubmitted || "";
  const fallbackSource = calendlyDate ? "Calendly Booking" : (lead.source || "Direct entry");
  const fallbackDate = calendlyDate || created;

  const websiteUrl = (lead as any).websiteUrl || lead.companyUrl || "";
  const websiteScore = (lead.enrichment as any)?.websiteScore ?? (lead as any).websiteScore;

  return (
    <CollapsibleCard
      title="Source & Engagement"
      icon={<Compass className="h-3.5 w-3.5" />}
      count={hasSubs ? subs.length : undefined}
      defaultOpen={false}
    >
      <div className="space-y-3">
        {/* Touchpoints */}
        <div className="space-y-2.5">
          {hasSubs ? (
            <>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">First touch</p>
                <p className="text-xs font-medium mt-0.5">{first!.source}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">{fmt(first!.dateSubmitted)}</p>
              </div>
              {subs.length > 1 && (
                <div className="border-t border-border/40 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latest touch</p>
                  <p className="text-xs font-medium mt-0.5">{latest!.source}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{fmt(latest!.dateSubmitted)}</p>
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
            </>
          ) : (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">First touch</p>
              <p className="text-xs font-medium mt-0.5">{fallbackSource}</p>
              {fallbackDate && <p className="text-[10px] text-muted-foreground tabular-nums">{fmt(fallbackDate)}</p>}
            </div>
          )}
        </div>

        {/* Submission history */}
        {hasSubs && (
          <div className="border-t border-border/40 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Submission history
            </p>
            <SubmissionHistory submissions={lead.submissions} />
          </div>
        )}

        {/* Website */}
        <div className="border-t border-border/40 pt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Website</p>

          {websiteUrl ? (
            <a
              href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-foreground hover:underline inline-flex items-center gap-1"
            >
              <Globe className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[200px]">{websiteUrl.replace(/^https?:\/\//, "")}</span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
            </a>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">No site captured.</p>
          )}

          {typeof websiteScore === "number" && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Website signal score</span>
              <span className="font-medium tabular-nums">{websiteScore}/100</span>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-snug">
            Page visits, time on site, and pricing-page hits will appear here once GA4 / site tracking is connected.
          </p>
        </div>
      </div>
    </CollapsibleCard>
  );
}
