// Round 9 — same-firm-different-person detector.
//
// The original prompt's missing case: emails from a known firm domain whose
// sender is NOT a recorded contact for that firm's deal. These aren't noise
// (a real human typed them), aren't a stakeholder (we'd already have linked),
// and aren't unknown (we know the firm). They get their own sentinel
// `firm_unrelated` so reps can see "8 messages from {firm} (unrelated
// colleagues)" in the deal-room and one-click promote when they recognize
// someone.
//
// Public free-mail providers are excluded — gmail.com / outlook.com / etc.
// are not "firm domains" and would create false positives.

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "protonmail.com", "proton.me", "pm.me",
  "gmx.com", "gmx.de", "yandex.com", "yandex.ru",
  "mail.com", "zoho.com", "fastmail.com", "tutanota.com",
  "qq.com", "163.com", "126.com", "sina.com",
]);

export interface FirmUnrelatedMatch {
  matched: boolean;
  firm_domain: string;
  firm_lead_id: string;
}

/**
 * Detect whether the sender belongs to a known firm domain but is not a
 * recognized contact for that firm's deal.
 *
 * @param fromAddress lowercased sender email
 * @param knownContacts Set of every email already attached to ANY active lead
 *                     (primary email, secondary contacts, stakeholders).
 *                     This is the gate against double-attribution.
 * @param firmDomainToLead map of "acme.com" -> "ABC123" (the lead.id whose
 *                        primary email is on that domain). Built once per
 *                        invocation by the caller.
 */
export function detectFirmUnrelated(
  fromAddress: string,
  knownContacts: Set<string>,
  firmDomainToLead: Map<string, string>,
): FirmUnrelatedMatch {
  const empty: FirmUnrelatedMatch = { matched: false, firm_domain: "", firm_lead_id: "" };
  const e = (fromAddress || "").toLowerCase().trim();
  if (!e.includes("@")) return empty;
  const domain = e.split("@")[1] || "";
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) return empty;
  // Already a known contact? Not a firm-unrelated case.
  if (knownContacts.has(e)) return empty;
  const ownerLeadId = firmDomainToLead.get(domain);
  if (!ownerLeadId) return empty;
  return { matched: true, firm_domain: domain, firm_lead_id: ownerLeadId };
}
