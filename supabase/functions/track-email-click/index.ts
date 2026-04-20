// Phase 5 — link click tracker.
// GET /track-email-click?eid=<lead_emails.id>&url=<encoded destination>
// Appends a click event to lead_emails.clicks, then 302-redirects to the original URL.
// Trigger update_lead_email_metrics() will recompute total_clicks from the new array.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isSafeRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const eid = url.searchParams.get("eid");
  const target = url.searchParams.get("url") || "";

  // Always redirect somewhere safe; never block on tracking failures.
  const safeTarget = isSafeRedirect(target) ? target : "https://www.google.com";

  if (eid) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: row } = await supabase
        .from("lead_emails")
        .select("id, clicks")
        .eq("id", eid)
        .maybeSingle();

      if (row) {
        const ua = req.headers.get("user-agent") || "";
        const clicks = Array.isArray(row.clicks) ? (row.clicks as unknown[]) : [];
        clicks.push({
          at: new Date().toISOString(),
          url: safeTarget.slice(0, 500),
          ua: ua.slice(0, 200),
        });
        await supabase.from("lead_emails").update({ clicks }).eq("id", eid);
      }
    } catch (e) {
      console.error("track-email-click error:", e);
    }
  }

  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: safeTarget, "Cache-Control": "no-store" },
  });
});
