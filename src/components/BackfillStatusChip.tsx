import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface ActiveJob {
  id: string;
  email_address: string;
  status: string;
  estimated_total: number;
  messages_discovered: number;
  messages_processed: number;
  target_window: string;
}

const ACTIVE_STATUSES = ["queued", "discovering", "running"];

export function BackfillStatusChip() {
  const [job, setJob] = useState<ActiveJob | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("email_backfill_jobs")
        .select("id, email_address, status, estimated_total, messages_discovered, messages_processed, target_window")
        .in("status", ACTIVE_STATUSES)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setJob((data as ActiveJob | null) ?? null);
    };

    // Initial cold-start load
    load();

    // Realtime: re-query on any change to email_backfill_jobs (insert/update/delete).
    // Cheap, event-driven, replaces 15s polling across all open tabs.
    const channel = supabase
      .channel("backfill-status-chip")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_backfill_jobs" },
        () => { if (!cancelled) load(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  if (!job) return null;

  const denom = Math.max(job.estimated_total || 0, job.messages_discovered || 0, 1);
  const pct = Math.min(100, Math.round((job.messages_processed / denom) * 100));
  const label = job.status === "discovering" && job.messages_processed === 0
    ? "Discovering…"
    : `Backfilling ${pct}%`;

  const onClick = () => {
    const params = new URLSearchParams(window.location.hash.replace("#", ""));
    params.set("sys", "crm");
    params.set("view", "settings");
    params.set("tab", "mailboxes");
    window.location.hash = params.toString();
  };

  return (
    <button
      onClick={onClick}
      title={`${job.email_address} · ${job.target_window} · ${job.messages_processed.toLocaleString()} / ${denom.toLocaleString()}`}
      className="flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-secondary/80 text-xs text-foreground hover:bg-secondary border border-border transition-colors"
    >
      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      <span className="font-medium">{label}</span>
      <span className="hidden md:inline text-muted-foreground truncate max-w-[140px]">· {job.email_address}</span>
    </button>
  );
}
