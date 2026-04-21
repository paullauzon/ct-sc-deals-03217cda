// One-shot sweep over lead_emails WHERE lead_id='unmatched'. Re-runs the
// 4-tier matcher (primary -> secondary_contacts -> stakeholders -> domain)
// and flips matched rows to the real lead_id. The existing
// update_lead_email_metrics_on_claim trigger fires automatically when lead_id
// changes from 'unmatched' -> real id, so metrics update without extra work.
//
// Bounded per invocation (default 1000 rows) so a single call stays within
// wall-time. Safe to re-invoke — every call just claims more of the pool.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAINS = new Set(["captarget.com", "sourcecodeals.com"]);

function domainOf(email: string): string {
  return email.includes("@") ? email.split("@")[1].toLowerCase() : "";
}

function isInternal(email: string): boolean {
  return INTERNAL_DOMAINS.has(domainOf(email));
}

async function findLeadIdByEmail(
  supabase: ReturnType<typeof createClient>,
  candidates: string[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  const lowered = candidates.map((c) => c.toLowerCase()).filter(Boolean);
  if (lowered.length === 0) return null;

  // 1) Exact primary email
  const { data: exact } = await supabase
    .from("leads")
    .select("id")
    .in("email", lowered)
    .is("archived_at", null)
    .eq("is_duplicate", false)
    .limit(1);
  if (exact && exact.length > 0) return (exact[0] as { id: string }).id;

  // 2) Secondary contacts
  for (const addr of lowered) {
    if (!addr) continue;
    const { data: sec } = await supabase
      .from("leads")
      .select("id")
      .filter("secondary_contacts", "cs", JSON.stringify([{ email: addr }]))
      .is("archived_at", null)
      .eq("is_duplicate", false)
      .limit(1);
    if (sec && sec.length > 0) return (sec[0] as { id: string }).id;
  }

  // 3) Stakeholders
  const { data: stake } = await supabase
    .from("lead_stakeholders")
    .select("lead_id")
    .in("email", lowered)
    .limit(1);
  if (stake && stake.length > 0) return (stake[0] as { lead_id: string }).lead_id;

  // 4) Domain fallback (skip ambiguous)
  const domains = Array.from(new Set(
    lowered.map(domainOf).filter((d) => d && !INTERNAL_DOMAINS.has(d)),
  ));
  if (domains.length === 0) return null;
  const orParts: string[] = [];
  for (const d of domains) {
    orParts.push(`email.ilike.%@${d}`);
    orParts.push(`company_url.ilike.%${d}%`);
  }
  const { data: fuzzy } = await supabase
    .from("leads")
    .select("id")
    .or(orParts.join(","))
    .is("archived_at", null)
    .eq("is_duplicate", false)
    .limit(2);
  // Only match if exactly one lead is associated with the domain set
  if (fuzzy && fuzzy.length === 1) return (fuzzy[0] as { id: string }).id;

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { limit?: number; own_address?: string } = {};
  try { body = await req.json(); } catch { /* allow empty body */ }
  const limit = Math.min(Math.max(body.limit ?? 1000, 1), 5000);

  // Pull unmatched rows oldest-first so repeated runs drain the queue.
  const { data: rows, error: selErr } = await supabase
    .from("lead_emails")
    .select("id, from_address, to_addresses, cc_addresses")
    .eq("lead_id", "unmatched")
    .order("email_date", { ascending: true })
    .limit(limit);

  if (selErr) {
    return new Response(JSON.stringify({ ok: false, error: selErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const total = rows?.length ?? 0;
  let matched = 0;
  let stillUnmatched = 0;
  let errors = 0;

  // Collect connection email_addresses so we can exclude them from the
  // "external" set when building match candidates.
  const { data: conns } = await supabase
    .from("user_email_connections")
    .select("email_address");
  const ownAddresses = new Set(
    (conns || []).map((c: any) => (c.email_address || "").toLowerCase()).filter(Boolean),
  );

  for (const row of (rows || []) as Array<{
    id: string;
    from_address: string | null;
    to_addresses: string[] | null;
    cc_addresses: string[] | null;
  }>) {
    try {
      const participants = [
        (row.from_address || "").toLowerCase(),
        ...(row.to_addresses || []).map((a) => (a || "").toLowerCase()),
        ...(row.cc_addresses || []).map((a) => (a || "").toLowerCase()),
      ];
      const external = participants.filter(
        (a) => a && !ownAddresses.has(a) && !isInternal(a),
      );
      if (external.length === 0) { stillUnmatched++; continue; }

      const leadId = await findLeadIdByEmail(supabase, external);
      if (!leadId) { stillUnmatched++; continue; }

      const { error: upErr } = await supabase
        .from("lead_emails")
        .update({ lead_id: leadId })
        .eq("id", row.id)
        .eq("lead_id", "unmatched"); // guard: someone else might have claimed it

      if (upErr) { errors++; continue; }
      matched++;
    } catch {
      errors++;
    }
  }

  // How many are still pending so the UI can decide whether to offer another pass.
  const { count: remaining } = await supabase
    .from("lead_emails")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", "unmatched");

  return new Response(JSON.stringify({
    ok: true,
    scanned: total,
    matched,
    still_unmatched: stillUnmatched,
    errors,
    remaining_unmatched: remaining ?? null,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
