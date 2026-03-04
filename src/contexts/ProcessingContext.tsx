import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { Lead, Meeting, MeetingIntelligence } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ───

export interface LeadJobState {
  searching: boolean;
  pendingSuggestions: Array<{ field: string; label: string; value: string | number; evidence: string }>;
  leadId: string;
  leadName: string;
}

export interface FailedLead {
  name: string;
  error: string;
}

export interface ProcessedLead {
  name: string;
  status: "found" | "no_meetings" | "failed";
  meetingsCount?: number;
  error?: string;
}

export interface BulkJobState {
  phase: "idle" | "running" | "paused" | "done";
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  foundMeetings: number;
  noMeetings: number;
  currentLeadIndex: number;
  currentLeadName: string;
  progressMessage: string;
  bulkJobIds: string[];
  cancelled: boolean;
  paused: boolean;
  failedLeads: FailedLead[];
  processedLeads: ProcessedLead[];
}

interface ProcessingContextType {
  bulkJob: BulkJobState;
  leadJobs: Record<string, LeadJobState>;
  startBulkProcessing: () => void;
  cancelBulk: () => void;
  dismissBulk: () => void;
  pauseBulk: () => void;
  resumeBulk: () => void;
  startAutoFind: (lead: Lead) => void;
  acceptLeadSuggestion: (leadId: string, field: string, value: string | number) => void;
  dismissLeadSuggestion: (leadId: string, field: string) => void;
  acceptAllLeadSuggestions: (leadId: string) => void;
  dismissLeadJob: (leadId: string) => void;
}

const ProcessingContext = createContext<ProcessingContextType | null>(null);

