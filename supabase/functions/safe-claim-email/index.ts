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

    // Optional: allow the Company Inbox flow to promote the sender to a
    // stakeholder FIRST, so the participant-overlap check then succeeds.
    if (promoteSenderToStakeholder) {
      const { data: email } = await supabase
        .from("lead_emails")
        .select("from_address, from_name")
        .eq("id", emailId)
        .maybeSingle();
      if (email?.from_address) {
        const lower = email.from_address.toLowerCase().trim();
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
