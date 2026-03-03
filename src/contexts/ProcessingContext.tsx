import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { Lead, Meeting, MeetingIntelligence } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  runBulkProcessing,
  BulkLeadResult,
  BulkProgressUpdate,
  SuggestedLeadUpdates,
  processSuggestedUpdates,
  synthesizeDealIntelligence,
} from "@/lib/bulkProcessing";

// ─── Types ───

export interface LeadJobState {
  searching: boolean;
  pendingSuggestions: Array<{ field: string; label: string; value: string | number; evidence: string }>;
  leadId: string;
  leadName: string;
}

export interface BulkJobState {
  phase: "idle" | "running" | "review" | "done";
  progress: BulkProgressUpdate | null;
  results: BulkLeadResult[];
}

interface ProcessingContextType {
  bulkJob: BulkJobState;
  leadJobs: Record<string, LeadJobState>;
  startBulkProcessing: () => void;
  cancelBulk: () => void;
  dismissBulk: () => void;
  acceptBulkSuggestion: (leadId: string, field: string, value: string | number) => void;
  dismissBulkSuggestion: (leadId: string, field: string) => void;
  acceptAllBulkSuggestions: () => void;
  skipAllBulkSuggestions: () => void;
  startAutoFind: (lead: Lead) => void;
  acceptLeadSuggestion: (leadId: string, field: string, value: string | number) => void;
  dismissLeadSuggestion: (leadId: string, field: string) => void;
  acceptAllLeadSuggestions: (leadId: string) => void;
  dismissLeadJob: (leadId: string) => void;
}

