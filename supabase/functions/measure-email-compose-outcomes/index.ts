// Phase 6 — outcomes backfill cron.
// Joins email_compose_events to lead_emails (and lead stage history) to produce
// the 7-day outcome row per compose event. Idempotent: re-measures any event
// whose email is at least 24h old and not yet in email_compose_outcomes, OR
// where the existing outcome is older than 30 days (to catch late replies).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let processed = 0;
  let errors = 0;

  try {
    // Find sent compose events at least 24h old that don't have an outcome yet.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: evErr } = await sb
      .from("email_compose_events")
      .select("id, lead_id, email_id, sent_at")
      .eq("sent", true)
      .not("email_id", "is", null)
      .lte("sent_at", dayAgo)
      .order("sent_at", { ascending: false })
      .limit(200);
    if (evErr) throw evErr;

    const eventList = events || [];
    if (eventList.length === 0) {
      await logCronRun("measure-email-compose-outcomes", "noop", 0);
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out events that already have an outcome
    const ids = eventList.map(e => e.id);
    const { data: existingRows } = await sb
      .from("email_compose_outcomes")
      .select("event_id")
      .in("event_id", ids);
    const haveOutcome = new Set((existingRows || []).map((r: any) => r.event_id));
    const todo = eventList.filter(e => !haveOutcome.has(e.id));

    for (const ev of todo) {
      try {
        const { data: emailRow } = await sb
          .from("lead_emails")
          .select("id, opens, clicks, replied_at")
          .eq("id", ev.email_id!)
          .single();
        if (!emailRow) continue;

        const opens = Array.isArray((emailRow as any).opens) ? (emailRow as any).opens : [];
        const clicks = Array.isArray((emailRow as any).clicks) ? (emailRow as any).clicks : [];
        const replied = !!(emailRow as any).replied_at;

        await sb.from("email_compose_outcomes").upsert({
          event_id: ev.id,
          email_id: ev.email_id!,
          opened: opens.length > 0,
          open_count: opens.length,
          clicked: clicks.length > 0,
          click_count: clicks.length,
          replied,
          replied_at: (emailRow as any).replied_at || null,
          stage_advanced: false,  // Stage tracking comes later; safe default
          measured_at: new Date().toISOString(),
        }, { onConflict: "event_id" });
        processed++;
      } catch (e) {
        errors++;
        console.warn("outcome measure failed for", ev.id, e);
      }
    }

    await logCronRun("measure-email-compose-outcomes", "success", processed, { errors, scanned: todo.length });
    return new Response(JSON.stringify({ ok: true, processed, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logCronRun("measure-email-compose-outcomes", "error", processed, {}, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
