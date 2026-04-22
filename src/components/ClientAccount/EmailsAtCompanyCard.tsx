// Phase 8 — Aggregates email threads across all leads/contacts at the same
// company domain. Mounted on the client account detail page. Surfaces a compact
// list of recent threads + per-contact engagement counts so multi-stakeholder
// deals don't lose context just because the GP hasn't been emailed directly yet.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Mail, ArrowUpRight, ArrowDownLeft, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  contactEmail: string;
  company: string;
}

interface CompanyEmail {
  id: string;
  lead_id: string;
  thread_id: string | null;
  direction: "inbound" | "outbound";
  from_address: string;
  to_addresses: string[] | null;
  subject: string | null;
  email_date: string;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  stage: string;
}

function domainOf(email: string): string {
  return (email || "").split("@")[1]?.toLowerCase().trim() || "";
}

export function EmailsAtCompanyCard({ contactEmail, company }: Props) {
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<CompanyEmail[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, Lead>>({});

  const domain = domainOf(contactEmail);

  useEffect(() => {
    if (!domain) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Find leads whose contact email shares the domain
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, email, stage")
        .ilike("email", `%@${domain}`)
        .limit(50);
      const leadList = (leads || []) as Lead[];
      const map: Record<string, Lead> = {};
      leadList.forEach(l => { map[l.id] = l; });

      if (leadList.length === 0) {
        if (!cancelled) { setEmails([]); setLeadMap({}); setLoading(false); }
        return;
      }

      const { data: emailRows } = await supabase
        .from("lead_emails")
        .select("id, lead_id, thread_id, direction, from_address, to_addresses, subject, email_date")
        .in("lead_id", leadList.map(l => l.id))
        .neq("send_status", "scheduled")
        .order("email_date", { ascending: false })
        .limit(50);

      if (!cancelled) {
        setEmails((emailRows || []) as CompanyEmail[]);
        setLeadMap(map);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [domain]);

  // Group by thread_id, take latest per thread
  const threads = useMemo(() => {
    const byThread = new Map<string, CompanyEmail[]>();
    for (const e of emails) {
      const key = e.thread_id || e.id;
      if (!byThread.has(key)) byThread.set(key, []);
      byThread.get(key)!.push(e);
    }
    return Array.from(byThread.entries())
      .map(([threadId, list]) => {
        const sorted = list.sort((a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime());
        return {
          threadId,
          latest: sorted[0],
          count: sorted.length,
          inbound: sorted.filter(e => e.direction === "inbound").length,
          outbound: sorted.filter(e => e.direction === "outbound").length,
        };
      })
      .sort((a, b) => new Date(b.latest.email_date).getTime() - new Date(a.latest.email_date).getTime())
      .slice(0, 8);
  }, [emails]);

  const contactCount = Object.keys(leadMap).length;

  if (!domain) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Mail className="h-3 w-3" />
          Emails across {company || "company"}
        </div>
        {contactCount > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {contactCount} contact{contactCount !== 1 ? "s" : ""} at @{domain}
          </span>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : threads.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic py-2">
          No emails recorded for any contact at @{domain} yet.
        </p>
      ) : (
        <div className="space-y-1">
          {threads.map(t => {
            const lead = leadMap[t.latest.lead_id];
            const Icon = t.latest.direction === "outbound" ? ArrowUpRight : ArrowDownLeft;
            const iconColor = t.latest.direction === "outbound"
              ? "text-blue-600 bg-blue-500/10"
              : "text-emerald-600 bg-emerald-500/10";
            return (
              <a
                key={t.threadId}
                href={lead ? `#view=pipeline&sys=crm&lead=${lead.id}&tab=emails` : "#"}
                className="block rounded-md border border-border hover:bg-secondary/40 transition-colors p-2"
              >
                <div className="flex items-start gap-2">
                  <div className={`rounded-full p-1 shrink-0 mt-0.5 ${iconColor}`}>
                    <Icon className="h-2.5 w-2.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-medium truncate">
                        {t.latest.subject || "(No subject)"}
                      </span>
                      {t.count > 1 && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{t.count}</Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {lead ? `${lead.name}` : t.latest.from_address}
                      {lead?.stage && <span className="ml-1">· {lead.stage}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(t.latest.email_date), { addSuffix: true })}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
