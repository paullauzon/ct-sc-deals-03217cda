// Noise-rules manager — lets a rep one-click "always classify @domain as noise"
// for sender domains that flood the unmatched bucket. Reads from + writes to
// `email_noise_domains`. Surfaces the top unmatched domains so a rep can prune
// without leaving the screen.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface NoiseRule {
  domain: string;
  reason: string;
  created_at: string;
}

interface TopDomain {
  domain: string;
  count: number;
}

const PERSONAL_AND_INTERNAL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "me.com", "live.com", "ymail.com", "msn.com", "protonmail.com",
  "proton.me", "googlemail.com", "mail.com",
  "captarget.com", "sourcecodeals.com",
]);

export function NoiseRulesPanel() {
  const [rules, setRules] = useState<NoiseRule[]>([]);
  const [topDomains, setTopDomains] = useState<TopDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [draftDomain, setDraftDomain] = useState("");
  const [draftReason, setDraftReason] = useState("");

  const load = async () => {
    setLoading(true);
    const [rulesRes, sampleRes] = await Promise.all([
      supabase
        .from("email_noise_domains")
        .select("domain, reason, created_at")
        .order("created_at", { ascending: false }),
      // Sample up to 5000 unmatched emails to compute top domains client-side
      supabase
        .from("lead_emails")
        .select("from_address")
        .eq("lead_id", "unmatched")
        .order("email_date", { ascending: false })
        .limit(5000),
    ]);

    setRules((rulesRes.data || []) as NoiseRule[]);

    const knownDomains = new Set(((rulesRes.data || []) as NoiseRule[]).map(r => r.domain.toLowerCase()));
    const counts = new Map<string, number>();
    for (const row of (sampleRes.data || []) as Array<{ from_address: string }>) {
      const d = (row.from_address || "").split("@")[1]?.toLowerCase().trim();
      if (!d || PERSONAL_AND_INTERNAL.has(d) || knownDomains.has(d)) continue;
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    const top = [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    setTopDomains(top);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addRule = async (domain: string, reason: string) => {
    const cleaned = domain.toLowerCase().trim().replace(/^@/, "");
    if (!cleaned || !cleaned.includes(".")) {
      toast.error("Enter a valid domain (e.g., example.com)");
      return;
    }
    if (PERSONAL_AND_INTERNAL.has(cleaned)) {
      toast.error("Personal/internal domains are filtered separately — no rule needed");
      return;
    }
    setAdding(cleaned);
    const { error } = await supabase
      .from("email_noise_domains")
      .insert({ domain: cleaned, reason: reason.trim() });
    setAdding(null);
    if (error) {
      toast.error(error.code === "23505" ? "Already classified as noise" : error.message);
      return;
    }
    toast.success(`@${cleaned} will now be auto-classified as noise`);
    setDraftDomain("");
    setDraftReason("");
    load();
  };

  const removeRule = async (domain: string) => {
    if (!window.confirm(`Stop treating @${domain} as noise? Future emails from this domain will return to the unmatched inbox.`)) return;
    const { error } = await supabase
      .from("email_noise_domains")
      .delete()
      .eq("domain", domain);
    if (error) { toast.error(error.message); return; }
    toast.success(`Removed @${domain} from noise list`);
    load();
  };

  const ruleCount = rules.length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">Noise rules</div>
          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            Sender domains in this list are auto-classified as noise — emails from them never enter the unmatched inbox, and stale rows are purged after 60 days.
          </div>
        </div>
        <Badge variant="outline" className="ml-auto h-5 text-[10px] px-1.5">
          {ruleCount} rule{ruleCount === 1 ? "" : "s"}
        </Badge>
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
          Loading noise rules…
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {topDomains.length > 0 && (
            <div>
              <div className="text-xs font-medium text-foreground mb-2">
                Top unrouted sender domains right now
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">
                Click to add a one-click rule — emails from this domain will be classified as noise from now on.
              </div>
              <ul className="space-y-1">
                {topDomains.map((td) => (
                  <li key={td.domain} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs">@{td.domain}</span>
                    <Badge variant="outline" className="h-5 text-[10px] px-1.5">
                      {td.count.toLocaleString()} unmatched
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 text-xs"
                      disabled={adding === td.domain}
                      onClick={() => addRule(td.domain, `Auto-added from top unmatched sample (${td.count} emails)`)}
                    >
                      {adding === td.domain ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                      Mark as noise
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <div className="text-xs font-medium text-foreground mb-2">Add a custom rule</div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={draftDomain}
                onChange={(e) => setDraftDomain(e.target.value)}
                placeholder="example.com"
                className="h-8 text-xs flex-1 min-w-[180px] max-w-[260px]"
              />
              <Input
                value={draftReason}
                onChange={(e) => setDraftReason(e.target.value)}
                placeholder="Reason (optional)"
                className="h-8 text-xs flex-1 min-w-[180px]"
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={adding !== null || !draftDomain.trim()}
                onClick={() => addRule(draftDomain, draftReason)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add rule
              </Button>
            </div>
          </div>

          {rules.length > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="text-xs font-medium text-foreground mb-2">Active rules</div>
              <ul className="space-y-1">
                {rules.map((r) => (
                  <li key={r.domain} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs">@{r.domain}</span>
                    {r.reason && <span className="text-[11px] text-muted-foreground truncate">— {r.reason}</span>}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => removeRule(r.domain)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
