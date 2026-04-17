import { useState, useMemo, useEffect } from "react";
import { useClientAccounts } from "@/contexts/ClientAccountContext";
import { CS_STAGES, CSStage, CS_STAGE_DESCRIPTIONS } from "@/types/clientAccount";
import { ClientAccountCard } from "@/components/ClientAccountCard";
import { ClientAccountDetail } from "@/components/ClientAccountDetail";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STAGE_TONES: Record<CSStage, string> = {
  "Onboarding": "bg-secondary/40",
  "Active": "bg-secondary/40",
  "Renewal Due": "bg-secondary/60",
  "Paused": "bg-muted/50",
  "Churned": "bg-muted/30",
};

const STAGE_CHIPS: Record<CSStage, string[]> = {
  "Onboarding": ["Billing + dates required", "48h guide SLA"],
  "Active": ["Monthly task auto-creates"],
  "Renewal Due": ["60d auto-trigger"],
  "Paused": ["30d resume task"],
  "Churned": ["Churn reason required", "Notifies Malik"],
};

interface ClientPipelineProps {
  initialAccountId?: string | null;
  onClearInitial?: () => void;
}

export function ClientPipeline({ initialAccountId = null, onClearInitial }: ClientPipelineProps) {
  const { accounts, loading, moveToStage } = useClientAccounts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CSStage | null>(null);

  // Auto-open drawer when arriving via Linked Account card
  useEffect(() => {
    if (initialAccountId) setSelectedId(initialAccountId);
  }, [initialAccountId]);

  const handleClose = () => {
    setSelectedId(null);
    onClearInitial?.();
  };

  const grouped = useMemo(() => {
    const map = new Map<CSStage, typeof accounts>();
    CS_STAGES.forEach(s => map.set(s, []));
    accounts.forEach(a => {
      const stage = (CS_STAGES.includes(a.cs_stage as CSStage) ? a.cs_stage : "Active") as CSStage;
      map.get(stage)!.push(a);
    });
    return map;
  }, [accounts]);

  const totals = useMemo(() => {
    const totalMRR = accounts
      .filter(a => a.cs_stage === "Active" || a.cs_stage === "Renewal Due")
      .reduce((sum, a) => sum + (a.monthly_value || 0), 0);
    const activeCount = accounts.filter(a => a.cs_stage !== "Churned" && a.cs_stage !== "Paused").length;
    return { totalMRR, activeCount, totalCount: accounts.length };
  }, [accounts]);

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (stage: CSStage) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedId) return;
    const acc = accounts.find(a => a.id === draggedId);
    if (!acc || acc.cs_stage === stage) { setDraggedId(null); return; }
    if (stage === "Paused" || stage === "Churned") {
      // Open detail to capture reason via modal
      setSelectedId(draggedId);
      setDraggedId(null);
      toast.info(`Open the panel to capture a ${stage === "Paused" ? "pause" : "churn"} reason`);
      return;
    }
    moveToStage(draggedId, stage);
    toast.success(`Moved to ${stage}`);
    setDraggedId(null);
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Loading client accounts…</div>;
  }

  return (
    <div className="px-6 py-5">
      {/* Header / KPIs */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Client Success Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Account management for {totals.totalCount} customer{totals.totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active MRR</p>
            <p className="text-base font-semibold">${totals.totalMRR.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active Accounts</p>
            <p className="text-base font-semibold">{totals.activeCount}</p>
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-5 gap-3">
        {CS_STAGES.map(stage => {
          const items = grouped.get(stage) || [];
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={handleDrop(stage)}
              className={cn(
                "rounded-md border border-border min-h-[60vh] flex flex-col transition-colors",
                STAGE_TONES[stage],
                dragOverStage === stage && "border-foreground/40 bg-secondary/80"
              )}
            >
              <div className="px-3 pt-3 pb-2 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider">{stage}</h3>
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                  {CS_STAGE_DESCRIPTIONS[stage]}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {STAGE_CHIPS[stage].map(chip => (
                    <span
                      key={chip}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-background/60 border border-border/60 text-muted-foreground font-medium leading-tight"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
                {items.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/70 italic text-center py-6">No accounts</p>
                )}
                {items.map(acc => (
                  <ClientAccountCard
                    key={acc.id}
                    account={acc}
                    onClick={() => setSelectedId(acc.id)}
                    onDragStart={handleDragStart(acc.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ClientAccountDetail accountId={selectedId} onClose={handleClose} />
    </div>
  );
}
