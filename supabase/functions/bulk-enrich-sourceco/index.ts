/**
 * One-click bulk re-enrichment for top SourceCo leads.
 * Pulls the top N active SourceCo leads (not archived, not closed lost), then
 * invokes `enrich-lead` per lead with a 500 ms stagger to avoid OpenAI rate limits.
 *
 * POST body: { limit?: number }  // default 20
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 50);

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, tier, created_at")
      .eq("brand", "SourceCo")
      .is("archived_at", null)
      .not("stage", "in", "(Lost,Went Dark,Closed Won)")
      .order("tier", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ status: "ok", scanned: 0, enriched: 0, errors: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errors: { id: string; error: string }[] = [];
    let enriched = 0;

    for (const lead of leads) {
      try {
        const res = await fetch(`${url}/functions/v1/enrich-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ leadId: lead.id }),
        });
        if (!res.ok) {
          const txt = await res.text();
          errors.push({ id: lead.id, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` });
        } else {
          enriched++;
        }
      } catch (e) {
        errors.push({ id: lead.id, error: (e as Error).message });
      }
      await sleep(500);
    }

    return new Response(
      JSON.stringify({ status: "ok", scanned: leads.length, enriched, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bulk-enrich-sourceco]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
