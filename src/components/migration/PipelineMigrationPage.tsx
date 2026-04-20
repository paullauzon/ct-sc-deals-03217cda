// One-time migration UI for the v1 → v2 pipeline rebuild.
// Hidden when there are zero legacy stage rows remaining.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { BulkRenamesTab } from "./tabs/BulkRenamesTab";
import { DeadStageCleanupTab } from "./tabs/DeadStageCleanupTab";
import { DiscoveryWorklistTab } from "./tabs/DiscoveryWorklistTab";
import { RRTriageTab } from "./tabs/RRTriageTab";

export interface StageCounts {
  newLead: number;
  qualified: number;
  contacted: number;
  meetingSet: number;
  meetingHeld: number;
  negotiation: number;
  contractSent: number;
  revisitReconnect: number;
  lost: number;
  wentDark: number;
}

const ZERO: StageCounts = {
  newLead: 0, qualified: 0, contacted: 0, meetingSet: 0, meetingHeld: 0,
  negotiation: 0, contractSent: 0, revisitReconnect: 0, lost: 0, wentDark: 0,
};

async function loadCounts(): Promise<StageCounts> {
  const { data, error } = await supabase
    .from("leads")
    .select("stage")
    .is("archived_at", null);
  if (error || !data) return ZERO;
  const c = { ...ZERO };
  for (const row of data) {
    switch ((row as any).stage) {
      case "New Lead": c.newLead++; break;
      case "Qualified": c.qualified++; break;
      case "Contacted": c.contacted++; break;
      case "Meeting Set": c.meetingSet++; break;
      case "Meeting Held": c.meetingHeld++; break;
      case "Negotiation": c.negotiation++; break;
      case "Contract Sent": c.contractSent++; break;
      case "Revisit/Reconnect": c.revisitReconnect++; break;
      case "Lost": c.lost++; break;
      case "Went Dark": c.wentDark++; break;
    }
  }
  return c;
}

export function PipelineMigrationPage() {
  const [counts, setCounts] = useState<StageCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const c = await loadCounts();
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const totalLegacy = counts
    ? Object.values(counts).reduce((s, n) => s + n, 0)
    : 0;

  if (loading || !counts) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline v2 Migration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-time triage tool to clean up legacy stage data. {totalLegacy} legacy rows remaining.
        </p>
      </div>

      {totalLegacy === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="text-lg font-medium">Migration complete</h2>
          <p className="text-sm text-muted-foreground mt-2">
            All deals are on v2 stages. This tool can be safely hidden.
          </p>
        </Card>
      ) : (
        <Tabs defaultValue="renames">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="renames">
              1. Bulk Renames
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-secondary">
                {counts.newLead + counts.meetingSet + counts.meetingHeld + counts.negotiation + counts.contractSent}
              </span>
            </TabsTrigger>
            <TabsTrigger value="dead">
              2. Dead Stages
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-secondary">
                {counts.qualified + counts.contacted + counts.wentDark}
              </span>
            </TabsTrigger>
            <TabsTrigger value="discovery">
              3. Discovery Triage
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-secondary">
                {counts.meetingHeld}
              </span>
            </TabsTrigger>
            <TabsTrigger value="rr">
              4. R/R Triage
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-secondary">
                {counts.revisitReconnect}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="renames">
            <BulkRenamesTab counts={counts} onChange={refresh} />
          </TabsContent>
          <TabsContent value="dead">
            <DeadStageCleanupTab counts={counts} onChange={refresh} />
          </TabsContent>
          <TabsContent value="discovery">
            <DiscoveryWorklistTab onChange={refresh} />
          </TabsContent>
          <TabsContent value="rr">
            <RRTriageTab onChange={refresh} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
