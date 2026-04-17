import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClientAccount, CSStage, CS_STAGES } from "@/types/clientAccount";
import { useClientAccounts } from "@/contexts/ClientAccountContext";
import { useClientAccountTasks } from "@/hooks/useClientAccountTasks";
import { useLeads } from "@/contexts/LeadContext";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, CheckCircle2, Circle, AlertOctagon, PauseCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  accountId: string | null;
  onClose: () => void;
}

export function ClientAccountDetail({ accountId, onClose }: Props) {
  const { accounts, updateAccount, moveToStage } = useClientAccounts();
  const { leads } = useLeads();
  const account = accounts.find(a => a.id === accountId) || null;
  const { tasks, completeTask } = useClientAccountTasks(accountId);
  const [local, setLocal] = useState<Partial<ClientAccount>>({});
  const [pauseModal, setPauseModal] = useState(false);
  const [churnModal, setChurnModal] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseCredit, setPauseCredit] = useState("");
  const [churnReason, setChurnReason] = useState("");

  useEffect(() => {
    if (account) setLocal({});
  }, [account?.id]);

  if (!account) return null;

  const sourceLead = leads.find(l => l.id === account.lead_id);
  const merged = { ...account, ...local };

  const save = (updates: Partial<ClientAccount>) => {
    setLocal(prev => ({ ...prev, ...updates }));
    updateAccount(account.id, updates);
  };

  const handleStageChange = (newStage: CSStage) => {
    if (newStage === "Paused") { setPauseModal(true); return; }
    if (newStage === "Churned") { setChurnModal(true); return; }
    moveToStage(account.id, newStage);
    toast.success(`Moved to ${newStage}`);
  };

  const confirmPause = () => {
    if (!pauseReason.trim()) { toast.error("Pause reason required"); return; }
    moveToStage(account.id, "Paused", {
      pause_reason: pauseReason,
      pause_credit: parseFloat(pauseCredit) || 0,
      paused_at: new Date().toISOString(),
    });
    setPauseModal(false); setPauseReason(""); setPauseCredit("");
    toast.success("Account paused");
  };

  const confirmChurn = () => {
    if (!churnReason.trim()) { toast.error("Churn reason required"); return; }
    moveToStage(account.id, "Churned", {
      churn_reason: churnReason,
      churn_date: new Date().toISOString().split("T")[0],
    });
    setChurnModal(false); setChurnReason("");
    toast.success("Account churned — Malik will be notified");
  };

  return (
    <>
      <Sheet open={!!accountId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b sticky top-0 bg-background z-10">
            <div className="flex items-start gap-3">
              <CompanyAvatar companyUrl={merged.company_url} email={merged.contact_email} companyName={merged.company} size="lg" />
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base truncate">{merged.company}</SheetTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{merged.contact_name} · {merged.contact_email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px]">{merged.brand}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{merged.cs_stage}</Badge>
                  <span className="text-[10px] text-muted-foreground">Owner: {merged.owner}</span>
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="px-6 py-5 space-y-6">
            {/* Source deal link */}
            {sourceLead && (
              <section>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Source Deal</Label>
                <a
                  href={`#view=pipeline&sys=crm&lead=${sourceLead.id}`}
                  className="flex items-center justify-between p-2.5 border border-border rounded-md hover:bg-secondary/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{sourceLead.id} · {sourceLead.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">Won {sourceLead.closedDate || "—"}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              </section>
            )}

            {/* Stage selector */}
            <section>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Stage</Label>
              <Select value={merged.cs_stage} onValueChange={(v) => handleStageChange(v as CSStage)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CS_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </section>

            {/* Billing */}
            <section>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Billing</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px]">Monthly Value ($)</Label>
                  <Input type="number" value={merged.monthly_value} onChange={(e) => save({ monthly_value: parseFloat(e.target.value) || 0 })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[11px]">Retainer ($)</Label>
                  <Input type="number" value={merged.retainer_value} onChange={(e) => save({ retainer_value: parseFloat(e.target.value) || 0 })} className="h-8 text-sm" />
                </div>
                {merged.brand === "SourceCo" && (
                  <div>
                    <Label className="text-[11px]">Success Fee (%)</Label>
                    <Input type="number" value={merged.success_fee_pct} onChange={(e) => save({ success_fee_pct: parseFloat(e.target.value) || 0 })} className="h-8 text-sm" />
                  </div>
                )}
                <div>
                  <Label className="text-[11px]">Service Type</Label>
                  <Input value={merged.service_type} onChange={(e) => save({ service_type: e.target.value })} className="h-8 text-sm" />
                </div>
              </div>
            </section>

            {/* Contract */}
            <section>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Contract</Label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[11px]">Start</Label>
                  <Input type="date" value={merged.contract_start || ""} onChange={(e) => save({ contract_start: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[11px]">End</Label>
                  <Input type="date" value={merged.contract_end || ""} onChange={(e) => save({ contract_end: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[11px]">Months</Label>
                  <Input type="number" value={merged.contract_months || ""} onChange={(e) => save({ contract_months: parseInt(e.target.value) || null })} className="h-8 text-sm" />
                </div>
              </div>
            </section>

            {/* Tasks */}
            <section>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">
                Tasks ({tasks.filter(t => t.status === "pending").length} pending)
              </Label>
              <div className="space-y-1.5">
                {tasks.length === 0 && <p className="text-xs text-muted-foreground italic">No tasks yet</p>}
                {tasks.map(t => (
                  <div key={t.id} className="flex items-start gap-2 p-2 border border-border rounded-md">
                    <button onClick={() => completeTask(t.id)} className="mt-0.5 shrink-0">
                      {t.status === "done"
                        ? <CheckCircle2 className="h-4 w-4 text-foreground" />
                        : <Circle className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                        {t.title}
                      </p>
                      {t.description && <p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">Due {t.due_date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Notes */}
            <section>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Notes</Label>
              <Textarea
                value={merged.notes || ""}
                onChange={(e) => setLocal(prev => ({ ...prev, notes: e.target.value }))}
                onBlur={() => { if (local.notes !== undefined) save({ notes: local.notes }); }}
                rows={4}
                className="text-sm"
                placeholder="Account notes, milestones, escalations…"
              />
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Pause modal */}
      {pauseModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setPauseModal(false)}>
          <div className="bg-background border border-border rounded-lg p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <PauseCircle className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Pause Account</h3>
            </div>
            <Label className="text-xs">Reason</Label>
            <Textarea value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} rows={3} className="text-sm mb-3" placeholder="Why is service pausing?" />
            <Label className="text-xs">Credit Issued ($)</Label>
            <Input type="number" value={pauseCredit} onChange={(e) => setPauseCredit(e.target.value)} className="h-8 text-sm mb-4" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setPauseModal(false)}>Cancel</Button>
              <Button size="sm" onClick={confirmPause}>Pause</Button>
            </div>
          </div>
        </div>
      )}

      {/* Churn modal */}
      {churnModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setChurnModal(false)}>
          <div className="bg-background border border-border rounded-lg p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertOctagon className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Mark Churned</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">Malik will be notified. This action requires a reason.</p>
            <Label className="text-xs">Churn Reason</Label>
            <Textarea value={churnReason} onChange={(e) => setChurnReason(e.target.value)} rows={3} className="text-sm mb-4" placeholder="Why did the customer churn?" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setChurnModal(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={confirmChurn}>Confirm Churn</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
