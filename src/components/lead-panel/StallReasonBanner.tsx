import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Lead } from "@/types/lead";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLeads } from "@/contexts/LeadContext";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";
import { normalizeStage } from "@/lib/leadUtils";

const STALL_REASONS = [
  "Legal / procurement review",
  "Budget not released",
  "Awaiting internal approval",
  "Competing priorities",
  "Champion unavailable",
  "Price / scope renegotiation",
  "Silent — no response",
  "Other",
];

/**
 * Inline banner shown at the top of the deal room when a Proposal Sent deal
 * has been in stage longer than 14 days without a documented stall reason.
 * Forces the rep to select a locked reason so the proposal isn't invisible.
 */
export function StallReasonBanner({ lead, daysInStage }: { lead: Lead; daysInStage: number }) {
  const { updateLead } = useLeads();
  const [choice, setChoice] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const eligible =
    normalizeStage(lead.stage) === "Proposal Sent" &&
    daysInStage > 14 &&
    !lead.stallReason?.trim();

  if (!eligible) return null;

  const save = async () => {
    if (!choice) return;
    setSaving(true);
    try {
      updateLead(lead.id, { stallReason: choice });
      await logActivity(lead.id, "field_update", `Stall reason set: ${choice}`, "", choice);
      toast.success("Stall reason logged");
    } catch (err) {
      toast.error("Couldn't save: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/5 px-5 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="text-xs min-w-0">
            <span className="font-medium text-foreground">Proposal stalled</span>
            <span className="text-muted-foreground">
              {" "}· {daysInStage}d in Proposal Sent without a documented reason. Pick one to keep the record honest.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger className="h-7 text-xs w-[220px]">
              <SelectValue placeholder="Select stall reason…" />
            </SelectTrigger>
            <SelectContent>
              {STALL_REASONS.map(r => (
                <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={save}
            disabled={!choice || saving}
            className="h-7 text-xs gap-1"
          >
            <Check className="h-3 w-3" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
