/**
 * One-shot backfill: walks every SourceCo lead and fills empty
 * buyer_type / target_criteria / target_revenue / geography / ebitda_min / ebitda_max
 * using the deterministic regex parsers (mirrors src/lib/submissionParser.ts).
 *
 * Also sanitizes legacy `current_sourcing = "false"` / "true" / "[]" rows that
 * pre-date the ingest fix.
 *
 * Triggered manually (POST). Idempotent — re-running is safe.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ───────────── Inline parsers (kept in sync with submissionParser.ts) ───────────── */

function parseFirmTypeFromRole(role?: string): string {
  if (!role) return "";
  const r = role.toLowerCase().trim();
  if (!r) return "";
  if (r.includes("family office")) return "Family Office";
  if (r.includes("search fund")) return "Search Fund";
  if (r.includes("independent sponsor")) return "Independent Sponsor";
  if (r.includes("private equity") || r === "pe" || r.includes("pe firm")) return "PE Firm";
  if (r.includes("individual") || r.includes("hnwi") || r.includes("high net worth")) return "HNWI";
  if (r.includes("business owner") || r.includes("strategic") || r.includes("corporate")) return "Strategic / Corporate";
  if (r.includes("holdco") || r.includes("holding")) return "Holdco";
  return "";
}
function parseFirmTypeFromMessage(text?: string): string {
  if (!text) return "";
  const t = text.toLowerCase();
  if (/\bfamily office\b/.test(t)) return "Family Office";
  if (/\bsearch fund(er)?\b/.test(t)) return "Search Fund";
  if (/\bindependent sponsor\b/.test(t)) return "Independent Sponsor";
  if (/\b(private equity|pe firm|pe fund|p\.e\.)\b/.test(t)) return "PE Firm";
  if (/\b(hnwi|high net worth|individual investor)\b/.test(t)) return "HNWI";
  if (/\b(holdco|holding co|holding company)\b/.test(t)) return "Holdco";
  if (/\b(strategic acquirer|corp dev|corporate development|portco|portfolio company)\b/.test(t)) return "Strategic / Corporate";
  return "";
}
function parseEbitdaFromText(text?: string): { min: string; max: string } {
  if (!text) return { min: "", max: "" };
  const t = text.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ");
  const between = t.match(/(?:ebitda|sde)[^.\n]{0,40}?between\s+\$?\s?([\d.]+)\s?([mk]?)\s+(?:and|to)\s+\$?\s?([\d.]+)\s?([mk]?)/i);
  if (between) {
    const unit = (u: string) => (u.toLowerCase() === "k" ? "K" : "M");
    const u1 = between[2] ? unit(between[2]) : unit(between[4] || "m");
    const u2 = between[4] ? unit(between[4]) : u1;
    return { min: `$${between[1]}${u1}`, max: `$${between[3]}${u2}` };
  }
  const range = t.match(/(?:ebitda|sde)[^.\n]{0,40}?\$?\s?([\d.]+)\s?([mk]?)\s?[-to]+\s?\$?\s?([\d.]+)\s?([mk]?)/i);
  if (range) {
    const unit = (u: string) => (u.toLowerCase() === "k" ? "K" : "M");
    const u1 = range[2] ? unit(range[2]) : unit(range[4] || "m");
    const u2 = range[4] ? unit(range[4]) : u1;
    return { min: `$${range[1]}${u1}`, max: `$${range[3]}${u2}` };
  }
  const rangeRev = t.match(/\$?\s?([\d.]+)\s?([mk]?)\s?[-to]+\s?\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:ebitda|sde)/i);
  if (rangeRev) {
    const u2 = rangeRev[4].toUpperCase();
    const u1 = rangeRev[2] ? rangeRev[2].toUpperCase() : u2;
    return { min: `$${rangeRev[1]}${u1}`, max: `$${rangeRev[3]}${u2}` };
  }
  const plusEbitda = t.match(/\$?\s?([\d.]+)\s?([mk])\s?\+\s+(?:in\s+)?(?:ebitda|sde)/i);
  if (plusEbitda) return { min: `$${plusEbitda[1]}${plusEbitda[2].toUpperCase()}`, max: "" };
  const minOnly =
    t.match(/(?:min(?:imum)?|at least)[^.\n]{0,30}?(?:ebitda|sde)?[^.\n]{0,15}?\$?\s?([\d.]+)\s?([mk])/i) ||
    t.match(/\$?\s?([\d.]+)\s?([mk])\s+(?:min(?:imum)?|or more)\s+(?:in\s+)?(?:ebitda|sde)/i);
  if (minOnly) return { min: `$${minOnly[1]}${minOnly[2].toUpperCase()}`, max: "" };
  const sdeOf = t.match(/(?:ebitda|sde)\s+(?:of|is|at|around|approximately)\s+\$?\s?([\d.]+)\s?([mk])/i);
  if (sdeOf) return { min: `$${sdeOf[1]}${sdeOf[2].toUpperCase()}`, max: "" };
  const maxOnly = t.match(/(?:<|less than|under|up to)[^.\n]{0,15}?\$?\s?([\d.]+)\s?([mk])[^.\n]{0,15}?(?:ebitda|sde)/i);
  if (maxOnly) return { min: "", max: `$${maxOnly[1]}${maxOnly[2].toUpperCase()}` };
  return { min: "", max: "" };
}
function parseRevenueFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ");
  const range = t.match(/\$?\s?([\d.]+)\s?([mk]?)\s?[-to]+\s?\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:revenue|sales|topline|top line|arr)/i);
  if (range) {
    const u2 = range[4].toUpperCase();
    const u1 = range[2] ? range[2].toUpperCase() : u2;
    return `$${range[1]}${u1}-${range[3]}${u2}`;
  }
  const between = t.match(/between\s+\$?\s?([\d.]+)\s?([mk]?)\s+(?:and|to)\s+\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:revenue|sales|arr|topline)/i);
  if (between) {
    const u2 = between[4].toUpperCase();
    const u1 = between[2] ? between[2].toUpperCase() : u2;
    return `$${between[1]}${u1}-${between[3]}${u2}`;
  }
  const arrOf = t.match(/(?:revenue|sales|arr|topline)\s+(?:of|is|at|around|approximately)\s+\$?\s?([\d.]+)\s?([mk])/i);
  if (arrOf) return `$${arrOf[1]}${arrOf[2].toUpperCase()}+`;
  const plusRev = t.match(/\$?\s?([\d.]+)\s?([mk])\s?\+\s+(?:in\s+)?(?:revenue|sales|arr|profit|cashflow|cash flow|topline)/i);
  if (plusRev) return `$${plusRev[1]}${plusRev[2].toUpperCase()}+`;
  const single = t.match(/\$?\s?([\d.]+)\s?([mk])\+?\s+(?:in\s+)?(?:revenue|sales|arr|profit|cashflow|cash flow)/i);
  if (single) return `$${single[1]}${single[2].toUpperCase()}+`;
  const yearly = t.match(/(?:doing|generating|producing)\s+(?:at least|around|approximately)?\s*\$?\s?([\d.]+)\s?([mk])/i);
  if (yearly) return `$${yearly[1]}${yearly[2].toUpperCase()}+`;
  return "";
}
function parseGeographyFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ");
  const anchored: string[] = [];
  const anchorRe = /(?:based in|hq in|headquartered in|located in|focused on|operating in|targeting|target geography:?)\s+(?:the\s+)?([A-Z][\w&.\- ]{2,60}?)(?=[.,;\n]|$| with| and| but| where| our| we)/gi;
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(t))) {
    const cleaned = am[1].trim().replace(/\s+(US|U\.S\.|USA|United States)$/i, ", US").replace(/^the\s+/i, "");
    if (cleaned && cleaned.length < 80) anchored.push(cleaned);
  }
  const patterns: RegExp[] = [
    /\b(?:southern|northern|eastern|western|central)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g,
    /\b(?:midwest|midwestern|northeast|southeast|southwest|northwest|west coast|east coast|sun belt|rust belt|new england|tri[- ]?state|pacific northwest|mid[- ]?atlantic)\b/gi,
    /\b(?:north|south|east|west)\s+america\b/gi,
    /\b(?:canada|usa|united states|uk|united kingdom|europe|emea|apac|latam|mexico|ontario|quebec|alberta|british columbia|texas|california|florida|new york|illinois|ohio|michigan|pennsylvania|georgia|north carolina|south carolina|virginia|tennessee|arizona|colorado|washington|oregon|massachusetts|new jersey|oklahoma|louisiana|kansas|missouri|indiana|wisconsin|minnesota|iowa|nebraska|arkansas|alabama|kentucky|maryland|connecticut|nevada|utah|new mexico)\b/gi,
  ];
  const hits = new Set<string>();
  for (const a of anchored) {
    const norm = a.replace(/\bus\b/i, "US").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Of|And|The|In)\b/g, (m) => m.toLowerCase());
    hits.add(norm);
  }
  for (const re of patterns) {
    const m = t.match(re);
    if (m) m.forEach((s) => {
      const norm = s.trim().replace(/[,.;:].*$/, "").toLowerCase();
      if (/^midwestern\s+us$/i.test(norm)) { hits.add("Midwest, US"); return; }
      if (/^midwestern$/i.test(norm)) { hits.add("Midwest"); return; }
      const titled = norm.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUs\b/g, "US").replace(/\bUk\b/g, "UK");
      hits.add(titled);
    });
  }
  return hits.size ? Array.from(hits).slice(0, 4).join(", ") : "";
}
function parseSectorFromText(text?: string): string {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const intent = cleaned.match(/(?:looking for|seeking|targeting|acquir\w+|interested in|focused on|specialize in|pursue)\s+([^.;\n]{8,160})/i);
  if (intent) return intent[1].trim();
  const first = cleaned.split(/[.!?]\s/)[0];
  return first.length > 200 ? first.slice(0, 200) + "…" : first;
}

