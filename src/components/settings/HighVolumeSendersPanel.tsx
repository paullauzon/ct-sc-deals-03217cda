// Round 6 — surfaces senders that hit 50+ unmatched emails in the last 24h.
// These are almost always automated traffic (newsletters, monitoring tools,
// abuse) that should be added to the noise list before they pollute matching.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, Ban } from "lucide-react";
import { toast } from "sonner";

interface SenderRow {
  sender: string;
  domain: string;
  count: number;
}

const THRESHOLD = 50;
const PERSONAL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"]);

export function HighVolumeSendersPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rows, setRows] = useState<SenderRow[]>([]);

  const load = async () => {
    setLoading(true);
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("lead_emails")
      .select("from_address")
      .eq("lead_id", "unmatched")
      .gte("email_date", sinceIso)
      .limit(5000);

    const counts = new Map<string, number>();
    for (const r of (data || []) as Array<{ from_address: string }>) {
      const s = (r.from_address || "").toLowerCase().trim();
      if (!s) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    const list: SenderRow[] = [];
    for (const [sender, count] of counts) {
      if (count < THRESHOLD) continue;
      const domain = sender.split("@")[1] || "";
      if (PERSONAL.has(domain)) continue;
      list.push({ sender, domain, count });
    }
    list.sort((a, b) => b.count - a.count);
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addToNoise = async (domain: string) => {
    setBusy(domain);
    try {
      await supabase
        .from("email_noise_domains")
        .upsert({ domain, reason: `Auto-flagged: 50+ unmatched in 24h` }, { onConflict: "domain" });
      toast.success(`@${domain} added to noise list`);
      setRows((prev) => prev.filter((r) => r.domain !== domain));
    } catch (e: any) {
      toast.error(e.message || "Could not add to noise list");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning recent unmatched volume…
        </div>
      </div>
    );
  }

  if (rows.length === 0) return null; // hide entirely when clean

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">High-volume unmatched senders</span>
        <Badge variant="outline" className="h-5 text-[10px] px-1.5">{rows.length}</Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          50+ messages in last 24h — likely automated noise
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.sender} className="px-4 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.sender}</div>
              <div className="text-xs text-muted-foreground">
                {r.count} messages · @{r.domain}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={busy === r.domain}
              onClick={() => addToNoise(r.domain)}
            >
              {busy === r.domain ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <Ban className="h-3 w-3 mr-1.5" />
              )}
              Add @{r.domain} to noise
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
