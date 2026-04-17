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

/** Fallback for `role = "Other"` — scan the message for firm-type keywords. */
export function parseFirmTypeFromMessage(text?: string): string {
  if (!text) return "";
  const t = text.toLowerCase();
  if (/\bfamily office\b/.test(t)) return "Family Office";
  if (/\bsearch fund(er)?\b/.test(t)) return "Search Fund";
  if (/\bindependent sponsor\b/.test(t)) return "Independent Sponsor";
  if (/\b(private equity|pe firm|pe fund|p\.e\.)\b/.test(t)) return "PE Firm";
  if (/\b(hnwi|high net worth|individual investor)\b/.test(t)) return "HNWI";
  if (/\b(holdco|holding co|holding company)\b/.test(t)) return "Holdco";
  if (/\b(strategic acquirer|corp dev|corporate development|portco|portfolio company)\b/.test(t)) {
    return "Strategic / Corporate";
  }
  return "";
}

/** Map the SourceCo `acquisitionStrategy` dropdown to a normalized timeline bucket. */
export function parseTimelineFromStrategy(s?: string): string {
  if (!s) return "";
  // Normalize curly apostrophes/dashes that come from the Webflow form.
  const x = s
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2013\u2014]/g, "-");
  if (x.includes("under loi") || x.includes("in diligence") || x.includes("closing")) return "0-3 months";
  if (x.includes("mid-process") || x.includes("mid process") || x.includes("in process") || /\b1[- ]?2 deals?\b/.test(x)) {
    return "0-3 months";
  }
  if (x.includes("actively sourcing") || x.includes("active search") || x.includes("ready to")) {
    return "3-6 months";
  }
  if (x.includes("exploring") || x.includes("evaluating") || x.includes("planning") || x.includes("thesis-building") || x.includes("thesis building")) {
    return "6-12 months";
  }
  if (x.includes("opportunistic") || x.includes("open to")) return "Opportunistic";
  return "";
}

