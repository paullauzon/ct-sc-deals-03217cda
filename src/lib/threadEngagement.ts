/**
 * Thread-level engagement aggregation utilities.
 * Pure functions over the LeadEmail shape used in EmailsSection.
 */

interface MinimalEmail {
  id: string;
  direction: "inbound" | "outbound";
  from_address?: string;
  from_name?: string;
  email_date: string;
  opens?: Array<{ at?: string; url?: string }> | number;
  clicks?: Array<{ at?: string; url?: string }> | number;
  replied_at?: string | null;
}

export interface ThreadEngagement {
  opens: number;
  clicks: number;
  replies: number;
  /** Distinct top-level reply contributors keyed by email address */
  uniqueRepliers: { name: string; count: number }[];
  /** Recent open count in trailing 48h */
  recentOpens48h: number;
  /** Recent click count in trailing 48h */
  recentClicks48h: number;
  /** Click URL hot-list (top 3 by frequency) */
  topClickedLinks: { label: string; count: number }[];
  /** Last engagement timestamp (most recent open OR click) */
  lastEngagementAt: string | null;
  /** True when activity meets "hot" criteria (>=3 opens in 48h OR fresh click + no reply) */
  isHot: boolean;
  hotReason?: string;
}

function lenArr<T>(v: T[] | number | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function shortLink(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").filter(Boolean)[0] || u.hostname;
    return path.replace(/[-_]/g, " ").slice(0, 18) || u.hostname;
  } catch {
    return url.slice(0, 18);
  }
}

export function computeThreadEngagement(emails: MinimalEmail[]): ThreadEngagement {
  const now = Date.now();
  const TWO_DAYS = 48 * 3600 * 1000;

  let opens = 0;
  let clicks = 0;
  let recentOpens48h = 0;
  let recentClicks48h = 0;
  let lastEngagementAt: number = 0;
  const linkCounts = new Map<string, number>();

  for (const e of emails) {
    const opensArr = lenArr<{ at?: string }>(e.opens);
    const clicksArr = lenArr<{ at?: string; url?: string }>(e.clicks);
    opens += opensArr.length;
    clicks += clicksArr.length;
    for (const o of opensArr) {
      if (!o.at) continue;
      const t = new Date(o.at).getTime();
      if (now - t < TWO_DAYS) recentOpens48h += 1;
      if (t > lastEngagementAt) lastEngagementAt = t;
    }
    for (const c of clicksArr) {
      if (c.at) {
        const t = new Date(c.at).getTime();
        if (now - t < TWO_DAYS) recentClicks48h += 1;
        if (t > lastEngagementAt) lastEngagementAt = t;
      }
      if (c.url) {
        const key = shortLink(c.url);
        linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
      }
    }
  }

  const replies = emails.filter(e => e.direction === "inbound").length;
  const replierMap = new Map<string, { name: string; count: number }>();
  for (const e of emails) {
    if (e.direction !== "inbound") continue;
    const key = (e.from_address || "").toLowerCase();
    if (!key) continue;
    const display = e.from_name?.split(" ")[0] || (e.from_address?.split("@")[0] ?? "Lead");
    const cur = replierMap.get(key);
    replierMap.set(key, cur ? { name: cur.name, count: cur.count + 1 } : { name: display, count: 1 });
  }
  const uniqueRepliers = Array.from(replierMap.values()).sort((a, b) => b.count - a.count);

  const lastInbound = emails
    .filter(e => e.direction === "inbound")
    .sort((a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime())[0];
  const lastOutbound = emails
    .filter(e => e.direction === "outbound")
    .sort((a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime())[0];
  const noReplyAfterLatestOutbound = lastOutbound && (!lastInbound || new Date(lastOutbound.email_date) > new Date(lastInbound.email_date));

  let isHot = false;
  let hotReason: string | undefined;
  if (recentOpens48h >= 3 && noReplyAfterLatestOutbound) {
    isHot = true;
    hotReason = `${recentOpens48h} opens in 48h`;
  } else if (recentClicks48h >= 1 && noReplyAfterLatestOutbound) {
    isHot = true;
    hotReason = `Clicked ${recentClicks48h === 1 ? "a link" : `${recentClicks48h} links`} recently`;
  } else if (recentOpens48h >= 5) {
    isHot = true;
    hotReason = `${recentOpens48h} opens in 48h`;
  }

  const topClickedLinks = Array.from(linkCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    opens,
    clicks,
    replies,
    uniqueRepliers,
    recentOpens48h,
    recentClicks48h,
    topClickedLinks,
    lastEngagementAt: lastEngagementAt > 0 ? new Date(lastEngagementAt).toISOString() : null,
    isHot,
    hotReason,
  };
}
