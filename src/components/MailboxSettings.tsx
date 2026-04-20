import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mail, Plus, Loader2, Trash2, RefreshCw, CheckCircle2, AlertCircle, DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

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

export function MailboxSettings() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [recentCounts, setRecentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_email_connections")
      .select("*")
      .order("created_at", { ascending: false });
    const conns = (data || []) as Connection[];
    setConnections(conns);

    // 24h insert health badge per mailbox — counts lead_emails (source=gmail) where
    // this mailbox is either sender or recipient. Cheap head-only count, parallel per row.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const counts: Record<string, number> = {};
    await Promise.all(
      conns.map(async (c) => {
        const { count } = await supabase
          .from("lead_emails")
          .select("id", { count: "exact", head: true })
          .eq("source", "gmail")
          .gte("created_at", since)
          .or(`from_address.eq.${c.email_address},to_addresses.cs.{${c.email_address}}`);
        counts[c.id] = count ?? 0;
      }),
    );
    setRecentCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Show success toast if returning from OAuth
    const hash = window.location.hash;
    if (hash.includes("connected=1")) {
      toast.success("Mailbox connected");
      const cleaned = hash.replace(/&?connected=1/, "");
      window.location.hash = cleaned;
    }
  }, []);

  const connectGmail = async () => {
    setConnecting(true);
    try {
      const label = window.prompt("Label for this mailbox (e.g. 'Adam — Captarget'):", "");
      if (!label) { setConnecting(false); return; }

      const returnTo = `${window.location.origin}/#sys=crm&view=settings&connected=1`;
      // Plain GET to the public edge function — no Authorization header needed
      // (verify_jwt is off) and avoiding it removes a CORS preflight.
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
      const { data, error } = await supabase.functions.invoke("refresh-gmail-token", {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mailbox connections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect Gmail mailboxes to sync inbound and outbound emails into the CRM.
          </p>
        </div>
        <Button onClick={connectGmail} disabled={connecting} size="sm">
          {connecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
          Connect Gmail
        </Button>
      </div>

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
              {connections.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.email_address}</div>
                    <div className="text-xs text-muted-foreground">{c.user_label}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{c.provider}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      // Only flag "Reconnect required" when token is expired AND no successful sync ever AND
                      // the connection is older than 24h. Avoids false positives on brand-new connections.
                      const tokenExpired = c.token_expires_at && new Date(c.token_expires_at) < new Date();
                      const neverSynced = !c.last_synced_at;
                      const olderThan24h = (new Date().getTime() - new Date(c.created_at).getTime()) > 24 * 60 * 60 * 1000;
                      const needsReconnect = c.is_active && tokenExpired && neverSynced && olderThan24h;

                      if (!c.is_active) {
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <AlertCircle className="h-3 w-3" />
                            Disconnected
                          </span>
                        );
                      }
                      if (needsReconnect) {
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-foreground">
                            <AlertCircle className="h-3 w-3" />
                            Reconnect required
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <CheckCircle2 className="h-3 w-3 text-foreground" />
                          Active
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.last_synced_at
                      ? formatDistanceToNow(new Date(c.last_synced_at), { addSuffix: true })
                      : "Not yet synced"}
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1.5 pt-2">
        <p className="font-medium text-foreground">Testing-mode note</p>
        <p>The Google OAuth app runs in Testing mode, so refresh tokens expire every 7 days. If a mailbox shows "Reconnect required", click "Connect Gmail" again with the same account to restore sync.</p>
      </div>
    </div>
  );
}
