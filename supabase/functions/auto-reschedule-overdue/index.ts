import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronRun } from "../_shared/cron-log.ts";

const JOB_NAME = "auto-reschedule-overdue";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TERMINAL_STAGES = ["Lost", "Went Dark", "Closed Won", "Revisit/Reconnect"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Get active lead IDs
    const { data: activeLeads, error: leadsErr } = await supabase
      .from("leads")
      .select("id")
      .is("archived_at", null)
      .not("stage", "in", `(${TERMINAL_STAGES.join(",")})`);
    if (leadsErr) throw leadsErr;

    const ids = (activeLeads || []).map((l: any) => l.id);
    if (ids.length === 0) {
      await logCronRun(JOB_NAME, "noop", 0, { note: "No active leads" });
      return new Response(JSON.stringify({ rescheduled: 0, note: "No active leads" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Push overdue pending tasks to today — capped at 500/run, oldest first.
    // Subsequent ticks pick up the rest, so a 1000-task backlog can't time out a single run.
    const { data: overdue, error: selErr } = await supabase
      .from("lead_tasks")
      .select("id")
      .eq("status", "pending")
      .lt("due_date", todayStr)
      .in("lead_id", ids)
      .order("due_date", { ascending: true })
      .limit(500);
    if (selErr) throw selErr;

    const overdueIds = (overdue || []).map((t: any) => t.id);
    let data: any[] | null = [];
    if (overdueIds.length > 0) {
      const { data: updated, error } = await supabase
        .from("lead_tasks")
        .update({ due_date: todayStr })
        .in("id", overdueIds)
        .select("id");
      if (error) throw error;
      data = updated;
    }

    const count = data?.length ?? 0;
    console.log(`[auto-reschedule-overdue] rescheduled ${count} task(s) to ${todayStr}`);
    const status = count === 0 ? "noop" : "success";
    await logCronRun(JOB_NAME, status, count, { due_date: todayStr });
    return new Response(
      JSON.stringify({ rescheduled: count, due_date: todayStr }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("auto-reschedule-overdue error:", err);
    await logCronRun(JOB_NAME, "error", 0, {}, (err as Error).message);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
