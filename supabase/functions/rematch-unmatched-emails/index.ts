// Bulk re-matcher for lead_emails.lead_id = 'unmatched'.
//
// Strategy (fast path):
//   1. Load ALL non-archived leads + secondary contacts + stakeholders + own
//      mailbox addresses into in-memory maps ONCE per invocation.
//   2. Stream unmatched rows in pages of 500. For each row do O(1) Map lookups
//      instead of per-row Supabase queries.
//   3. Apply 4-tier match (primary → secondary → stakeholder → unambiguous
//      domain). Skip pure-noise senders (newsletters, service notifications,
//      and internal-only threads) so we don't waste cycles.
//   4. Bulk-update matched rows in chunks of 200 via .in() filter.
//
// The existing update_lead_email_metrics_on_claim trigger fires automatically
// when lead_id flips from 'unmatched' → real id, so metrics stay accurate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAINS = new Set(["captarget.com", "sourcecodeals.com"]);

// Personal/system mailbox providers — NEVER infer a lead from these domains.
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

// Senders that will never map to a lead — newsletters, transactional notifications,
// generic service domains. The hardcoded set is the fallback; live noise rules
// added through the Mailboxes UI extend this Set at runtime via loadNoiseDomains().
const NOISE_DOMAINS = new Set<string>([
  "mail.beehiiv.com", "email.pandadoc.net", "fireflies.ai", "calendly.com",
  "zoom.us", "webflow.com", "mail.investopedia.com", "newsletter.trip.com",
  "activecampaign.com", "m.starbucks.com", "shared1.ccsend.com",
  "ruby.com", "news.mcguirewoods.net", "connectoutbound.com",
  "realdealsmedia.com", "acg.org", "youthenrichmentalliance.com",
  "dakotalive.com", "nperspective.com",
]);

async function loadNoiseDomains(supabase: ReturnType<typeof createClient>): Promise<void> {
  try {
    const { data } = await supabase.from("email_noise_domains").select("domain");
    for (const r of (data || []) as Array<{ domain: string }>) {
      const d = (r.domain || "").toLowerCase().trim();
      if (d) NOISE_DOMAINS.add(d);
    }
  } catch {
    // Table may not exist on first run — fall back to hardcoded set.
  }
}

function domainOf(email: string): string {
  return email.includes("@") ? email.split("@")[1].toLowerCase() : "";
}

function isInternal(email: string): boolean {
  return INTERNAL_DOMAINS.has(domainOf(email));
}

interface LeadIndex {
  byEmail: Map<string, string>;        // exact email -> lead_id
  byDomain: Map<string, Set<string>>;  // domain -> set of lead_ids (only count==1 is usable)
  byLeadContacts: Map<string, Set<string>>; // lead_id -> set of all known contact emails (primary+secondary+stakeholder)
  duplicateOf: Map<string, string>;    // duplicate lead id -> canonical lead id
}

