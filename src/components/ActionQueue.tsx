import { useState, useEffect, useCallback, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { LeadDetail } from "@/components/LeadsTable";
import { Filter, Command } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScheduleTab } from "@/components/command-center/ScheduleTab";
import { FollowUpsTab } from "@/components/command-center/FollowUpsTab";
import { DealPulseTab } from "@/components/command-center/DealPulseTab";
import { PrepIntelTab } from "@/components/command-center/PrepIntelTab";
import { isBefore, parseISO, differenceInDays } from "date-fns";

const OWNERS = ["All", "Malik", "Valeria", "Tomos", "Unassigned"] as const;
const HORIZONS = [7, 14, 30] as const;
type CommandTab = "schedule" | "followups" | "pulse" | "intel";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const ACTIVE_STAGES = new Set(["Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"]);

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

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function ActionQueue() {
  const { leads } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [meetingHorizon, setMeetingHorizon] = useState<number>(7);
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

  // Compute badge counts
  const badges = useMemo(() => {
    const now = new Date();
    const filtered = ownerFilter === "All" ? leads
      : ownerFilter === "Unassigned" ? leads.filter(l => !l.assignedTo)
      : leads.filter(l => l.assignedTo === ownerFilter);

    // Schedule: meetings today
    const meetingsToday = filtered.filter(l => {
      if (!l.meetingDate) return false;
      const d = differenceInDays(parseISO(l.meetingDate), now);
      return d >= 0 && d === 0;
    }).length;

    // Follow-ups: overdue + untouched
    const active = filtered.filter(l => !CLOSED_STAGES.has(l.stage));
    const overdue = active.filter(l => {
      if (!l.nextFollowUp || !isBefore(parseISO(l.nextFollowUp), now)) return false;
      return differenceInDays(now, parseISO(l.nextFollowUp)) <= 7;
    }).length;
    const untouched = active.filter(l => l.stage === "New Lead" && !l.lastContactDate && !l.assignedTo).length;
    const goingDark = active.filter(l => {
      if (l.stage === "New Lead") return false;
      const lastDate = l.lastContactDate || l.meetingDate || l.stageEnteredDate || l.dateSubmitted;
      if (!lastDate) return false;
      return differenceInDays(now, parseISO(lastDate)) > 21;
    }).length;

    // Deal Pulse: stalled deals (14+ days in stage)
    const stalled = active.filter(l => {
      if (!ACTIVE_STAGES.has(l.stage)) return false;
      const days = l.stageEnteredDate ? differenceInDays(now, parseISO(l.stageEnteredDate)) : 0;
      return days > 14;
    }).length;

    // Prep Intel: meetings in next 7 days
    const prepMeetings = filtered.filter(l => {
      if (!l.meetingDate) return false;
      const d = differenceInDays(parseISO(l.meetingDate), now);
      return d >= 0 && d <= 7;
    }).length;

    return {
      schedule: meetingsToday,
      followups: overdue,
      pulse: stalled,
      intel: prepMeetings,
    };
  }, [leads, ownerFilter]);

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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="text-sm border border-border rounded-md px-2 py-1 bg-background"
            >
              {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {(commandTab === "intel" || commandTab === "schedule") && (
            <div className="flex items-center gap-1">
              {HORIZONS.map(h => (
                <button
                  key={h}
                  onClick={() => setMeetingHorizon(h)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${meetingHorizon === h ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {h}d
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={commandTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="schedule" className="flex items-center">Schedule<Badge count={badges.schedule} /></TabsTrigger>
          <TabsTrigger value="followups" className="flex items-center">Follow-Ups<Badge count={badges.followups} /></TabsTrigger>
          <TabsTrigger value="pulse" className="flex items-center">Deal Pulse<Badge count={badges.pulse} /></TabsTrigger>
          <TabsTrigger value="intel" className="flex items-center">Prep Intel<Badge count={badges.intel} /></TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <ScheduleTab leads={leads} ownerFilter={ownerFilter} onSelectLead={setSelectedLeadId} meetingHorizon={meetingHorizon} />
        </TabsContent>
        <TabsContent value="followups">
          <FollowUpsTab leads={leads} ownerFilter={ownerFilter} onSelectLead={setSelectedLeadId} />
        </TabsContent>
        <TabsContent value="pulse">
          <DealPulseTab leads={leads} ownerFilter={ownerFilter} onSelectLead={setSelectedLeadId} />
        </TabsContent>
        <TabsContent value="intel">
          <PrepIntelTab leads={leads} ownerFilter={ownerFilter} onSelectLead={setSelectedLeadId} meetingHorizon={meetingHorizon} />
        </TabsContent>
      </Tabs>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
