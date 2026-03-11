import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    // Fetch all leads that have not been scored yet (no stage1_score)
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, email, name, company, company_url, buyer_type, source, message")
      .is("stage1_score", null)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No unscored leads found", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`backfill-lead-scores: found ${leads.length} unscored leads`);

    let scored = 0;
    let failed = 0;

    // Process leads sequentially to avoid overwhelming score-lead
    // Score-lead is fast (<200ms) so this is fine even for hundreds of leads
    for (const lead of leads) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/score-lead`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ record: lead }),
        });

        if (res.ok) {
          scored++;
          console.log(`Scored lead ${lead.id} (${scored}/${leads.length})`);
        } else {
          failed++;
          const errText = await res.text();
          console.error(`Failed to score lead ${lead.id}: ${errText}`);
        }
      } catch (e) {
        failed++;
        console.error(`Error scoring lead ${lead.id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: leads.length,
        scored,
        failed,
        message: `Backfill complete: ${scored} scored, ${failed} failed out of ${leads.length} leads`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-lead-scores error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
