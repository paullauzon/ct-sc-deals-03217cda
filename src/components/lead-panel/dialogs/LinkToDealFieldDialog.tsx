import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Link2 } from "lucide-react";
import { Lead } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLog";

/** Linkable fields: lead-key, db column, label, value type. */
const LINKABLE_FIELDS = [
  { key: "nextMutualStep", column: "next_mutual_step", label: "Next mutual step", kind: "text" },
  { key: "nextMutualStepDate", column: "next_mutual_step_date", label: "Next mutual step date", kind: "date" },
  { key: "forecastedCloseDate", column: "forecasted_close_date", label: "Forecasted close date", kind: "date" },
  { key: "dealNarrative", column: "deal_narrative", label: "Deal narrative", kind: "textarea" },
  { key: "competingBankers", column: "competing_bankers", label: "Competing bankers / advisors", kind: "text" },
  { key: "lostReasonV2", column: "lost_reason_v2", label: "Lost reason", kind: "text" },
  { key: "stallReason", column: "stall_reason", label: "Stall reason", kind: "text" },
  { key: "decisionBlocker", column: "decision_blocker", label: "Decision blocker", kind: "text" },
] as const;

type FieldKey = typeof LINKABLE_FIELDS[number]["key"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  emailId: string;
  threadId: string;
  /** Quote captured (highlighted text or whole-message excerpt). */
  initialQuote: string;
  /** Surrounding excerpt for context in audit. */
  sourceExcerpt?: string;
  onLinked?: (fieldKey: FieldKey, newValue: string) => void;
}

function suggestValue(quote: string, kind: "text" | "date" | "textarea"): string {
  const q = (quote || "").trim();
  if (!q) return "";
  if (kind === "date") {
    // Look for "in N weeks/days/months" → ISO date estimate
    const inMatch = q.match(/in\s+(\d+)\s*(day|week|month)s?/i);
    if (inMatch) {
      const n = parseInt(inMatch[1], 10);
      const unit = inMatch[2].toLowerCase();
      const d = new Date();
      if (unit === "day") d.setDate(d.getDate() + n);
      else if (unit === "week") d.setDate(d.getDate() + n * 7);
      else d.setMonth(d.getMonth() + n);
      return d.toISOString().slice(0, 10);
    }
    // Look for explicit ISO or month-day patterns
    const iso = q.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (iso) return iso[0];
    const md = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
    if (md) {
      const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const m = months[md[1].slice(0, 3).toLowerCase()];
      const day = parseInt(md[2], 10);
      const d = new Date();
      d.setMonth(m, day);
      if (d < new Date()) d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    }
    return "";
  }
  // Trim long quotes for single-line text targets
  if (kind === "text") return q.length > 140 ? q.slice(0, 140) : q;
  return q;
}

export function LinkToDealFieldDialog({
  open,
  onOpenChange,
  lead,
  emailId,
  threadId,
  initialQuote,
  sourceExcerpt = "",
  onLinked,
}: Props) {
  const [fieldKey, setFieldKey] = useState<FieldKey>("nextMutualStep");
  const [quote, setQuote] = useState(initialQuote);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fieldDef = useMemo(() => LINKABLE_FIELDS.find(f => f.key === fieldKey)!, [fieldKey]);
  const previousValue = String((lead as any)[fieldKey] ?? "");

  useEffect(() => {
    setQuote(initialQuote);
  }, [initialQuote]);

  useEffect(() => {
    setValue(suggestValue(quote, fieldDef.kind));
  }, [quote, fieldDef.kind]);

  const handleSave = async () => {
    if (!value.trim()) {
      toast.error("Please enter a value to apply");
      return;
    }
    setSaving(true);
    try {
      // 1) Update the lead column
      const { error: updErr } = await supabase
        .from("leads")
        .update({ [fieldDef.column]: value } as any)
        .eq("id", lead.id);
      if (updErr) throw updErr;

      // 2) Insert the audit row
      const { error: insErr } = await supabase
        .from("email_field_links")
        .insert({
          lead_id: lead.id,
          email_id: emailId,
          thread_id: threadId,
          field_key: fieldDef.key,
          field_label: fieldDef.label,
          previous_value: previousValue,
          new_value: value,
          quote: quote.slice(0, 1000),
          source_excerpt: sourceExcerpt.slice(0, 2000),
        } as any);
      if (insErr) console.warn("audit insert failed:", insErr.message);

      // 3) Activity log entry
      await logActivity({
        leadId: lead.id,
        eventType: "field_update",
        description: `Linked email quote → ${fieldDef.label}`,
        oldValue: previousValue,
        newValue: value,
        metadata: { source: "email_field_link", emailId, threadId, quote: quote.slice(0, 280) },
      });

      toast.success(`${fieldDef.label} updated from email`);
      onLinked?.(fieldKey, value);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to link field");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> Link email quote to a deal field
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div>
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Quote from email</Label>
            <Textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={3}
              className="text-xs mt-1"
              placeholder="Paste or edit the relevant snippet"
            />
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Field to update</Label>
            <Select value={fieldKey} onValueChange={(v) => setFieldKey(v as FieldKey)}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINKABLE_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key} className="text-xs">
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {previousValue && (
              <div className="mt-1.5 text-[10px] text-muted-foreground">
                Current: <span className="text-foreground">{previousValue}</span>
              </div>
            )}
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
              New value
              {value && value !== quote && (
                <Badge variant="secondary" className="text-[9px] gap-0.5 font-normal normal-case tracking-normal">
                  <Sparkles className="h-2.5 w-2.5" />Suggested from quote
                </Badge>
              )}
            </Label>
            {fieldDef.kind === "textarea" ? (
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={3}
                className="text-xs mt-1"
              />
            ) : fieldDef.kind === "date" ? (
              <Input
                type="date"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !value.trim()} className="h-8 text-xs gap-1.5">
            <Link2 className="h-3 w-3" /> {saving ? "Linking…" : "Link & update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
