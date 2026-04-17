import { useEffect, useState } from "react";
import { Lead, Stakeholder, StakeholderSentiment } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Users, Plus, Trash2, Linkedin, Mail as MailIcon, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

const SENTIMENTS: { value: StakeholderSentiment; label: string; tone: string }[] = [
  { value: "champion", label: "Champion", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  { value: "supporter", label: "Supporter", tone: "bg-secondary text-foreground/80" },
  { value: "neutral", label: "Neutral", tone: "bg-secondary text-muted-foreground" },
  { value: "skeptic", label: "Skeptic", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "blocker", label: "Blocker", tone: "bg-red-500/10 text-red-700 dark:text-red-400" },
];

function sentimentTone(s: StakeholderSentiment) {
  return SENTIMENTS.find(x => x.value === s)?.tone || "bg-secondary text-muted-foreground";
}

function relativeDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface Props { lead: Lead; }

export function StakeholderCard({ lead }: Props) {
  const [items, setItems] = useState<Stakeholder[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", role: "", email: "", linkedin_url: "", sentiment: "neutral" as StakeholderSentiment, notes: "" });
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("lead_stakeholders").select("*").eq("lead_id", lead.id).order("created_at", { ascending: true });
    setItems((data || []) as Stakeholder[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [lead.id]);

  const reset = () => { setDraft({ name: "", role: "", email: "", linkedin_url: "", sentiment: "neutral", notes: "" }); setAdding(false); setEditingId(null); };

  const save = async () => {
    if (!draft.name.trim()) { toast.error("Name is required"); return; }
    if (editingId) {
      const { error } = await (supabase as any).from("lead_stakeholders").update({ ...draft, updated_at: new Date().toISOString() }).eq("id", editingId);
      if (error) { toast.error("Failed to save"); return; }
      await logActivity(lead.id, "field_update", `Updated stakeholder ${draft.name}`);
    } else {
      const { error } = await (supabase as any).from("lead_stakeholders").insert({ lead_id: lead.id, ...draft });
      if (error) { toast.error("Failed to add stakeholder"); return; }
      await logActivity(lead.id, "field_update", `Added stakeholder ${draft.name}${draft.role ? ` (${draft.role})` : ""}`);
    }
    reset();
    load();
    toast.success(editingId ? "Stakeholder updated" : "Stakeholder added");
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const { id, name } = removeTarget;
    await (supabase as any).from("lead_stakeholders").delete().eq("id", id);
    await logActivity(lead.id, "field_update", `Removed stakeholder ${name}`);
    setRemoveTarget(null);
    toast.success(`Removed ${name}`);
    load();
  };

  const beginEdit = (s: Stakeholder) => {
    setDraft({ name: s.name, role: s.role, email: s.email, linkedin_url: s.linkedin_url, sentiment: s.sentiment, notes: s.notes });
    setEditingId(s.id);
    setAdding(true);
  };

  const champions = items.filter(i => i.sentiment === "champion").length;
  const blockers = items.filter(i => i.sentiment === "blocker").length;

  return (
    <CollapsibleCard
      title="Stakeholders"
      icon={<Users className="h-3.5 w-3.5" />}
      count={items.length}
      defaultOpen
      rightSlot={
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAdding(v => !v); setEditingId(null); }}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          title="Add stakeholder"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="space-y-2">
        {(champions > 0 || blockers > 0) && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {champions > 0 && <span className={cn("px-1.5 py-0.5 rounded", sentimentTone("champion"))}>{champions} champion{champions !== 1 ? "s" : ""}</span>}
            {blockers > 0 && <span className={cn("px-1.5 py-0.5 rounded", sentimentTone("blocker"))}>{blockers} blocker{blockers !== 1 ? "s" : ""}</span>}
          </div>
        )}

        {loading && items.length === 0 && <p className="text-[11px] text-muted-foreground/60">Loading…</p>}

        {!loading && items.length === 0 && !adding && (
          <button onClick={() => setAdding(true)} className="w-full text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-3 py-3 transition-colors">
            + Add first stakeholder
          </button>
        )}

        {items.map(s => (
          <div key={s.id} className="border border-border/60 rounded-md p-2 hover:border-border transition-colors group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium truncate">{s.name}</span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium", sentimentTone(s.sentiment))}>
                    {s.sentiment}
                  </span>
                </div>
                {s.role && <p className="text-[10px] text-muted-foreground truncate">{s.role}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {s.email && (
                    <a href={`mailto:${s.email}`} title={s.email} className="text-muted-foreground hover:text-foreground">
                      <MailIcon className="h-3 w-3" />
                    </a>
                  )}
                  {s.linkedin_url && (
                    <a href={s.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn" className="text-muted-foreground hover:text-foreground">
                      <Linkedin className="h-3 w-3" />
                    </a>
                  )}
                  {s.last_contacted && <span className="text-[9px] text-muted-foreground tabular-nums">contacted {relativeDate(s.last_contacted)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => beginEdit(s)} className="p-1 text-muted-foreground hover:text-foreground" title="Edit">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => setRemoveTarget({ id: s.id, name: s.name })} className="p-1 text-muted-foreground hover:text-destructive" title="Remove">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {adding && (
          <div className="border border-border rounded-md p-2 space-y-1.5 bg-secondary/30">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name *" className="h-7 text-xs" autoFocus />
            <Input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Role (Founder, CFO, Advisor…)" className="h-7 text-xs" />
            <div className="grid grid-cols-2 gap-1.5">
              <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Email" className="h-7 text-xs" />
              <Input value={draft.linkedin_url} onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })} placeholder="LinkedIn URL" className="h-7 text-xs" />
            </div>
            <Select value={draft.sentiment} onValueChange={(v) => setDraft({ ...draft, sentiment: v as StakeholderSentiment })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SENTIMENTS.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-end gap-1 pt-0.5">
              <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={reset}>
                <X className="h-3 w-3" /> Cancel
              </Button>
              <Button size="sm" className="h-6 text-[11px] gap-1" onClick={save}>
                <Check className="h-3 w-3" /> {editingId ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!removeTarget} onOpenChange={o => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This stakeholder will be removed from the deal. The action will be recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CollapsibleCard>
  );
}
