// Phase 6 — AI Learning settings tab.
// Renders the firm-type × stage × purpose pattern board so the user can see
// which approach the AI is biasing toward and why.
import { useEffect, useState } from "react";
import { fetchComposePatterns, type PatternRow } from "@/lib/composeLearning";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const APPROACH_LABEL: Record<string, string> = {
  direct: "Direct ask",
  data_led: "Proof-led",
  question_led: "Open question",
};

export function AILearningPanel() {
  const [rows, setRows] = useState<PatternRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchComposePatterns();
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Group by brand × stage × purpose so we can show the winning approach
  type Group = { brand: string; stage: string; purpose: string; rows: PatternRow[] };
  const groups: Group[] = [];
  const seen = new Map<string, Group>();
  for (const r of rows) {
    const k = `${r.brand}|${r.stage}|${r.purpose}`;
    let g = seen.get(k);
    if (!g) { g = { brand: r.brand, stage: r.stage, purpose: r.purpose, rows: [] }; seen.set(k, g); groups.push(g); }
    g.rows.push(r);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            AI Learning
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Patterns the AI has learned from your past compose actions. Used to bias the "Recommended" draft for future emails.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-8 text-center">Loading patterns…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-secondary/20 p-6 text-center">
          <div className="text-sm font-medium">No patterns yet</div>
          <p className="text-xs text-muted-foreground mt-1">
            Patterns appear after ~5 sends per brand × stage × approach. Keep using AI drafts.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Brand</th>
                <th className="text-left px-3 py-2 font-medium">Stage</th>
                <th className="text-left px-3 py-2 font-medium">Purpose</th>
                <th className="text-left px-3 py-2 font-medium">Winning approach</th>
                <th className="text-right px-3 py-2 font-medium">Pick rate</th>
                <th className="text-right px-3 py-2 font-medium">Reply rate</th>
                <th className="text-right px-3 py-2 font-medium">Avg edit</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => {
                const winner = g.rows.slice().sort((a, b) => b.replyRate - a.replyRate || b.pickRate - a.pickRate)[0];
                return (
                  <tr key={gi} className={cn("border-t border-border", gi % 2 === 1 && "bg-secondary/20")}>
                    <td className="px-3 py-2">{g.brand}</td>
                    <td className="px-3 py-2">{g.stage}</td>
                    <td className="px-3 py-2 capitalize">{g.purpose.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {APPROACH_LABEL[winner.approach] || winner.approach}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{winner.pickRate}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {winner.replyRate > 0 ? `${winner.replyRate}%` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {winner.meanEditPct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground border-t border-border pt-3 space-y-1">
        <p><span className="font-medium">Pick rate</span> — how often this approach is chosen when offered.</p>
        <p><span className="font-medium">Reply rate</span> — how often emails using this approach get a reply within 7 days.</p>
        <p><span className="font-medium">Avg edit</span> — how much you typically edit before sending. Lower means the AI got it right.</p>
        <p>Sensitive emails marked "Don't train" are excluded from these stats.</p>
      </div>
    </div>
  );
}
