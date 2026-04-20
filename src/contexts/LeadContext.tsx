// Lead context provider - manages all lead data and operations
import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from "react";
import { Lead, Meeting, LeadStage, PipelineMetrics } from "@/types/lead";
import { getInitialLeads } from "@/data/leadData";
import { supabase } from "@/integrations/supabase/client";
import { leadToRow, rowToLead, leadUpdatesToRow } from "@/lib/leadDbMapping";
import { detectFieldChanges, logActivity } from "@/lib/activityLog";
import { getPlaybookForStage, generateTasksFromPlaybook } from "@/lib/playbooks";
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
  archiveLead: (id: string, reason: string) => void;
  refreshLeads: () => Promise<void>;
}

const LeadContext = createContext<LeadContextType | null>(null);

import { ALL_STAGES as STAGES_FROM_UTILS, normalizeStage, TERMINAL_STAGES } from "@/lib/leadUtils";

const STAGES: LeadStage[] = STAGES_FROM_UTILS;

async function fetchLeadsFromDb(): Promise<Lead[] | null> {
  const { data, error } = await supabase.from("leads").select("*").is("archived_at", null);
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

async function updateLeadInDb(id: string, updates: Partial<Lead>): Promise<boolean> {
  const dbUpdates = leadUpdatesToRow(updates);
  dbUpdates.updated_at = new Date().toISOString();
  const { error } = await supabase.from("leads").update(dbUpdates as any).eq("id", id);
  if (error) {
    console.error("Update error:", error);
    return false;
  }
  return true;
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

  const refreshLeads = useCallback(async () => {
    const dbLeads = await fetchLeadsFromDb();
    if (dbLeads && dbLeads.length > 0) {
      setLeads(dbLeads);
      leadIdsRef.current = new Set(dbLeads.map(l => l.id));
    }
  }, []);

  // Load leads from DB on mount, seed if empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dbLeads = await fetchLeadsFromDb();
      if (cancelled) return;
      if (dbLeads && dbLeads.length > 0) {
        setLeads(dbLeads);
        leadIdsRef.current = new Set(dbLeads.map(l => l.id));
        // Mark all existing leads as seen on first load (so they don't all show as NEW)
        setSeenLeadIds(prev => {
          const next = new Set(prev);
          let changed = false;
          dbLeads.forEach(l => { if (!next.has(l.id)) { next.add(l.id); changed = true; } });
          if (changed) persistSeenIds(next);
          return changed ? next : prev;
        });
      } else {
        const initial = getInitialLeads();
        setLeads(initial);
        leadIdsRef.current = new Set(initial.map(l => l.id));
        // Mark seeded leads as seen
        setSeenLeadIds(prev => {
          const next = new Set(prev);
          initial.forEach(l => next.add(l.id));
          persistSeenIds(next);
          return next;
        });
        await seedLeadsToDb(initial);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime subscription for new leads and score updates
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
          // Don't add to seenLeadIds — it will show as "NEW"
          const brandLabel = newLead.brand === "Captarget" ? "CT" : "SC";
          toast(`New lead: ${newLead.name}`, {
            description: `${newLead.company || "No company"} · ${brandLabel} · ${newLead.source}`,
            duration: 8000,
          });

          // Auto-score the new lead
          supabase.functions.invoke("score-lead", {
            body: { record: { id: newLead.id, email: newLead.email, name: newLead.name, company: newLead.company, company_url: newLead.companyUrl, buyer_type: newLead.buyerType, source: newLead.source, message: newLead.message } },
          }).catch(err => console.error("Auto-score failed:", err));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (payload) => {
          const updatedRow = payload.new;
          if (!updatedRow) return;
          setLeads(prev => prev.map(l => {
            if (l.id !== updatedRow.id) return l;
            const scoringUpdates: Partial<Lead> = {};
            if (updatedRow.stage1_score != null && l.stage1Score !== Number(updatedRow.stage1_score)) {
              scoringUpdates.stage1Score = Number(updatedRow.stage1_score);
            }
            if (updatedRow.stage2_score != null && l.stage2Score !== Number(updatedRow.stage2_score)) {
              scoringUpdates.stage2Score = Number(updatedRow.stage2_score);
            }
            if (updatedRow.tier != null && l.tier !== Number(updatedRow.tier)) {
              scoringUpdates.tier = Number(updatedRow.tier);
            }
            if (updatedRow.tier_override != null) {
              scoringUpdates.tierOverride = updatedRow.tier_override;
            }
            if (updatedRow.enrichment_status && l.enrichmentStatus !== updatedRow.enrichment_status) {
              scoringUpdates.enrichmentStatus = updatedRow.enrichment_status;
            }
            if (updatedRow.linkedin_url != null && l.linkedinUrl !== (updatedRow.linkedin_url || "")) {
              scoringUpdates.linkedinUrl = updatedRow.linkedin_url || "";
            }
            if (updatedRow.linkedin_title != null && l.linkedinTitle !== (updatedRow.linkedin_title || "")) {
              scoringUpdates.linkedinTitle = updatedRow.linkedin_title || "";
            }
            // Live-sync core deal fields edited from other tabs / processing jobs
            const liveFields: Array<[string, keyof Lead, (v: any) => any]> = [
              ["stage", "stage", v => v],
              ["lead_status", "leadStatus", v => v],
              ["priority", "priority", v => v],
              ["deal_value", "dealValue", v => Number(v)],
              ["close_confidence", "closeConfidence", v => v == null ? null : Number(v)],
              ["contract_months", "contractMonths", v => v == null ? null : Number(v)],
              ["next_follow_up", "nextFollowUp", v => v || ""],
              ["next_mutual_step", "nextMutualStep", v => v || ""],
              ["next_mutual_step_date", "nextMutualStepDate", v => v || ""],
              ["competing_bankers", "competingBankers", v => v || ""],
              ["deal_narrative", "dealNarrative", v => v || ""],
              ["assigned_to", "assignedTo", v => v || ""],
              ["forecast_category", "forecastCategory", v => v || ""],
              ["icp_fit", "icpFit", v => v || ""],
              ["meeting_outcome", "meetingOutcome", v => v || ""],
              ["notes", "notes", v => v || ""],
              ["stage_entered_date", "stageEnteredDate", v => v || ""],
              ["last_contact_date", "lastContactDate", v => v || ""],
              ["closed_date", "closedDate", v => v || ""],
              ["google_drive_link", "googleDriveLink", v => v || ""],
              ["forecasted_close_date", "forecastedCloseDate", v => v || ""],
            ];
            for (const [dbCol, leadKey, mapper] of liveFields) {
              if (dbCol in updatedRow) {
                const incoming = mapper(updatedRow[dbCol]);
                if ((l as any)[leadKey] !== incoming) {
                  (scoringUpdates as any)[leadKey] = incoming;
                }
              }
            }
            // Calendly booking: pick up stage, meeting_date, calendly_booked_at
            if (updatedRow.calendly_booked_at && !l.calendlyBookedAt && updatedRow.calendly_booked_at !== "") {
              scoringUpdates.calendlyBookedAt = updatedRow.calendly_booked_at;
              scoringUpdates.stage = updatedRow.stage || l.stage;
              scoringUpdates.meetingDate = updatedRow.meeting_date || l.meetingDate;
              scoringUpdates.meetingSetDate = updatedRow.meeting_set_date || l.meetingSetDate;
              scoringUpdates.stageEnteredDate = updatedRow.stage_entered_date || l.stageEnteredDate;
              // Show booking toast
              const meetingDateStr = updatedRow.meeting_date || "";
              let dateLabel = meetingDateStr;
              try { if (meetingDateStr) dateLabel = new Date(meetingDateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch {}
              toast(`📅 ${l.name} booked a meeting${dateLabel ? ` for ${dateLabel}` : ""}`, {
                description: "Via Calendly — stage moved to Meeting Set",
                duration: 10000,
              });
            }
            if (Object.keys(scoringUpdates).length === 0) return l;
            return { ...l, ...scoringUpdates };
          }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateLead = useCallback((id: string, updates: Partial<Lead>, _isUndo?: boolean) => {
    setLeads((prev) => {
      const next = prev.map((l) => {
        if (l.id !== id) return l;

        // Snapshot for undo if this is a stage change (and not itself an undo)
        const isStageChange = updates.stage && updates.stage !== l.stage && !_isUndo;
        const snapshot = isStageChange ? {
          stage: l.stage,
          stageEnteredDate: l.stageEnteredDate,
          daysInCurrentStage: l.daysInCurrentStage,
          lastContactDate: l.lastContactDate,
          closedDate: l.closedDate,
          hoursToMeetingSet: l.hoursToMeetingSet,
          meetingSetDate: l.meetingSetDate,
        } : null;

        // Log field changes before applying
        detectFieldChanges(id, l, updates);
        const updated = { ...l, ...updates };
        const dbPayload: Partial<Lead> = { ...updates };
        if (updates.stage && updates.stage !== l.stage) {
          const now = new Date();
          const today = now.toISOString().split("T")[0];
          updated.stageEnteredDate = today;
          updated.daysInCurrentStage = 0;
          dbPayload.stageEnteredDate = today;
          dbPayload.daysInCurrentStage = 0;
          const normalizedNew = normalizeStage(updates.stage);
          // Auto-set last_contact_date on stage advancement beyond Unassigned
          if (normalizedNew !== "Unassigned" && !updated.lastContactDate) {
            updated.lastContactDate = today;
            dbPayload.lastContactDate = today;
          }
          // Auto-calculate hoursToMeetingSet when manually moving to Discovery Scheduled
          if (normalizedNew === "Discovery Scheduled" && l.hoursToMeetingSet == null) {
            const createdAt = l.createdAt ? new Date(l.createdAt).getTime() : new Date(l.dateSubmitted).getTime();
            const hours = Math.max(0, Math.round(((now.getTime() - createdAt) / 3600000) * 10) / 10);
            updated.hoursToMeetingSet = hours;
            dbPayload.hoursToMeetingSet = hours;
            if (!updated.meetingSetDate) {
              updated.meetingSetDate = today;
              dbPayload.meetingSetDate = today;
            }
          }
          // Closed (won or lost) — stamp closedDate. TERMINAL_STAGES covers v2 + legacy via normalize.
          if (TERMINAL_STAGES.includes(normalizedNew)) {
            updated.closedDate = today;
            dbPayload.closedDate = today;
          } else {
            updated.closedDate = "";
            dbPayload.closedDate = "";
          }
          // Auto-enroll in 90-day nurture when entering Closed Lost (v2 or legacy)
          if (normalizedNew === "Closed Lost" && !l.nurtureSequenceStatus) {
            updated.nurtureSequenceStatus = "active";
            updated.nurtureStartedAt = now.toISOString();
            const reEngage = new Date(now);
            reEngage.setDate(reEngage.getDate() + 90);
            updated.nurtureReEngageDate = reEngage.toISOString().split("T")[0];
            dbPayload.nurtureSequenceStatus = "active";
            dbPayload.nurtureStartedAt = now.toISOString();
            dbPayload.nurtureReEngageDate = reEngage.toISOString().split("T")[0];
          }
          // Archive stale playbook tasks then generate new ones (v2 playbook lookup uses normalized stage)
          const playbook = getPlaybookForStage(updates.stage);
          if (playbook) {
            supabase.from("lead_tasks")
              .update({ status: "superseded" } as any)
              .eq("lead_id", id)
              .eq("status", "pending")
              .then(() => {
                const tasks = generateTasksFromPlaybook(playbook, id);
                supabase.from("lead_tasks").insert(tasks as any).then(({ error: taskErr }) => {
                  if (taskErr) console.error("Playbook task insert error:", taskErr);
                  else toast(`📋 ${playbook.steps.length} playbook tasks created for ${updated.name}`);
                });
              });
          } else {
            supabase.from("lead_tasks")
              .update({ status: "superseded" } as any)
              .eq("lead_id", id)
              .eq("status", "pending")
              .then(() => {});
          }
        }
        if (updates.meetingSetDate && !l.meetingSetDate) {
          const submitted = new Date(l.dateSubmitted).getTime();
          const set = new Date(updates.meetingSetDate).getTime();
          updated.hoursToMeetingSet = Math.max(0, Math.round((set - submitted) / (1000 * 60 * 60)));
          dbPayload.hoursToMeetingSet = updated.hoursToMeetingSet;
        }
        // Persist only changed fields to DB with error surfacing
        updateLeadInDb(id, dbPayload).then(ok => {
          if (!ok) toast.error("Failed to save changes. Please retry.");
        });

        // Show undo toast for stage changes
        if (isStageChange && snapshot) {
          toast(`Stage changed to ${updates.stage}`, {
            duration: 5000,
            action: {
              label: "Undo",
              onClick: () => {
                // Restore snapshot fields
                updateLead(id, snapshot as Partial<Lead>, true);
                // Restore superseded tasks back to pending
                supabase.from("lead_tasks")
                  .update({ status: "pending" } as any)
                  .eq("lead_id", id)
                  .eq("status", "superseded")
                  .then(() => {});
                toast(`Stage reverted to ${snapshot.stage}`);
              },
            },
          });
        }

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
      // Persist to DB then auto-score
      upsertLeadToDb(newLead).then(() => {
        supabase.functions.invoke("score-lead", {
          body: { record: { id: newLead.id, email: newLead.email, name: newLead.name, company: newLead.company, company_url: newLead.companyUrl, buyer_type: newLead.buyerType, source: newLead.source, message: newLead.message } },
        }).catch(err => console.error("Auto-score failed:", err));
      });
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
        // Log meeting added
        logActivity(leadId, "meeting_added", `Meeting added: ${meeting.title || meeting.date}`);
        // Persist to DB
        updateLeadInDb(leadId, { meetings: updated.meetings, lastContactDate: updated.lastContactDate });
        return updated;
      });
      return next;
    });
  }, []);

  // Pipeline v2: group by NORMALIZED stage so legacy "Meeting Held" deals
  // land in the "Discovery Completed" column without touching DB rows.
  const getLeadsByStage = useCallback(
    (stage: LeadStage) => leads.filter((l) => normalizeStage(l.stage) === normalizeStage(stage)),
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
      (l) => !["Closed Won", "Lost", "Went Dark"].includes(l.stage)
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
      closedLost: stageValues["Lost"].count,
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

  const archiveLead = useCallback((id: string, reason: string) => {
    const lead = leads.find(l => l.id === id);
    const leadName = lead?.name || id;
    // Remove from local state immediately
    setLeads(prev => prev.filter(l => l.id !== id));
    // Persist to DB
    supabase.from("leads").update({ archived_at: new Date().toISOString(), archive_reason: reason } as any).eq("id", id).then(({ error }) => {
      if (error) {
        console.error("Archive error:", error);
        toast.error("Failed to archive lead");
      }
    });
    toast(`Archived ${leadName}`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          supabase.from("leads").update({ archived_at: null, archive_reason: '' } as any).eq("id", id).then(({ error }) => {
            if (error) { toast.error("Failed to unarchive"); return; }
            // Re-fetch and add back
            supabase.from("leads").select("*").eq("id", id).single().then(({ data }) => {
              if (data) {
                const restored = rowToLead(data);
                setLeads(prev => [restored, ...prev]);
                toast.success(`${leadName} restored`);
              }
            });
          });
        },
      },
    });
  }, [leads]);

  return (
    <LeadContext.Provider value={{ leads, loading, unseenCount, clearUnseen, isLeadNew, markLeadSeen, updateLead, addLead, addMeeting, getMetrics, getLeadsByStage, searchLeads, archiveLead, refreshLeads }}>
      {children}
    </LeadContext.Provider>
  );
}

export function useLeads() {
  const ctx = useContext(LeadContext);
  if (!ctx) throw new Error("useLeads must be used within LeadProvider");
  return ctx;
}
