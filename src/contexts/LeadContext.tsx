import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Lead, LeadStage, LeadSource, PipelineMetrics } from "@/types/lead";
import { getInitialLeads } from "@/data/leadData";

const SCHEMA_VERSION = 3;

const LEAD_DEFAULTS: Partial<Lead> = {
  meetingOutcome: "",
  forecastCategory: "",
  icpFit: "",
  wonReason: "",
  lostReason: "",
  closeReason: "",
  closedDate: "",
  targetCriteria: "",
  targetRevenue: "",
  geography: "",
  currentSourcing: "",
};

const SERVICE_MIGRATION: Record<string, string> = {
  "Deal Origination": "Off-Market Email Origination",
  "Managed Outreach": "Direct Calling",
  "Pipeline Building": "Full Platform (All 3)",
  "Add-on Sourcing": "Off-Market Email Origination",
  "Custom Campaign": "Full Platform (All 3)",
};

function migrateLeads(leads: Lead[]): Lead[] {
  return leads.map((l) => {
    const migrated = { ...l };
    for (const [key, defaultVal] of Object.entries(LEAD_DEFAULTS)) {
      if ((migrated as any)[key] === undefined) {
        (migrated as any)[key] = defaultVal;
      }
    }
    // Migrate old service interest names
    if (SERVICE_MIGRATION[migrated.serviceInterest]) {
      migrated.serviceInterest = SERVICE_MIGRATION[migrated.serviceInterest] as any;
    }
    return migrated;
  });
}

interface LeadContextType {
  leads: Lead[];
  updateLead: (id: string, updates: Partial<Lead>) => void;
  addLead: (lead: Omit<Lead, "id" | "daysInCurrentStage" | "stageEnteredDate" | "hoursToMeetingSet">) => void;
  getMetrics: () => PipelineMetrics;
  getLeadsByStage: (stage: LeadStage) => Lead[];
  searchLeads: (query: string) => Lead[];
}

const LeadContext = createContext<LeadContextType | null>(null);

const STAGES: LeadStage[] = [
  "New Lead", "Contacted", "Meeting Set", "Meeting Held",
  "Proposal Sent", "Negotiation", "Closed Won", "Closed Lost", "Went Dark",
];

export function LeadProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>(() => {
    const ver = localStorage.getItem("captarget-schema-version");
    const saved = localStorage.getItem("captarget-leads");
    if (saved) {
      const parsed = JSON.parse(saved);
      const migrated = migrateLeads(parsed);
      if (ver !== String(SCHEMA_VERSION)) {
        localStorage.setItem("captarget-leads", JSON.stringify(migrated));
        localStorage.setItem("captarget-schema-version", String(SCHEMA_VERSION));
      }
      return migrated;
    }
    const initial = getInitialLeads();
    localStorage.setItem("captarget-schema-version", String(SCHEMA_VERSION));
    return initial;
  });

  const updateLead = useCallback((id: string, updates: Partial<Lead>) => {
    setLeads((prev) => {
      const next = prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...updates };
        // Auto-calculate days in stage when stage changes
        if (updates.stage && updates.stage !== l.stage) {
          updated.stageEnteredDate = new Date().toISOString().split("T")[0];
          updated.daysInCurrentStage = 0;
          // Auto-set closedDate
          if (["Closed Won", "Closed Lost", "Went Dark"].includes(updates.stage)) {
            updated.closedDate = new Date().toISOString().split("T")[0];
          } else {
            updated.closedDate = "";
          }
        }
        // Auto-calculate hours to meeting set
        if (updates.meetingSetDate && !l.meetingSetDate) {
          const submitted = new Date(l.dateSubmitted).getTime();
          const set = new Date(updates.meetingSetDate).getTime();
          updated.hoursToMeetingSet = Math.round((set - submitted) / (1000 * 60 * 60));
        }
        return updated;
      });
      localStorage.setItem("captarget-leads", JSON.stringify(next));
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
      const next = [newLead, ...prev];
      localStorage.setItem("captarget-leads", JSON.stringify(next));
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
      ? Math.round(
          meetingLeads.reduce((s, l) => s + (l.hoursToMeetingSet || 0), 0) /
            meetingLeads.length / 24
        )
      : 0;

    return {
      totalLeads: leads.length,
      totalPipelineValue: activePipeline.reduce((s, l) => s + l.dealValue, 0),
      avgDealValue:
        activePipeline.length
          ? Math.round(
              activePipeline.reduce((s, l) => s + l.dealValue, 0) /
                activePipeline.filter((l) => l.dealValue > 0).length || 0
            )
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
    <LeadContext.Provider value={{ leads, updateLead, addLead, getMetrics, getLeadsByStage, searchLeads }}>
      {children}
    </LeadContext.Provider>
  );
}

export function useLeads() {
  const ctx = useContext(LeadContext);
  if (!ctx) throw new Error("useLeads must be used within LeadProvider");
  return ctx;
}
