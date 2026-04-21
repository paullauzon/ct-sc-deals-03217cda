// Phase 2 — hydration.
// Pulls N pending queue rows, fetches full message bodies from the provider,
// runs lead matching, batch-inserts into lead_emails, marks queue rows done.
// Updates job counters. Self-reschedules if more pending rows remain.
//
// Invoked by:
//   - backfill-discover after discovery completes (warm start)
//   - pg_cron (every minute) to grind through any remaining work
//   - itself (self-reschedule) when one batch finishes and more remain
//
// Idempotent: uq_lead_emails_provider_message + uq_backfill_queue prevent dups.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAINS = new Set(["captarget.com", "sourcecodeals.com"]);
// Personal mailbox providers — NEVER use for domain-fallback inference.
// Many leads share these domains, so a domain hit is meaningless.
const PERSONAL_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "msn.com", "live.com", "me.com", "mac.com", "protonmail.com",
  "proton.me", "yahoo.co.uk", "googlemail.com", "ymail.com",
]);
const BATCH_SIZE = 100; // ~40s at 400ms/msg — well inside wall-time
const MAX_BATCHES_PER_INVOCATION = 2;

// Resolve a lead id, following duplicate_of to the canonical record.
async function resolveCanonicalLeadId(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
): Promise<string> {
  // Walk up at most 3 hops to avoid pathological loops in dirty data.
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

function domainOf(email: string): string {
  return email.includes("@") ? email.split("@")[1].toLowerCase() : "";
}

function isInternal(email: string): boolean {
  return INTERNAL_DOMAINS.has(domainOf(email));
}

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
  let attempt = 0;
  let lastRes: Response | null = null;
  while (attempt < maxAttempts) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) return res;
    lastRes = res;
    const ra = res.headers.get("Retry-After");
    const ms = ra && /^\d+$/.test(ra) ? parseInt(ra) * 1000 : Math.min(4000, 1000 * Math.pow(2, attempt));
    await new Promise((r) => setTimeout(r, ms));
    attempt += 1;
  }
  return lastRes!;
}

async function getValidGmailToken(supabase: ReturnType<typeof createClient>, connectionId: string): Promise<string> {
  const { data: conn } = await supabase.from("user_email_connections").select("*").eq("id", connectionId).single();
  if (!conn) throw new Error("connection not found");
  const c = conn as { access_token: string; refresh_token: string; token_expires_at: string | null };
  const expiresAt = c.token_expires_at ? new Date(c.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 && c.access_token) return c.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: c.refresh_token, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`gmail token refresh failed: ${res.status}`);
  const t = await res.json() as { access_token: string; expires_in: number };
  await supabase.from("user_email_connections").update({
    access_token: t.access_token,
    token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", connectionId);
  return t.access_token;
}

async function getValidOutlookToken(supabase: ReturnType<typeof createClient>, connectionId: string): Promise<string> {
  const { data: conn } = await supabase.from("user_email_connections").select("*").eq("id", connectionId).single();
  if (!conn) throw new Error("connection not found");
  const c = conn as { access_token: string; refresh_token: string; token_expires_at: string | null };
  const expiresAt = c.token_expires_at ? new Date(c.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 && c.access_token) return c.access_token;
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MICROSOFT_CLIENT_ID")!,
      client_secret: Deno.env.get("MICROSOFT_CLIENT_SECRET")!,
      refresh_token: c.refresh_token, grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access",
    }),
  });
  if (!res.ok) throw new Error(`outlook token refresh failed: ${res.status}`);
  const t = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const upd: Record<string, unknown> = {
    access_token: t.access_token,
    token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (t.refresh_token) upd.refresh_token = t.refresh_token;
  await supabase.from("user_email_connections").update(upd).eq("id", connectionId);
  return t.access_token;
}

interface GmailPayload {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: GmailPayload[];
}

function header(payload: GmailPayload, name: string): string {
  const lower = name.toLowerCase();
  return payload.headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

function decodeBase64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    return new TextDecoder("utf-8").decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
  } catch { return ""; }
}

