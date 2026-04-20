// Tab 4 — Revisit/Reconnect 264-deal triage. Three buckets:
//  A) Last contact <12mo + value >$1.5K → In Contact + re-engage task
//  B) Has Fireflies + any engagement → Closed Lost + nurture (90d re-engage)
//  C) >2yo, no Fireflies → Closed Lost, no nurture
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Row {
  id: string;
  name: string;
  company: string;
  deal_value: number;
  last_contact_date: string;
  fireflies_url: string;
  meetings: any;
}

type Bucket = "A" | "B" | "C";

const ONE_YEAR = 365 * 86400 * 1000;
const TWO_YEARS = 2 * ONE_YEAR;

function classify(row: Row): Bucket {
  const lastContact = row.last_contact_date ? new Date(row.last_contact_date).getTime() : 0;
  const ageMs = lastContact ? Date.now() - lastContact : Infinity;
  const hasFireflies = !!row.fireflies_url || (Array.isArray(row.meetings) && row.meetings.length > 0);

  // A: warm + valuable → revive
  if (ageMs < ONE_YEAR && row.deal_value >= 1500) return "A";
  // B: has any engagement signal → nurture
  if (hasFireflies) return "B";
  // C: stale, no engagement → archive
  if (ageMs > TWO_YEARS || !lastContact) return "C";
  // Default fallback — nurture (safer than archive)
  return "B";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  A: "Revive → In Contact",
  B: "Nurture → Closed Lost (90d re-engage)",
  C: "Archive → Closed Lost (no nurture)",
};

export function RRTriageTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterBucket, setFilterBucket] = useState<Bucket | "ALL">("ALL");
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("id,name,company,deal_value,last_contact_date,fireflies_url,meetings")
      .eq("stage", "Revisit/Reconnect")
      .is("archived_at", null)
      .order("last_contact_date", { ascending: false, nullsFirst: false });
    setRows((data as Row[]) || []);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const enriched = useMemo(
    () => rows.map(r => ({ ...r, bucket: classify(r) })),
    [rows]
  );

  const visible = useMemo(
    () => filterBucket === "ALL" ? enriched : enriched.filter(r => r.bucket === filterBucket),
    [enriched, filterBucket]
  );

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { A: 0, B: 0, C: 0 };
    enriched.forEach(r => { c[r.bucket]++; });
    return c;
  }, [enriched]);

  const toggleAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(r => r.id)));
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBatch = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    try {
      const selectedRows = enriched.filter(r => selected.has(r.id));
      const today = new Date().toISOString().slice(0, 10);
      const reEngageDate = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

      const groupA = selectedRows.filter(r => r.bucket === "A");
      const groupB = selectedRows.filter(r => r.bucket === "B");
      const groupC = selectedRows.filter(r => r.bucket === "C");

      // Bucket A — revive
      if (groupA.length > 0) {
        const ids = groupA.map(r => r.id);
        await supabase.from("leads").update({
          stage: "In Contact",
          stage_entered_date: today,
        } as any).in("id", ids);
        await supabase.from("lead_tasks").insert(
          groupA.map(r => ({
            lead_id: r.id,
            playbook: "rr-revive",
            sequence_order: 1,
            task_type: "email",
            title: "Re-engage from R/R triage",
            description: "Warm prospect surfaced from R/R triage. Lead with a fresh angle and a specific ask.",
            due_date: today,
          })) as any
        );
      }

      // Bucket B — nurture
      if (groupB.length > 0) {
        const ids = groupB.map(r => r.id);
        await supabase.from("leads").update({
          stage: "Closed Lost",
          lost_reason_v2: "Went Dark / No response",
          closed_date: today,
          nurture_sequence_status: "active",
          nurture_started_at: new Date().toISOString(),
          nurture_re_engage_date: reEngageDate,
        } as any).in("id", ids);
      }

      // Bucket C — archive (closed lost, no nurture)
      if (groupC.length > 0) {
        const ids = groupC.map(r => r.id);
        await supabase.from("leads").update({
          stage: "Closed Lost",
          lost_reason_v2: "No fit / Not qualified",
          closed_date: today,
        } as any).in("id", ids);
      }

      // Audit logs
      const logs = selectedRows.map(r => ({
        lead_id: r.id,
        event_type: "stage_migration_v2",
        description: `R/R triage bucket ${r.bucket}: ${BUCKET_LABEL[r.bucket]}`,
        old_value: "Revisit/Reconnect",
        new_value: r.bucket === "A" ? "In Contact" : "Closed Lost",
      }));
      await supabase.from("lead_activity_log").insert(logs as any);

      toast.success(`Triaged ${selectedRows.length} deals (A:${groupA.length} B:${groupB.length} C:${groupC.length})`);
      await load();
      onChange();
    } catch (e: any) {
      toast.error(`Triage failed: ${e.message ?? e}`);
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-12 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-12 text-center">
        <CheckCircle2 className="h-8 w-8 text-foreground mx-auto mb-2" />
        <h2 className="text-base font-medium">R/R graveyard cleared</h2>
        <p className="text-sm text-muted-foreground mt-1">
          The Revisit/Reconnect stage is empty. The 90-day nurture sequence will manage closed-lost re-engagement going forward.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium">R/R triage — {rows.length} deals</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-bucketed by recency, value, and engagement. Override any row's checkbox before applying.
          </p>
        </div>
        <Button
          size="sm"
          disabled={selected.size === 0 || running}
          onClick={applyBatch}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Apply to ${selected.size} selected`}
        </Button>
      </div>

      <div className="flex gap-2 mb-4 text-xs">
        {(["ALL", "A", "B", "C"] as const).map(b => (
          <button
            key={b}
            onClick={() => setFilterBucket(b)}
            className={`px-3 py-1.5 rounded-md border transition-colors ${
              filterBucket === b
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {b === "ALL" ? `All (${rows.length})` : `${b} — ${BUCKET_LABEL[b]} (${counts[b]})`}
          </button>
        ))}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-secondary text-xs font-medium border-b border-border">
          <div className="col-span-1">
            <Checkbox
              checked={selected.size === visible.length && visible.length > 0}
              onCheckedChange={toggleAll}
            />
          </div>
          <div className="col-span-3">Lead</div>
          <div className="col-span-2 text-right">Value</div>
          <div className="col-span-2">Last contact</div>
          <div className="col-span-1">Signals</div>
          <div className="col-span-3">Bucket</div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {visible.map(r => {
            const isSelected = selected.has(r.id);
            return (
              <div
                key={r.id}
                className={`grid grid-cols-12 gap-3 px-3 py-2 text-xs items-center border-b border-border last:border-b-0 ${isSelected ? "bg-secondary/40" : ""}`}
              >
                <div className="col-span-1">
                  <Checkbox checked={isSelected} onCheckedChange={() => toggle(r.id)} />
                </div>
                <div className="col-span-3 truncate">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-muted-foreground truncate">{r.company || "—"}</div>
                </div>
                <div className="col-span-2 text-right tabular-nums">
                  ${r.deal_value.toLocaleString()}
                </div>
                <div className="col-span-2 text-muted-foreground">
                  {r.last_contact_date || "—"}
                </div>
                <div className="col-span-1 text-muted-foreground">
                  {r.fireflies_url || (Array.isArray(r.meetings) && r.meetings.length > 0) ? "FF" : "—"}
                </div>
                <div className="col-span-3 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-secondary font-mono">{r.bucket}</span>
                  <span className="text-muted-foreground ml-2">{BUCKET_LABEL[r.bucket]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
