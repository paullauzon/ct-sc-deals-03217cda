// Sends an email via Microsoft Graph /me/sendMail for a chosen Outlook connection.
// Mirrors send-gmail-email: pre-inserts lead_emails, injects pixel, rewrite links,
// stamps ai_drafted, marks source draft as sent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Inline token refresh for Outlook
async function getValidOutlookToken(connectionId: string): Promise<string> {
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
  if (!conn.refresh_token) throw new Error(`Connection ${connectionId} has no refresh_token`);

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 && conn.access_token) return conn.access_token;

  const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Microsoft OAuth credentials missing");

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access",
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Outlook token refresh failed: ${res.status} ${errText.slice(0, 200)}`);
  }
  const tokens = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  const upd: Record<string, unknown> = { access_token: tokens.access_token, token_expires_at: newExpiresAt, updated_at: new Date().toISOString() };
  if (tokens.refresh_token) upd.refresh_token = tokens.refresh_token;
  await supabase.from("user_email_connections").update(upd).eq("id", connectionId);
  return tokens.access_token;
}

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return v.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(s: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;white-space:pre-wrap;">${escapeHtml(s)}</div>`;
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const {
      connection_id, lead_id,
      to: toRaw, cc: ccRaw, bcc: bccRaw,
      subject, body_text, body_html,
      in_reply_to, thread_id,
      ai_drafted, source_draft_id,
    } = body as Record<string, unknown>;

    const isAiDrafted = ai_drafted === true;
    const sourceDraftId = typeof source_draft_id === "string" && source_draft_id ? source_draft_id : null;

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
    if (conn.provider !== "outlook") throw new Error("This function handles Outlook send only");

    const token = await getValidOutlookToken(connection_id);

    const fromAddress = conn.email_address as string;
    const fromName = (conn.user_label as string)?.split("—")[0]?.trim() || undefined;
    const rfc822MessageId = `<crm-${crypto.randomUUID()}@${fromAddress.split("@")[1] || "lovable.local"}>`;

    // Pre-insert lead_emails row
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
      source: "outlook",
      is_read: true,
      tracked: true,
      ai_drafted: isAiDrafted,
      raw_payload: {
        sent_via: "crm",
        x_crm_source: "lovable-crm",
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

    // Inject open-pixel + rewrite links
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const trackUrl = `${baseUrl}/functions/v1/track-email-open?eid=${leadEmailId}`;
    const pixelTag = `<img src="${trackUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
    const rewritten = rewriteLinks(html, leadEmailId, baseUrl);
    const htmlWithPixel = rewritten.includes("</body>")
      ? rewritten.replace(/<\/body>/i, `${pixelTag}</body>`)
      : `${rewritten}${pixelTag}`;

    // Build Graph sendMail payload
    const graphMessage: Record<string, unknown> = {
      subject: subj,
      body: { contentType: "HTML", content: htmlWithPixel },
      toRecipients: to.map((a) => ({ emailAddress: { address: a } })),
      internetMessageHeaders: [
        { name: "X-CRM-Source", value: "lovable-crm" },
      ],
    };
    if (cc.length) graphMessage.ccRecipients = cc.map((a) => ({ emailAddress: { address: a } }));
    if (bcc.length) graphMessage.bccRecipients = bcc.map((a) => ({ emailAddress: { address: a } }));

    // Threading: use conversationId if replying
    if (typeof in_reply_to === "string" && in_reply_to) {
      (graphMessage.internetMessageHeaders as Array<{name: string; value: string}>).push(
        { name: "In-Reply-To", value: in_reply_to },
        { name: "References", value: in_reply_to },
      );
    }

    const sendRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: graphMessage }),
    });

    if (!sendRes.ok) {
      const errTxt = await sendRes.text();
      await supabase.from("lead_emails").delete().eq("id", leadEmailId);
      throw new Error(`Outlook send failed: ${sendRes.status} ${errTxt.slice(0, 200)}`);
    }

    // Graph sendMail returns 202 with no body — we can't get the message ID directly.
    // The next sync run will pick up the sent message and backfill provider_message_id.

    // Mark source draft as sent
    if (sourceDraftId) {
      await (supabase as any)
        .from("lead_drafts")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", sourceDraftId);
    }

    return new Response(JSON.stringify({
      ok: true,
      rfc822_message_id: rfc822MessageId,
      lead_email_id: leadEmailId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-outlook-email error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
