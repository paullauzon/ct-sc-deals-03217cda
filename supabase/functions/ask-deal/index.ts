// Ask-this-deal: streaming AI chat over a single lead's full context.
// Loads lead row + recent meetings + stakeholders + emails server-side,
// builds a system prompt, and streams the response back as SSE.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage { role: "user" | "assistant"; content: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { leadId, messages } = await req.json() as { leadId: string; messages: ChatMessage[] };
    if (!leadId || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "leadId and messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull lead row
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull stakeholders + last 10 emails (preview only, no body html)
    const [{ data: stakeholders }, { data: emails }] = await Promise.all([
      supabase.from("lead_stakeholders").select("name,role,email,sentiment,notes,last_contacted").eq("lead_id", leadId),
      supabase.from("lead_emails").select("direction,from_name,from_address,subject,body_preview,email_date,replied_at").eq("lead_id", leadId).order("email_date", { ascending: false }).limit(10),
    ]);

    // Build a compact deal context string
    const meetings = Array.isArray(lead.meetings) ? lead.meetings : [];
    const di = lead.deal_intelligence ?? {};
    const enrichment = lead.enrichment ?? {};

    const meetingsBlock = meetings.slice(-3).map((m: any, i: number) => {
      const intel = m.intelligence;
      const lines = [`Meeting ${i + 1}: ${m.title || "(untitled)"} · ${m.date}`];
      if (intel?.summary) lines.push(`Summary: ${intel.summary}`);
      if (intel?.dealSignals?.buyingIntent) lines.push(`Intent: ${intel.dealSignals.buyingIntent} · Sentiment: ${intel.dealSignals.sentiment}`);
      if (intel?.dealSignals?.objections?.length) lines.push(`Objections: ${intel.dealSignals.objections.join("; ")}`);
      if (intel?.dealSignals?.timeline) lines.push(`Timeline: ${intel.dealSignals.timeline}`);
      if (intel?.painPoints?.length) lines.push(`Pain points: ${intel.painPoints.join("; ")}`);
      if (intel?.nextSteps?.length) lines.push(`Next steps: ${intel.nextSteps.map((s: any) => `${s.action} (${s.owner})`).join("; ")}`);
      return lines.join("\n");
    }).join("\n\n");

    const stakeholdersBlock = (stakeholders || []).map((s: any) =>
      `- ${s.name}${s.role ? `, ${s.role}` : ""} · ${s.sentiment}${s.notes ? ` · ${s.notes}` : ""}`
    ).join("\n");

    const emailsBlock = (emails || []).slice(0, 8).map((e: any) =>
      `[${e.direction}] ${e.email_date} · ${e.from_name || e.from_address} → "${e.subject || "(no subject)"}" — ${(e.body_preview || "").slice(0, 200)}`
    ).join("\n");

    const dealNarrative = di.dealNarrative || lead.deal_narrative || "";
    const winStrategy = di.winStrategy ? `Win strategy: ${di.winStrategy.numberOneCloser || ""}\nLandmines: ${(di.winStrategy.landmines || []).join("; ")}` : "";
    const objectionTracker = (di.objectionTracker || []).filter((o: any) => o.status !== "Addressed").map((o: any) => `- ${o.objection} (${o.status})`).join("\n");
    const actionTracker = (di.actionItemTracker || []).filter((a: any) => a.status === "Open" || a.status === "Overdue").map((a: any) => `- ${a.item} (owner: ${a.owner}${a.deadline ? `, due ${a.deadline}` : ""})`).join("\n");

    const systemPrompt = `You are a senior M&A sales advisor for Captarget/SourceCo, advising the rep on a specific live deal. You speak in concise, candid, peer-to-peer language. No filler. No em dashes. No emojis. When the rep asks, draw only from the deal context below — do not invent details. If the answer isn't in the context, say so plainly.

DEAL CONTEXT
============
Brand: ${lead.brand}
Lead: ${lead.name}${lead.role ? ` (${lead.role})` : ""} @ ${lead.company || "—"}
Stage: ${lead.stage} · Lead status: ${lead.lead_status || "Working"}
Deal value: $${lead.deal_value || 0}/mo${lead.contract_months ? ` · ${lead.contract_months}mo TCV $${(lead.deal_value || 0) * lead.contract_months}` : ""}
Owner: ${lead.assigned_to || "—"}
Forecast: ${lead.forecast_category || "—"} · Confidence: ${lead.close_confidence || "—"}%
Next mutual step: ${lead.next_mutual_step || "—"}${lead.next_mutual_step_date ? ` (by ${lead.next_mutual_step_date})` : ""}
Competing: ${lead.competing_bankers || "—"}
Service interest: ${lead.service_interest}
${lead.target_criteria ? `Target criteria: ${lead.target_criteria}` : ""}
${lead.target_revenue ? `Target revenue: ${lead.target_revenue}` : ""}
${lead.geography ? `Geography: ${lead.geography}` : ""}

DEAL NARRATIVE
==============
${dealNarrative || "(none synthesized yet)"}

${winStrategy}

STAKEHOLDERS
============
${stakeholdersBlock || "(none logged)"}

OPEN OBJECTIONS
===============
${objectionTracker || "(none)"}

OPEN COMMITMENTS
================
${actionTracker || "(none)"}

RECENT MEETINGS (last 3)
========================
${meetingsBlock || "(no meetings)"}

RECENT EMAILS (last 8)
======================
${emailsBlock || "(no emails)"}

ENRICHMENT
==========
${enrichment.companyDescription || ""}
${enrichment.buyerMotivation ? `Buyer motivation: ${enrichment.buyerMotivation}` : ""}
${enrichment.urgency ? `Urgency: ${enrichment.urgency}` : ""}

Keep responses under 200 words unless the rep explicitly asks for more depth. Use short paragraphs or bullet lists.`;

    // Stream from Lovable AI Gateway
    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-12),
        ],
        stream: true,
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit hit, try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (upstream.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await upstream.text();
      console.error("AI gateway error", upstream.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ask-deal error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
