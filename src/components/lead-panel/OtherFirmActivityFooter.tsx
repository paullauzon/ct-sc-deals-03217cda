// Round 9 — Disclosure footer for the EmailsSection.
// Surfaces three buckets that are NOT attributed to this deal but happen at
// the same firm: firm_unrelated colleagues, set-aside firm_activity emails,
// and noise (role_based) — so reps can see at a glance what's been routed
// elsewhere without leaving the deal.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Building2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface OtherFirmActivityFooterProps {
  leadId: string;
  firmDomain: string;
}

export function OtherFirmActivityFooter({ leadId, firmDomain }: OtherFirmActivityFooterProps) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<{ unrelated: number; setAside: number; noise: number } | null>(null);
  const [items, setItems] = useState<Array<{ id: string; from_address: string; subject: string; email_date: string; bucket: "unrelated" | "set_aside" | "noise" }>>([]);

  useEffect(() => {
    if (!firmDomain) return;
    let cancelled = false;
    (async () => {
      const ilikeDomain = `%@${firmDomain}`;
      const [unrelatedRes, setAsideRes, noiseRes] = await Promise.all([
        supabase
          .from("lead_emails")
          .select("id, from_address, subject, email_date", { count: "exact" })
          .eq("lead_id", "firm_unrelated")
          .ilike("from_address", ilikeDomain)
          .order("email_date", { ascending: false })
          .limit(20),
        supabase
          .from("firm_activity_emails")
          .select("email_id", { count: "exact", head: true })
          .eq("firm_domain", firmDomain),
        supabase
          .from("lead_emails")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", "role_based")
          .ilike("from_address", ilikeDomain),
      ]);
      if (cancelled) return;
      const unrelatedRows = (unrelatedRes.data || []) as any[];
      setCounts({
        unrelated: unrelatedRes.count ?? unrelatedRows.length,
        setAside: setAsideRes.count ?? 0,
        noise: noiseRes.count ?? 0,
      });
      setItems(unrelatedRows.map((r) => ({
        id: r.id,
        from_address: r.from_address || "",
        subject: r.subject || "",
        email_date: r.email_date,
        bucket: "unrelated" as const,
      })));
    })();
    return () => { cancelled = true; };
  }, [firmDomain, leadId]);

  if (!counts) return null;
  const total = counts.unrelated + counts.setAside + counts.noise;
  if (total === 0) return null;

  const promote = async (emailId: string, fromAddress: string) => {
    if (!window.confirm(`Promote ${fromAddress} to a stakeholder on this deal? Future emails from this address will be attributed here.`)) return;
    // Move the email + future overlap to this lead by adding the sender as a stakeholder
    const { error: insertErr } = await supabase.from("lead_stakeholders").insert({
      lead_id: leadId,
      email: fromAddress.toLowerCase().trim(),
      name: fromAddress.split("@")[0],
      role: "Promoted from firm-unrelated",
      sentiment: "neutral",
    });
    if (insertErr && !/duplicate/i.test(insertErr.message)) {
      console.error(insertErr);
      return;
    }
    // Reattribute the email itself
    await supabase.from("lead_emails").update({
      lead_id: leadId,
      classification_reason: `promoted_to_stakeholder:${leadId}`,
    }).eq("id", emailId);
    setItems(prev => prev.filter(i => i.id !== emailId));
    setCounts(c => c ? { ...c, unrelated: Math.max(0, c.unrelated - 1) } : c);
  };

  return (
    <div className="mt-3 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <Building2 className="h-3 w-3" />
        <span className="font-medium">Other firm activity:</span>
        <span>
          {counts.unrelated > 0 && `${counts.unrelated} unrelated colleague${counts.unrelated === 1 ? "" : "s"}`}
          {counts.unrelated > 0 && (counts.setAside > 0 || counts.noise > 0) && " · "}
          {counts.setAside > 0 && `${counts.setAside} set-aside`}
          {counts.setAside > 0 && counts.noise > 0 && " · "}
          {counts.noise > 0 && `${counts.noise} newsletter${counts.noise === 1 ? "" : "s"}`}
        </span>
        <ChevronDown className={cn("h-3 w-3 ml-auto transition-transform", open && "rotate-180")} />
      </button>
      {open && items.length > 0 && (
        <div className="mt-1 border border-border rounded-md divide-y divide-border bg-secondary/10">
          {items.map(item => (
            <div key={item.id} className="px-2 py-1.5 flex items-center gap-2 text-[11px]">
              <Inbox className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{item.from_address}</div>
                <div className="truncate text-muted-foreground">{item.subject || "(no subject)"}</div>
              </div>
              <button
                type="button"
                onClick={() => promote(item.id, item.from_address)}
                className="text-[10px] text-foreground hover:underline shrink-0"
              >
                Promote to stakeholder
              </button>
            </div>
          ))}
        </div>
      )}
      {open && items.length === 0 && counts.unrelated === 0 && (
        <div className="mt-1 px-2 py-1.5 text-[10px] text-muted-foreground">
          Other-firm context exists in different buckets — no unrelated-colleague messages to surface inline.
        </div>
      )}
    </div>
  );
}