/** Pull EBITDA min/max as a tuple of strings from free-text. Returns ["",""] if none. */
export function parseEbitdaFromText(text?: string): { min: string; max: string } {
  if (!text) return { min: "", max: "" };
  // Normalize curly dashes AND collapse whitespace — Webflow turns "$1-5M" into "$1–5M",
  // and prospects often write "750 K" with a stray space before the unit.
  const t = text
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ");

  // "EBITDA between $1M and $5M" / "EBITDA between 1 and 5 million"
  const between = t.match(
    /(?:ebitda|sde)[^.\n]{0,40}?between\s+\$?\s?([\d.]+)\s?([mk]?)\s+(?:and|to)\s+\$?\s?([\d.]+)\s?([mk]?)/i
  );
  if (between) {
    const unit = (u: string) => (u.toLowerCase() === "k" ? "K" : "M");
    const u1 = between[2] ? unit(between[2]) : unit(between[4] || "m");
    const u2 = between[4] ? unit(between[4]) : u1;
    return { min: `$${between[1]}${u1}`, max: `$${between[3]}${u2}` };
  }

  // "EBITDA between $1-5M" / "$1M-$5M EBITDA" / "EBITDA of $2M-$10M"
  const range = t.match(
    /(?:ebitda|sde)[^.\n]{0,40}?\$?\s?([\d.]+)\s?([mk]?)\s?[-to]+\s?\$?\s?([\d.]+)\s?([mk]?)/i
  );
  if (range) {
    const unit = (u: string) => (u.toLowerCase() === "k" ? "K" : "M");
    const u1 = range[2] ? unit(range[2]) : unit(range[4] || "m");
    const u2 = range[4] ? unit(range[4]) : u1;
    return { min: `$${range[1]}${u1}`, max: `$${range[3]}${u2}` };
  }

  // Reverse order: "$1-5M EBITDA"
  const rangeRev = t.match(
    /\$?\s?([\d.]+)\s?([mk]?)\s?[-to]+\s?\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:ebitda|sde)/i
  );
  if (rangeRev) {
    const u2 = rangeRev[4].toUpperCase();
    const u1 = rangeRev[2] ? rangeRev[2].toUpperCase() : u2;
    return { min: `$${rangeRev[1]}${u1}`, max: `$${rangeRev[3]}${u2}` };
  }

  // "$1M+ EBITDA" / "$500K+ in EBITDA" — open-ended minimum
  const plusEbitda = t.match(/\$?\s?([\d.]+)\s?([mk])\s?\+\s+(?:in\s+)?(?:ebitda|sde)/i);
  if (plusEbitda) {
    return { min: `$${plusEbitda[1]}${plusEbitda[2].toUpperCase()}`, max: "" };
  }

  // "Minimum SDE is 750K" / "Minimum SDE is 750 K" / "min EBITDA $1M" / "750 k minimum EBITDA"
  const minOnly =
    t.match(/(?:min(?:imum)?|at least)[^.\n]{0,30}?(?:ebitda|sde)?[^.\n]{0,15}?\$?\s?([\d.]+)\s?([mk])/i) ||
    t.match(/\$?\s?([\d.]+)\s?([mk])\s+(?:min(?:imum)?|or more)\s+(?:in\s+)?(?:ebitda|sde)/i);
  if (minOnly) {
    return { min: `$${minOnly[1]}${minOnly[2].toUpperCase()}`, max: "" };
  }
  // "EBITDA/SDE of $X" — single anchor
  const sdeOf = t.match(/(?:ebitda|sde)\s+(?:of|is|at|around|approximately)\s+\$?\s?([\d.]+)\s?([mk])/i);
  if (sdeOf) {
    return { min: `$${sdeOf[1]}${sdeOf[2].toUpperCase()}`, max: "" };
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
  const t = text.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ");
  // "$10M-$100M in revenue"
  const range = t.match(/\$?\s?([\d.]+)\s?([mk]?)\s?[-to]+\s?\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:revenue|sales|topline|top line|arr)/i);
  if (range) {
    const u2 = range[4].toUpperCase();
    const u1 = range[2] ? range[2].toUpperCase() : u2;
    return `$${range[1]}${u1}-${range[3]}${u2}`;
  }
  // "between $5M and $25M revenue"
  const between = t.match(/between\s+\$?\s?([\d.]+)\s?([mk]?)\s+(?:and|to)\s+\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:revenue|sales|arr|topline)/i);
  if (between) {
    const u2 = between[4].toUpperCase();
    const u1 = between[2] ? between[2].toUpperCase() : u2;
    return `$${between[1]}${u1}-${between[3]}${u2}`;
  }
  // "ARR of $5M" / "Revenue of $10M"
  const arrOf = t.match(/(?:revenue|sales|arr|topline)\s+(?:of|is|at|around|approximately)\s+\$?\s?([\d.]+)\s?([mk])/i);
  if (arrOf) return `$${arrOf[1]}${arrOf[2].toUpperCase()}+`;
  // "$1M+ in revenue", "$5M+ ARR", "$5M+ revenue"
  const plusRev = t.match(/\$?\s?([\d.]+)\s?([mk])\s?\+\s+(?:in\s+)?(?:revenue|sales|arr|profit|cashflow|cash flow|topline)/i);
  if (plusRev) return `$${plusRev[1]}${plusRev[2].toUpperCase()}+`;
  const single = t.match(/\$?\s?([\d.]+)\s?([mk])\+?\s+(?:in\s+)?(?:revenue|sales|arr|profit|cashflow|cash flow)/i);
  if (single) return `$${single[1]}${single[2].toUpperCase()}+`;
  // "doing at least 500k in yearly profit"
  const yearly = t.match(/(?:doing|generating|producing)\s+(?:at least|around|approximately)?\s*\$?\s?([\d.]+)\s?([mk])/i);
  if (yearly) return `$${yearly[1]}${yearly[2].toUpperCase()}+`;
  return "";
}

