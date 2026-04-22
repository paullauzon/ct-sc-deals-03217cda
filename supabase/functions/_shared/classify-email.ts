// Shared classifier for noise classes that should NEVER pollute the unmatched
// queue. Detection runs at insert time inside the sync functions. The matcher
// also calls it during back-passes so historical messages get re-routed.
//
// Three classes:
//   - "auto_reply"   → out-of-office / vacation responders
//   - "role_based"   → info@, sales@, no-reply@, marketing senders, bulk mail
//   - "calendar"     → calendar invites/RSVPs from Google/Outlook
//
// Round 7 — expanded coverage:
//   - Marketing subdomains (*.news.*, *.marketing.*, newsletter.*, etc.)
//   - Marketing-prefix locals (announcements@, insights@, marketingops@, ...)
//   - List-Unsubscribe header presence (RFC 2369 — most reliable bulk signal)
//   - Caller can pass an optional `precomputedReason` when the sender was
//     previously memoized in `auto_classified_noise_senders`.

export type EmailClass = null | "auto_reply" | "role_based" | "calendar";

export interface ClassificationResult {
  class: EmailClass;
  reason: string; // machine-readable: "noise:role_based_local", etc.
}

const AUTO_REPLY_SUBJECT_RE = /(out\s*of\s*office|automatic\s*reply|auto[\s\-]?reply|on\s*vacation|out\s*of\s*the\s*office|currently\s*away|i'?m\s*away|away\s*from\s*the\s*office|leaving\s*the\s*office)/i;
const AUTO_REPLY_HEADER_RE = /^(re:\s*)?(out\s*of\s*office|away|vacation|automatic|auto[\s\-]?reply)/i;

const CALENDAR_SUBJECT_RE = /^(invitation:|invite:|accepted:|declined:|tentative:|cancelled:|updated invitation:)/i;
const CALENDAR_FROM_RE = /^(calendar-notification|calendar|noreply-calendar|calendar-server)@/i;

const ROLE_BASED_LOCALS = new Set([
  "info", "hello", "hi", "sales", "support", "help", "noreply", "no-reply",
  "donotreply", "do-not-reply", "admin", "contact", "team", "marketing",
  "hr", "billing", "accounts", "notifications", "notification", "alerts",
  "alert", "newsletter", "news", "updates", "office", "reception",
  "events", "membership", "feedback", "press", "media", "careers", "jobs",
  "postmaster", "mailer-daemon", "bounce", "bounces",
  // Round 7 additions — common marketing-prefix locals
  "announcements", "announcement", "insights", "customerservice",
  "marketingops", "webinar", "webinars", "digest", "subscriptions",
  "subscribe", "unsubscribe", "broadcast", "campaign", "campaigns",
  "communications", "comms", "promo", "promotions", "offers",
]);

// Marketing-subdomain regex — newsletters love these patterns
const MARKETING_SUBDOMAIN_RE = /(^|\.)(news|newsletter|newsletters|marketing|email|mail|mailer|broadcast|campaigns?|notify|notifications)\./i;

// Marketing-prefix wildcard locals (e.g. `update1@`, `digest_weekly@`)
const MARKETING_PREFIX_RE = /^(update|digest|news|notif|alert|marketing|promo|campaign)\d*[._-]?/i;

export function classifyEmail(args: {
  fromAddress: string | null | undefined;
  subject: string | null | undefined;
  bodyPreview?: string | null;
  hasListUnsubscribeHeader?: boolean;
  precomputedReason?: string | null;
}): ClassificationResult {
  if (args.precomputedReason) {
    return { class: "role_based", reason: args.precomputedReason };
  }

  const from = (args.fromAddress || "").toLowerCase().trim();
  const subject = (args.subject || "").trim();
  const local = from.includes("@") ? from.split("@")[0] : "";
  const domain = from.includes("@") ? from.split("@")[1] || "" : "";

  // Calendar invites — Google/Outlook formatted RSVPs and invitations.
  if (CALENDAR_SUBJECT_RE.test(subject)) return { class: "calendar", reason: "calendar:subject" };
  if (CALENDAR_FROM_RE.test(from)) return { class: "calendar", reason: "calendar:sender" };

  // Auto-replies — match on subject heuristics. Also check body if subject
  // looks like a normal "Re:" reply but body shouts vacation.
  if (AUTO_REPLY_HEADER_RE.test(subject)) return { class: "auto_reply", reason: "auto_reply:subject_header" };
  if (AUTO_REPLY_SUBJECT_RE.test(subject)) return { class: "auto_reply", reason: "auto_reply:subject_keyword" };
  const previewSlice = (args.bodyPreview || "").slice(0, 400);
  if (previewSlice && AUTO_REPLY_SUBJECT_RE.test(previewSlice)) return { class: "auto_reply", reason: "auto_reply:body_keyword" };

  // List-Unsubscribe header — RFC 2369. Bulk mail by definition.
  if (args.hasListUnsubscribeHeader) return { class: "role_based", reason: "noise:list_unsubscribe_header" };

  // Role-based — strict local-part match. Does NOT include personal-style
  // names like "john.smith" or numeric prefixes.
  if (local && ROLE_BASED_LOCALS.has(local)) return { class: "role_based", reason: "noise:role_based_local" };
  if (/^(noreply|no-reply|donotreply|notifications?|alerts?|bounce)/i.test(local)) {
    return { class: "role_based", reason: "noise:noreply_prefix" };
  }
  if (MARKETING_PREFIX_RE.test(local)) return { class: "role_based", reason: "noise:marketing_prefix" };

  // Marketing subdomains — e.g. "announcements@news.mcguirewoods.net"
  if (domain && MARKETING_SUBDOMAIN_RE.test(domain)) {
    return { class: "role_based", reason: "noise:marketing_subdomain" };
  }

  return { class: null, reason: "" };
}

// Helper for sync functions — returns the sentinel lead_id to use for a class,
// or null if the email should follow the normal matcher path.
export function sentinelForClass(cls: EmailClass): string | null {
  if (cls === "auto_reply") return "auto_reply";
  if (cls === "role_based") return "role_based";
  if (cls === "calendar") return "firm_activity"; // calendar invites become firm activity
  return null;
}

// Detect List-Unsubscribe header from raw provider payload. Both Gmail and
// Outlook give us a `headers` object/array; we accept either shape.
export function hasListUnsubscribeHeader(rawPayload: any): boolean {
  if (!rawPayload) return false;
  // Gmail format — payload.headers is array of {name, value}
  const gmHeaders = rawPayload?.payload?.headers;
  if (Array.isArray(gmHeaders)) {
    for (const h of gmHeaders) {
      const n = (h?.name || "").toLowerCase();
      if (n === "list-unsubscribe" || n === "list-unsubscribe-post") return true;
    }
  }
  // Outlook format — internetMessageHeaders is array of {name, value}
  const olHeaders = rawPayload?.internetMessageHeaders;
  if (Array.isArray(olHeaders)) {
    for (const h of olHeaders) {
      const n = (h?.name || "").toLowerCase();
      if (n === "list-unsubscribe" || n === "list-unsubscribe-post") return true;
    }
  }
  // Generic — top-level headers object
  if (rawPayload?.headers && typeof rawPayload.headers === "object") {
    for (const k of Object.keys(rawPayload.headers)) {
      const lk = k.toLowerCase();
      if (lk === "list-unsubscribe" || lk === "list-unsubscribe-post") return true;
    }
  }
  return false;
}
