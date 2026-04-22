// Phase 1 — discovery.
// Walks message-IDs page-by-page and inserts them into email_backfill_queue.
// Stores the cursor on the job after each page so a crash never loses progress.
// Self-reschedules via a follow-up POST if more pages remain — this avoids
// hitting the edge function wall-time on huge mailboxes.
//
// Gmail: users.messages.list?q=after:YYYY/MM/DD&pageToken=...
// Outlook: /me/messages?$select=id&$top=1000&$orderby=receivedDateTime desc (inbox + sentitems separately)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PAGES_PER_INVOCATION = 8; // ~4000 ids/invocation for Gmail, ~8000 for Outlook
const PAGE_SIZE_GMAIL = 500;
const PAGE_SIZE_GRAPH = 1000;

function windowToAfterDate(target: string): string | null {
  const now = Date.now();
  if (target === "all") return null;
  const days = target === "90d" ? 90 : target === "1y" ? 365 : target === "3y" ? 365 * 3 : 90;
  const d = new Date(now - days * 86400000);
  // Gmail q= format: YYYY/MM/DD
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function windowToIso(target: string): string | null {
  if (target === "all") return null;
  const days = target === "90d" ? 90 : target === "1y" ? 365 : target === "3y" ? 365 * 3 : 90;
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function getValidGmailToken(supabase: ReturnType<typeof createClient>, connectionId: string): Promise<string> {
  const { data: conn } = await supabase.from("user_email_connections").select("*").eq("id", connectionId).single();
  if (!conn) throw new Error("connection not found");
  const c = conn as { access_token: string; refresh_token: string; token_expires_at: string | null };
  const expiresAt = c.token_expires_at ? new Date(c.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 && c.access_token) return c.access_token;
  const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!,
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
  const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  const TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID") || "common";
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!,
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

async function discoverGmail(
  supabase: ReturnType<typeof createClient>,
  job: { id: string; connection_id: string; target_window: string; discovery_cursor: string | null; estimated_total: number },
): Promise<{ done: boolean; pages: number; idsThisRun: number; estimate: number }> {
  const token = await getValidGmailToken(supabase, job.connection_id);
  const after = windowToAfterDate(job.target_window);
  let pageToken = job.discovery_cursor || undefined;
  let pages = 0;
  let idsThisRun = 0;
  let estimate = job.estimated_total;
  let done = false;

  while (pages < MAX_PAGES_PER_INVOCATION) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    // Always exclude spam/trash. Combine with date filter when present.
    const q = after ? `after:${after} -in:spam -in:trash` : `-in:spam -in:trash`;
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", String(PAGE_SIZE_GMAIL));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`gmail list failed: ${res.status}`);
    const json = await res.json() as { messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number };
    if (typeof json.resultSizeEstimate === "number" && estimate < json.resultSizeEstimate) {
      estimate = json.resultSizeEstimate;
    }
    const ids = (json.messages || []).map((m) => m.id);
    if (ids.length > 0) {
      const rows = ids.map((id) => ({
        job_id: job.id,
        connection_id: job.connection_id,
        provider_message_id: id,
        folder: "inbox",
      }));
      // ON CONFLICT DO NOTHING — relies on uq_backfill_queue_conn_msg
      const { error: insErr } = await supabase.from("email_backfill_queue").upsert(rows, {
        onConflict: "connection_id,provider_message_id",
        ignoreDuplicates: true,
      });
      if (insErr) throw new Error(`queue insert failed: ${insErr.message}`);
      idsThisRun += ids.length;
    }
    pageToken = json.nextPageToken;
    pages += 1;
    if (!pageToken) { done = true; break; }
  }

  // Persist progress
  await supabase.from("email_backfill_jobs").update({
    discovery_cursor: done ? null : pageToken,
    discovery_complete: done,
    estimated_total: Math.max(estimate, 0),
    messages_discovered: (await supabase.from("email_backfill_queue").select("id", { count: "exact", head: true }).eq("job_id", job.id)).count || 0,
    status: done ? "running" : "discovering",
    last_chunked_at: new Date().toISOString(),
  }).eq("id", job.id);

  return { done, pages, idsThisRun, estimate };
}

async function discoverOutlook(
  supabase: ReturnType<typeof createClient>,
  job: { id: string; connection_id: string; target_window: string; discovery_cursor: string | null; discovery_cursor_sent: string | null; estimated_total: number },
): Promise<{ done: boolean; pages: number; idsThisRun: number; estimate: number }> {
  const token = await getValidOutlookToken(supabase, job.connection_id);
  const sinceIso = windowToIso(job.target_window);
  // Single full-mailbox walk against /me/messages — captures ALL folders
  // (inbox, sent, archive, custom). Skip drafts. Microsoft Graph recommended
  // pattern for full-mailbox sync.
  const filterParts: string[] = ["isDraft eq false"];
  if (sinceIso) filterParts.push(`receivedDateTime ge ${sinceIso}`);
  const filter = `&$filter=${encodeURIComponent(filterParts.join(" and "))}`;
  let pages = 0;
  let idsThisRun = 0;
  let estimate = job.estimated_total;

  let url: string | null = job.discovery_cursor ||
    `https://graph.microsoft.com/v1.0/me/messages?$select=id&$top=${PAGE_SIZE_GRAPH}&$orderby=receivedDateTime desc${filter}&$count=true`;
  let done = false;

  while (pages < MAX_PAGES_PER_INVOCATION && url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`graph list ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json() as { value?: Array<{ id: string }>; "@odata.nextLink"?: string; "@odata.count"?: number };
    if (typeof data["@odata.count"] === "number") estimate = Math.max(estimate, data["@odata.count"]);
    const ids = (data.value || []).map((m) => m.id);
    if (ids.length > 0) {
      const rows = ids.map((id) => ({
        job_id: job.id,
        connection_id: job.connection_id,
        provider_message_id: id,
        folder: "all",
      }));
      const { error: insErr } = await supabase.from("email_backfill_queue").upsert(rows, {
        onConflict: "connection_id,provider_message_id",
        ignoreDuplicates: true,
      });
      if (insErr) throw new Error(`queue insert failed: ${insErr.message}`);
      idsThisRun += ids.length;
    }
    url = data["@odata.nextLink"] || null;
    pages += 1;
    if (!url) { done = true; break; }
  }

  const discovered = (await supabase.from("email_backfill_queue").select("id", { count: "exact", head: true }).eq("job_id", job.id)).count || 0;

  await supabase.from("email_backfill_jobs").update({
    discovery_cursor: done ? null : url,
    discovery_cursor_sent: null, // unused for Outlook full-mailbox walk
    discovery_complete: done,
    estimated_total: Math.max(estimate, 0),
    messages_discovered: discovered,
    status: done ? "running" : "discovering",
    last_chunked_at: new Date().toISOString(),
  }).eq("id", job.id);

  return { done, pages, idsThisRun, estimate };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const jobId = body.job_id as string | undefined;
    if (!jobId) {
      return new Response(JSON.stringify({ ok: false, error: "job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error } = await supabase
      .from("email_backfill_jobs")
      .select("id, connection_id, provider, target_window, discovery_cursor, discovery_cursor_sent, estimated_total, status")
      .eq("id", jobId)
      .single();
    if (error || !job) throw new Error("job not found");

    const j = job as { id: string; connection_id: string; provider: string; target_window: string; discovery_cursor: string | null; discovery_cursor_sent: string | null; estimated_total: number; status: string };

    if (j.status === "paused" || j.status === "cancelled" || j.status === "done" || j.status === "failed") {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: `status is ${j.status}` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: { done: boolean; pages: number; idsThisRun: number; estimate: number };
    if (j.provider === "gmail") {
      result = await discoverGmail(supabase, j);
    } else if (j.provider === "outlook") {
      result = await discoverOutlook(supabase, j);
    } else {
      throw new Error(`unsupported provider ${j.provider}`);
    }

    // If not done, self-reschedule one more invocation.
    if (!result.done) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/backfill-discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      }).catch((e) => console.error("self-reschedule failed:", e));
    } else {
      // Discovery done — kick the first hydrate to start draining immediately.
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/backfill-hydrate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      }).catch((e) => console.error("hydrate dispatch failed:", e));
    }

    await supabase.from("cron_run_log").insert({
      job_name: "backfill-discover",
      status: "success",
      items_processed: result.idsThisRun,
      details: { job_id: jobId, pages: result.pages, done: result.done, estimate: result.estimate },
    });

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("backfill-discover error:", e);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    try {
      const body = await req.json().catch(() => ({}));
      if (body.job_id) {
        await supabase.from("email_backfill_jobs").update({
          status: "failed",
          last_error: (e as Error).message.slice(0, 500),
          finished_at: new Date().toISOString(),
        }).eq("id", body.job_id);
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
