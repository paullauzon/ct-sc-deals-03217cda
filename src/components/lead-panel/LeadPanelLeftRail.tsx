import { useEffect, useRef } from "react";
import { Lead, LeadStage, ServiceInterest, ForecastCategory, IcpFit, DealOwner, BillingFrequency, CloseReason, LeadStatus } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { IdentityCard } from "@/components/dealroom/IdentityCard";
import { InlineTextField, InlineSelectField, InlineToggleField } from "./InlineEditFields";

import { Input } from "@/components/ui/input";
import { DealEconomicsCard } from "./cards/DealEconomicsCard";
import { MutualPlanCard } from "./cards/MutualPlanCard";
import { BuyerProfileCard } from "./cards/BuyerProfileCard";
import { MAMandateCard } from "./cards/MAMandateCard";
import { SalesProcessCard } from "./cards/SalesProcessCard";
import { SourceEngagementCard } from "./cards/SourceEngagementCard";
import { cn } from "@/lib/utils";

const LEAD_STATUS_TONE: Record<string, string> = {
  "New": "bg-secondary text-foreground/80",
  "Working": "bg-secondary text-foreground/80",
  "Connected": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "Reviewing": "bg-secondary text-foreground/80",
  "Stalled": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Bad Timing": "bg-secondary text-muted-foreground",
  "Not Now": "bg-secondary text-muted-foreground",
};

