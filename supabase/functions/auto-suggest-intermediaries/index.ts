// Round 7 — daily cron. Discovers candidate intermediaries and surfaces them
// as `intermediary_candidate` rows in pending_attribution_suggestions. A
// candidate is any sender appearing as a stakeholder OR sender on 3+ active
// leads spanning 2+ different firm domains in the last 60 days.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { logCronRun } from "../_shared/cron-log.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let suggested = 0;
  try {
    const sinceIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Stakeholder-based candidates
    const { data: stakes } = await supabase
      .from("lead_stakeholders")
      .select("email, lead_id, is_intermediary");

    const senderLeads = new Map<string, Set<string>>();
    for (const s of (stakes || [])) {
      if (s.is_intermediary) continue; // already flagged
      const e = (s?.email || "").toLowerCase().trim();
      if (!e) continue;
      let set = senderLeads.get(e);
      if (!set) { set = new Set(); senderLeads.set(e, set); }
      set.add(s.lead_id);
    }

    // 2. Sender-based candidates from recent emails
    const { data: emails } = await supabase
      .from("lead_emails")
      .select("from_address, lead_id")
      .gte("email_date", sinceIso)
      .neq("lead_id", "unmatched")
      .neq("lead_id", "role_based")
      .neq("lead_id", "auto_reply")
      .neq("lead_id", "firm_activity")
      .limit(20000);

    for (const e of (emails || [])) {
      const a = (e.from_address || "").toLowerCase().trim();
      if (!a) continue;
      let set = senderLeads.get(a);
      if (!set) { set = new Set(); senderLeads.set(a, set); }
      set.add(e.lead_id);
    }

    // Filter: 3+ leads, 2+ firm domains
    const { data: leads } = await supabase
      .from("leads")
      .select("id, email, archived_at, is_duplicate");
    const leadDomain = new Map<string, string>();
    for (const l of (leads || [])) {
      if (l.archived_at || l.is_duplicate) continue;
      const e = (l.email || "").toLowerCase().trim();
      const d = e.includes("@") ? e.split("@")[1] : "";
      if (d) leadDomain.set(l.id, d);
    }

    const candidates: Array<{ sender: string; leads: string[]; domains: Set<string> }> = [];
    for (const [sender, leadSet] of senderLeads) {
      if (leadSet.size < 3) continue;
      const domains = new Set<string>();
      for (const lid of leadSet) {
        const d = leadDomain.get(lid);
        if (d) domains.add(d);
      }
      if (domains.size < 2) continue;
      candidates.push({ sender, leads: Array.from(leadSet), domains });
    }

    // Skip ones already pending or resolved recently
    const { data: existing } = await supabase
      .from("pending_attribution_suggestions")
      .select("sender_email, reason, status")
      .eq("reason", "intermediary_candidate");
    const known = new Set<string>();
    for (const x of (existing || [])) known.add((x.sender_email || "").toLowerCase());

    for (const c of candidates) {
      if (known.has(c.sender)) continue;
      const domain = c.sender.includes("@") ? c.sender.split("@")[1] : "";
      const sampleLead = c.leads[0];
      await supabase.from("pending_attribution_suggestions").insert({
        sender_email: c.sender,
        sender_domain: domain,
        suggested_lead_id: sampleLead,
        reason: "intermediary_candidate",
        email_count: c.leads.length,
        status: "pending",
      });
      suggested++;
    }

    await logCronRun("auto-suggest-intermediaries", suggested > 0 ? "success" : "noop", suggested, {
      candidates_evaluated: candidates.length,
    });

    return new Response(JSON.stringify({ ok: true, suggested, candidates: candidates.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logCronRun("auto-suggest-intermediaries", "error", suggested, {}, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
