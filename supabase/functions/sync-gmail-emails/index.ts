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

// Personal/system/free mailbox providers — NEVER use for domain-fallback inference.
// Includes parent corporate domains (google.com, apple.com, microsoft.com) so system
// emails like workspace@google.com or calendar-notification@google.com don't get
// stapled to a random lead via Tier 4 domain match.
const PERSONAL_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "msn.com", "live.com", "me.com", "mac.com", "protonmail.com",
  "proton.me", "yahoo.co.uk", "googlemail.com", "ymail.com",
  "google.com", "apple.com", "microsoft.com", "mail.com", "zoho.com",
  "qq.com", "163.com", "pm.me", "tutanota.com", "fastmail.com", "gmx.com",
]);

// Sender addresses/local-parts that are pure system noise — never belong to a deal.
// If every external participant matches one of these, the email goes to Unmatched.
const SYSTEM_NOISE_LOCALPARTS = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon",
  "postmaster", "bounces", "bounce", "notifications", "notification",
  "calendar-notification", "workspace", "billing", "support",
  "accounts", "account", "alerts", "alert", "info", "hello",
]);

function isSystemNoise(addr: string): boolean {
  if (!addr || !addr.includes("@")) return true;
  const local = addr.split("@")[0].toLowerCase();
  if (SYSTEM_NOISE_LOCALPARTS.has(local)) return true;
  if (local.startsWith("noreply") || local.startsWith("no-reply")) return true;
  if (local.startsWith("notification")) return true;
  if (local.startsWith("calendar-")) return true;
  if (local.startsWith("bounce")) return true;
  if (local.includes("+caf_")) return true; // Google Calendar autoresponder pattern
  return false;
}

async function resolveCanonicalLeadId(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
): Promise<string> {
  let current = leadId;
  for (let i = 0; i < 3; i++) {
    const { data } = await supabase
      .from("leads")
      .select("id, is_duplicate, duplicate_of")
      .eq("id", current)
      .maybeSingle();
    const row = data as { id: string; is_duplicate?: boolean; duplicate_of?: string } | null;
    if (!row) return current;
    if (!row.is_duplicate || !row.duplicate_of || row.duplicate_of === current) return row.id;
    current = row.duplicate_of;
  }
  return current;
}

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

  // 1) PRIMARY email match — prefer canonical (non-duplicate, non-archived) leads.
  // Order by is_duplicate ASC + archived_at NULLS FIRST so a live primary always wins
  // over an archived/duplicate that happens to share the address.
  const { data: exact } = await supabase
    .from("leads")
    .select("id, email, is_duplicate, archived_at")
    .in("email", lowered)
    .order("is_duplicate", { ascending: true })
    .order("archived_at", { ascending: true, nullsFirst: true })
    .limit(1);
  if (exact && exact.length > 0) return await resolveCanonicalLeadId(supabase, (exact[0] as { id: string }).id);

  // 2) Secondary contacts (JSONB array on leads): CFO/attorney attached to a deal.
  // ONLY runs if no PRIMARY match exists — primary always wins to avoid stapling
  // a prospect's emails to a different deal that listed them as a secondary.
  for (const addr of lowered) {
    if (!addr) continue;
    const { data: sec } = await supabase
      .from("leads")
      .select("id")
      .filter("secondary_contacts", "cs", JSON.stringify([{ email: addr }]))
      .is("archived_at", null)
      .eq("is_duplicate", false)
      .limit(1);
    if (sec && sec.length > 0) return await resolveCanonicalLeadId(supabase, (sec[0] as { id: string }).id);
  }

  // 3) Stakeholders table (no-op until populated, then live)
  const { data: stake } = await supabase
    .from("lead_stakeholders")
    .select("lead_id")
    .in("email", lowered)
    .limit(1);
  if (stake && stake.length > 0) return await resolveCanonicalLeadId(supabase, (stake[0] as { lead_id: string }).lead_id);

  // Pre-check: if EVERY external participant is a system-noise sender, refuse to
  // match. These are calendar invites, workspace notifications, bounce backs, etc.
  // — they belong in Unmatched, not stapled to a deal that happens to share a domain.
  const allNoise = lowered.every((a) => isSystemNoise(a));
  if (allNoise) return null;

  // 4) Domain fallback — STRICT.
  //   - Skip personal/system mailbox providers entirely (gmail.com, google.com, etc.)
  //   - Only match if EXACTLY ONE non-archived lead claims this domain
  //   - AND at least one participant local-part is a confirmed contact for that lead
  //     (primary email, secondary contact, or stakeholder). Pure same-domain colleague
  //     threads (e.g. random@oilchangers.com -> different@oilchangers.com) go to Unmatched.
  const domains = Array.from(new Set(
    lowered.map(domainOf).filter((d) =>
      d && !INTERNAL_DOMAINS.has(d) && !PERSONAL_PROVIDERS.has(d)
    ),
  ));
  if (domains.length === 0) return null;
  for (const d of domains) {
    const { data: hits } = await supabase
      .from("leads")
      .select("id, email, secondary_contacts")
      .or(`email.ilike.%@${d},company_url.ilike.%${d}%`)
      .is("archived_at", null)
      .eq("is_duplicate", false)
      .limit(2);
    if (!hits || hits.length !== 1) continue;
    const cand = hits[0] as { id: string; email: string | null; secondary_contacts: any };

    // Confirmed-participant guard: at least one participant must match a known
    // contact for this lead (primary, secondary, or stakeholder).
    const knownContacts = new Set<string>();
    const primary = (cand.email || "").toLowerCase().trim();
    if (primary) knownContacts.add(primary);
    const sec = Array.isArray(cand.secondary_contacts) ? cand.secondary_contacts : [];
    for (const c of sec) {
      const e = (c?.email || "").toLowerCase().trim();
      if (e) knownContacts.add(e);
    }
    const { data: stakes } = await supabase
      .from("lead_stakeholders")
      .select("email")
      .eq("lead_id", cand.id);
    for (const s of (stakes || []) as Array<{ email: string | null }>) {
      const e = (s.email || "").toLowerCase().trim();
      if (e) knownContacts.add(e);
    }
    let confirmed = false;
    for (const p of lowered) {
      if (knownContacts.has(p)) { confirmed = true; break; }
    }
    if (!confirmed) continue; // domain matches but no real contact in thread → skip

    return await resolveCanonicalLeadId(supabase, cand.id);
  }
  return null;
}