const STAGES: LeadStage[] = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Revisit/Reconnect", "Lost", "Went Dark", "Closed Won"];
const SERVICES: ServiceInterest[] = ["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "SourceCo Retained Search", "Other", "TBD"];
const PRIORITIES = ["High", "Medium", "Low"];
const OWNERS: DealOwner[] = ["Malik", "Valeria", "Tomos"];
const FORECASTS: ForecastCategory[] = ["Commit", "Best Case", "Pipeline", "Omit"];
const ICP_FITS: IcpFit[] = ["Strong", "Moderate", "Weak"];
const LEAD_STATUSES: LeadStatus[] = ["New", "Working", "Connected", "Reviewing", "Stalled", "Bad Timing", "Not Now"];
const CLOSE_REASONS: CloseReason[] = ["Budget", "Timing", "Competitor", "No Fit", "No Response", "Not Qualified", "Champion Left", "Other"];

interface Props {
  lead: Lead;
  daysInStage: number;
  save: (updates: Partial<Lead>) => void;
  onEmail?: () => void;
  onSchedule?: () => void;
  onNote?: () => void;
  onTask?: () => void;
  onDraftAI?: () => void;
  onLogCall?: () => void;
  onEnrich?: () => void;
  onAskAI?: () => void;
  onArchive?: () => void;
  onCopyLink?: () => void;
  onCopySummary?: () => void;
  onShowShortcuts?: () => void;
  draftingAI?: boolean;
  enriching?: boolean;
}

export function LeadPanelLeftRail({
  lead, daysInStage, save,
  onEmail, onSchedule, onNote, onTask, onDraftAI, onLogCall, onEnrich, onAskAI,
  onArchive, onCopyLink, onCopySummary, onShowShortcuts, draftingAI, enriching,
}: Props) {
  const isSourceCo = lead.brand === "SourceCo";
  const isClosed = lead.stage === "Closed Won" || lead.stage === "Lost" || lead.stage === "Went Dark";
  const railRef = useRef<HTMLElement | null>(null);

  // Listen for the Dossier % chip click → scroll to first empty dossier row & flash it.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.leadId && detail.leadId !== lead.id) return;
      const root = railRef.current;
      if (!root) return;
      const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-dossier-row]"));
      const target = rows.find(r => r.dataset.dossierFilled === "false") || rows[0];
      if (!target) return;
      // Open any collapsed parent <details> by finding closest CollapsibleCard wrapper button
      let parent = target.parentElement;
      while (parent && parent !== root) {
        if (parent.tagName === "DETAILS" && !(parent as HTMLDetailsElement).open) {
          (parent as HTMLDetailsElement).open = true;
        }
        parent = parent.parentElement;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("ring-2", "ring-foreground/40", "rounded-sm", "transition-all");
      setTimeout(() => target.classList.remove("ring-2", "ring-foreground/40", "rounded-sm", "transition-all"), 1500);
    };
    window.addEventListener("scroll-to-empty-dossier", handler);
    return () => window.removeEventListener("scroll-to-empty-dossier", handler);
  }, [lead.id]);

  return (
    <aside ref={railRef} className="w-[320px] shrink-0 border-r border-border overflow-y-auto bg-background h-full min-h-0">
      <div className="px-4 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">About</span>
      </div>

      <IdentityCard
        lead={lead}
        onEmail={onEmail}
        onSchedule={onSchedule}
        onNote={onNote}
        onTask={onTask}
        onDraftAI={onDraftAI}
        onLogCall={onLogCall}
        onEnrich={onEnrich}
        onAskAI={onAskAI}
        onArchive={onArchive}
        onCopyLink={onCopyLink}
        onCopySummary={onCopySummary}
        onShowShortcuts={onShowShortcuts}
        draftingAI={draftingAI}
        enriching={enriching}
      />

      <div className="border-t border-border" />

      <CollapsibleCard title="Key Information" defaultOpen>
        <div className="space-y-0">
          <InlineSelectField label="Stage" value={lead.stage} options={STAGES} onSave={(v) => save({ stage: v as LeadStage, stageEnteredDate: new Date().toISOString().split("T")[0] })} />
          <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40">
            <span className="text-muted-foreground">Status</span>
            <div className="flex items-center gap-1.5">
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium leading-tight", LEAD_STATUS_TONE[lead.leadStatus || "Working"] || "bg-secondary text-foreground/80")}>
                {lead.leadStatus || "Working"}
              </span>
              <select
                value={lead.leadStatus || "Working"}
                onChange={(e) => save({ leadStatus: e.target.value as LeadStatus })}
                className="bg-transparent text-[11px] text-muted-foreground hover:text-foreground border-0 cursor-pointer focus:outline-none focus:ring-0"
                title="Change status"
              >
                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <InlineSelectField label="Priority" value={lead.priority} options={PRIORITIES} onSave={(v) => save({ priority: v as "High" | "Medium" | "Low" })} />
          <InlineSelectField label="Forecast" value={lead.forecastCategory} options={FORECASTS} onSave={(v) => save({ forecastCategory: v as ForecastCategory })} allowEmpty />
          <InlineSelectField label="ICP Fit" value={lead.icpFit} options={ICP_FITS} onSave={(v) => save({ icpFit: v as IcpFit })} allowEmpty />
          <InlineSelectField label="Owner" value={lead.assignedTo} options={OWNERS} onSave={(v) => save({ assignedTo: v as DealOwner })} allowEmpty />
          <InlineSelectField label="Service" value={lead.serviceInterest} options={SERVICES} onSave={(v) => save({ serviceInterest: v as ServiceInterest })} />
          <InlineToggleField label="Pre-Screen" value={lead.preScreenCompleted} onSave={(v) => save({ preScreenCompleted: v })} onLabel="Done" offLabel="Pending" />
          <InlineTextField label="Subscription" value={lead.subscriptionValue} type="number" onSave={(v) => save({ subscriptionValue: Number(v) || 0 })} />
          {lead.tier && (
            <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
              <span className="text-muted-foreground">Tier</span>
              <span className="font-medium">Tier {lead.tier}</span>
            </div>
          )}
        </div>
      </CollapsibleCard>

      <DealEconomicsCard lead={lead} save={save} />

      <BuyerProfileCard lead={lead} save={save} />

      <MAMandateCard lead={lead} save={save} />

      <SalesProcessCard lead={lead} save={save} />

      <MutualPlanCard lead={lead} save={save} />

      <CollapsibleCard title="Dates" defaultOpen={false}>
        <div className="space-y-0">
          <InlineTextField label="Meeting" value={lead.meetingDate} type="date" onSave={(v) => save({ meetingDate: v })} />
          <InlineTextField label="Next Follow-up" value={lead.nextFollowUp} type="date" onSave={(v) => save({ nextFollowUp: v })} />
          <InlineTextField label="Last Contact" value={lead.lastContactDate} type="date" onSave={(v) => save({ lastContactDate: v })} />
          <InlineTextField label="Forecast Close" value={lead.forecastedCloseDate} type="date" onSave={(v) => save({ forecastedCloseDate: v })} />
          <InlineTextField label="Closed" value={lead.closedDate} type="date" onSave={(v) => save({ closedDate: v })} />
          <InlineTextField label="Contract Start" value={lead.contractStart} type="date" onSave={(v) => save({ contractStart: v })} />
          <InlineTextField label="Contract End" value={lead.contractEnd} type="date" onSave={(v) => save({ contractEnd: v })} />
          <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
            <span className="text-muted-foreground">Days in stage</span>
            <span className="font-medium">{daysInStage}d</span>
          </div>
        </div>
      </CollapsibleCard>

      <SourceEngagementCard lead={lead} />

      {isClosed && (
        <CollapsibleCard title={lead.stage === "Closed Won" ? "Won Details" : "Lost / Dark Details"} defaultOpen>
          <div className="space-y-2">
            {lead.stage === "Closed Won" ? (
              <Input value={lead.wonReason} onChange={(e) => save({ wonReason: e.target.value })} placeholder="Why did we win?" className="h-8 text-xs" />
            ) : (
              <>
                <InlineSelectField label="Close Reason" value={lead.closeReason} options={CLOSE_REASONS} onSave={(v) => save({ closeReason: v as CloseReason })} allowEmpty />
                <Input value={lead.lostReason} onChange={(e) => save({ lostReason: e.target.value })} placeholder="Detail..." className="h-8 text-xs mt-1" />
              </>
            )}
          </div>
        </CollapsibleCard>
      )}

      {lead.message && (
        <CollapsibleCard title="Original Message" defaultOpen={false}>
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {lead.message}
          </p>
        </CollapsibleCard>
      )}

      <div className="h-6" />
    </aside>
  );
}
