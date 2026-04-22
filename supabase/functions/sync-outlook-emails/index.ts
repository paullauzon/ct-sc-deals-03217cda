// Per-user Outlook sync — mirrors sync-gmail-emails architecture.
// Loops through active Outlook connections, pulls inbox + sentitems via Graph,
// dedupes, matches leads, inserts into lead_emails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAINS = new Set(["captarget.com", "sourcecodeals.com"]);
const PERSONAL_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "msn.com", "live.com", "me.com", "mac.com", "protonmail.com",
  "proton.me", "yahoo.co.uk", "googlemail.com", "ymail.com",
  "google.com", "apple.com", "microsoft.com", "mail.com", "zoho.com",
  "qq.com", "163.com", "pm.me", "tutanota.com", "fastmail.com", "gmx.com",
]);
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
  if (local.includes("+caf_")) return true;
  return false;
}
const MAX_FIRST_RUN = 1500;
const MAX_INCREMENTAL = 250;

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

function domainOf(email: string): string {
  return email.includes("@") ? email.split("@")[1].toLowerCase() : "";
}

function isInternal(email: string): boolean {
  return INTERNAL_DOMAINS.has(domainOf(email));
}

async function getValidOutlookToken(connectionId: string): Promise<string> {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: conn, error } = await supabase.from("user_email_connections").select("*").eq("id", connectionId).single();
  if (error || !conn) throw new Error(`Connection ${connectionId} not found`);
  if (!conn.refresh_token) throw new Error(`Connection ${connectionId} has no refresh_token`);

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 && conn.access_token) return conn.access_token;

  const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  const TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID") || "common";
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Microsoft OAuth credentials missing");

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token, grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access",
    }),
  });
  if (!res.ok) throw new Error(`Outlook token refresh failed: ${res.status}`);
  const tokens = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const upd: Record<string, unknown> = { access_token: tokens.access_token, token_expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(), updated_at: new Date().toISOString() };
  if (tokens.refresh_token) upd.refresh_token = tokens.refresh_token;
  await supabase.from("user_email_connections").update(upd).eq("id", connectionId);
  return tokens.access_token;
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  bccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
}

const SELECT_FIELDS = "id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,internetMessageHeaders";

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

  // 3) Stakeholders table
  const { data: stake } = await supabase
    .from("lead_stakeholders")
    .select("lead_id")
    .in("email", lowered)
    .limit(1);
  if (stake && stake.length > 0) return await resolveCanonicalLeadId(supabase, (stake[0] as { lead_id: string }).lead_id);

  // Pre-check: if every external participant is a system-noise sender, refuse.
  const allNoise = lowered.every((a) => isSystemNoise(a));
  if (allNoise) return null;

  // 4) Domain fallback — STRICT (no personal/system providers, ambiguous → unmatched,
  // confirmed-participant required to prevent same-domain colleague pollution).
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
    if (!confirmed) continue;
    return await resolveCanonicalLeadId(supabase, cand.id);
  }
  return null;
}

/**
 * Auto-stakeholder discovery — see sync-gmail-emails for full rationale.
 * Adds same-corporate-domain colleagues uncovered through a confirmed match
 * so future emails from them route via the stakeholder tier directly.
 */
async function maybeAutoAddStakeholder(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  external: string[],
  fromName: string,
  fromAddress: string,
): Promise<void> {
  try {
    if (!leadId || leadId === "unmatched" || external.length === 0) return;
    const { data: leadRow } = await supabase
      .from("leads")
      .select("email, secondary_contacts")
      .eq("id", leadId)
      .maybeSingle();
    if (!leadRow) return;
    const lead = leadRow as { email: string | null; secondary_contacts: any };
    const known = new Set<string>();
    const primary = (lead.email || "").toLowerCase().trim();
    if (primary) known.add(primary);
    const sec = Array.isArray(lead.secondary_contacts) ? lead.secondary_contacts : [];
    for (const c of sec) {
      const e = (c?.email || "").toLowerCase().trim();
      if (e) known.add(e);
    }
    const { data: stakes } = await supabase
      .from("lead_stakeholders").select("email").eq("lead_id", leadId);
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
      if (leadDomain && dom !== leadDomain) continue;
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
    console.error("outlook auto-stakeholder (non-fatal):", (e as Error).message);
  }
}