function extractBody(payload: GmailPayload): { text: string; html: string } {
  let text = "", html = "";
  const walk = (p: GmailPayload) => {
    const m = (p.mimeType || "").toLowerCase();
    if (m === "text/plain" && p.body?.data && !text) text = decodeBase64Url(p.body.data);
    else if (m === "text/html" && p.body?.data && !html) html = decodeBase64Url(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(payload);
  return { text, html };
}

function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((p) => {
    const m = p.match(/<([^>]+)>/);
    return (m ? m[1] : p).trim().toLowerCase();
  }).filter((a) => a.includes("@"));
}

function parseFromAddress(raw: string): { name: string; address: string } {
  if (!raw) return { name: "", address: "" };
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || "").trim(), address: m[2].trim().toLowerCase() };
  return { name: "", address: raw.trim().toLowerCase() };
}

async function findLeadIdByEmail(supabase: ReturnType<typeof createClient>, candidates: string[]): Promise<string | null> {
  if (candidates.length === 0) return null;
  const lowered = candidates.map((c) => c.toLowerCase());

  // 1) PRIMARY email match — prefer canonical (non-duplicate, non-archived).
  const { data: exact } = await supabase
    .from("leads")
    .select("id, email, is_duplicate, archived_at")
    .in("email", lowered)
    .order("is_duplicate", { ascending: true })
    .order("archived_at", { ascending: true, nullsFirst: true })
    .limit(1);
  if (exact && exact.length > 0) return await resolveCanonicalLeadId(supabase, (exact[0] as { id: string }).id);

  // 2) Secondary contacts — ONLY runs if no primary match. Primary always wins.
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

  // 3) Stakeholders table (free even when empty; activates the moment data exists)
  const { data: stake } = await supabase
    .from("lead_stakeholders")
    .select("lead_id")
    .in("email", lowered)
    .limit(1);
  if (stake && stake.length > 0) return await resolveCanonicalLeadId(supabase, (stake[0] as { lead_id: string }).lead_id);

  // 4) Domain fallback — STRICT.
  //   - Skip personal mailbox providers entirely (gmail.com, etc.)
  //   - Only match if EXACTLY ONE non-archived lead claims this domain
  //   - Otherwise return null → email lands in Unmatched Inbox for manual review
  const domains = Array.from(new Set(
    lowered.map(domainOf).filter((d) =>
      d && !INTERNAL_DOMAINS.has(d) && !PERSONAL_PROVIDERS.has(d)
    ),
  ));
  if (domains.length === 0) return null;
  for (const d of domains) {
    const { data: hits } = await supabase
      .from("leads")
      .select("id")
      .or(`email.ilike.%@${d},company_url.ilike.%${d}%`)
      .is("archived_at", null)
      .eq("is_duplicate", false)
      .limit(2);
    if (hits && hits.length === 1) {
      return await resolveCanonicalLeadId(supabase, (hits[0] as { id: string }).id);
    }
    // hits.length === 0 → try next domain; hits.length >= 2 → ambiguous, skip
  }
  return null;
}

