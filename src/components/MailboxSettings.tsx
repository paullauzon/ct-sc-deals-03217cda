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
    setConnections((data || []) as Connection[]);
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
      const { data, error } = await supabase.functions.invoke("gmail-oauth-start", {
        body: null,
      });
      if (error) throw error;
      // We need to call as GET with query params; invoke uses POST. Build URL manually:
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-oauth-start`);
      url.searchParams.set("user_label", label);
      url.searchParams.set("return_to", returnTo);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const json = await res.json();
      if (!json.url) throw new Error(json.error || "Could not start OAuth");
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
        toast.success(
          `Synced ${r.fetched} message${r.fetched === 1 ? "" : "s"} — ${r.inserted} new, ${r.matched} matched, ${r.skipped_dup} duplicate`,
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
                      // Token expired more than 7 days ago + no successful sync = likely needs reconnect
                      const tokenExpired = c.token_expires_at && new Date(c.token_expires_at) < new Date();
                      const staleSync = !c.last_synced_at || (new Date().getTime() - new Date(c.last_synced_at).getTime()) > 7 * 24 * 60 * 60 * 1000;
                      const needsReconnect = c.is_active && tokenExpired && staleSync;

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
        <p className="font-medium text-foreground">Phase 1 — OAuth foundation</p>
        <p>This screen connects mailboxes and stores their tokens. Inbound sync, outbound send, and open/click tracking ship in the next phases.</p>
      </div>
    </div>
  );
}