interface SyncStats {
  connection_id: string;
  email: string;
  mode: string;
  fetched: number;
  inserted: number;
  matched: number;
  skipped_dup: number;
  skipped_internal: number;
  errors: string[];
  started_at: string;
}

async function syncOneConnection(
  supabase: ReturnType<typeof createClient>,
  connection: { id: string; email_address: string; last_synced_at: string | null },
  forceFull: boolean,
): Promise<SyncStats> {
  const isFirstRun = !connection.last_synced_at;
  const stats: SyncStats = {
    connection_id: connection.id,
    email: connection.email_address,
    mode: forceFull ? "full" : isFirstRun ? "first_run_skipped" : "incremental",
    fetched: 0, inserted: 0, matched: 0, skipped_dup: 0, skipped_internal: 0,
    errors: [], started_at: new Date().toISOString(),
  };

  // First-run with no forceFull: do NOT pull 90d here. The backfill orchestrator owns first-run.
  // Just stamp last_synced_at so next incremental works normally.
  if (isFirstRun && !forceFull) {
    await supabase.from("user_email_connections").update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    return stats;
  }

  let token: string;
  try { token = await getValidOutlookToken(connection.id); } catch (e) {
    stats.errors.push(`token: ${(e as Error).message}`);
    return stats;
  }

  const sinceDays = stats.mode === "full" ? 90 : 7;
  const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const maxMessages = stats.mode === "full" ? MAX_FIRST_RUN : MAX_INCREMENTAL;
  const ownAddress = connection.email_address.toLowerCase();

  let totalProcessed = 0;

  for (const folder of ["inbox", "sentitems"]) {
    let url: string | null =
      `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages` +
      `?$top=50&$orderby=receivedDateTime desc` +
      `&$filter=receivedDateTime ge ${sinceIso}` +
      `&$select=${SELECT_FIELDS}`;

    for (let page = 0; page < 10 && url && totalProcessed < maxMessages; page++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      } catch (e) {
        stats.errors.push(`fetch ${folder} page ${page}: ${(e as Error).message}`);
        break;
      }
      if (!res.ok) {
        const txt = await res.text();
        stats.errors.push(`Graph ${folder} ${res.status}: ${txt.slice(0, 200)}`);
        break;
      }
      const data = await res.json();
      const messages: GraphMessage[] = data.value || [];
      url = data["@odata.nextLink"] || null;

      for (const m of messages) {
        if (totalProcessed >= maxMessages) break;
        totalProcessed++;

        const fromAddr = m.from?.emailAddress?.address?.toLowerCase() || "";
        const fromName = m.from?.emailAddress?.name || "";
        const toList = (m.toRecipients || []).map((r) => r.emailAddress?.address?.toLowerCase() || "").filter(Boolean);
        const ccList = (m.ccRecipients || []).map((r) => r.emailAddress?.address?.toLowerCase() || "").filter(Boolean);
        const bccList = (m.bccRecipients || []).map((r) => r.emailAddress?.address?.toLowerCase() || "").filter(Boolean);

        // Skip CRM-sent messages (loop protection)
        const crmHeader = (m.internetMessageHeaders || []).find(
          (h) => h.name.toLowerCase() === "x-crm-source" && h.value === "lovable-crm"
        );
        const internetMsgId = m.internetMessageId || "";
        if (crmHeader || internetMsgId.includes("<crm-")) {
          stats.skipped_dup++;
          continue;
        }

        // Dedup
        const { data: existing } = await supabase
          .from("lead_emails")
          .select("id")
          .eq("provider_message_id", m.id)
          .limit(1);
        if (existing && existing.length > 0) { stats.skipped_dup++; continue; }

        // Also check by internetMessageId
        if (internetMsgId) {
          const { data: existing2 } = await supabase
            .from("lead_emails")
            .select("id")
            .eq("message_id", internetMsgId)
            .limit(1);
          if (existing2 && existing2.length > 0) { stats.skipped_dup++; continue; }
        }

        const direction = fromAddr === ownAddress ? "outbound" : "inbound";

        // External participants for lead matching
        const allParticipants = [fromAddr, ...toList, ...ccList, ...bccList];
        const external = allParticipants.filter((a) => a && a !== ownAddress && !isInternal(a));

        if (external.length === 0) { stats.skipped_internal++; continue; }

        const leadId = await findLeadIdByEmail(supabase, external);
        if (leadId) {
          stats.matched++;
          await maybeAutoAddStakeholder(supabase, leadId, external, fromName, fromAddr);
        }

        const emailDate = m.receivedDateTime || m.sentDateTime || new Date().toISOString();
        const html = m.body?.contentType === "html" ? m.body.content : "";
        const text = m.body?.contentType === "text" ? m.body.content : "";
        const preview = (m.bodyPreview || "").substring(0, 280);

        // Round 6 — auto-park noise classes (out-of-office, role-based, calendar)
        // BEFORE writing as unmatched. Matched messages always win.
        let parkedSentinel: string | null = null;
        if (!leadId) {
          const { classifyEmail, sentinelForClass } = await import("../_shared/classify-email.ts");
          const cls = classifyEmail({ fromAddress: fromAddr, subject: m.subject || "", bodyPreview: preview });
          parkedSentinel = sentinelForClass(cls);
        }

        const { data: insertedRow, error: insertErr } = await supabase.from("lead_emails").insert({
          lead_id: leadId || parkedSentinel || "unmatched",
          message_id: internetMsgId || m.id,
          provider_message_id: m.id,
          thread_id: m.conversationId || "",
          direction,
          from_address: fromAddr,
          from_name: fromName,
          to_addresses: toList,
          cc_addresses: ccList,
          bcc_addresses: bccList,
          subject: (m.subject || "").substring(0, 500),
          body_preview: preview,
          body_html: html,
          body_text: text,
          email_date: emailDate,
          source: "outlook",
          is_read: !!m.isRead,
          attachments: m.hasAttachments ? [{ has: true }] : [],
          raw_payload: { ...(m as unknown as Record<string, unknown>), ...(parkedSentinel ? { auto_parked: parkedSentinel } : {}) },
        }).select("id").single();

        if (insertErr) {
          stats.errors.push(`insert: ${insertErr.message}`);
          continue;
        }
        stats.inserted++;

        // Round 5 — multi-recipient outbound fan-out. Mirror sync-gmail-emails:
        // when an outbound goes to multiple lead primaries, insert sibling rows
        // so each deal-room sees the conversation.
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
              await supabase.from("lead_emails").insert({
                lead_id: peer.id,
                message_id: internetMsgId || m.id,
                provider_message_id: `${m.id}#peer-${peer.id}`,
                thread_id: m.conversationId || "",
                direction,
                from_address: fromAddr,
                from_name: fromName,
                to_addresses: toList,
                cc_addresses: ccList,
                bcc_addresses: bccList,
                subject: (m.subject || "").substring(0, 500),
                body_preview: preview,
                body_html: html,
                body_text: text,
                email_date: emailDate,
                source: "outlook",
                is_read: !!m.isRead,
                attachments: m.hasAttachments ? [{ has: true }] : [],
                raw_payload: { peer_of: (insertedRow as { id: string } | null)?.id },
              });
            }
          } catch (e) {
            console.warn("multi-recipient dup failed", (e as Error).message);
          }
        }

        // Reply detection — when an inbound matched to a lead lands in a conversation that
        // already has an outbound, stamp replied_at on that outbound row (parity with Gmail).
        if (direction === "inbound" && leadId && m.conversationId && insertedRow) {
          const { data: prevOutbound } = await supabase
            .from("lead_emails")
            .select("id")
            .eq("lead_id", leadId)
            .eq("thread_id", m.conversationId)
            .eq("direction", "outbound")
            .is("replied_at", null)
            .order("email_date", { ascending: false })
            .limit(1);
          const replyTarget = (prevOutbound as { id: string }[] | null)?.[0];
          if (replyTarget) {
            await supabase.from("lead_emails")
              .update({ replied_at: emailDate })
              .eq("id", replyTarget.id);

            // If the matched outbound carried a sequence_step, log a sequence_paused row.
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

        // Inbound-reply intelligence (parity with sync-gmail-emails):
        //   1) Auto-discard pending stall drafts — the reply obviates the soft nudge.
        //   2) For active selling stages, queue a contextual reply draft via generate-stage-draft.
        if (direction === "inbound" && leadId && insertedRow) {
          try {
            await (supabase as any)
              .from("lead_drafts")
              .update({ status: "superseded", updated_at: new Date().toISOString() })
              .eq("lead_id", leadId)
              .like("action_key", "stage-stall-%")
              .eq("status", "draft");

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
                  inbound_email_id: (insertedRow as { id: string }).id,
                }),
              }).catch((err) => console.error("outlook reply-draft trigger failed:", err));
            }
          } catch (replyErr) {
            console.error("outlook inbound-reply hook (non-fatal):", replyErr);
          }
        }
      }
    }
  }

  stats.fetched = totalProcessed;

  // Update last_synced_at
  await supabase.from("user_email_connections").update({
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);

  // Log sync run — skip noisy zero-effect incremental rows that bloat the UI.
  const isNoiseRow =
    stats.mode === "incremental" &&
    stats.fetched === 0 &&
    stats.inserted === 0 &&
    stats.errors.length === 0;
  if (!isNoiseRow) {
    await supabase.from("email_sync_runs").insert({
      connection_id: connection.id,
      email_address: connection.email_address,
      mode: stats.mode,
      started_at: stats.started_at,
      finished_at: new Date().toISOString(),
      fetched: stats.fetched,
      inserted: stats.inserted,
      matched: stats.matched,
      skipped: stats.skipped_dup + stats.skipped_internal,
      unmatched: stats.inserted - stats.matched,
      status: stats.errors.length > 0 ? "partial" : "success",
      errors: stats.errors,
    });
  }

  return stats;
}

