import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from "react";
import { Lead, Meeting, LeadStage, PipelineMetrics } from "@/types/lead";
import { getInitialLeads } from "@/data/leadData";
import { supabase } from "@/integrations/supabase/client";
import { leadToRow, rowToLead, leadUpdatesToRow } from "@/lib/leadDbMapping";
import { toast } from "sonner";

const SEEN_LEADS_KEY = "captarget_seen_leads";

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_LEADS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function persistSeenIds(ids: Set<string>) {
  localStorage.setItem(SEEN_LEADS_KEY, JSON.stringify([...ids]));
}

interface LeadContextType {
  leads: Lead[];
  loading: boolean;
  unseenCount: number;
  clearUnseen: () => void;
  isLeadNew: (id: string) => boolean;
  markLeadSeen: (id: string) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  addLead: (lead: Omit<Lead, "id" | "daysInCurrentStage" | "stageEnteredDate" | "hoursToMeetingSet">) => void;
  addMeeting: (leadId: string, meeting: Meeting) => void;
  getMetrics: () => PipelineMetrics;
  getLeadsByStage: (stage: LeadStage) => Lead[];
  searchLeads: (query: string) => Lead[];
}

const LeadContext = createContext<LeadContextType | null>(null);

const STAGES: LeadStage[] = [
  "New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held",
  "Proposal Sent", "Negotiation", "Contract Sent", "Closed Won", "Closed Lost", "Went Dark",
];

