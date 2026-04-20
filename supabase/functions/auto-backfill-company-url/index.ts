import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronRun } from "../_shared/cron-log.ts";

const JOB_NAME = "auto-backfill-company-url";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TERMINAL_STAGES = ["Lost", "Went Dark", "Closed Won", "Revisit/Reconnect"];
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","aol.com",
  "protonmail.com","live.com","msn.com","me.com","mac.com","ymail.com",
  "comcast.net","verizon.net","att.net","sbcglobal.net","cox.net",
]);

function deriveUrlFromEmail(email: string): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;
  return `https://${domain}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 50, 200);

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, email, company_url")
      .is("archived_at", null)
      .or("company_url.is.null,company_url.eq.")
      .not("stage", "in", `(${TERMINAL_STAGES.join(",")})`)
      .limit(limit);

    if (error) throw error;

    let updated = 0;
    let skipped = 0;
    for (const lead of leads || []) {
      const url = deriveUrlFromEmail(lead.email || "");
      if (!url) { skipped++; continue; }
      const { error: upErr } = await supabase
        .from("leads")
        .update({ company_url: url })
        .eq("id", lead.id);
      if (!upErr) updated++;
    }

    console.log(`[auto-backfill-company-url] scanned=${leads?.length ?? 0} updated=${updated} skipped=${skipped}`);
    const status = updated === 0 ? "noop" : "success";
    await logCronRun(JOB_NAME, status, updated, { scanned: leads?.length ?? 0, skipped });
    return new Response(
      JSON.stringify({ scanned: leads?.length ?? 0, updated, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("auto-backfill-company-url error:", err);
    await logCronRun(JOB_NAME, "error", 0, {}, (err as Error).message);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
