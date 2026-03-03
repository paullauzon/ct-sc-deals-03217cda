import { createContext, useContext, useState, useRef, useCallback, ReactNode } from "react";
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

function generateMeetingId(): string {
  return `mtg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const { leads, updateLead } = useLeads();
  const [bulkJob, setBulkJob] = useState<BulkJobState>({ phase: "idle", progress: null, results: [] });
  const [leadJobs, setLeadJobs] = useState<Record<string, LeadJobState>>({});
  const cancelRef = useRef({ current: false });

  // Use a ref to always have access to latest leads
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  // ─── Bulk Processing ───

  const startBulkProcessing = useCallback(() => {
    cancelRef.current = { current: false };
    setBulkJob({ phase: "running", progress: null, results: [] });

    // Run async — not awaited so it's truly background
    (async () => {
      const currentLeads = leadsRef.current;
      const liveResults: BulkLeadResult[] = [];

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

  // ─── Individual Lead Auto-Find ───

  const startAutoFind = useCallback((lead: Lead) => {
    setLeadJobs(prev => ({
      ...prev,
      [lead.id]: { searching: true, pendingSuggestions: [], leadId: lead.id, leadName: lead.name },
    }));

    (async () => {
      try {
        const genericDomains = new Set([
          "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
          "icloud.com", "mail.com", "protonmail.com", "live.com", "msn.com",
        ]);
        const searchDomains: string[] = [];
        if (lead.email) {
          const domain = lead.email.split("@")[1]?.toLowerCase();
          if (domain && !genericDomains.has(domain)) searchDomains.push(domain);
        }
        if (searchDomains.length === 0 && lead.companyUrl) {
          try {
            const urlDomain = new URL(lead.companyUrl.startsWith("http") ? lead.companyUrl : `https://${lead.companyUrl}`).hostname.replace(/^www\./, "").toLowerCase();
            if (urlDomain && !genericDomains.has(urlDomain)) searchDomains.push(urlDomain);
          } catch { /* skip */ }
        }

        const searchBody = {
          searchEmails: lead.email ? [lead.email] : [],
          searchNames: lead.name ? [lead.name] : [],
          searchDomains,
          searchCompanies: lead.company?.trim() ? [lead.company.trim()] : [],
          limit: 100,
          summarize: false,
        };

        const [ctResult, scResult] = await Promise.all([
          supabase.functions.invoke("fetch-fireflies", { body: { ...searchBody, brand: "Captarget" } }),
          supabase.functions.invoke("fetch-fireflies", { body: { ...searchBody, brand: "SourceCo" } }),
        ]);

        if (ctResult.error && scResult.error) throw ctResult.error;

        const ctMeetings = (ctResult.data?.meetings || []).map((m: any) => ({ ...m, sourceBrand: "Captarget" }));
        const scMeetings = (scResult.data?.meetings || []).map((m: any) => ({ ...m, sourceBrand: "SourceCo" }));

        const seenIds = new Set<string>();
        const foundMeetings: any[] = [];
        for (const m of [...ctMeetings, ...scMeetings]) {
          if (m.firefliesId && seenIds.has(m.firefliesId)) continue;
          if (m.firefliesId) seenIds.add(m.firefliesId);
          foundMeetings.push(m);
        }

        const currentLead = leadsRef.current.find(l => l.id === lead.id) || lead;
        const meetings = currentLead.meetings || [];
        const existingIds = new Set(meetings.map(m => m.firefliesId).filter(Boolean));
        const newMeetings = foundMeetings.filter((m: any) => !existingIds.has(m.firefliesId));

        if (newMeetings.length === 0) {
          toast.info(`No new meetings found for ${lead.name}`);
          setLeadJobs(prev => {
            const copy = { ...prev };
            delete copy[lead.id];
            return copy;
          });
          return;
        }

        const addedMeetings: Meeting[] = [];
        const collectedSuggestions: SuggestedLeadUpdates[] = [];

        for (const m of newMeetings) {
          const transcript = m.transcript || "";
          const allMeetings = [...meetings, ...addedMeetings].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );

          let summary = m.summary || "";
          let nextSteps = m.nextSteps || "";
          let intelligence: MeetingIntelligence | undefined;

          if (transcript.length > 20) {
            try {
              const { data: aiData, error: aiError } = await supabase.functions.invoke("process-meeting", {
                body: { transcript, priorMeetings: allMeetings },
              });
              if (!aiError && aiData) {
                summary = aiData.summary || summary;
                nextSteps = aiData.nextSteps || nextSteps;
                intelligence = aiData.intelligence || undefined;
                if (aiData.suggestedLeadUpdates) {
                  collectedSuggestions.push(aiData.suggestedLeadUpdates);
                }
              }
            } catch { /* fallback */ }
          }

          addedMeetings.push({
            id: generateMeetingId(),
            date: m.date || new Date().toISOString().split("T")[0],
            title: m.title || "Untitled Meeting",
            firefliesId: m.firefliesId,
            firefliesUrl: m.transcriptUrl || "",
            transcript,
            summary,
            nextSteps,
            addedAt: new Date().toISOString(),
            intelligence,
            sourceBrand: m.sourceBrand || undefined,
          });
        }

        const updatedMeetings = [...meetings, ...addedMeetings];
        const allDates = updatedMeetings.map(m => m.date).filter(Boolean).sort();
        const latestDate = allDates[allDates.length - 1] || "";
        const updates: Partial<Lead> = { meetings: updatedMeetings };
        if (latestDate && (!currentLead.lastContactDate || latestDate > currentLead.lastContactDate)) {
          updates.lastContactDate = latestDate;
        }
        const today = new Date().toISOString().split("T")[0];
        const allNextSteps = addedMeetings
          .flatMap(m => m.intelligence?.nextSteps || [])
          .filter(ns => ns.deadline && ns.deadline >= today)
          .map(ns => ns.deadline)
          .filter(Boolean)
          .sort();
        if (allNextSteps.length > 0 && (!currentLead.nextFollowUp || allNextSteps[0]! > today)) {
          updates.nextFollowUp = allNextSteps[0];
        }
        updateLead(lead.id, updates);
        toast.success(`Found ${addedMeetings.length} new meeting${addedMeetings.length !== 1 ? "s" : ""} for ${lead.name}`);

        // Process suggestions
        const mergedPending: Array<{ field: string; label: string; value: string | number; evidence: string }> = [];
        for (const suggestions of collectedSuggestions) {
          const { applied, pending } = processSuggestedUpdates(suggestions, lead.id, updateLead);
          if (applied.length > 0) {
            toast.success(`Auto-updated ${applied.length} field${applied.length !== 1 ? "s" : ""} for ${lead.name}`, {
              description: applied.join(" · "),
              duration: 6000,
            });
          }
          mergedPending.push(...pending);
        }

        // Deduplicate pending
        const seen = new Set<string>();
        const uniquePending = mergedPending.filter(p => {
          if (seen.has(p.field)) return false;
          seen.add(p.field);
          return true;
        });

        // Synthesize deal intelligence
        const meetingsWithIntel = updatedMeetings.filter(m => m.intelligence);
        if (meetingsWithIntel.length > 0) {
          try {
            const dealIntel = await synthesizeDealIntelligence(updatedMeetings, currentLead);
            if (dealIntel) {
              updateLead(lead.id, { dealIntelligence: dealIntel });
              toast.success(`Deal intelligence synthesized for ${lead.name}`);
            }
          } catch (e) {
            console.error("Deal intelligence synthesis error:", e);
            toast.error(`Failed to synthesize deal intelligence for ${lead.name}`);
          }
        }

        if (uniquePending.length > 0) {
          setLeadJobs(prev => ({
            ...prev,
            [lead.id]: { searching: false, pendingSuggestions: uniquePending, leadId: lead.id, leadName: lead.name },
          }));
          toast.info(`${lead.name}: ${uniquePending.length} suggestion${uniquePending.length !== 1 ? "s" : ""} to review`);
        } else {
          setLeadJobs(prev => {
            const copy = { ...prev };
            delete copy[lead.id];
            return copy;
          });
        }
      } catch (e: any) {
        console.error("Auto-find error:", e);
        toast.error(`Auto-find failed for ${lead.name}: ${e.message || "Unknown error"}`);
        setLeadJobs(prev => {
          const copy = { ...prev };
          delete copy[lead.id];
          return copy;
        });
      }
    })();
  }, [updateLead]);

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
