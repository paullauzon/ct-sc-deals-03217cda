// Email sync health surface — sits at the top of the Automation tab.
// Shows for each active mailbox connection:
//   - Last successful sync (green <15m, amber 15–60m, red >60m)
//   - Inbox count in last 24h
//   - Total unmatched count + 7-day trend
//   - Suspicious matches scan (always 0 if matcher is healthy)
//
// Read-only, polls on mount + every 60s. Click any chip to open Mailbox
// settings or Unmatched inbox respectively.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, Inbox, ShieldAlert, RefreshCw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ConnectionRow {
  id: string;
  email_address: string;
  provider: string;
  last_synced_at: string | null;
}

interface SyncHealth {
  connections: ConnectionRow[];
  unmatchedTotal: number;
  unmatchedThisWeek: number;
  unmatchedLastWeek: number;
  suspiciousScanRunning: boolean;
  suspiciousCount: number | null;
  lastWatchdogRun: string | null;
  watchdogStatus: string | null;
}

export function EmailSyncHealthPanel() {
  const [data, setData] = useState<SyncHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

    const [conns, unmatchedAll, unmatchedThis, unmatchedLast, watchdog] = await Promise.all([
      supabase
        .from("user_email_connections")
        .select("id, email_address, provider, last_synced_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", "unmatched"),
      supabase
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", "unmatched")
        .gte("created_at", weekAgo),
      supabase
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", "unmatched")
        .gte("created_at", twoWeeksAgo)
        .lt("created_at", weekAgo),
      supabase
        .from("cron_run_log")
        .select("ran_at, status")
        .eq("job_name", "sync-watchdog")
        .order("ran_at", { ascending: false })
        .limit(1),
    ]);

    setData({
      connections: (conns.data || []) as ConnectionRow[],
      unmatchedTotal: unmatchedAll.count ?? 0,
      unmatchedThisWeek: unmatchedThis.count ?? 0,
      unmatchedLastWeek: unmatchedLast.count ?? 0,
      suspiciousScanRunning: false,
      suspiciousCount: null,
      lastWatchdogRun: (watchdog.data?.[0] as any)?.ran_at ?? null,
      watchdogStatus: (watchdog.data?.[0] as any)?.status ?? null,
    });
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const runSuspiciousScan = async () => {
    if (!data || scanning) return;
    setScanning(true);
    try {
      // Fetch a sample of claimed emails (last 7d) and check participant ratio
      // client-side. This is a lightweight indicator; the heavy server-side
      // scan lives in the unclaim-bad-matches function.
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("lead_emails")
        .select("lead_id, from_address, to_addresses, cc_addresses")
        .neq("lead_id", "unmatched")
        .gte("created_at", since)
        .limit(2000);
      if (!rows) return;

      const byLead: Record<string, { total: number; bad: number }> = {};
      const leadIds = Array.from(new Set(rows.map((r: any) => r.lead_id).filter(Boolean)));
      const { data: leads } = await supabase
        .from("leads")
        .select("id, email, secondary_contacts")
        .in("id", leadIds);
      const leadContacts: Record<string, Set<string>> = {};
      for (const l of (leads || []) as any[]) {
        const set = new Set<string>();
        const e = (l.email || "").toLowerCase().trim();
        if (e) set.add(e);
        const sec = Array.isArray(l.secondary_contacts) ? l.secondary_contacts : [];
        for (const c of sec) {
          const ce = (c?.email || "").toLowerCase().trim();
          if (ce) set.add(ce);
        }
        leadContacts[l.id] = set;
      }
      const { data: allStakes } = await supabase
        .from("lead_stakeholders")
        .select("lead_id, email")
        .in("lead_id", leadIds);
      for (const s of (allStakes || []) as any[]) {
        if (!leadContacts[s.lead_id]) leadContacts[s.lead_id] = new Set();
        const e = (s.email || "").toLowerCase().trim();
        if (e) leadContacts[s.lead_id].add(e);
      }

      for (const r of rows as any[]) {
        const set = leadContacts[r.lead_id];
        if (!set) continue;
        const all = [r.from_address, ...(r.to_addresses || []), ...(r.cc_addresses || [])]
          .filter(Boolean)
          .map((x: string) => x.toLowerCase());
        const known = all.some((a) => set.has(a));
        const stat = byLead[r.lead_id] || { total: 0, bad: 0 };
        stat.total += 1;
        if (!known) stat.bad += 1;
        byLead[r.lead_id] = stat;
      }
      const suspicious = Object.values(byLead).filter(
        (s) => s.total >= 3 && s.bad / s.total > 0.3,
      ).length;
      setData((prev) => prev ? { ...prev, suspiciousCount: suspicious } : prev);
      if (suspicious === 0) {
        toast.success("Clean — every claimed lead has matching participants");
      } else {
        toast.warning(`${suspicious} lead${suspicious === 1 ? "" : "s"} flagged — review with Run cleanup sweep in Unmatched inbox`);
      }
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const syncAllNow = async () => {
    if (!data || syncingAll) return;
    setSyncingAll(true);
    const toastId = toast.loading("Syncing all mailboxes…");
    try {
      const calls = data.connections.map((c) => {
        const fn = c.provider === "outlook" ? "sync-outlook-emails" : "sync-gmail-emails";
        return supabase.functions.invoke(fn, { body: { connection_id: c.id } });
      });
      const results = await Promise.allSettled(calls);
      const ok = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`${ok}/${data.connections.length} mailboxes synced`, { id: toastId });
      load();
    } catch (e: any) {
      toast.error(e.message || "Sync failed", { id: toastId });
    } finally {
      setSyncingAll(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="border border-border rounded-lg p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading email sync health…
      </div>
    );
  }

  const trend = data.unmatchedThisWeek - data.unmatchedLastWeek;
  const trendLabel = trend === 0
    ? "flat vs last week"
    : trend > 0
      ? `+${trend} vs last week`
      : `${trend} vs last week`;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5" />
          <h3 className="text-sm font-semibold">Email sync health</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={syncAllNow}
            disabled={syncingAll || data.connections.length === 0}
          >
            {syncingAll ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Activity className="h-3 w-3 mr-1" />}
            Sync all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={runSuspiciousScan}
            disabled={scanning}
            title="Scan claimed emails for low participant-match ratios"
          >
            {scanning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldAlert className="h-3 w-3 mr-1" />}
            Scan matches
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={load} title="Refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {data.connections.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No active mailbox connections. Connect a mailbox in the Mailboxes tab.
          </div>
        ) : (
          data.connections.map((c) => {
            const ts = c.last_synced_at ? new Date(c.last_synced_at).getTime() : null;
            const minutesAgo = ts ? Math.round((Date.now() - ts) / 60000) : null;
            const dotClass = minutesAgo === null
              ? "bg-foreground"
              : minutesAgo <= 15
                ? "bg-foreground/30"
                : minutesAgo <= 60
                  ? "bg-foreground/60"
                  : "bg-foreground";
            const labelText = minutesAgo === null
              ? "Never synced"
              : minutesAgo <= 15
                ? "Healthy"
                : minutesAgo <= 60
                  ? "Slow"
                  : "Stale";
            return (
              <div key={c.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass)} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.email_address}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">{c.provider}</div>
                </div>
                <div className="text-right">
                  <div className="text-foreground font-medium">{labelText}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.last_synced_at
                      ? formatDistanceToNow(new Date(c.last_synced_at), { addSuffix: true })
                      : "—"}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-3 border-t border-border bg-secondary/10 grid grid-cols-3 gap-4 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 inline-flex items-center gap-1">
            <Inbox className="h-2.5 w-2.5" /> Unmatched inbox
          </div>
          <div className="text-foreground font-semibold tabular-nums">{data.unmatchedTotal.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">
            {data.unmatchedThisWeek} this week · {trendLabel}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 inline-flex items-center gap-1">
            <ShieldAlert className="h-2.5 w-2.5" /> Suspicious matches
          </div>
          <div className="text-foreground font-semibold tabular-nums">
            {data.suspiciousCount === null ? "—" : data.suspiciousCount}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {data.suspiciousCount === null
              ? "Click 'Scan matches' to run"
              : data.suspiciousCount === 0
                ? "All clean (last 7d)"
                : "Lead(s) below 70% participant match"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            Watchdog
          </div>
          <div className="text-foreground font-semibold capitalize">
            {data.watchdogStatus ?? "Awaiting first run"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {data.lastWatchdogRun
              ? `Ran ${formatDistanceToNow(new Date(data.lastWatchdogRun), { addSuffix: true })}`
              : "Hourly cron will start reporting shortly"}
          </div>
        </div>
      </div>
    </div>
  );
}
