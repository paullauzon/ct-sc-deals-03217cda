import { Lead, Meeting, MeetingIntelligence } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───

export interface SuggestedUpdate {
  value: string | number;
  confidence: "Certain" | "Likely" | "Possible";
  evidence: string;
}

export interface SuggestedLeadUpdates {
  stage?: SuggestedUpdate;
  meetingOutcome?: SuggestedUpdate;
  meetingDate?: SuggestedUpdate;
  nextFollowUp?: SuggestedUpdate;
  priority?: SuggestedUpdate;
  forecastCategory?: SuggestedUpdate;
  icpFit?: SuggestedUpdate;
  serviceInterest?: SuggestedUpdate;
  dealValue?: SuggestedUpdate;
  assignedTo?: SuggestedUpdate;
}

export interface BulkLeadResult {
  leadId: string;
  leadName: string;
  newMeetingsCount: number;
  appliedFields: string[];
  pendingSuggestions: Array<{ field: string; label: string; value: string | number; evidence: string }>;
  error?: string;
}

export interface BulkProgressUpdate {
  phase: "fetching" | "matching" | "processing" | "done" | "error";
  current: number;
  total: number;
  currentLeadName?: string;
  message: string;
}

export interface FirefliesTranscript {
  firefliesId: string;
  title: string;
  date: string;
  duration: number;
  attendees: string[];
  attendeeEmails: string[];
  transcriptUrl: string;
  transcript: string;
  summary: string;
  nextSteps: string;
  sourceBrand: "Captarget" | "SourceCo";
}

const FIELD_LABELS: Record<string, string> = {
  stage: "Pipeline Stage",
  meetingOutcome: "Meeting Outcome",
  meetingDate: "Meeting Date",
  nextFollowUp: "Next Follow-Up",
  priority: "Priority",
  forecastCategory: "Forecast Category",
  icpFit: "ICP Fit",
  serviceInterest: "Service Interest",
  dealValue: "Deal Value",
  assignedTo: "Assigned To",
};

const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "live.com", "msn.com",
  "me.com", "mac.com", "googlemail.com", "ymail.com",
]);

// ─── Client-side matching ───

function extractDomainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.substring(at + 1).toLowerCase();
  return GENERIC_DOMAINS.has(domain) ? null : domain;
}

function extractDomainFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Match a Fireflies transcript to leads based on email, domain, name, company */
export function matchTranscriptToLeads(
  transcript: FirefliesTranscript,
  leads: Lead[]
): Lead[] {
  const matched: Lead[] = [];
  const allEmailFields = transcript.attendeeEmails.map(e => e.toLowerCase());
  const titleLower = transcript.title.toLowerCase();

  for (const lead of leads) {
    // Signal 1: Direct email match
    if (lead.email) {
      const leadEmail = lead.email.toLowerCase();
      if (allEmailFields.some(f => f.includes(leadEmail))) {
        matched.push(lead);
        continue;
      }
    }

    // Signal 2: Domain match
    const leadDomain = extractDomainFromEmail(lead.email) || extractDomainFromUrl(lead.companyUrl || "");
    if (leadDomain) {
      const hasDomainMatch = allEmailFields.some(f => {
        const d = f.includes("@") ? f.split("@")[1] : null;
        return d === leadDomain;
      });
      if (hasDomainMatch) {
        matched.push(lead);
        continue;
      }
    }

    // Signal 3: Full name match in title
    if (lead.name && lead.name.length > 3) {
      const nameParts = lead.name.toLowerCase().split(/\s+/).filter(p => p.length >= 2);
      if (nameParts.length >= 2 && nameParts.every(part => titleLower.includes(part))) {
        matched.push(lead);
        continue;
      }
    }
  }

  return matched;
}

// ─── Processing helpers ───

export function processSuggestedUpdates(
  suggestions: SuggestedLeadUpdates | null,
  leadId: string,
  updateLead: (id: string, updates: Partial<Lead>) => void
): { applied: string[]; pending: Array<{ field: string; label: string; value: string | number; evidence: string }> } {
  if (!suggestions) return { applied: [], pending: [] };

  const certainUpdates: Partial<Lead> = {};
  const applied: string[] = [];
  const pending: Array<{ field: string; label: string; value: string | number; evidence: string }> = [];

  for (const [field, suggestion] of Object.entries(suggestions)) {
    if (!suggestion || !suggestion.value) continue;

    if (suggestion.confidence === "Certain") {
      (certainUpdates as any)[field] = suggestion.value;
      applied.push(`${FIELD_LABELS[field] || field}: ${suggestion.value}`);
    } else if (suggestion.confidence === "Likely") {
      pending.push({
        field,
        label: FIELD_LABELS[field] || field,
        value: suggestion.value,
        evidence: suggestion.evidence,
      });
    }
  }

  if (Object.keys(certainUpdates).length > 0) {
    updateLead(leadId, certainUpdates);
  }

  return { applied, pending };
}

