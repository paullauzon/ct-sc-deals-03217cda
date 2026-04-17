import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* ───────────── Inline submission parsers (mirror src/lib/submissionParser.ts) ───────────── */
function parseFirmTypeFromRole(role?: string): string {
  if (!role) return "";
  const r = role.toLowerCase().trim();
  if (!r) return "";
  if (r.includes("family office")) return "Family Office";
  if (r.includes("search fund")) return "Search Fund";
  if (r.includes("independent sponsor")) return "Independent Sponsor";
  if (r.includes("private equity") || r === "pe" || r.includes("pe firm")) return "PE Firm";
  if (r.includes("individual") || r.includes("hnwi") || r.includes("high net worth")) return "HNWI";
  if (r.includes("business owner") || r.includes("strategic") || r.includes("corporate")) return "Strategic / Corporate";
  if (r.includes("holdco") || r.includes("holding")) return "Holdco";
  return "";
}
function parseRevenueFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ");
  const range = t.match(/\$?\s?([\d.]+)\s?([mk]?)\s?[-–to]+\s?\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:revenue|sales|topline|top line|arr)/i);
  if (range) {
    const u2 = range[4].toUpperCase();
    const u1 = range[2] ? range[2].toUpperCase() : u2;
    return `$${range[1]}${u1}-${range[3]}${u2}`;
  }
  const single = t.match(/\$?\s?([\d.]+)\s?([mk])\+?\s+(?:in\s+)?(?:revenue|sales|arr)/i);
  if (single) return `$${single[1]}${single[2].toUpperCase()}+`;
  return "";
}
function parseGeographyFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ");
  const patterns: RegExp[] = [
    /\b(?:southern|northern|eastern|western|central)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g,
    /\b(?:midwest|midwestern|northeast|southeast|southwest|northwest|west coast|east coast|sun belt|rust belt|new england|tri[- ]?state)\b[^.]*?(?:us|usa|united states|u\.s\.|america)?/gi,
    /\b(?:north|south|east|west)\s+america\b/gi,
    /\b(?:canada|usa|united states|uk|united kingdom|europe|emea|apac|latam|mexico|ontario|quebec|texas|california|florida|new york)\b[^.]{0,40}/gi,
  ];
  const hits = new Set<string>();
  for (const re of patterns) {
    const m = t.match(re);
    if (m) m.forEach(s => hits.add(s.trim().replace(/[,.;].*$/, "")));
  }
  return hits.size ? Array.from(hits).slice(0, 3).join(", ") : "";
}
function parseSectorFromText(text?: string): string {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const intent = cleaned.match(/(?:looking for|seeking|targeting|acquir\w+|interested in|focused on|specialize in|pursue)\s+([^.;\n]{8,160})/i);
  if (intent) return intent[1].trim();
  const first = cleaned.split(/[.!?]\s/)[0];
  return first.length > 200 ? first.slice(0, 200) + "…" : first;
}

// Sanitize a string field: trim whitespace, normalize line breaks, limit length
function sanitizeString(val: unknown, maxLen = 5000): string {
  if (val === null || val === undefined) return "";
  const s = String(val)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

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
  supabase: any,
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

    // Parse body with resilient error handling
    let body: Record<string, unknown>;
    let rawText = "";
    try {
      rawText = await req.text();
      // Zapier can send literal newlines/carriage returns inside JSON string values
      // which is invalid JSON. Escape them before parsing.
      const sanitizedText = rawText
        .replace(/\r\n/g, "\\n")
        .replace(/\r/g, "\\n")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");
      body = JSON.parse(sanitizedText);
    } catch (parseErr) {
      console.error("JSON parse error. Raw body (first 500 chars):", rawText.slice(0, 500));
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          detail: (parseErr as Error).message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Required fields
    const brand = sanitizeString(body.brand, 100);
    const source = sanitizeString(body.source, 200);
    const name = sanitizeString(body.name, 200);
    const email = sanitizeString(body.email, 255).toLowerCase();

    console.log(`[ingest-lead] Processing: ${email} | ${name} | ${source}`);

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

    // Build submission record (sanitize all free-text fields)
    // Sanitize boolean-y / placeholder values that Zapier sometimes sends when
    // the Webflow form field was unanswered (raw `false`, `true`, `[]`, `null`).
    const sanitizeOptional = (val: unknown, maxLen: number): string => {
      const s = sanitizeString(val, maxLen);
      const lower = s.toLowerCase().trim();
      if (lower === "false" || lower === "true" || lower === "null" || lower === "[]" || lower === "{}" || lower === "undefined") return "";
      return s;
    };

    const submission = {
      brand,
      source,
      dateSubmitted: sanitizeString(body.dateSubmitted, 20) || now,
      message: sanitizeString(body.message, 5000),
      dealsPlanned: sanitizeString(body.dealsPlanned, 100),
      targetCriteria: sanitizeString(body.targetCriteria, 5000),
      targetRevenue: sanitizeString(body.targetRevenue, 200),
      geography: sanitizeString(body.geography, 500),
      currentSourcing: sanitizeOptional(body.currentSourcing, 1000),
      hearAboutUs: sanitizeString(body.hearAboutUs, 500),
      acquisitionStrategy: sanitizeOptional(body.acquisitionStrategy, 1000),
      buyerType: sanitizeString(body.buyerType, 200),
      role: sanitizeString(body.role, 200),
      phone: sanitizeString(body.phone, 50),
      companyUrl: sanitizeString(body.companyUrl, 500),
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
    const titleCase = (s: string) =>
      s.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    let company = body.company || "";
    if (!company && body.companyUrl) {
      try {
        const url = new URL(
          body.companyUrl.startsWith("http")
            ? body.companyUrl
            : `https://${body.companyUrl}`
        );
        company = titleCase(url.hostname.replace("www.", "").split(".")[0]);
      } catch {
        // ignore
      }
    }
    if (!company && email) {
      const domain = email.split("@")[1]?.split(".")[0];
      if (domain && !["gmail", "yahoo", "hotmail", "outlook", "proton", "icloud"].includes(domain)) {
        company = titleCase(domain);
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
      target_criteria: (body.targetCriteria as string) || parseSectorFromText(body.message as string) || "",
      target_revenue: (body.targetRevenue as string) || parseRevenueFromText(body.message as string) || "",
      geography: (body.geography as string) || parseGeographyFromText(body.message as string) || "",
      current_sourcing: submission.currentSourcing,
      pre_screen_completed: false,
      is_duplicate: false,
      duplicate_of: "",
      hear_about_us: body.hearAboutUs || "",
      acquisition_strategy: submission.acquisitionStrategy,
      buyer_type: (body.buyerType as string) || parseFirmTypeFromRole(body.role as string) || "",
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

    // Trigger scoring + LinkedIn enrichment in parallel, await both before returning
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const [scoreResult, linkedinResult] = await Promise.allSettled([
      fetch(`${SUPABASE_URL}/functions/v1/score-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ record: newLead }),
      }),
      fetch(`${SUPABASE_URL}/functions/v1/backfill-linkedin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ leadId }),
      }),
    ]);

    if (scoreResult.status === "rejected") {
      console.error("Failed to trigger score-lead:", scoreResult.reason);
    }
    if (linkedinResult.status === "rejected") {
      console.error("Failed to trigger backfill-linkedin:", linkedinResult.reason);
    }

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
