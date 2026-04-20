// Global header chip showing live email-backfill progress across the whole app.
// Polls email_backfill_jobs every 15s for any active job and renders a compact
// monochrome pill. Hides itself when no active job. Click → jumps to Mailbox
// Settings so the user can pause/resume/cancel/widen the window.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DownloadCloud, Loader2 } from "lucide-react";

interface ActiveJob {
  id: string;
  email_address: string;
  status: string;
  estimated_total: number;
  messages_discovered: number;
  messages_processed: number;
  discovery_complete: boolean;
}

const ACTIVE_STATUSES = ["queued", "discovering", "running"];

export function BackfillStatusChip() {
  const [job, setJob] = useState<ActiveJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("email_backfill_jobs")
        .select("id, email_address, status, estimated_total, messages_discovered, messages_processed, discovery_complete")
        .in("status", ACTIVE_STATUSES)
        .order("started_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      setJob(((data || [])[0] as ActiveJob) || null);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const pct = useMemo(() => {
    if (!job) return 0;
    const total = Math.max(job.messages_discovered, job.estimated_total, 1);
    return Math.min(100, Math.round((job.messages_processed / total) * 100));
  }, [job]);

  if (!job) return null;

  const handleClick = () => {
    const params = new URLSearchParams(window.location.hash.replace("#", ""));
    params.set("view", "settings");
    params.set("sys", "crm");
    params.set("tab", "mailboxes");
    window.location.hash = params.toString();
  };

  const label = job.status === "discovering" || !job.discovery_complete
    ? `Discovering ${job.email_address}…`
    : `Backfilling ${pct}% · ${job.email_address}`;

  return (
    <button
      onClick={handleClick}
      title="Click to manage backfill in Mailbox Settings"
      className="hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-secondary/50 hover:bg-secondary text-[11px] text-muted-foreground hover:text-foreground transition-colors max-w-[280px]"
    >
      {job.status === "discovering" || !job.discovery_complete ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      ) : (
        <DownloadCloud className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
