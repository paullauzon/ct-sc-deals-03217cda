import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Queries lead_emails for a set of lead IDs and returns a Set of lead IDs
 * whose most recent email is inbound (i.e., prospect wrote us and we haven't replied).
 */
export function useUnansweredEmails(leadIds: string[]) {
  const [unansweredIds, setUnansweredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const key = leadIds.slice().sort().join(",");

  const fetch = useCallback(async () => {
    if (leadIds.length === 0) {
      setUnansweredIds(new Set());
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("lead_emails")
      .select("lead_id, email_date, direction")
      .in("lead_id", leadIds)
      .order("email_date", { ascending: false });

    if (!data) { setLoading(false); return; }

    const byLead = new Map<string, { direction: string }>();
    for (const row of data) {
      // Only keep the most recent email per lead (already sorted desc)
      if (!byLead.has(row.lead_id)) {
        byLead.set(row.lead_id, { direction: row.direction });
      }
    }

    const result = new Set<string>();
    byLead.forEach((val, leadId) => {
      if (val.direction === "inbound") result.add(leadId);
    });

    setUnansweredIds(result);
    setLoading(false);
  }, [key]);

  useEffect(() => { fetch(); }, [fetch]);

  return { unansweredIds, loading };
}
