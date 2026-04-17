/**
 * Pure deterministic parsers that extract structured dossier fields out of the
 * raw form-submission payload (role, currentSourcing, message, dealsPlanned,
 * acquisitionStrategy). Used as the *second* tier in the
 *   manual → AI → submission → transcript → ""
 * fallback chain that powers the Buyer Profile / M&A Mandate / Sales Process
 * cards.
 *
 * Every function is sync and returns "" when no confident match — never guess.
 */

/** Normalize the SourceCo form's `role` dropdown into our canonical Firm Type. */
export function parseFirmTypeFromRole(role?: string): string {
  if (!role) return "";
  const r = role.toLowerCase().trim();
  if (!r) return "";
  if (r.includes("family office")) return "Family Office";
  if (r.includes("search fund")) return "Search Fund";
  if (r.includes("independent sponsor")) return "Independent Sponsor";
  if (r.includes("private equity") || r === "pe" || r.includes("pe firm")) return "PE Firm";
  if (r.includes("individual") || r.includes("hnwi") || r.includes("high net worth")) return "HNWI";
  if (r.includes("business owner") || r.includes("strategic") || r.includes("corporate")) {
    return "Strategic / Corporate";
  }
  if (r.includes("holdco") || r.includes("holding")) return "Holdco";
  return "";
}

/** Map the SourceCo `acquisitionStrategy` dropdown to a normalized timeline bucket. */
export function parseTimelineFromStrategy(s?: string): string {
  if (!s) return "";
  const x = s.toLowerCase();
  if (x.includes("under loi") || x.includes("in diligence") || x.includes("closing")) return "0-3 months";
  if (x.includes("actively sourcing") || x.includes("active search") || x.includes("ready to")) {
    return "3-6 months";
  }
  if (x.includes("exploring") || x.includes("evaluating") || x.includes("planning")) return "6-12 months";
  if (x.includes("opportunistic") || x.includes("open to")) return "Opportunistic";
  return "";
}

/** Pull EBITDA min/max as a tuple of strings from free-text. Returns ["",""] if none. */
export function parseEbitdaFromText(text?: string): { min: string; max: string } {
  if (!text) return { min: "", max: "" };
  const t = text.replace(/\s+/g, " ");

  // "EBITDA between $1-5M" / "$1M-$5M EBITDA" / "EBITDA of $2M-$10M"
  const range = t.match(
    /(?:ebitda|sde)[^.\n]{0,40}?\$?\s?([\d.]+)\s?([mk]?)\s?[-–to]+\s?\$?\s?([\d.]+)\s?([mk]?)/i
  );
  if (range) {
    const unit = (u: string) => (u.toLowerCase() === "k" ? "K" : "M");
    const u1 = range[2] ? unit(range[2]) : unit(range[4] || "m");
    const u2 = range[4] ? unit(range[4]) : u1;
    return { min: `$${range[1]}${u1}`, max: `$${range[3]}${u2}` };
  }

  // "Minimum SDE is 750K" / "min EBITDA $1M"
  const minOnly = t.match(/(?:min(?:imum)?|at least)[^.\n]{0,30}?(?:ebitda|sde)?[^.\n]{0,15}?\$?\s?([\d.]+)\s?([mk])/i);
  if (minOnly) {
    return { min: `$${minOnly[1]}${minOnly[2].toUpperCase()}`, max: "" };
  }

  // "<$1M EBITDA" / "less than $5M ebitda"
  const maxOnly = t.match(/(?:<|less than|under|up to)[^.\n]{0,15}?\$?\s?([\d.]+)\s?([mk])[^.\n]{0,15}?(?:ebitda|sde)/i);
  if (maxOnly) {
    return { min: "", max: `$${maxOnly[1]}${maxOnly[2].toUpperCase()}` };
  }

  return { min: "", max: "" };
}

/** Extract a revenue range string like "$10-100M" from the message body. */
export function parseRevenueFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ");
  const range = t.match(/\$?\s?([\d.]+)\s?([mk]?)\s?[-–to]+\s?\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:revenue|sales|topline|top line|arr)/i);
  if (range) {
    const u2 = range[4].toUpperCase();
    const u1 = range[2] ? range[2].toUpperCase() : u2;
    return `$${range[1]}${u1}-${range[3]}${u2}`;
  }
  const single = t.match(/\$?\s?([\d.]+)\s?([mk])\+?\s+(?:in\s+)?(?:revenue|sales|arr)/i);
  if (single) return `$${single[1]}${single[2].toUpperCase()}+`;
  return "";
}

/** Heuristic: find geography phrases — region names, US states, "midwest", etc. */
export function parseGeographyFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ");
  const patterns: RegExp[] = [
    /\b(?:southern|northern|eastern|western|central)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g,
    /\b(?:midwest|midwestern|northeast|southeast|southwest|northwest|west coast|east coast|sun belt|rust belt|new england|tri[- ]?state)\b[^.]*?(?:us|usa|united states|u\.s\.|america)?/gi,
    /\b(?:north|south|east|west)\s+america\b/gi,
    /\b(?:canada|usa|united states|uk|united kingdom|europe|emea|apac|latam|mexico|ontario|quebec|texas|california|florida|new york)\b[^.]{0,40}/gi,
  ];
  const hits = new Set<string>();
  for (const re of patterns) {
    const m = t.match(re);
    if (m) m.forEach(s => hits.add(s.trim().replace(/[,.;].*$/, "")));
  }
  if (!hits.size) return "";
  return Array.from(hits).slice(0, 3).join(", ");
}

/** Use the first sentence of the message as a sector descriptor. */
export function parseSectorFromText(text?: string): string {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  // Look for "looking for / acquiring / target / interested in X"
  const intent = cleaned.match(
    /(?:looking for|seeking|targeting|acquir\w+|interested in|focused on|specialize in|pursue)\s+([^.;\n]{8,160})/i
  );
  if (intent) return intent[1].trim();
  // Fallback to first sentence
  const first = cleaned.split(/[.!?]\s/)[0];
  return first.length > 200 ? first.slice(0, 200) + "…" : first;
}

/** Extract "active searches" / mandate count phrasing. */
export function parseActiveSearchesFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ");
  const m =
    t.match(/(\d+\s*(?:[-–to]+\s*\d+)?)\s+(?:active\s+)?(?:acquisitions?|deals?|mandates?|searches?)\s+per\s+(?:year|annum|yr)/i) ||
    t.match(/(\d+\s*(?:[-–to]+\s*\d+)?)\s+active\s+(?:mandates?|searches?|deals?)/i);
  if (m) return m[0].trim();
  return "";
}

/** Concatenate `currentSourcing` clauses for the "Competing against" field. */
export function parseCompetingFromSourcing(currentSourcing?: string): string {
  if (!currentSourcing) return "";
  const s = currentSourcing.trim();
  if (!s) return "";
  return s;
}
