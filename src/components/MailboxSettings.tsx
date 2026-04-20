import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, Plus, Loader2, Trash2, RefreshCw, CheckCircle2, AlertCircle, DownloadCloud, History } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { UnmatchedInbox } from "./UnmatchedInbox";

interface Connection {
  id: string;
  provider: string;
  email_address: string;
  user_label: string;
  is_active: boolean;
  last_synced_at: string | null;
  token_expires_at: string | null;
  created_at: string;
}

interface SyncRun {
  id: string;
  connection_id: string;
  mode: string;
  started_at: string;
  fetched: number;
  inserted: number;
  matched: number;
  status: string;
  errors: unknown;
}

export function MailboxSettings() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [recentCounts, setRecentCounts] = useState<Record<string, number>>({});
  const [recentRuns, setRecentRuns] = useState<Record<string, SyncRun[]>>({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);

  // Connect-Gmail dialog state (replaces window.prompt)
  const [connectOpen, setConnectOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_email_connections")
      .select("*")
      .order("created_at", { ascending: false });
    const conns = (data || []) as Connection[];
    setConnections(conns);

    // Per-mailbox: 24h insert count + last 5 sync runs (parallel)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const counts: Record<string, number> = {};
    const runs: Record<string, SyncRun[]> = {};

    await Promise.all(
      conns.map(async (c) => {
        const [countRes, runsRes] = await Promise.all([
          supabase
            .from("lead_emails")
            .select("id", { count: "exact", head: true })
            .eq("source", "gmail")
            .gte("created_at", since)
            .or(`from_address.eq.${c.email_address},to_addresses.cs.{${c.email_address}}`),
          supabase
            .from("email_sync_runs")
            .select("id, connection_id, mode, started_at, fetched, inserted, matched, status, errors")
            .eq("connection_id", c.id)
            .order("started_at", { ascending: false })
            .limit(10),
        ]);
        counts[c.id] = countRes.count ?? 0;
        runs[c.id] = (runsRes.data || []) as SyncRun[];
      }),
    );
    setRecentCounts(counts);
    setRecentRuns(runs);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const hash = window.location.hash;
    if (hash.includes("connected=1")) {
      toast.success("Mailbox connected");
      const cleaned = hash.replace(/&?connected=1/, "");
      window.location.hash = cleaned;
    }
  }, []);

  const startConnect = async () => {
    const label = labelDraft.trim();
    if (!label) {
      toast.error("Please enter a label first");
      return;
    }
    setConnecting(true);
    try {
      const returnTo = `${window.location.origin}/#sys=crm&view=settings&connected=1`;
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-oauth-start`);
      url.searchParams.set("user_label", label);
      url.searchParams.set("return_to", returnTo);
      const res = await fetch(url.toString());
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        throw new Error(json.error || `Could not start OAuth (HTTP ${res.status})`);
      }
      window.location.href = json.url;
    } catch (e: any) {
      toast.error(e.message || "Failed to start connection");
      setConnecting(false);
    }
  };

  const disconnect = async (id: string, email: string) => {
    if (!window.confirm(`Disconnect ${email}? Sync will stop for this mailbox.`)) return;
    const { error } = await supabase
      .from("user_email_connections")
      .update({ is_active: false })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Disconnected");
    load();
  };

  const refreshToken = async (id: string) => {
    setRefreshingId(id);
    try {
      const { error } = await supabase.functions.invoke("refresh-gmail-token", {
        body: { connection_id: id },
      });
      if (error) throw error;
      toast.success("Token refreshed");
      load();
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const syncNow = async (id: string) => {
    setSyncingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("sync-gmail-emails", {
        body: { connection_id: id },
      });
      if (error) throw error;
      const r = data?.results?.[0];
      if (r) {
        const matchedHint = r.inserted > 0 && r.matched === 0
          ? " — unmatched emails will link automatically when leads are added"
          : "";
        toast.success(
          `Synced ${r.fetched} message${r.fetched === 1 ? "" : "s"} — ${r.inserted} new, ${r.matched} matched, ${r.skipped_dup} duplicate${matchedHint}`,
        );
      } else {
        toast.success("Sync complete");
      }
      load();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mailbox connections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect Gmail mailboxes to sync inbound and outbound emails into the CRM.
        </p>
      </div>

      <Tabs defaultValue="mailboxes" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
            <TabsTrigger value="unmatched">Unmatched inbox</TabsTrigger>
          </TabsList>
          <Button onClick={() => { setLabelDraft(""); setConnectOpen(true); }} size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Connect Gmail
          </Button>
        </div>

        <TabsContent value="mailboxes" className="space-y-6">
          <div className="border border-border rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Loading…
              </div>
            ) : connections.length === 0 ? (
              <div className="p-12 text-center">
                <Mail className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium">No mailboxes connected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Connect Gmail" to authorize a mailbox via Google OAuth.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Mailbox</th>
                    <th className="text-left px-4 py-2.5 font-medium">Provider</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium">Last synced</th>
                    <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {connections.map((c) => {
                    const tokenExpired = c.token_expires_at && new Date(c.token_expires_at) < new Date();
                    const neverSynced = !c.last_synced_at;
                    const olderThan24h = (new Date().getTime() - new Date(c.created_at).getTime()) > 24 * 60 * 60 * 1000;
                    const needsReconnect = c.is_active && tokenExpired && neverSynced && olderThan24h;
                    const runs = recentRuns[c.id] || [];

                    return (
                      <tr key={c.id} className="hover:bg-secondary/20 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium">{c.email_address}</div>
                          <div className="text-xs text-muted-foreground">{c.user_label}</div>
                        </td>
                        <td className="px-4 py-3 capitalize">{c.provider}</td>
                        <td className="px-4 py-3">
                          {!c.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <AlertCircle className="h-3 w-3" />
                              Disconnected
                            </span>
                          ) : needsReconnect ? (
                            <span className="inline-flex items-center gap-1 text-xs text-foreground">
                              <AlertCircle className="h-3 w-3" />
                              Reconnect required
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <CheckCircle2 className="h-3 w-3 text-foreground" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <div>
                            {c.last_synced_at
                              ? formatDistanceToNow(new Date(c.last_synced_at), { addSuffix: true })
                              : "Not yet synced"}
                          </div>
                          {c.is_active && (
                            <>
                              <div className="mt-0.5 text-[11px]">
                                <span className="text-foreground font-medium">{recentCounts[c.id] ?? 0}</span> in last 24h
                              </div>
                              {runs.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryOpenId(historyOpenId === c.id ? null : c.id)}
                                  className="mt-0.5 text-[11px] inline-flex items-center gap-1 hover:text-foreground"
                                >
                                  <History className="h-2.5 w-2.5" />
                                  {historyOpenId === c.id ? "Hide" : "Show"} recent syncs
                                </button>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {c.is_active && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => syncNow(c.id)}
                                  disabled={syncingId === c.id}
                                  title="Sync new emails now"
                                >
                                  {syncingId === c.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <DownloadCloud className="h-3 w-3" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => refreshToken(c.id)}
                                  disabled={refreshingId === c.id}
                                  title="Refresh access token"
                                >
                                  {refreshingId === c.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <RefreshCw className="h-3 w-3" />}
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => disconnect(c.id, c.email_address)}
                              title="Disconnect mailbox"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {connections.map((c) => (
                    historyOpenId === c.id && (recentRuns[c.id] || []).length > 0 ? (
                      <tr key={`history-${c.id}`} className="bg-secondary/10">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                            Recent syncs — {c.email_address}
                          </div>
                          <table className="w-full text-xs">
                            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              <tr>
                                <th className="text-left py-1 font-medium">When</th>
                                <th className="text-left py-1 font-medium">Mode</th>
                                <th className="text-right py-1 font-medium">Fetched</th>
                                <th className="text-right py-1 font-medium">Inserted</th>
                                <th className="text-right py-1 font-medium">Matched</th>
                                <th className="text-left py-1 font-medium pl-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {(recentRuns[c.id] || []).map((r) => (
                                <tr key={r.id}>
                                  <td className="py-1.5">{formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}</td>
                                  <td className="py-1.5">{r.mode}</td>
                                  <td className="py-1.5 text-right tabular-nums">{r.fetched}</td>
                                  <td className="py-1.5 text-right tabular-nums">{r.inserted}</td>
                                  <td className="py-1.5 text-right tabular-nums">{r.matched}</td>
                                  <td className="py-1.5 pl-4 capitalize">{r.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-1.5 pt-2">
            <p className="font-medium text-foreground">Testing-mode note</p>
            <p>The Google OAuth app runs in Testing mode, so refresh tokens expire every 7 days. If a mailbox shows "Reconnect required", click "Connect Gmail" again with the same account to restore sync.</p>
          </div>
        </TabsContent>

        <TabsContent value="unmatched">
          <UnmatchedInbox />
        </TabsContent>
      </Tabs>

      <Dialog open={connectOpen} onOpenChange={(v) => { if (!connecting) setConnectOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect a Gmail mailbox</DialogTitle>
            <DialogDescription>
              Give this mailbox a label so you can recognize it in the CRM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="mailbox-label" className="text-xs">Label</Label>
            <Input
              id="mailbox-label"
              autoFocus
              placeholder="e.g. Adam — Captarget"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") startConnect(); }}
              disabled={connecting}
            />
            <p className="text-[11px] text-muted-foreground">
              Convention: <span className="font-mono">First name — Brand</span>. The brand suffix drives the from-name on outbound emails.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConnectOpen(false)} disabled={connecting}>
              Cancel
            </Button>
            <Button size="sm" onClick={startConnect} disabled={connecting || !labelDraft.trim()}>
              {connecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Continue to Google
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
