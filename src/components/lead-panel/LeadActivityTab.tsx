import { Lead } from "@/types/lead";
import { UnifiedTimeline } from "@/components/dealroom/UnifiedTimeline";

export function LeadActivityTab({ lead }: { lead: Lead }) {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <UnifiedTimeline lead={lead} />
    </div>
  );
}