/**
 * Auto-stakeholder discovery (passive coverage expansion).
 * After a successful corporate-domain match (Tier 4 OR primary/secondary that
 * uncovered a thread participant we don't yet know about), upsert any external
 * participant who isn't already a known contact for this lead as a stakeholder.
 * Future emails from that address will then route via Tier 3 directly.
 *
 * Safety: only fires when leadId is non-null (i.e., we already trust the match).
 * Skips system-noise senders, internal/personal-provider domains, and the
 * lead's own primary/secondary/existing stakeholder addresses. Idempotent —
 * uses INSERT with a uniqueness check on (lead_id, email).
 */
async function maybeAutoAddStakeholder(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  external: string[],
  fromName: string,
  fromAddress: string,
): Promise<void> {
  try {
    if (!leadId || leadId === "unmatched") return;
    if (external.length === 0) return;

    // Load lead + existing stakeholders to compute known set
    const { data: leadRow } = await supabase
      .from("leads")
      .select("email, secondary_contacts, company")
      .eq("id", leadId)
      .maybeSingle();
    if (!leadRow) return;
    const lead = leadRow as { email: string | null; secondary_contacts: any; company: string | null };

    const known = new Set<string>();
    const primary = (lead.email || "").toLowerCase().trim();
    if (primary) known.add(primary);
    const sec = Array.isArray(lead.secondary_contacts) ? lead.secondary_contacts : [];
    for (const c of sec) {
      const e = (c?.email || "").toLowerCase().trim();
      if (e) known.add(e);
    }
    const { data: stakes } = await supabase
      .from("lead_stakeholders")
      .select("email")
      .eq("lead_id", leadId);
    for (const s of (stakes || []) as Array<{ email: string | null }>) {
      const e = (s.email || "").toLowerCase().trim();
      if (e) known.add(e);
    }

    const leadDomain = primary ? domainOf(primary) : "";
    for (const addr of external) {
      const lower = addr.toLowerCase();
      if (!lower || known.has(lower)) continue;
      if (isSystemNoise(lower)) continue;
      const dom = domainOf(lower);
      if (!dom || INTERNAL_DOMAINS.has(dom) || PERSONAL_PROVIDERS.has(dom)) continue;
      // Only auto-add same-corporate-domain colleagues — never strangers from other companies
      // who happen to be cc'd on a thread (e.g., bankers, lawyers from external firms).
      if (leadDomain && dom !== leadDomain) continue;

      // Use from_name only if the address we're adding matches the from address
      const candidateName = (lower === (fromAddress || "").toLowerCase()) ? (fromName || "").trim() : "";
      await supabase.from("lead_stakeholders").insert({
        lead_id: leadId,
        email: lower,
        name: candidateName,
        role: "Discovered via email thread",
        notes: "Auto-added from inbound email correspondence",
        sentiment: "neutral",
        last_contacted: new Date().toISOString(),
      });
      known.add(lower);
    }
  } catch (e) {
    // Stakeholder discovery is best-effort; never fail a sync because of it.
    console.error("auto-stakeholder (non-fatal):", (e as Error).message);
  }
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
  started_at: string;
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

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
  let attempt = 0;
  let lastRes: Response | null = null;
  while (attempt < maxAttempts) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) return res;
    lastRes = res;
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader && /^\d+$/.test(retryAfterHeader)
      ? parseInt(retryAfterHeader) * 1000
      : Math.min(4000, 1000 * Math.pow(2, attempt));
    await new Promise((r) => setTimeout(r, retryAfterMs));
    attempt += 1;
  }
  return lastRes!;
}