/** Heuristic: find geography phrases — region names, US states, "midwest", etc. */
export function parseGeographyFromText(text?: string): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ");

  // Anchored patterns: "based in X", "HQ in X", "located in X", "focused on X" (X = up to 8 word region phrase)
  const anchored: string[] = [];
  const anchorRe = /(?:based in|hq in|headquartered in|located in|focused on|operating in|targeting|target geography:?)\s+(?:the\s+)?([A-Z][\w&.\- ]{2,60}?)(?=[.,;\n]|$| with| and| but| where| our| we)/gi;
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(t))) {
    const cleaned = am[1]
      .trim()
      .replace(/\s+(US|U\.S\.|USA|United States)$/i, ", US")
      .replace(/^the\s+/i, "");
    if (cleaned && cleaned.length < 80) anchored.push(cleaned);
  }

  const patterns: RegExp[] = [
    /\b(?:southern|northern|eastern|western|central)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g,
    /\b(?:midwest|midwestern|northeast|southeast|southwest|northwest|west coast|east coast|sun belt|rust belt|new england|tri[- ]?state|pacific northwest|mid[- ]?atlantic)\b/gi,
    /\b(?:north|south|east|west)\s+america\b/gi,
    /\b(?:canada|usa|united states|uk|united kingdom|europe|emea|apac|latam|mexico|ontario|quebec|alberta|british columbia|texas|california|florida|new york|illinois|ohio|michigan|pennsylvania|georgia|north carolina|south carolina|virginia|tennessee|arizona|colorado|washington|oregon|massachusetts|new jersey|oklahoma|louisiana|kansas|missouri|indiana|wisconsin|minnesota|iowa|nebraska|arkansas|alabama|kentucky|maryland|connecticut|nevada|utah|new mexico)\b/gi,
  ];
  const hits = new Set<string>();
  // Anchored hits first (preserve their phrasing).
  for (const a of anchored) {
    const norm = a.replace(/\bus\b/i, "US").replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(Of|And|The|In)\b/g, m => m.toLowerCase());
    hits.add(norm);
  }
  for (const re of patterns) {
    const m = t.match(re);
    if (m) m.forEach(s => {
      const norm = s.trim().replace(/[,.;:].*$/, "").toLowerCase();
      // Special-case "midwestern us" → "Midwest, US"
      if (/^midwestern\s+us$/i.test(norm)) { hits.add("Midwest, US"); return; }
      if (/^midwestern$/i.test(norm)) { hits.add("Midwest"); return; }
      const titled = norm.replace(/\b\w/g, c => c.toUpperCase()).replace(/\bUs\b/g, "US").replace(/\bUk\b/g, "UK");
      hits.add(titled);
    });
  }
  if (!hits.size) return "";
  // Cap to 4 unique tokens.
  return Array.from(hits).slice(0, 4).join(", ");
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
  const t = text.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ");
  const m =
    t.match(/(\d+\s*(?:[-to]+\s*\d+)?)\s+(?:active\s+)?(?:acquisitions?|deals?|mandates?|searches?)\s+per\s+(?:year|annum|yr)/i) ||
    t.match(/(\d+\s*(?:[-to]+\s*\d+)?)\s+active\s+(?:mandates?|searches?|deals?)/i) ||
    t.match(/(?:buy|acquire)\s+at least\s+(\d+\s*(?:[-to]+\s*\d+)?)\s+\w+\s+(?:companies|businesses)\s+(?:per\s+year|yearly|annually)/i);
  if (m) return m[0].trim();
  return "";
}

/**
 * Concatenate `currentSourcing` clauses for the "Competing against" field.
 * Returns "" for boolean-y values that Zapier sometimes sends when the form
 * field was unanswered (raw `false`, `true`, `[]`, `null`).
 */
export function parseCompetingFromSourcing(currentSourcing?: string): string {
  if (!currentSourcing) return "";
  const s = currentSourcing.trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower === "false" || lower === "true" || lower === "null" || lower === "[]" || lower === "{}" || lower === "undefined") {
    return "";
  }
  return s;
}
