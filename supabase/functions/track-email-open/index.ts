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

    // Fetch existing opens, append, write back. Cheap because rows are small.
    const { data: row } = await supabase
      .from("lead_emails")
      .select("id, opens")
      .eq("id", eid)
      .maybeSingle();

    if (row) {
      const ua = req.headers.get("user-agent") || "";
      // Skip Gmail's image proxy preflight on send (it pre-fetches once before the recipient ever opens).
      // Heuristic: ignore if request happens within 30s of insert AND UA contains GoogleImageProxy with no other signal.
      // For simplicity we still log it — most inboxes show real opens within seconds anyway.
      const opens = Array.isArray(row.opens) ? (row.opens as unknown[]) : [];
      opens.push({ at: new Date().toISOString(), ua: ua.slice(0, 200) });

      await supabase
        .from("lead_emails")
        .update({ opens })
        .eq("id", eid);
    }
  } catch (e) {
    console.error("track-email-open error:", e);
  }

  return respond();
});