const BOOLISH = new Set(["false", "true", "null", "[]", "{}", "undefined"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, brand, role, message, buyer_type, target_criteria, target_revenue, geography, ebitda_min, ebitda_max, current_sourcing, acquisition_strategy")
      .eq("brand", "SourceCo")
      .is("archived_at", null);

    if (error) throw error;

    let updated = 0;
    let scrubbed = 0;
    const samples: any[] = [];

    for (const lead of leads || []) {
      const patch: Record<string, string> = {};

      // 1. buyer_type from role → message fallback
      if (!lead.buyer_type?.trim()) {
        const v = parseFirmTypeFromRole(lead.role) || parseFirmTypeFromMessage(lead.message);
        if (v) patch.buyer_type = v;
      }
      // 2. target_criteria (sector)
      if (!lead.target_criteria?.trim()) {
        const v = parseSectorFromText(lead.message);
        if (v) patch.target_criteria = v;
      }
      // 3. target_revenue
      if (!lead.target_revenue?.trim()) {
        const v = parseRevenueFromText(lead.message);
        if (v) patch.target_revenue = v;
      }
      // 4. geography
      if (!lead.geography?.trim()) {
        const v = parseGeographyFromText(lead.message);
        if (v) patch.geography = v;
      }
      // 5. ebitda min/max
      if (!lead.ebitda_min?.trim() || !lead.ebitda_max?.trim()) {
        const { min, max } = parseEbitdaFromText(lead.message);
        if (!lead.ebitda_min?.trim() && min) patch.ebitda_min = min;
        if (!lead.ebitda_max?.trim() && max) patch.ebitda_max = max;
      }
      // 6. scrub boolean-y current_sourcing / acquisition_strategy
      const csLower = (lead.current_sourcing || "").toLowerCase().trim();
      if (BOOLISH.has(csLower)) {
        patch.current_sourcing = "";
        scrubbed++;
      }
      const asLower = (lead.acquisition_strategy || "").toLowerCase().trim();
      if (BOOLISH.has(asLower)) {
        patch.acquisition_strategy = "";
      }

      if (Object.keys(patch).length === 0) continue;

      const { error: upErr } = await supabase.from("leads").update(patch).eq("id", lead.id);
      if (upErr) {
        console.error(`[backfill] ${lead.id} failed:`, upErr.message);
        continue;
      }
      updated++;
      if (samples.length < 5) samples.push({ id: lead.id, patch });
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        scanned: leads?.length || 0,
        updated,
        scrubbed_current_sourcing: scrubbed,
        samples,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[backfill-buyer-dossier]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
