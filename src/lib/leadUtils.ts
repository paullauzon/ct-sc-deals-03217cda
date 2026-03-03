import { Lead } from "@/types/lead";

/** Compute days in current stage dynamically from stageEnteredDate */
export function computeDaysInStage(stageEnteredDate: string): number {
  if (!stageEnteredDate) return 0;
  const entered = new Date(stageEnteredDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - entered) / (1000 * 60 * 60 * 24)));
}

/** Extract a normalized company domain from a URL or email */
function extractDomain(url?: string, email?: string): string | null {
  if (url) {
    try {
      const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
      return hostname.replace(/^www\./, "").toLowerCase();
    } catch { /* ignore */ }
  }
  if (email) {
    const parts = email.split("@");
    if (parts.length === 2) {
      const domain = parts[1].toLowerCase();
      // Skip generic email providers
      const generic = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "protonmail.com"];
      if (!generic.includes(domain)) return domain;
    }
  }
  return null;
}

/** Find all other leads from the same company */
export function getCompanyAssociates(lead: Lead, allLeads: Lead[]): Lead[] {
  const domain = extractDomain(lead.companyUrl, lead.email);
  const companyNorm = lead.company?.trim().toLowerCase();

  return allLeads.filter((other) => {
    if (other.id === lead.id) return false;

    // Match by domain first
    if (domain) {
      const otherDomain = extractDomain(other.companyUrl, other.email);
      if (otherDomain === domain) return true;
    }

    // Fallback: exact company name match (case-insensitive)
    if (companyNorm && companyNorm.length > 1) {
      const otherCompany = other.company?.trim().toLowerCase();
      if (otherCompany === companyNorm) return true;
    }

    return false;
  });
}

/** Get the top shared intelligence insight from a set of leads */
export function getSharedIntelligence(associates: Lead[]): { painPoints: string[]; objections: string[]; totalMeetings: number } {
  const painPoints = new Set<string>();
  const objections = new Set<string>();
  let totalMeetings = 0;

  for (const lead of associates) {
    totalMeetings += (lead.meetings?.length || 0);
    for (const m of lead.meetings || []) {
      if (!m.intelligence) continue;
      m.intelligence.painPoints?.forEach(p => painPoints.add(p));
      m.intelligence.dealSignals?.objections?.forEach(o => objections.add(o));
    }
  }

  return {
    painPoints: [...painPoints].slice(0, 3),
    objections: [...objections].slice(0, 3),
    totalMeetings,
  };
}
