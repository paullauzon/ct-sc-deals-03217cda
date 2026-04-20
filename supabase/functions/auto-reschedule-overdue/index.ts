import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      return new Response(JSON.stringify({ rescheduled: 0, note: "No active leads" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Push all overdue pending tasks to today
    const { data, error } = await supabase
      .from("lead_tasks")
      .update({ due_date: todayStr })
      .eq("status", "pending")
      .lt("due_date", todayStr)
      .in("lead_id", ids)
      .select("id");
    if (error) throw error;

    const count = data?.length ?? 0;
    console.log(`[auto-reschedule-overdue] rescheduled ${count} task(s) to ${todayStr}`);
    return new Response(
      JSON.stringify({ rescheduled: count, due_date: todayStr }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("auto-reschedule-overdue error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
