// Shared classifier for noise classes that should NEVER pollute the unmatched
// queue. Detection runs at insert time inside the sync functions. The matcher
// also calls it during back-passes so historical messages get re-routed.
//
// Three classes:
//   - "auto_reply"   → out-of-office / vacation responders
//   - "role_based"   → info@, sales@, no-reply@, etc. with no thread continuity
//   - "calendar"     → calendar invites/RSVPs from Google/Outlook
//
// Each maps to a sentinel lead_id ('auto_reply', 'role_based',
// 'firm_activity'). Callers handle storage; this file only decides the class.

export type EmailClass = null | "auto_reply" | "role_based" | "calendar";

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
]);

export function classifyEmail(args: {
  fromAddress: string | null | undefined;
  subject: string | null | undefined;
  bodyPreview?: string | null;
}): EmailClass {
  const from = (args.fromAddress || "").toLowerCase().trim();
  const subject = (args.subject || "").trim();
  const local = from.includes("@") ? from.split("@")[0] : "";

  // Calendar invites — Google/Outlook formatted RSVPs and invitations.
  if (CALENDAR_SUBJECT_RE.test(subject)) return "calendar";
  if (CALENDAR_FROM_RE.test(from)) return "calendar";

  // Auto-replies — match on subject heuristics. Also check body if subject
  // looks like a normal "Re:" reply but body shouts vacation.
  if (AUTO_REPLY_HEADER_RE.test(subject)) return "auto_reply";
  if (AUTO_REPLY_SUBJECT_RE.test(subject)) return "auto_reply";
  const previewSlice = (args.bodyPreview || "").slice(0, 400);
  if (previewSlice && AUTO_REPLY_SUBJECT_RE.test(previewSlice)) return "auto_reply";

  // Role-based — strict local-part match. Does NOT include personal-style
  // names like "john.smith" or numeric prefixes.
  if (local && ROLE_BASED_LOCALS.has(local)) return "role_based";
  if (/^(noreply|no-reply|donotreply|notifications?|alerts?|bounce)/i.test(local)) return "role_based";

  return null;
}

// Helper for sync functions — returns the sentinel lead_id to use for a class,
// or null if the email should follow the normal matcher path.
export function sentinelForClass(cls: EmailClass): string | null {
  if (cls === "auto_reply") return "auto_reply";
  if (cls === "role_based") return "role_based";
  if (cls === "calendar") return "firm_activity"; // calendar invites become firm activity
  return null;
}
