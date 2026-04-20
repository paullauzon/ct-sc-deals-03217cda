// Top-level Sequences index. Lists all configured sequences as cards.

import { useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { SEQUENCES, leadEnrolledIn, SequenceDef } from "./sequenceConfig";
import { Workflow, Users, Clock, ArrowRight } from "lucide-react";

interface Props {
  onOpen: (sequenceId: string) => void;
}

function SequenceCard({ seq, onOpen }: { seq: SequenceDef; onOpen: (id: string) => void }) {
  const { leads } = useLeads();
  const stats = useMemo(() => {
    const enrolled = leads.filter((l) => leadEnrolledIn(seq, l));
    return {
      total: enrolled.length,
      active: enrolled.filter((l) => l.nurtureSequenceStatus === "active").length,
      reEngaged: enrolled.filter((l) => l.nurtureSequenceStatus === "re_engaged").length,
      completed: enrolled.filter((l) => l.nurtureSequenceStatus === "completed").length,
      exited: enrolled.filter((l) => l.nurtureSequenceStatus === "exited_referral").length,
    };
  }, [leads, seq]);

  const replyRate = stats.total > 0 ? Math.round((stats.reEngaged / stats.total) * 100) : 0;

  return (
    <button
      onClick={() => onOpen(seq.id)}
      className="text-left w-full border border-border rounded-lg bg-background hover:border-foreground/40 hover:shadow-sm transition-all overflow-hidden group"
    >
      <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-foreground text-background flex items-center justify-center shrink-0">
          <Workflow className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-foreground truncate">{seq.name}</h3>
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${seq.status === "live" ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>
              {seq.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{seq.oneLiner}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
      </div>
      <div className="px-5 py-3 grid grid-cols-5 gap-3">
        <Stat label="Enrolled" value={stats.total} icon={Users} />
        <Stat label="Active" value={stats.active} />
        <Stat label="Re-engaged" value={stats.reEngaged} />
        <Stat label="Completed" value={stats.completed} />
        <Stat label="Exited" value={stats.exited} />
      </div>
      <div className="px-5 py-2.5 border-t border-border bg-secondary/20 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          Reply rate {replyRate}%
        </span>
        <span className="font-mono">{seq.steps.length} steps</span>
      </div>
    </button>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon?: typeof Users }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {label}
      </div>
      <div className="text-lg font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

export function SequencesIndex({ onOpen }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-foreground">Sequences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor every email sequence in one place. Drafts land in Action Center for review before sending.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SEQUENCES.map((seq) => (
          <SequenceCard key={seq.id} seq={seq} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
