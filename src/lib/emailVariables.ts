// Phase 4 — variable resolver for compose v2.
// Variables are written as [first_name], [firm], etc. in subject/body.
// Resolution happens client-side at send time. Missing values block sending.

import { Lead } from "@/types/lead";

export interface VariableMap {
  [key: string]: string;
}

/** Build the canonical variable map from a Lead and the sender's name. */
export function buildVariableMap(lead: Lead, senderName: string): VariableMap {
  const first = (lead.name || "").trim().split(/\s+/)[0] || "";
  const ebitdaMin = (lead as any).ebitdaMin as string | undefined;
  const ebitdaMax = (lead as any).ebitdaMax as string | undefined;
  const ebitda = ebitdaMin || ebitdaMax ? `${ebitdaMin || "?"}–${ebitdaMax || "?"}` : "";
  return {
    first_name: first,
    name: lead.name || "",
    firm: lead.company || "",
    company: lead.company || "",
    role: lead.role || "",
    stage: lead.stage || "",
    service: lead.serviceInterest || "",
    geography: (lead as any).geography || "",
    target_revenue: (lead as any).targetRevenue || "",
    ebitda,
    deal_value: lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "",
    next_step: (lead as any).nextMutualStep || "",
    sender_name: senderName || "",
  };
}

/** Find every [token] reference in the text. Case-insensitive, dedup'd, lowercased. */
export function extractVariables(text: string): string[] {
  const out = new Set<string>();
  const re = /\[([a-z_]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1].toLowerCase());
  return Array.from(out);
}

/** Replace [token] references with their resolved value. Unresolved tokens are left in place. */
export function resolveVariables(text: string, vars: VariableMap): string {
  return text.replace(/\[([a-z_]+)\]/gi, (match, key) => {
    const v = vars[key.toLowerCase()];
    return v && v.trim() ? v : match;
  });
}

/** Given resolved/unresolved text, return which referenced variables are still missing a value. */
export function missingVariables(text: string, vars: VariableMap): string[] {
  return extractVariables(text).filter(k => !vars[k] || !vars[k].trim());
}

/** Pretty label for a variable key (for chip display). */
export function variableLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
