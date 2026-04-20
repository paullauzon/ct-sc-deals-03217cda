// Shared logging helper for automation cron jobs.
// Guarantees a single row in `cron_run_log` per invocation regardless of
// outcome — including the "no-op" branch (status='noop') where nothing was
// processed but the job did fire. The Automation Health panel relies on these
// rows to decide whether a job is healthy, stale, or errored.
//
// All inserts swallow errors so logging failure never crashes a cron run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CronLogStatus = "success" | "error" | "noop";

export async function logCronRun(
  jobName: string,
  status: CronLogStatus,
  itemsProcessed: number,
  details: Record<string, unknown> = {},
  errorMessage = "",
): Promise<void> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.from("cron_run_log").insert({
      job_name: jobName,
      status,
      items_processed: itemsProcessed,
      details,
      error_message: errorMessage.slice(0, 500),
    });
  } catch {
    // Logging must never crash the caller.
  }
}
