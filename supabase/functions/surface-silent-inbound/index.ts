// Round 9 — Daily cron that surfaces "silent dropped ball" emails into the
// existing lead_tasks queue.
//
// Definition: an inbound email on an active, non-archived lead, aged 5–14
// days, with NO outbound message from the lead's owner since.
//
// Output: writes a row into `lead_tasks` with task_type='silent_inbound'
// (deduped per lead — only one open `silent_inbound` task at a time per
// lead). The Action Center / FollowUps tab already renders open tasks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { logCronRun } from "../_shared/cron-log.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let surfaced = 0;
  let scanned = 0;
  try {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString();

    // Pull recent inbound emails on real leads in the 5-14 day window
    const { data: inboundEmails } = await supabase
      .from("lead_emails")
      .select("lead_id, email_date, from_address, subject")
      .eq("direction", "inbound")
      .gte("email_date", fourteenDaysAgo)
      .lte("email_date", fiveDaysAgo)
      .neq("lead_id", "unmatched")
      .neq("lead_id", "role_based")
      .neq("lead_id", "auto_reply")
      .neq("lead_id", "firm_activity")
      .neq("lead_id", "firm_unrelated")
      .order("email_date", { ascending: false })
      .limit(2000);

    if (!inboundEmails || inboundEmails.length === 0) {
      await logCronRun("surface-silent-inbound", "noop", 0, { scanned: 0 });
      return new Response(JSON.stringify({ ok: true, surfaced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by lead — keep newest inbound per lead
    const newestInboundByLead = new Map<string, { email_date: string; from_address: string; subject: string }>();
    for (const e of inboundEmails as any[]) {
      const lid = e.lead_id;
      const existing = newestInboundByLead.get(lid);
      if (!existing || existing.email_date < e.email_date) {
        newestInboundByLead.set(lid, {
          email_date: e.email_date,
          from_address: e.from_address || "",
          subject: e.subject || "",
        });
      }
    }
    scanned = newestInboundByLead.size;

    // Filter out: leads that are archived OR have an outbound after the inbound
    const leadIds = Array.from(newestInboundByLead.keys());
    const { data: leadRows } = await supabase
      .from("leads")
      .select("id, name, company, archived_at, stage")
      .in("id", leadIds);
    const activeLeadById = new Map<string, any>();
    for (const l of (leadRows || [])) {
      if (l.archived_at) continue;
      if (l.stage === "Closed Won" || l.stage === "Closed Lost") continue;
      activeLeadById.set(l.id, l);
    }

    // Check outbound replies + existing open silent_inbound tasks
    const activeLeadIds = Array.from(activeLeadById.keys());
    if (activeLeadIds.length === 0) {
      await logCronRun("surface-silent-inbound", "noop", 0, { scanned });
      return new Response(JSON.stringify({ ok: true, surfaced: 0, scanned }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: outbounds } = await supabase
      .from("lead_emails")
      .select("lead_id, email_date")
      .eq("direction", "outbound")
      .in("lead_id", activeLeadIds)
      .gte("email_date", fourteenDaysAgo);
    const newestOutboundByLead = new Map<string, string>();
    for (const o of (outbounds || [])) {
      const existing = newestOutboundByLead.get(o.lead_id);
      if (!existing || existing < o.email_date) newestOutboundByLead.set(o.lead_id, o.email_date);
    }

    const { data: existingTasks } = await supabase
      .from("lead_tasks")
      .select("lead_id")
      .eq("task_type", "silent_inbound")
      .neq("status", "done")
      .in("lead_id", activeLeadIds);
    const leadsWithOpenTask = new Set<string>((existingTasks || []).map((t: any) => t.lead_id));

    const today = new Date().toISOString().slice(0, 10);
    const tasksToInsert: any[] = [];
    for (const [leadId, newest] of newestInboundByLead.entries()) {
      const lead = activeLeadById.get(leadId);
      if (!lead) continue;
      if (leadsWithOpenTask.has(leadId)) continue;
      const lastOutbound = newestOutboundByLead.get(leadId);
      if (lastOutbound && lastOutbound > newest.email_date) continue;
      const ageDays = Math.floor((now.getTime() - new Date(newest.email_date).getTime()) / 86400000);
      tasksToInsert.push({
        lead_id: leadId,
        task_type: "silent_inbound",
        playbook: "silent_inbound",
        sequence_order: 0,
        title: `Reply pending — ${ageDays} days quiet`,
        description: `Inbound from ${newest.from_address}: "${(newest.subject || "").slice(0, 80)}"`,
        due_date: today,
        status: "pending",
      });
    }

    if (tasksToInsert.length > 0) {
      // Insert in chunks of 100
      for (let i = 0; i < tasksToInsert.length; i += 100) {
        const batch = tasksToInsert.slice(i, i + 100);
        await supabase.from("lead_tasks").insert(batch);
        surfaced += batch.length;
      }
    }

    await logCronRun("surface-silent-inbound", "success", surfaced, { scanned });
    return new Response(JSON.stringify({ ok: true, surfaced, scanned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logCronRun("surface-silent-inbound", "error", surfaced, { scanned }, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
