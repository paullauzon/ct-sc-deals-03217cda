// Phase 3 — outbound Gmail send.
// Sends an email via Gmail API users.messages.send for a chosen connection.
//
// Phase 9 additions:
// - Honors `tracking_enabled` (default true). When false, no pixel + no link rewrite.
// - Honors `attachments: [{ name, url, size }]` — fetched from public storage URLs,
//   base64-encoded, attached as multipart/mixed parts. Persisted to lead_emails.attachments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inline copy of getValidAccessToken — edge functions can't import across siblings.
async function getValidAccessToken(connectionId: string): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: conn, error } = await supabase
    .from("user_email_connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (error || !conn) throw new Error(`Connection ${connectionId} not found`);
  if (!conn.refresh_token) throw new Error(`Connection ${connectionId} has no refresh_token — reconnect required`);

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const stillValid = expiresAt > Date.now() + 60_000;
  if (stillValid && conn.access_token) return conn.access_token;

  const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Google OAuth credentials missing");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${errText.slice(0, 200)}`);
  }

  const tokens = await res.json() as { access_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  await supabase
    .from("user_email_connections")
    .update({
      access_token: tokens.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  return tokens.access_token;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AttachmentInput {
  name?: string;
  url?: string;
  size?: number;
  mime?: string;
}
interface PreparedAttachment {
  filename: string;
  mime: string;
  base64: string;
}

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

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function chunkBase64(b64: string, lineLen = 76): string {
  const re = new RegExp(`.{1,${lineLen}}`, "g");
  return (b64.match(re) || []).join("\r\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(s: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;white-space:pre-wrap;">${escapeHtml(s)}</div>`;
}

function mimeFromName(name: string, fallback?: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp",
    csv: "text/csv", txt: "text/plain", md: "text/markdown",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip", json: "application/json",
  };
  return map[ext] || fallback || "application/octet-stream";
}

async function fetchAttachments(input: AttachmentInput[]): Promise<PreparedAttachment[]> {
  const out: PreparedAttachment[] = [];
  for (const a of input) {
    if (!a?.url) continue;
    try {
      const r = await fetch(a.url);
      if (!r.ok) {
        console.warn("attachment fetch failed", a.url, r.status);
        continue;
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      const filename = (a.name || "attachment").replace(/[\r\n"]/g, "_");
      const mime = a.mime || r.headers.get("content-type") || mimeFromName(filename);
      out.push({ filename, mime, base64: bytesToBase64(buf) });
    } catch (e) {
      console.warn("attachment error", a.url, (e as Error).message);
    }
  }
  return out;
}

// Rewrite all <a href="X"> links to route through track-email-click.
function rewriteLinks(html: string, leadEmailId: string, baseUrl: string): string {
  const trackBase = `${baseUrl}/functions/v1/track-email-click`;
  return html.replace(/(<a\b[^>]*\bhref\s*=\s*)(["'])([^"']+)\2/gi, (m, pre, q, href) => {
    const trimmed = href.trim();
    if (!trimmed) return m;
    if (/^(mailto:|tel:|#|javascript:)/i.test(trimmed)) return m;
    if (trimmed.includes("/track-email-click") || trimmed.includes("/track-email-open")) return m;
    if (!/^https?:\/\//i.test(trimmed)) return m;
    const wrapped = `${trackBase}?eid=${encodeURIComponent(leadEmailId)}&url=${encodeURIComponent(trimmed)}`;
    return `${pre}${q}${wrapped}${q}`;
  });
}

function buildRfc822({
  fromAddress, fromName, to, cc, bcc, subject, text, html,
  inReplyTo, messageId, attachments,
}: {
  fromAddress: string; fromName?: string;
  to: string[]; cc: string[]; bcc: string[];
  subject: string; text: string; html: string;
  inReplyTo?: string; messageId: string;
  attachments: PreparedAttachment[];
}): string {
  const altBoundary = `=_alt_${Math.random().toString(36).slice(2)}`;
  const mixedBoundary = `=_mixed_${Math.random().toString(36).slice(2)}`;
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

  const altPart =
    `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n` +
    `--${altBoundary}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    `${text}\r\n` +
    `--${altBoundary}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    `${html}\r\n` +
    `--${altBoundary}--`;

  if (attachments.length === 0) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    const body =
      `\r\n--${altBoundary}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: 7bit\r\n\r\n` +
      `${text}\r\n` +
      `--${altBoundary}\r\n` +
      `Content-Type: text/html; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: 7bit\r\n\r\n` +
      `${html}\r\n` +
      `--${altBoundary}--`;
    return headers.join("\r\n") + "\r\n" + body;
  }

  // multipart/mixed wrapping the alternative + each attachment
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const attachmentParts = attachments.map(a => {
    const safeName = a.filename.replace(/"/g, "");
    return (
      `--${mixedBoundary}\r\n` +
      `Content-Type: ${a.mime}; name="${safeName}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: attachment; filename="${safeName}"\r\n\r\n` +
      `${chunkBase64(a.base64)}\r\n`
    );
  }).join("");

  const body =
    `\r\n--${mixedBoundary}\r\n` +
    altPart + `\r\n` +
    attachmentParts +
    `--${mixedBoundary}--`;

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
      ai_drafted, source_draft_id,
      tracking_enabled, attachments: attachmentsRaw,
    } = body as Record<string, unknown>;
    const isAiDrafted = ai_drafted === true;
    const sourceDraftId = typeof source_draft_id === "string" && source_draft_id ? source_draft_id : null;
    const trackingEnabled = tracking_enabled !== false; // default true
    const attachmentInputs: AttachmentInput[] = Array.isArray(attachmentsRaw)
      ? (attachmentsRaw as AttachmentInput[]).filter(a => a && typeof a === "object" && a.url)
      : [];

    let sequenceStep: string | null = null;
    if (sourceDraftId) {
      const { data: draft } = await supabase
        .from("lead_drafts")
        .select("action_key")
        .eq("id", sourceDraftId)
        .maybeSingle();
      const key = (draft as any)?.action_key as string | undefined;
      if (key && /^(N0|N30|N45|N90|REFERRAL)$/.test(key)) sequenceStep = key;
    }

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

    // Pre-fetch attachments before pre-insert so we can persist filenames + sizes.
    const preparedAttachments = attachmentInputs.length > 0
      ? await fetchAttachments(attachmentInputs)
      : [];
    const attachmentsForRow = preparedAttachments.map((a, i) => ({
      name: a.filename,
      mime: a.mime,
      size: attachmentInputs[i]?.size ?? null,
      url: attachmentInputs[i]?.url ?? null,
    }));

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
      tracked: trackingEnabled,
      ai_drafted: isAiDrafted,
      sequence_step: sequenceStep,
      attachments: attachmentsForRow,
      raw_payload: {
        sent_via: "crm",
        x_crm_source: "lovable-crm",
        tracking_enabled: trackingEnabled,
        ...(sourceDraftId ? { source_draft_id: sourceDraftId } : {}),
      },
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

    // Conditionally inject pixel + rewrite links.
    let htmlForSend = html;
    if (trackingEnabled) {
      const baseUrl = Deno.env.get("SUPABASE_URL")!;
      const trackUrl = `${baseUrl}/functions/v1/track-email-open?eid=${leadEmailId}`;
      const pixelTag = `<img src="${trackUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
      const rewritten = rewriteLinks(html, leadEmailId, baseUrl);
      htmlForSend = rewritten.includes("</body>")
        ? rewritten.replace(/<\/body>/i, `${pixelTag}</body>`)
        : `${rewritten}${pixelTag}`;
    }

    const raw = buildRfc822({
      fromAddress, fromName, to, cc, bcc,
      subject: subj, text, html: htmlForSend,
      inReplyTo: typeof in_reply_to === "string" ? in_reply_to : undefined,
      messageId: rfc822MessageId,
      attachments: preparedAttachments,
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
      await supabase.from("lead_emails").delete().eq("id", leadEmailId);
      throw new Error(`Gmail send failed: ${sendRes.status} ${errTxt.slice(0, 200)}`);
    }
    const sent = await sendRes.json() as { id: string; threadId: string };

    await supabase
      .from("lead_emails")
      .update({ provider_message_id: sent.id, thread_id: sent.threadId ?? "" })
      .eq("id", leadEmailId);

    if (sourceDraftId) {
      await (supabase as any)
        .from("lead_drafts")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", sourceDraftId);
    }

    return new Response(JSON.stringify({
      ok: true,
      gmail_message_id: sent.id,
      rfc822_message_id: rfc822MessageId,
      thread_id: sent.threadId,
      lead_email_id: leadEmailId,
      tracking_enabled: trackingEnabled,
      attachments_count: preparedAttachments.length,
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
