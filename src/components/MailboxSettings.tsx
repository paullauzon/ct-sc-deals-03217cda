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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, Plus, Loader2, Trash2, RefreshCw, CheckCircle2, AlertCircle, DownloadCloud, History, ChevronDown, ShieldCheck, Copy, ExternalLink, Wand2, Inbox, Info } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { UnmatchedInbox } from "./UnmatchedInbox";
import { EmailTemplatesPanel } from "./EmailTemplatesPanel";
import { AutomationHealthPanel } from "./AutomationHealthPanel";
import { BackfillProgressPanel } from "./BackfillProgressPanel";
import { AILearningPanel } from "./settings/AILearningPanel";
import { NoiseRulesPanel } from "./settings/NoiseRulesPanel";
import { DuplicateLeadsPanel } from "./settings/DuplicateLeadsPanel";
import { PendingAttributionsPanel } from "./settings/PendingAttributionsPanel";
import { HighVolumeSendersPanel } from "./settings/HighVolumeSendersPanel";
import { useMatcherControls } from "@/hooks/useMatcherControls";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const [requestingAdminConsent, setRequestingAdminConsent] = useState(false);
  const [adminConsentUrl, setAdminConsentUrl] = useState<string | null>(null);

  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "mailboxes";
    const params = new URLSearchParams(window.location.hash.replace("#", ""));
    return params.get("tab") === "automation" ? "automation" : "mailboxes";
  });
  const [howOpen, setHowOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("lovable.mailboxes.how-dismissed") !== "1";
  });
  const matcher = useMatcherControls();

  // Connect dialog state
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectProvider, setConnectProvider] = useState<"gmail" | "outlook">("gmail");
  const [labelDraft, setLabelDraft] = useState("");

  const dismissHow = () => {
    setHowOpen(false);
    try { localStorage.setItem("lovable.mailboxes.how-dismissed", "1"); } catch { /* ignore */ }
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_email_connections")
      .select("*")
      .order("created_at", { ascending: false });
    const conns = (data || []) as Connection[];
    setConnections(conns);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const counts: Record<string, number> = {};
    const runs: Record<string, SyncRun[]> = {};

    await Promise.all(
      conns.map(async (c) => {
        const [countRes, runsRes] = await Promise.all([
          supabase
            .from("lead_emails")
            .select("id", { count: "exact", head: true })
            .eq("source", c.provider)
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

  const openConnectDialog = (provider: "gmail" | "outlook") => {
    setConnectProvider(provider);
    setLabelDraft("");
    setConnectOpen(true);
  };

  const startConnect = async () => {
    const label = labelDraft.trim();
    if (!label) { toast.error("Please enter a label first"); return; }
    setConnecting(true);
    try {
      const returnTo = `${window.location.origin}/#sys=crm&view=settings&connected=1`;
      const fnName = connectProvider === "outlook" ? "outlook-oauth-start" : "gmail-oauth-start";
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`);
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

  // Tenant admin recovery path: fetches the Microsoft admin-consent URL and
  // opens it in a new tab. Used when an end-user hits "Approval required" on
  // their first Outlook connect attempt — a tenant admin (e.g. Josh) opens
  // this URL once, approves the app, and afterwards every user can connect
  // through the normal flow without seeing the wall again.
  // Fetches the Microsoft tenant admin-consent URL once and caches it. Used by
  // both the "Copy link" and "Open in new tab" buttons below — the URL itself
  // never changes for a given tenant + app, so we only need to fetch it once
  // per dialog session.
  const fetchAdminConsentUrl = async (): Promise<string | null> => {
    if (adminConsentUrl) return adminConsentUrl;
    setRequestingAdminConsent(true);
    try {
      const returnTo = `${window.location.origin}/#sys=crm&view=settings&connected=1`;
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/outlook-admin-consent-start`);
      url.searchParams.set("return_to", returnTo);
      const res = await fetch(url.toString());
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        throw new Error(json.error || `Could not generate admin-consent link (HTTP ${res.status})`);
      }
      setAdminConsentUrl(json.url);
      return json.url as string;
    } catch (e: any) {
      toast.error(e.message || "Failed to generate admin-consent link");
      return null;
    } finally {
      setRequestingAdminConsent(false);
    }
  };

  const copyAdminConsentLink = async () => {
    const url = await fetchAdminConsentUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copied — paste it to your Microsoft tenant admin", {
        description: "They'll sign in once with their admin account and click Accept.",
      });
    } catch {
      toast.error("Couldn't copy automatically — long-press the link below to copy it manually.");
    }
  };

  const openAdminConsentLink = async () => {
    const url = await fetchAdminConsentUrl();
    if (!url) return;
    window.open(url, "_blank", "noopener");
    toast.success("Admin-consent link opened in a new tab", {
      description: "Have a Microsoft tenant admin sign in and approve. After they accept, retry Connect Outlook.",
    });
  };

  const disconnect = async (id: string, email: string) => {
    if (!window.confirm(`Disconnect ${email}? Sync will stop for this mailbox.`)) return;
    const { error } = await supabase.from("user_email_connections").update({ is_active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Disconnected");
    load();
  };

  const refreshToken = async (c: Connection) => {
    setRefreshingId(c.id);
    try {
      const fn = c.provider === "outlook" ? "refresh-outlook-token" : "refresh-gmail-token";
      const { error } = await supabase.functions.invoke(fn, { body: { connection_id: c.id } });
      if (error) throw error;
      toast.success("Token refreshed");
      load();
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const syncNow = async (c: Connection) => {
    setSyncingId(c.id);
    try {
      const fn = c.provider === "outlook" ? "sync-outlook-emails" : "sync-gmail-emails";
      const { data, error } = await supabase.functions.invoke(fn, { body: { connection_id: c.id } });
      if (error) throw error;
      if (data?.skipped && data?.reason === "backfill_in_progress") {
        toast("Sync paused while backfill is running", {
          description: "It will auto-resume the moment the backfill completes.",
        });
        load();
        return;
      }
      const r = data?.results?.[0];
      if (r) {
        toast.success(
          `Synced ${r.fetched} message${r.fetched === 1 ? "" : "s"} — ${r.inserted} new, ${r.matched} matched`,
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
          Connect Gmail or Outlook mailboxes to sync inbound and outbound emails into the CRM.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
            <TabsTrigger value="unmatched">Unmatched inbox</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="ai-learning">AI Learning</TabsTrigger>
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Connect mailbox
                <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openConnectDialog("gmail")}>
                <Mail className="h-3.5 w-3.5 mr-2" />
                Connect Gmail
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openConnectDialog("outlook")}>
                <Mail className="h-3.5 w-3.5 mr-2" />
                Connect Outlook
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <TabsContent value="mailboxes" className="space-y-6">
          <Collapsible open={howOpen} onOpenChange={setHowOpen}>
            <div className="rounded-lg border border-border bg-secondary/20">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    How email sync works
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${howOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="font-medium text-foreground">Live sync</div>
                    <p className="text-muted-foreground mt-0.5">
                      Runs automatically every 5 minutes for each connected mailbox. Pulls new mail and routes it to the right lead.
                    </p>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Backfill</div>
                    <p className="text-muted-foreground mt-0.5">
                      One-shot pull of historical mail (90 days, 1y, 3y, or all). Auto-runs once on first connect for the last 90 days.
                    </p>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Matcher</div>
                    <p className="text-muted-foreground mt-0.5">
                      Re-runs the routing logic against emails that didn't auto-link to a lead — useful after adding stakeholders or merging duplicates.
                    </p>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Unmatched inbox</div>
                    <p className="text-muted-foreground mt-0.5">
                      Emails the matcher couldn't confidently route. Claim them to a lead manually, or dismiss as noise.
                    </p>
                  </div>
                  <div className="sm:col-span-2 flex justify-end pt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={dismissHow}>
                      Got it — don't show again
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          <div className="rounded-lg border border-border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2 min-w-0">
              <Inbox className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">
                  {matcher.unmatchedCount === null
                    ? "Loading unmatched count…"
                    : `${matcher.unmatchedCount.toLocaleString()} email${matcher.unmatchedCount === 1 ? "" : "s"} not yet linked to a lead`}
                </div>
                <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {matcher.lastRun
                    ? `Last ${matcher.lastRun.kind === "cleanup" ? "cleanup" : "matcher run"}: ${formatDistanceToNow(new Date(matcher.lastRun.ranAt), { addSuffix: true })} · matched ${matcher.lastRun.matched}${matcher.lastRun.scanned ? ` of ${matcher.lastRun.scanned}` : ""}`
                    : "No matcher run recorded yet in this browser"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setActiveTab("unmatched")}
              >
                Review unmatched →
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => matcher.cleanupSweep()}
                disabled={matcher.busy}
                title="Un-staple wrongly-matched emails (personal-provider domains, ambiguous matches, duplicate-lead routing) and re-run the matcher with strict logic"
              >
                {matcher.busy ? (
                  <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Working…</>
                ) : (
                  <><Wand2 className="h-3 w-3 mr-1.5" /> Cleanup sweep</>
                )}
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => matcher.rematchAll()}
                disabled={matcher.busy || matcher.unmatchedCount === 0}
                title="Re-run the matcher across the unmatched inbox. Rows that find a lead will move out automatically."
              >
                Re-run matcher
              </Button>
            </div>
          </div>

          <AttributionHealthPanel />

          <ReclaimBacklogPanel onComplete={() => matcher.refresh?.()} />

          <NoiseRulesPanel />

          <HighVolumeSendersPanel />

          <PendingAttributionsPanel />

          <DuplicateLeadsPanel />

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
                  Click "Connect mailbox" to authorize a Gmail or Outlook account.
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
                    const historyOpen = historyOpenId === c.id && runs.length > 0;

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
                                <span className="text-foreground font-medium tabular-nums">
                                  {(recentCounts[c.id] ?? 0).toLocaleString()}
                                </span>{" "}
                                emails synced (24h)
                              </div>
                              <div className="mt-2 -ml-0.5">
                                <BackfillProgressPanel
                                  connectionId={c.id}
                                  emailAddress={c.email_address}
                                  provider={c.provider}
                                />
                              </div>
                              {runs.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryOpenId(historyOpen ? null : c.id)}
                                  className="mt-2 text-[11px] inline-flex items-center gap-1 hover:text-foreground"
                                >
                                  <History className="h-2.5 w-2.5" />
                                  {historyOpen ? "Hide" : "Show"} recent syncs
                                </button>
                              )}
                              {historyOpen && (
                                <div className="mt-2 rounded border border-border/60 bg-secondary/10 p-2">
                                  <table className="w-full text-xs">
                                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                      <tr>
                                        <th className="text-left py-1 font-medium">When</th>
                                        <th className="text-left py-1 font-medium">Mode</th>
                                        <th className="text-right py-1 font-medium">Fetched</th>
                                        <th className="text-right py-1 font-medium">Inserted</th>
                                        <th className="text-right py-1 font-medium">Matched</th>
                                        <th className="text-left py-1 font-medium pl-3">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                      {runs.map((r) => (
                                        <tr key={r.id}>
                                          <td className="py-1.5">{formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}</td>
                                          <td className="py-1.5">{r.mode}</td>
                                          <td className="py-1.5 text-right tabular-nums">{r.fetched}</td>
                                          <td className="py-1.5 text-right tabular-nums">{r.inserted}</td>
                                          <td className="py-1.5 text-right tabular-nums">{r.matched}</td>
                                          <td className="py-1.5 pl-3 capitalize">{r.status}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {c.is_active && (
                              <>
                                <Button
                                  variant="outline" size="sm" className="h-7 px-2 text-xs"
                                  onClick={() => syncNow(c)}
                                  disabled={syncingId === c.id}
                                  title="Sync new emails now"
                                >
                                  {syncingId === c.id ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <DownloadCloud className="h-3 w-3 mr-1.5" />}
                                  Sync now
                                </Button>
                                <Button
                                  variant="ghost" size="sm" className="h-7 px-2 text-xs"
                                  onClick={() => refreshToken(c)}
                                  disabled={refreshingId === c.id}
                                  title="Refresh OAuth access token for this mailbox"
                                >
                                  {refreshingId === c.id ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                                  Refresh token
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => disconnect(c.id, c.email_address)}
                              title="Disconnect this mailbox — sync stops immediately"
                            >
                              <Trash2 className="h-3 w-3 mr-1.5" />
                              Disconnect
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-1.5 pt-2">
            <p className="font-medium text-foreground">Testing-mode note</p>
            <p>Gmail: The Google OAuth app runs in Testing mode, so refresh tokens expire every 7 days. If a mailbox shows "Reconnect required", click "Connect mailbox" again with the same account to restore sync.</p>
          </div>
        </TabsContent>

        <TabsContent value="unmatched">
          <UnmatchedInbox />
        </TabsContent>

        <TabsContent value="templates">
          <EmailTemplatesPanel />
        </TabsContent>

        <TabsContent value="automation">
          <AutomationHealthPanel />
        </TabsContent>

        <TabsContent value="ai-learning">
          <AILearningPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={connectOpen} onOpenChange={(v) => { if (!connecting) setConnectOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect {connectProvider === "outlook" ? "an Outlook" : "a Gmail"} mailbox</DialogTitle>
            <DialogDescription>
              Give this mailbox a label so you can recognize it in the CRM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="mailbox-label" className="text-xs">Label</Label>
            <Input
              id="mailbox-label"
              autoFocus
              placeholder={connectProvider === "outlook" ? "e.g. Adam — SourceCo" : "e.g. Adam — Captarget"}
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") startConnect(); }}
              disabled={connecting}
            />
            <p className="text-[11px] text-muted-foreground">
              Convention: <span className="font-mono">First name — Brand</span>. The brand suffix drives the from-name on outbound emails.
            </p>
          </div>

          {connectProvider === "outlook" && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-medium">Hit "Approval required" on Microsoft?</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Your tenant blocks user self-consent for mailbox access. Send the link below to a Microsoft tenant admin (e.g. Josh) — they'll sign in once with an account that has <span className="font-medium text-foreground">Global Admin</span>, <span className="font-medium text-foreground">Privileged Role Admin</span>, or <span className="font-medium text-foreground">Cloud App Admin</span> rights and click Accept. Afterwards every user can connect normally.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={copyAdminConsentLink}
                  disabled={requestingAdminConsent}
                >
                  {requestingAdminConsent && !adminConsentUrl ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <Copy className="h-3 w-3 mr-1.5" />
                  )}
                  Copy link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={openAdminConsentLink}
                  disabled={requestingAdminConsent}
                >
                  {requestingAdminConsent && !adminConsentUrl ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3 w-3 mr-1.5" />
                  )}
                  Open in new tab
                </Button>
              </div>
              {adminConsentUrl && (
                <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Admin-consent URL</p>
                  <p className="text-[10px] font-mono text-foreground/80 break-all leading-snug select-all">
                    {adminConsentUrl}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConnectOpen(false)} disabled={connecting}>
              Cancel
            </Button>
            <Button size="sm" onClick={startConnect} disabled={connecting || !labelDraft.trim()}>
              {connecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Continue to {connectProvider === "outlook" ? "Microsoft" : "Google"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
