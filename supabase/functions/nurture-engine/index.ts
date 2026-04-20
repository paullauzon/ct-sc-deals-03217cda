// nurture-engine — daily cron driving the 90-day post-loss nurture sequence.
//
// Triggered by pg_cron once per day. For every Closed Lost lead with
// nurture_sequence_status = 'active', emits drafts/tasks at the right milestones:
//   d0  → "Send insight email" (queued in lead_drafts, manual approve)
//   d30 → "Send market update" (queued draft)
//   d45 → "Manual call task" (lead_tasks)
//   d90 → "Re-open ask + decision" task (lead_tasks)
// On d90, the cron flips status to 'completed' so it stops firing. If a reply
// comes in (via lead_email_metrics last_received_date > nurture_started_at),
// status becomes 're_engaged' and the deal is moved back to "In Contact".
//
// Idempotent: each milestone task uses a deterministic playbook key (e.g.
// "nurture-d0", "nurture-d30") + lead_id so re-runs don't duplicate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  brand: string;
  stage: string;
  nurture_started_at: string;
  nurture_re_engage_date: string | null;
  nurture_sequence_status: string;
}

const DAY = 86400 * 1000;

function dayOffset(startedAt: string): number {
  const start = new Date(startedAt).getTime();
  return Math.floor((Date.now() - start) / DAY);
}

async function ensureTask(
  supabase: any,
  leadId: string,
  playbook: string,
  title: string,
  description: string,
  taskType: "email" | "call" | "internal",
  dueDateOffsetDays: number
) {
  // Idempotency: check if a task with this playbook key already exists for this lead.
  const { data: existing } = await supabase
    .from("lead_tasks")
    .select("id")
    .eq("lead_id", leadId)
    .eq("playbook", playbook)
    .limit(1);
  if (existing && existing.length > 0) return false;

  const dueDate = new Date(Date.now() + dueDateOffsetDays * DAY).toISOString().slice(0, 10);
  await supabase.from("lead_tasks").insert({
    lead_id: leadId,
    playbook,
    sequence_order: 1,
    task_type: taskType,
    title,
    description,
    due_date: dueDate,
  });
  return true;
}

async function ensureDraft(
  supabase: any,
  leadId: string,
  draftType: string,
  contextLabel: string,
  content: string
) {
  const { data: existing } = await supabase
    .from("lead_drafts")
    .select("id")
    .eq("lead_id", leadId)
    .eq("draft_type", draftType)
    .limit(1);
  if (existing && existing.length > 0) return false;

  await supabase.from("lead_drafts").insert({
    lead_id: leadId,
    draft_type: draftType,
    action_key: draftType,
    context_label: contextLabel,
    content,
    status: "pending_review",
  });
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id,name,company,email,brand,stage,nurture_started_at,nurture_re_engage_date,nurture_sequence_status")
      .eq("nurture_sequence_status", "active")
      .is("archived_at", null);
    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let drafts = 0, tasks = 0, completed = 0, reEngaged = 0;

    for (const lead of leads as Lead[]) {
      if (!lead.nurture_started_at) continue;
      const day = dayOffset(lead.nurture_started_at);

      // ── Re-engagement detection ────────────────────────────
      // If they replied to anything since nurture started, flip to re_engaged.
      const { data: metrics } = await supabase
        .from("lead_email_metrics")
        .select("last_received_date,last_replied_date")
        .eq("lead_id", lead.id)
        .maybeSingle();
      const lastInbound = metrics?.last_received_date ?? metrics?.last_replied_date;
      if (lastInbound && new Date(lastInbound) > new Date(lead.nurture_started_at)) {
        await supabase.from("leads").update({
          nurture_sequence_status: "re_engaged",
          stage: "In Contact",
          stage_entered_date: new Date().toISOString().slice(0, 10),
        } as any).eq("id", lead.id);
        await supabase.from("lead_activity_log").insert({
          lead_id: lead.id,
          event_type: "nurture_re_engaged",
          description: "Prospect responded during 90-day nurture — moved back to In Contact",
          old_value: "Closed Lost",
          new_value: "In Contact",
        } as any);
        reEngaged++;
        continue;
      }

      // ── Milestone tasks (idempotent) ───────────────────────
      if (day >= 0 && day < 7) {
        if (await ensureDraft(supabase, lead.id, "nurture-d0",
          "Day 0 — insight email",
          `Hi ${lead.name?.split(" ")[0] || "there"},\n\nThinking about ${lead.company || "your"} — wanted to share a quick observation from a recent ${lead.brand} deal that reminded me of your situation. Worth a 10-minute call to compare notes?`)) drafts++;
      }
      if (day >= 30 && day < 37) {
        if (await ensureDraft(supabase, lead.id, "nurture-d30",
          "Day 30 — market update",
          `Hi ${lead.name?.split(" ")[0] || "there"},\n\nMarket update on the segment we discussed. Two trends worth flagging: [insert]. Happy to share the underlying data if useful.`)) drafts++;
      }
      if (day >= 45 && day < 52) {
        if (await ensureTask(supabase, lead.id, "nurture-d45",
          "Day 45 — manual call check-in",
          "Pick up the phone. Reference the d0 insight email and the d30 market update. Goal: re-open the conversation, not pitch.",
          "call", 0)) tasks++;
      }
      if (day >= 90) {
        if (await ensureTask(supabase, lead.id, "nurture-d90",
          "Day 90 — re-open ask + decision",
          "Final nurture touchpoint. Send explicit re-open ask. If no response within 7 days, mark sequence completed and archive.",
          "email", 0)) tasks++;

        // Auto-complete sequence after day 90 + 7-day grace window
        if (day >= 97) {
          await supabase.from("leads").update({
            nurture_sequence_status: "completed",
          } as any).eq("id", lead.id);
          await supabase.from("lead_activity_log").insert({
            lead_id: lead.id,
            event_type: "nurture_completed",
            description: "90-day nurture sequence completed without re-engagement",
          } as any);
          completed++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: leads.length, drafts, tasks, completed, reEngaged }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("nurture-engine error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
