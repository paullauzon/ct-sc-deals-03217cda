// Phase 3 — outbound Gmail send.
// Sends an email via Gmail API users.messages.send for a chosen connection.
//
// POST body:
//   {
//     connection_id: string,           // which mailbox to send from (required)
//     lead_id?: string,                // for lead_emails logging + last_contact bump
//     to: string | string[],
//     cc?: string | string[],
//     bcc?: string | string[],
//     subject: string,
//     body_text?: string,
//     body_html?: string,              // if omitted, derived from body_text
//     in_reply_to?: string,            // RFC822 Message-ID for threading
//     thread_id?: string,              // Gmail thread id for in-thread reply
//   }
//
// On success:
//   - sends via Gmail
//   - inserts a row in lead_emails with source='gmail', direction='outbound',
//     and a special X-CRM-Source header so the inbound syncer can recognize it
//   - returns { ok, gmail_message_id, rfc822_message_id, thread_id, lead_email_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getValidAccessToken } from "../refresh-gmail-token/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return v.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
}

function toBase64Url(input: string): string {
  // utf-8 → base64 → base64url
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(s: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;white-space:pre-wrap;">${escapeHtml(s)}</div>`;
}

function buildRfc822({
  fromAddress, fromName, to, cc, bcc, subject, text, html, inReplyTo, messageId,
}: {
  fromAddress: string; fromName?: string;
  to: string[]; cc: string[]; bcc: string[];
  subject: string; text: string; html: string;
  inReplyTo?: string; messageId: string;
}): string {
  const boundary = `=_crm_${Math.random().toString(36).slice(2)}`;
  const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${to.join(", ")}`,
  ];
  if (cc.length) headers.push(`Cc: ${cc.join(", ")}`);
  if (bcc.length) headers.push(`Bcc: ${bcc.join(", ")}`);
  headers.push(`Subject: ${subject.replace(/[\r\n]+/g, " ")}`);
  headers.push(`Message-ID: ${messageId}`);
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }
  headers.push(`X-CRM-Source: lovable-crm`);
  headers.push(`MIME-Version: 1.0`);
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const body =
    `\r\n--${boundary}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    `${text}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    `${html}\r\n` +
    `--${boundary}--`;

  return headers.join("\r\n") + "\r\n" + body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const {
      connection_id,
      lead_id,
      to: toRaw, cc: ccRaw, bcc: bccRaw,
      subject, body_text, body_html,
      in_reply_to, thread_id,
    } = body as Record<string, unknown>;

    if (!connection_id || typeof connection_id !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "connection_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const to = asArray(toRaw as string | string[]);
    if (to.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "at least one recipient required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cc = asArray(ccRaw as string | string[]);
    const bcc = asArray(bccRaw as string | string[]);
    const subj = String(subject ?? "").trim();
    const text = String(body_text ?? "").trim();
    const html = String(body_html ?? "").trim() || textToHtml(text);

    const { data: conn, error: connErr } = await supabase
      .from("user_email_connections")
      .select("id, email_address, user_label, is_active, provider")
      .eq("id", connection_id)
      .single();
    if (connErr || !conn) throw new Error("Mailbox not found");
    if (!conn.is_active) throw new Error("Mailbox is disconnected");
    if (conn.provider !== "gmail") throw new Error("Only Gmail send is supported");

    const token = await getValidAccessToken(connection_id);

    const fromAddress = conn.email_address as string;
    const fromName = (conn.user_label as string)?.split("—")[0]?.trim() || undefined;
    const rfc822MessageId = `<crm-${crypto.randomUUID()}@${fromAddress.split("@")[1] || "lovable.local"}>`;

    // Pre-insert lead_emails row so we can stamp the pixel URL with its id.
    // body_html stored without the pixel — pixel only goes in the recipient's copy.
    const preview = text.slice(0, 280).replace(/\s+/g, " ").trim();
    const insertRow = {
      lead_id: typeof lead_id === "string" && lead_id ? lead_id : "unmatched",
      provider_message_id: null as string | null,
      message_id: rfc822MessageId,
      thread_id: typeof thread_id === "string" ? thread_id : "",
      direction: "outbound",
      from_address: fromAddress,
      from_name: fromName ?? "",
      to_addresses: to,
      cc_addresses: cc,
      bcc_addresses: bcc,
      subject: subj,
      body_text: text,
      body_html: html,
      body_preview: preview,
      email_date: new Date().toISOString(),
      source: "gmail",
      is_read: true,
      tracked: true,
      raw_payload: { sent_via: "crm", x_crm_source: "lovable-crm" },
    };
    const { data: inserted, error: insertErr } = await supabase
      .from("lead_emails")
      .insert(insertRow)
      .select("id")
      .single();
    if (insertErr || !inserted) {
      throw new Error(`lead_emails pre-insert failed: ${insertErr?.message || "no row"}`);
    }
    const leadEmailId = inserted.id as string;

    // Inject open-pixel into the recipient HTML.
    const trackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/track-email-open?eid=${leadEmailId}`;
    const pixelTag = `<img src="${trackUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
    const htmlWithPixel = html.replace(/<\/body>/i, `${pixelTag}</body>`) === html
      ? `${html}${pixelTag}`
      : html.replace(/<\/body>/i, `${pixelTag}</body>`);

    const raw = buildRfc822({
      fromAddress, fromName, to, cc, bcc,
      subject: subj, text, html: htmlWithPixel,
      inReplyTo: typeof in_reply_to === "string" ? in_reply_to : undefined,
      messageId: rfc822MessageId,
    });

    const sendBody: Record<string, unknown> = { raw: toBase64Url(raw) };
    if (typeof thread_id === "string" && thread_id) sendBody.threadId = thread_id;

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });
    if (!sendRes.ok) {
      const errTxt = await sendRes.text();
      // Mark the row as failed so it doesn't sit as a phantom sent.
      await supabase.from("lead_emails").delete().eq("id", leadEmailId);
      throw new Error(`Gmail send failed: ${sendRes.status} ${errTxt.slice(0, 200)}`);
    }
    const sent = await sendRes.json() as { id: string; threadId: string };

    // Backfill the gmail provider_message_id + threadId.
    await supabase
      .from("lead_emails")
      .update({ provider_message_id: sent.id, thread_id: sent.threadId ?? "" })
      .eq("id", leadEmailId);

    return new Response(JSON.stringify({
      ok: true,
      gmail_message_id: sent.id,
      rfc822_message_id: rfc822MessageId,
      thread_id: sent.threadId,
      lead_email_id: leadEmailId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-gmail-email error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