/** Fetch all transcripts from a single Fireflies brand account */
export async function fetchAllTranscripts(brand: "Captarget" | "SourceCo"): Promise<FirefliesTranscript[]> {
  const { data, error } = await supabase.functions.invoke("fetch-fireflies", {
    body: { brand, limit: 1000, summarize: false },
  });
  if (error) throw error;
  return ((data?.meetings || []) as any[]).map((m: any) => ({
    firefliesId: m.firefliesId,
    title: m.title || "Untitled",
    date: m.date || "",
    duration: m.duration || 0,
    attendees: m.attendees || [],
    attendeeEmails: m.attendeeEmails || [],
    transcriptUrl: m.transcriptUrl || "",
    transcript: m.transcript || "",
    summary: m.summary || "",
    nextSteps: m.nextSteps || "",
    sourceBrand: brand,
  }));
}

/** Process a single meeting transcript through the AI pipeline */
export async function processTranscript(
  transcript: string,
  priorMeetings: Meeting[]
): Promise<{
  summary: string;
  nextSteps: string;
  intelligence?: MeetingIntelligence;
  suggestedLeadUpdates?: SuggestedLeadUpdates;
}> {
  const { data, error } = await supabase.functions.invoke("process-meeting", {
    body: { transcript, priorMeetings },
  });
  if (error) throw error;
  return {
    summary: data?.summary || "",
    nextSteps: data?.nextSteps || "",
    intelligence: data?.intelligence || undefined,
    suggestedLeadUpdates: data?.suggestedLeadUpdates || undefined,
  };
}

