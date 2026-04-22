// Surfaces system-generated attribution suggestions. The auto-suggest cron
// scans unmatched emails from senders at known firm domains and proposes a
// likely lead based on thread continuity. Reps accept or reject one click.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, Loader2, Check, X, RefreshCw } from "lucide-react";
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

  const accept = async (s: Suggestion) => {
    setBusy(s.id);
    try {
      // Move all unmatched emails from this sender to the suggested lead via safe-claim-email
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
          {items.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="font-medium truncate">{s.sender_email}</span>
                    <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-normal">
                      {s.email_count} email{s.email_count === 1 ? "" : "s"}
                    </Badge>
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
                    Accept
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
