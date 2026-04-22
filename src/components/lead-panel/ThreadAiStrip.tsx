import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, PenSquare, Loader2, BookmarkPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ReplyPrefill } from "@/components/EmailsSection";

interface ThreadIntel {
  thread_id: string;
  lead_id: string;
  summary: string;
  sentiment: "positive" | "engaged" | "neutral" | "cooling" | "negative";
  recommended_action: string;
  recommended_subject: string;
  recommended_body: string;
  suggested_sequence_step: string;
  hot_flag: boolean;
  signal_tags: string[];
  email_count: number;
  last_email_at: string;
  generated_at: string;
}

interface Props {
  threadId: string;
  leadId: string;
  /** Used to invalidate cache when new messages land. */
  threadEmailCount: number;
  threadLatestDate: string;
  /** When provided, "Draft this" prefills the composer with the AI suggestion. */
  onUseDraft?: (prefill: ReplyPrefill & { body?: string }) => void;
  /** Top inbound to attach to the prefill (for thread_id / in_reply_to) */
  replyAnchor?: { to?: string; subject?: string; thread_id?: string; in_reply_to?: string };
}

const SENTIMENT_DOT: Record<ThreadIntel["sentiment"], string> = {
  positive: "bg-emerald-500",
  engaged: "bg-emerald-500",
  neutral: "bg-muted-foreground/40",
  cooling: "bg-amber-500",
  negative: "bg-destructive",
};

const SENTIMENT_LABEL: Record<ThreadIntel["sentiment"], string> = {
  positive: "Positive",
  engaged: "Engaged",
  neutral: "Neutral",
  cooling: "Cooling",
  negative: "Negative",
};

export function ThreadAiStrip({ threadId, leadId, threadEmailCount, threadLatestDate, onUseDraft, replyAnchor }: Props) {
  const [intel, setIntel] = useState<ThreadIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStale = useCallback((row: ThreadIntel | null): boolean => {
    if (!row) return true;
    if (row.email_count !== threadEmailCount) return true;
    if (row.last_email_at && threadLatestDate && new Date(row.last_email_at) < new Date(threadLatestDate)) return true;
    const ageHours = (Date.now() - new Date(row.generated_at).getTime()) / 3600_000;
    return ageHours > 24;
  }, [threadEmailCount, threadLatestDate]);

  const generate = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-email-thread", {
        body: { threadId, leadId, force },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      if (data?.intelligence) setIntel(data.intelligence as ThreadIntel);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to analyze";
      setError(msg);
      if (/credits/i.test(msg)) toast.error("AI credits exhausted", { description: "Add credits in Settings → Workspace → Usage." });
      else if (/rate/i.test(msg)) toast.warning("Rate limited", { description: "Try again in a moment." });
    } finally {
      setLoading(false);
    }
  }, [threadId, leadId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("email_thread_intelligence" as never)
        .select("*")
        .eq("thread_id", threadId)
        .maybeSingle();
      if (cancelled) return;
      const row = (data as ThreadIntel | null);
      setIntel(row);
      if (isStale(row)) {
        // Auto-generate on first view if stale/missing
        generate(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const handleDraft = () => {
    if (!intel || !onUseDraft) return;
    onUseDraft({
      ...replyAnchor,
      subject: intel.recommended_subject || replyAnchor?.subject,
      body: intel.recommended_body,
    });
  };

  const sendToIntelligence = async () => {
    if (!intel) return;
    try {
      const { error } = await (supabase as never as { from: (t: string) => { insert: (v: unknown) => Promise<{ error: unknown }> } })
        .from("lead_intelligence_notes")
        .insert({
          lead_id: leadId,
          source: "email_thread",
          source_ref: threadId,
          title: `Thread snapshot · ${new Date().toLocaleDateString()}`,
          body: `**Summary:** ${intel.summary}\n\n**Recommended:** ${intel.recommended_action || "none"}\n\n**Sentiment:** ${intel.sentiment} · ${intel.email_count} email${intel.email_count !== 1 ? "s" : ""}`,
          signal_tags: intel.signal_tags || [],
        });
      if (error) throw error as Error;
      toast.success("Saved to Intelligence tab");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    }
  };

  // Skeleton on first load
  if (!intel && loading) {
    return (
      <div className="rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Analyzing thread…</span>
      </div>
    );
  }

  if (!intel && !loading) {
    return (
      <div className="rounded-md border border-dashed border-border px-2.5 py-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" /> AI thread analysis
          {error ? <span className="text-destructive">· {error}</span> : null}
        </span>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => generate(true)}>
          <RefreshCw className="h-3 w-3" /> Generate
        </Button>
      </div>
    );
  }

  if (!intel) return null;

  const stale = isStale(intel);

  return (
    <div className={cn(
      "rounded-md border px-2.5 py-2 flex items-start gap-2",
      "border-border bg-gradient-to-r from-secondary/50 via-background to-background",
    )}>
      <div className="h-5 w-5 rounded-full shrink-0 flex items-center justify-center bg-foreground/5 text-foreground/80 mt-0.5">
        <Sparkles className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">AI reading</span>
          <span className={cn("h-1 w-1 rounded-full", SENTIMENT_DOT[intel.sentiment])} />
          <span className="text-[9px] font-medium text-muted-foreground">{SENTIMENT_LABEL[intel.sentiment]}</span>
          {intel.suggested_sequence_step && (
            <span className="text-[9px] font-mono px-1 py-0 rounded bg-secondary text-muted-foreground">
              {intel.suggested_sequence_step}
            </span>
          )}
          {stale && (
            <span className="text-[9px] text-muted-foreground/70 italic">· refreshing…</span>
          )}
        </div>
        <p className="text-[12px] text-foreground leading-snug mt-0.5">{intel.summary}</p>
        {intel.recommended_action && (
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            <span className="font-medium text-foreground/80">Next: </span>{intel.recommended_action}
          </p>
        )}
        {intel.signal_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {intel.signal_tags.map((t) => (
              <span key={t} className="text-[9px] px-1.5 py-0 rounded bg-secondary/70 text-muted-foreground">{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onUseDraft && intel.recommended_body && (
          <Button size="sm" variant="default" className="h-7 text-[11px] gap-1.5" onClick={handleDraft}>
            <PenSquare className="h-3 w-3" /> Draft
          </Button>
        )}
        <Button
          size="sm" variant="ghost" className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={sendToIntelligence}
          title="Save thread snapshot to Intelligence tab"
        >
          <BookmarkPlus className="h-3 w-3" />
          Save
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => generate(true)}
          disabled={loading}
          title="Regenerate"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}