// Server-side auto-enroll for existing Outlook connections (parity with Gmail).
async function maybeAutoEnrollBackfill(
  supabase: ReturnType<typeof createClient>,
  conn: { id: string; last_synced_at: string | null },
): Promise<boolean> {
  try {
    if (!conn.last_synced_at) return false;
    const { data: jobs } = await supabase
      .from("email_backfill_jobs")
      .select("id")
      .eq("connection_id", conn.id)
      .limit(1);
    if (jobs && jobs.length > 0) return false;
    if (Date.now() - new Date(conn.last_synced_at).getTime() < 3600_000) return false;
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/start-email-backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ connection_id: conn.id, target_window: "90d" }),
    }).catch((e) => console.error("outlook auto-enroll dispatch failed:", e));
    return true;
  } catch (e) {
    console.error("outlook auto-enroll guard failed (non-fatal):", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const specificId = body.connection_id as string | undefined;
    const forceFull = body.force_full === true;

    let connections: Array<{ id: string; email_address: string; last_synced_at: string | null }>;

    if (specificId) {
      const { data, error } = await supabase.from("user_email_connections")
        .select("id, email_address, last_synced_at")
        .eq("id", specificId)
        .eq("provider", "outlook")
        .eq("is_active", true)
        .single();
      if (error || !data) throw new Error(`Outlook connection ${specificId} not found or inactive`);
      connections = [data as any];
    } else {
      const { data } = await supabase.from("user_email_connections")
        .select("id, email_address, last_synced_at")
        .eq("provider", "outlook")
        .eq("is_active", true);
      connections = (data || []) as any[];
    }

    if (connections.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No active Outlook connections", results: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: SyncStats[] = [];
    const skipped: Array<{ connection_id: string; email: string; reason: string }> = [];
    const autoEnrolled: string[] = [];
    for (const conn of connections) {
      // Defer to the backfill orchestrator if a backfill job is active for this connection.
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

        // Auto-enroll existing connections that never had a backfill (parity with Gmail).
        const enrolled = await maybeAutoEnrollBackfill(supabase, conn);
        if (enrolled) {
          autoEnrolled.push(conn.id);
          skipped.push({ connection_id: conn.id, email: conn.email_address, reason: "auto_enrolled_backfill" });
          continue;
        }
      }
      results.push(await syncOneConnection(supabase, conn, forceFull));
    }

    // Cron log
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
    await supabase.from("cron_run_log").insert({
      job_name: "sync-outlook-emails",
      status: totalErrors > 0 ? "partial" : "success",
      items_processed: totalInserted,
      details: { connections: results.length, skipped, auto_enrolled: autoEnrolled, results: results.map(r => ({ email: r.email, fetched: r.fetched, inserted: r.inserted, matched: r.matched })) },
    });

    const allSkipped = results.length === 0 && skipped.length > 0;
    return new Response(
      JSON.stringify({ ok: true, results, skipped: allSkipped, deferred: skipped, reason: allSkipped ? "backfill_in_progress" : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-outlook-emails error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
