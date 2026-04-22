import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Sentiment = "positive" | "engaged" | "neutral" | "cooling" | "negative";

interface Reading {
  sentiment: Sentiment;
  headline: string;
  signals: string[];
}

const SENTIMENT_DOT: Record<Sentiment, string> = {
  positive: "bg-emerald-500",
  engaged: "bg-emerald-500",
  neutral: "bg-muted-foreground/40",
  cooling: "bg-amber-500",
  negative: "bg-destructive",
};

const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  engaged: "Engaged",
  neutral: "Neutral",
  cooling: "Cooling",
  negative: "Negative",
};

interface Props {
  emailId: string;
  subject?: string;
  body: string;
  direction: "inbound" | "outbound";
  fromName?: string;
  leadFirstName?: string;
  /** Avoid auto-firing AI on every render — only when message is expanded. */
  enabled?: boolean;
  className?: string;
}

const cache = new Map<string, Reading>();

/** Lightweight per-message AI reading. Caches by emailId for the session. */
export function MessageAiReading({
  emailId,
  subject,
  body,
  direction,
  fromName,
  leadFirstName,
  enabled = true,
  className,
}: Props) {
  const [reading, setReading] = useState<Reading | null>(() => cache.get(emailId) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || reading) return;
    if (!body && !subject) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("analyze-email-message", {
          body: { subject, body, direction, fromName, leadFirstName },
        });
        if (cancelled) return;
        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);
        const next: Reading = {
          sentiment: (data?.sentiment as Sentiment) || "neutral",
          headline: String(data?.headline || ""),
          signals: Array.isArray(data?.signals) ? data.signals : [],
        };
        cache.set(emailId, next);
        setReading(next);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "AI unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId, enabled]);

  if (!enabled) return null;

  if (loading && !reading) {
    return (
      <div className={cn("rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 flex items-center gap-2", className)}>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">AI reading…</span>
      </div>
    );
  }

  if (error && !reading) {
    return (
      <div className={cn("rounded-md border border-dashed border-border px-2.5 py-1 text-[10px] text-muted-foreground", className)}>
        AI reading unavailable
      </div>
    );
  }

  if (!reading || !reading.headline) return null;

  return (
    <div className={cn("rounded-md border border-border bg-secondary/40 px-2.5 py-1.5", className)}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Sparkles className="h-3 w-3 text-muted-foreground" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">AI reading</span>
        <span className={cn("h-1 w-1 rounded-full", SENTIMENT_DOT[reading.sentiment])} />
        <span className="text-[9px] font-medium text-muted-foreground">{SENTIMENT_LABEL[reading.sentiment]}</span>
      </div>
      <p className="text-[11px] text-foreground leading-snug mt-0.5">{reading.headline}</p>
      {reading.signals.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {reading.signals.map((s, i) => (
            <span key={`${s}-${i}`} className="text-[9px] px-1.5 py-0 rounded bg-secondary/80 text-muted-foreground">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
