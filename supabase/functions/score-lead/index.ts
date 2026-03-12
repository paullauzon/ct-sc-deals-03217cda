import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "icloud.com", "outlook.com",
  "aol.com", "protonmail.com", "me.com", "mac.com", "msn.com",
]);

function isPersonalEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1] || "";
  if (PERSONAL_DOMAINS.has(domain)) return true;
  if (domain.endsWith(".edu")) return true;
  return false;
}

function extractDomain(email: string): string {
  return (email.toLowerCase().split("@")[1] || "").trim();
}

// Buyer type score (max 35)
function getBuyerTypeScore(
  buyerType: string | null,
  message: string | null,
  peBacked: boolean,
  tierOverride: boolean,
): number {
  if (!buyerType) return 3;

  const bt = buyerType.toLowerCase().trim();

  if (bt === "corporate") {
    if (peBacked || tierOverride) return 35;
    // Check message for platform/add-on language
    if (message) {
      const lower = message.toLowerCase();
      const platformKeywords = [
        "portfolio", "platform", "add-on", "add on",
        "tuck-in", "tuck in", "consolidat", "footprint", "backed",
      ];
      if (platformKeywords.some((kw) => lower.includes(kw))) return 30;
    }
    return 22;
  }

  switch (bt) {
    case "private_equity": return 25;
    case "family_office": return 20;
    case "independent_sponsor": return 14;
    case "search_fund": return 10;
    case "individual_investor": return 5;
    case "advisor_banker":
    case "consultant_advisor":
    case "business_owner":
      return 0;
    default:
      return 3;
  }
}

// Engagement score (max 5) based on form_name only
function getEngagementScore(formName: string | null): number {
  if (!formName) return 2;
  const lower = formName.toLowerCase();
  if (lower.includes("intro") || lower.includes("call")) return 5;
  if (lower.includes("deal") || lower.includes("dataset") || lower.includes("target")) return 3;
  return 2;
}

// Red flags (max deduction -10)
function getRedFlags(
  email: string,
  name: string | null,
  buyerType: string | null,
  hasKnownFirmMatch: boolean,
): number {
  let deduction = 0;

  if (isPersonalEmail(email)) deduction -= 5;

  if ((!name || name.trim() === "") && !hasKnownFirmMatch) deduction -= 2;

  const bt = (buyerType || "").toLowerCase().trim();
  if (bt === "advisor_banker" || bt === "consultant_advisor") deduction -= 5;
  if (bt === "business_owner") deduction -= 5;

  return Math.max(-10, deduction);
}

const LEGITIMATE_BUYER_TYPES = new Set([
  "private_equity", "corporate", "family_office",
  "independent_sponsor", "search_fund", "individual_investor",
]);