const INITIAL_BULK: BulkJobState = {
  phase: "idle", totalJobs: 0, completedJobs: 0, failedJobs: 0, foundMeetings: 0, noMeetings: 0,
  currentLeadIndex: 0, currentLeadName: "", progressMessage: "", bulkJobIds: [], cancelled: false,
  paused: false, failedLeads: [], processedLeads: [],
};

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const { leads, updateLead } = useLeads();
  const [bulkJob, setBulkJob] = useState<BulkJobState>(INITIAL_BULK);
  const [leadJobs, setLeadJobs] = useState<Record<string, LeadJobState>>({});

  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  const updateLeadRef = useRef(updateLead);
  updateLeadRef.current = updateLead;
  const bulkJobRef = useRef(bulkJob);
  bulkJobRef.current = bulkJob;
  const appliedJobsRef = useRef(new Set<string>());
  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);
  const resumeResolverRef = useRef<(() => void) | null>(null);

  // ─── Stale job detection (>10 min old) ───

  const isStaleJob = useCallback((job: any): boolean => {
    const updatedAt = job.updated_at || job.created_at;
    if (!updatedAt) return false;
    const ageMs = Date.now() - new Date(updatedAt).getTime();
    return ageMs > 10 * 60 * 1000; // 10 minutes
  }, []);

  const markJobAsTimedOut = useCallback((jobId: string) => {
    (supabase.from("processing_jobs") as any)
      .update({ status: "failed", error: "Timed out — edge function did not complete", acknowledged: true })
      .eq("id", jobId)
      .then();
  }, []);

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

          // For bulk jobs during sequential processing, update the progress message in real-time
          if (job.job_type === "bulk" && job.status === "processing" && job.progress_message) {
            setBulkJob(prev => {
              if (prev.phase !== "running" && prev.phase !== "paused") return prev;
              return { ...prev, progressMessage: job.progress_message };
            });
          }

          if (job.status === "processing") {
            // Skip stale jobs — they timed out
            if (isStaleJob(job)) {
              markJobAsTimedOut(job.id);
              return;
            }
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
            toast.error(`Processing failed for ${job.lead_name}: ${job.error || "Unknown error"}`);
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

    // Hydrate unacknowledged jobs on mount
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
            // Check if stale before showing as active
            if (isStaleJob(job)) {
              markJobAsTimedOut(job.id);
              toast.error(`Processing timed out for ${job.lead_name}`);
            } else {
              setLeadJobs(prev => ({
                ...prev,
                [job.lead_id]: { searching: true, pendingSuggestions: [], leadId: job.lead_id, leadName: job.lead_name },
              }));
            }
          } else if (job.status === "failed") {
            toast.error(`Processing failed for ${job.lead_name}: ${job.error || "Unknown error"}`);
            (supabase.from("processing_jobs") as any).update({ acknowledged: true }).eq("id", job.id).then();
          }
        }
      }
    })();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyCompletedJob]);

  // ─── Wait for a single job to reach terminal state ───

  const waitForJobCompletion = useCallback((jobId: string): Promise<{ status: string; newMeetingsCount: number; error?: string }> => {
    return new Promise((resolve) => {
      const channelName = `job-wait-${jobId}`;
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "processing_jobs", filter: `id=eq.${jobId}` },
          (payload) => {
            const job = payload.new as any;
            if (job.status === "completed" || job.status === "failed") {
              supabase.removeChannel(channel);
              const meetingsCount = (job.new_meetings || []).length;
              resolve({ status: job.status, newMeetingsCount: meetingsCount, error: job.error || undefined });
            }
          }
        )
        .subscribe();

      // Safety timeout: 5 minutes
      setTimeout(() => {
        supabase.removeChannel(channel);
        resolve({ status: "failed", newMeetingsCount: 0, error: "Timed out after 5 minutes" });
      }, 5 * 60 * 1000);
    });
  }, []);

  // ─── Pause check helper ───

  const waitIfPaused = useCallback((): Promise<void> => {
    if (!pausedRef.current) return Promise.resolve();
    return new Promise((resolve) => {
      resumeResolverRef.current = resolve;
    });
  }, []);

  // ─── Bulk Processing: Strictly Sequential, One at a Time ───

  const startBulkProcessing = useCallback(() => {
    if (bulkJobRef.current.phase !== "idle" && bulkJobRef.current.phase !== "done") return;
    cancelledRef.current = false;
    pausedRef.current = false;

    const currentLeads = leadsRef.current;
    const total = currentLeads.length;

    if (total === 0) {
      toast.info("No leads to process.");
      return;
    }

    setBulkJob({
      phase: "running", totalJobs: total, completedJobs: 0, failedJobs: 0, foundMeetings: 0, noMeetings: 0,
      currentLeadIndex: 0, currentLeadName: currentLeads[0]?.name || "",
      progressMessage: `[1/${total}] Starting...`, bulkJobIds: [], cancelled: false,
      paused: false, failedLeads: [], processedLeads: [],
    });

    toast.info(`Starting sequential processing of ${total} leads...`);

    (async () => {
      let completedCount = 0;
      let failedCount = 0;
      let foundMeetingsTotal = 0;
      const failedLeadsList: FailedLead[] = [];

      for (let i = 0; i < currentLeads.length; i++) {
        // Check pause
        await waitIfPaused();

        if (cancelledRef.current) {
          toast.info("Bulk processing cancelled.");
          setBulkJob(prev => ({ ...prev, phase: "done", progressMessage: "Cancelled" }));
          return;
        }

        const lead = currentLeads[i];
        const label = `[${i + 1}/${total}]`;

        setBulkJob(prev => ({
          ...prev,
          currentLeadIndex: i,
          currentLeadName: lead.name,
          progressMessage: `${label} Searching for ${lead.name}...`,
        }));

        try {
          const existingMeetingIds = (lead.meetings || []).map(m => m.firefliesId).filter(Boolean);
          const existingMeetings = (lead.meetings || []).map(m => ({
            ...m,
            transcript: (m.transcript || "").substring(0, 3000),
          }));

          const leadPayload = {
            id: lead.id, name: lead.name, email: lead.email, company: lead.company,
            companyUrl: lead.companyUrl, role: lead.role, stage: lead.stage,
            priority: lead.priority, dealValue: lead.dealValue, serviceInterest: lead.serviceInterest,
            existingMeetingIds, existingMeetings,
          };

          const { data: jobRow, error: insertError } = await (supabase
            .from("processing_jobs") as any)
            .insert({
              lead_id: lead.id, lead_name: lead.name,
              job_type: "bulk", status: "queued", lead_data: leadPayload,
            })
            .select("id")
            .single();

          if (insertError || !jobRow) {
            const errMsg = insertError?.message || "Failed to create job";
            console.error(`Failed to create job for ${lead.name}:`, insertError);
            failedCount++;
            failedLeadsList.push({ name: lead.name, error: errMsg });
            setBulkJob(prev => ({
              ...prev, failedJobs: failedCount, failedLeads: [...failedLeadsList],
              processedLeads: [...prev.processedLeads, { name: lead.name, status: "failed", error: errMsg }],
            }));
            continue;
          }

          const completionPromise = waitForJobCompletion(jobRow.id);

          supabase.functions.invoke("run-lead-job", {
            body: { jobId: jobRow.id, lead: leadPayload },
          }).catch(async (e: any) => {
            console.error(`Edge function error for ${lead.name}:`, e);
            await (supabase.from("processing_jobs") as any)
              .update({ status: "failed", error: e.message || "Invocation failed" })
              .eq("id", jobRow.id);
          });

          const result = await completionPromise;

          let noMeetingsCount = 0;
          let processedEntry: ProcessedLead;
          if (result.status === "completed") {
            completedCount++;
            foundMeetingsTotal += result.newMeetingsCount;
            if (result.newMeetingsCount === 0) {
              noMeetingsCount = 1;
              processedEntry = { name: lead.name, status: "no_meetings" };
            } else {
              processedEntry = { name: lead.name, status: "found", meetingsCount: result.newMeetingsCount };
            }
          } else {
            failedCount++;
            const errMsg = result.error || "Unknown error";
            failedLeadsList.push({ name: lead.name, error: errMsg });
            processedEntry = { name: lead.name, status: "failed", error: errMsg };
          }

          setBulkJob(prev => ({
            ...prev,
            completedJobs: completedCount,
            failedJobs: failedCount,
            foundMeetings: foundMeetingsTotal,
            noMeetings: prev.noMeetings + noMeetingsCount,
            failedLeads: [...failedLeadsList],
            processedLeads: [...prev.processedLeads, processedEntry],
            progressMessage: `${label} ${lead.name}: ${result.status === "completed" ? (result.newMeetingsCount > 0 ? `Found ${result.newMeetingsCount} meeting(s)` : "No new meetings") : "Failed"}`,
          }));

          if (i < currentLeads.length - 1) {
            await new Promise(r => setTimeout(r, 1500));
          }

        } catch (e: any) {
          console.error(`Error processing ${lead.name}:`, e);
          failedCount++;
          const errMsg = e.message || "Unknown error";
          failedLeadsList.push({ name: lead.name, error: errMsg });
          setBulkJob(prev => ({
            ...prev, failedJobs: failedCount, failedLeads: [...failedLeadsList],
            processedLeads: [...prev.processedLeads, { name: lead.name, status: "failed", error: errMsg }],
          }));
        }
      }

      setBulkJob(prev => ({
        ...prev,
        phase: "done",
        progressMessage: `Complete — ${foundMeetingsTotal} meetings found across ${completedCount} leads`,
      }));
      toast.success(`Bulk processing complete: ${completedCount} processed, ${failedCount} failed, ${foundMeetingsTotal} meetings found`);
    })();
  }, [waitForJobCompletion, waitIfPaused]);

  const cancelBulk = useCallback(() => {
    cancelledRef.current = true;
    // If paused, resume to let the loop exit
    if (resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
    setBulkJob(prev => ({ ...prev, cancelled: true, progressMessage: "Cancelling..." }));
  }, []);

  const pauseBulk = useCallback(() => {
    pausedRef.current = true;
    setBulkJob(prev => ({ ...prev, paused: true, phase: "paused", progressMessage: `Paused — ${prev.progressMessage}` }));
  }, []);

  const resumeBulk = useCallback(() => {
    pausedRef.current = false;
    setBulkJob(prev => ({ ...prev, paused: false, phase: "running" }));
    if (resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
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
          id: lead.id, name: lead.name, email: lead.email, company: lead.company,
          companyUrl: lead.companyUrl, role: lead.role, stage: lead.stage,
          priority: lead.priority, dealValue: lead.dealValue, serviceInterest: lead.serviceInterest,
          existingMeetingIds, existingMeetings,
        };

        const { data: jobRow, error: insertError } = await (supabase
          .from("processing_jobs") as any)
          .insert({
            lead_id: lead.id, lead_name: lead.name,
            job_type: "individual", status: "queued", lead_data: leadPayload,
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
      startBulkProcessing, cancelBulk, dismissBulk, pauseBulk, resumeBulk,
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
