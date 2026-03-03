import { useState } from "react";
import { Lead, Meeting } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

function generateMeetingId(): string {
  return `mtg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

function formatMeetingDate(dateStr: string): string {
  if (!dateStr) return "Unknown date";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export function MeetingsSection({ lead }: { lead: Lead }) {
  const { updateLead } = useLeads();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searching, setSearching] = useState(false);

  const meetings = lead.meetings || [];

  const handleAutoFind = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-fireflies", {
        body: {
          searchEmails: [lead.email],
          searchNames: [lead.name],
          limit: 50,
          summarize: false,
          brand: lead.brand,
        },
      });
      if (error) throw error;

      const foundMeetings = data.meetings || [];
      const existingIds = new Set(meetings.map((m) => m.firefliesId).filter(Boolean));
      const newMeetings = foundMeetings.filter(
        (m: any) => !existingIds.has(m.firefliesId)
      );

      if (newMeetings.length === 0) {
        toast.info("No new meetings found in Fireflies for this lead.");
        return;
      }

      // Process each new meeting with AI — build new array immutably
      const addedMeetings: Meeting[] = [];
      for (const m of newMeetings) {
        const transcript = m.transcript || "";

        const allMeetings = [...meetings, ...addedMeetings].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Use Fireflies native summary as fallback
        let summary = m.summary || "";
        let nextSteps = m.nextSteps || "";

        if (transcript.length > 20) {
          try {
            const { data: aiData, error: aiError } = await supabase.functions.invoke("process-meeting", {
              body: { transcript, priorMeetings: allMeetings },
            });
            if (!aiError && aiData) {
              summary = aiData.summary || summary;
              nextSteps = aiData.nextSteps || nextSteps;
            }
          } catch {
            // Fall back to Fireflies summary
          }
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
        });
      }

      const updatedMeetings = [...meetings, ...addedMeetings];
      updateLead(lead.id, { meetings: updatedMeetings });
      toast.success(`Found and processed ${addedMeetings.length} new meeting${addedMeetings.length !== 1 ? "s" : ""} from Fireflies`);
    } catch (e: any) {
      console.error("Auto-find error:", e);
      toast.error(e.message || "Failed to search Fireflies");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Meetings ({meetings.length})
        </h3>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={handleAutoFind} disabled={searching} className="text-xs h-7">
            {searching ? "Searching..." : (
              <><img src="/fireflies-icon.svg" alt="" className="w-3.5 h-3.5 mr-1" />Auto-find</>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAddDialog(true)} className="text-xs h-7">
            + Add Meeting
          </Button>
        </div>
      </div>

      {meetings.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 text-center py-4">
          No meetings yet. Add a transcript or auto-find from Fireflies.
        </p>
      ) : (
        <div className="space-y-2">
          {[...meetings]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
        </div>
      )}

      <AddMeetingDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        lead={lead}
        existingMeetings={meetings}
        onAdd={(meeting) => {
          updateLead(lead.id, { meetings: [...meetings, meeting] });
        }}
      />
    </div>
  );
}

function MeetingCard({ meeting, onRemove }: { meeting: Meeting; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left border border-border rounded-lg p-3 hover:bg-secondary/20 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs shrink-0">{open ? "▾" : "▸"}</span>
              <span className="text-sm font-medium truncate">{meeting.title}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">{formatMeetingDate(meeting.date)}</span>
              {meeting.firefliesUrl && (
                <a
                  href={meeting.firefliesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  🔗
                </a>
              )}
              {confirmingDelete ? (
                <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { onRemove(); setConfirmingDelete(false); }} className="text-xs text-destructive font-medium hover:underline">Yes</button>
                  <button onClick={() => setConfirmingDelete(false)} className="text-xs text-muted-foreground hover:underline">No</button>
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove meeting"
                >✕</button>
              )}
            </div>
          </div>
          {!open && meeting.summary && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 pl-5">{meeting.summary}</p>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border border-t-0 border-border rounded-b-lg p-3 space-y-3 -mt-1">
          {meeting.summary && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Summary</label>
              <div className="mt-1 text-sm leading-relaxed p-4 bg-secondary/30 rounded-md whitespace-pre-line min-h-[80px]">
                {meeting.summary}
              </div>
            </div>
          )}
          {meeting.nextSteps && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Next Steps</label>
              <div className="mt-1 text-sm leading-relaxed p-3 bg-secondary/30 rounded-md whitespace-pre-line">
                {meeting.nextSteps}
              </div>
            </div>
          )}
          {meeting.transcript && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="text-xs text-primary hover:underline">Show full transcript</button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="max-h-60 mt-2">
                  <pre className="text-xs leading-relaxed p-3 bg-secondary/20 rounded-md whitespace-pre-wrap font-sans">
                    {meeting.transcript}
                  </pre>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AddMeetingDialog({
  open,
  onOpenChange,
  lead,
  existingMeetings,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  existingMeetings: Meeting[];
  onAdd: (meeting: Meeting) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [transcript, setTranscript] = useState("");
  const [firefliesUrl, setFirefliesUrl] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleSave = async () => {
    if (!transcript.trim() && !firefliesUrl.trim()) {
      toast.error("Please paste a transcript or Fireflies URL");
      return;
    }

    setProcessing(true);
    let summary = "";
    let nextSteps = "";

    // Process with AI if we have a transcript
    if (transcript.trim().length > 20) {
      try {
        const priorMeetings = [...existingMeetings].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const { data, error } = await supabase.functions.invoke("process-meeting", {
          body: { transcript: transcript.trim(), priorMeetings },
        });
        if (error) throw error;
        summary = data.summary || "";
        nextSteps = data.nextSteps || "";
      } catch (e: any) {
        console.error("AI processing error:", e);
        toast.error("AI processing failed, saving without summary");
      }
    }

    const meeting: Meeting = {
      id: generateMeetingId(),
      date,
      title: title || `Meeting ${existingMeetings.length + 1}`,
      firefliesUrl,
      transcript: transcript.trim(),
      summary,
      nextSteps,
      addedAt: new Date().toISOString(),
    };

    onAdd(meeting);
    toast.success("Meeting added and processed");
    setTitle("");
    setDate(new Date().toISOString().split("T")[0]);
    setTranscript("");
    setFirefliesUrl("");
    setProcessing(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Meeting for {lead.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Intro Call" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <img src="/fireflies-icon.svg" alt="" className="w-3.5 h-3.5" /> Fireflies URL (optional)
            </label>
            <Input
              value={firefliesUrl}
              onChange={(e) => setFirefliesUrl(e.target.value)}
              placeholder="https://app.fireflies.ai/view/..."
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Transcript</label>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the meeting transcript here..."
              rows={8}
              className="mt-1"
            />
          </div>
          {transcript.trim().length > 20 && (
            <p className="text-xs text-muted-foreground">
              ✨ This transcript will be automatically summarized with AI when saved
              {existingMeetings.length > 0 && `, informed by ${existingMeetings.length} prior meeting${existingMeetings.length !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={processing || (!transcript.trim() && !firefliesUrl.trim())}>
            {processing ? "Processing with AI..." : "Save & Process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
