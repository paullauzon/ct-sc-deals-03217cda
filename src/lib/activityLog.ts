import { supabase } from "@/integrations/supabase/client";

export type ActivityEventType = "stage_change" | "field_update" | "meeting_added" | "note_added" | "note_edited" | "note_deleted" | "enrichment_run" | "bulk_update";

export interface ActivityLogEntry {
  id: string;
  lead_id: string;
  event_type: ActivityEventType;
  description: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export async function logActivity(
  leadId: string,
  eventType: ActivityEventType,
  description: string,
  oldValue?: string | null,
  newValue?: string | null
) {
  const { error } = await supabase.from("lead_activity_log" as any).insert({
    lead_id: leadId,
    event_type: eventType,
    description,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
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
