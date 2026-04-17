/**
 * Bulk-promote transcript-tier values from `deal_intelligence` JSON into the
 * manual dossier columns (`authority_confirmed`, `budget_confirmed`,
 * `decision_blocker`, `stall_reason`).
 *
 * Mirrors `bulk-promote-dossier` pattern: deterministic, idempotent, free.
 * Only writes when source JSON has a non-empty value AND target column is
 * currently empty. Scans only active leads (excludes Lost/Revisit/Closed Won/
 * Went Dark and archived).
 *
 * POST body: { brand?: "SourceCo" | "Captarget" | "all", limit?: number }
 * Returns: { scanned, promoted, fields_written, per_field: {...} }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXCLUDED_STAGES = ["Lost", "Revisit/Reconnect", "Went Dark", "Closed Won"];

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Map deal_intelligence JSON → dossier field values.
 * Conservative — only populates when JSON has clear positive signal.
 */
function deriveTranscriptFields(di: any): Record<string, string> {
  if (!di || typeof di !== "object") return {};
  const out: Record<string, string> = {};

  // authority_confirmed: who is the decision-maker
  const dm = di?.buyingCommittee?.decisionMaker;
  if (isNonEmpty(dm) && !/unknown|tbd|n\/?a/i.test(dm)) {
    out.authority_confirmed = dm.trim().slice(0, 200);
  }

  // budget_confirmed: only from explicit objection-tracker resolution
  const objections: any[] = Array.isArray(di?.objectionTracker) ? di.objectionTracker : [];
  const pricingObj = objections.find(o =>
    /price|pricing|budget|cost|fee|retainer/i.test(o?.objection || "")
  );
  if (pricingObj) {
    if (/^resolved$/i.test(pricingObj.status || "") && isNonEmpty(pricingObj.resolution)) {
      out.budget_confirmed = `Yes — ${String(pricingObj.resolution).trim().slice(0, 180)}`;
    } else if (/^open|recurring$/i.test(pricingObj.status || "")) {
      out.budget_confirmed = `No — open pricing concern: ${String(pricingObj.objection).trim().slice(0, 180)}`;
    }
  }

  // decision_blocker: highest-severity unmitigated risk OR first open objection
  const risks: any[] = Array.isArray(di?.riskRegister) ? di.riskRegister : [];
  const topRisk = risks.find(r =>
    /high|critical/i.test(r?.severity || "") && !/^mitigated$/i.test(r?.mitigationStatus || "")
  ) || risks[0];
  if (topRisk && isNonEmpty(topRisk.risk)) {
    out.decision_blocker = String(topRisk.risk).trim().slice(0, 240);
  } else {
    const openObj = objections.find(o => /^open$/i.test(o?.status || "") && isNonEmpty(o?.objection));
    if (openObj) out.decision_blocker = String(openObj.objection).trim().slice(0, 240);
  }

  // stall_reason: only when momentum signals stalling
  const momentum = di?.momentumSignals?.momentum;
  if (isNonEmpty(momentum) && /stall|declin|stuck|frozen|silent/i.test(momentum)) {
    // prefer riskRegister narrative if present
    const stallSrc = topRisk?.risk || di?.momentumSignals?.stallReason;
    if (isNonEmpty(stallSrc)) {
      out.stall_reason = String(stallSrc).trim().slice(0, 240);
    } else {
      out.stall_reason = `Momentum: ${momentum}`;
    }
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const brand = body?.brand && body.brand !== "all" ? body.brand : null;
    const limit = Math.min(Math.max(Number(body?.limit) || 500, 1), 500);

    let q = supabase
      .from("leads")
      .select("id,authority_confirmed,budget_confirmed,decision_blocker,stall_reason,deal_intelligence,stage")
      .is("archived_at", null)
      .not("deal_intelligence", "is", null)
      .not("stage", "in", `(${EXCLUDED_STAGES.join(",")})`)
      .limit(limit);
    if (brand) q = q.eq("brand", brand);
    const { data: leads, error } = await q;

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ status: "ok", scanned: 0, promoted: 0, fields_written: 0, per_field: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let promoted = 0;
    let fields_written = 0;
    const per_field: Record<string, number> = {};

    for (const lead of leads) {
      const derived = deriveTranscriptFields(lead.deal_intelligence);
      const updates: Record<string, string> = {};
      const written: string[] = [];
      for (const [col, val] of Object.entries(derived)) {
        const current = (lead as any)[col];
        if (current && String(current).trim()) continue; // never overwrite manual
        if (!isNonEmpty(val)) continue;
        updates[col] = val;
        written.push(col);
        per_field[col] = (per_field[col] || 0) + 1;
      }
      if (Object.keys(updates).length === 0) continue;

      const { error: upErr } = await supabase.from("leads").update(updates).eq("id", lead.id);
      if (upErr) {
        console.error(`[bulk-promote-transcript] update failed for ${lead.id}:`, upErr.message);
        continue;
      }
      await supabase.from("lead_activity_log").insert({
        lead_id: lead.id,
        event_type: "field_update",
        description: `Auto-promoted ${written.length} transcript-derived value${written.length === 1 ? "" : "s"}: ${written.join(", ")}`,
        new_value: JSON.stringify(updates).slice(0, 500),
      });
      promoted++;
      fields_written += written.length;
    }

    return new Response(
      JSON.stringify({ status: "ok", scanned: leads.length, promoted, fields_written, per_field }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bulk-promote-transcript-fields]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
