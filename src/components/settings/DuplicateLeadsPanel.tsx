// Surfaces leads that are structurally suspicious to the matcher: same primary
// email exists on two non-duplicate active leads, OR two leads share a real
// email thread. Both cause attribution drift the system cannot self-correct.
// Resolution sets is_duplicate=true + duplicate_of=<canonical>; the existing
// resolveCanonical() then routes future emails correctly and we run a
// post-merge claim sweep to move historical messages.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitMerge, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface SameEmailPair {
  kind: "same_email";
  email: string;
  leads: Array<{ id: string; name: string; stage: string; created_at: string; days_since_activity: number | null }>;
}

interface SharedThreadPair {
  kind: "shared_thread";
  thread_id: string;
  msg_count: number;
  leads: Array<{ id: string; name: string; stage: string; email: string }>;
}

type Pair = SameEmailPair | SharedThreadPair;

const STAGE_RANK: Record<string, number> = {
  "Closed Won": 0,
  "Negotiating": 1, "Negotiation": 1,
  "Proposal Sent": 2,
  "Sample Sent": 3,
  "Discovery Completed": 4, "Meeting Held": 4,
  "Meeting Set": 5, "Discovery Scheduled": 5,
  "Contacted": 6, "Qualified": 7,
  "New Lead": 8, "Unassigned": 9,
  "Closed Lost": 10, "Lost": 10, "Went Dark": 10,
};

function isClosedLost(stage: string) {
  return ["Closed Lost", "Lost", "Went Dark"].includes(stage);
}

function suggestCanonical(leads: SameEmailPair["leads"]): string {
  // Prefer the most-active (lowest stage rank), tiebreak on earliest created_at.
  const sorted = [...leads].sort((a, b) => {
    const ra = STAGE_RANK[a.stage] ?? 99;
    const rb = STAGE_RANK[b.stage] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.created_at.localeCompare(b.created_at);
  });
  return sorted[0].id;
}

