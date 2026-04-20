// 3-tab campaign detail: Overview · Enrolled leads · Activity log.

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Workflow, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useLeads } from "@/contexts/LeadContext";
import { supabase } from "@/integrations/supabase/client";
import { getSequence, leadEnrolledIn } from "./sequenceConfig";
import { SequenceTimeline } from "./SequenceTimeline";
import { EnrolledLeadsTable } from "./EnrolledLeadsTable";

interface Props {
  sequenceId: string;
  onBack: () => void;
}

const NURTURE_EVENTS = new Set([
  "nurture_draft_emitted",
  "nurture_re_engaged",
  "nurture_completed",
  "nurture_exited",
]);

export function CampaignDetail({ sequenceId, onBack }: Props) {
  const seq = getSequence(sequenceId);
  const { leads } = useLeads();
  const [activityRows, setActivityRows] = useState<any[]>([]);
  const [stepFilter, setStepFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const stats = useMemo(() => {
    if (!seq) return null;
    const enrolled = leads.filter((l) => leadEnrolledIn(seq, l));
    const active = enrolled.filter((l) => l.nurtureSequenceStatus === "active");
    const counts = { N0: 0, N30: 0, N45: 0, N90: 0 };
    for (const l of enrolled) {
      for (const e of l.nurtureStepLog ?? []) {
        if (e.step in counts) counts[e.step as keyof typeof counts]++;
      }
    }
    return {
      enrolled: enrolled.length,
      active: active.length,
      reEngaged: enrolled.filter((l) => l.nurtureSequenceStatus === "re_engaged").length,
      completed: enrolled.filter((l) => l.nurtureSequenceStatus === "completed").length,
      exited: enrolled.filter((l) => l.nurtureSequenceStatus === "exited_referral").length,
      counts,
    };
  }, [leads, seq]);

  useEffect(() => {
    if (!seq) return;
    const enrolledIds = leads.filter((l) => leadEnrolledIn(seq, l)).map((l) => l.id);
    if (enrolledIds.length === 0) { setActivityRows([]); return; }
    supabase
      .from("lead_activity_log")
      .select("id,lead_id,event_type,description,new_value,metadata,created_at")
      .in("lead_id", enrolledIds)
      .in("event_type", Array.from(NURTURE_EVENTS))
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setActivityRows(data ?? []));
  }, [seq, leads]);

  if (!seq) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 text-center text-muted-foreground">
        Sequence not found. <button onClick={onBack} className="underline">Back</button>
      </div>
    );
  }

  const leadById = new Map(leads.map((l) => [l.id, l]));
  const filteredActivity = activityRows.filter((r) => {
    if (stepFilter === "all") return true;
    const meta = r.metadata as any;
    return meta?.step === stepFilter || r.new_value === stepFilter;
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> All sequences
      </button>

      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-md bg-foreground text-background flex items-center justify-center">
          <Workflow className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">{seq.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{seq.oneLiner}</p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Sparkles className="h-3 w-3" /> AI personalized
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="enrolled">Enrolled · {stats?.enrolled ?? 0}</TabsTrigger>
          <TabsTrigger value="activity">Activity log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-5">
          <div className="border border-border rounded-lg p-4 bg-secondary/20">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Trigger</div>
            <div className="text-sm font-medium text-foreground">{seq.trigger}</div>
          </div>

          {stats && (
            <div className="grid grid-cols-5 gap-3">
              <SummaryStat label="Enrolled" value={stats.enrolled} onClick={() => setStatusFilter("")} />
              <SummaryStat label="Active" value={stats.active} onClick={() => setStatusFilter("active")} />
              <SummaryStat label="Re-engaged" value={stats.reEngaged} onClick={() => setStatusFilter("re_engaged")} />
              <SummaryStat label="Completed" value={stats.completed} onClick={() => setStatusFilter("completed")} />
              <SummaryStat label="Exited" value={stats.exited} onClick={() => setStatusFilter("exited_referral")} />
            </div>
          )}

          {stats && (
            <div className="border border-border rounded-lg p-4 bg-background">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Funnel</div>
              <div className="flex items-end gap-3">
                {[
                  { label: "Enrolled", value: stats.enrolled },
                  { label: "D0", value: stats.counts.N0 },
                  { label: "D30", value: stats.counts.N30 },
                  { label: "D45", value: stats.counts.N45 },
                  { label: "D90", value: stats.counts.N90 },
                  { label: "Re-engaged", value: stats.reEngaged },
                ].map((s, i, arr) => {
                  const max = arr[0].value || 1;
                  const pct = Math.round((s.value / max) * 100);
                  return (
                    <div key={s.label} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="text-xs font-mono tabular-nums text-foreground">{s.value}</div>
                      <div className="w-full h-20 bg-secondary rounded-sm flex items-end overflow-hidden">
                        <div
                          className="w-full bg-foreground transition-all"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Steps</div>
            <SequenceTimeline seq={seq} />
          </div>
        </TabsContent>

        <TabsContent value="enrolled" className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            {(["", "active", "re_engaged", "completed", "exited_referral"] as const).map((s) => (
              <button
                key={s || "all"}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  statusFilter === s
                    ? "bg-foreground text-background border-foreground"
                    : "bg-secondary/50 text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {s === "" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
          <EnrolledLeadsTable seq={seq} statusFilter={statusFilter || undefined} />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            {["all", "N0", "N30", "N45", "N90"].map((s) => (
              <button
                key={s}
                onClick={() => setStepFilter(s)}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  stepFilter === s
                    ? "bg-foreground text-background border-foreground"
                    : "bg-secondary/50 text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {filteredActivity.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">No activity yet.</div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-background divide-y divide-border">
              {filteredActivity.map((row) => {
                const lead = leadById.get(row.lead_id);
                return (
                  <div key={row.id} className="px-4 py-3 hover:bg-secondary/20 transition-colors">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">
                          <span className="font-medium">{lead?.name || row.lead_id}</span>
                          <span className="text-muted-foreground ml-2">{lead?.company || ""}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{row.description}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {row.new_value && (
                          <Badge variant="secondary" className="text-[10px] font-mono">{row.new_value}</Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {new Date(row.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryStat({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border border-border rounded-lg px-4 py-3 bg-background text-left hover:border-foreground/40 transition-colors"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold text-foreground tabular-nums mt-0.5">{value}</div>
    </button>
  );
}
