// Daily cron — rescues unmatched emails where a known lead's primary email
// appears in cc_addresses. The strict matcher today only checks from_address,
// so reps looped via CC silently land in the unmatched bucket. Live audit
// found ~994 such messages on first scan.
//
// Safety: only routes when EXACTLY ONE active non-duplicate lead's primary
// email is in CC. Multiple matches → leave unmatched (ambiguous).
// Skips senders flagged as is_intermediary on any deal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let scanned = 0;
  let matched = 0;
  let ambiguous = 0;
  let intermediarySkipped = 0;
  const errors: string[] = [];

  try {
    // Build email→lead_id map for active non-duplicate leads
    const emailToLead = new Map<string, string>();
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, email")
        .is("archived_at", null)
        .eq("is_duplicate", false)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`leads: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data as Array<{ id: string; email: string | null }>) {
        const e = (r.email || "").toLowerCase().trim();
        if (e) emailToLead.set(e, r.id);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Intermediary senders set
    const { data: stakes } = await supabase
      .from("lead_stakeholders")
      .select("email")
      .eq("is_intermediary", true);
    const intermediaries = new Set(((stakes || []) as Array<{ email: string }>).map((s) => (s.email || "").toLowerCase()));

    // Scan unmatched emails with a non-empty cc_addresses array
    let pageStart = 0;
    const ROW_PAGE = 500;
    const updatesByLead = new Map<string, string[]>();
    const WALL_BUDGET_MS = 90_000;

    for (;;) {
      if (Date.now() - startedAt > WALL_BUDGET_MS) break;
      const { data: rows, error: selErr } = await supabase
        .from("lead_emails")
        .select("id, from_address, cc_addresses, to_addresses")
        .eq("lead_id", "unmatched")
        .order("email_date", { ascending: false })
        .range(pageStart, pageStart + ROW_PAGE - 1);
      if (selErr) throw new Error(`select: ${selErr.message}`);
      if (!rows || rows.length === 0) break;

      for (const row of rows as Array<{ id: string; from_address: string | null; cc_addresses: string[] | null; to_addresses: string[] | null }>) {
        scanned++;
        const sender = (row.from_address || "").toLowerCase();
        if (intermediaries.has(sender)) { intermediarySkipped++; continue; }

        const recipients = [...(row.cc_addresses || []), ...(row.to_addresses || [])]
          .map((a) => (a || "").toLowerCase().trim())
          .filter(Boolean);

        const hits = new Set<string>();
        for (const r of recipients) {
          const lid = emailToLead.get(r);
          if (lid) hits.add(lid);
        }
        if (hits.size !== 1) {
          if (hits.size > 1) ambiguous++;
          continue;
        }
        const leadId = hits.values().next().value as string;
        let bucket = updatesByLead.get(leadId);
        if (!bucket) { bucket = []; updatesByLead.set(leadId, bucket); }
        bucket.push(row.id);
      }
      pageStart += rows.length;
      if (rows.length < ROW_PAGE) break;
    }

    // Apply updates in chunks of 200
    for (const [leadId, ids] of updatesByLead) {
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200);
        const { error: upErr, count } = await supabase
          .from("lead_emails")
          .update({ lead_id: leadId }, { count: "exact" })
          .in("id", slice)
          .eq("lead_id", "unmatched");
        if (upErr) { errors.push(`update_${leadId}: ${upErr.message}`); continue; }
        matched += count ?? 0;
      }
    }

    const status = errors.length > 0 ? "error" : (matched > 0 ? "success" : "noop");
    await logCronRun(
      "auto-attribute-cc-matches",
      status,
      matched,
      { scanned, matched, ambiguous, intermediarySkipped, leadsIndexed: emailToLead.size },
      errors.join("; "),
    );

    return new Response(
      JSON.stringify({ ok: true, scanned, matched, ambiguous, intermediarySkipped, errors, elapsed_ms: Date.now() - startedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    await logCronRun("auto-attribute-cc-matches", "error", matched, { scanned }, (e as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