async function fetchMessage(token: string, id: string): Promise<GmailMessage | null> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return await res.json() as GmailMessage;
}

async function getMailboxProfileHistoryId(token: string): Promise<string | null> {
  const res = await fetchWithRetry("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json() as { historyId?: string };
  return json.historyId ?? null;
}

// Bounce detection — Gmail delivers DSNs from mailer-daemon@ with a Subject like
// "Delivery Status Notification (Failure)". We extract the failed recipient from the
// body or X-Failed-Recipients header. Returns null if it's not a bounce.
function detectBounce(msg: GmailMessage, fromAddress: string, subject: string, bodyText: string): { recipient: string; reason: string } | null {
  const isDaemon = /mailer-daemon|postmaster/i.test(fromAddress);
  const isDsn = /delivery status notification|undeliverable|delivery has failed|address not found/i.test(subject)
    || /delivery status notification|message not delivered|550 5\.|address not found|user unknown/i.test(bodyText);
  if (!isDaemon && !isDsn) return null;
  const xFailed = header(msg.payload, "X-Failed-Recipients");
  let recipient = "";
  if (xFailed) recipient = xFailed.trim().toLowerCase();
  if (!recipient) {
    const m = bodyText.match(/(?:to:|recipient:|<)\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
    if (m) recipient = m[1].toLowerCase();
  }
  if (!recipient) return null;
  const reasonMatch = bodyText.match(/(550 5\.[\d.]+[^\n]{0,180})/i)
    || bodyText.match(/(reason:[^\n]{0,180})/i)
    || bodyText.match(/(diagnostic-code:[^\n]{0,180})/i);
  const reason = (reasonMatch ? reasonMatch[1] : "delivery failed").trim().slice(0, 240);
  return { recipient, reason };
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
    started_at: new Date().toISOString(),
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
      // First-run: do NOT do the legacy 1500-message synchronous fetch.
      // The backfill orchestrator (start-email-backfill → discover → hydrate) owns first-run.
      // Just stamp the current historyId so subsequent incremental syncs work normally.
      stats.mode = "first_run_skipped";
      latestHistoryId = await getMailboxProfileHistoryId(token);
      messageIds = [];
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
      if (leadId) {
        stats.matched += 1;
        // Passive coverage expansion: add same-domain colleagues uncovered via this thread.
        await maybeAutoAddStakeholder(supabase, leadId, external, from.name, from.address);
      }

      const { text, html } = extractBody(msg.payload);
      const preview = (text || html.replace(/<[^>]+>/g, " ")).slice(0, 280).replace(/\s+/g, " ").trim();

      // Round 6 — auto-park noise classes (out-of-office, role-based, calendar)
      // BEFORE writing as unmatched. We only override when the matcher didn't
      // already attach the email to a real lead (matched messages always win).
      let parkedSentinel: string | null = null;
      if (!leadId) {
        const { classifyEmail, sentinelForClass } = await import("../_shared/classify-email.ts");
        const cls = classifyEmail({ fromAddress: from.address, subject, bodyPreview: preview });
        parkedSentinel = sentinelForClass(cls);
        if (parkedSentinel) stats.skipped_internal += 0; // counted via inserted below
      }

      const emailDate = dateRaw ? new Date(dateRaw).toISOString() :
        msg.internalDate ? new Date(parseInt(msg.internalDate)).toISOString() :
        new Date().toISOString();

      // Bounce detection — DSN messages from mailer-daemon. When detected, mark the
      // most recent outbound row to that recipient as bounced and auto-quarantine
      // the lead after 2 hard bounces.
      const bounce = detectBounce(msg, from.address, subject, text || preview);
      if (bounce) {
        const { data: outboundMatch } = await supabase
          .from("lead_emails")
          .select("id, lead_id")
          .eq("direction", "outbound")
          .contains("to_addresses", [bounce.recipient])
          .order("email_date", { ascending: false })
          .limit(1);
        const target = outboundMatch?.[0] as { id: string; lead_id: string } | undefined;
        if (target) {
          await supabase.from("lead_emails")
            .update({ bounce_reason: bounce.reason, send_status: "failed" })
            .eq("id", target.id);
          const { count: bounceCount } = await supabase
            .from("lead_emails")
            .select("id", { count: "exact", head: true })
            .eq("direction", "outbound")
            .contains("to_addresses", [bounce.recipient])
            .neq("bounce_reason", "");
          if (target.lead_id && target.lead_id !== "unmatched" && (bounceCount ?? 0) >= 2) {
            await supabase.from("lead_email_metrics")
              .upsert({ lead_id: target.lead_id, email_quarantined: true, updated_at: new Date().toISOString() }, { onConflict: "lead_id" });
          }
        }
      }

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
        send_status: bounce ? "failed" : "sent",
        bounce_reason: bounce?.reason ?? "",
        raw_payload: { gmail_label_ids: msg.labelIds ?? [] },
      };

      const { data: insertedRow, error: insertErr } = await supabase
        .from("lead_emails")
        .insert(insertRow)
        .select("id")
        .single();
      if (insertErr) {
        stats.errors.push(`insert ${mid}: ${insertErr.message.slice(0, 120)}`);
      } else {
        stats.inserted += 1;

        // Round 5 — multi-recipient outbound fan-out. When a single outbound
        // message is addressed to MULTIPLE distinct lead primaries, only the
        // first one is bound to insertRow.lead_id by the matcher above. Insert
        // sibling rows for any OTHER lead primaries on the same to_addresses
        // list so each deal-room sees the conversation. Each sibling shares
        // the rfc822 message_id but gets a synthetic provider_message_id to
        // avoid the unique constraint.
        if (direction === "outbound" && leadId && toList.length > 1) {
          try {
            const { data: peerLeads } = await supabase
              .from("leads")
              .select("id, email")
              .in("email", toList)
              .neq("id", leadId)
              .is("archived_at", null)
              .eq("is_duplicate", false);
            for (const peer of (peerLeads || []) as Array<{ id: string; email: string }>) {
              const peerInsert = {
                ...insertRow,
                lead_id: peer.id,
                provider_message_id: `${mid}#peer-${peer.id}`,
                raw_payload: { ...(insertRow.raw_payload as Record<string, unknown>), peer_of: (insertedRow as { id: string }).id },
              };
              await supabase.from("lead_emails").insert(peerInsert);
            }
          } catch (e) {
            // Non-fatal — primary insert succeeded.
            console.warn("multi-recipient dup failed", (e as Error).message);
          }
        }

        // Reply detection — when an inbound matched to a lead lands in a thread that
        // already has an outbound, stamp replied_at on that outbound row.
        if (direction === "inbound" && leadId && msg.threadId && insertedRow) {
          const { data: prevOutbound } = await supabase
            .from("lead_emails")
            .select("id")
            .eq("lead_id", leadId)
            .eq("thread_id", msg.threadId)
            .eq("direction", "outbound")
            .is("replied_at", null)
            .order("email_date", { ascending: false })
            .limit(1);
          const replyTarget = prevOutbound?.[0] as { id: string } | undefined;
          if (replyTarget) {
            await supabase.from("lead_emails")
              .update({ replied_at: emailDate })
              .eq("id", replyTarget.id);

            // If the matched outbound carried a sequence_step, log a sequence_paused
            // activity row so the Activities tab shows "[S5 paused on reply]" under the inbound.
            const { data: stepRow } = await supabase
              .from("lead_emails")
              .select("sequence_step")
              .eq("id", replyTarget.id)
              .maybeSingle();
            const step = (stepRow as { sequence_step?: string | null } | null)?.sequence_step;
            if (step) {
              await supabase.from("lead_activity_log").insert({
                lead_id: leadId,
                event_type: "sequence_paused",
                description: `Sequence ${step} auto-paused on reply`,
                new_value: step,
                metadata: { trigger: "inbound_reply", inbound_email_id: (insertedRow as { id: string }).id },
              });
            }
          }
        }

        // Activity log + last_contact bump for matched inbound emails — feeds the
        // unanswered-emails action chip and keeps the deal-room timeline current.
        if (direction === "inbound" && leadId) {
          await supabase.from("lead_activity_log").insert({
            lead_id: leadId,
            event_type: "email_received",
            description: `Email received: ${(subject || "(no subject)").slice(0, 200)}`,
            new_value: from.address,
          });
          await supabase.from("leads")
            .update({ last_contact_date: emailDate.split("T")[0] })
            .eq("id", leadId);

          // Inbound-reply intelligence:
          //   1) Auto-discard any pending stall draft — the reply obviates the soft nudge.
          //   2) For active selling stages, queue a contextual reply draft via generate-stage-draft.
          // Idempotent: action_key = `reply-<inserted_email_id>` is unique to this inbound row.
          try {
            // 1) Discard pending stall drafts for this lead
            await (supabase as any)
              .from("lead_drafts")
              .update({ status: "superseded", updated_at: new Date().toISOString() })
              .eq("lead_id", leadId)
              .like("action_key", "stage-stall-%")
              .eq("status", "draft");

            // 2) Trigger reply draft for active selling stages
            const { data: leadRow } = await supabase
              .from("leads")
              .select("stage")
              .eq("id", leadId)
              .single();
            const stage = (leadRow as { stage?: string } | null)?.stage || "";
            const replyStages = new Set([
              "Proposal Sent", "Negotiating", "Negotiation",
              "Sample Sent", "Meeting Held", "Discovery Completed",
            ]);
            if (replyStages.has(stage)) {
              const insertedId = (insertedRow as { id: string }).id;
              // Fire-and-forget; never block the sync loop on AI gateway latency.
              fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-stage-draft`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({
                  lead_id: leadId,
                  new_stage: stage,
                  trigger: "reply",
                  inbound_email_id: insertedId,
                }),
              }).catch((err) => console.error("reply-draft trigger failed:", err));
            }
          } catch (replyErr) {
            console.error("inbound-reply hook (non-fatal):", replyErr);
          }
        }
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

  // Audit log: persist this sync run so the UI can render history without scraping logs.
  // Non-fatal — never let a logging failure mask the sync result.
  // Skip noisy zero-effect incremental rows (every 10min cron tick on an idle mailbox)
  // — they bloat the table and bury real backfill summaries in the UI.
  const isNoiseRow =
    stats.mode === "incremental" &&
    stats.fetched === 0 &&
    stats.inserted === 0 &&
    stats.errors.length === 0;
  if (!isNoiseRow) {
    try {
      const status = stats.errors.length === 0
        ? "success"
        : stats.inserted > 0 ? "partial" : "failed";
      await supabase.from("email_sync_runs").insert({
        connection_id: connection.id,
        email_address: connection.email_address,
        mode: stats.mode === "incremental" ? "incremental" : "first_run",
        started_at: stats.started_at,
        finished_at: new Date().toISOString(),
        fetched: stats.fetched,
        inserted: stats.inserted,
        matched: stats.matched,
        unmatched: Math.max(0, stats.inserted - stats.matched),
        skipped: stats.skipped_dup + stats.skipped_internal,
        errors: stats.errors,
        status,
      });
    } catch (logErr) {
      console.error("email_sync_runs insert failed (non-fatal):", logErr);
    }
  }

  return stats;
}

// Server-side auto-enroll: if a connection has been live past first-run
// (history_id IS NOT NULL) and never had a backfill job, queue the 90d backfill
// once. Guarantees existing connections get historical data without depending
// on the user opening MailboxSettings. The 1-hour last_synced_at gate prevents
// fighting a fresh OAuth flow's own auto-fire from the callback.
async function maybeAutoEnrollBackfill(
  supabase: ReturnType<typeof createClient>,
  conn: { id: string; history_id: string | null },
): Promise<boolean> {
  try {
    if (!conn.history_id) return false;
    const { data: jobs } = await supabase
      .from("email_backfill_jobs")
      .select("id")
      .eq("connection_id", conn.id)
      .limit(1);
    if (jobs && jobs.length > 0) return false;
    const { data: connRow } = await supabase
      .from("user_email_connections")
      .select("last_synced_at")
      .eq("id", conn.id)
      .single();
    const lastSynced = (connRow as { last_synced_at: string | null } | null)?.last_synced_at;
    if (lastSynced && Date.now() - new Date(lastSynced).getTime() < 3600_000) return false;
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/start-email-backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ connection_id: conn.id, target_window: "90d" }),
    }).catch((e) => console.error("auto-enroll dispatch failed:", e));
    return true;
  } catch (e) {
    console.error("auto-enroll guard failed (non-fatal):", e);
    return false;
  }
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
    // force_full=true ignores stored history_id so the sync runs the 90-day
    // first-run backfill even on mailboxes that already have a history_id.
    // Used by the "Backfill 90 days" button in Settings to drain historical
    // thread activity onto existing leads that were created after first-sync.
    const forceFull = body.force_full === true;

    const query = supabase
      .from("user_email_connections")
      .select("id, email_address, history_id")
      .eq("provider", "gmail")
      .eq("is_active", true);
    if (onlyConnId) query.eq("id", onlyConnId);

    const { data: conns, error } = await query;
    if (error) throw error;

    const results: SyncStats[] = [];
    const skipped: Array<{ connection_id: string; email: string; reason: string }> = [];
    const autoEnrolled: string[] = [];
    for (const c of conns ?? []) {
      const conn = c as { id: string; email_address: string; history_id: string | null };

      // Defer to the backfill orchestrator if a backfill job is active for this connection.
      // Avoids racing the orchestrator + chewing Gmail quota.
      if (!forceFull) {
        const { data: activeJobs } = await supabase
          .from("email_backfill_jobs")
          .select("id, status")
          .eq("connection_id", conn.id)
          .in("status", ["queued", "discovering", "running", "paused"])
          .limit(1);
        if (activeJobs && activeJobs.length > 0) {
          skipped.push({ connection_id: conn.id, email: conn.email_address, reason: "backfill_in_progress" });
          continue;
        }

        // Auto-enroll: if this is a live connection that has never had a backfill,
        // queue 90d in the background and skip this tick (the orchestrator owns it).
        const enrolled = await maybeAutoEnrollBackfill(supabase, conn);
        if (enrolled) {
          autoEnrolled.push(conn.id);
          skipped.push({ connection_id: conn.id, email: conn.email_address, reason: "auto_enrolled_backfill" });
          continue;
        }
      }

      // Null out history_id locally to force the full 90-day backfill path.
      // The sync will set latest history_id at the end so next incremental runs work normally.
      const effective = forceFull ? { ...conn, history_id: null } : conn;
      const stats = await syncOneConnection(supabase, effective);
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

    // Cron log so Automation Health can flag stale Gmail sync (parity with sync-outlook-emails).
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
    try {
      await supabase.from("cron_run_log").insert({
        job_name: "sync-gmail-emails",
        status: totalErrors > 0 ? "partial" : "success",
        items_processed: summary.inserted,
        details: {
          connections: results.length,
          skipped,
          auto_enrolled: autoEnrolled,
          results: results.map(r => ({ email: r.email, fetched: r.fetched, inserted: r.inserted, matched: r.matched })),
        },
      });
    } catch (logErr) {
      console.error("cron_run_log insert failed (non-fatal):", logErr);
    }

    const allSkipped = results.length === 0 && skipped.length > 0;
    return new Response(
      JSON.stringify({ ok: true, summary, results, skipped: allSkipped, deferred: skipped, reason: allSkipped ? "backfill_in_progress" : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-gmail-emails error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
