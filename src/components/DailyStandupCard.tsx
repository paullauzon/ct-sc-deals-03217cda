import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw, Loader2, ArrowRight, AlertTriangle, Trophy, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface StandupData {
  headline?: string;
  touchToday?: { leadId: string; leadName: string; action: string; reason: string }[];
  risks?: { leadId: string; leadName: string; risk: string; recommended: string }[];
  wins?: { leadName: string; why: string }[];
}

const CACHE_KEY = "daily-standup-cache";
const CACHE_HOURS = 4;

export function DailyStandupCard() {
  const navigate = useNavigate();
  const [standup, setStandup] = useState<StandupData | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const ageH = (Date.now() - new Date(parsed.generatedAt).getTime()) / 3600000;
          if (ageH < CACHE_HOURS) {
            setStandup(parsed.standup); setGeneratedAt(parsed.generatedAt);
            return;
          }
        }
      } catch {}
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-standup", { body: {} });
      if (error) throw error;
      if (data?.standup) {
        setStandup(data.standup); setGeneratedAt(data.generatedAt);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      }
    } catch (e: any) {
      toast.error(e.message || "Couldn't generate standup");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const openLead = (id: string) => navigate(`/deal/${id}`);

  return (
    <div className="border border-border rounded-lg bg-background overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          <h2 className="text-xs font-semibold uppercase tracking-wider">Today's standup</h2>
          {generatedAt && (
            <span className="text-[10px] text-muted-foreground">
              · {(() => { try { const m = Math.floor((Date.now() - new Date(generatedAt).getTime()) / 60000); return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`; } catch { return ""; }})()}
            </span>
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
          title="Regenerate"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {loading && !standup && (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Briefing the day…
        </div>
      )}

      {standup && (
        <div className="divide-y divide-border">
          {standup.headline && (
            <div className="px-4 py-2.5 text-xs font-medium text-foreground/90 bg-secondary/40">
              {standup.headline}
            </div>
          )}

          {standup.touchToday && standup.touchToday.length > 0 && (
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Touch today
              </div>
              <ul className="space-y-2">
                {standup.touchToday.map((t, i) => (
                  <li key={i} className="group">
                    <button
                      onClick={() => openLead(t.leadId)}
                      className="w-full text-left flex items-start gap-2 hover:bg-secondary/40 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                    >
                      <ArrowRight className="h-3 w-3 mt-0.5 text-muted-foreground group-hover:text-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{t.leadName}</div>
                        <div className="text-[11px] text-foreground/80 leading-snug">{t.action}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{t.reason}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {standup.risks && standup.risks.length > 0 && (
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> At risk
              </div>
              <ul className="space-y-2">
                {standup.risks.map((r, i) => (
                  <li key={i}>
                    <button
                      onClick={() => openLead(r.leadId)}
                      className="w-full text-left flex items-start gap-2 hover:bg-secondary/40 rounded px-1.5 py-1 -mx-1.5 transition-colors group"
                    >
                      <ArrowRight className="h-3 w-3 mt-0.5 text-muted-foreground group-hover:text-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{r.leadName}</div>
                        <div className="text-[11px] text-foreground/80 leading-snug">{r.risk}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">→ {r.recommended}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {standup.wins && standup.wins.length > 0 && (
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                <Trophy className="h-3 w-3" /> Wins
              </div>
              <ul className="space-y-1.5">
                {standup.wins.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="font-medium text-foreground truncate">{w.leadName}</span>
                    <span className="text-muted-foreground leading-snug">— {w.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!loading && !standup && (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No standup yet. Click Refresh to generate.
        </div>
      )}
    </div>
  );
}