function resolveCanonical(idx: LeadIndex, leadId: string): string {
  let current = leadId;
  for (let i = 0; i < 3; i++) {
    const next = idx.duplicateOf.get(current);
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

async function buildLeadIndex(supabase: ReturnType<typeof createClient>): Promise<LeadIndex> {
  const byEmail = new Map<string, string>();
  const byDomain = new Map<string, Set<string>>();
  const byLeadContacts = new Map<string, Set<string>>();
  const duplicateOf = new Map<string, string>();

  const addContact = (leadId: string, email: string) => {
    if (!email) return;
    let s = byLeadContacts.get(leadId);
    if (!s) { s = new Set(); byLeadContacts.set(leadId, s); }
    s.add(email);
  };

  const addToDomain = (dom: string, leadId: string) => {
    if (!dom || INTERNAL_DOMAINS.has(dom) || NOISE_DOMAINS.has(dom) || PERSONAL_PROVIDERS.has(dom)) return;
    let set = byDomain.get(dom);
    if (!set) { set = new Set(); byDomain.set(dom, set); }
    set.add(leadId);
  };

  // Page through ALL leads ONCE, collecting raw rows. We build the byEmail map in
  // TWO PASSES afterwards so PRIMARY claims always win over secondary_contact claims.
  // (Without this, a lead that lists Prateek's address as a secondary contact could
  // claim Prateek's emails ahead of Prateek's own primary lead.)
  type RawLead = {
    id: string; email: string; secondary_contacts: any[]; company_url: string;
  };
  const canonicalLeads: RawLead[] = [];

  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, email, secondary_contacts, company_url, is_duplicate, duplicate_of, archived_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`leads page ${from}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as Array<{
      id: string; email: string | null; secondary_contacts: any; company_url: string | null;
      is_duplicate?: boolean; duplicate_of?: string | null; archived_at?: string | null;
    }>) {
      if (row.is_duplicate && row.duplicate_of && row.duplicate_of !== row.id) {
        duplicateOf.set(row.id, row.duplicate_of);
      }
      if (row.archived_at || row.is_duplicate) continue;

      canonicalLeads.push({
        id: row.id,
        email: (row.email || "").toLowerCase(),
        secondary_contacts: Array.isArray(row.secondary_contacts) ? row.secondary_contacts : [],
        company_url: (row.company_url || "").toLowerCase(),
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // PASS 1 — primaries first. Always claim the byEmail key.
  for (const r of canonicalLeads) {
    if (r.email) {
      byEmail.set(r.email, r.id);  // primary always wins
      addContact(r.id, r.email);
      addToDomain(domainOf(r.email), r.id);
    }
    if (r.company_url) {
      try {
        const u = new URL(r.company_url.startsWith("http") ? r.company_url : `https://${r.company_url}`);
        addToDomain(u.hostname.replace(/^www\./, ""), r.id);
      } catch { /* ignore bad URLs */ }
    }
  }

  // PASS 2 — secondary contacts ONLY fill gaps where no primary already claimed the address.
  for (const r of canonicalLeads) {
    for (const c of r.secondary_contacts) {
      const e = (c?.email || "").toLowerCase();
      if (!e) continue;
      if (!byEmail.has(e)) byEmail.set(e, r.id);
      addContact(r.id, e);
      addToDomain(domainOf(e), r.id);
    }
  }

  // PASS 3 — stakeholders fill remaining gaps (lowest priority).
  from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("lead_stakeholders")
      .select("lead_id, email")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`stakeholders page ${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const s of data as Array<{ lead_id: string; email: string | null }>) {
      const e = (s.email || "").toLowerCase();
      if (!e) continue;
      if (!byEmail.has(e)) byEmail.set(e, s.lead_id);
      addContact(s.lead_id, e);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return { byEmail, byDomain, byLeadContacts, duplicateOf };
}

function findLead(idx: LeadIndex, candidates: string[]): string | null {
  // System-noise pre-check — if every candidate is system noise, refuse.
  if (candidates.length > 0 && candidates.every((c) => isSystemNoise(c))) return null;

  // 1+2+3) Exact email match (covers primary, secondary, stakeholders)
  for (const c of candidates) {
    const hit = idx.byEmail.get(c);
    if (hit) return resolveCanonical(idx, hit);
  }
  // 4) Domain fallback — exclude personal/system providers, only match if domain is
  // unambiguous AND at least one candidate is a confirmed contact for that lead.
  const seen = new Set<string>();
  for (const c of candidates) {
    const d = domainOf(c);
    if (!d || INTERNAL_DOMAINS.has(d) || NOISE_DOMAINS.has(d) || PERSONAL_PROVIDERS.has(d)) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    const matches = idx.byDomain.get(d);
    if (!matches || matches.size !== 1) continue;
    const candLeadId = matches.values().next().value;
    const knownContacts = idx.byLeadContacts.get(candLeadId);
    if (!knownContacts) continue;
    let confirmed = false;
    for (const p of candidates) {
      if (knownContacts.has(p)) { confirmed = true; break; }
    }
    if (!confirmed) continue; // pure same-domain colleague thread → unmatched
    return resolveCanonical(idx, candLeadId);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { limit?: number } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const limit = Math.min(Math.max(body.limit ?? 1000, 1), 5000);

  // Pull live noise rules into the in-memory NOISE_DOMAINS set.
  await loadNoiseDomains(supabase);

  // Build the in-memory index ONCE.
  let idx: LeadIndex;
  try {
    idx = await buildLeadIndex(supabase);
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: `index_build_failed: ${e.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Own mailbox addresses (excluded from candidate set).
  const { data: conns } = await supabase.from("user_email_connections").select("email_address");
  const own = new Set((conns || []).map((c: any) => (c.email_address || "").toLowerCase()).filter(Boolean));

  // Page through unmatched rows oldest-first; stop early if wall-clock exceeds budget.
  const WALL_BUDGET_MS = 90_000;
  const PAGE = 500;

  let scanned = 0;
  let matched = 0;
  let skippedNoise = 0;
  let stillUnmatched = 0;
  let errors = 0;
  let pageStart = 0;

  // Buffer matches and apply in chunks per lead_id.
  const updatesByLead = new Map<string, string[]>();

  while (scanned < limit) {
    if (Date.now() - startedAt > WALL_BUDGET_MS) break;

    const remaining = limit - scanned;
    const pageSize = Math.min(PAGE, remaining);

    const { data: rows, error: selErr } = await supabase
      .from("lead_emails")
      .select("id, from_address, to_addresses, cc_addresses")
      .eq("lead_id", "unmatched")
      .order("email_date", { ascending: true })
      .range(pageStart, pageStart + pageSize - 1);

    if (selErr) {
      return new Response(JSON.stringify({ ok: false, error: selErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as Array<{
      id: string;
      from_address: string | null;
      to_addresses: string[] | null;
      cc_addresses: string[] | null;
    }>) {
      scanned++;
      const fromAddr = (row.from_address || "").toLowerCase();
      const fromDom = domainOf(fromAddr);

      // Fast skip: pure-noise sender domains never match.
      if (NOISE_DOMAINS.has(fromDom)) { skippedNoise++; continue; }

      const participants = [
        fromAddr,
        ...(row.to_addresses || []).map((a) => (a || "").toLowerCase()),
        ...(row.cc_addresses || []).map((a) => (a || "").toLowerCase()),
      ].filter(Boolean);

      const external = participants.filter((a) => !own.has(a) && !isInternal(a));
      if (external.length === 0) { skippedNoise++; continue; }

      const leadId = findLead(idx, external);
      if (!leadId) { stillUnmatched++; continue; }

      let bucket = updatesByLead.get(leadId);
      if (!bucket) { bucket = []; updatesByLead.set(leadId, bucket); }
      bucket.push(row.id);
    }

    pageStart += rows.length;
    if (rows.length < pageSize) break;
  }

  // Flush updates: one statement per lead_id, batched by row id chunks of 200
  // (PostgREST URL length is the only ceiling; 200 ids stays well under 8KB).
  for (const [leadId, ids] of updatesByLead) {
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { error: upErr, count } = await supabase
        .from("lead_emails")
        .update({ lead_id: leadId }, { count: "exact" })
        .in("id", slice)
        .eq("lead_id", "unmatched"); // guard against concurrent claims
      if (upErr) { errors += slice.length; continue; }
      matched += count ?? 0;
    }
  }

  const { count: remaining } = await supabase
    .from("lead_emails")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", "unmatched");

  return new Response(JSON.stringify({
    ok: true,
    scanned,
    matched,
    skipped_noise: skippedNoise,
    still_unmatched: stillUnmatched,
    errors,
    remaining_unmatched: remaining ?? null,
    elapsed_ms: Date.now() - startedAt,
    leads_indexed: idx.byEmail.size,
    domains_indexed: idx.byDomain.size,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
