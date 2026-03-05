import { supabase } from "@/integrations/supabase/client";

export type ActivityEventType = "stage_change" | "field_update" | "meeting_added" | "note_added" | "enrichment_run" | "bulk_update";

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
