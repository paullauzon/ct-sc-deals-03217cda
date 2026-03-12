import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAINS = ["captarget.com", "sourcecodeals.com"];

function isInternalAddress(email: string): boolean {
  const domain = email.toLowerCase().trim().split("@")[1];
  return INTERNAL_DOMAINS.includes(domain);
}

function extractEmail(raw: string): string {
  // Handle "Name <email@domain.com>" format
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).toLowerCase().trim();
}

function extractName(raw: string): string {
  const match = raw.match(/^([^<]+)</);
  return match ? match[1].trim().replace(/"/g, "") : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    const expectedKey = Deno.env.get("INGEST_API_KEY");
    if (!expectedKey || !authHeader || authHeader.replace("Bearer ", "") !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { from, to, subject, body_preview, date, thread_id, message_id } = body;

    if (!from) {
      return new Response(JSON.stringify({ error: "Missing required field: from" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fromEmail = extractEmail(from);
    const fromName = extractName(from);

    // Parse to addresses (can be string or comma-separated)
    const toRaw = typeof to === "string" ? to : Array.isArray(to) ? to.join(", ") : "";
    const toAddresses = toRaw.split(",").map((t: string) => extractEmail(t.trim())).filter(Boolean);

    // Determine direction
    const direction = isInternalAddress(fromEmail) ? "outbound" : "inbound";

    // Find matching lead by email
    // Collect all email addresses involved
    const allEmails = [fromEmail, ...toAddresses].filter(e => !isInternalAddress(e));

    let leadId = "unmatched";
    if (allEmails.length > 0) {
      // Query leads table for any matching email
      const { data: leads } = await supabase
        .from("leads")
        .select("id, email")
        .in("email", allEmails)
        .limit(1);

      if (leads && leads.length > 0) {
        leadId = leads[0].id;
      }
    }

    // Parse email date
    let emailDate: string;
    try {
      emailDate = date ? new Date(date).toISOString() : new Date().toISOString();
    } catch {
      emailDate = new Date().toISOString();
    }

    // Insert (dedup via message_id UNIQUE constraint)
    const row = {
      lead_id: leadId,
      message_id: message_id || `auto-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      thread_id: thread_id || "",
      direction,
      from_address: fromEmail,
      from_name: fromName,
      to_addresses: toAddresses,
      subject: (subject || "").substring(0, 500),
      body_preview: (body_preview || "").substring(0, 5000),
      email_date: emailDate,
      source: "zapier",
      raw_payload: body,
    };

    const { error: insertError } = await supabase.from("lead_emails").insert(row);

    if (insertError) {
      // Duplicate message_id
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ status: "duplicate", message_id: row.message_id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        status: "created",
        lead_id: leadId,
        direction,
        message: leadId === "unmatched"
          ? "Email stored but no matching lead found"
          : `Email linked to lead ${leadId}`,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Ingest email error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