async function processBatchGmail(
  supabase: ReturnType<typeof createClient>,
  job: { id: string; connection_id: string; email_address: string },
  rows: Array<{ id: number; provider_message_id: string }>,
): Promise<{ inserted: number; matched: number; skipped: number; errors: number }> {
  const token = await getValidGmailToken(supabase, job.connection_id);
  const ownAddress = job.email_address.toLowerCase();
  const ids = rows.map((r) => r.provider_message_id);
  const { data: dups } = await supabase.from("lead_emails").select("provider_message_id").in("provider_message_id", ids);
  const dupSet = new Set((dups || []).map((d: any) => d.provider_message_id));
  let inserted = 0, matched = 0, skipped = 0, errors = 0;
  const queueDoneIds: number[] = [];
  const queueSkippedIds: number[] = [];

  for (const r of rows) {
    if (dupSet.has(r.provider_message_id)) {
      queueSkippedIds.push(r.id); skipped++; continue;
    }
    try {
      const res = await fetchWithRetry(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${r.provider_message_id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        if (res.status === 404) { queueSkippedIds.push(r.id); skipped++; continue; }
        errors++;
        await supabase.from("email_backfill_queue").update({
          status: "error", attempts: 1,
          last_error: `gmail get ${res.status}`,
          processed_at: new Date().toISOString(),
        }).eq("id", r.id);
        continue;
      }
      const msg = await res.json() as { id: string; threadId: string; labelIds?: string[]; payload: GmailPayload; internalDate?: string };

      const rfc822 = header(msg.payload, "Message-ID") || header(msg.payload, "Message-Id");
      const xCrm = header(msg.payload, "X-CRM-Source");
      if (xCrm || (rfc822 || "").includes("<crm-")) {
        queueSkippedIds.push(r.id); skipped++; continue;
      }

      const subject = header(msg.payload, "Subject");
      const from = parseFromAddress(header(msg.payload, "From"));
      const toList = parseAddressList(header(msg.payload, "To"));
      const ccList = parseAddressList(header(msg.payload, "Cc"));
      const bccList = parseAddressList(header(msg.payload, "Bcc"));
      const dateRaw = header(msg.payload, "Date");

      const direction = from.address === ownAddress ? "outbound" : "inbound";
      const allParticipants = [from.address, ...toList, ...ccList, ...bccList];
      const external = allParticipants.filter((a) => a && a !== ownAddress && !isInternal(a));
      if (external.length === 0) { queueSkippedIds.push(r.id); skipped++; continue; }

      const leadId = await findLeadIdByEmail(supabase, external);
      if (leadId) matched++;

      const { text, html } = extractBody(msg.payload);
      const preview = (text || html.replace(/<[^>]+>/g, " ")).slice(0, 280).replace(/\s+/g, " ").trim();
      const emailDate = dateRaw ? new Date(dateRaw).toISOString() :
        msg.internalDate ? new Date(parseInt(msg.internalDate)).toISOString() :
        new Date().toISOString();

      const { error: insErr } = await supabase.from("lead_emails").insert({
        lead_id: leadId ?? "unmatched",
        provider_message_id: r.provider_message_id,
        message_id: rfc822 || null,
        thread_id: msg.threadId ?? "",
        direction, from_address: from.address, from_name: from.name,
        to_addresses: toList, cc_addresses: ccList, bcc_addresses: bccList,
        subject, body_text: text, body_html: html, body_preview: preview,
        email_date: emailDate, source: "gmail",
        is_read: !(msg.labelIds || []).includes("UNREAD"),
        send_status: "sent",
        raw_payload: { gmail_label_ids: msg.labelIds ?? [], backfill: true },
      });
      if (insErr) {
        if (insErr.code === "23505") { queueSkippedIds.push(r.id); skipped++; continue; }
        errors++;
        await supabase.from("email_backfill_queue").update({
          status: "error", attempts: 1,
          last_error: insErr.message.slice(0, 200),
          processed_at: new Date().toISOString(),
        }).eq("id", r.id);
        continue;
      }
      inserted++;
      queueDoneIds.push(r.id);
    } catch (e) {
      errors++;
      await supabase.from("email_backfill_queue").update({
        status: "error", attempts: 1,
        last_error: (e as Error).message.slice(0, 200),
        processed_at: new Date().toISOString(),
      }).eq("id", r.id);
    }
  }

  if (queueDoneIds.length > 0) {
    await supabase.from("email_backfill_queue").update({
      status: "done", processed_at: new Date().toISOString(),
    }).in("id", queueDoneIds);
  }
  if (queueSkippedIds.length > 0) {
    await supabase.from("email_backfill_queue").update({
      status: "skipped", processed_at: new Date().toISOString(),
    }).in("id", queueSkippedIds);
  }

  return { inserted, matched, skipped, errors };
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  bccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
}

async function processBatchOutlook(
  supabase: ReturnType<typeof createClient>,
  job: { id: string; connection_id: string; email_address: string },
  rows: Array<{ id: number; provider_message_id: string }>,
): Promise<{ inserted: number; matched: number; skipped: number; errors: number }> {
  const token = await getValidOutlookToken(supabase, job.connection_id);
  const ownAddress = job.email_address.toLowerCase();
  const ids = rows.map((r) => r.provider_message_id);
  const { data: dups } = await supabase.from("lead_emails").select("provider_message_id").in("provider_message_id", ids);
  const dupSet = new Set((dups || []).map((d: any) => d.provider_message_id));
  const SELECT = "id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,internetMessageHeaders";

  let inserted = 0, matched = 0, skipped = 0, errors = 0;
  const queueDoneIds: number[] = [];
  const queueSkippedIds: number[] = [];

  for (const r of rows) {
    if (dupSet.has(r.provider_message_id)) { queueSkippedIds.push(r.id); skipped++; continue; }
    try {
      const res = await fetchWithRetry(
        `https://graph.microsoft.com/v1.0/me/messages/${r.provider_message_id}?$select=${SELECT}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        if (res.status === 404) { queueSkippedIds.push(r.id); skipped++; continue; }
        errors++;
        await supabase.from("email_backfill_queue").update({
          status: "error", attempts: 1,
          last_error: `graph get ${res.status}`,
          processed_at: new Date().toISOString(),
        }).eq("id", r.id);
        continue;
      }
      const m = await res.json() as GraphMessage;

      const fromAddr = m.from?.emailAddress?.address?.toLowerCase() || "";
      const fromName = m.from?.emailAddress?.name || "";
      const toList = (m.toRecipients || []).map((x) => x.emailAddress?.address?.toLowerCase() || "").filter(Boolean);
      const ccList = (m.ccRecipients || []).map((x) => x.emailAddress?.address?.toLowerCase() || "").filter(Boolean);
      const bccList = (m.bccRecipients || []).map((x) => x.emailAddress?.address?.toLowerCase() || "").filter(Boolean);

      const crmHeader = (m.internetMessageHeaders || []).find(
        (h) => h.name.toLowerCase() === "x-crm-source" && h.value === "lovable-crm",
      );
      const internetMsgId = m.internetMessageId || "";
      if (crmHeader || internetMsgId.includes("<crm-")) { queueSkippedIds.push(r.id); skipped++; continue; }

      const direction = fromAddr === ownAddress ? "outbound" : "inbound";
      const allParticipants = [fromAddr, ...toList, ...ccList, ...bccList];
      const external = allParticipants.filter((a) => a && a !== ownAddress && !isInternal(a));
      if (external.length === 0) { queueSkippedIds.push(r.id); skipped++; continue; }

      const leadId = await findLeadIdByEmail(supabase, external);
      if (leadId) matched++;

      const emailDate = m.receivedDateTime || m.sentDateTime || new Date().toISOString();
      const html = m.body?.contentType === "html" ? m.body.content : "";
      const text = m.body?.contentType === "text" ? m.body.content : "";
      const preview = (m.bodyPreview || "").substring(0, 280);

      const { error: insErr } = await supabase.from("lead_emails").insert({
        lead_id: leadId || "unmatched",
        provider_message_id: r.provider_message_id,
        message_id: internetMsgId || r.provider_message_id,
        thread_id: m.conversationId || "",
        direction, from_address: fromAddr, from_name: fromName,
        to_addresses: toList, cc_addresses: ccList, bcc_addresses: bccList,
        subject: (m.subject || "").substring(0, 500),
        body_preview: preview, body_html: html, body_text: text,
        email_date: emailDate, source: "outlook",
        is_read: !!m.isRead,
        attachments: m.hasAttachments ? [{ has: true }] : [],
        raw_payload: { backfill: true } as Record<string, unknown>,
      });
      if (insErr) {
        if (insErr.code === "23505") { queueSkippedIds.push(r.id); skipped++; continue; }
        errors++;
        await supabase.from("email_backfill_queue").update({
          status: "error", attempts: 1,
          last_error: insErr.message.slice(0, 200),
          processed_at: new Date().toISOString(),
        }).eq("id", r.id);
        continue;
      }
      inserted++;
      queueDoneIds.push(r.id);
    } catch (e) {
      errors++;
      await supabase.from("email_backfill_queue").update({
        status: "error", attempts: 1,
        last_error: (e as Error).message.slice(0, 200),
        processed_at: new Date().toISOString(),
      }).eq("id", r.id);
    }
  }

  if (queueDoneIds.length > 0) {
    await supabase.from("email_backfill_queue").update({
      status: "done", processed_at: new Date().toISOString(),
    }).in("id", queueDoneIds);
  }
  if (queueSkippedIds.length > 0) {
    await supabase.from("email_backfill_queue").update({
      status: "skipped", processed_at: new Date().toISOString(),
    }).in("id", queueSkippedIds);
  }

  return { inserted, matched, skipped, errors };
}

// Watchdog: if a job is stuck in 'discovering' with no recent chunk activity,
// re-dispatch backfill-discover for it. Survives function-timeout / network blips
// that would otherwise leave the job orphaned with discovery_complete=false and
// zero queue rows (cron would see no pending rows and never restart it).
const DISCOVER_STALL_MS = 3 * 60 * 1000;

async function kickDiscover(jobId: string): Promise<void> {
  // Fire-and-forget; do not block the hydrate batch on dispatch.
  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/backfill-discover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ job_id: jobId }),
  }).catch((e) => console.error("watchdog discover dispatch failed:", e));
}

async function pickJobs(supabase: ReturnType<typeof createClient>, jobIdHint?: string) {
  if (jobIdHint) {
    const { data } = await supabase
      .from("email_backfill_jobs")
      .select("id, connection_id, provider, email_address, status, discovery_complete, last_chunked_at, started_at")
      .eq("id", jobIdHint)
      .single();
    if (!data) return [];
    const j = data as { id: string; status: string; discovery_complete: boolean; last_chunked_at: string | null; started_at: string };
    if (j.status === "discovering" && !j.discovery_complete) {
      const lastTs = new Date(j.last_chunked_at || j.started_at).getTime();
      if (Date.now() - lastTs > DISCOVER_STALL_MS) await kickDiscover(j.id);
    }
    return [data];
  }
  const { data } = await supabase
    .from("email_backfill_jobs")
    .select("id, connection_id, provider, email_address, status, discovery_complete, last_chunked_at, started_at")
    .in("status", ["running", "discovering"])
    .order("started_at", { ascending: true })
    .limit(3);
  const jobs = (data || []) as Array<{ id: string; status: string; discovery_complete: boolean; last_chunked_at: string | null; started_at: string }>;
  for (const j of jobs) {
    if (j.status === "discovering" && !j.discovery_complete) {
      const lastTs = new Date(j.last_chunked_at || j.started_at).getTime();
      if (Date.now() - lastTs > DISCOVER_STALL_MS) await kickDiscover(j.id);
    }
  }
  return jobs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const jobIdHint = body.job_id as string | undefined;

    const jobs = await pickJobs(supabase, jobIdHint);
    if (jobs.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, idle: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalInserted = 0, totalMatched = 0, totalSkipped = 0, totalErrors = 0, totalProcessed = 0;
    const summaries: Array<Record<string, unknown>> = [];
    let anyMoreWork = false;

    for (const j of jobs) {
      const job = j as { id: string; connection_id: string; provider: string; email_address: string; status: string };
      if (job.status === "paused" || job.status === "cancelled") continue;

      let insThisJob = 0, matThisJob = 0, skThisJob = 0, errThisJob = 0, procThisJob = 0;
      let moreWorkForJob = false;

      for (let b = 0; b < MAX_BATCHES_PER_INVOCATION; b++) {
        const { data: rows } = await supabase
          .from("email_backfill_queue")
          .select("id, provider_message_id")
          .eq("job_id", job.id)
          .eq("status", "pending")
          .limit(BATCH_SIZE);
        const batch = (rows || []) as Array<{ id: number; provider_message_id: string }>;
        if (batch.length === 0) break;

        const result = job.provider === "gmail"
          ? await processBatchGmail(supabase, job, batch)
          : await processBatchOutlook(supabase, job, batch);

        insThisJob += result.inserted;
        matThisJob += result.matched;
        skThisJob += result.skipped;
        errThisJob += result.errors;
        procThisJob += batch.length;

        if (batch.length === BATCH_SIZE) moreWorkForJob = true;
      }

      const { count: pendingCount } = await supabase
        .from("email_backfill_queue").select("id", { count: "exact", head: true })
        .eq("job_id", job.id).eq("status", "pending");
      const { count: doneCount } = await supabase
        .from("email_backfill_queue").select("id", { count: "exact", head: true })
        .eq("job_id", job.id).eq("status", "done");
      const { count: skippedCount } = await supabase
        .from("email_backfill_queue").select("id", { count: "exact", head: true })
        .eq("job_id", job.id).eq("status", "skipped");

      const isComplete = (pendingCount || 0) === 0;

      const { data: jobRow } = await supabase
        .from("email_backfill_jobs")
        .select("messages_inserted, messages_matched, messages_skipped, messages_processed, discovery_complete, status")
        .eq("id", job.id).single();
      const jr = jobRow as { messages_inserted: number; messages_matched: number; messages_skipped: number; messages_processed: number; discovery_complete: boolean; status: string };

      // Clamp processed to the known denominator so the chip/panel never shows >100%
      // during the brief window where discovery hasn't fully written estimated_total.
      const rawProcessed = (doneCount || 0) + (skippedCount || 0);
      const { data: jobBoundsRow } = await supabase
        .from("email_backfill_jobs")
        .select("estimated_total, messages_discovered")
        .eq("id", job.id).single();
      const jb = jobBoundsRow as { estimated_total: number; messages_discovered: number } | null;
      const denom = Math.max(jb?.estimated_total || 0, jb?.messages_discovered || 0, rawProcessed);
      const clampedProcessed = Math.min(rawProcessed, denom);

      const updates: Record<string, unknown> = {
        messages_inserted: jr.messages_inserted + insThisJob,
        messages_matched: jr.messages_matched + matThisJob,
        messages_skipped: jr.messages_skipped + skThisJob,
        messages_processed: clampedProcessed,
        last_chunked_at: new Date().toISOString(),
      };
      const willComplete = isComplete && jr.discovery_complete && jr.status !== "paused" && jr.status !== "cancelled" && jr.status !== "done";
      if (willComplete) {
        updates.status = "done";
        updates.finished_at = new Date().toISOString();
      }
      await supabase.from("email_backfill_jobs").update(updates).eq("id", job.id);

      // Write a single email_sync_runs summary row when the job completes,
      // so the per-connection "Show recent syncs" dropdown surfaces it.
      if (willComplete) {
        const { data: finalJob } = await supabase
          .from("email_backfill_jobs")
          .select("started_at, messages_processed, messages_inserted, messages_matched, messages_skipped, target_window")
          .eq("id", job.id).single();
        const fj = finalJob as { started_at: string; messages_processed: number; messages_inserted: number; messages_matched: number; messages_skipped: number; target_window: string } | null;
        if (fj) {
          const unmatched = Math.max(0, (fj.messages_inserted || 0) - (fj.messages_matched || 0));
          await supabase.from("email_sync_runs").insert({
            connection_id: job.connection_id,
            email_address: job.email_address,
            mode: "backfill",
            status: "success",
            started_at: fj.started_at,
            finished_at: new Date().toISOString(),
            fetched: fj.messages_processed || 0,
            inserted: fj.messages_inserted || 0,
            matched: fj.messages_matched || 0,
            unmatched,
            skipped: fj.messages_skipped || 0,
            errors: [{ note: `backfill window=${fj.target_window}` }],
          });
        }
      }

      totalInserted += insThisJob;
      totalMatched += matThisJob;
      totalSkipped += skThisJob;
      totalErrors += errThisJob;
      totalProcessed += procThisJob;
      if (moreWorkForJob || !jr.discovery_complete) anyMoreWork = true;

      summaries.push({
        job_id: job.id, email: job.email_address,
        inserted: insThisJob, matched: matThisJob,
        skipped: skThisJob, errors: errThisJob,
        pending_remaining: pendingCount || 0,
        is_complete: isComplete && jr.discovery_complete,
      });
    }

    if (anyMoreWork) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/backfill-hydrate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({}),
      }).catch((e) => console.error("hydrate self-reschedule failed:", e));
    }

    await supabase.from("cron_run_log").insert({
      job_name: "backfill-hydrate",
      status: totalErrors > 0 ? "partial" : (totalProcessed > 0 ? "success" : "noop"),
      items_processed: totalProcessed,
      details: { jobs: summaries.length, summaries, more_work: anyMoreWork },
    });

    return new Response(JSON.stringify({
      ok: true, processed: totalProcessed,
      inserted: totalInserted, matched: totalMatched,
      skipped: totalSkipped, errors: totalErrors, summaries, more_work: anyMoreWork,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("backfill-hydrate error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
