import { supabase } from "@/integrations/supabase/client";

export type ActivityEventType = "stage_change" | "field_update" | "meeting_added" | "note_added" | "note_edited" | "note_deleted" | "enrichment_run" | "bulk_update" | "call_logged" | "sequence_paused";

export interface ActivityLogEntry {
  id: string;
  lead_id: string;
  event_type: ActivityEventType;
  description: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
}

/** Cache the actor for the lifetime of the tab to avoid a getUser round-trip on every log call. */
let cachedActor: { id: string; name: string } | null = null;
let cachedAt = 0;
const ACTOR_TTL_MS = 60_000;

async function getActor(): Promise<{ id: string | null; name: string }> {
  const now = Date.now();
  if (cachedActor && now - cachedAt < ACTOR_TTL_MS) {
    return { id: cachedActor.id, name: cachedActor.name };
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, name: "" };
    // Prefer profiles.name; fallback to auth metadata
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", user.id)
      .maybeSingle();
    const metaName = (user.user_metadata as any)?.name || (user.user_metadata as any)?.full_name || "";
    const name = (profile?.name?.trim() || metaName || profile?.email || user.email || "Unknown").toString();
    cachedActor = { id: user.id, name };
    cachedAt = now;
    return { id: user.id, name };
  } catch {
    return { id: null, name: "" };
  }
}

/** Call this on sign-out so the next logActivity resolves the new user. */
export function clearActivityActorCache() {
  cachedActor = null;
  cachedAt = 0;
}

export async function logActivity(
  leadId: string,
  eventType: ActivityEventType,
  description: string,
  oldValue?: string | null,
  newValue?: string | null
) {
  const actor = await getActor();
  const { error } = await supabase.from("lead_activity_log" as any).insert({
    lead_id: leadId,
    event_type: eventType,
    description,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
    actor_user_id: actor.id,
    actor_name: actor.name,
  } as any);
  if (error) console.error("Activity log error:", error);
}

/**
 * Bumps `last_contacted` on any stakeholder whose email matches one of the supplied addresses.
 * Used by Log Call + Email Compose flows so the stakeholder map stays current automatically.
 */
export async function bumpStakeholderContact(leadId: string, emails: string[]) {
  const cleaned = emails.map(e => e?.trim().toLowerCase()).filter(Boolean) as string[];
  if (cleaned.length === 0) return;
  try {
    const { data } = await (supabase as any)
      .from("lead_stakeholders")
      .select("id, email, name")
      .eq("lead_id", leadId);
    if (!data || data.length === 0) return;
    const now = new Date().toISOString();
    const matches = (data as { id: string; email: string; name: string }[])
      .filter(s => s.email && cleaned.includes(s.email.toLowerCase()));
    if (matches.length === 0) return;
    await Promise.all(matches.map(m =>
      (supabase as any).from("lead_stakeholders").update({ last_contacted: now, updated_at: now }).eq("id", m.id)
    ));
  } catch (err) {
    console.error("bumpStakeholderContact error:", err);
  }
}

export async function fetchActivityLog(leadId: string): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from("lead_activity_log" as any)
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("Fetch activity log error:", error);
    return [];
  }
  return (data || []) as unknown as ActivityLogEntry[];
}

const TRACKED_FIELDS: Record<string, string> = {
  stage: "Stage",
  priority: "Priority",
  assignedTo: "Owner",
  dealValue: "Deal Value",
  forecastCategory: "Forecast",
  icpFit: "ICP Fit",
  serviceInterest: "Service Interest",
  meetingOutcome: "Meeting Outcome",
  closeReason: "Close Reason",
};

export function detectFieldChanges(
  leadId: string,
  current: Record<string, any>,
  updates: Record<string, any>
) {
  for (const [field, label] of Object.entries(TRACKED_FIELDS)) {
    if (field in updates && updates[field] !== current[field]) {
      const oldVal = String(current[field] || "—");
      const newVal = String(updates[field] || "—");
      const eventType: ActivityEventType = field === "stage" ? "stage_change" : "field_update";
      logActivity(leadId, eventType, `${label} changed from "${oldVal}" → "${newVal}"`, oldVal, newVal);
    }
  }

  // Notes change
  if ("notes" in updates && updates.notes !== current.notes) {
    logActivity(leadId, "note_added", "Notes updated");
  }
}
