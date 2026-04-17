/**
 * Bulk-process leads that have rich Fireflies transcripts in `meetings[]` but
 * no `deal_intelligence` (i.e. process-meeting was never run for those meetings).
 *
 * For each lead:
 *   1. For each meeting with `transcript.length > 200` and missing `intelligence`,
 *      call `process-meeting` to extract structured intelligence.
 *   2. Persist updated `meetings[]` array on the leads row.
 *   3. Call `synthesize-deal-intelligence` to roll up across all meetings.
 *   4. Persist `deal_intelligence` JSON.
 *   5. Derive + write 4 transcript-tier dossier columns inline (idempotent —
 *      only fills empty cells): authority_confirmed, decision_blocker,
 *      stall_reason, budget_confirmed.
 *   6. Log a single `field_update` activity entry per lead.
 *
 * POST body: { limit?: number = 10, leadIds?: string[] }
 *   - leadIds: optional explicit list, overrides the auto-discovery query.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ─── Inline derivers (mirror src/lib/dealDossier.ts) ─── */

function deriveAuthorityConfirmed(intel: any): string {
  const dm = intel?.buyingCommittee?.decisionMaker?.trim?.();
  if (dm) return `Yes — ${dm}`;
  const dmStake = intel?.stakeholderMap?.find?.((s: any) => s.influence === "Decision Maker");
  if (dmStake?.name) return `Yes — ${dmStake.name}`;
  return "";
}

function deriveDecisionBlocker(intel: any): string {
  const risks = intel?.riskRegister || [];
  if (!Array.isArray(risks) || risks.length === 0) return "";
  const sev = (r: any) => (r.severity === "Critical" ? 0 : r.severity === "High" ? 1 : 2);
  const open = risks
    .filter((r: any) => r.mitigationStatus !== "Mitigated")
    .sort((a: any, b: any) => sev(a) - sev(b));
  return open[0]?.risk?.trim?.() || "";
}

function deriveStallReason(intel: any): string {
  const m = intel?.momentumSignals?.momentum;
  if (m === "Stalled" || m === "Stalling") {
    const evidence = intel?.dealStageEvidence?.trim?.();
    if (evidence) return evidence;
    return `Momentum: ${m}`;
  }
  return "";
}

function deriveBudgetConfirmed(meetings: any[]): string {
  const ordered = [...(meetings || [])].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
  for (const m of ordered) {
    const b = m?.intelligence?.dealSignals?.budgetMentioned?.trim?.();
    if (!b) continue;
    const lower = b.toLowerCase();
    if (lower.includes("not") || lower.includes("no budget") || lower === "no") return "No";
    if (
      lower.includes("confirmed") ||
      lower.includes("approved") ||
      lower.includes("yes") ||
      /\$\s?\d/.test(b)
    ) return "Yes";
    return "Unclear";
  }
  return "";
}

/* ─── Main ─── */