async function fetchLeadsFromDb(): Promise<Lead[] | null> {
  const { data, error } = await supabase.from("leads").select("*");
  if (error) {
    console.error("Failed to fetch leads:", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data.map((row: any) => rowToLead(row));
}

async function seedLeadsToDb(leads: Lead[]) {
  const rows = leads.map(leadToRow);
  // Batch insert in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabase.from("leads").upsert(chunk as any, { onConflict: "id" });
    if (error) console.error("Seed error:", error);
  }
}

async function upsertLeadToDb(lead: Lead) {
  const row = leadToRow(lead);
  const { error } = await supabase.from("leads").upsert(row as any, { onConflict: "id" });
  if (error) console.error("Upsert error:", error);
}

async function updateLeadInDb(id: string, updates: Partial<Lead>) {
  const dbUpdates = leadUpdatesToRow(updates);
  dbUpdates.updated_at = new Date().toISOString();
  const { error } = await supabase.from("leads").update(dbUpdates).eq("id", id);
  if (error) console.error("Update error:", error);
}

export function LeadProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [seenLeadIds, setSeenLeadIds] = useState<Set<string>>(() => loadSeenIds());
  const leadIdsRef = useRef<Set<string>>(new Set());

  const unseenCount = useMemo(
    () => leads.filter(l => !seenLeadIds.has(l.id)).length,
    [leads, seenLeadIds]
  );

  const isLeadNew = useCallback((id: string) => !seenLeadIds.has(id), [seenLeadIds]);

  const markLeadSeen = useCallback((id: string) => {
    setSeenLeadIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistSeenIds(next);
      return next;
    });
  }, []);

  const clearUnseen = useCallback(() => {
    setSeenLeadIds(prev => {
      const next = new Set(prev);
      leads.forEach(l => next.add(l.id));
      persistSeenIds(next);
      return next;
    });
  }, [leads]);

  // Load leads from DB on mount, seed if empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dbLeads = await fetchLeadsFromDb();
      if (cancelled) return;
      if (dbLeads && dbLeads.length > 0) {
        setLeads(dbLeads);
        leadIdsRef.current = new Set(dbLeads.map(l => l.id));
      } else {
        const initial = getInitialLeads();
        setLeads(initial);
        leadIdsRef.current = new Set(initial.map(l => l.id));
        await seedLeadsToDb(initial);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime subscription for new leads
  useEffect(() => {
    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const newRow = payload.new;
          if (!newRow || leadIdsRef.current.has(newRow.id)) return;
          const newLead = rowToLead(newRow);
          leadIdsRef.current.add(newLead.id);
          setLeads(prev => [newLead, ...prev]);
          setUnseenCount(prev => prev + 1);
          const brandLabel = newLead.brand === "Captarget" ? "CT" : "SC";
          toast(`New lead: ${newLead.name}`, {
            description: `${newLead.company || "No company"} · ${brandLabel} · ${newLead.source}`,
            duration: 8000,
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateLead = useCallback((id: string, updates: Partial<Lead>) => {
    setLeads((prev) => {
      const next = prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...updates };
        if (updates.stage && updates.stage !== l.stage) {
          updated.stageEnteredDate = new Date().toISOString().split("T")[0];
          updated.daysInCurrentStage = 0;
          if (["Closed Won", "Closed Lost", "Went Dark"].includes(updates.stage)) {
            updated.closedDate = new Date().toISOString().split("T")[0];
          } else {
            updated.closedDate = "";
          }
        }
        if (updates.meetingSetDate && !l.meetingSetDate) {
          const submitted = new Date(l.dateSubmitted).getTime();
          const set = new Date(updates.meetingSetDate).getTime();
          updated.hoursToMeetingSet = Math.round((set - submitted) / (1000 * 60 * 60));
        }
        // Persist to DB (fire and forget)
        updateLeadInDb(id, updated);
        return updated;
      });
      return next;
    });
  }, []);

  const addLead = useCallback((leadData: Omit<Lead, "id" | "daysInCurrentStage" | "stageEnteredDate" | "hoursToMeetingSet">) => {
    setLeads((prev) => {
      const today = new Date().toISOString().split("T")[0];
      const newLead: Lead = {
        ...leadData,
        id: `CT-${String(prev.length + 1).padStart(3, "0")}`,
        daysInCurrentStage: 0,
        stageEnteredDate: today,
        hoursToMeetingSet: null,
      };
      // Persist to DB
      upsertLeadToDb(newLead);
      return [newLead, ...prev];
    });
  }, []);

  const addMeeting = useCallback((leadId: string, meeting: Meeting) => {
    setLeads((prev) => {
      const next = prev.map((l) => {
        if (l.id !== leadId) return l;
        const updated = { ...l, meetings: [...(l.meetings || []), meeting] };
        if (meeting.date && (!l.lastContactDate || meeting.date > l.lastContactDate)) {
          updated.lastContactDate = meeting.date;
        }
        // Persist to DB
        updateLeadInDb(leadId, { meetings: updated.meetings, lastContactDate: updated.lastContactDate });
        return updated;
      });
      return next;
    });
  }, []);

  const getLeadsByStage = useCallback(
    (stage: LeadStage) => leads.filter((l) => l.stage === stage),
    [leads]
  );

  const getMetrics = useCallback((): PipelineMetrics => {
    const stageValues = {} as PipelineMetrics["stageValues"];
    for (const s of STAGES) {
      const inStage = leads.filter((l) => l.stage === s);
      stageValues[s] = {
        count: inStage.length,
        value: inStage.reduce((sum, l) => sum + l.dealValue, 0),
      };
    }
    const activePipeline = leads.filter(
      (l) => !["Closed Won", "Closed Lost", "Went Dark"].includes(l.stage)
    );
    const meetingLeads = leads.filter((l) => l.hoursToMeetingSet !== null);
    const avgDaysToMeeting = meetingLeads.length
      ? Math.round(meetingLeads.reduce((s, l) => s + (l.hoursToMeetingSet || 0), 0) / meetingLeads.length / 24)
      : 0;

    return {
      totalLeads: leads.length,
      totalPipelineValue: activePipeline.reduce((s, l) => s + l.dealValue, 0),
      avgDealValue: activePipeline.length
        ? Math.round(activePipeline.reduce((s, l) => s + l.dealValue, 0) / (activePipeline.filter((l) => l.dealValue > 0).length || 1))
        : 0,
      meetingsSet: stageValues["Meeting Set"].count + stageValues["Meeting Held"].count,
      closedWon: stageValues["Closed Won"].count,
      closedLost: stageValues["Closed Lost"].count,
      wentDark: stageValues["Went Dark"].count,
      conversionRate: leads.length
        ? Math.round((stageValues["Closed Won"].count / leads.length) * 100)
        : 0,
      avgDaysToMeeting,
      stageValues,
    };
  }, [leads]);

  const searchLeads = useCallback(
    (query: string) => {
      const q = query.toLowerCase();
      return leads.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.role.toLowerCase().includes(q) ||
          l.message.toLowerCase().includes(q)
      );
    },
    [leads]
  );

  return (
    <LeadContext.Provider value={{ leads, loading, unseenCount, clearUnseen, updateLead, addLead, addMeeting, getMetrics, getLeadsByStage, searchLeads }}>
      {children}
    </LeadContext.Provider>
  );
}

export function useLeads() {
  const ctx = useContext(LeadContext);
  if (!ctx) throw new Error("useLeads must be used within LeadProvider");
  return ctx;
}
