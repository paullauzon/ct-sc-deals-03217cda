import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailLite {
  id: string;
  direction: "inbound" | "outbound";
  from_name?: string;
  from_address?: string;
  subject?: string;
  body_text?: string;
  body_preview?: string;
  email_date: string;
  opens?: Array<{ at?: string }>;
  clicks?: Array<{ at?: string }>;
  replied_at?: string | null;
  sequence_step?: string | null;
  ai_drafted?: boolean;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const STALE_HOURS = 6;

function summarizeBody(text: string, max = 600): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").slice(0, max);
}

/**
 * POST { threadId: string, leadId?: string, force?: boolean }
 * Pulls all messages for that thread, calls Lovable AI Gateway with tool-calling,
 * persists structured intelligence to email_thread_intelligence.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { threadId, leadId: leadIdParam, force = false } = await req.json();
    if (!threadId || typeof threadId !== "string") {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Skip if fresh cache exists
    if (!force) {
      const { data: cached } = await supabase
        .from("email_thread_intelligence")
        .select("*")
        .eq("thread_id", threadId)
        .maybeSingle();
      if (cached) {
        const age = Date.now() - new Date(cached.generated_at).getTime();
        if (age < STALE_HOURS * 3600 * 1000) {
          return new Response(JSON.stringify({ intelligence: cached, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Pull thread messages
    const { data: emails, error: emailsErr } = await supabase
      .from("lead_emails")
      .select("id, lead_id, direction, from_name, from_address, subject, body_text, body_preview, email_date, opens, clicks, replied_at, sequence_step, ai_drafted")
      .eq("thread_id", threadId)
      .order("email_date", { ascending: true })
      .limit(40);

    if (emailsErr) throw emailsErr;
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ error: "No emails found for thread" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const leadId = leadIdParam || (emails[0] as EmailLite & { lead_id: string }).lead_id;
    const lastEmailAt = emails[emails.length - 1].email_date;

    // Build compact transcript
    const transcript = (emails as EmailLite[]).map((e, i) => {
      const who = e.direction === "outbound" ? "REP" : (e.from_name || e.from_address || "LEAD");
      const date = new Date(e.email_date).toISOString().slice(0, 10);
      const body = summarizeBody(e.body_text || e.body_preview || "");
      const opens = Array.isArray(e.opens) ? e.opens.length : 0;
      const clicks = Array.isArray(e.clicks) ? e.clicks.length : 0;
      const meta = [
        e.sequence_step ? `step=${e.sequence_step}` : "",
        e.ai_drafted ? "ai-drafted" : "",
        opens ? `opens=${opens}` : "",
        clicks ? `clicks=${clicks}` : "",
      ].filter(Boolean).join(" · ");
      return `[${i + 1}] ${date} ${who}${meta ? ` (${meta})` : ""}\nSubject: ${e.subject || ""}\n${body}`;
    }).join("\n\n---\n\n");

    const systemPrompt = `You are an elite B2B sales coach analyzing one email thread for a CRM.
Return STRUCTURED data via the tool. Rules:
- Be concrete. No filler. No em/en dashes. Professional peer-to-peer tone.
- "summary" 1-2 sentences ≤220 chars on what is happening.
- "sentiment" one of: positive | engaged | neutral | cooling | negative.
- "recommended_action" ≤120 chars on what the rep should do next.
- "recommended_subject" ≤80 chars and "recommended_body" ≤600 chars: a complete short email draft the rep could send now.
- "suggested_sequence_step" short label like "stall-breaker", "proposal-followup", "break-up", "intro-followup", "pricing-clarify".
- "hot_flag" true ONLY if there is fresh strong intent (multiple opens in 48h, click on pricing/proposal, or explicit positive reply).
- "signal_tags" 1-4 short tags like "opened-3x", "no-reply-12d", "asked-pricing", "introduced-decision-maker".`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Thread (${emails.length} messages):\n\n${transcript}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_thread_intelligence",
            description: "Persist structured intelligence about this email thread.",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                sentiment: { type: "string", enum: ["positive", "engaged", "neutral", "cooling", "negative"] },
                recommended_action: { type: "string" },
                recommended_subject: { type: "string" },
                recommended_body: { type: "string" },
                suggested_sequence_step: { type: "string" },
                hot_flag: { type: "boolean" },
                signal_tags: { type: "array", items: { type: "string" } },
              },
              required: ["summary", "sentiment", "recommended_action", "recommended_subject", "recommended_body", "suggested_sequence_step", "hot_flag", "signal_tags"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_thread_intelligence" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("ai gateway error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments || "{}";
    const parsed = JSON.parse(argsRaw);

    const row = {
      thread_id: threadId,
      lead_id: leadId,
      summary: String(parsed.summary || "").slice(0, 400),
      sentiment: ["positive", "engaged", "neutral", "cooling", "negative"].includes(parsed.sentiment) ? parsed.sentiment : "neutral",
      recommended_action: String(parsed.recommended_action || "").slice(0, 200),
      recommended_subject: String(parsed.recommended_subject || "").slice(0, 140),
      recommended_body: String(parsed.recommended_body || "").slice(0, 1200),
      suggested_sequence_step: String(parsed.suggested_sequence_step || "").slice(0, 50),
      hot_flag: Boolean(parsed.hot_flag),
      signal_tags: Array.isArray(parsed.signal_tags) ? parsed.signal_tags.slice(0, 6).map((s: unknown) => String(s).slice(0, 40)) : [],
      email_count: emails.length,
      last_email_at: lastEmailAt,
      generated_at: new Date().toISOString(),
      model: "google/gemini-3-flash-preview",
    };

    const { error: upErr } = await supabase
      .from("email_thread_intelligence")
      .upsert(row, { onConflict: "thread_id" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ intelligence: row, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-email-thread error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