/** Synthesize deal intelligence across all meetings for a lead */
export async function synthesizeDealIntelligence(
  meetings: Meeting[],
  lead: Pick<Lead, "name" | "company" | "role" | "stage" | "priority" | "dealValue" | "serviceInterest">
) {
  const sorted = [...meetings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const { data, error } = await supabase.functions.invoke("synthesize-deal-intelligence", {
    body: {
      meetings: sorted,
      leadFields: {
        name: lead.name,
        company: lead.company,
        role: lead.role,
        stage: lead.stage,
        priority: lead.priority,
        dealValue: lead.dealValue,
        serviceInterest: lead.serviceInterest,
      },
    },
  });
  if (error) throw error;
  return data?.dealIntelligence || null;
}

function generateMeetingId(): string {
  return `mtg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// ─── Main bulk processor ───

export async function runBulkProcessing(
  leads: Lead[],
  updateLead: (id: string, updates: Partial<Lead>) => void,
  onProgress: (update: BulkProgressUpdate) => void,
  cancelRef: { current: boolean }
): Promise<BulkLeadResult[]> {
  const results: BulkLeadResult[] = [];

  // Phase 1: Fetch all transcripts from both brands
  onProgress({ phase: "fetching", current: 0, total: 2, message: "Fetching all Captarget transcripts..." });
  
  let ctTranscripts: FirefliesTranscript[] = [];
  let scTranscripts: FirefliesTranscript[] = [];
  
  try {
    [ctTranscripts, scTranscripts] = await Promise.all([
      fetchAllTranscripts("Captarget"),
      fetchAllTranscripts("SourceCo"),
    ]);
  } catch (e: any) {
    onProgress({ phase: "error", current: 0, total: 0, message: `Failed to fetch transcripts: ${e.message}` });
    return results;
  }

  onProgress({ phase: "fetching", current: 2, total: 2, message: `Fetched ${ctTranscripts.length} CT + ${scTranscripts.length} SC transcripts` });

  // Deduplicate by firefliesId
  const allTranscripts: FirefliesTranscript[] = [];
  const seenIds = new Set<string>();
  for (const t of [...ctTranscripts, ...scTranscripts]) {
    if (t.firefliesId && seenIds.has(t.firefliesId)) continue;
    if (t.firefliesId) seenIds.add(t.firefliesId);
    allTranscripts.push(t);
  }

  // Phase 2: Match transcripts to leads
  onProgress({ phase: "matching", current: 0, total: leads.length, message: "Matching transcripts to leads..." });

  const leadMatches = new Map<string, FirefliesTranscript[]>();
  
  for (const transcript of allTranscripts) {
    const matchedLeads = matchTranscriptToLeads(transcript, leads);
    for (const lead of matchedLeads) {
      // Skip if lead already has this transcript
      const existingIds = new Set((lead.meetings || []).map(m => m.firefliesId).filter(Boolean));
      if (existingIds.has(transcript.firefliesId)) continue;

      if (!leadMatches.has(lead.id)) leadMatches.set(lead.id, []);
      leadMatches.get(lead.id)!.push(transcript);
    }
  }

  const leadsToProcess = Array.from(leadMatches.entries());
  onProgress({
    phase: "matching",
    current: leads.length,
    total: leads.length,
    message: `Found ${allTranscripts.length} total transcripts. ${leadsToProcess.length} leads have new meetings to process.`,
  });

  if (leadsToProcess.length === 0) {
    onProgress({ phase: "done", current: 0, total: 0, message: "No new meetings found for any leads." });
    return results;
  }

  // Phase 3: Process each lead sequentially
  for (let i = 0; i < leadsToProcess.length; i++) {
    if (cancelRef.current) {
      onProgress({ phase: "done", current: i, total: leadsToProcess.length, message: `Cancelled. Processed ${i} of ${leadsToProcess.length} leads.` });
      return results;
    }

    const [leadId, transcripts] = leadsToProcess[i];
    const lead = leads.find(l => l.id === leadId);
    if (!lead) continue;

    onProgress({
      phase: "processing",
      current: i + 1,
      total: leadsToProcess.length,
      currentLeadName: lead.name,
      message: `Processing ${lead.name} (${transcripts.length} meeting${transcripts.length !== 1 ? "s" : ""})...`,
    });

    const result: BulkLeadResult = {
      leadId,
      leadName: lead.name,
      newMeetingsCount: 0,
      appliedFields: [],
      pendingSuggestions: [],
    };

    try {
      const addedMeetings: Meeting[] = [];
      const allSuggestions: SuggestedLeadUpdates[] = [];

      for (const t of transcripts) {
        if (cancelRef.current) break;

        const existingMeetings = [...(lead.meetings || []), ...addedMeetings];
        let summary = t.summary;
        let nextSteps = t.nextSteps;
        let intelligence: MeetingIntelligence | undefined;

        if (t.transcript.length > 20) {
          try {
            const aiResult = await processTranscript(t.transcript, existingMeetings);
            summary = aiResult.summary || summary;
            nextSteps = aiResult.nextSteps || nextSteps;
            intelligence = aiResult.intelligence;
            if (aiResult.suggestedLeadUpdates) {
              allSuggestions.push(aiResult.suggestedLeadUpdates);
            }
          } catch (e) {
            console.error(`AI processing failed for ${lead.name}:`, e);
          }
        }

        addedMeetings.push({
          id: generateMeetingId(),
          date: t.date || new Date().toISOString().split("T")[0],
          title: t.title,
          firefliesId: t.firefliesId,
          firefliesUrl: t.transcriptUrl,
          transcript: t.transcript,
          summary,
          nextSteps,
          addedAt: new Date().toISOString(),
          intelligence,
          sourceBrand: t.sourceBrand,
        });

        // Rate limit delay between process-meeting calls
        await new Promise(r => setTimeout(r, 1500));
      }

      if (addedMeetings.length > 0) {
        const updatedMeetings = [...(lead.meetings || []), ...addedMeetings];
        const allDates = updatedMeetings.map(m => m.date).filter(Boolean).sort();
        const latestDate = allDates[allDates.length - 1] || "";
        const updates: Partial<Lead> = { meetings: updatedMeetings };
        if (latestDate && (!lead.lastContactDate || latestDate > lead.lastContactDate)) {
          updates.lastContactDate = latestDate;
        }
        // Extract next follow-up from intelligence
        const nextStepDates = addedMeetings
          .flatMap(m => m.intelligence?.nextSteps || [])
          .filter(ns => ns.deadline)
          .map(ns => ns.deadline)
          .sort();
        if (nextStepDates.length > 0 && (!lead.nextFollowUp || nextStepDates[0] < lead.nextFollowUp)) {
          updates.nextFollowUp = nextStepDates[0];
        }
        updateLead(leadId, updates);
        result.newMeetingsCount = addedMeetings.length;

        // Process suggestions
        for (const suggestions of allSuggestions) {
          const { applied, pending } = processSuggestedUpdates(suggestions, leadId, updateLead);
          result.appliedFields.push(...applied);
          result.pendingSuggestions.push(...pending);
        }

        // Deduplicate pending by field
        const seen = new Set<string>();
        result.pendingSuggestions = result.pendingSuggestions.filter(p => {
          if (seen.has(p.field)) return false;
          seen.add(p.field);
          return true;
        });

        // Synthesize deal intelligence
        const meetingsWithIntel = updatedMeetings.filter(m => m.intelligence);
        if (meetingsWithIntel.length > 0) {
          try {
            const dealIntel = await synthesizeDealIntelligence(updatedMeetings, lead);
            if (dealIntel) {
              updateLead(leadId, { dealIntelligence: dealIntel });
            }
          } catch (e) {
            console.error(`Deal intelligence synthesis failed for ${lead.name}:`, e);
          }
          // Rate limit
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    } catch (e: any) {
      result.error = e.message || "Unknown error";
      console.error(`Bulk processing error for ${lead.name}:`, e);
    }

    results.push(result);
  }

  onProgress({
    phase: "done",
    current: leadsToProcess.length,
    total: leadsToProcess.length,
    message: `Done! Processed ${results.length} leads.`,
  });

  return results;
}
