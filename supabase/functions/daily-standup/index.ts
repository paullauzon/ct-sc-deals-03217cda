// Daily AI Standup: top 3 deals to touch, top 3 risks, top 3 wins.
// Pulls active pipeline server-side, builds a compact summary, asks Lovable AI
// to return strict JSON via tool calling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIVE = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id,name,company,brand,stage,lead_status,deal_value,assigned_to,last_contact_date,next_follow_up,next_mutual_step,next_mutual_step_date,stage_entered_date,close_confidence,deal_intelligence,closed_date")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(400);
    if (error) throw error;

    const now = Date.now();
    const recentWonCutoff = now - 14 * 86400000;

    const active = (leads || []).filter(l => ACTIVE.includes(l.stage));
    const wonRecent = (leads || []).filter(l => l.stage === "Closed Won" && l.closed_date && new Date(l.closed_date).getTime() >= recentWonCutoff);

    // Compact summary lines
    const compact = active.map(l => {
      const di: any = l.deal_intelligence || {};
      const days = l.stage_entered_date ? Math.floor((now - new Date(l.stage_entered_date).getTime()) / 86400000) : 0;
      const silent = l.last_contact_date ? Math.floor((now - new Date(l.last_contact_date).getTime()) / 86400000) : null;
      const momentum = di?.momentumSignals?.momentum || "";
      const openObj = ((di?.objectionTracker || []) as any[]).filter(o => o.status === "Open" || o.status === "Recurring").length;
      return `${l.id} · ${l.name} @ ${l.company || "—"} · ${l.brand} · ${l.stage} (${days}d) · $${l.deal_value || 0}/mo · owner ${l.assigned_to || "—"}${silent !== null ? ` · ${silent}d silent` : ""}${momentum ? ` · ${momentum}` : ""}${openObj > 0 ? ` · ${openObj} open objection${openObj > 1 ? "s" : ""}` : ""}${l.next_mutual_step ? ` · next: ${l.next_mutual_step}` : ""}${l.close_confidence ? ` · ${l.close_confidence}%` : ""}`;
    }).join("\n");

    const wonCompact = wonRecent.map(l => `${l.name} @ ${l.company || "—"} · ${l.brand} · $${l.deal_value || 0}/mo · ${l.closed_date}`).join("\n");

    const systemPrompt = `You are a senior sales chief-of-staff for Captarget/SourceCo (M&A buy-side advisory, $5–25K/mo retainers). Your job: produce a sharp, scannable daily standup. Be specific, candid, no filler, no em dashes, no emojis. Reference deals by lead name.`;

    const userPrompt = `Today is ${new Date().toISOString().slice(0, 10)}.

ACTIVE PIPELINE (${active.length} deals)
========================================
${compact || "(no active deals)"}

RECENTLY WON (last 14d)
=======================
${wonCompact || "(none)"}

Return:
1. Top 3 deals to touch today — pick the highest-leverage moves, not just the loudest. Each: { leadId, leadName, action (one sentence), reason (one short clause) }.
2. Top 3 risks — deals at risk of slipping or being lost. Each: { leadId, leadName, risk (one sentence), recommended (one sentence) }.
3. Top 3 wins to celebrate — recent wins or strong momentum. Each: { leadName, why (one sentence) }.
4. One-line headline summarizing the day's posture (e.g., "Heavy on negotiation, light on top of funnel — push 2 calls today").`;

    const tool = {
      type: "function" as const,
      function: {
        name: "emit_standup",
        description: "Return today's standup as structured data.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            headline: { type: "string" },
            touchToday: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  leadId: { type: "string" },
                  leadName: { type: "string" },
                  action: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["leadId", "leadName", "action", "reason"],
              },
            },
            risks: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  leadId: { type: "string" },
                  leadName: { type: "string" },
                  risk: { type: "string" },
                  recommended: { type: "string" },
                },
                required: ["leadId", "leadName", "risk", "recommended"],
              },
            },
            wins: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  leadName: { type: "string" },
                  why: { type: "string" },
                },
                required: ["leadName", "why"],
              },
            },
          },
          required: ["headline", "touchToday", "risks", "wins"],
        },
      },
    };

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_standup" } },
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) return new Response(JSON.stringify({ error: "Rate limit hit, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (upstream.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await upstream.text();
      console.error("daily-standup gateway error", upstream.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await upstream.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: any = {};
    try { parsed = JSON.parse(args || "{}"); } catch { parsed = {}; }

    return new Response(JSON.stringify({ standup: parsed, generatedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("daily-standup error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
