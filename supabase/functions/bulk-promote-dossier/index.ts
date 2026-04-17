/**
 * Bulk-promote dossier values: walks every active SourceCo lead and runs the
 * deterministic JS parsers against the form submission, writing results to the
 * manual columns ONLY when the manual column is currently empty.
 *
 * Idempotent. Free (no AI calls). Safe to re-run after parser updates.
 *
 * POST body: { brand?: "SourceCo" | "Captarget", limit?: number }
 * Returns: { scanned, promoted, fields_written, per_field: {...} }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── Inlined parsers (must mirror src/lib/submissionParser.ts) ─── */

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

function parseTimelineFromStrategy(s?: string): string {
  if (!s) return "";
  const x = s.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u2013\u2014]/g, "-");
  if (x.includes("under loi") || x.includes("in diligence") || x.includes("closing")) return "0-3 months";
  if (x.includes("mid-process") || x.includes("mid process") || x.includes("in process") || /\b1[- ]?2 deals?\b/.test(x)) return "0-3 months";
  if (x.includes("actively sourcing") || x.includes("active search") || x.includes("ready to")) return "3-6 months";
  if (x.includes("exploring") || x.includes("evaluating") || x.includes("planning") || x.includes("thesis-building") || x.includes("thesis building")) return "6-12 months";
  if (x.includes("opportunistic") || x.includes("open to")) return "Opportunistic";
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
  const plusEbitda = t.match(/\$?\s?([\d.]+)\s?([mk])\s?\+\s+(?:in\s+)?(?:ebitda|sde)/i);
  if (plusEbitda) return { min: `$${plusEbitda[1]}${plusEbitda[2].toUpperCase()}`, max: "" };
  const minOnly =
    t.match(/(?:min(?:imum)?|at least)[^.\n]{0,30}?(?:ebitda|sde)?[^.\n]{0,15}?\$?\s?([\d.]+)\s?([mk])/i) ||
    t.match(/\$?\s?([\d.]+)\s?([mk])\s+(?:min(?:imum)?|or more)\s+(?:in\s+)?(?:ebitda|sde)/i);
  if (minOnly) return { min: `$${minOnly[1]}${minOnly[2].toUpperCase()}`, max: "" };
  const sdeOf = t.match(/(?:ebitda|sde)\s+(?:of|is|at|around|approximately)\s+\$?\s?([\d.]+)\s?([mk])/i);
  if (sdeOf) return { min: `$${sdeOf[1]}${sdeOf[2].toUpperCase()}`, max: "" };
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
  const arrOf = t.match(/(?:revenue|sales|arr|topline)\s+(?:of|is|at|around|approximately)\s+\$?\s?([\d.]+)\s?([mk])/i);
  if (arrOf) return `$${arrOf[1]}${arrOf[2].toUpperCase()}+`;
  const plusRev = t.match(/\$?\s?([\d.]+)\s?([mk])\s?\+\s+(?:in\s+)?(?:revenue|sales|arr|profit|cashflow|cash flow|topline)/i);
  if (plusRev) return `$${plusRev[1]}${plusRev[2].toUpperCase()}+`;
  return "";
}

const GEO_VOCAB = /\b(?:midwest|midwestern|northeast|southeast|southwest|northwest|west coast|east coast|sun belt|new england|tri[- ]?state|pacific northwest|mid[- ]?atlantic|north america|canada|usa|us|u\.s\.|united states|uk|europe|emea|apac|texas|california|florida|new york|illinois|ohio|michigan|pennsylvania|georgia|chicago|austin|dallas|houston|atlanta|denver|seattle|miami|boston|nashville|phoenix)\b/i;

function parseGeographyFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ");
  const hits = new Set<string>();
  const patterns: RegExp[] = [
    /\b(?:southern|northern|eastern|western|central)\s+(?:US|usa|united states|california|texas|florida|europe|america|canada)\b/gi,
    /\b(?:midwest|midwestern|northeast|southeast|southwest|northwest|west coast|east coast|sun belt|new england|pacific northwest|mid[- ]?atlantic)\b/gi,
    /\b(?:north|south|east|west)\s+america\b/gi,
    /\b(?:canada|usa|united states|uk|europe|emea|apac|texas|california|florida|new york|illinois|ohio|michigan|pennsylvania|georgia)\b/gi,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) m.forEach(s => {
      const norm = s.trim().replace(/[,.;:].*$/, "").toLowerCase();
      if (/^midwestern$/i.test(norm)) { hits.add("Midwest"); return; }
      const titled = norm.replace(/\b\w/g, c => c.toUpperCase()).replace(/\bUs\b/g, "US");
      hits.add(titled);
    });
  }
  if (!hits.size) return "";
  return Array.from(hits).slice(0, 4).join(", ");
}

