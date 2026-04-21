// Fuzzy-match Calendly events to leads that have a meeting_date but no
// calendly_booked_at. Strategy: scan Malik's Calendly history, fetch invitees,
// then for each unlinked lead score candidates by:
//   - exact name match (40 pts)
//   - last-name match (20 pts)
//   - company token match (20 pts)
//   - date proximity ≤ 24h (30 pts) / ≤ 72h (15 pts) / ≤ 7d (5 pts)
// Threshold: ≥ 50 pts to stamp.
//
// Auth: dual mode — INGEST_API_KEY OR Supabase Bearer token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const WALL_TIME_BUDGET_MS = 100_000;

interface CalEvent {
  uri: string;
  name: string;
  start_time: string;
  end_time: string;
  status: string;
  invitees: Array<{ name: string; email: string }>;
}

function norm(s: string): string {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

function lastName(s: string): string {
  const parts = norm(s).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function companyTokens(s: string): string[] {
  const stop = new Set(["llc", "inc", "co", "corp", "group", "capital", "partners", "the", "and", "of", "ltd", "holdings", "investments", "investment"]);
  return norm(s).split(" ").filter((t) => t.length > 2 && !stop.has(t));
}

function scoreMatch(
  lead: { name: string; company: string; meeting_date: string },
  inv: { name: string; email: string },
  eventStart: string,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const ln = norm(lead.name);
  const inn = norm(inv.name);
  if (ln && inn && ln === inn) {
    score += 40;
    reasons.push("name_exact");
  } else if (lastName(lead.name) && lastName(lead.name) === lastName(inv.name)) {
    score += 20;
    reasons.push("name_last");
  }

  // Company match: invitee email domain or company tokens in event/email
  const emailDomain = (inv.email.split("@")[1] || "").toLowerCase();
  const compTokens = companyTokens(lead.company);
  if (compTokens.some((t) => emailDomain.includes(t))) {
    score += 20;
    reasons.push("company_domain");
  }

  // Date proximity
  const md = new Date(lead.meeting_date).getTime();
  const ed = new Date(eventStart).getTime();
  if (md && ed) {
    const diff = Math.abs(md - ed);
    const day = 86_400_000;
    if (diff <= day) {
      score += 30;
      reasons.push("date_24h");
    } else if (diff <= 3 * day) {
      score += 15;
      reasons.push("date_72h");
    } else if (diff <= 7 * day) {
      score += 5;
      reasons.push("date_7d");
    }
  }

  return { score, reasons };
}

async function fetchCalendlyEvents(
  token: string,
  orgUri: string,
  since: string,
): Promise<CalEvent[]> {
  const events: CalEvent[] = [];
  let url = `https://api.calendly.com/scheduled_events?organization=${encodeURIComponent(
    orgUri,
  )}&min_start_time=${encodeURIComponent(since)}&count=100&status=active&sort=start_time:desc`;

  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      console.error("[fuzzy-match] events fetch failed:", r.status, await r.text());
      break;
    }
    const j = await r.json();
    for (const ev of j.collection || []) {
      events.push({
        uri: ev.uri,
        name: ev.name,
        start_time: ev.start_time,
        end_time: ev.end_time,
        status: ev.status,
        invitees: [],
      });
    }
    url = j.pagination?.next_page || "";
  }

  // Hydrate invitees in parallel batches
  const BATCH = 8;
  for (let i = 0; i < events.length; i += BATCH) {
    const slice = events.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (ev) => {
        try {
          const r = await fetch(`${ev.uri}/invitees?count=100`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!r.ok) return;
          const j = await r.json();
          ev.invitees = (j.collection || []).map((inv: any) => ({
            name: inv.name || "",
            email: inv.email || "",
          }));
        } catch (e) {
          console.error("[fuzzy-match] invitee fetch failed:", e);
        }
      }),
    );
  }

  return events;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CALENDLY_TOKEN = Deno.env.get("CALENDLY_API_TOKEN")!;
  const INGEST_KEY = Deno.env.get("INGEST_API_KEY")!;

  // Auth
  const url = new URL(req.url);
  const headerKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
  const queryKey = url.searchParams.get("key");
  if (headerKey !== INGEST_KEY && queryKey !== INGEST_KEY) {
    // also accept service-role bearer
    if (headerKey !== SERVICE_KEY) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const dryRun = url.searchParams.get("dry_run") === "true";
  const since = url.searchParams.get("since") || "2022-01-01T00:00:00Z";
  const minScore = Number(url.searchParams.get("min_score") || "50");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // 1. Get Calendly org
    const meRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${CALENDLY_TOKEN}` },
    });
    const me = await meRes.json();
    const orgUri = me.resource?.current_organization;
    if (!orgUri) throw new Error("no calendly org");

    // 2. Get unlinked leads with meeting_date
    const targetStages = [
      "Meeting Set", "Meeting Held", "Discovery Completed",
      "Proposal Sent", "Sample Sent", "Negotiating", "Negotiation",
      "Closed Won", "Closed Lost", "Went Dark", "Lost",
    ];
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, name, company, email, meeting_date, stage, brand, calendly_booked_at")
      .is("archived_at", null)
      .in("stage", targetStages)
      .neq("meeting_date", "")
      .eq("calendly_booked_at", "");
    if (leadsErr) throw leadsErr;
    console.log(`[fuzzy-match] ${leads?.length || 0} unlinked leads with meeting_date`);

    // 3. Fetch all Calendly events (since)
    const events = await fetchCalendlyEvents(CALENDLY_TOKEN, orgUri, since);
    console.log(`[fuzzy-match] ${events.length} Calendly events scanned`);

    // 4. Build flat list of (event, invitee) candidates
    type Cand = { ev: CalEvent; inv: { name: string; email: string } };
    const candidates: Cand[] = [];
    for (const ev of events) {
      for (const inv of ev.invitees) {
        if (inv.email) candidates.push({ ev, inv });
      }
    }

    // 5. For each unlinked lead, find best candidate
    const stamps: Array<{
      lead_id: string;
      name: string;
      company: string;
      brand: string;
      score: number;
      reasons: string[];
      event_uri: string;
      event_start: string;
      event_name: string;
      invitee_name: string;
      invitee_email: string;
    }> = [];
    const noMatch: Array<{ id: string; name: string; company: string; meeting_date: string }> = [];

    for (const lead of leads || []) {
      if (Date.now() - startedAt > WALL_TIME_BUDGET_MS) {
        console.log("[fuzzy-match] wall-time hit, breaking");
        break;
      }
      let best: { score: number; reasons: string[]; cand: Cand } | null = null;
      for (const c of candidates) {
        const { score, reasons } = scoreMatch(
          { name: lead.name, company: lead.company, meeting_date: lead.meeting_date },
          c.inv,
          c.ev.start_time,
        );
        if (score >= minScore && (!best || score > best.score)) {
          best = { score, reasons, cand: c };
        }
      }
      if (best) {
        stamps.push({
          lead_id: lead.id,
          name: lead.name,
          company: lead.company,
          brand: lead.brand,
          score: best.score,
          reasons: best.reasons,
          event_uri: best.cand.ev.uri,
          event_start: best.cand.ev.start_time,
          event_name: best.cand.ev.name,
          invitee_name: best.cand.inv.name,
          invitee_email: best.cand.inv.email,
        });
      } else {
        noMatch.push({
          id: lead.id,
          name: lead.name,
          company: lead.company,
          meeting_date: lead.meeting_date,
        });
      }
    }

    // 6. Apply stamps unless dry_run
    let stamped = 0;
    if (!dryRun) {
      for (const s of stamps) {
        const { error } = await supabase
          .from("leads")
          .update({
            calendly_booked_at: s.event_start,
            calendly_event_name: s.event_name,
            calendly_event_type: s.event_uri,
            updated_at: new Date().toISOString(),
          })
          .eq("id", s.lead_id);
        if (error) {
          console.error(`[fuzzy-match] stamp failed for ${s.lead_id}:`, error);
        } else {
          stamped++;
          await supabase.from("lead_activity_log").insert({
            lead_id: s.lead_id,
            event_type: "calendly_fuzzy_match",
            description: `Fuzzy-matched Calendly event "${s.event_name}" (score ${s.score}, reasons: ${s.reasons.join(",")})`,
            new_value: s.event_uri,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        eventsScanned: events.length,
        candidates: candidates.length,
        unlinkedLeads: leads?.length || 0,
        matched: stamps.length,
        stamped,
        unmatched: noMatch.length,
        elapsedMs: Date.now() - startedAt,
        topMatches: stamps.slice(0, 30),
        unmatchedSample: noMatch.slice(0, 30),
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[fuzzy-match] fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
