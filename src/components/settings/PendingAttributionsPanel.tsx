// Surfaces system-generated attribution suggestions. The auto-suggest cron
// scans unmatched emails from senders at known firm domains and proposes a
// likely lead based on thread continuity. Reps accept or reject one click,
// or use bulk actions to clear an entire sender or domain at once (Round 6).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, Loader2, Check, X, RefreshCw, Layers, Ban } from "lucide-react";
import { toast } from "sonner";

interface Suggestion {
  id: string;
  sender_email: string;
  sender_domain: string;
  suggested_lead_id: string;
  reason: string;
  email_count: number;
  sample_email_id: string | null;
  created_at: string;
  // Joined client-side
  lead_name?: string;
  lead_stage?: string;
}

export function PendingAttributionsPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("pending_attribution_suggestions")
      .select("id, sender_email, sender_domain, suggested_lead_id, reason, email_count, sample_email_id, created_at")
      .eq("status", "pending")
      .order("email_count", { ascending: false })
      .limit(100);

    const list = (rows || []) as Suggestion[];
    const leadIds = Array.from(new Set(list.map((s) => s.suggested_lead_id)));
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, email, stage")
        .in("id", leadIds);
      const byId = new Map<string, { name: string; stage: string }>();
      for (const l of (leads || []) as any[]) {
        byId.set(l.id, { name: l.name || l.email || l.id, stage: l.stage || "" });
      }
      for (const s of list) {
        const m = byId.get(s.suggested_lead_id);
        if (m) {
          s.lead_name = m.name;
          s.lead_stage = m.stage;
        }
      }
    }
    setItems(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Group suggestions by sender for bulk-action UI hints.
  const senderGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of items) map.set(s.sender_email, (map.get(s.sender_email) || 0) + 1);
    return map;
  }, [items]);

  const claimEmailsForSuggestion = async (s: Suggestion) => {
    const { data: emails } = await supabase
      .from("lead_emails")
      .select("id")
      .eq("lead_id", "unmatched")
      .eq("from_address", s.sender_email)
      .limit(500);

    let claimed = 0;
    for (const e of (emails || []) as Array<{ id: string }>) {
      const { data, error } = await supabase.functions.invoke("safe-claim-email", {
        body: { email_id: e.id, lead_id: s.suggested_lead_id, promote_sender_to_stakeholder: true },
      });
      if (!error && data?.ok) claimed += 1;
    }
    return claimed;
  };

  const accept = async (s: Suggestion) => {
    setBusy(s.id);
    try {
      // Round 9 — noise-domain conflict prompt. If the sender's domain is on
      // the noise list, accepting effectively endorses this sender as real
      // mail. Confirm and remove the noise rule so future syncs don't keep
      // routing them away.
      if (s.reason !== "intermediary_candidate" && s.sender_domain) {
        const { data: noiseHit } = await supabase
          .from("email_noise_domains")
          .select("domain")
          .eq("domain", s.sender_domain)
          .maybeSingle();
        if (noiseHit) {
          const ok = window.confirm(
            `@${s.sender_domain} is currently on the noise list. Accepting will REMOVE this domain from noise so future emails route normally. Continue?`
          );
          if (!ok) {
            setBusy(null);
            return;
          }
          await supabase.from("email_noise_domains").delete().eq("domain", s.sender_domain);
          toast.message(`Removed @${s.sender_domain} from noise list`);
        }
      }
      // Round 7 — intermediary candidates flag the sender on every existing
      // stakeholder row instead of routing emails.
      if (s.reason === "intermediary_candidate") {
        const { data: stakeRows } = await supabase
          .from("lead_stakeholders")
          .select("id")
          .eq("email", s.sender_email);
        const ids = (stakeRows || []).map((r: any) => r.id);
        if (ids.length > 0) {
          await supabase
            .from("lead_stakeholders")
            .update({ is_intermediary: true, updated_at: new Date().toISOString() })
            .in("id", ids);
        }
        await supabase
          .from("pending_attribution_suggestions")
          .update({ status: "accepted", resolved_at: new Date().toISOString() })
          .eq("id", s.id);
        toast.success(`${s.sender_email} marked as intermediary on ${ids.length} deal${ids.length === 1 ? "" : "s"}`);
        setItems((prev) => prev.filter((x) => x.id !== s.id));
        return;
      }
      const claimed = await claimEmailsForSuggestion(s);
      await supabase
        .from("pending_attribution_suggestions")
        .update({ status: "accepted", resolved_at: new Date().toISOString() })
        .eq("id", s.id);
      toast.success(`Accepted — routed ${claimed} email${claimed === 1 ? "" : "s"} to ${s.lead_name || s.suggested_lead_id}`);
      setItems((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e: any) {
      toast.error(e.message || "Accept failed");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (s: Suggestion) => {
    setBusy(s.id);
    try {
      await supabase
        .from("pending_attribution_suggestions")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", s.id);
      setItems((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e: any) {
      toast.error(e.message || "Reject failed");
    } finally {
      setBusy(null);
    }
  };

  // Round 6 — bulk: accept every pending suggestion from this sender.
  const acceptAllFromSender = async (sender: string) => {
    const matches = items.filter((x) => x.sender_email === sender);
    if (matches.length === 0) return;
    if (!window.confirm(`Accept all ${matches.length} suggestions from ${sender}?`)) return;
    setBusy(`acc:${sender}`);
    try {
      let totalClaimed = 0;
      for (const s of matches) {
        const claimed = await claimEmailsForSuggestion(s);
        totalClaimed += claimed;
        await supabase
          .from("pending_attribution_suggestions")
          .update({ status: "accepted", resolved_at: new Date().toISOString() })
          .eq("id", s.id);
      }
      toast.success(`Accepted ${matches.length} suggestion${matches.length === 1 ? "" : "s"} — routed ${totalClaimed} email${totalClaimed === 1 ? "" : "s"}`);
      setItems((prev) => prev.filter((x) => x.sender_email !== sender));
    } catch (e: any) {
      toast.error(e.message || "Bulk accept failed");
    } finally {
      setBusy(null);
    }
  };

  // Round 6 — bulk: reject everything from a domain AND mark the domain as
  // noise so future syncs auto-route it to role_based / firm_activity instead
  // of polluting the suggestion queue again.
  const rejectAllFromDomain = async (domain: string) => {
    const matches = items.filter((x) => x.sender_domain === domain);
    if (matches.length === 0) return;
    const confirmMsg = `Reject all ${matches.length} suggestion${matches.length === 1 ? "" : "s"} from @${domain} AND add this domain to the noise list (future emails will be quarantined)?`;
    if (!window.confirm(confirmMsg)) return;
    setBusy(`rej:${domain}`);
    try {
      // Add to noise list (idempotent — primary key on domain prevents dup)
      await supabase
        .from("email_noise_domains")
        .upsert({ domain, reason: "Bulk-rejected from attribution suggestions" }, { onConflict: "domain" });

      const ids = matches.map((m) => m.id);
      await supabase
        .from("pending_attribution_suggestions")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .in("id", ids);

      toast.success(`Rejected ${matches.length} and added @${domain} to noise list`);
      setItems((prev) => prev.filter((x) => x.sender_domain !== domain));
    } catch (e: any) {
      toast.error(e.message || "Bulk reject failed");
    } finally {
      setBusy(null);
    }
  };

  const runScan = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("auto-suggest-firm-attributions", { body: {} });
      if (error) throw error;
      toast.success("Scan complete");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading attribution suggestions…
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Suggested attributions</span>
          <Badge variant="outline" className="h-5 text-[10px] px-1.5">{items.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={runScan} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Re-scan now
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground text-center">
          No pending suggestions. The system scans daily for unmatched emails from known-firm senders.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((s) => {
            const senderCount = senderGroups.get(s.sender_email) || 1;
            return (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-medium truncate">{s.sender_email}</span>
                      <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-normal">
                        {s.email_count} email{s.email_count === 1 ? "" : "s"}
                      </Badge>
                      {senderCount > 1 && (
                        <Badge variant="outline" className="h-5 text-[10px] px-1.5 font-normal gap-0.5">
                          <Layers className="h-2.5 w-2.5" />
                          {senderCount} suggestions
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Suggested lead:{" "}
                      <button
                        onClick={() => window.open(`/deal/${s.suggested_lead_id}`, "_blank", "noopener,noreferrer")}
                        className="text-primary hover:underline font-medium"
                      >
                        {s.lead_name || s.suggested_lead_id}
                      </button>
                      {s.lead_stage && <span className="ml-1 text-muted-foreground">· {s.lead_stage}</span>}
                    </div>
                    {s.reason && <div className="text-[11px] text-muted-foreground italic mt-1">{s.reason}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      disabled={busy === s.id}
                      onClick={() => accept(s)}
                    >
                      {busy === s.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                      {s.reason === "intermediary_candidate" ? "Mark intermediary" : "Accept"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      disabled={busy === s.id}
                      onClick={() => reject(s)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
                {/* Round 6 — bulk row appears when this sender or domain has multiple suggestions */}
                {senderCount > 1 && (
                  <div className="mt-2 ml-0 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>Bulk:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      disabled={busy === `acc:${s.sender_email}`}
                      onClick={() => acceptAllFromSender(s.sender_email)}
                    >
                      {busy === `acc:${s.sender_email}` ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      Accept all from {s.sender_email}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] text-muted-foreground"
                      disabled={busy === `rej:${s.sender_domain}`}
                      onClick={() => rejectAllFromDomain(s.sender_domain)}
                    >
                      {busy === `rej:${s.sender_domain}` ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Ban className="h-3 w-3 mr-1" />
                      )}
                      Reject all @{s.sender_domain} (noise list)
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
