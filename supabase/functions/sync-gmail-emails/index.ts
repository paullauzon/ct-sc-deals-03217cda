// Phase 2 — Gmail inbound sync.
// Pulls new messages from each active Gmail connection in user_email_connections,
// matches them to leads by external participant email, dedupes against existing
// lead_emails (Zapier or prior Gmail runs), and inserts with source='gmail'.
//
// Modes:
//   - First run (no history_id stored): pull last 7 days via messages.list?q=newer_than:7d
//   - Incremental (has history_id): users.history.list?startHistoryId=X
//   - History 404 (too old, pruned): falls back to 7-day scan and resets history_id
//
// Invocations:
//   POST /sync-gmail-emails                       → all active gmail connections
//   POST /sync-gmail-emails  { connection_id }    → just that connection (manual)
//
// Internal company domains are excluded from lead matching (we never want to
// match a thread by an internal participant). The sender's own mailbox address
// is also excluded.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inline copy of getValidAccessToken — edge functions can't import across sibling functions.
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

const INTERNAL_DOMAINS = new Set([
  "captarget.com",
  "sourcecodeals.com",
]);

// Split caps: first-time backfill pulls a deeper window, incremental stays small.
const MAX_FIRST_RUN = 1500;
const MAX_INCREMENTAL = 250;
// First-run backfill window. 90d gives meaningful deal history without hammering Gmail.
const FIRST_RUN_WINDOW = "newer_than:90d";

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload: GmailPayload;
  snippet?: string;
  internalDate?: string;
  historyId?: string;
}
interface GmailPayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPayload[];
}

function header(payload: GmailPayload, name: string): string {
  const lower = name.toLowerCase();
  const h = payload.headers?.find((h) => h.name.toLowerCase() === lower);
  return h?.value ?? "";
}

function decodeBase64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function extractBody(payload: GmailPayload): { text: string; html: string } {
  let text = "";
  let html = "";

  const walk = (p: GmailPayload) => {
    const mime = (p.mimeType || "").toLowerCase();
    if (mime === "text/plain" && p.body?.data && !text) {
      text = decodeBase64Url(p.body.data);
    } else if (mime === "text/html" && p.body?.data && !html) {
      html = decodeBase64Url(p.body.data);
    }
    p.parts?.forEach(walk);
  };
  walk(payload);

  return { text, html };
}

function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  // Naive but robust enough — strip names, return lowercased addresses
  return raw
    .split(",")
    .map((part) => {
      const m = part.match(/<([^>]+)>/);
      const addr = (m ? m[1] : part).trim().toLowerCase();
      return addr;
    })
    .filter((a) => a.includes("@"));
}

function parseFromAddress(raw: string): { name: string; address: string } {
  if (!raw) return { name: "", address: "" };
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || "").trim(), address: m[2].trim().toLowerCase() };
  return { name: "", address: raw.trim().toLowerCase() };
}

function domainOf(email: string): string {
  return email.includes("@") ? email.split("@")[1].toLowerCase() : "";
}

async function findLeadIdByEmail(
  supabase: ReturnType<typeof createClient>,
  candidates: string[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  const lowered = candidates.map((c) => c.toLowerCase());

  // 1) Exact email match against leads.email
  const { data: exact } = await supabase
    .from("leads")
    .select("id, email")
    .in("email", lowered)
    .limit(1);
  if (exact && exact.length > 0) return (exact[0] as { id: string }).id;

  // 2) Domain-fallback: extract external domains and match against leads where the
  // primary contact email or company_url shares the same domain. Internal domains
  // are already filtered out by the caller. We bound the search to non-archived,
  // non-duplicate leads to avoid linking to stale records.
  const domains = Array.from(new Set(
    lowered.map(domainOf).filter((d) => d && !INTERNAL_DOMAINS.has(d)),
  ));
  if (domains.length === 0) return null;

  // Build OR filter for company_url ILIKE %domain% across all candidate domains.
  // PostgREST .or() syntax: comma-separated, parens-wrapped — domains are alphanumeric+dot,
  // safe to embed without escaping.
  const orParts: string[] = [];
  for (const d of domains) {
    orParts.push(`email.ilike.%@${d}`);
    orParts.push(`company_url.ilike.%${d}%`);
  }
  const { data: fuzzy } = await supabase
    .from("leads")
    .select("id, email, company_url, archived_at, is_duplicate")
    .or(orParts.join(","))
    .is("archived_at", null)
    .eq("is_duplicate", false)
    .limit(1);
  if (fuzzy && fuzzy.length > 0) return (fuzzy[0] as { id: string }).id;

  return null;
}

interface SyncStats {
  connection_id: string;
  email: string;
  mode: "incremental" | "full" | "history-reset";
  fetched: number;
  inserted: number;
  matched: number;
  skipped_dup: number;
  skipped_internal: number;
  errors: string[];
}

async function listMessageIdsFull(token: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", FIRST_RUN_WINDOW);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`messages.list failed: ${res.status}`);
    const json = await res.json() as { messages?: { id: string }[]; nextPageToken?: string };
    json.messages?.forEach((m) => ids.push(m.id));
    pageToken = json.nextPageToken;
    if (ids.length >= MAX_FIRST_RUN) break;
  } while (pageToken);
  return ids.slice(0, MAX_FIRST_RUN);
}

