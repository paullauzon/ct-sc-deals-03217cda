import { Lead } from "@/types/lead";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { BrandLogo } from "@/components/BrandLogo";
import { ACTIVE_STAGES } from "@/lib/leadUtils";
import { InlineTextField, InlineSelectField } from "@/components/lead-panel/InlineEditFields";
import { ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface Props {
  lead: Lead;
  daysInStage: number;
  save: (updates: Partial<Lead>) => void;
}

function fmtDate(d: string): string {
  if (!d) return "";
  try { return format(parseISO(d), "MMM d, yyyy"); } catch { return d; }
}
function fmtMoney(n: number | undefined | null): string {
  if (!n) return "—";
  return `$${Number(n).toLocaleString()}`;
}

const SAMPLE_OUTCOMES = ["Pending", "Reviewing", "Approved", "Rejected", "No response"];
const CONFIRMED_OPTIONS = ["Yes", "No", "Unknown"];

export function DealSnapshotCard({ lead, daysInStage, save }: Props) {
  const currentIdx = ACTIVE_STAGES.indexOf(lead.stage);
  const isActive = currentIdx >= 0;
  const isWon = lead.stage === "Closed Won";
  const isLost = lead.stage === "Lost" || lead.stage === "Went Dark";
  const stageLabel = isActive
    ? `Stage ${currentIdx + 1} of ${ACTIVE_STAGES.length}`
    : isWon ? "Closed" : isLost ? lead.stage : "Nurture";
  const progressPct = isActive ? ((currentIdx + 1) / ACTIVE_STAGES.length) * 100 : isWon ? 100 : 0;
  const monthlyValue = lead.subscriptionValue || lead.dealValue || 0;
  const tcv = lead.contractMonths && monthlyValue ? monthlyValue * lead.contractMonths : null;
  const domain = lead.companyUrl?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || (lead.email?.split("@")[1] ?? "");
  const brandStripe = lead.brand === "Captarget" ? "bg-red-500" : "bg-amber-500";

  return (
    <div className="border-b border-border">
      {/* Brand stripe */}
      <div className={cn("h-1", brandStripe)} />

      {/* Headline */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-start gap-2.5">
          <CompanyAvatar companyUrl={lead.companyUrl} email={lead.email} companyName={lead.company} size="sm" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate leading-tight">{lead.company || lead.name}</h3>
            {domain && (
              <a
                href={lead.companyUrl?.startsWith("http") ? lead.companyUrl : `https://${domain}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              >
                <Globe className="h-2.5 w-2.5" /> {domain}
              </a>
            )}
          </div>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums">{fmtMoney(monthlyValue)}</span>
          {monthlyValue > 0 && <span className="text-[10px] text-muted-foreground">/mo</span>}
          {tcv && <span className="text-[10px] text-muted-foreground ml-auto">TCV {fmtMoney(tcv)}</span>}
        </div>

        {/* Stage progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{lead.stage}</span>
            <span className="tabular-nums">{stageLabel}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isWon ? "bg-emerald-500" : isLost ? "bg-muted-foreground/40" : "bg-primary",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <BrandLogo brand={lead.brand} size="sm" />
          {lead.serviceInterest && lead.serviceInterest !== "TBD" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-foreground/80 font-medium">
              {lead.serviceInterest}
            </span>
          )}
          {lead.assignedTo && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-foreground/80 font-medium">
              {lead.assignedTo}
            </span>
          )}
          {lead.priority && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {lead.priority}
            </span>
          )}
        </div>
      </div>

      {/* Snapshot table */}
      <div className="px-4 pb-3 pt-1">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Deal Snapshot</h4>
        <div className="space-y-0">
          <InlineTextField label="Deal value" type="number" value={lead.dealValue || ""} onSave={(v) => save({ dealValue: Number(v) || 0 })} />
          <InlineTextField label="MRR" type="number" value={lead.subscriptionValue || ""} onSave={(v) => save({ subscriptionValue: Number(v) || 0 })} />
          <InlineTextField label="Est. close" type="date" value={lead.forecastedCloseDate || ""} onSave={(v) => save({ forecastedCloseDate: v })} />
          <InlineTextField label="Contract end" type="date" value={lead.contractEnd || ""} onSave={(v) => save({ contractEnd: v })} />
          <ReadRow label="Created" value={fmtDate(lead.createdAt) || fmtDate(lead.dateSubmitted)} />
          <ReadRow label="Days in stage" value={`${daysInStage}d`} />
          <ReadRow label="Meeting set" value={fmtDate(lead.meetingSetDate)} />
          <ReadRow label="Meeting held" value={fmtDate(lead.meetingDate)} />
          <InlineTextField label="Sample sent" type="date" value={lead.sampleSentDate || ""} onSave={(v) => save({ sampleSentDate: v })} />
          <InlineSelectField label="Sample outcome" value={lead.sampleOutcome || ""} options={SAMPLE_OUTCOMES} onSave={(v) => save({ sampleOutcome: v })} allowEmpty />
          <InlineTextField label="Competing" value={lead.competingAgainst || ""} onSave={(v) => save({ competingAgainst: v })} placeholder="Sutton Place, Axial…" />
          <InlineTextField label="Decision blocker" value={lead.decisionBlocker || ""} onSave={(v) => save({ decisionBlocker: v })} placeholder="Pricing, timing…" />
          <InlineTextField label="Stall reason" value={lead.stallReason || ""} onSave={(v) => save({ stallReason: v })} placeholder="—" />
          <InlineSelectField label="Budget confirmed" value={lead.budgetConfirmed || ""} options={CONFIRMED_OPTIONS} onSave={(v) => save({ budgetConfirmed: v })} allowEmpty />
          <InlineSelectField label="Authority confirmed" value={lead.authorityConfirmed || ""} options={CONFIRMED_OPTIONS} onSave={(v) => save({ authorityConfirmed: v })} allowEmpty />
          {lead.tier && <ReadRow label="Tier" value={`Tier ${lead.tier}`} />}
          {lead.firefliesUrl && (
            <LinkRow label="Fireflies" url={lead.firefliesUrl} display="View transcript" />
          )}
          {lead.googleDriveLink && (
            <LinkRow label="Drive folder" url={lead.googleDriveLink} display="Open" />
          )}
        </div>
      </div>
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right truncate font-medium max-w-[60%]">
        {value || <span className="text-muted-foreground/50">—</span>}
      </span>
    </div>
  );
}

function LinkRow({ label, url, display }: { label: string; url: string; display: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-foreground hover:text-primary inline-flex items-center gap-1 font-medium max-w-[60%] truncate"
      >
        <span className="truncate">{display}</span>
        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
      </a>
    </div>
  );
}