const SECTOR_DENYLIST = /^(use your tool|use the tool|your tool|deal sourcing|source for( me)?|tbd|n\/?a|test|none|other|unknown)$/i;
function isLowSignalSector(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 20) return true;
  if (SECTOR_DENYLIST.test(trimmed)) return true;
  const words = trimmed.toLowerCase().split(/\W+/).filter(Boolean);
  if (new Set(words).size < 3) return true;
  return false;
}

function parseSectorFromText(text?: string): string {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const intent = cleaned.match(/(?:looking for|seeking|targeting|acquir\w+|interested in|focused on|specialize in|pursue)\s+([^.;\n]{8,160})/i);
  if (intent) {
    const v = intent[1].trim();
    if (!isLowSignalSector(v)) return v;
  }
  const first = cleaned.split(/[.!?]\s/)[0];
  if (isLowSignalSector(first)) return "";
  return first.length > 200 ? first.slice(0, 200) + "…" : first;
}

function parseActiveSearchesFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ");
  const m =
    t.match(/(\d+\s*(?:[-to]+\s*\d+)?)\s+(?:active\s+)?(?:acquisitions?|deals?|mandates?|searches?)\s+per\s+(?:year|annum|yr)/i) ||
    t.match(/(\d+\s*(?:[-to]+\s*\d+)?)\s+active\s+(?:mandates?|searches?|deals?)/i);
  if (m) return m[0].trim();
  return "";
}

function parseCompetingFromSourcing(currentSourcing?: string): string {
  if (!currentSourcing) return "";
  const s = currentSourcing.trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (["false","true","null","[]","{}","undefined"].includes(lower)) return "";
  return s;
}

/* ─── Main handler ─── */

const FIELDS: { col: string; derive: (l: any) => string }[] = [
  { col: "buyer_type",         derive: (l) => parseFirmTypeFromRole(l.role) || parseFirmTypeFromMessage(l.message) },
  { col: "acq_timeline",       derive: (l) => parseTimelineFromStrategy(l.acquisition_strategy) },
  { col: "active_searches",    derive: (l) => parseActiveSearchesFromText(l.message) },
  { col: "ebitda_min",         derive: (l) => parseEbitdaFromText(l.message).min },
  { col: "ebitda_max",         derive: (l) => parseEbitdaFromText(l.message).max },
  { col: "target_revenue",     derive: (l) => parseRevenueFromText(l.message) },
  { col: "geography",          derive: (l) => parseGeographyFromText(l.message) },
  { col: "target_criteria",    derive: (l) => parseSectorFromText(l.message) },
  { col: "competing_against",  derive: (l) => parseCompetingFromSourcing(l.current_sourcing) },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const brand = body?.brand || "SourceCo";
    const limit = Math.min(Math.max(Number(body?.limit) || 500, 1), 500);

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id,name,role,message,current_sourcing,acquisition_strategy,buyer_type,acq_timeline,active_searches,ebitda_min,ebitda_max,target_revenue,geography,target_criteria,competing_against")
      .eq("brand", brand)
      .is("archived_at", null)
      .limit(limit);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ status: "ok", scanned: 0, promoted: 0, fields_written: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let promoted = 0;
    let fields_written = 0;
    const per_field: Record<string, number> = {};

    for (const lead of leads) {
      const updates: Record<string, string> = {};
      const written: string[] = [];
      for (const f of FIELDS) {
        const current = (lead as any)[f.col];
        if (current && String(current).trim()) continue; // never overwrite manual
        const v = f.derive(lead);
        if (!v || !v.trim()) continue;
        updates[f.col] = v;
        written.push(f.col);
        per_field[f.col] = (per_field[f.col] || 0) + 1;
      }
      if (Object.keys(updates).length === 0) continue;
      const { error: upErr } = await supabase.from("leads").update(updates).eq("id", lead.id);
      if (upErr) {
        console.error(`[bulk-promote-dossier] update failed for ${lead.id}:`, upErr.message);
        continue;
      }
      // Single combined activity entry per lead.
      await supabase.from("lead_activity_log").insert({
        lead_id: lead.id,
        event_type: "field_update",
        description: `Auto-promoted ${written.length} parsed dossier value${written.length === 1 ? "" : "s"}: ${written.join(", ")}`,
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
    console.error("[bulk-promote-dossier]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