async function processLead(supabase: any, url: string, key: string, lead: any) {
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  const meetings = Array.isArray(lead.meetings) ? [...lead.meetings] : [];
  let processedCount = 0;

  // Step 1: process each meeting that has a transcript but no intelligence
  for (let i = 0; i < meetings.length; i++) {
    const m = meetings[i];
    const transcript = (m?.transcript || "").trim();
    if (transcript.length < 200) continue;
    if (m.intelligence) continue;

    const priorMeetings = meetings.slice(0, i);
    let success = false;
    // Retry up to 4 times with exponential backoff on 429/5xx
    for (let attempt = 0; attempt < 4 && !success; attempt++) {
      if (attempt > 0) {
        const wait = Math.min(2000 * Math.pow(2, attempt), 20000);
        console.log(`[bulk-process-stale] ${lead.id} meeting ${i} retry ${attempt} after ${wait}ms`);
        await sleep(wait);
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 90000);
        const res = await fetch(`${url}/functions/v1/process-meeting`, {
          method: "POST",
          headers,
          body: JSON.stringify({ transcript, priorMeetings }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (res.status === 429 || res.status >= 500) {
          console.error(`[bulk-process-stale] ${lead.id} meeting ${i} HTTP ${res.status} (will retry)`);
          continue;
        }
        if (!res.ok) {
          console.error(`[bulk-process-stale] ${lead.id} meeting ${i} HTTP ${res.status} (giving up)`);
          break;
        }
        const data = await res.json();
        meetings[i] = {
          ...m,
          summary: data.summary || m.summary || "",
          nextSteps: data.nextSteps || m.nextSteps || "",
          intelligence: data.intelligence || undefined,
        };
        processedCount++;
        success = true;
      } catch (e: any) {
        console.error(`[bulk-process-stale] ${lead.id} meeting ${i} error:`, e?.message || e);
      }
    }
    // Inter-meeting throttle
    await sleep(2500);
  }

  if (processedCount === 0) {
    return { id: lead.id, processed: 0, intelOk: false, fieldsWritten: 0, fields: [] };
  }

  // Step 2: persist updated meetings array
  await supabase.from("leads").update({ meetings }).eq("id", lead.id);

  // Step 3: synthesize deal_intelligence across all meetings
  let dealIntelligence: any = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 50000);
    const synthRes = await fetch(`${url}/functions/v1/synthesize-deal-intelligence`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        meetings: meetings.map((m: any) => ({ ...m, transcript: m.transcript || "" })),
        leadFields: {
          name: lead.name,
          company: lead.company,
          role: lead.role,
          stage: lead.stage,
          priority: lead.priority,
          dealValue: lead.deal_value,
          serviceInterest: lead.service_interest,
        },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (synthRes.ok) {
      const synthData = await synthRes.json();
      dealIntelligence = synthData.dealIntelligence || null;
    } else {
      console.error(`[bulk-process-stale] ${lead.id} synthesize HTTP ${synthRes.status}`);
    }
  } catch (e: any) {
    console.error(`[bulk-process-stale] ${lead.id} synthesize error:`, e?.message || e);
  }

  // Step 4: persist deal_intelligence
  if (dealIntelligence) {
    await supabase.from("leads").update({ deal_intelligence: dealIntelligence }).eq("id", lead.id);
  }

  // Step 5: derive + promote 4 transcript-tier dossier columns (only if currently empty)
  const updates: Record<string, string> = {};
  const written: string[] = [];
  const auth = deriveAuthorityConfirmed(dealIntelligence);
  if (auth && !lead.authority_confirmed?.trim()) { updates.authority_confirmed = auth; written.push("Authority"); }
  const blocker = deriveDecisionBlocker(dealIntelligence);
  if (blocker && !lead.decision_blocker?.trim()) { updates.decision_blocker = blocker; written.push("Decision blocker"); }
  const stall = deriveStallReason(dealIntelligence);
  if (stall && !lead.stall_reason?.trim()) { updates.stall_reason = stall; written.push("Stall reason"); }
  const budget = deriveBudgetConfirmed(meetings);
  if (budget && !lead.budget_confirmed?.trim()) { updates.budget_confirmed = budget; written.push("Budget"); }
  const narrative = typeof dealIntelligence?.dealNarrative === "string" ? dealIntelligence.dealNarrative.trim() : "";
  if (narrative && !lead.deal_narrative?.trim()) { updates.deal_narrative = narrative; written.push("Deal narrative"); }
  const svc = typeof dealIntelligence?.serviceInterest === "string" ? dealIntelligence.serviceInterest.trim() : "";
  const currentSvc = (lead.service_interest || "").trim();
  if (svc && (!currentSvc || currentSvc === "TBD")) {
    updates.service_interest = svc;
    written.push("Service interest");
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("leads").update(updates).eq("id", lead.id);
    await supabase.from("lead_activity_log").insert({
      lead_id: lead.id,
      event_type: "field_update",
      description: `Auto-promoted ${written.length} transcript dossier value${written.length === 1 ? "" : "s"}: ${written.join(", ")}`,
      new_value: JSON.stringify(updates).slice(0, 500),
    });
  }

  return {
    id: lead.id,
    processed: processedCount,
    intelOk: !!dealIntelligence,
    fieldsWritten: written.length,
    fields: written,
  };
}

/* ─── Mode: service_interest re-synth + stakeholder promotion ───
 * For leads that already have deal_intelligence but are missing the
 * `serviceInterest` key (or whose lead_stakeholders rows are empty),
 * re-call synthesize-deal-intelligence and promote:
 *   - dealIntelligence.serviceInterest → leads.service_interest
 *   - dealIntelligence.buyingCommittee[] → lead_stakeholders rows (if none exist)
 */
async function reSynthAndPromote(supabase: any, url: string, key: string, lead: any) {
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  const meetings = Array.isArray(lead.meetings) ? lead.meetings : [];

  let dealIntelligence: any = lead.deal_intelligence || null;
  let resynthesized = false;

  // Only re-run synth if we actually have transcripts and no serviceInterest yet
  const hasTranscript = meetings.some((m: any) => (m?.transcript || "").trim().length > 200);
  const needsServiceInterest = !dealIntelligence || !dealIntelligence.serviceInterest;

  if (hasTranscript && needsServiceInterest) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 50000);
      const synthRes = await fetch(`${url}/functions/v1/synthesize-deal-intelligence`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          meetings: meetings.map((m: any) => ({ ...m, transcript: m.transcript || "" })),
          leadFields: {
            name: lead.name, company: lead.company, role: lead.role,
            stage: lead.stage, priority: lead.priority,
            dealValue: lead.deal_value, serviceInterest: lead.service_interest,
          },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (synthRes.ok) {
        const synthData = await synthRes.json();
        if (synthData.dealIntelligence) {
          dealIntelligence = synthData.dealIntelligence;
          resynthesized = true;
          await supabase.from("leads").update({ deal_intelligence: dealIntelligence }).eq("id", lead.id);
        }
      } else {
        console.error(`[resynth] ${lead.id} HTTP ${synthRes.status}`);
      }
    } catch (e: any) {
      console.error(`[resynth] ${lead.id} error:`, e?.message || e);
    }
  }

  // Promote serviceInterest → service_interest column
  let serviceWritten = false;
  const svc = typeof dealIntelligence?.serviceInterest === "string" ? dealIntelligence.serviceInterest.trim() : "";
  const currentSvc = (lead.service_interest || "").trim();
  if (svc && (!currentSvc || currentSvc === "TBD")) {
    await supabase.from("leads").update({ service_interest: svc }).eq("id", lead.id);
    serviceWritten = true;
  }

  // Promote buyingCommittee → lead_stakeholders (only if currently empty)
  // buyingCommittee is an OBJECT: { decisionMaker, champion, influencers[], blockers[], unknowns[] }
  let stakeholdersWritten = 0;
  const committee = dealIntelligence?.buyingCommittee;
  if (committee && typeof committee === "object" && !Array.isArray(committee)) {
    const { data: existing } = await supabase
      .from("lead_stakeholders")
      .select("id")
      .eq("lead_id", lead.id)
      .limit(1);
    if (!existing || existing.length === 0) {
      const rows: any[] = [];
      const seen = new Set<string>();
      const push = (rawName: unknown, role: string, sentiment: string) => {
        if (!rawName || typeof rawName !== "string") return;
        const name = rawName.trim().slice(0, 200);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          lead_id: lead.id,
          name,
          role,
          email: "",
          notes: "",
          sentiment,
        });
      };
      // Singletons
      push(committee.decisionMaker, "Decision Maker", "neutral");
      push(committee.champion, "Champion", "positive");
      push(committee.economicBuyer, "Economic Buyer", "neutral");
      push(committee.technicalBuyer, "Technical Buyer", "neutral");
      // Arrays of strings
      const pushArr = (arr: unknown, role: string, sentiment: string) => {
        if (!Array.isArray(arr)) return;
        for (const item of arr) {
          if (typeof item === "string") push(item, role, sentiment);
          else if (item && typeof item === "object" && (item as any).name) push((item as any).name, role, sentiment);
        }
      };
      pushArr(committee.influencers, "Influencer", "neutral");
      pushArr(committee.blockers, "Blocker", "negative");
      pushArr(committee.unknowns, "Unknown Role", "neutral");
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("lead_stakeholders").insert(rows);
        if (!insErr) stakeholdersWritten = rows.length;
        else console.error(`[stakeholders] ${lead.id} insert error:`, insErr.message);
      }
    }
  }

  return { id: lead.id, resynthesized, serviceWritten, stakeholdersWritten };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "stale_transcripts");
    const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 50);
    const leadIds: string[] | undefined = Array.isArray(body?.leadIds) ? body.leadIds : undefined;

    /* ─── service_interest mode ─── */
    if (mode === "service_interest") {
      let q = supabase
        .from("leads")
        .select("*")
        .is("archived_at", null)
        .not("stage", "in", "(Lost,Went Dark,Closed Won,Revisit/Reconnect)")
        .not("deal_intelligence", "is", null)
        .order("created_at", { ascending: false });
      if (leadIds && leadIds.length > 0) q = q.in("id", leadIds);
      else q = q.limit(limit);

      const { data: leads, error } = await q;
      if (error) throw error;

      // Filter to those that actually need work
      const candidates = (leads || []).filter((l: any) => {
        const intel = l?.deal_intelligence;
        const hasSI = !!intel?.serviceInterest;
        const committee = intel?.buyingCommittee;
        const hasCommittee = !!committee && (
          Array.isArray(committee) ? committee.length > 0 :
          typeof committee === "object" && (
            committee.decisionMaker || committee.champion || committee.economicBuyer || committee.technicalBuyer ||
            (Array.isArray(committee.influencers) && committee.influencers.length > 0) ||
            (Array.isArray(committee.blockers) && committee.blockers.length > 0) ||
            (Array.isArray(committee.unknowns) && committee.unknowns.length > 0)
          )
        );
        const currentSvc = (l.service_interest || "").trim();
        return (!hasSI && (!currentSvc || currentSvc === "TBD")) || hasCommittee;
      });

      console.log(`[bulk-process-stale:service_interest] ${candidates.length} candidates`);

      const results: any[] = [];
      let svcCount = 0, resynthCount = 0, stakesCount = 0;
      for (const lead of candidates) {
        const r = await reSynthAndPromote(supabase, url, key, lead);
        results.push(r);
        if (r.serviceWritten) svcCount++;
        if (r.resynthesized) resynthCount++;
        stakesCount += r.stakeholdersWritten;
        await sleep(1500);
      }

      return new Response(
        JSON.stringify({
          status: "ok",
          mode,
          candidates: candidates.length,
          resynthesized: resynthCount,
          service_interest_written: svcCount,
          stakeholders_written: stakesCount,
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ─── default mode: stale_transcripts ─── */
    let q = supabase
      .from("leads")
      .select("*")
      .is("archived_at", null)
      .not("stage", "in", "(Lost,Went Dark,Closed Won,Revisit/Reconnect)")
      .is("deal_intelligence", null)
      .order("created_at", { ascending: false });

    if (leadIds && leadIds.length > 0) {
      q = q.in("id", leadIds);
    } else {
      q = q.limit(limit);
    }

    const { data: leads, error } = await q;
    if (error) throw error;

    // Filter to leads that actually have at least one meeting with a real transcript
    const candidates = (leads || []).filter((l: any) => {
      const ms = Array.isArray(l.meetings) ? l.meetings : [];
      return ms.some((m: any) => (m?.transcript || "").trim().length > 200);
    });

    console.log(`[bulk-process-stale] Scanning ${candidates.length} candidate leads`);

    const results: any[] = [];
    let totalProcessed = 0;
    let totalFields = 0;
    let intelGenerated = 0;

    for (const lead of candidates) {
      const r = await processLead(supabase, url, key, lead);
      results.push(r);
      totalProcessed += r.processed;
      totalFields += r.fieldsWritten;
      if (r.intelOk) intelGenerated++;
      console.log(`[bulk-process-stale] ${lead.id}: meetings=${r.processed} intel=${r.intelOk} fields=${r.fieldsWritten}`);
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        candidates: candidates.length,
        meetings_processed: totalProcessed,
        intel_generated: intelGenerated,
        fields_written: totalFields,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bulk-process-stale-meetings]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
