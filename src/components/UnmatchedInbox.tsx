import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Loader2, Inbox, Link2, Trash2, Check, ChevronsUpDown, Search, Wand2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CompanyInboxView } from "./CompanyInboxView";

interface UnmatchedEmail {
  id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[] | null;
  subject: string | null;
  body_preview: string | null;
  email_date: string;
  direction: string;
  source: string | null;
}

interface LeadOption {
  id: string;
  name: string;
  email: string;
  company: string;
}

export function UnmatchedInbox() {
  const [emails, setEmails] = useState<UnmatchedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [rematching, setRematching] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    setLoading(true);
    const [emailsRes, leadsRes] = await Promise.all([
      supabase
        .from("lead_emails")
        .select("id, from_address, from_name, to_addresses, subject, body_preview, email_date, direction, source")
        .eq("lead_id", "unmatched")
        .order("email_date", { ascending: false })
        .limit(500),
      supabase
        .from("leads")
        .select("id, name, email, company")
        .is("archived_at", null)
        .eq("is_duplicate", false)
        .order("updated_at", { ascending: false })
        .limit(1000),
    ]);
    setEmails((emailsRes.data || []) as UnmatchedEmail[]);
    setLeads((leadsRes.data || []) as LeadOption[]);
    setLoading(false);
  };

  useEffect(() => {
    load();

    const debouncedReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { load(); }, 2000);
    };

    const channel = supabase
      .channel("unmatched-inbox-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_emails", filter: "lead_id=eq.unmatched" },
        () => debouncedReload(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lead_emails" },
        (payload: any) => {
          const oldLead = payload?.old?.lead_id;
          const newLead = payload?.new?.lead_id;
          // Email moved out of unmatched (claimed elsewhere) — drop optimistically
          if (oldLead === "unmatched" && newLead && newLead !== "unmatched") {
            setEmails((prev) => prev.filter((e) => e.id !== payload.new.id));
          }
          // Email moved INTO unmatched (rare) — pull a fresh snapshot
          if (oldLead && oldLead !== "unmatched" && newLead === "unmatched") {
            debouncedReload();
          }
        },
      )
      .subscribe();

    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((e) =>
      (e.from_address || "").toLowerCase().includes(q) ||
      (e.from_name || "").toLowerCase().includes(q) ||
      (e.subject || "").toLowerCase().includes(q) ||
      (e.body_preview || "").toLowerCase().includes(q),
    );
  }, [emails, search]);

  const claimToLead = async (emailId: string, leadId: string) => {
    setBusyId(emailId);
    const target = emails.find((e) => e.id === emailId);
    const { error } = await supabase
      .from("lead_emails")
      .update({ lead_id: leadId })
      .eq("id", emailId);
    if (error) {
      toast.error(error.message);
    } else {
      // Auto-promote the sender as a stakeholder so future emails from this
      // address route correctly via Tier 3 — no need to claim again.
      if (target?.from_address) {
        await ensureStakeholder(leadId, target.from_address, target.from_name || "");
      }
      toast.success("Claimed to lead — sender added as stakeholder for future routing");
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
    }
    setBusyId(null);
  };

  const ensureStakeholder = async (leadId: string, email: string, name: string) => {
    const lower = email.toLowerCase().trim();
    if (!lower) return;
    const { data: existing } = await supabase
      .from("lead_stakeholders")
      .select("id")
      .eq("lead_id", leadId)
      .eq("email", lower)
      .limit(1);
    if (existing && existing.length > 0) return;
    await supabase.from("lead_stakeholders").insert({
      lead_id: leadId,
      email: lower,
      name: name.trim(),
      role: "Manually claimed from Unmatched inbox",
      notes: "Added when email was manually routed to this lead",
      sentiment: "neutral",
      last_contacted: new Date().toISOString(),
    });
  };

  const claimAllFromSender = async (fromAddress: string, leadId: string) => {
    setBusyId(fromAddress);
    const sample = emails.find((e) => e.from_address === fromAddress);
    const { error, count } = await supabase
      .from("lead_emails")
      .update({ lead_id: leadId }, { count: "exact" })
      .eq("lead_id", "unmatched")
      .eq("from_address", fromAddress);
    if (error) {
      toast.error(error.message);
    } else {
      // Same auto-stakeholder write — claiming all from a sender obviously
      // implies that sender belongs to this lead going forward.
      await ensureStakeholder(leadId, fromAddress, sample?.from_name || "");
      toast.success(`Claimed ${count ?? 0} email${count === 1 ? "" : "s"} from ${fromAddress} — added as stakeholder`);
      setEmails((prev) => prev.filter((e) => e.from_address !== fromAddress));
    }
    setBusyId(null);
  };

  const rematchAll = async () => {
    if (rematching) return;
    if (!window.confirm(`Re-run the matcher across all ${emails.length} unmatched emails? Rows linked to a lead will move out of this inbox automatically.`)) return;
    setRematching(true);
    const toastId = toast.loading("Re-matching unmatched emails…");
    try {
      const { data, error } = await supabase.functions.invoke("rematch-unmatched-emails", {
        body: { limit: 2000 },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Re-match failed");
      const matched = data.matched ?? 0;
      const remaining = data.remaining_unmatched ?? null;
      toast.success(
        matched === 0
          ? "No new matches — remaining rows are genuinely unclaimable"
          : `Matched ${matched} email${matched === 1 ? "" : "s"}${remaining != null ? ` · ${remaining} still unmatched` : ""}`,
        { id: toastId, duration: 5000 },
      );
      await load();
    } catch (e: any) {
      toast.error(e.message || "Re-match failed", { id: toastId });
    } finally {
      setRematching(false);
    }
  };

  const cleanupSweep = async () => {
    if (rematching) return;
    if (!window.confirm("Run cleanup sweep? This unstapes wrongly-matched emails (personal-provider domains, ambiguous matches, duplicate-lead routing) and re-runs the matcher with the corrected logic. Safe to re-run anytime.")) return;
    setRematching(true);
    const toastId = toast.loading("Step 1 of 2 — un-staping wrong matches…");
    try {
      const { data: unclaimRes, error: unclaimErr } = await supabase.functions.invoke("unclaim-bad-matches", {});
      if (unclaimErr) throw unclaimErr;
      if (!unclaimRes?.ok) throw new Error(unclaimRes?.error || "Cleanup failed");
      const unclaimed = unclaimRes.unclaimed ?? 0;
      const redirected = unclaimRes.redirected_to_canonical ?? 0;

      toast.loading(`Step 2 of 2 — re-matching ${unclaimed} freed emails…`, { id: toastId });
      const { data: rematchRes, error: rematchErr } = await supabase.functions.invoke("rematch-unmatched-emails", {
        body: { limit: 5000 },
      });
      if (rematchErr) throw rematchErr;
      const matched = rematchRes?.matched ?? 0;
      const remaining = rematchRes?.remaining_unmatched ?? null;

      toast.success(
        `Cleanup complete · ${unclaimed} un-staped · ${redirected} redirected to canonical · ${matched} re-matched${remaining != null ? ` · ${remaining} unmatched` : ""}`,
        { id: toastId, duration: 8000 },
      );
      await load();
    } catch (e: any) {
      toast.error(e.message || "Cleanup failed", { id: toastId });
    } finally {
      setRematching(false);
    }
  };

  const dismiss = async (emailId: string) => {
    if (!window.confirm("Permanently delete this unmatched email?")) return;
    setBusyId(emailId);
    const { error } = await supabase.from("lead_emails").delete().eq("id", emailId);
    if (error) {
      toast.error(error.message);
    } else {
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Unmatched inbox
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Synced emails that couldn't be linked to a lead. Claim them manually or dismiss noise.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={cleanupSweep}
            disabled={rematching}
            title="Un-stape wrongly-matched emails and re-run the matcher with strict logic"
          >
            {rematching ? (
              <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Working…</>
            ) : (
              <><Wand2 className="h-3 w-3 mr-1.5" /> Run cleanup sweep</>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={rematchAll}
            disabled={rematching || emails.length === 0}
          >
            Re-run matcher
          </Button>
          <div className="text-xs text-muted-foreground">
            {emails.length} unmatched
          </div>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="h-9">
          <TabsTrigger value="all" className="text-xs gap-1.5">
            <Inbox className="h-3 w-3" /> All unmatched
          </TabsTrigger>
          <TabsTrigger value="company" className="text-xs gap-1.5">
            <Building2 className="h-3 w-3" /> By company
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by sender, subject, or content…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium">
                  {emails.length === 0 ? "No unmatched emails" : "No matches for this search"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {emails.length === 0
                    ? "Synced emails are linking to leads cleanly."
                    : "Try a different sender or subject keyword."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((e) => (
                  <UnmatchedRow
                    key={e.id}
                    email={e}
                    leads={leads}
                    busy={busyId === e.id || busyId === e.from_address}
                    onClaim={(leadId) => claimToLead(e.id, leadId)}
                    onClaimAll={(leadId) => claimAllFromSender(e.from_address, leadId)}
                    onDismiss={() => dismiss(e.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="company" className="mt-4">
          <CompanyInboxView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UnmatchedRow({
  email,
  leads,
  busy,
  onClaim,
  onClaimAll,
  onDismiss,
}: {
  email: UnmatchedEmail;
  leads: LeadOption[];
  busy: boolean;
  onClaim: (leadId: string) => void;
  onClaimAll: (leadId: string) => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  return (
    <li className="px-4 py-3 hover:bg-secondary/20">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium truncate">
              {email.from_name || email.from_address}
            </span>
            {email.from_name && (
              <span className="text-xs text-muted-foreground truncate">
                &lt;{email.from_address}&gt;
              </span>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">
              {formatDistanceToNow(new Date(email.email_date), { addSuffix: true })}
            </span>
          </div>
          <div className="text-sm mt-0.5 truncate">{email.subject || "(no subject)"}</div>
          {email.body_preview && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {email.body_preview}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <LeadPicker
          leads={leads}
          open={open}
          setOpen={setOpen}
          disabled={busy}
          label="Claim to lead"
          icon={<Link2 className="h-3 w-3 mr-1.5" />}
          onPick={onClaim}
        />
        <LeadPicker
          leads={leads}
          open={allOpen}
          setOpen={setAllOpen}
          disabled={busy}
          label={`Claim all from ${email.from_address.split("@")[0]}`}
          variant="ghost"
          onPick={onClaimAll}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground ml-auto"
          onClick={onDismiss}
          disabled={busy}
        >
          <Trash2 className="h-3 w-3 mr-1.5" />
          Dismiss
        </Button>
      </div>
    </li>
  );
}

function LeadPicker({
  leads,
  open,
  setOpen,
  disabled,
  label,
  icon,
  variant = "outline",
  onPick,
}: {
  leads: LeadOption[];
  open: boolean;
  setOpen: (v: boolean) => void;
  disabled: boolean;
  label: string;
  icon?: React.ReactNode;
  variant?: "outline" | "ghost";
  onPick: (leadId: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size="sm" className="h-7 px-2 text-xs" disabled={disabled}>
          {icon}
          {label}
          <ChevronsUpDown className="h-3 w-3 ml-1.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search leads by name, email, company…" />
          <CommandList>
            <CommandEmpty>No leads found.</CommandEmpty>
            <CommandGroup>
              {leads.slice(0, 200).map((l) => (
                <CommandItem
                  key={l.id}
                  value={`${l.name} ${l.email} ${l.company} ${l.id}`}
                  onSelect={() => {
                    onPick(l.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">{l.name || l.email}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {l.company} {l.email && `· ${l.email}`}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-2 font-mono">{l.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
