import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Activity, ExternalLink, Globe } from "lucide-react";

interface Props { lead: Lead; }

/**
 * Website Activity card.
 *
 * Today: shows known company/website signals we already capture
 * (company URL, enrichment website score, last touch via submissions).
 *
 * Future: will surface GA4 / website analytics events such as
 *  - page visits, time on site, last visit
 *  - pricing-page hits, demo-page hits
 *  - returning-visitor signal, identified-vs-anonymous
 *
 * The card is intentionally always rendered so that, once GA4 is wired,
 * the placement in the rail stays stable.
 */
export function WebsiteActivityCard({ lead }: Props) {
  const websiteUrl = (lead as any).websiteUrl || lead.companyUrl || "";
  const websiteScore = (lead.enrichment as any)?.websiteScore ?? (lead as any).websiteScore;
  const submissions = (lead.submissions || []).filter(s => s.dateSubmitted);
  const lastSubmission = submissions
    .slice()
    .sort((a, b) => new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime())[0];

  const totalTouches = submissions.length;
  const hasAnyData = !!websiteUrl || !!websiteScore || totalTouches > 0;

  return (
    <CollapsibleCard
      title="Website Activity"
      icon={<Activity className="h-3.5 w-3.5" />}
      defaultOpen={false}
    >
      <div className="space-y-2.5">
        {websiteUrl && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Site</p>
            <a
              href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-foreground hover:underline inline-flex items-center gap-1 mt-0.5"
            >
              <Globe className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[200px]">{websiteUrl.replace(/^https?:\/\//, "")}</span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
            </a>
          </div>
        )}

        {typeof websiteScore === "number" && (
          <div className="border-t border-border/40 pt-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Website signal score</span>
              <span className="font-medium tabular-nums">{websiteScore}/100</span>
            </div>
          </div>
        )}

        {totalTouches > 0 && (
          <div className="border-t border-border/40 pt-2 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Form submissions</span>
              <span className="font-medium tabular-nums">{totalTouches}</span>
            </div>
            {lastSubmission && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Last touch</span>
                <span className="font-medium tabular-nums">
                  {new Date(lastSubmission.dateSubmitted).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Always-on hint about future GA4 wiring */}
        <div className="border-t border-border/40 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Behavioral analytics
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Page visits, time on site, and pricing-page hits will appear here once GA4 / site tracking is connected.
          </p>
        </div>

        {!hasAnyData && (
          <p className="text-[11px] text-muted-foreground italic">No website signals captured yet.</p>
        )}
      </div>
    </CollapsibleCard>
  );
}
