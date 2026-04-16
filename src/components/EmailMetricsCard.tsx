import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Mail, ArrowUpRight, ArrowDownLeft, Reply, MousePointerClick, Eye, AlertTriangle } from "lucide-react";

interface Metrics {
  total_sent: number;
  total_received: number;
  total_opens: number;
  total_clicks: number;
  total_replies: number;
  total_bounces: number;
  last_sent_date: string | null;
  last_received_date: string | null;
  last_replied_date: string | null;
  email_quarantined: boolean;
  unsubscribed_all: boolean;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  const days = Math.floor((Date.now() - dt.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function EmailMetricsCard({ leadId }: { leadId: string }) {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lead_email_metrics" as any)
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (!cancelled) {
        setM((data as unknown as Metrics) || null);
        setLoading(false);
      }
    })();

    const ch = supabase
      .channel(`metrics-${leadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_email_metrics", filter: `lead_id=eq.${leadId}` },
        (p) => setM(p.new as unknown as Metrics)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [leadId]);

  if (loading || !m) return null;

  const replyRate = m.total_sent > 0 ? Math.round((m.total_replies / m.total_sent) * 100) : 0;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Mail className="h-3 w-3" />
        Email Activity
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat icon={<ArrowUpRight className="h-3 w-3" />} label="Sent" value={m.total_sent} sub={`Last: ${fmt(m.last_sent_date)}`} />
        <Stat icon={<ArrowDownLeft className="h-3 w-3" />} label="Received" value={m.total_received} sub={`Last: ${fmt(m.last_received_date)}`} />
        <Stat icon={<Reply className="h-3 w-3" />} label="Replies" value={m.total_replies} sub={`${replyRate}% rate`} />
        <Stat icon={<Eye className="h-3 w-3" />} label="Opens" value={m.total_opens} />
      </div>
      {(m.email_quarantined || m.unsubscribed_all || m.total_bounces > 0) && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t pt-2">
          <AlertTriangle className="h-3 w-3" />
          {m.email_quarantined && <span>Quarantined</span>}
          {m.unsubscribed_all && <span>Unsubscribed</span>}
          {m.total_bounces > 0 && <span>{m.total_bounces} bounce{m.total_bounces > 1 ? "s" : ""}</span>}
        </div>
      )}
    </Card>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
    </div>
  );
}
