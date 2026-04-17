import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Handshake, Swords, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, KeyboardEvent } from "react";
import { logActivity } from "@/lib/activityLog";

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

/**
 * Bankers list is stored as a single string but using `;` as the separator so
 * advisor names containing commas (e.g. "Smith, Jones & Co") survive round-trip.
 * Legacy comma-separated values are still parsed for backwards compatibility on read.
 */
function parseBankers(raw: string): string[] {
  if (!raw) return [];
  // Prefer semicolon if present; otherwise fall back to comma split (legacy).
  const sep = raw.includes(";") ? ";" : ",";
  return raw.split(sep).map(s => s.trim()).filter(Boolean);
}

function serializeBankers(chips: string[]): string {
  return chips.join("; ");
}

export function MutualPlanCard({ lead, save }: Props) {
  const [step, setStep] = useState(lead.nextMutualStep || "");
  const [date, setDate] = useState(lead.nextMutualStepDate || "");
  const [chips, setChips] = useState<string[]>(parseBankers(lead.competingBankers || ""));
  const [pending, setPending] = useState("");

  useEffect(() => { setStep(lead.nextMutualStep || ""); }, [lead.nextMutualStep]);
  useEffect(() => { setDate(lead.nextMutualStepDate || ""); }, [lead.nextMutualStepDate]);
  useEffect(() => { setChips(parseBankers(lead.competingBankers || "")); }, [lead.competingBankers]);

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
  const persistChips = (next: string[]) => {
    const serialized = serializeBankers(next);
    if (serialized === (lead.competingBankers || "")) return;
    save({ competingBankers: serialized });
    logActivity(lead.id, "field_update", `Competing bankers: ${serialized || "(cleared)"}`);
  };

  const addChip = () => {
    const v = pending.trim();
    if (!v) return;
    if (chips.includes(v)) { setPending(""); return; }
    const next = [...chips, v];
    setChips(next); setPending("");
    persistChips(next);
  };
  const removeChip = (c: string) => {
    const next = chips.filter(x => x !== c);
    setChips(next);
    persistChips(next);
  };
  const onChipKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ";") { e.preventDefault(); addChip(); }
    if (e.key === "Backspace" && !pending && chips.length > 0) {
      const next = chips.slice(0, -1);
      setChips(next); persistChips(next);
    }
  };

  return (
    <CollapsibleCard
      title="Mutual Close Plan"
      icon={<Handshake className="h-3.5 w-3.5" />}
      defaultOpen={!!step || chips.length > 0}
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
          <div className="flex flex-wrap gap-1 mt-1.5">
            {chips.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 text-[10px] pl-1.5 pr-0.5 py-0.5 rounded bg-secondary text-foreground/80">
                {c}
                <button
                  type="button"
                  onClick={() => removeChip(c)}
                  className="text-muted-foreground hover:text-destructive p-0.5 rounded"
                  title={`Remove ${c}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <Input
              value={pending}
              onChange={(e) => setPending(e.target.value)}
              onKeyDown={onChipKey}
              onBlur={addChip}
              placeholder={chips.length === 0 ? "Houlihan, in-house corp dev…" : "Add another…"}
              className="h-7 text-xs"
            />
            <button
              type="button"
              onClick={addChip}
              disabled={!pending.trim()}
              className="h-7 w-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Add advisor"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-1">Press Enter or ; to add. Names with commas are preserved.</p>
        </div>
      </div>
    </CollapsibleCard>
  );
}
