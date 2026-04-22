// Company Inbox — the "third lane" for orphan emails whose sender domain
// matches an active lead/client primary domain but where no participant
// overlaps any known contact for that lead. These rows MUST stay quarantined
// until a human routes them — auto-domain matching is the bug that wrongly
// stapled Boyne billing emails to Benjamin Parrish on day 1.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Loader2, Building2, ChevronDown, ChevronRight, Link2, Trash2, ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface OrphanEmail {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  body_preview: string | null;
  email_date: string;
}

interface DomainOwner {
  kind: "lead" | "client";
  id: string;
  name: string;
  company: string;
}

interface DomainGroup {
  domain: string;
  owners: DomainOwner[];
  emails: OrphanEmail[];
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "me.com", "live.com", "ymail.com", "msn.com",
  "protonmail.com", "proton.me", "googlemail.com", "mail.com",
]);

const INTERNAL_DOMAINS = new Set(["captarget.com", "sourcecodeals.com"]);

function domainOf(email: string): string {
  return (email || "").split("@")[1]?.toLowerCase().trim() || "";
}

export function CompanyInboxView() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DomainGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // Build the lookup of "domain -> owners" from active leads + active clients
    const [leadsRes, clientsRes, emailsRes] = await Promise.all([
      supabase
        .from("leads")
        .select("id, name, email, company")
        .is("archived_at", null)
        .eq("is_duplicate", false),
      supabase
        .from("client_accounts")
        .select("id, contact_name, contact_email, company")
        .neq("cs_stage", "Churned"),
      supabase
        .from("lead_emails")
        .select("id, from_address, from_name, subject, body_preview, email_date")
        .eq("lead_id", "unmatched")
        .order("email_date", { ascending: false })
        .limit(2000),
    ]);

    const ownersByDomain = new Map<string, DomainOwner[]>();
    for (const l of (leadsRes.data || []) as any[]) {
      const d = domainOf(l.email);
      if (!d || PERSONAL_DOMAINS.has(d) || INTERNAL_DOMAINS.has(d)) continue;
      const list = ownersByDomain.get(d) || [];
      list.push({ kind: "lead", id: l.id, name: l.name || l.email, company: l.company || "" });
      ownersByDomain.set(d, list);
    }
    for (const c of (clientsRes.data || []) as any[]) {
      const d = domainOf(c.contact_email);
      if (!d || PERSONAL_DOMAINS.has(d) || INTERNAL_DOMAINS.has(d)) continue;
      const list = ownersByDomain.get(d) || [];
      list.push({ kind: "client", id: c.id, name: c.contact_name || c.contact_email, company: c.company || "" });
      ownersByDomain.set(d, list);
    }

    // Group orphans by sender domain, keep only domains that have a known owner
    const orphans = (emailsRes.data || []) as OrphanEmail[];
    const byDomain = new Map<string, OrphanEmail[]>();
    for (const e of orphans) {
      const d = domainOf(e.from_address);
      if (!d || PERSONAL_DOMAINS.has(d) || INTERNAL_DOMAINS.has(d)) continue;
      if (!ownersByDomain.has(d)) continue;
      const list = byDomain.get(d) || [];
      list.push(e);
      byDomain.set(d, list);
    }

    const groups: DomainGroup[] = Array.from(byDomain.entries())
      .map(([domain, emails]) => ({
        domain,
        owners: ownersByDomain.get(domain) || [],
        emails,
      }))
      .sort((a, b) => b.emails.length - a.emails.length);

    setGroups(groups);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalOrphans = useMemo(() => groups.reduce((acc, g) => acc + g.emails.length, 0), [groups]);

  const toggle = (domain: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(domain) ? next.delete(domain) : next.add(domain);
      return next;
    });
  };

  const claim = async (emailId: string, leadId: string, fromAddress: string, fromName: string | null) => {
    setBusy(emailId);
    // Use the same exact-overlap rule that the shared helper enforces server-side:
    // since this UI is claiming a non-overlapping email by explicit human decision,
    // we promote the sender to a stakeholder FIRST so the overlap check passes,
    // then update the row. This makes the routing recoverable for future emails too.
    try {
      const lower = fromAddress.toLowerCase().trim();
      const { data: existing } = await supabase
        .from("lead_stakeholders")
        .select("id").eq("lead_id", leadId).eq("email", lower).limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from("lead_stakeholders").insert({
          lead_id: leadId,
          email: lower,
          name: (fromName || "").trim(),
          role: "Routed from Company Inbox",
          notes: "Manually attached from same-domain orphan inbox",
          sentiment: "neutral",
          last_contacted: new Date().toISOString(),
        });
      }
      const { error } = await supabase
        .from("lead_emails")
        .update({ lead_id: leadId })
        .eq("id", emailId);
      if (error) throw error;
      toast.success("Email routed — sender promoted to stakeholder");
      setGroups((prev) => prev.map((g) => ({
        ...g,
        emails: g.emails.filter((e) => e.id !== emailId),
      })).filter((g) => g.emails.length > 0));
    } catch (e: any) {
      toast.error(e.message || "Could not claim email");
    } finally {
      setBusy(null);
    }
  };

  const dismissAllFromDomain = async (domain: string) => {
    if (!window.confirm(`Permanently delete all ${groups.find(g => g.domain === domain)?.emails.length ?? 0} unmatched emails from @${domain}? This is meant for firm-noise like billing/marketing/no-reply blasts.`)) return;
    setBusy(`dom:${domain}`);
    try {
      const ids = groups.find(g => g.domain === domain)?.emails.map(e => e.id) || [];
      if (ids.length === 0) return;
      const { error } = await supabase.from("lead_emails").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Dismissed ${ids.length} emails from @${domain}`);
      setGroups((prev) => prev.filter(g => g.domain !== domain));
    } catch (e: any) {
      toast.error(e.message || "Could not dismiss");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        Scanning unmatched emails for known company domains…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="p-12 text-center border border-border rounded-lg">
        <Building2 className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium">No orphan emails from known company domains</p>
        <p className="text-xs text-muted-foreground mt-1">
          When emails arrive from a colleague at a prospect's firm but don't match any contact,
          they'll appear here for you to route — never auto-stapled to the wrong deal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {totalOrphans} email{totalOrphans === 1 ? "" : "s"} from{" "}
        {groups.length} known firm{groups.length === 1 ? "" : "s"} awaiting human routing.
        <span className="ml-1">Same-domain ≠ same deal — review before claiming.</span>
      </div>
      <ul className="space-y-2">
        {groups.map((g) => {
          const isOpen = expanded.has(g.domain);
          return (
            <li key={g.domain} className="border border-border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(g.domain)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-secondary/30 text-left"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">@{g.domain}</span>
                <Badge variant="outline" className="h-5 text-[10px] px-1.5">
                  {g.emails.length} email{g.emails.length === 1 ? "" : "s"}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {g.owners.length} known contact{g.owners.length === 1 ? "" : "s"}: {g.owners.slice(0, 3).map(o => o.name).join(", ")}
                  {g.owners.length > 3 && ` +${g.owners.length - 3}`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={(ev) => { ev.stopPropagation(); dismissAllFromDomain(g.domain); }}
                  disabled={busy === `dom:${g.domain}`}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Dismiss all
                </Button>
              </button>
              {isOpen && (
                <ul className="divide-y divide-border border-t border-border bg-secondary/10">
                  {g.emails.map((e) => (
                    <li key={e.id} className="px-3 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium truncate">{e.from_name || e.from_address}</span>
                        {e.from_name && (
                          <span className="text-xs text-muted-foreground truncate">&lt;{e.from_address}&gt;</span>
                        )}
                        <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">
                          {formatDistanceToNow(new Date(e.email_date), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-sm mt-0.5 truncate">{e.subject || "(no subject)"}</div>
                      {e.body_preview && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.body_preview}</div>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <OwnerPicker
                          owners={g.owners}
                          disabled={busy === e.id}
                          onPick={(leadId) => claim(e.id, leadId, e.from_address, e.from_name)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OwnerPicker({
  owners, disabled, onPick,
}: {
  owners: DomainOwner[];
  disabled: boolean;
  onPick: (leadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const leadOwners = owners.filter(o => o.kind === "lead");
  if (leadOwners.length === 0) {
    return (
      <span className="text-xs text-muted-foreground italic">
        Only client account contacts at this firm — no active lead to route to.
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={disabled}>
          <Link2 className="h-3 w-3 mr-1.5" />
          Route to lead at this firm
          <ChevronsUpDown className="h-3 w-3 ml-1.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search lead at this firm…" />
          <CommandList>
            <CommandEmpty>No leads here.</CommandEmpty>
            <CommandGroup>
              {leadOwners.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.name} ${o.company} ${o.id}`}
                  onSelect={() => { onPick(o.id); setOpen(false); }}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">{o.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{o.company}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-2 font-mono">{o.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
