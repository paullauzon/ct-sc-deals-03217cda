import { useState, useMemo } from "react";
import { Lead, LeadStage } from "@/types/lead";
import { GateField, evaluateGate, getGateForStage } from "@/lib/stageGates";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ShieldOff, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";

interface StageGateGuardProps {
  /** The lead being moved. */
  lead: Lead;
  /** The destination stage triggering the gate. Null = closed. */
  targetStage: LeadStage | null;
  /** Called when the rep saves edits + commits the stage move. */
  onCommit: (updates: Partial<Lead>, targetStage: LeadStage) => Promise<void> | void;
  /** Called when the rep cancels the move. */
  onCancel: () => void;
  /** Logged into stage_gate_overrides — defaults to lead.assignedTo. */
  currentUser?: string;
}

/**
 * Generalized stage-gate guard. Replaces the old close-won-only modal with a
 * unified flow that:
 *   1. Shows missing fields as a checklist
 *   2. Lets the rep fill them inline
 *   3. Provides an explicit "Override gate" escape hatch (audit-logged)
 *
 * Routes through the same `onCommit` callback whether all fields are filled
 * or the rep overrides — caller persists everything via updateLead().
 */
export function StageGateGuard({ lead, targetStage, onCommit, onCancel, currentUser }: StageGateGuardProps) {
  const open = !!targetStage;
  const gate = targetStage ? getGateForStage(targetStage) : null;
  const evaluation = useMemo(
    () => (targetStage ? evaluateGate(lead, targetStage) : { passes: true, missing: [], missingFields: [] }),
    [lead, targetStage],
  );

  // Local edit buffer — only the fields we display
  const [edits, setEdits] = useState<Partial<Lead>>({});
  const [submitting, setSubmitting] = useState(false);

  // Compute "can submit cleanly" using the working buffer
  const merged = useMemo(() => ({ ...lead, ...edits }) as Lead, [lead, edits]);
  const liveEvaluation = useMemo(
    () => (targetStage ? evaluateGate(merged, targetStage) : evaluation),
    [merged, targetStage, evaluation],
  );

  if (!open || !gate || !targetStage) return null;

  const updateField = (key: keyof Lead, value: unknown) => {
    setEdits((prev) => ({ ...prev, [key]: value as never }));
  };

  const handleSave = async (override = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload: Partial<Lead> = { ...edits, stage: targetStage };
      if (override && liveEvaluation.missing.length > 0) {
        const auditEntry = {
          stage: targetStage,
          missing: liveEvaluation.missing,
          overriddenBy: currentUser || lead.assignedTo || "Unknown",
          at: new Date().toISOString(),
        };
        payload.stageGateOverrides = [...(lead.stageGateOverrides || []), auditEntry];
        toast.warning("Gate overridden", {
          description: `Logged: ${liveEvaluation.missing.join(", ")}`,
        });
      }
      await onCommit(payload, targetStage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            {gate.title}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed pt-1">
            {gate.rationale}
          </DialogDescription>
        </DialogHeader>

        {liveEvaluation.passes ? (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              All requirements met — ready to move to <span className="font-semibold">{targetStage}</span>.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              {liveEvaluation.missing.length} requirement{liveEvaluation.missing.length > 1 ? "s" : ""} missing — fill below or override with reason.
            </p>
          </div>
        )}

        <div className="space-y-3 pt-1">
          {gate.requiredFields.map((field) => (
            <GateFieldEditor
              key={String(field.key)}
              field={field}
              currentValue={(merged as any)[field.key]}
              onChange={(v) => updateField(field.key, v)}
            />
          ))}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting} className="text-xs">
            Cancel
          </Button>
          <div className="flex gap-2">
            {!liveEvaluation.passes && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(true)}
                disabled={submitting}
                className="text-xs gap-1.5"
              >
                <ShieldOff className="h-3.5 w-3.5" />
                Override & move
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => handleSave(false)}
              disabled={submitting || !liveEvaluation.passes}
              className="text-xs"
            >
              {submitting ? "Moving…" : `Move to ${targetStage}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GateFieldEditor({
  field,
  currentValue,
  onChange,
}: {
  field: GateField;
  currentValue: unknown;
  onChange: (value: unknown) => void;
}) {
  const isEmpty =
    currentValue === null ||
    currentValue === undefined ||
    currentValue === "" ||
    (typeof currentValue === "number" && currentValue === 0 && field.type === "number");

  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium flex items-center gap-1.5">
        {field.label}
        {!isEmpty && <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">✓</span>}
      </Label>
      {field.type === "select" && field.options ? (
        <Select
          value={(currentValue as string) || ""}
          onValueChange={onChange}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "number" ? (
        <Input
          type="number"
          value={(currentValue as number) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          placeholder={field.hint}
          className="h-8 text-xs"
        />
      ) : field.type === "date" ? (
        <Input
          type="date"
          value={(currentValue as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs"
        />
      ) : (
        <Input
          type={field.type === "fireflies-url" ? "url" : "text"}
          value={(currentValue as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.hint}
          className="h-8 text-xs"
        />
      )}
      {field.hint && !field.options && <p className="text-[10px] text-muted-foreground">{field.hint}</p>}
    </div>
  );
}
