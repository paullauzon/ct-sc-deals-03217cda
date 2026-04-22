// Right-rail card on every active deal-room. Surfaces TWO classes of context
// that aren't attributed to this specific deal but happen at the same firm:
//   1. Emails set aside as "firm activity" by a rep from the Company Inbox
//      (lead_id flipped to the 'firm_activity' sentinel + a row in firm_activity_emails).
//   2. Emails on OTHER active deals at the same firm domain — so a rep working
//      CT-004 sees that CT-026 also has 4 active threads at this same company.
// Read-only by design: this is context, not an action surface. Clicking other-deal
// items jumps to that deal-room.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, ArrowUpRight, ExternalLink, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FirmActivityRow {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  body_preview: string | null;
  email_date: string;
  set_aside_note: string;
}

interface OtherDealThread {
  thread_id: string;
  subject: string | null;
  lead_id: string;
  lead_name: string;
  lead_stage: string;
  last_email_at: string;
  msg_count: number;
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "me.com", "live.com", "ymail.com", "msn.com",
  "protonmail.com", "proton.me", "googlemail.com", "mail.com",
]);

function domainOf(email: string): string {
  return (email || "").split("@")[1]?.toLowerCase().trim() || "";
}

export function FirmActivityCard({ lead }: { lead: Lead }) {
  const firmDomain = useMemo(() => domainOf(lead.email || ""), [lead.email]);
  const [loading, setLoading] = useState(true);
  const [firmEmails, setFirmEmails] = useState<FirmActivityRow[]>([]);
  const [otherDealThreads, setOtherDealThreads] = useState<OtherDealThread[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!firmDomain || PERSONAL_DOMAINS.has(firmDomain)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // 1. Firm-activity emails for this domain
      const { data: fa } = await supabase
        .from("firm_activity_emails")
        .select("email_id, note")
        .eq("firm_domain", firmDomain)
        .limit(200);
      const emailIds = (fa || []).map((r: any) => r.email_id).filter(Boolean);
      const noteByEmail = new Map<string, string>();
      for (const r of (fa || []) as any[]) noteByEmail.set(r.email_id, r.note || "");

      let firmRows: FirmActivityRow[] = [];
      if (emailIds.length > 0) {
        const { data: emails } = await supabase
          .from("lead_emails")
          .select("id, from_address, from_name, subject, body_preview, email_date")
          .in("id", emailIds)
          .order("email_date", { ascending: false });
        firmRows = (emails || []).map((e: any) => ({
          id: e.id,
          from_address: e.from_address,
          from_name: e.from_name,
          subject: e.subject,
          body_preview: e.body_preview,
          email_date: e.email_date,
          set_aside_note: noteByEmail.get(e.id) || "",
        }));
      }

      // 2. Other active deals at the same firm domain (excluding self)
      const { data: siblings } = await supabase
        .from("leads")
        .select("id, name, email, stage")
        .ilike("email", `%@${firmDomain}`)
        .is("archived_at", null)
        .eq("is_duplicate", false)
        .neq("id", lead.id)
        .limit(50);

      const siblingIds = (siblings || []).map((s: any) => s.id);
      let threads: OtherDealThread[] = [];
      if (siblingIds.length > 0) {
        const { data: theirEmails } = await supabase
          .from("lead_emails")
          .select("thread_id, subject, lead_id, email_date")
          .in("lead_id", siblingIds)
          .neq("thread_id", "")
          .order("email_date", { ascending: false })
          .limit(500);

        const byThread = new Map<string, { subject: string | null; lead_id: string; last: string; count: number }>();
        for (const e of (theirEmails || []) as any[]) {
          if (!e.thread_id) continue;
          const cur = byThread.get(e.thread_id);
          if (cur) {
            cur.count += 1;
            if (e.email_date > cur.last) {
              cur.last = e.email_date;
              cur.subject = e.subject ?? cur.subject;
            }
          } else {
            byThread.set(e.thread_id, { subject: e.subject, lead_id: e.lead_id, last: e.email_date, count: 1 });
          }
        }
        const sibById = new Map<string, { name: string; stage: string }>();
        for (const s of (siblings || []) as any[]) sibById.set(s.id, { name: s.name || s.email || s.id, stage: s.stage || "" });
        threads = Array.from(byThread.entries()).map(([thread_id, v]) => ({
          thread_id,
          subject: v.subject,
          lead_id: v.lead_id,
          lead_name: sibById.get(v.lead_id)?.name || v.lead_id,
          lead_stage: sibById.get(v.lead_id)?.stage || "",
          last_email_at: v.last,
          msg_count: v.count,
        })).sort((a, b) => b.last_email_at.localeCompare(a.last_email_at)).slice(0, 25);
      }

      if (cancelled) return;
      setFirmEmails(firmRows);
      setOtherDealThreads(threads);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [firmDomain, lead.id]);

  if (!firmDomain || PERSONAL_DOMAINS.has(firmDomain)) return null;
  if (loading) return null;
  const totalCount = firmEmails.length + otherDealThreads.length;
  if (totalCount === 0) return null;

  return (
    <>
      <CollapsibleCard
        id="firm-activity-card"
        title={`Firm activity at @${firmDomain}`}
        icon={<Building2 className="h-3.5 w-3.5" />}
        defaultOpen={false}
        rightSlot={<Badge variant="outline" className="h-5 text-[10px] px-1.5">{totalCount}</Badge>}
      >
        <div className="space-y-2">
          {firmEmails.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {firmEmails.length} email{firmEmails.length === 1 ? "" : "s"} set aside as firm-wide context (not on this deal).
            </div>
          )}
          {otherDealThreads.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {otherDealThreads.length} active thread{otherDealThreads.length === 1 ? "" : "s"} on other deals at this firm.
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs w-full"
            onClick={() => setOpen(true)}
          >
            View all firm activity
            <ExternalLink className="h-3 w-3 ml-1.5" />
          </Button>
        </div>
      </CollapsibleCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Firm activity at @{firmDomain}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] -mx-1 px-1">
            <div className="space-y-4">
              {otherDealThreads.length > 0 && (
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Other active deals at this firm
                  </h4>
                  <ul className="space-y-1.5">
                    {otherDealThreads.map((t) => (
                      <li key={t.thread_id} className="border border-border rounded-md px-3 py-2 hover:bg-secondary/30">
                        <button
                          type="button"
                          onClick={() => window.open(`/deal/${t.lead_id}`, "_blank", "noopener,noreferrer")}
                          className="w-full text-left flex items-start gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">{t.subject || "(no subject)"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant="secondary" className="h-4 text-[9px] px-1 font-normal">
                                {t.lead_name}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">{t.lead_id}</span>
                              {t.lead_stage && <span className="text-[10px] text-muted-foreground">· {t.lead_stage}</span>}
                              <span className="text-[10px] text-muted-foreground">· {t.msg_count} msg</span>
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {formatDistanceToNow(new Date(t.last_email_at), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <ArrowUpRight className="h-3 w-3 text-muted-foreground/60 mt-0.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {firmEmails.length > 0 && (
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Set aside as firm activity
                  </h4>
                  <ul className="space-y-1.5">
                    {firmEmails.map((e) => (
                      <li key={e.id} className="border border-border rounded-md px-3 py-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium truncate">{e.from_name || e.from_address}</span>
                          {e.from_name && <span className="text-xs text-muted-foreground truncate">&lt;{e.from_address}&gt;</span>}
                          <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">
                            {formatDistanceToNow(new Date(e.email_date), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="text-sm mt-0.5 truncate">{e.subject || "(no subject)"}</div>
                        {e.body_preview && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.body_preview}</div>
                        )}
                        {e.set_aside_note && (
                          <div className="text-[11px] text-muted-foreground italic mt-1">Note: {e.set_aside_note}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
