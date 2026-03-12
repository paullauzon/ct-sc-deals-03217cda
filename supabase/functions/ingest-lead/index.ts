import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Internal employee emails/domains to filter out
const EXCLUDED_EMAILS = [
  "adam.haile@sourcecodeals.com",
  "valeria@captarget.com",
  "myall@captarget.com",
  "malik@captarget.com",
  "tomos@captarget.com",
];
const EXCLUDED_DOMAINS = ["captarget.com", "sourcecodeals.com"];

function isInternalEmployee(email: string): boolean {
  const lower = email.toLowerCase().trim();
  if (EXCLUDED_EMAILS.includes(lower)) return true;
  const domain = lower.split("@")[1];
  return EXCLUDED_DOMAINS.includes(domain);
}

// ID prefix mapping
function getIdPrefix(brand: string, source: string): string {
  if (brand === "SourceCo") {
    if (source.includes("Intro")) return "SC-I-";
    return "SC-T-";
  }
  if (source.includes("Free Targets")) return "TGT-";
  return "CT-";
}

async function generateLeadId(
  supabase: ReturnType<typeof createClient>,
  brand: string,
  source: string
): Promise<string> {
  const prefix = getIdPrefix(brand, source);

  // Query existing IDs with this prefix to find the max
  const { data } = await supabase
    .from("leads")
    .select("id")
    .like("id", `${prefix}%`)
    .order("id", { ascending: false })
    .limit(50);

  let maxNum = 0;
  if (data && data.length > 0) {
    for (const row of data) {
      const numPart = row.id.replace(prefix, "");
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
    }
  }

  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate API key
    const authHeader = req.headers.get("Authorization");
    const expectedKey = Deno.env.get("INGEST_API_KEY");
    if (
      !expectedKey ||
      !authHeader ||
      authHeader.replace("Bearer ", "") !== expectedKey
    ) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Required fields
    const { brand, source, name, email } = body;
    if (!brand || !source || !name || !email) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: brand, source, name, email",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Filter internal employees
    if (isInternalEmployee(email)) {
      return new Response(
        JSON.stringify({
          status: "skipped",
          reason: "Internal employee",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Build submission record
    const submission = {
      brand,
      source,
      dateSubmitted: body.dateSubmitted || now,
      message: body.message || "",
      dealsPlanned: body.dealsPlanned || "",
      targetCriteria: body.targetCriteria || "",
      targetRevenue: body.targetRevenue || "",
      geography: body.geography || "",
      currentSourcing: body.currentSourcing || "",
      hearAboutUs: body.hearAboutUs || "",
      acquisitionStrategy: body.acquisitionStrategy || "",
      buyerType: body.buyerType || "",
      role: body.role || "",
      phone: body.phone || "",
      companyUrl: body.companyUrl || "",
    };

    // Check for existing lead by email
    const { data: existing } = await supabase
      .from("leads")
      .select("id, submissions")
      .eq("email", email.toLowerCase().trim())
      .limit(1);

    if (existing && existing.length > 0) {
      // Append submission to existing lead
      const lead = existing[0];
      const submissions = Array.isArray(lead.submissions)
        ? lead.submissions
        : [];
      submissions.push(submission);

      const { error: updateError } = await supabase
        .from("leads")
        .update({
          submissions,
          updated_at: new Date().toISOString(),
          // Update these fields if they were empty
          ...(body.phone ? { phone: body.phone } : {}),
          ...(body.companyUrl ? { company_url: body.companyUrl } : {}),
          ...(body.role ? { role: body.role } : {}),
        })
        .eq("id", lead.id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          status: "updated",
          leadId: lead.id,
          message: "Existing lead updated with new submission",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create new lead
    const leadId = await generateLeadId(supabase, brand, source);

    // Extract company from URL or email domain
    let company = body.company || "";
    if (!company && body.companyUrl) {
      try {
        const url = new URL(
          body.companyUrl.startsWith("http")
            ? body.companyUrl
            : `https://${body.companyUrl}`
        );
        company = url.hostname.replace("www.", "").split(".")[0];
        company = company.charAt(0).toUpperCase() + company.slice(1);
      } catch {
        // ignore
      }
    }
    if (!company && email) {
      const domain = email.split("@")[1]?.split(".")[0];
      if (domain && !["gmail", "yahoo", "hotmail", "outlook", "proton", "icloud"].includes(domain)) {
        company = domain.charAt(0).toUpperCase() + domain.slice(1);
      }
    }

    const newLead = {
      id: leadId,
      brand,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: body.phone || "",
      company,
      company_url: body.companyUrl || "",
      role: body.role || "",
      source,
      date_submitted: body.dateSubmitted || now,
      message: body.message || "",
      deals_planned: body.dealsPlanned || "",
      stage: "New Lead",
      service_interest: "TBD",
      deal_value: 0,
      assigned_to: "",
      meeting_date: "",
      meeting_set_date: "",
      hours_to_meeting_set: null,
      days_in_current_stage: 0,
      stage_entered_date: now,
      close_reason: "",
      closed_date: "",
      notes: "",
      last_contact_date: "",
      next_follow_up: "",
      priority: "Medium",
      meeting_outcome: "",
      forecast_category: "",
      icp_fit: "",
      won_reason: "",
      lost_reason: "",
      subscription_value: 0,
      billing_frequency: "",
      contract_start: "",
      contract_end: "",
      target_criteria: body.targetCriteria || "",
      target_revenue: body.targetRevenue || "",
      geography: body.geography || "",
      current_sourcing: body.currentSourcing || "",
      pre_screen_completed: false,
      is_duplicate: false,
      duplicate_of: "",
      hear_about_us: body.hearAboutUs || "",
      acquisition_strategy: body.acquisitionStrategy || "",
      buyer_type: body.buyerType || "",
      meetings: [],
      submissions: [submission],
      fireflies_url: "",
      fireflies_transcript: "",
      fireflies_summary: "",
      fireflies_next_steps: "",
    };

    const { error: insertError } = await supabase
      .from("leads")
      .insert(newLead);

    if (insertError) throw insertError;

    // Trigger lead scoring asynchronously (fire and forget)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    fetch(`${SUPABASE_URL}/functions/v1/score-lead`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ record: newLead }),
    }).catch((err) => {
      console.error("Failed to trigger score-lead:", err);
    });

    return new Response(
      JSON.stringify({
        status: "created",
        leadId,
        message: `New lead created: ${name}`,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Ingest error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
