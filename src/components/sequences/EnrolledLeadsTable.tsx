// Sortable table of leads enrolled in a sequence. Status filter + click-to-open.

import { useState } from "react";
import { Lead } from "@/types/lead";
import { Badge } from "@/components/ui/badge";
import { useLeads } from "@/contexts/LeadContext";
import { LeadDetail } from "@/components/LeadsTable";
import { dayInSequence, nextStepFor, SequenceDef, leadEnrolledIn } from "./sequenceConfig";
import { ArrowUpDown } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  re_engaged: "Re-engaged",
  completed: "Completed",
  exited_referral: "Exited (referral)",
  paused: "Paused",
  archived: "Paused",
};

type SortKey = "name" | "lostReason" | "day" | "status";

export function EnrolledLeadsTable({ seq, statusFilter }: { seq: SequenceDef; statusFilter?: string }) {
  const { leads } = useLeads();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("day");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const enrolled = leads.filter((l) => leadEnrolledIn(seq, l));
  const filtered = statusFilter
    ? enrolled.filter((l) => {
        const s = l.nurtureSequenceStatus ?? "";
        if (statusFilter === "paused") return s === "paused" || s === "archived";
        return s === statusFilter;
      })
    : enrolled;

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") return (a.name || "").localeCompare(b.name || "") * dir;
    if (sortKey === "lostReason") return (a.lostReasonV2 || "").localeCompare(b.lostReasonV2 || "") * dir;
    if (sortKey === "status") return (a.nurtureSequenceStatus || "").localeCompare(b.nurtureSequenceStatus || "") * dir;
    const da = dayInSequence(a) ?? -1;
    const db = dayInSequence(b) ?? -1;
    return (da - db) * dir;
  });

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  function renderHeader(k: SortKey, label: string) {
    return (
      <button
        onClick={() => toggleSort(k)}
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    );
  }

  if (sorted.length === 0) {
    return <div className="text-sm text-muted-foreground py-12 text-center">No enrolled leads.</div>;
  }

  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              <th className="text-left px-4 py-2.5">{renderHeader("name", "Lead")}</th>
              <th className="text-left px-4 py-2.5">{renderHeader("lostReason", "Lost reason")}</th>
              <th className="text-left px-4 py-2.5">{renderHeader("day", "Day")}</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">Last touch</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">Next</th>
              <th className="text-left px-4 py-2.5">{renderHeader("status", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => {
              const day = dayInSequence(l);
              const next = nextStepFor(l);
              const log = l.nurtureStepLog ?? [];
              const last = log[log.length - 1];
              const status = l.nurtureSequenceStatus ?? "";
              return (
                <tr
                  key={l.id}
                  onClick={() => setOpenId(l.id)}
                  className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-foreground truncate max-w-[180px]">{l.name || "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">{l.company || ""}</div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{l.lostReasonV2 || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{day != null ? `D${day}` : "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {last ? `${last.step} · ${new Date(last.sent_at).toLocaleDateString()}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {next ? <span className="font-mono">{next.key}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[status] || status || "—"}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <LeadDetail leadId={openId} open={!!openId} onClose={() => setOpenId(null)} />
    </>
  );
}
