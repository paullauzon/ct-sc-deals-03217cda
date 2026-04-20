import { Lead } from "@/types/lead";
import { normalizeStage } from "@/lib/leadUtils";

/** Check if a lead was created within the last 24 hours and is still in "Unassigned" stage (v2). */
export function isNewLead(lead: Lead): boolean {
  if (normalizeStage(lead.stage) !== "Unassigned") return false;
  // Use dateSubmitted as proxy; for DB-ingested leads created_at would be recent
  const now = Date.now();
  // Check stageEnteredDate first, then dateSubmitted
  const dateStr = lead.stageEnteredDate || lead.dateSubmitted;
  if (!dateStr) return false;
  const enteredTime = new Date(dateStr).getTime();
  if (isNaN(enteredTime)) return false;
  const hoursSince = (now - enteredTime) / (1000 * 60 * 60);
  return hoursSince < 24;
}
