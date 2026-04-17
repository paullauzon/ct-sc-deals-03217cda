import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Building2, ExternalLink, Users } from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useStakeholderCount } from "@/hooks/useStakeholderCount";

interface Props { lead: Lead }

function deriveFirmType(lead: Lead): string {
  const bt = (lead.buyerType || "").toLowerCase();
  if (bt.includes("search")) return "Search Fund";
  if (bt.includes("private equity") || bt.includes("pe")) return "Private Equity";
  if (bt.includes("family office")) return "Family Office";
  if (bt.includes("strategic")) return "Strategic Buyer";
  if (bt.includes("independent sponsor")) return "Independent Sponsor";
  return lead.buyerType || "—";
}

export function AssociatedCompanyCard({ lead }: Props) {
  const { count: stakeholderCount } = useStakeholderCount(lead.id);
  const firmType = deriveFirmType(lead);
  const domain = lead.companyUrl?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || (lead.email?.split("@")[1] ?? "");

  return (
    <CollapsibleCard title="Associated Company" icon={<Building2 className="h-3.5 w-3.5" />} defaultOpen>
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <CompanyAvatar companyUrl={lead.companyUrl} email={lead.email} companyName={lead.company} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{lead.company || "—"}</p>
            {firmType !== "—" && (
              <p className="text-[10px] text-muted-foreground">{firmType}</p>
            )}
          </div>
        </div>

        <div className="space-y-0.5 pt-1">
          {lead.firmAum && <Row label="AUM" value={lead.firmAum} />}
          {lead.activeSearches && <Row label="Active searches" value={lead.activeSearches} />}
          {lead.acqTimeline && <Row label="Timeline" value={lead.acqTimeline} />}
          {(lead.ebitdaMin || lead.ebitdaMax) && (
            <Row label="EBITDA target" value={`${lead.ebitdaMin || "?"} – ${lead.ebitdaMax || "?"}`} />
          )}
          {lead.geography && <Row label="Geography" value={lead.geography} />}
          <div className="flex items-center justify-between gap-3 py-1 text-[11px]">
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Users className="h-2.5 w-2.5" /> Contacts at firm
            </span>
            <span className="text-foreground font-medium tabular-nums">{stakeholderCount}</span>
          </div>
        </div>

        {domain && (
          <a
            href={lead.companyUrl?.startsWith("http") ? lead.companyUrl : `https://${domain}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            {domain} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </CollapsibleCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[11px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right truncate font-medium max-w-[55%]">{value}</span>
    </div>
  );
}
