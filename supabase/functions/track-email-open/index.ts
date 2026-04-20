// Phase 4 — open-pixel tracker.
// GET /track-email-open?eid=<lead_emails.id>
// Returns a 1x1 transparent GIF and appends an open event to lead_emails.opens.
// The trigger update_lead_email_metrics() will recompute total_opens from the new array.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

const pixelHeaders = {
  "Content-Type": "image/gif",
  "Content-Length": String(PIXEL.byteLength),
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Access-Control-Allow-Origin": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: pixelHeaders });
  }

  // Always return the pixel — never block on tracking failures.
  const respond = () => new Response(PIXEL, { status: 200, headers: pixelHeaders });

  try {
    const url = new URL(req.url);
    const eid = url.searchParams.get("eid");
    if (!eid) return respond();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch existing opens + email_date so we can filter Google's prefetch proxy.
    const { data: row } = await supabase
      .from("lead_emails")
      .select("id, opens, email_date")
      .eq("id", eid)
      .maybeSingle();

    if (row) {
      const ua = req.headers.get("user-agent") || "";
      const isProxy = /GoogleImageProxy|YahooMailProxy|ProtonMail/i.test(ua);
      // Suppress opens that fire within 30s of send AND come from a known proxy UA —
      // those are inbox prefetches, not real human opens.
      const sentAt = row.email_date ? new Date(row.email_date as string).getTime() : 0;
      const ageMs = Date.now() - sentAt;
      const isPrefetch = isProxy && ageMs >= 0 && ageMs < 30_000;

      const opens = Array.isArray(row.opens) ? (row.opens as unknown[]) : [];
      opens.push({
        at: new Date().toISOString(),
        ua: ua.slice(0, 200),
        proxy: isProxy,
        prefetch: isPrefetch,
      });

      // Only write back if NOT a prefetch — otherwise the trigger would inflate total_opens.
      if (!isPrefetch) {
        await supabase
          .from("lead_emails")
          .update({ opens })
          .eq("id", eid);
      }
    }
  } catch (e) {
    console.error("track-email-open error:", e);
  }

  return respond();
});