function assignTier(
  score: number,
  tierOverride: boolean,
): number {
  if (tierOverride) return 1;
  if (score >= 70) return 1;
  if (score >= 50) return 2;
  if (score >= 30) return 3;
  return 4;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let leadId: string | undefined;

  try {
    const body = await req.json();
    const lead = body.record || body;

    leadId = lead.id;
    const email: string = (lead.email || "").toLowerCase().trim();
    const name: string | null = lead.name || null;
    const company: string | null = lead.company || null;
    const website: string | null = lead.company_url || lead.website || null;
    const buyerType: string | null = lead.buyer_type || null;
    const formName: string | null = lead.source || lead.form_name || null;
    const message: string | null = lead.message || null;

    if (!leadId || !email) {
      return new Response(
        JSON.stringify({ error: "lead id and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Step 1: Check for Tier 5 (Not a Buyer) ───
    const bt = (buyerType || "").toLowerCase().trim();
    const personalEmail = isPersonalEmail(email);

    const tier5Types = ["advisor_banker", "consultant_advisor", "business_owner"];
    let isTier5 = false;

    if (tier5Types.includes(bt)) {
      isTier5 = true;
    }

    if (
      personalEmail &&
      (bt === "private_equity" || bt === "independent_sponsor") &&
      (!company || company.trim() === "")
    ) {
      isTier5 = true;
    }

    if (
      (!bt || bt === "") &&
      personalEmail &&
      (!message || message.length < 10)
    ) {
      isTier5 = true;
    }

    if (isTier5) {
      await supabase
        .from("leads")
        .update({
          stage1_score: 0,
          tier: 5,
          tier_override: false,
          known_firm_match: null,
          known_firm_domain_type: null,
          pe_backed: false,
          pe_sponsor_name: null,
          enrichment_status: "complete",
        })
        .eq("id", leadId);

      return new Response(
        JSON.stringify({ success: true, tier: 5, score: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Step 2: Known Firm Lookup ───
    const emailDomain = extractDomain(email);

    let knownFirmMatch: string | null = null;
    let knownFirmDomainType: string | null = null;
    let identityScore = 0;
    let peBacked = false;
    let peSponsorName: string | null = null;
    let tierOverride = false;
    let skipFormIdentity = false;

    const { data: firmRows } = await supabase
      .from("known_buyer_firms")
      .select("*")
      .eq("domain", emailDomain)
      .eq("active", true)
      .limit(1);

    const firm = firmRows && firmRows.length > 0 ? firmRows[0] : null;

    if (firm) {
      knownFirmMatch = firm.firm_name;

      if (firm.firm_type === "pe_firm" || firm.firm_type === "family_office") {
        knownFirmDomainType = firm.firm_type;
        identityScore = firm.lmm_focused ? 32 : 28;
        skipFormIdentity = true;
      } else if (firm.firm_type === "platform") {
        knownFirmDomainType = "platform";
        if (firm.pe_confirmed) {
          identityScore = 38;
          peBacked = true;
          peSponsorName = firm.pe_sponsor || null;
          tierOverride = true;
        } else {
          identityScore = 30;
        }
        skipFormIdentity = true;
      }
    }

    // ─── Step 3: Numeric Scoring ───

    // A. Buyer Type Score (max 35)
    const buyerTypeScore = getBuyerTypeScore(buyerType, message, peBacked, tierOverride);

    // B. Identity Score (max 40) — from known firm or form fields
    if (!skipFormIdentity) {
      identityScore = 0;
      if (!personalEmail) identityScore += 10;
      if (name && name.trim().length > 2) identityScore += 5;
      if (company && company.trim() !== "") identityScore += 5;
      if (website && website.includes(".")) identityScore += 5;
      identityScore = Math.min(25, identityScore);
    }

    // C. Engagement Score (max 5)
    const engagementScore = getEngagementScore(formName);

    // D. Red Flags (max deduction -10)
    const redFlagScore = getRedFlags(email, name, buyerType, !!knownFirmMatch);

    // ─── Step 4: Total Score and Tier ───
    let totalScore = buyerTypeScore + identityScore + engagementScore + redFlagScore;
    totalScore = Math.max(0, Math.min(100, totalScore));

    const tier = assignTier(totalScore, tierOverride);

    // ─── Step 5: Write Results ───
    await supabase
      .from("leads")
      .update({
        stage1_score: totalScore,
        tier,
        tier_override: tierOverride,
        known_firm_match: knownFirmMatch,
        known_firm_domain_type: knownFirmDomainType,
        pe_backed: peBacked,
        pe_sponsor_name: peSponsorName,
        enrichment_status: "pending",
      })
      .eq("id", leadId);

    // ─── Step 6: Trigger Stage 2 (async, non-blocking) ───
    // Skip enrichment for Tier 5 (already handled above) and
    // for fully identified PE-backed platform matches (tier_override from known firm)
    const skipEnrichment = tierOverride && peBacked && knownFirmMatch;

    if (!skipEnrichment) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

      // Fire and forget — do not await
      fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-scoring`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          leadId,
          email,
          name,
          company,
          website,
          buyerType,
          emailDomain,
          stage1Score: totalScore,
          currentTier: tier,
          tierOverride,
          peBacked,
          peSponsorName,
          knownFirmMatch,
        }),
      }).catch((err) => {
        console.error("Failed to trigger enrich-lead-scoring:", err);
      });
    } else {
      // Mark enrichment as complete for fully identified leads
      await supabase
        .from("leads")
        .update({ enrichment_status: "complete" })
        .eq("id", leadId);
    }

    console.log(`score-lead complete: ${leadId} → tier=${tier}, score=${totalScore}`);

    return new Response(
      JSON.stringify({ success: true, tier, score: totalScore, tierOverride }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("score-lead error:", err);

    // Fail gracefully — never prevent the lead from being saved
    if (leadId) {
      try {
        await supabase
          .from("leads")
          .update({
            stage1_score: null,
            tier: null,
            enrichment_status: "failed",
          })
          .eq("id", leadId);
      } catch (dbErr) {
        console.error("Failed to update lead on error:", dbErr);
      }
    }

    return new Response(
      JSON.stringify({ error: (err as Error).message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
