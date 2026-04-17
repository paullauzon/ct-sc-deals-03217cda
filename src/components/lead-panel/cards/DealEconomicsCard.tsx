import { Lead, BillingFrequency } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLog";

const CONFIDENCE = [10, 30, 50, 70, 90] as const;
const BILLING: BillingFrequency[] = ["Monthly", "Quarterly", "Annually"];

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

function fmtMoney(n: number) {
  if (!n) return "$0";
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n.toLocaleString()}`;
}

export function DealEconomicsCard({ lead, save }: Props) {
  const [mrr, setMrr] = useState(String(lead.dealValue || ""));
  const [months, setMonths] = useState(String(lead.contractMonths ?? 12));
  const [billing, setBilling] = useState<BillingFrequency>(lead.billingFrequency || "Monthly");
  const [confidence, setConfidence] = useState<number>(lead.closeConfidence ?? 0);

  useEffect(() => { setMrr(String(lead.dealValue || "")); }, [lead.dealValue]);
  useEffect(() => { setMonths(String(lead.contractMonths ?? 12)); }, [lead.contractMonths]);
  useEffect(() => { setBilling(lead.billingFrequency || "Monthly"); }, [lead.billingFrequency]);
  useEffect(() => { setConfidence(lead.closeConfidence ?? 0); }, [lead.closeConfidence]);

  const persistMrr = () => {
    const n = Number(mrr) || 0;
    if (n === lead.dealValue) return;
    save({ dealValue: n });
    logActivity(lead.id, "field_update", `MRR: $${n.toLocaleString()}`);
  };
  const persistMonths = () => {
    const n = Number(months) || 12;
    if (n === (lead.contractMonths ?? 12)) return;
    save({ contractMonths: n });
    logActivity(lead.id, "field_update", `Contract length: ${n} months`);
  };
  const persistBilling = (v: BillingFrequency) => {
    setBilling(v); save({ billingFrequency: v });
  };
  const setConf = (n: number) => {
    setConfidence(n);
    save({ closeConfidence: n });
    logActivity(lead.id, "field_update", `Close confidence: ${n}%`);
  };

  const tcv = (Number(mrr) || 0) * (Number(months) || 0);
  const weighted = tcv * (confidence / 100);

  const isClosed = lead.stage === "Closed Won" || lead.stage === "Lost" || lead.stage === "Went Dark";

  return (
    <CollapsibleCard
      title="Deal Economics"
      icon={<Calculator className="h-3.5 w-3.5" />}
      defaultOpen={!isClosed}
    >
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">MRR</label>
            <div className="relative mt-0.5">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input type="number" value={mrr} onChange={(e) => setMrr(e.target.value)} onBlur={persistMrr} className="h-7 text-xs pl-5" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Months</label>
            <Input type="number" value={months} onChange={(e) => setMonths(e.target.value)} onBlur={persistMonths} className="h-7 text-xs mt-0.5" />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Billing</label>
          <Select value={billing} onValueChange={(v) => persistBilling(v as BillingFrequency)}>
            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BILLING.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-border/40 pt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">TCV</span>
            <span className="text-sm font-semibold tabular-nums">{fmtMoney(tcv)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Weighted ({confidence}%)</span>
            <span className="tabular-nums">{fmtMoney(weighted)}</span>
          </div>
        </div>

        <div className="border-t border-border/40 pt-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Close confidence</label>
          <div className="flex items-center gap-1">
            {CONFIDENCE.map(c => (
              <button
                key={c}
                onClick={() => setConf(c)}
                className={cn(
                  "flex-1 h-7 text-[11px] font-medium rounded border transition-colors",
                  confidence === c
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
                )}
              >
                {c}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