async function listMessageIdsIncremental(
  token: string,
  startHistoryId: string,
): Promise<{ ids: string[]; latestHistoryId: string | null; reset: boolean }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId: string | null = null;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
    url.searchParams.set("startHistoryId", startHistoryId);
    url.searchParams.set("historyTypes", "messageAdded");
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      return { ids: [], latestHistoryId: null, reset: true };
    }
    if (!res.ok) throw new Error(`history.list failed: ${res.status}`);
    const json = await res.json() as {
      history?: { messages?: { id: string }[]; messagesAdded?: { message: { id: string } }[] }[];
      historyId?: string;
      nextPageToken?: string;
    };
    json.history?.forEach((h) => {
      h.messagesAdded?.forEach((ma) => ids.add(ma.message.id));
      h.messages?.forEach((m) => ids.add(m.id));
    });
    if (json.historyId) latestHistoryId = json.historyId;
    pageToken = json.nextPageToken;
    if (ids.size >= MAX_INCREMENTAL) break;
  } while (pageToken);
  return { ids: Array.from(ids).slice(0, MAX_INCREMENTAL), latestHistoryId, reset: false };
}

async function fetchMessage(token: string, id: string): Promise<GmailMessage | null> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return await res.json() as GmailMessage;
}

async function getMailboxProfileHistoryId(token: string): Promise<string | null> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json() as { historyId?: string };
  return json.historyId ?? null;
}

