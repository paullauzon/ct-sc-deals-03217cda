import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Handshake, Swords } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { logActivity } from "@/lib/activityLog";

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

export function MutualPlanCard({ lead, save }: Props) {
  const [step, setStep] = useState(lead.nextMutualStep || "");
  const [date, setDate] = useState(lead.nextMutualStepDate || "");
  const [bankers, setBankers] = useState(lead.competingBankers || "");

  useEffect(() => { setStep(lead.nextMutualStep || ""); }, [lead.nextMutualStep]);
  useEffect(() => { setDate(lead.nextMutualStepDate || ""); }, [lead.nextMutualStepDate]);
  useEffect(() => { setBankers(lead.competingBankers || ""); }, [lead.competingBankers]);

  const persistStep = () => {
    if (step === (lead.nextMutualStep || "")) return;
    save({ nextMutualStep: step });
    logActivity(lead.id, "field_update", `Next mutual step: ${step || "(cleared)"}`);
  };
  const persistDate = () => {
    if (date === (lead.nextMutualStepDate || "")) return;
    save({ nextMutualStepDate: date });
    logActivity(lead.id, "field_update", `Mutual step date: ${date || "(cleared)"}`);
  };
  const persistBankers = () => {
    if (bankers === (lead.competingBankers || "")) return;
    save({ competingBankers: bankers });
    logActivity(lead.id, "field_update", `Competing bankers: ${bankers || "(cleared)"}`);
  };

  const chips = bankers.split(",").map(s => s.trim()).filter(Boolean);

  return (
    <CollapsibleCard
      title="Mutual Close Plan"
      icon={<Handshake className="h-3.5 w-3.5" />}
      defaultOpen={!!step || !!bankers}
    >
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Next agreed step</label>
          <Textarea
            value={step}
            onChange={(e) => setStep(e.target.value)}
            onBlur={persistStep}
            placeholder="e.g. Send sample target list, schedule founder call…"
            className="text-xs min-h-[44px] mt-1 resize-none"
            rows={2}
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={persistDate}
            className="h-7 text-xs mt-1.5"
          />
        </div>

        <div className="border-t border-border/40 pt-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
            <Swords className="h-3 w-3" /> Competing bankers / advisors
          </label>
          <Input
            value={bankers}
            onChange={(e) => setBankers(e.target.value)}
            onBlur={persistBankers}
            placeholder="Houlihan, in-house corp dev…"
            className="h-7 text-xs mt-1"
          />
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {chips.map((c, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-foreground/80">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </CollapsibleCard>
  );
}
