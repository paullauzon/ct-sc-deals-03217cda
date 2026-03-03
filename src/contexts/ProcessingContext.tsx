import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { Lead, Meeting, MeetingIntelligence } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FirefliesTranscript,
} from "@/lib/bulkProcessing";

// ─── Types ───

export interface LeadJobState {
  searching: boolean;
  pendingSuggestions: Array<{ field: string; label: string; value: string | number; evidence: string }>;
  leadId: string;
  leadName: string;
}

export interface BulkJobState {
  phase: "idle" | "fetching" | "matching" | "running" | "done";
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  progressMessage: string;
  bulkJobIds: string[];
}

interface ProcessingContextType {
  bulkJob: BulkJobState;
  leadJobs: Record<string, LeadJobState>;
  startBulkProcessing: () => void;
  cancelBulk: () => void;
  dismissBulk: () => void;
  startAutoFind: (lead: Lead) => void;
  acceptLeadSuggestion: (leadId: string, field: string, value: string | number) => void;
  dismissLeadSuggestion: (leadId: string, field: string) => void;
  acceptAllLeadSuggestions: (leadId: string) => void;
  dismissLeadJob: (leadId: string) => void;
}

const ProcessingContext = createContext<ProcessingContextType | null>(null);

const INITIAL_BULK: BulkJobState = { phase: "idle", totalJobs: 0, completedJobs: 0, failedJobs: 0, progressMessage: "", bulkJobIds: [] };

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const { leads, updateLead } = useLeads();
  const [bulkJob, setBulkJob] = useState<BulkJobState>(INITIAL_BULK);
  const [leadJobs, setLeadJobs] = useState<Record<string, LeadJobState>>({});

  // Refs for stable access in callbacks
  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  const updateLeadRef = useRef(updateLead);
  updateLeadRef.current = updateLead;
  const bulkJobRef = useRef(bulkJob);
  bulkJobRef.current = bulkJob;

  // Track applied job IDs to prevent double-applying
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

      const allDates = updatedMeetings.map(m => m.date).filter(Boolean).sort();
      const latestDate = allDates[allDates.length - 1] || "";
      if (latestDate && (!currentLead.lastContactDate || latestDate > currentLead.lastContactDate)) {
        updates.lastContactDate = latestDate;
      }

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

    // Merge pending suggestions into leadJobs for inline display
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

    // Mark as acknowledged
    (supabase.from("processing_jobs") as any).update({ acknowledged: true }).eq("id", job.id).then();
  }, []);

  // ─── Track bulk job completion ───

  const handleBulkJobUpdate = useCallback((jobId: string, status: string) => {
    setBulkJob(prev => {
      if (!prev.bulkJobIds.includes(jobId)) return prev;
      if (status === "completed" || status === "failed") {
        const newCompleted = status === "completed" ? prev.completedJobs + 1 : prev.completedJobs;
        const newFailed = status === "failed" ? prev.failedJobs + 1 : prev.failedJobs;
        const totalDone = newCompleted + newFailed;
        return {
          ...prev,
          completedJobs: newCompleted,
          failedJobs: newFailed,
          progressMessage: `${totalDone}/${prev.totalJobs} leads processed`,
          phase: totalDone >= prev.totalJobs ? "done" : prev.phase,
        };
      }
      return prev;
    });
  }, []);

  // ─── Realtime subscription + hydration ───

  useEffect(() => {
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
            if (job.job_type === "bulk") {
              handleBulkJobUpdate(job.id, "completed");
            }
          }

          if (job.status === "failed") {
            toast.error(`Processing failed for ${job.lead_name}: ${job.error || "Unknown error"}`);
            setLeadJobs(prev => {
              const copy = { ...prev };
              delete copy[job.lead_id];
              return copy;
            });
            (supabase.from("processing_jobs") as any).update({ acknowledged: true }).eq("id", job.id).then();
            if (job.job_type === "bulk") {
              handleBulkJobUpdate(job.id, "failed");
            }
          }
        }
      )
      .subscribe();

    // Hydrate unacknowledged jobs on mount
    (async () => {
      const { data: activeJobs } = await (supabase
        .from("processing_jobs") as any)
        .select("*")
        .eq("acknowledged", false)
        .order("created_at", { ascending: true });

      if (activeJobs && activeJobs.length > 0) {
        // Check for bulk jobs that need re-invocation
        const bulkJobs = activeJobs.filter((j: any) => j.job_type === "bulk");
        if (bulkJobs.length > 0) {
          const queuedBulk = bulkJobs.filter((j: any) => j.status === "queued");
          const completedBulk = bulkJobs.filter((j: any) => j.status === "completed");
          const failedBulk = bulkJobs.filter((j: any) => j.status === "failed");
          const processingBulk = bulkJobs.filter((j: any) => j.status === "processing");

          // Re-invoke queued bulk jobs
          for (const job of queuedBulk) {
            setLeadJobs(prev => ({
              ...prev,
              [job.lead_id]: { searching: true, pendingSuggestions: [], leadId: job.lead_id, leadName: job.lead_name },
            }));
            supabase.functions.invoke("run-lead-job", {
              body: { jobId: job.id, lead: job.lead_data },
            }).catch(e => console.error("Re-invoke failed:", e));
          }

          // Show processing state for in-progress bulk jobs
          for (const job of processingBulk) {
            setLeadJobs(prev => ({
              ...prev,
              [job.lead_id]: { searching: true, pendingSuggestions: [], leadId: job.lead_id, leadName: job.lead_name },
            }));
          }

          // Apply completed bulk jobs
          for (const job of completedBulk) {
            applyCompletedJob(job);
          }

          // Acknowledge failed bulk jobs
          for (const job of failedBulk) {
            toast.error(`Processing failed for ${job.lead_name}: ${job.error || "Unknown error"}`);
            (supabase.from("processing_jobs") as any).update({ acknowledged: true }).eq("id", job.id).then();
          }

          const stillRunning = queuedBulk.length + processingBulk.length;
          if (stillRunning > 0) {
            setBulkJob({
              phase: "running",
              totalJobs: bulkJobs.length,
              completedJobs: completedBulk.length,
              failedJobs: failedBulk.length,
              progressMessage: `${completedBulk.length + failedBulk.length}/${bulkJobs.length} leads processed`,
              bulkJobIds: bulkJobs.map((j: any) => j.id),
            });
          }
        }

        // Handle individual jobs
        for (const job of activeJobs.filter((j: any) => j.job_type !== "bulk")) {
          if (job.status === "completed") {
            applyCompletedJob(job);
          } else if (job.status === "queued" || job.status === "processing") {
            setLeadJobs(prev => ({
              ...prev,
              [job.lead_id]: { searching: true, pendingSuggestions: [], leadId: job.lead_id, leadName: job.lead_name },
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
  }, [applyCompletedJob, handleBulkJobUpdate]);

  // ─── Bulk Processing (backend-powered) ───

  const startBulkProcessing = useCallback(() => {
    if (bulkJobRef.current.phase !== "idle" && bulkJobRef.current.phase !== "done") return;

    setBulkJob({ phase: "running", totalJobs: 0, completedJobs: 0, failedJobs: 0, progressMessage: "Creating jobs for all leads...", bulkJobIds: [] });

    (async () => {
      try {
        const currentLeads = leadsRef.current;

        // Create a run-lead-job for every lead — each job fetches its own transcripts via targeted search
        const jobQueue: Array<{ jobId: string; leadId: string; leadName: string; leadPayload: any }> = [];

        for (const lead of currentLeads) {
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

          const { data: jobRow, error: insertError } = await (supabase
            .from("processing_jobs") as any)
            .insert({
              lead_id: lead.id,
              lead_name: lead.name,
              job_type: "bulk",
              status: "queued",
              lead_data: leadPayload,
            })
            .select("id")
            .single();

          if (insertError || !jobRow) {
            console.error(`Failed to create bulk job for ${lead.name}:`, insertError);
            continue;
          }

          jobQueue.push({ jobId: jobRow.id, leadId: lead.id, leadName: lead.name, leadPayload });
        }

        if (jobQueue.length === 0) {
          toast.info("No leads to process.");
          setBulkJob(INITIAL_BULK);
          return;
        }

        const jobIds = jobQueue.map(j => j.jobId);

        setBulkJob({
          phase: "running",
          totalJobs: jobIds.length,
          completedJobs: 0,
          failedJobs: 0,
          progressMessage: `0/${jobIds.length} leads processed`,
          bulkJobIds: jobIds,
        });

        toast.info(`Started processing ${jobIds.length} leads in background`);

        // Sequential invocation with concurrency limit of 2
        const CONCURRENCY = 2;
        const invokeJob = async (item: typeof jobQueue[0]) => {
          setLeadJobs(prev => ({
            ...prev,
            [item.leadId]: { searching: true, pendingSuggestions: [], leadId: item.leadId, leadName: item.leadName },
          }));
          try {
            const { error } = await supabase.functions.invoke("run-lead-job", {
              body: { jobId: item.jobId, lead: item.leadPayload },
            });
            if (error) {
              console.error(`Edge function error for ${item.leadName}:`, error);
              await (supabase.from("processing_jobs") as any)
                .update({ status: "failed", error: error.message || "Invocation failed" })
                .eq("id", item.jobId);
            }
          } catch (e: any) {
            console.error(`Failed to invoke run-lead-job for ${item.leadName}:`, e);
            await (supabase.from("processing_jobs") as any)
              .update({ status: "failed", error: e.message || "Invocation failed" })
              .eq("id", item.jobId);
          }
        };

        // Process queue with concurrency limit
        for (let i = 0; i < jobQueue.length; i += CONCURRENCY) {
          const batch = jobQueue.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map(invokeJob));
        }
      } catch (e: any) {
        console.error("Bulk processing setup error:", e);
        toast.error(`Bulk processing failed: ${e.message || "Unknown error"}`);
        setBulkJob(INITIAL_BULK);
      }
    })();
  }, []);

  const cancelBulk = useCallback(() => {
    setBulkJob(INITIAL_BULK);
  }, []);

  const dismissBulk = useCallback(() => {
    setBulkJob(INITIAL_BULK);
  }, []);

  // ─── Individual Lead Auto-Find (backend-powered) ───

  const startAutoFind = useCallback((lead: Lead) => {
    setLeadJobs(prev => ({
      ...prev,
      [lead.id]: { searching: true, pendingSuggestions: [], leadId: lead.id, leadName: lead.name },
    }));

    (async () => {
      try {
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

        supabase.functions.invoke("run-lead-job", {
          body: { jobId: jobRow.id, lead: leadPayload },
        }).catch((e) => {
          console.error("Edge function invocation error:", e);
        });
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
