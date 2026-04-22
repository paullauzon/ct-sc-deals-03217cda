// Daily cron — when a single email thread carries messages attributed to 2+
// different leads (e.g. a Gmail thread that was split mid-conversation when
// a new participant joined), assign every message in that thread a SHARED
// `canonical_thread_lead_id`. The lead with the most messages wins, ties broken
// by earliest email_date.
//
// We do NOT rewrite each message's `lead_id` — that preserves the audit trail
// of where each row was originally claimed. The deal-room view uses
// canonical_thread_lead_id to render the unified thread.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENTINELS = new Set(["unmatched", "firm_activity", "auto_reply", "role_based"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let threadsScanned = 0;
  let threadsConsolidated = 0;
  let messagesUpdated = 0;
  const errors: string[] = [];

  try {
    // Pull all emails with a thread_id and a real lead_id. Group client-side.
    // 1000-row pages × ~30 pages handles 30k threads comfortably.
    type Row = { id: string; thread_id: string; lead_id: string; email_date: string; canonical_thread_lead_id: string | null };
    const byThread = new Map<string, Row[]>();
    let from = 0;
    const PAGE = 1000;
    const WALL_BUDGET_MS = 100_000;

    for (;;) {
      if (Date.now() - startedAt > WALL_BUDGET_MS) break;
      const { data, error } = await supabase
        .from("lead_emails")
        .select("id, thread_id, lead_id, email_date, canonical_thread_lead_id")
        .neq("thread_id", "")
        .not("thread_id", "is", null)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`scan ${from}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data as Row[]) {
        if (SENTINELS.has(r.lead_id)) continue;
        const list = byThread.get(r.thread_id) || [];
        list.push(r);
        byThread.set(r.thread_id, list);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    threadsScanned = byThread.size;

    for (const [threadId, rows] of byThread) {
      const leadCounts = new Map<string, number>();
      const earliestByLead = new Map<string, string>();
      for (const r of rows) {
        leadCounts.set(r.lead_id, (leadCounts.get(r.lead_id) || 0) + 1);
        const cur = earliestByLead.get(r.lead_id);
        if (!cur || r.email_date < cur) earliestByLead.set(r.lead_id, r.email_date);
      }
      if (leadCounts.size < 2) continue; // single-owner thread — nothing to do

      // Pick canonical: most messages wins, tie-break on earliest email_date
      let bestLead = "";
      let bestCount = -1;
      let bestEarliest = "9999";
      for (const [lid, c] of leadCounts) {
        const earliest = earliestByLead.get(lid) || "9999";
        if (c > bestCount || (c === bestCount && earliest < bestEarliest)) {
          bestCount = c;
          bestLead = lid;
          bestEarliest = earliest;
        }
      }
      if (!bestLead) continue;

      // Only update rows whose canonical is wrong/missing
      const idsToUpdate = rows
        .filter((r) => r.canonical_thread_lead_id !== bestLead)
        .map((r) => r.id);
      if (idsToUpdate.length === 0) continue;

      for (let i = 0; i < idsToUpdate.length; i += 200) {
        const slice = idsToUpdate.slice(i, i + 200);
        const { error: upErr, count } = await supabase
          .from("lead_emails")
          .update({ canonical_thread_lead_id: bestLead }, { count: "exact" })
          .in("id", slice);
        if (upErr) { errors.push(`thread_${threadId.slice(0, 12)}: ${upErr.message}`); continue; }
        messagesUpdated += count ?? 0;
      }
      threadsConsolidated++;
    }

    const status = errors.length > 0 ? "error" : (threadsConsolidated > 0 ? "success" : "noop");
    await logCronRun(
      "consolidate-split-threads",
      status,
      threadsConsolidated,
      { threadsScanned, threadsConsolidated, messagesUpdated },
      errors.join("; "),
    );

    return new Response(
      JSON.stringify({ ok: true, threadsScanned, threadsConsolidated, messagesUpdated, errors, elapsed_ms: Date.now() - startedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    await logCronRun("consolidate-split-threads", "error", threadsConsolidated, { threadsScanned }, (e as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
