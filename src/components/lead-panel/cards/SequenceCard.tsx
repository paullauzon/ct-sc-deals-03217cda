// Right-rail card on the deal panel for leads enrolled in a nurture sequence.
// Surfaces current step, day count, next touch, and a Pause/Exit action.

import { useState } from "react";
import { Workflow, ExternalLink, Pause, X, Play } from "lucide-react";
import { Lead } from "@/types/lead";
import { Badge } from "@/components/ui/badge";
import { useLeads } from "@/contexts/LeadContext";
import { dayInSequence, nextStepFor } from "@/components/sequences/sequenceConfig";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { toast } from "@/hooks/use-toast";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  re_engaged: "Re-engaged",
  completed: "Completed",
  exited_referral: "Exited (referral)",
  archived: "Paused",
};

export function SequenceCard({ lead }: { lead: Lead }) {
  const { updateLead } = useLeads();
  const [busy, setBusy] = useState(false);

  if (!lead.nurtureSequenceStatus) return null;

  const day = dayInSequence(lead);
  const next = nextStepFor(lead);
  const log = lead.nurtureStepLog ?? [];
  const last = log[log.length - 1];
  const status = lead.nurtureSequenceStatus;
  const isActive = status === "active";

  function openCampaign() {
    const params = new URLSearchParams(window.location.hash.replace("#", ""));
    params.set("view", "sequences");
    params.set("sys", "crm");
    window.location.hash = params.toString();
  }

  async function pause() {
    setBusy(true);
    await updateLead(lead.id, { nurtureSequenceStatus: "archived", nurtureExitReason: "Manually paused" });
    setBusy(false);
    toast({ title: "Sequence paused", description: "No further nurture touches will fire." });
  }
  async function resume() {
    setBusy(true);
    await updateLead(lead.id, { nurtureSequenceStatus: "active", nurtureExitReason: "" });
    setBusy(false);
    toast({ title: "Sequence resumed" });
  }
  async function exitSeq() {
    setBusy(true);
    await updateLead(lead.id, { nurtureSequenceStatus: "completed", nurtureExitReason: "Manual exit" });
    setBusy(false);
    toast({ title: "Sequence exited" });
  }

  return (
    <CollapsibleCard
      title="Sequence"
      icon={<Workflow className="h-3.5 w-3.5" />}
      headerRight={
        <button onClick={openCampaign} className="text-muted-foreground hover:text-foreground" title="Open campaign">
          <ExternalLink className="h-3 w-3" />
        </button>
      }
      defaultOpen
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">S8 — 90-day post-loss</div>
          <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[status] || status}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Day</div>
            <div className="font-mono text-foreground">{day != null ? `D${day}` : "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Last</div>
            <div className="font-mono text-foreground">{last?.step ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Next</div>
            <div className="font-mono text-foreground">{next?.key ?? "—"}</div>
          </div>
        </div>
        {lead.nurtureExitReason && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2">
            Exit reason: {lead.nurtureExitReason}
          </div>
        )}
        <div className="flex items-center gap-1.5 pt-1">
          {isActive ? (
            <button
              onClick={pause}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary text-foreground transition-colors disabled:opacity-50"
            >
              <Pause className="h-3 w-3" /> Pause
            </button>
          ) : status === "archived" ? (
            <button
              onClick={resume}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary text-foreground transition-colors disabled:opacity-50"
            >
              <Play className="h-3 w-3" /> Resume
            </button>
          ) : null}
          {(isActive || status === "archived") && (
            <button
              onClick={exitSeq}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Exit
            </button>
          )}
        </div>
      </div>
    </CollapsibleCard>
  );
}
