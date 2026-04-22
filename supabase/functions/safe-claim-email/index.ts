// Safe email claim — wraps the shared claimEmailToLead helper so every UI claim
// goes through the strict participant-overlap rule. Direct .update() from the
// client now becomes the wrong path; this is the right one.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { claimEmailToLead } from "../_shared/claim-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const emailId = String(body.email_id || "").trim();
    const leadId = String(body.lead_id || "").trim();
    const promoteSenderToStakeholder = Boolean(body.promote_sender_to_stakeholder);

    if (!emailId || !leadId) {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_email_id_or_lead_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Round 6 — guardrails BEFORE any promote/claim:
    //   1) Refuse promote if sender's domain is on the noise list
    //   2) Refuse promote if sender is an `is_intermediary` on ANY lead
    //      (caller can pass force_promote=true to override after confirmation)
    const forcePromote = Boolean(body.force_promote);
    if (promoteSenderToStakeholder) {
      const { data: email } = await supabase
        .from("lead_emails")
        .select("from_address, from_name")
        .eq("id", emailId)
        .maybeSingle();
      if (email?.from_address) {
        const lower = email.from_address.toLowerCase().trim();
        const dom = lower.includes("@") ? lower.split("@")[1] : "";

        if (!forcePromote && dom) {
          const { data: noise } = await supabase
            .from("email_noise_domains")
            .select("domain")
            .eq("domain", dom)
            .limit(1);
          if (noise && noise.length > 0) {
            return new Response(
              JSON.stringify({ ok: false, reason: "sender_domain_is_noise", email_id: emailId, lead_id: leadId, blocking_domain: dom }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

        if (!forcePromote) {
          const { data: imRows } = await supabase
            .from("lead_stakeholders")
            .select("lead_id, is_intermediary")
            .eq("email", lower)
            .eq("is_intermediary", true)
            .limit(5);
          if (imRows && imRows.length > 0) {
            return new Response(
              JSON.stringify({
                ok: false,
                reason: "sender_flagged_intermediary",
                email_id: emailId,
                lead_id: leadId,
                flagged_on_leads: (imRows as Array<{ lead_id: string }>).map((r) => r.lead_id),
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

        const { data: existing } = await supabase
          .from("lead_stakeholders")
          .select("id")
          .eq("lead_id", leadId)
          .eq("email", lower)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from("lead_stakeholders").insert({
            lead_id: leadId,
            email: lower,
            name: (email.from_name || "").trim(),
            role: "Routed from Company Inbox",
            notes: "Manually attached via safe-claim-email",
            sentiment: "neutral",
            last_contacted: new Date().toISOString(),
          });
        }
      }
    }

    const result = await claimEmailToLead(supabase, emailId, leadId);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, reason: `internal_error: ${(e as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
