const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "live.com", "msn.com",
]);

/** Extract a usable domain from a lead's companyUrl or email */
export function getCompanyDomain(companyUrl?: string, email?: string): string | null {
  if (companyUrl) {
    try {
      const url = companyUrl.startsWith("http") ? companyUrl : `https://${companyUrl}`;
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch { /* ignore */ }
  }
  if (email) {
    const parts = email.split("@");
    if (parts.length === 2) {
      const domain = parts[1].toLowerCase();
      if (!GENERIC_DOMAINS.has(domain)) return domain;
    }
  }
  return null;
}

/** Get a Google favicon URL for a domain */
export function getCompanyLogoUrl(companyUrl?: string, email?: string): string | null {
  const domain = getCompanyDomain(companyUrl, email);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}
