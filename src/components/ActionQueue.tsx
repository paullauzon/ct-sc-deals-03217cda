import { useState, useEffect, useCallback } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { LeadDetail } from "@/components/LeadsTable";
import { Filter, Command } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScheduleTab } from "@/components/command-center/ScheduleTab";
import { FollowUpsTab } from "@/components/command-center/FollowUpsTab";
import { DealPulseTab } from "@/components/command-center/DealPulseTab";
import { PrepIntelTab } from "@/components/command-center/PrepIntelTab";

const OWNERS = ["All", "Malik", "Valeria", "Tomos", "Unassigned"] as const;
type CommandTab = "schedule" | "followups" | "pulse" | "intel";

function parseTabFromHash(): CommandTab {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  const t = params.get("ctab");
  if (t && ["schedule", "followups", "pulse", "intel"].includes(t)) return t as CommandTab;
  return "schedule";
}

function updateTabHash(tab: CommandTab) {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  params.set("ctab", tab);
  window.location.hash = params.toString();
}

export function ActionQueue() {
  const { leads } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [commandTab, setCommandTab] = useState<CommandTab>(parseTabFromHash);

  const handleTabChange = useCallback((val: string) => {
    const tab = val as CommandTab;
    setCommandTab(tab);
    updateTabHash(tab);
  }, []);

  useEffect(() => {
    const onHashChange = () => setCommandTab(parseTabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Command className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Your daily sales cockpit</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-1 bg-background"
          >
            {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={commandTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="followups">Follow-Ups</TabsTrigger>
          <TabsTrigger value="pulse">Deal Pulse</TabsTrigger>
          <TabsTrigger value="intel">Prep Intel</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <ScheduleTab leads={leads} ownerFilter={ownerFilter} onSelectLead={setSelectedLeadId} />
        </TabsContent>
        <TabsContent value="followups">
          <FollowUpsTab leads={leads} ownerFilter={ownerFilter} onSelectLead={setSelectedLeadId} />
        </TabsContent>
        <TabsContent value="pulse">
          <DealPulseTab leads={leads} ownerFilter={ownerFilter} onSelectLead={setSelectedLeadId} />
        </TabsContent>
        <TabsContent value="intel">
          <PrepIntelTab leads={leads} ownerFilter={ownerFilter} onSelectLead={setSelectedLeadId} />
        </TabsContent>
      </Tabs>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
