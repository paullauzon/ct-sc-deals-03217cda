// Tab 3 — Discovery Completed worklist (44 deals).
// For each: Sample sent already? YES → move to Sample Sent + outcome.
// NO → create "Send sample" task and keep in Discovery Completed.
// COLD → close lost with stall reason.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Row {
  id: string;
  name: string;
  company: string;
  deal_value: number;
  last_contact_date: string;
  fireflies_url: string;
}

type Decision = "" | "sample-sent" | "needs-sample" | "cold";

export function DiscoveryWorklistTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("id,name,company,deal_value,last_contact_date,fireflies_url")
      .eq("stage", "Meeting Held")
      .is("archived_at", null)
      .order("deal_value", { ascending: false });
    setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const apply = async (row: Row) => {
    const decision = decisions[row.id];
    if (!decision) return;
    setRunning(row.id);
    try {
      let patch: Record<string, any> = {};
      let logDesc = "";

      if (decision === "sample-sent") {
        const outcome = outcomes[row.id] || "No response";
        patch = {
          stage: "Sample Sent",
          sample_sent_date: new Date().toISOString().slice(0, 10),
          sample_outcome: outcome,
        };
        logDesc = `Discovery triage: moved to Sample Sent (outcome: ${outcome})`;
      } else if (decision === "needs-sample") {
        patch = { stage: "Discovery Completed" };
        logDesc = "Discovery triage: kept in Discovery Completed, sample task created";
      } else {
        patch = {
          stage: "Closed Lost",
          lost_reason_v2: "Went Dark / No response",
          stall_reason: "Cold after Discovery — no sample sent",
        };
        logDesc = "Discovery triage: closed lost (cold)";
      }

      // @ts-ignore — dynamic patch
      const { error } = await supabase.from("leads").update(patch).eq("id", row.id);
      if (error) throw error;

      await supabase.from("lead_activity_log").insert({
        lead_id: row.id,
        event_type: "stage_migration_v2",
        description: logDesc,
        old_value: "Meeting Held",
        new_value: patch.stage,
      } as any);

      if (decision === "needs-sample") {
        await supabase.from("lead_tasks").insert({
          lead_id: row.id,
          playbook: "discovery-triage",
          sequence_order: 1,
          task_type: "email",
          title: "Send sample / proof asset",
          description: "Triaged from Meeting Held — sample is the next logical move.",
          due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        } as any);
      }

      toast.success(`Resolved ${row.name}`);
      setRows(prev => prev.filter(r => r.id !== row.id));
      onChange();
    } catch (e: any) {
      toast.error(`Failed: ${e.message ?? e}`);
    } finally {
      setRunning(null);
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
        <h2 className="text-base font-medium">Discovery worklist clear</h2>
        <p className="text-sm text-muted-foreground mt-1">
          All Meeting Held deals have been triaged.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium mb-1">Discovery Completed worklist</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {rows.length} deal{rows.length === 1 ? "" : "s"} sorted by deal value. Triage each into Sample Sent, keep in Discovery, or close lost.
      </p>

      <div className="space-y-2">
        {rows.map(row => {
          const decision = decisions[row.id] || "";
          const isRunning = running === row.id;
          return (
            <div key={row.id} className="grid grid-cols-12 gap-3 items-center p-3 border border-border rounded-lg text-sm">
              <div className="col-span-3 truncate">
                <div className="font-medium truncate">{row.name}</div>
                <div className="text-xs text-muted-foreground truncate">{row.company || "—"}</div>
              </div>
              <div className="col-span-2 text-muted-foreground tabular-nums text-right">
                ${row.deal_value.toLocaleString()}
              </div>
              <div className="col-span-2 text-xs text-muted-foreground">
                {row.fireflies_url ? "Has transcript" : "No transcript"}
              </div>
              <div className="col-span-3">
                <Select value={decision} onValueChange={(v) => setDecisions(prev => ({ ...prev, [row.id]: v as Decision }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Triage decision…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sample-sent">Sample sent already</SelectItem>
                    <SelectItem value="needs-sample">Needs sample (keep in Discovery)</SelectItem>
                    <SelectItem value="cold">Cold — close lost</SelectItem>
                  </SelectContent>
                </Select>
                {decision === "sample-sent" && (
                  <Select value={outcomes[row.id] || ""} onValueChange={(v) => setOutcomes(prev => ({ ...prev, [row.id]: v }))}>
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue placeholder="Sample outcome…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Lukewarm">Lukewarm</SelectItem>
                      <SelectItem value="Needs revision">Needs revision</SelectItem>
                      <SelectItem value="No response">No response</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  size="sm"
                  disabled={!decision || isRunning || (decision === "sample-sent" && !outcomes[row.id])}
                  onClick={() => apply(row)}
                  className="w-24"
                >
                  {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
