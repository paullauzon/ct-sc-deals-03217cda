// Phase 7 — extract-email-tasks
// Scans recent inbound emails for promises and dated commitments, then creates
// dated entries in `lead_tasks` so they show up in the Action Center / playbook.
//
// Idempotent: skips emails that already produced a task in the last 90 days
// (tracked via lead_activity_log event_type='email_task_extracted' metadata).
//
// Triggered by: pg_cron every 15 minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const JOB_NAME = "extract-email-tasks";

interface ExtractedTask {
  title: string;
  due_date: string;        // ISO date
  description: string;
  source_quote: string;
}

async function extractTasksFromEmail(
  bodyText: string,
  fromName: string,
  receivedAt: string,
): Promise<ExtractedTask[]> {
  if (!bodyText || bodyText.length < 30) return [];
  const trimmed = bodyText.slice(0, 4000);

  const today = new Date(receivedAt).toISOString().slice(0, 10);
  const prompt = `You parse a single inbound business email from a sales prospect named "${fromName}".
Email date: ${today}.

Return a JSON array of TIME-BOUND COMMITMENTS the SENDER made (NOT generic future promises). 
Examples that count: "I'll send the term sheet by Friday", "let's circle back in 3 weeks", "I'll have feedback by month-end".
Examples that do NOT count: "thanks", "sounds good", general sentiment, salutations.

For each commitment return:
- "title": short imperative starting with "Follow up:" e.g. "Follow up: Tim to send term sheet"
- "due_date": ISO date YYYY-MM-DD (resolve relative phrases like "next Friday")
- "description": one-sentence context
- "source_quote": the exact phrase from the email (max 120 chars)

If no real commitments exist, return an empty array. Return ONLY raw JSON, no prose.

Email body:
"""
${trimmed}
"""`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You extract structured commitments from emails. Output raw JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    console.warn("[extract-email-tasks] AI gateway error", res.status);
    return [];
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content || "";
  const cleaned = content.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t: any) => t && typeof t.title === "string" && typeof t.due_date === "string")
      .slice(0, 3);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  let processed = 0;
  let createdTasks = 0;
  let skipped = 0;

  try {
    // Pull last 24h of inbound emails not yet scanned.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: emails, error } = await sb
      .from("lead_emails")
      .select("id, lead_id, body_text, body_preview, from_name, from_address, email_date, subject")
      .eq("direction", "inbound")
      .gte("email_date", since)
      .neq("lead_id", "unmatched")
      .order("email_date", { ascending: false })
      .limit(60);
    if (error) throw error;

    const candidates = (emails || []).filter(e => (e.body_text || e.body_preview || "").length > 40);
    if (candidates.length === 0) {
      await logCronRun(JOB_NAME, "noop", 0);
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip already-processed emails
    const ids = candidates.map(c => c.id);
    const { data: existing } = await sb
      .from("lead_activity_log")
      .select("metadata")
      .eq("event_type", "email_task_extracted")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
    const seenIds = new Set<string>();
    for (const row of existing || []) {
      const eid = (row.metadata as any)?.email_id;
      if (eid) seenIds.add(eid);
    }
    const todo = candidates.filter(c => !seenIds.has(c.id));

    for (const email of todo) {
      processed++;
      try {
        const body = email.body_text || email.body_preview || "";
        const fromName = email.from_name || email.from_address.split("@")[0];
        const tasks = await extractTasksFromEmail(body, fromName, email.email_date);

        if (tasks.length === 0) {
          await sb.from("lead_activity_log").insert({
            lead_id: email.lead_id,
            event_type: "email_task_extracted",
            description: "Scanned inbound email — no commitments found",
            metadata: { email_id: email.id, count: 0 },
            actor_name: "AI",
          });
          skipped++;
          continue;
        }

        for (const t of tasks) {
          // Seed lead_tasks with a unique playbook tag so it doesn't collide.
          await sb.from("lead_tasks").insert({
            lead_id: email.lead_id,
            playbook: "email_extracted",
            task_type: "follow_up",
            title: t.title.slice(0, 200),
            description: `${t.description}\n\nFrom email "${email.subject || "(no subject)"}":\n"${t.source_quote}"`.slice(0, 1000),
            due_date: t.due_date,
            sequence_order: 0,
            status: "pending",
          });
          createdTasks++;
        }

        await sb.from("lead_activity_log").insert({
          lead_id: email.lead_id,
          event_type: "email_task_extracted",
          description: `Created ${tasks.length} task${tasks.length > 1 ? "s" : ""} from inbound email`,
          metadata: { email_id: email.id, count: tasks.length },
          actor_name: "AI",
        });
      } catch (err) {
        console.warn("[extract-email-tasks] failed for", email.id, err);
      }
    }

    const status = createdTasks === 0 ? "noop" : "success";
    await logCronRun(JOB_NAME, status, createdTasks, { processed, skipped, scanned: todo.length });
    return new Response(JSON.stringify({ ok: true, processed, createdTasks, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logCronRun(JOB_NAME, "error", createdTasks, { processed }, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
