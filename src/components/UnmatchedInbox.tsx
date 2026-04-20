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
import { Loader2, Inbox, Link2, Trash2, Check, ChevronsUpDown, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

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

  useEffect(() => { load(); }, []);

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
    const { error } = await supabase
      .from("lead_emails")
      .update({ lead_id: leadId })
      .eq("id", emailId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Claimed to lead");
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
    }
    setBusyId(null);
  };

  const claimAllFromSender = async (fromAddress: string, leadId: string) => {
    setBusyId(fromAddress);
    const { error, count } = await supabase
      .from("lead_emails")
      .update({ lead_id: leadId }, { count: "exact" })
      .eq("lead_id", "unmatched")
      .eq("from_address", fromAddress);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Claimed ${count ?? 0} email${count === 1 ? "" : "s"} from ${fromAddress}`);
      setEmails((prev) => prev.filter((e) => e.from_address !== fromAddress));
    }
    setBusyId(null);
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
        <div className="text-xs text-muted-foreground">
          {emails.length} unmatched
        </div>
      </div>

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
