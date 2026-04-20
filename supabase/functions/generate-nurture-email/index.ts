// generate-nurture-email — produces personalized nurture copy per milestone.
//
// Called by `nurture-engine` when emitting d0 / d30 / d90 drafts. Day 45
// stays manual (Malik writes it himself, surfacing the Fireflies transcript).
//
// Inputs: lead row + day milestone (0 | 30 | 90).
// Output: { subject: string, body: string } — plain text body, no HTML.
//
// Uses Lovable AI Gateway (google/gemini-3-flash-preview default) per project
// AI rules. Obeys: max 80 words body, no em/en dashes, no banned filler,
// no "you mentioned", peer-to-peer tone, single-sentence subject.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const RULES = `
HARD RULES (violating any makes the email unusable):
- Max 80 words in the body. Subject under 8 words.
- No em dashes, en dashes, or double hyphens. Use commas or periods.
- No filler: never use "I hope this finds you well", "wanted to reach out", "circling back", "touching base", "following up", "just checking in", "happy to discuss", "looking forward".
- Never say "you mentioned" or repeat what the prospect already said about themselves.
- Peer-to-peer tone. Operator to operator. No vendor language. No "we offer", "our services", "our pipeline".
- One concrete observation, then one low-friction ask. That is it.
- Sign off with first name only on its own line after a blank line. No "Best", no "Regards".
`;

const ANGLE_BY_LOST_REASON: Record<string, string> = {
  "Going DIY":
    "Reference a specific data-quality challenge that DIY teams hit at this EBITDA range (stale ownership data, false positives on PE-backed targets, missing financial signals).",
  "Chose Axial":
    "Reference the structural difference between off-market origination and listed-deal inventory at this EBITDA range without naming Axial directly.",
  "Price was too high":
    "Reference cost-per-qualified-conversation math for this sector and EBITDA range.",
  "Pricing":
    "Reference cost-per-qualified-conversation math for this sector and EBITDA range.",
  "Budget":
    "Reference cost-per-qualified-conversation math for this sector and EBITDA range.",
  "Timing":
    "Reference one current market dynamic in their sector that affects buyer timing.",
  "Went Dark / No response":
    "Low-pressure relevance ping. One observation about their sector, no ask beyond a one-line reply.",
  "Lost to competitor":
    "Reference a structural gap competitors have in this sector at this EBITDA range.",
  "No fit / Not qualified":
    "Reference one shift in their sector that may have changed the fit calculus.",
  "Champion left":
    "Light reintroduction. Reference one sector observation, ask if there is a new owner of the search.",
  "Internal decision delayed":
    "Reference one current sector dynamic that may help them re-prioritize internally.",
  "Other":
    "Neutral, sector-specific observation. No assumption about the loss reason.",
};

interface GenInput {
  day: 0 | 30 | 90;
  brand: string;
  firstName: string;
  company: string;
  lostReason: string;
  sector: string;        // dealType / acquisitionStrategy
  ebitdaMin: string;
  ebitdaMax: string;
  acqTimeline: string;
  buyerType: string;     // PE fund / search fund / corp dev / family office
  geography: string;
}

function buildPrompt(i: GenInput): { system: string; user: string } {
  const ebitdaRange = i.ebitdaMin || i.ebitdaMax
    ? `EBITDA ${i.ebitdaMin || "?"}-${i.ebitdaMax || "?"}`
    : "EBITDA range unknown";
  const sectorClause = i.sector ? `sector: ${i.sector}` : "sector: unknown";
  const buyerClause = i.buyerType ? `buyer type: ${i.buyerType}` : "buyer type: unknown";
  const angle = ANGLE_BY_LOST_REASON[i.lostReason] ?? ANGLE_BY_LOST_REASON["Other"];

  let intent = "";
  if (i.day === 0) {
    intent = `DAY 0 INSIGHT EMAIL. Goal: prove you remembered them and have something useful, no pitch.\nAngle: ${angle}`;
  } else if (i.day === 30) {
    const timelineNote = i.acqTimeline
      ? `Their stated acquisition timeline was "${i.acqTimeline}" — if 30 days has elapsed and that window is now active, ask one direct question about whether they are deploying yet. Do NOT say "you mentioned".`
      : `No timeline on file — keep it a one-line market observation in their sector.`;
    intent = `DAY 30 MARKET UPDATE. ${timelineNote}\nReference one specific dynamic in their sector at their EBITDA range over the past 30 days.`;
  } else if (i.day === 90) {
    intent = `DAY 90 RE-OPEN ASK. Reference recent work with similar buyers (${buyerClause}, ${ebitdaRange}, ${sectorClause}). One sentence on what you have seen recently, then a direct one-line ask: "open to a quick reset?".`;
  }

  const system = `You are Malik writing a personal nurture email to a former prospect 90 days after they went cold or chose a different path. You are NOT a marketer. You are an operator who remembers them.\n\n${RULES}\n\nBrand: ${i.brand}. ${i.brand === "SourceCo" ? "You source operating executives for searchers and PE." : "You source off-market acquisition targets for buyers."}`;

  const user = `Write the email.

Recipient first name: ${i.firstName || "[no first name]"}
Company: ${i.company || "[no company]"}
${sectorClause}
${ebitdaRange}
${buyerClause}
Geography: ${i.geography || "unknown"}
Lost reason on file: ${i.lostReason || "unknown"}

${intent}

Output format (strict):
Subject: <one short subject>

<body, max 80 words>

${i.firstName ? "" : ""}Malik`;

  return { system, user };
}

async function callAI(system: string, user: string): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t.slice(0, 200)}`);
  }
  const j = await resp.json();
  return j.choices?.[0]?.message?.content ?? "";
}

function parseSubjectAndBody(raw: string): { subject: string; body: string } {
  const lines = raw.trim().split("\n");
  let subject = "";
  let bodyStart = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    const ln = lines[idx];
    const m = ln.match(/^subject:\s*(.+)$/i);
    if (m) {
      subject = m[1].trim().replace(/^["']|["']$/g, "");
      bodyStart = idx + 1;
      break;
    }
  }
  if (!subject) subject = "Quick thought";
  const body = lines.slice(bodyStart).join("\n").trim()
    .replace(/[—–]/g, ",")  // strip em/en dashes per project rule
    .replace(/--/g, ",");
  return { subject, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const day = Number(body.day);
    if (![0, 30, 90].includes(day)) {
      return new Response(JSON.stringify({ ok: false, error: "day must be 0, 30, or 90" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const input: GenInput = {
      day: day as 0 | 30 | 90,
      brand: String(body.brand || "Captarget"),
      firstName: String(body.firstName || "").split(" ")[0] || "",
      company: String(body.company || ""),
      lostReason: String(body.lostReason || ""),
      sector: String(body.sector || body.dealType || body.acquisitionStrategy || ""),
      ebitdaMin: String(body.ebitdaMin || ""),
      ebitdaMax: String(body.ebitdaMax || ""),
      acqTimeline: String(body.acqTimeline || ""),
      buyerType: String(body.buyerType || ""),
      geography: String(body.geography || ""),
    };
    const { system, user } = buildPrompt(input);
    const raw = await callAI(system, user);
    const parsed = parseSubjectAndBody(raw);
    return new Response(JSON.stringify({ ok: true, ...parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-nurture-email error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
