// One-shot data-correction sweep.
//
// Finds rows in `lead_emails` where the matched lead is NOT actually a participant
// in the email AND the domain match was unsafe (personal-provider domain OR a
// domain claimed by ≥ 2 leads). Resets those rows to `lead_id = 'unmatched'` so the
// rematch function can re-route them with the corrected (strict) matcher.
//
// Also detects emails attached to a duplicate lead and redirects them to the
// canonical lead via `duplicate_of`.
//
// Idempotent. Safe to re-run. Service-role only (no auth required from client;
// the supabase client uses the service key).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PERSONAL_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "msn.com", "live.com", "me.com", "mac.com", "protonmail.com",
  "proton.me", "yahoo.co.uk", "googlemail.com", "ymail.com",
]);

function domainOf(email: string): string {
  return email.includes("@") ? email.split("@")[1].toLowerCase() : "";
}

interface LeadRow {
  id: string;
  email: string | null;
  secondary_contacts: any;
  is_duplicate?: boolean;
  duplicate_of?: string | null;
  archived_at?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- 1. Build lead lookup: id → { primary email, secondary emails[], duplicate_of, etc. }
  // and domain → set of canonical lead ids (to detect ambiguity).
  // Also build primaryEmailToLeadId so we can detect Case C: an email currently
  // attached to a lead by SECONDARY claim, when another lead owns it as PRIMARY.
  const leadById = new Map<string, { emails: Set<string>; primaryEmail: string; secondaryEmails: Set<string>; isDuplicate: boolean; duplicateOf: string | null; archived: boolean }>();
  const stakeholderEmailsByLead = new Map<string, Set<string>>();
  const domainToCanonicalLeads = new Map<string, Set<string>>();
  const primaryEmailToLeadId = new Map<string, string>();

  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, email, secondary_contacts, is_duplicate, duplicate_of, archived_at")
      .range(from, from + PAGE - 1);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: `leads page ${from}: ${error.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!data || data.length === 0) break;

    for (const r of data as LeadRow[]) {
      const emails = new Set<string>();
      const secondaryEmails = new Set<string>();
      const primary = (r.email || "").toLowerCase().trim();
      if (primary) emails.add(primary);
      const sec = Array.isArray(r.secondary_contacts) ? r.secondary_contacts : [];
      for (const c of sec) {
        const e = (c?.email || "").toLowerCase().trim();
        if (e) { emails.add(e); secondaryEmails.add(e); }
      }
      leadById.set(r.id, {
        emails,
        primaryEmail: primary,
        secondaryEmails,
        isDuplicate: !!r.is_duplicate,
        duplicateOf: r.duplicate_of || null,
        archived: !!r.archived_at,
      });

      // Index canonical primary emails for Case C redirect.
      if (!r.is_duplicate && !r.archived_at && primary && !primaryEmailToLeadId.has(primary)) {
        primaryEmailToLeadId.set(primary, r.id);
      }

      // Domain ambiguity tracking — canonical leads only.
      if (!r.is_duplicate && !r.archived_at && primary) {
        const d = domainOf(primary);
        if (d && !PERSONAL_PROVIDERS.has(d)) {
          let s = domainToCanonicalLeads.get(d);
          if (!s) { s = new Set(); domainToCanonicalLeads.set(d, s); }
          s.add(r.id);
        }
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Stakeholders.
  from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("lead_stakeholders")
      .select("lead_id, email")
      .range(from, from + PAGE - 1);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: `stakeholders page ${from}: ${error.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!data || data.length === 0) break;
    for (const s of data as Array<{ lead_id: string; email: string | null }>) {
      const e = (s.email || "").toLowerCase().trim();
      if (!e) continue;
      let set = stakeholderEmailsByLead.get(s.lead_id);
      if (!set) { set = new Set(); stakeholderEmailsByLead.set(s.lead_id, set); }
      set.add(e);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Resolve canonical lead id (follow duplicate_of up to 3 hops).
  const resolveCanonical = (leadId: string): string => {
    let current = leadId;
    for (let i = 0; i < 3; i++) {
      const row = leadById.get(current);
      if (!row || !row.isDuplicate || !row.duplicateOf || row.duplicateOf === current) return current;
      current = row.duplicateOf;
    }
    return current;
  };

  // --- 2. Page through ALL claimed lead_emails (lead_id != 'unmatched').
  const WALL_BUDGET_MS = 90_000;
  const SCAN_PAGE = 1000;
  let scanned = 0, unclaimed = 0, redirected = 0, errors = 0, validated = 0;
  let pageStart = 0;

  // Buffers
  const toUnclaim: string[] = [];
  const redirectsByCanonical = new Map<string, string[]>(); // canonical lead id -> [email row ids]

  while (true) {
    if (Date.now() - startedAt > WALL_BUDGET_MS) break;
    const { data: rows, error } = await supabase
      .from("lead_emails")
      .select("id, lead_id, from_address, to_addresses, cc_addresses")
      .neq("lead_id", "unmatched")
      .order("email_date", { ascending: true })
      .range(pageStart, pageStart + SCAN_PAGE - 1);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as Array<{
      id: string;
      lead_id: string;
      from_address: string | null;
      to_addresses: string[] | null;
      cc_addresses: string[] | null;
    }>) {
      scanned++;
      const claimedLead = leadById.get(row.lead_id);
      if (!claimedLead) {
        // Lead row is gone or invalid id — un-claim.
        toUnclaim.push(row.id);
        unclaimed++;
        continue;
      }

      // Case A: attached to a duplicate. Redirect to canonical (no participant check).
      if (claimedLead.isDuplicate && claimedLead.duplicateOf) {
        const canonical = resolveCanonical(row.lead_id);
        if (canonical && canonical !== row.lead_id && leadById.has(canonical)) {
          let bucket = redirectsByCanonical.get(canonical);
          if (!bucket) { bucket = []; redirectsByCanonical.set(canonical, bucket); }
          bucket.push(row.id);
          redirected++;
          continue;
        }
      }

      // Case B: collect participants from this email.
      const participants = new Set<string>();
      if (row.from_address) participants.add(row.from_address.toLowerCase());
      for (const a of row.to_addresses || []) if (a) participants.add(a.toLowerCase());
      for (const a of row.cc_addresses || []) if (a) participants.add(a.toLowerCase());

      // Get the lead's known emails (primary + secondary + stakeholders).
      const leadEmails = new Set(claimedLead.emails);
      const stake = stakeholderEmailsByLead.get(row.lead_id);
      if (stake) for (const e of stake) leadEmails.add(e);

      // If ANY of the lead's known emails appear in participants → the match is legit.
      let participantMatch = false;
      for (const e of leadEmails) {
        if (participants.has(e)) { participantMatch = true; break; }
      }
      if (participantMatch) { validated++; continue; }

      // No participant match. Decide whether the original match was unsafe.
      // Unsafe if: ANY participant domain is a personal provider OR the lead's primary
      // email domain is shared by ≥ 2 canonical leads.
      let unsafe = false;
      for (const p of participants) {
        const d = domainOf(p);
        if (d && PERSONAL_PROVIDERS.has(d)) { unsafe = true; break; }
      }
      if (!unsafe) {
        // Check ambiguity on the lead's own primary domain.
        const primaryEmail = claimedLead.emails.values().next().value || "";
        const leadDomain = domainOf(primaryEmail);
        if (leadDomain && !PERSONAL_PROVIDERS.has(leadDomain)) {
          const claimants = domainToCanonicalLeads.get(leadDomain);
          if (claimants && claimants.size >= 2) unsafe = true;
        } else if (leadDomain && PERSONAL_PROVIDERS.has(leadDomain)) {
          unsafe = true;
        }
      }

      if (unsafe) {
        toUnclaim.push(row.id);
        unclaimed++;
      } else {
        // Participant doesn't match but domain is unique & corporate — keep (could be a
        // forwarded thread or assistant sending on behalf). Conservative.
        validated++;
      }
    }

    pageStart += rows.length;
    if (rows.length < SCAN_PAGE) break;
  }

  // --- 3. Apply un-claims (chunks of 200).
  for (let i = 0; i < toUnclaim.length; i += 200) {
    const slice = toUnclaim.slice(i, i + 200);
    const { error } = await supabase
      .from("lead_emails")
      .update({ lead_id: "unmatched" })
      .in("id", slice);
    if (error) errors += slice.length;
  }

  // --- 4. Apply duplicate redirects (chunks of 200, grouped by canonical lead id).
  for (const [canonical, ids] of redirectsByCanonical) {
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { error } = await supabase
        .from("lead_emails")
        .update({ lead_id: canonical })
        .in("id", slice);
      if (error) errors += slice.length;
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    scanned,
    validated,
    unclaimed,
    redirected_to_canonical: redirected,
    errors,
    leads_indexed: leadById.size,
    elapsed_ms: Date.now() - startedAt,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
