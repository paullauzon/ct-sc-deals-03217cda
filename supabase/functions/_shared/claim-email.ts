// Hard guard for ad-hoc email claims. NEVER claim by domain alone — every
// reassignment must be backed by an exact-email participant overlap with the
// destination lead's known contacts (primary, secondary, or stakeholder).
// All future manual sweeps MUST go through this helper. Yesterday's
// `ILIKE '%domain%'` mistake becomes structurally impossible.
//
// Returns { ok, reason? } so callers can surface a precise refusal.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ClaimResult {
  ok: boolean;
  reason?: string;
  email_id: string;
  lead_id: string;
}

export async function claimEmailToLead(
  supabase: SupabaseClient,
  emailId: string,
  leadId: string,
): Promise<ClaimResult> {
  if (!emailId || !leadId || leadId === "unmatched") {
    return { ok: false, reason: "invalid_arguments", email_id: emailId, lead_id: leadId };
  }

  // Pull the email row
  const { data: email, error: emailErr } = await supabase
    .from("lead_emails")
    .select("id, lead_id, from_address, to_addresses, cc_addresses")
    .eq("id", emailId)
    .maybeSingle();
  if (emailErr || !email) {
    return { ok: false, reason: "email_not_found", email_id: emailId, lead_id: leadId };
  }

  // Pull the destination lead + secondary contacts + stakeholders
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, email, secondary_contacts, archived_at, is_duplicate, duplicate_of")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) {
    return { ok: false, reason: "lead_not_found", email_id: emailId, lead_id: leadId };
  }
  if (lead.is_duplicate && lead.duplicate_of) {
    return { ok: false, reason: `lead_is_duplicate_of_${lead.duplicate_of}`, email_id: emailId, lead_id: leadId };
  }

  const { data: stakes } = await supabase
    .from("lead_stakeholders")
    .select("email")
    .eq("lead_id", leadId);

  const known = new Set<string>();
  if (lead.email) known.add(lead.email.toLowerCase().trim());
  for (const c of (Array.isArray(lead.secondary_contacts) ? lead.secondary_contacts : [])) {
    const e = (c?.email || "").toLowerCase().trim();
    if (e) known.add(e);
  }
  for (const s of (stakes || [])) {
    const e = (s?.email || "").toLowerCase().trim();
    if (e) known.add(e);
  }

  // Build participant set from the email
  const participants = new Set<string>();
  const add = (a: any) => {
    const v = (a || "").toString().toLowerCase().trim();
    if (v) participants.add(v);
  };
  add(email.from_address);
  for (const a of (email.to_addresses || [])) add(a);
  for (const a of (email.cc_addresses || [])) add(a);

  let overlap = false;
  for (const p of participants) {
    if (known.has(p)) { overlap = true; break; }
  }
  if (!overlap) {
    return {
      ok: false,
      reason: "no_exact_participant_overlap",
      email_id: emailId,
      lead_id: leadId,
    };
  }

  const { error: updErr } = await supabase
    .from("lead_emails")
    .update({ lead_id: leadId })
    .eq("id", emailId);
  if (updErr) {
    return { ok: false, reason: `update_failed: ${updErr.message}`, email_id: emailId, lead_id: leadId };
  }
  return { ok: true, email_id: emailId, lead_id: leadId };
}
