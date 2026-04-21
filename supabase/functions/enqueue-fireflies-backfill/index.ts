// One-shot kickoff: scans leads with calendly_booked_at but missing/short
// fireflies_transcript, and enqueues them into fireflies_retry_queue for the
// background drainer to process. Re-callable safely (dedupes by lead_id).
//
// We repurpose the existing fireflies_retry_queue table: for backfill rows the
// `fireflies_id` column carries a synthetic key `backfill:<lead_id>` (because
// we don't yet know the real Fireflies meeting id — that's what the drainer
// will discover). The drainer recognizes the prefix and switches to search
// mode instead of re-fetch mode.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAGGER_SECONDS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Pull all calendly-linked leads in chunks (Postgrest 1000-row cap).
    const all: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, calendly_booked_at, fireflies_transcript")
        .is("archived_at", null)
        .neq("calendly_booked_at", "")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data ?? [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    // Filter to leads still missing transcript (< 200 chars).
    const eligible = all.filter(l => (l.fireflies_transcript || "").length < 200);

    if (eligible.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: all.length, enqueued: 0, skipped_existing: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedup against rows already queued for backfill.
    const syntheticIds = eligible.map(l => `backfill:${l.id}`);
    const { data: existing } = await supabase
      .from("fireflies_retry_queue")
      .select("fireflies_id, status")
      .in("fireflies_id", syntheticIds);
    const existingActive = new Set(
      (existing ?? [])
        .filter((r: any) => r.status === "pending" || r.status === "done")
        .map((r: any) => r.fireflies_id)
    );

    const toInsert = eligible
      .filter(l => !existingActive.has(`backfill:${l.id}`))
      .map((l, i) => ({
        lead_id: l.id,
        fireflies_id: `backfill:${l.id}`,
        status: "pending",
        attempts: 0,
        max_attempts: 3,
        next_attempt_at: new Date(Date.now() + i * STAGGER_SECONDS * 1000).toISOString(),
        last_error: "queued for calendly-anchored fireflies search",
      }));

    let inserted = 0;
    if (toInsert.length > 0) {
      // Insert in chunks of 100 to stay well under any payload limits.
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error } = await supabase.from("fireflies_retry_queue").insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      scanned: all.length,
      eligible: eligible.length,
      enqueued: inserted,
      skipped_existing: eligible.length - inserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
