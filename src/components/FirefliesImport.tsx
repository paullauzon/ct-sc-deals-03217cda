import { useState } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead, Meeting } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FirefliesMeeting {
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
}

function autoMatchLead(meeting: FirefliesMeeting, leads: Lead[]): string | null {
  for (const email of meeting.attendeeEmails) {
    const match = leads.find((l) => l.email.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
  }
  for (const lead of leads) {
    const nameParts = lead.name.toLowerCase().split(" ");
    const lastName = nameParts[nameParts.length - 1];
    if (lastName.length > 2) {
      if (meeting.title.toLowerCase().includes(lastName)) return lead.id;
      for (const att of meeting.attendees) {
        if (att.toLowerCase().includes(lastName)) return lead.id;
      }
    }
  }
  return null;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const mins = Math.round(seconds / 60);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function generateMeetingId(): string {
  return `mtg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

export function FirefliesImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { leads, updateLead } = useLeads();
  const [loading, setLoading] = useState(false);
  const [meetings, setMeetings] = useState<FirefliesMeeting[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [fetched, setFetched] = useState(false);
  const [importing, setImporting] = useState(false);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      // Fetch from both Captarget and SourceCo Fireflies accounts
      const [ctResult, scResult] = await Promise.all([
        supabase.functions.invoke("fetch-fireflies", {
          body: { limit: 50, summarize: true, brand: "Captarget" },
        }),
        supabase.functions.invoke("fetch-fireflies", {
          body: { limit: 50, summarize: true, brand: "SourceCo" },
        }),
      ]);

      const ctMeetings: FirefliesMeeting[] = ctResult.data?.meetings || [];
      const scMeetings: FirefliesMeeting[] = scResult.data?.meetings || [];
      const fetchedMeetings = [...ctMeetings, ...scMeetings];
      setMeetings(fetchedMeetings);

      const autoMatched: Record<string, string> = {};
      for (const m of fetchedMeetings) {
        const matchedId = autoMatchLead(m, leads);
        if (matchedId) {
          autoMatched[m.firefliesId] = matchedId;
        }
      }
      setAssignments(autoMatched);
      setFetched(true);

      const matchedCount = Object.keys(autoMatched).length;
      toast.success(`Fetched ${fetchedMeetings.length} meetings. Auto-matched ${matchedCount} to leads.`);
    } catch (e: any) {
      console.error("Fetch Fireflies error:", e);
      toast.error(e.message || "Failed to fetch from Fireflies");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    let imported = 0;
    let skipped = 0;

    // Group meetings by lead
    const leadMeetings: Record<string, FirefliesMeeting[]> = {};
    for (const meeting of meetings) {
      const leadId = assignments[meeting.firefliesId];
      if (!leadId) continue;
      if (!leadMeetings[leadId]) leadMeetings[leadId] = [];
      leadMeetings[leadId].push(meeting);
    }

    for (const [leadId, meetingsForLead] of Object.entries(leadMeetings)) {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) continue;

      const existingIds = new Set((lead.meetings || []).map((m) => m.firefliesId).filter(Boolean));
      const newMeetings = meetingsForLead.filter((m) => !existingIds.has(m.firefliesId));

      if (newMeetings.length === 0) {
        skipped += meetingsForLead.length;
        continue;
      }

      const updatedMeetings = [...(lead.meetings || [])];

      for (const m of newMeetings) {
        const newMeeting: Meeting = {
          id: generateMeetingId(),
          date: m.date || new Date().toISOString().split("T")[0],
          title: m.title || "Untitled Meeting",
          firefliesId: m.firefliesId,
          firefliesUrl: m.transcriptUrl || "",
          transcript: m.transcript || "",
          summary: m.summary || "",
          nextSteps: m.nextSteps || "",
          addedAt: new Date().toISOString(),
        };
        updatedMeetings.push(newMeeting);
        imported++;
      }

      updateLead(leadId, { meetings: updatedMeetings });
    }

    const msg = skipped > 0
      ? `Imported ${imported} new meeting${imported !== 1 ? "s" : ""} (${skipped} already existed)`
      : `Imported ${imported} meeting${imported !== 1 ? "s" : ""}`;
    toast.success(msg);
    setImporting(false);
    onOpenChange(false);
  };

  const assignedCount = Object.values(assignments).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src="/fireflies-icon.svg" alt="Fireflies.ai" className="w-5 h-5" /> Import from Fireflies
          </DialogTitle>
          <DialogDescription>
            Fetch meeting recordings from Fireflies, auto-match to leads, and import as multi-meeting records with AI summaries.
          </DialogDescription>
        </DialogHeader>

        {!fetched ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              This will fetch your recent Fireflies meetings, summarize each with AI, and let you assign them to leads. Already-imported meetings will be skipped.
            </p>
            <Button onClick={fetchMeetings} disabled={loading} size="lg">
              {loading ? "Fetching & Summarizing..." : <><img src="/fireflies-icon.svg" alt="" className="w-4 h-4 mr-1 inline" /> Fetch Meetings from Fireflies</>}
            </Button>
            {loading && (
              <p className="text-xs text-muted-foreground animate-pulse">
                This may take a minute — fetching transcripts and running AI summaries...
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
              <span>{meetings.length} meetings found · {assignedCount} assigned to leads</span>
              <Button variant="ghost" size="sm" onClick={fetchMeetings} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
              <div className="space-y-2 pr-4">
                {meetings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No meetings found in your Fireflies account.
                  </p>
                ) : (
                  meetings.map((meeting) => (
                    <MeetingCard
                      key={meeting.firefliesId}
                      meeting={meeting}
                      leads={leads}
                      assignedLeadId={assignments[meeting.firefliesId] || ""}
                      onAssign={(leadId) =>
                        setAssignments((prev) => ({
                          ...prev,
                          [meeting.firefliesId]: leadId,
                        }))
                      }
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleImport} disabled={importing || assignedCount === 0}>
                {importing
                  ? "Importing..."
                  : `Import ${assignedCount} Meeting${assignedCount !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MeetingCard({
  meeting,
  leads,
  assignedLeadId,
  onAssign,
}: {
  meeting: FirefliesMeeting;
  leads: Lead[];
  assignedLeadId: string;
  onAssign: (leadId: string) => void;
}) {
  const lead = leads.find((l) => l.id === assignedLeadId);

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium truncate">{meeting.title}</h4>
            <span className="text-xs text-muted-foreground shrink-0">
              {meeting.date} · {formatDuration(meeting.duration)}
            </span>
          </div>
          {meeting.attendees.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {meeting.attendees.slice(0, 4).join(", ")}
              {meeting.attendees.length > 4 && ` +${meeting.attendees.length - 4} more`}
            </p>
          )}
        </div>
      </div>

      {meeting.summary && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {meeting.summary}
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Assign to:</span>
        <Select
          value={assignedLeadId || "__none__"}
          onValueChange={(v) => onAssign(v === "__none__" ? "" : v)}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Select a lead..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Skip —</SelectItem>
            {leads.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} ({l.company || "No company"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {lead && (
          <span className="text-xs text-primary shrink-0">✓ Matched</span>
        )}
      </div>
    </div>
  );
}