export function DuplicateLeadsPanel() {
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // 1. Same primary-email duplicates
    const { data: leads } = await supabase
      .from("leads")
      .select("id, name, email, stage, created_at, last_contact_date")
      .is("archived_at", null)
      .eq("is_duplicate", false);

    const byEmail = new Map<string, typeof leads>();
    for (const l of leads || []) {
      const e = (l.email || "").toLowerCase().trim();
      if (!e) continue;
      const arr = byEmail.get(e) || [];
      arr.push(l);
      byEmail.set(e, arr);
    }

    const sameEmail: SameEmailPair[] = [];
    for (const [email, group] of byEmail) {
      if (!group || group.length < 2) continue;
      sameEmail.push({
        kind: "same_email",
        email,
        leads: group.map((g) => ({
          id: g.id,
          name: g.name || g.email || g.id,
          stage: g.stage || "",
          created_at: g.created_at,
          days_since_activity: null,
        })),
      });
    }

    // 2. Shared-thread overlaps (two non-duplicate active leads sharing one thread)
    const { data: emails } = await supabase
      .from("lead_emails")
      .select("thread_id, lead_id")
      .neq("lead_id", "unmatched")
      .neq("thread_id", "")
      .limit(20000);

    const threadToLeads = new Map<string, Set<string>>();
    const threadCounts = new Map<string, number>();
    for (const e of emails || []) {
      if (!e.thread_id || !e.lead_id) continue;
      let set = threadToLeads.get(e.thread_id);
      if (!set) { set = new Set(); threadToLeads.set(e.thread_id, set); }
      set.add(e.lead_id);
      threadCounts.set(e.thread_id, (threadCounts.get(e.thread_id) || 0) + 1);
    }

    const leadById = new Map<string, { id: string; name: string; stage: string; email: string }>();
    for (const l of leads || []) {
      leadById.set(l.id, { id: l.id, name: l.name || l.email || l.id, stage: l.stage || "", email: l.email || "" });
    }

    const sharedThread: SharedThreadPair[] = [];
    for (const [threadId, leadSet] of threadToLeads) {
      if (leadSet.size < 2) continue;
      const ids = Array.from(leadSet);
      // Skip if both leads are flagged (e.g. one is a duplicate already), keep only those still active+canonical
      const meta = ids.map((id) => leadById.get(id)).filter(Boolean) as Array<{ id: string; name: string; stage: string; email: string }>;
      if (meta.length < 2) continue;
      sharedThread.push({
        kind: "shared_thread",
        thread_id: threadId,
        msg_count: threadCounts.get(threadId) || 0,
        leads: meta,
      });
    }

    // Dedupe shared-thread pairs: collapse on lead-set so we don't show
    // the same A-B pair once per shared thread.
    const seen = new Set<string>();
    const dedupedThreads: SharedThreadPair[] = [];
    let aggregateMsgCounts = new Map<string, number>();
    let aggregateThreadCounts = new Map<string, number>();
    for (const p of sharedThread) {
      const key = p.leads.map((l) => l.id).sort().join("|");
      aggregateMsgCounts.set(key, (aggregateMsgCounts.get(key) || 0) + p.msg_count);
      aggregateThreadCounts.set(key, (aggregateThreadCounts.get(key) || 0) + 1);
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedThreads.push(p);
    }
    for (const p of dedupedThreads) {
      const key = p.leads.map((l) => l.id).sort().join("|");
      p.msg_count = aggregateMsgCounts.get(key) || p.msg_count;
      (p as any).thread_count = aggregateThreadCounts.get(key) || 1;
    }
    // Drop shared-thread pairs that are already covered by a same-email pair.
    const sameEmailLeadKeys = new Set(
      sameEmail.map((p) => p.leads.map((l) => l.id).sort().join("|"))
    );
    const finalShared = dedupedThreads.filter((p) => !sameEmailLeadKeys.has(p.leads.map((l) => l.id).sort().join("|")));

    setPairs([...sameEmail, ...finalShared]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const mergeSameEmail = async (p: SameEmailPair, canonicalId: string) => {
    const others = p.leads.filter((l) => l.id !== canonicalId);
    if (others.length === 0) return;
    if (!window.confirm(
      `Mark ${others.map((o) => o.id).join(", ")} as duplicates of ${canonicalId}?\n\n` +
      `Future emails from ${p.email} will route to ${canonicalId}. ` +
      `All historical emails currently on the duplicates will be moved to ${canonicalId} after the merge.`
    )) return;

    setBusy(`pair:${p.email}`);
    try {
      // Mark the others as duplicates of canonical
      for (const o of others) {
        const { error } = await supabase
          .from("leads")
          .update({ is_duplicate: true, duplicate_of: canonicalId })
          .eq("id", o.id);
        if (error) throw error;
      }
      // Move all their historical emails to the canonical (strict primary-email
      // merges are safe — same person, no participant-overlap risk).
      for (const o of others) {
        await supabase.from("lead_emails").update({ lead_id: canonicalId }).eq("lead_id", o.id);
      }
      toast.success(`Merged ${others.length} duplicate${others.length === 1 ? "" : "s"} into ${canonicalId}`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Merge failed");
    } finally {
      setBusy(null);
    }
  };

  const dismissPair = async (p: Pair) => {
    // Local-only dismissal: for shared-thread pairs that are legit cross-firm
    // reply-alls, surface a "Not duplicates — dismiss" affordance. We persist
    // the decision into a tiny localStorage allowlist so it doesn't reappear.
    const key = p.kind === "same_email" ? `email:${p.email}` : `thread:${p.leads.map((l) => l.id).sort().join("|")}`;
    const dismissed = JSON.parse(localStorage.getItem("dup_lead_dismissed") || "[]");
    if (!dismissed.includes(key)) dismissed.push(key);
    localStorage.setItem("dup_lead_dismissed", JSON.stringify(dismissed));
    setPairs((prev) => prev.filter((x) => {
      const k = x.kind === "same_email" ? `email:${x.email}` : `thread:${x.leads.map((l) => l.id).sort().join("|")}`;
      return k !== key;
    }));
    toast.success("Dismissed — won't reappear in this list");
  };

  const visiblePairs = pairs.filter((p) => {
    const dismissed = JSON.parse(localStorage.getItem("dup_lead_dismissed") || "[]");
    const key = p.kind === "same_email" ? `email:${p.email}` : `thread:${p.leads.map((l) => l.id).sort().join("|")}`;
    return !dismissed.includes(key);
  });

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning for duplicate leads…
        </div>
      </div>
    );
  }

  if (visiblePairs.length === 0) {
    return null; // Hide entirely when there's nothing to act on.
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Likely duplicate leads to merge</span>
          <Badge variant="outline" className="h-5 text-[10px] px-1.5">{visiblePairs.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Resolving these is the only way the matcher can route future emails correctly.
        </span>
      </div>
      <ul className="divide-y divide-border">
        {visiblePairs.map((p) => (
          <li key={p.kind === "same_email" ? `e:${p.email}` : `t:${p.leads.map((l) => l.id).sort().join("|")}`} className="px-4 py-3">
            {p.kind === "same_email" ? (
              <SameEmailRow
                pair={p}
                busy={busy === `pair:${p.email}`}
                onMerge={(canon) => mergeSameEmail(p, canon)}
                onDismiss={() => dismissPair(p)}
              />
            ) : (
              <SharedThreadRow
                pair={p}
                onDismiss={() => dismissPair(p)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SameEmailRow({ pair, busy, onMerge, onDismiss }: {
  pair: SameEmailPair;
  busy: boolean;
  onMerge: (canonicalId: string) => void;
  onDismiss: () => void;
}) {
  const suggested = suggestCanonical(pair.leads);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-normal">Same email</Badge>
        <span className="font-mono text-xs text-muted-foreground">{pair.email}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pair.leads.map((l) => (
          <button
            key={l.id}
            onClick={() => window.open(`/deal/${l.id}`, "_blank", "noopener,noreferrer")}
            className="group flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:border-primary/40 hover:bg-secondary/30 transition-colors text-xs"
          >
            <span className="font-mono">{l.id}</span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate max-w-[120px]">{l.name}</span>
            <Badge
              variant={isClosedLost(l.stage) ? "outline" : "secondary"}
              className="h-4 text-[9px] px-1 ml-1"
            >
              {l.stage || "—"}
            </Badge>
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-muted-foreground">Keep as canonical:</span>
        <div className="flex items-center gap-1.5">
          {pair.leads.map((l) => (
            <Button
              key={l.id}
              size="sm"
              variant={l.id === suggested ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              disabled={busy}
              onClick={() => onMerge(l.id)}
            >
              {busy && l.id === suggested ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Keep {l.id}
              {l.id === suggested && <span className="ml-1 text-[10px] opacity-70">(suggested)</span>}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs ml-auto text-muted-foreground"
          disabled={busy}
          onClick={onDismiss}
        >
          Not duplicates
        </Button>
      </div>
    </div>
  );
}

function SharedThreadRow({ pair, onDismiss }: {
  pair: SharedThreadPair;
  onDismiss: () => void;
}) {
  const threadCount = (pair as any).thread_count as number | undefined;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-normal">Shared conversation</Badge>
        <span className="text-xs text-muted-foreground">
          {threadCount && threadCount > 1
            ? `${threadCount} threads · ${pair.msg_count} messages span both leads`
            : `${pair.msg_count} message${pair.msg_count === 1 ? "" : "s"} span both leads`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pair.leads.map((l) => (
          <button
            key={l.id}
            onClick={() => window.open(`/deal/${l.id}`, "_blank", "noopener,noreferrer")}
            className="group flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:border-primary/40 hover:bg-secondary/30 transition-colors text-xs"
          >
            <span className="font-mono">{l.id}</span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate max-w-[120px]">{l.name}</span>
            <span className="text-muted-foreground text-[10px]">&lt;{l.email.split("@")[1] || l.email}&gt;</span>
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground">
        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          Different primary emails. Open each deal-room to decide whether they're the same opportunity (merge manually)
          or a legitimate cross-firm reply-all (dismiss).
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs ml-auto text-muted-foreground -mt-0.5"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
