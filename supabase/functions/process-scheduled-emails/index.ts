// Phase 5 — scheduled-send dispatcher.
// Cron-invoked every 5 minutes. Finds lead_emails rows where:
//   send_status = 'scheduled' AND scheduled_for <= now()
// then calls send-gmail-email for each, marking the row as 'sent' or 'failed'.
//
// Each scheduled row carries the full message context (to/cc/bcc/subject/body),
// the connection_id of the sender mailbox, and optional thread_id/in_reply_to.
// On dispatch we DELETE the placeholder row and let send-gmail-email insert
// the real one — this keeps a single canonical row per sent message.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScheduledRow {
  id: string;
  lead_id: string;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  bcc_addresses: string[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  thread_id: string | null;
  message_id: string | null;
  raw_payload: { connection_id?: string; in_reply_to?: string } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const startedAt = new Date().toISOString();
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  try {
    const { data: due, error } = await supabase
      .from("lead_emails")
      .select("id, lead_id, to_addresses, cc_addresses, bcc_addresses, subject, body_text, body_html, thread_id, message_id, raw_payload")
      .eq("send_status", "scheduled")
      .lte("scheduled_for", startedAt)
      .limit(50);

    if (error) throw error;
    const rows = (due ?? []) as ScheduledRow[];

    for (const row of rows) {
      const conn = row.raw_payload?.connection_id;
      const inReplyTo = row.raw_payload?.in_reply_to;
      const recipients = row.to_addresses ?? [];

      if (!conn || recipients.length === 0 || !row.subject) {
        await supabase.from("lead_emails")
          .update({ send_status: "failed", bounce_reason: "missing dispatch fields" })
          .eq("id", row.id);
        results.push({ id: row.id, ok: false, error: "missing dispatch fields" });
        continue;
      }

      try {
        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-gmail-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            connection_id: conn,
            lead_id: row.lead_id,
            to: recipients,
            cc: row.cc_addresses ?? [],
            bcc: row.bcc_addresses ?? [],
            subject: row.subject,
            body_text: row.body_text ?? "",
            body_html: row.body_html ?? "",
            ...(row.thread_id ? { thread_id: row.thread_id } : {}),
            ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
          }),
        });
        const json = await sendRes.json().catch(() => ({}));

        if (!sendRes.ok || !json.ok) {
          const errMsg = (json.error || `send returned ${sendRes.status}`).slice(0, 200);
          await supabase.from("lead_emails")
            .update({ send_status: "failed", bounce_reason: errMsg })
            .eq("id", row.id);
          results.push({ id: row.id, ok: false, error: errMsg });
          continue;
        }

        // Successful send — delete the placeholder, send-gmail-email already inserted the real row.
        await supabase.from("lead_emails").delete().eq("id", row.id);
        results.push({ id: row.id, ok: true });
      } catch (e) {
        const msg = (e as Error).message.slice(0, 200);
        await supabase.from("lead_emails")
          .update({ send_status: "failed", bounce_reason: msg })
          .eq("id", row.id);
        results.push({ id: row.id, ok: false, error: msg });
      }
    }

    await supabase.from("cron_run_log").insert({
      job_name: "process-scheduled-emails", status: "success",
      items_processed: results.length,
      details: { ok: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length },
    });
    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-scheduled-emails error:", e);
    try {
      await supabase.from("cron_run_log").insert({
        job_name: "process-scheduled-emails", status: "error", items_processed: results.length,
        error_message: (e as Error).message.slice(0, 200),
      });
    } catch {/* swallow */}
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
