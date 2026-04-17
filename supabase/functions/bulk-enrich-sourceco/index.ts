/**
 * One-click bulk re-enrichment for top SourceCo leads.
 *
 * For each lead, we:
 *   1. Fetch the lead row (so we can pass the full payload that enrich-lead expects)
 *   2. Invoke enrich-lead with the form/CRM context
 *   3. Persist returned enrichment JSON
 *   4. Auto-promote high-confidence buyerProfileSuggested values into manual
 *      columns when those columns are currently empty (logged as a single
 *      activity entry per lead).
 *
 * POST body: { limit?: number }  // default 20, max 120
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Manual column mapping for buyerProfileSuggested.* keys.
const SUGGESTION_MAP: { sugKey: string; col: string; label: string }[] = [
  { sugKey: "firmAum",            col: "firm_aum",            label: "Firm AUM" },
  { sugKey: "acqTimeline",        col: "acq_timeline",        label: "Acq. timeline" },
  { sugKey: "activeSearches",     col: "active_searches",     label: "Active searches" },
  { sugKey: "ebitdaMin",          col: "ebitda_min",          label: "EBITDA min" },
  { sugKey: "ebitdaMax",          col: "ebitda_max",          label: "EBITDA max" },
  { sugKey: "dealType",           col: "deal_type",           label: "Deal type" },
  { sugKey: "transactionType",    col: "transaction_type",    label: "Transaction type" },
  { sugKey: "authorityConfirmed", col: "authority_confirmed", label: "Authority confirmed" },
];

function isLowSignal(v: any): boolean {
  if (!v) return true;
  const s = String(v).trim();
  if (!s) return true;
  if (/^(unknown|n\/?a|tbd|none|not available|not specified)/i.test(s)) return true;
  return false;
}

// @ts-ignore - Edge runtime global
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

async function runEnrichment(supabase: any, url: string, key: string, leads: any[]) {
  const errors: { id: string; error: string }[] = [];
  let enriched = 0;
  let promoted = 0;
  let fields_written = 0;

  for (const lead of leads) {
    try {
      const payload = {
        companyUrl: lead.company_url || lead.website_url || "",
        meetings: lead.meetings || [],
        leadName: lead.name,
        leadMessage: lead.message,
        leadRole: lead.role,
        leadCompany: lead.company,
        leadStage: lead.stage,
        leadPriority: lead.priority,
        leadDealValue: lead.deal_value,
        leadServiceInterest: lead.service_interest,
        leadForecastCategory: lead.forecast_category,
        leadIcpFit: lead.icp_fit,
        leadTargetCriteria: lead.target_criteria,
        leadTargetRevenue: lead.target_revenue,
        leadGeography: lead.geography,
        leadAcquisitionStrategy: lead.acquisition_strategy,
        leadBuyerType: lead.buyer_type,
        leadDaysInStage: lead.days_in_current_stage,
        leadStageEnteredDate: lead.stage_entered_date,
        leadLinkedinUrl: lead.linkedin_url,
        leadLinkedinTitle: lead.linkedin_title,
        leadNotes: lead.notes,
      };

      const res = await fetch(`${url}/functions/v1/enrich-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        errors.push({ id: lead.id, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` });
        await sleep(500);
        continue;
      }
      const data = await res.json();
      const enrichment = data?.enrichment;
      if (!enrichment) {
        errors.push({ id: lead.id, error: "No enrichment in response" });
        await sleep(500);
        continue;
      }

      await supabase.from("leads").update({ enrichment }).eq("id", lead.id);
      enriched++;

      const suggestions = enrichment?.buyerProfileSuggested || {};
      const updates: Record<string, string> = {};
      const written: string[] = [];
      for (const m of SUGGESTION_MAP) {
        const current = (lead as any)[m.col];
        if (current && String(current).trim()) continue;
        const v = suggestions[m.sugKey];
        if (isLowSignal(v)) continue;
        updates[m.col] = String(v).trim();
        written.push(m.label);
      }
      if (Object.keys(updates).length > 0) {
        const { error: upErr } = await supabase.from("leads").update(updates).eq("id", lead.id);
        if (!upErr) {
          promoted++;
          fields_written += written.length;
          await supabase.from("lead_activity_log").insert({
            lead_id: lead.id,
            event_type: "field_update",
            description: `Auto-promoted ${written.length} AI dossier value${written.length === 1 ? "" : "s"}: ${written.join(", ")}`,
            new_value: JSON.stringify(updates).slice(0, 500),
          });
        }
      }
    } catch (e) {
      errors.push({ id: lead.id, error: (e as Error).message });
    }
    await sleep(500);
  }
  console.log(`[bulk-enrich] DONE — scanned=${leads.length} enriched=${enriched} promoted=${promoted} fields=${fields_written} errors=${errors.length}`);
  return { scanned: leads.length, enriched, promoted, fields_written, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 250);
    const brand = body?.brand && body.brand !== "all" ? body.brand : null;
    const onlyEmptyAum = body?.onlyEmptyAum !== false;
    const background = body?.background === true;

    let q = supabase
      .from("leads")
      .select("*")
      .is("archived_at", null)
      .not("stage", "in", "(Lost,Went Dark,Closed Won,Revisit/Reconnect)")
      .order("tier", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (brand) q = q.eq("brand", brand);
    if (onlyEmptyAum) q = q.or("firm_aum.eq.,firm_aum.is.null");
    const { data: leads, error } = await q;

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ status: "ok", scanned: 0, enriched: 0, promoted: 0, errors: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Background mode: detach work from request lifecycle so a proxy disconnect doesn't kill it.
    if (background && typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      console.log(`[bulk-enrich] Starting background run for ${leads.length} leads`);
      EdgeRuntime.waitUntil(runEnrichment(supabase, url, key, leads));
      return new Response(JSON.stringify({ status: "started", scanned: leads.length, mode: "background" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await runEnrichment(supabase, url, key, leads);
    return new Response(JSON.stringify({ status: "ok", ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bulk-enrich-sourceco]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
