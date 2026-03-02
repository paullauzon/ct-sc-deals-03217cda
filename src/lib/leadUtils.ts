/** Compute days in current stage dynamically from stageEnteredDate */
export function computeDaysInStage(stageEnteredDate: string): number {
  if (!stageEnteredDate) return 0;
  const entered = new Date(stageEnteredDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - entered) / (1000 * 60 * 60 * 24)));
}