async function syncOneConnection(
  supabase: ReturnType<typeof createClient>,
  connection: { id: string; email_address: string; history_id: string | null },
): Promise<SyncStats> {
  const stats: SyncStats = {
    connection_id: connection.id,
    email: connection.email_address,
    mode: "incremental",
    fetched: 0,
    inserted: 0,
    matched: 0,
    skipped_dup: 0,
    skipped_internal: 0,
    errors: [],
  };

  let token: string;
  try {
    token = await getValidAccessToken(connection.id);
  } catch (e) {
    stats.errors.push(`token: ${(e as Error).message}`);
    return stats;
  }

  let messageIds: string[] = [];
  let latestHistoryId: string | null = null;

  try {
    if (!connection.history_id) {
      stats.mode = "full";
      messageIds = await listMessageIdsFull(token);
      latestHistoryId = await getMailboxProfileHistoryId(token);
    } else {
      const result = await listMessageIdsIncremental(token, connection.history_id);
      if (result.reset) {
        stats.mode = "history-reset";
        messageIds = await listMessageIdsFull(token);
        latestHistoryId = await getMailboxProfileHistoryId(token);
      } else {
        messageIds = result.ids;
        latestHistoryId = result.latestHistoryId ?? connection.history_id;
      }
    }
  } catch (e) {
    stats.errors.push(`list: ${(e as Error).message}`);
    return stats;
  }

  stats.fetched = messageIds.length;

  const ownAddress = connection.email_address.toLowerCase();

  for (const mid of messageIds) {
    try {
      const msg = await fetchMessage(token, mid);
      if (!msg) continue;

      const rfc822Id = header(msg.payload, "Message-ID") || header(msg.payload, "Message-Id");
      const subject = header(msg.payload, "Subject");
      const fromRaw = header(msg.payload, "From");
      const toRaw = header(msg.payload, "To");
      const ccRaw = header(msg.payload, "Cc");
      const bccRaw = header(msg.payload, "Bcc");
      const dateRaw = header(msg.payload, "Date");

      const from = parseFromAddress(fromRaw);
      const toList = parseAddressList(toRaw);
      const ccList = parseAddressList(ccRaw);
      const bccList = parseAddressList(bccRaw);

      // Dedup against existing rows using Gmail's own provider_message_id (alphanumeric, safe).
      // We deliberately don't OR against RFC822 message_id — those contain `<>@.` chars that
      // break PostgREST `.or()` filter syntax and would cause silent 400s.
      const { data: existing } = await supabase
        .from("lead_emails")
        .select("id")
        .eq("provider_message_id", mid)
        .limit(1);
      if (existing && existing.length > 0) {
        stats.skipped_dup += 1;
        continue;
      }

      // Skip CRM-sent messages — they were already inserted by send-gmail-email.
      // Recognized via X-CRM-Source header (added by our outbound builder) or
      // RFC822 Message-ID prefix `<crm-...@...>`.
      const xCrmSource = header(msg.payload, "X-CRM-Source");
      const rfc822IdRaw = rfc822Id || "";
      if (xCrmSource || rfc822IdRaw.includes("<crm-")) {
        stats.skipped_dup += 1;
        continue;
      }

      const direction = from.address === ownAddress ? "outbound" : "inbound";

      // Determine external participants for lead matching.
      const allParticipants = [from.address, ...toList, ...ccList, ...bccList];
      const external = allParticipants.filter((a) => {
        if (!a) return false;
        if (a === ownAddress) return false;
        const dom = domainOf(a);
        if (!dom || INTERNAL_DOMAINS.has(dom)) return false;
        return true;
      });

      if (external.length === 0) {
        stats.skipped_internal += 1;
        continue;
      }

      const leadId = await findLeadIdByEmail(supabase, external);
      if (leadId) stats.matched += 1;

      const { text, html } = extractBody(msg.payload);
      const preview = (text || html.replace(/<[^>]+>/g, " ")).slice(0, 280).replace(/\s+/g, " ").trim();

      const emailDate = dateRaw ? new Date(dateRaw).toISOString() :
        msg.internalDate ? new Date(parseInt(msg.internalDate)).toISOString() :
        new Date().toISOString();

      const insertRow = {
        lead_id: leadId ?? "unmatched",
        provider_message_id: mid,
        message_id: rfc822Id || null,
        thread_id: msg.threadId ?? "",
        direction,
        from_address: from.address,
        from_name: from.name,
        to_addresses: toList,
        cc_addresses: ccList,
        bcc_addresses: bccList,
        subject,
        body_text: text,
        body_html: html,
        body_preview: preview,
        email_date: emailDate,
        source: "gmail",
        is_read: !(msg.labelIds || []).includes("UNREAD"),
        raw_payload: { gmail_label_ids: msg.labelIds ?? [] },
      };

      const { error: insertErr } = await supabase.from("lead_emails").insert(insertRow);
      if (insertErr) {
        stats.errors.push(`insert ${mid}: ${insertErr.message.slice(0, 120)}`);
      } else {
        stats.inserted += 1;
      }
    } catch (e) {
      stats.errors.push(`msg ${mid}: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // Persist history_id + last_synced_at
  await supabase
    .from("user_email_connections")
    .update({
      history_id: latestHistoryId ?? connection.history_id,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return stats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const onlyConnId = body.connection_id as string | undefined;

    const query = supabase
      .from("user_email_connections")
      .select("id, email_address, history_id")
      .eq("provider", "gmail")
      .eq("is_active", true);
    if (onlyConnId) query.eq("id", onlyConnId);

    const { data: conns, error } = await query;
    if (error) throw error;

    const results: SyncStats[] = [];
    for (const c of conns ?? []) {
      const stats = await syncOneConnection(supabase, c as { id: string; email_address: string; history_id: string | null });
      results.push(stats);
    }

    const summary = results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        inserted: acc.inserted + r.inserted,
        matched: acc.matched + r.matched,
        skipped_dup: acc.skipped_dup + r.skipped_dup,
        skipped_internal: acc.skipped_internal + r.skipped_internal,
      }),
      { fetched: 0, inserted: 0, matched: 0, skipped_dup: 0, skipped_internal: 0 },
    );

    return new Response(JSON.stringify({ ok: true, summary, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-gmail-emails error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
