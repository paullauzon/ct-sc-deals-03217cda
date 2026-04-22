// Round 7 — internal team domains. Inbound emails from these domains aren't
// "leads" — they're reps replying on threads or sending status updates.
// Used by sync functions and rematch to avoid parking these in unmatched.
export const INTERNAL_DOMAINS = new Set([
  "captarget.com",
  "sourcecodeals.com",
]);

export function isInternalSender(email: string | null | undefined): boolean {
  const e = (email || "").toLowerCase().trim();
  if (!e.includes("@")) return false;
  const domain = e.split("@")[1] || "";
  return INTERNAL_DOMAINS.has(domain);
}