const ProcessingContext = createContext<ProcessingContextType | null>(null);

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const { leads, updateLead } = useLeads();
  const [bulkJob, setBulkJob] = useState<BulkJobState>({ phase: "idle", progress: null, results: [] });
  const [leadJobs, setLeadJobs] = useState<Record<string, LeadJobState>>({});
  const cancelRef = useRef({ current: false });

  // Use a ref to always have access to latest leads
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  // Ref to latest updateLead to avoid stale closures in realtime handler
  const updateLeadRef = useRef(updateLead);
  updateLeadRef.current = updateLead;

  // Track which job IDs we've already applied (to prevent double-applying on realtime re-delivery)
  const appliedJobsRef = useRef(new Set<string>());

  // ─── Apply completed job results to lead ───

  const applyCompletedJob = useCallback((job: any) => {
    if (appliedJobsRef.current.has(job.id)) return;
    appliedJobsRef.current.add(job.id);

    const currentLead = leadsRef.current.find(l => l.id === job.lead_id);
    if (!currentLead) return;

    const newMeetings: Meeting[] = job.new_meetings || [];
    const appliedUpdates: Record<string, any> = job.applied_updates || {};
    const pendingSuggestions: Array<{ field: string; label: string; value: string | number; evidence: string }> = job.pending_suggestions || [];
    const dealIntelligence = job.deal_intelligence;

    if (newMeetings.length > 0) {
      const updatedMeetings = [...(currentLead.meetings || []), ...newMeetings];
      const updates: Partial<Lead> = { meetings: updatedMeetings, ...appliedUpdates };

      // Update lastContactDate
      const allDates = updatedMeetings.map(m => m.date).filter(Boolean).sort();
      const latestDate = allDates[allDates.length - 1] || "";
      if (latestDate && (!currentLead.lastContactDate || latestDate > currentLead.lastContactDate)) {
        updates.lastContactDate = latestDate;
      }

      // Update nextFollowUp from intelligence
      const today = new Date().toISOString().split("T")[0];
      const nextStepDates = newMeetings
        .flatMap(m => (m.intelligence as MeetingIntelligence)?.nextSteps || [])
        .filter(ns => ns.deadline && ns.deadline >= today)
        .map(ns => ns.deadline)
        .sort();
      if (nextStepDates.length > 0 && (!currentLead.nextFollowUp || nextStepDates[0]! > today)) {
        updates.nextFollowUp = nextStepDates[0];
      }

      if (dealIntelligence) {
        updates.dealIntelligence = dealIntelligence;
      }

      updateLeadRef.current(job.lead_id, updates);

      if (Object.keys(appliedUpdates).length > 0) {
        const appliedFields: string[] = job.applied_fields || [];
        if (appliedFields.length > 0) {
          toast.success(`Auto-updated ${appliedFields.length} field(s) for ${job.lead_name}`, {
            description: appliedFields.join(" · "),
            duration: 6000,
          });
        }
      }

      toast.success(`Found ${newMeetings.length} new meeting${newMeetings.length !== 1 ? "s" : ""} for ${job.lead_name}`);
    } else {
      toast.info(`No new meetings found for ${job.lead_name}`);
    }

    if (pendingSuggestions.length > 0) {
      setLeadJobs(prev => ({
        ...prev,
        [job.lead_id]: {
          searching: false,
          pendingSuggestions,
          leadId: job.lead_id,
          leadName: job.lead_name,
        },
      }));
      toast.info(`${job.lead_name}: ${pendingSuggestions.length} suggestion${pendingSuggestions.length !== 1 ? "s" : ""} to review`);
    } else {
      setLeadJobs(prev => {
        const copy = { ...prev };
        delete copy[job.lead_id];
        return copy;
      });
    }

    // Mark as acknowledged in DB
    (supabase.from("processing_jobs") as any).update({ acknowledged: true }).eq("id", job.id).then();
  }, []);

  // ─── Realtime subscription + hydration on mount ───

  useEffect(() => {
    // Subscribe to processing_jobs changes
    const channel = supabase
      .channel("processing-jobs-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "processing_jobs" },
        (payload) => {
          const job = payload.new as any;
          if (job.acknowledged) return;

          if (job.status === "processing") {
            setLeadJobs(prev => ({
              ...prev,
              [job.lead_id]: {
                searching: true,
                pendingSuggestions: [],
                leadId: job.lead_id,
                leadName: job.lead_name,
              },
            }));
          }

          if (job.status === "completed") {
            applyCompletedJob(job);
          }

          if (job.status === "failed") {
            toast.error(`Auto-find failed for ${job.lead_name}: ${job.error || "Unknown error"}`);
            setLeadJobs(prev => {
              const copy = { ...prev };
              delete copy[job.lead_id];
              return copy;
            });
            (supabase.from("processing_jobs") as any).update({ acknowledged: true }).eq("id", job.id).then();
          }
        }
      )
      .subscribe();

    // Hydrate from any unacknowledged jobs on mount (survives tab close!)
    (async () => {
      const { data: activeJobs } = await (supabase
        .from("processing_jobs") as any)
        .select("*")
        .eq("acknowledged", false)
        .order("created_at", { ascending: true });

      if (activeJobs && activeJobs.length > 0) {
        for (const job of activeJobs) {
          if (job.status === "completed") {
            applyCompletedJob(job);
          } else if (job.status === "queued" || job.status === "processing") {
            setLeadJobs(prev => ({
              ...prev,
              [job.lead_id]: {
                searching: true,
                pendingSuggestions: [],
                leadId: job.lead_id,
                leadName: job.lead_name,
              },
            }));
          } else if (job.status === "failed") {
            toast.error(`Auto-find failed for ${job.lead_name}: ${job.error || "Unknown error"}`);
            (supabase.from("processing_jobs") as any).update({ acknowledged: true }).eq("id", job.id).then();
          }
        }
      }
    })();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyCompletedJob]);

  // ─── Bulk Processing (remains client-side) ───

  const startBulkProcessing = useCallback(() => {
    cancelRef.current = { current: false };
    setBulkJob({ phase: "running", progress: null, results: [] });

    (async () => {
      const currentLeads = leadsRef.current;

      const finalResults = await runBulkProcessing(
        currentLeads,
        updateLead,
        (update) => setBulkJob(prev => ({ ...prev, progress: update })),
        cancelRef.current
      );

      const hasPending = finalResults.some(r => r.pendingSuggestions.length > 0);
      setBulkJob({ phase: hasPending ? "review" : "done", progress: null, results: finalResults });

      const totalMeetings = finalResults.reduce((s, r) => s + r.newMeetingsCount, 0);
      const totalApplied = finalResults.reduce((s, r) => s + r.appliedFields.length, 0);

      if (hasPending) {
        toast.info("Bulk processing complete — suggestions need review", { duration: 10000 });
      } else if (totalMeetings > 0) {
        toast.success(`Bulk processing complete`, {
          description: `${totalMeetings} meetings added. ${totalApplied} fields auto-updated.`,
          duration: 8000,
        });
      } else {
        toast.info("Bulk processing complete — no new meetings found.");
      }
    })();
  }, [updateLead]);

  const cancelBulk = useCallback(() => {
    cancelRef.current.current = true;
  }, []);

  const dismissBulk = useCallback(() => {
    if (bulkJob.phase === "running") return;
    setBulkJob({ phase: "idle", progress: null, results: [] });
  }, [bulkJob.phase]);

  const acceptBulkSuggestion = useCallback((leadId: string, field: string, value: string | number) => {
    updateLead(leadId, { [field]: value });
    setBulkJob(prev => ({
      ...prev,
      results: prev.results.map(r => {
        if (r.leadId !== leadId) return r;
        return {
          ...r,
          pendingSuggestions: r.pendingSuggestions.filter(s => s.field !== field),
          appliedFields: [...r.appliedFields, `${field}: ${value}`],
        };
      }),
    }));
    toast.success(`Updated ${field}`);
  }, [updateLead]);

  const dismissBulkSuggestion = useCallback((leadId: string, field: string) => {
    setBulkJob(prev => ({
      ...prev,
      results: prev.results.map(r => {
        if (r.leadId !== leadId) return r;
        return { ...r, pendingSuggestions: r.pendingSuggestions.filter(s => s.field !== field) };
      }),
    }));
  }, []);

  const acceptAllBulkSuggestions = useCallback(() => {
    for (const r of bulkJob.results) {
      for (const s of r.pendingSuggestions) {
        updateLead(r.leadId, { [s.field]: s.value });
      }
    }
    setBulkJob(prev => ({
      ...prev,
      phase: "done",
      results: prev.results.map(r => ({
        ...r,
        appliedFields: [...r.appliedFields, ...r.pendingSuggestions.map(s => `${s.label}: ${s.value}`)],
        pendingSuggestions: [],
      })),
    }));
    toast.success("Applied all suggestions");
  }, [bulkJob.results, updateLead]);

  const skipAllBulkSuggestions = useCallback(() => {
    setBulkJob(prev => ({ ...prev, phase: "done" }));
  }, []);

  // ─── Individual Lead Auto-Find (now backend-powered) ───

  const startAutoFind = useCallback((lead: Lead) => {
    // Show searching state immediately
    setLeadJobs(prev => ({
      ...prev,
      [lead.id]: { searching: true, pendingSuggestions: [], leadId: lead.id, leadName: lead.name },
    }));

    (async () => {
      try {
        // Prepare lead data for the backend (trim transcripts to reduce payload)
        const existingMeetingIds = (lead.meetings || []).map(m => m.firefliesId).filter(Boolean);
        const existingMeetings = (lead.meetings || []).map(m => ({
          ...m,
          transcript: (m.transcript || "").substring(0, 3000),
        }));

        const leadPayload = {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          company: lead.company,
          companyUrl: lead.companyUrl,
          role: lead.role,
          stage: lead.stage,
          priority: lead.priority,
          dealValue: lead.dealValue,
          serviceInterest: lead.serviceInterest,
          existingMeetingIds,
          existingMeetings,
        };

        // Create job row in DB
        const { data: jobRow, error: insertError } = await (supabase
          .from("processing_jobs") as any)
          .insert({
            lead_id: lead.id,
            lead_name: lead.name,
            job_type: "individual",
            status: "queued",
            lead_data: leadPayload,
          })
          .select("id")
          .single();

        if (insertError || !jobRow) {
          throw new Error(`Failed to create job: ${insertError?.message || "Unknown"}`);
        }

        // Fire-and-forget call to edge function
        supabase.functions.invoke("run-lead-job", {
          body: { jobId: jobRow.id, lead: leadPayload },
        }).catch((e) => {
          console.error("Edge function invocation error:", e);
          // The edge function itself will update the job row on failure
        });

        // Results will arrive via realtime subscription — no need to await
      } catch (e: any) {
        console.error("Auto-find setup error:", e);
        toast.error(`Auto-find failed for ${lead.name}: ${e.message || "Unknown error"}`);
        setLeadJobs(prev => {
          const copy = { ...prev };
          delete copy[lead.id];
          return copy;
        });
      }
    })();
  }, []);

  // ─── Lead Suggestion Handlers ───

  const acceptLeadSuggestion = useCallback((leadId: string, field: string, value: string | number) => {
    updateLead(leadId, { [field]: value });
    setLeadJobs(prev => {
      const job = prev[leadId];
      if (!job) return prev;
      const remaining = job.pendingSuggestions.filter(s => s.field !== field);
      if (remaining.length === 0) {
        const copy = { ...prev };
        delete copy[leadId];
        return copy;
      }
      return { ...prev, [leadId]: { ...job, pendingSuggestions: remaining } };
    });
    toast.success(`Updated ${field}`);
  }, [updateLead]);

  const dismissLeadSuggestion = useCallback((leadId: string, field: string) => {
    setLeadJobs(prev => {
      const job = prev[leadId];
      if (!job) return prev;
      const remaining = job.pendingSuggestions.filter(s => s.field !== field);
      if (remaining.length === 0) {
        const copy = { ...prev };
        delete copy[leadId];
        return copy;
      }
      return { ...prev, [leadId]: { ...job, pendingSuggestions: remaining } };
    });
  }, []);

  const acceptAllLeadSuggestions = useCallback((leadId: string) => {
    const job = leadJobs[leadId];
    if (!job) return;
    for (const s of job.pendingSuggestions) {
      updateLead(leadId, { [s.field]: s.value });
    }
    setLeadJobs(prev => {
      const copy = { ...prev };
      delete copy[leadId];
      return copy;
    });
    toast.success("Applied all suggestions");
  }, [leadJobs, updateLead]);

  const dismissLeadJob = useCallback((leadId: string) => {
    setLeadJobs(prev => {
      const copy = { ...prev };
      delete copy[leadId];
      return copy;
    });
  }, []);

  return (
    <ProcessingContext.Provider value={{
      bulkJob, leadJobs,
      startBulkProcessing, cancelBulk, dismissBulk,
      acceptBulkSuggestion, dismissBulkSuggestion, acceptAllBulkSuggestions, skipAllBulkSuggestions,
      startAutoFind,
      acceptLeadSuggestion, dismissLeadSuggestion, acceptAllLeadSuggestions, dismissLeadJob,
    }}>
      {children}
    </ProcessingContext.Provider>
  );
}

export function useProcessing() {
  const ctx = useContext(ProcessingContext);
  if (!ctx) throw new Error("useProcessing must be used within ProcessingProvider");
  return ctx;
}
