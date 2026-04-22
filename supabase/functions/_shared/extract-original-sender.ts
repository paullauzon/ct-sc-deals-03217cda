// Shared helper — when an inbound email is a forward (subject begins with
// Fwd:/Fw:) the matcher should attribute by the ORIGINAL sender, not by the
// person who forwarded it. Otherwise the lead gets stapled to the forwarder
// (typically a teammate) and we silently lose the real attribution.
//
// Strategy: scan body_text for the first "From: …" header block that follows
// the forwarded marker. Email clients are inconsistent (Gmail uses "---------- 
// Forwarded message ---------", Outlook uses "From: …", Apple Mail uses
// "Begin forwarded message:"). The single regex below catches all three.
//
// Returns null when the email isn't a forward or no original-sender header is
// recoverable. Callers must NEVER fall back to the forwarder when null —
// leaving the email unmatched is correct.

export interface OriginalSender {
  email: string;
  name: string;
}

const FORWARD_SUBJECT_RE = /^\s*(fwd?|tr|wg|rv|enc):\s*/i;

// Matches: From: Some Name <name@host.tld>     OR     From: name@host.tld
const FROM_HEADER_RE = /^\s*From:\s*(?:([^<\n\r]+?)\s*)?<?([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})>?\s*$/im;

export function isForwardedSubject(subject: string | null | undefined): boolean {
  if (!subject) return false;
  return FORWARD_SUBJECT_RE.test(subject);
}

export function extractOriginalSender(
  subject: string | null | undefined,
  bodyText: string | null | undefined,
): OriginalSender | null {
  if (!isForwardedSubject(subject)) return null;
  if (!bodyText) return null;

  // Find the forwarded marker first so we don't accidentally pick up the
  // current sender's signature line as "From: …".
  const lower = bodyText.toLowerCase();
  let scanStart = 0;
  const markers = [
    "---------- forwarded message",
    "begin forwarded message",
    "-----original message-----",
    "from:", // last-resort: gmail mobile sometimes drops the marker
  ];
  for (const m of markers) {
    const idx = lower.indexOf(m);
    if (idx >= 0) { scanStart = idx; break; }
  }

  const slice = bodyText.slice(scanStart, scanStart + 4000); // bound work
  const match = slice.match(FROM_HEADER_RE);
  if (!match) return null;

  const name = (match[1] || "").trim().replace(/^["']|["']$/g, "");
  const email = (match[2] || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return { email, name };
}
