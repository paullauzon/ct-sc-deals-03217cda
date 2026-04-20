import { useState } from "react";
import { Lead, Meeting } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Mic, Calendar } from "lucide-react";
import { TranscriptDrawer } from "@/components/lead-panel/dialogs/TranscriptDrawer";
import { format, parseISO } from "date-fns";

interface Props { lead: Lead }

export function FirefliesRecordingsCard({ lead }: Props) {
  const [open, setOpen] = useState<Meeting | null>(null);
  const recordings = (lead.meetings || [])
    .filter(m => m.firefliesUrl || m.transcript)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (recordings.length === 0) return null;

  return (
    <>
      <CollapsibleCard
        title="Recordings"
        icon={<Mic className="h-3.5 w-3.5" />}
        count={recordings.length}
        defaultOpen={false}
      >
        <ul className="space-y-1.5">
          {recordings.map((m) => {
            let dateLabel = "";
            try { dateLabel = m.date ? format(parseISO(m.date), "MMM d, yyyy") : ""; } catch { /* noop */ }
            const attendees = m.intelligence?.attendees || [];
            const firstAttendee = attendees.find(a => {
              const n = (a.name || "").toLowerCase();
              return n && !n.includes("malik") && !n.includes("adam") && !n.includes("myall");
            })?.name;
            const attendeeLabel = firstAttendee
              ? `Malik + ${firstAttendee}`
              : attendees.length > 0
                ? `${attendees.length} attendee${attendees.length !== 1 ? "s" : ""}`
                : "";
            return (
              <li key={m.id}>
                <button
                  onClick={() => setOpen(m)}
                  className="w-full text-left rounded border border-border/60 hover:border-border hover:bg-secondary/40 p-2 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium truncate">{m.title || "Meeting"}</p>
                      <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5 flex-wrap">
                        {dateLabel && <><Calendar className="h-2.5 w-2.5" /> {dateLabel}</>}
                        {attendeeLabel && <span>· {attendeeLabel}</span>}
                      </p>
                    </div>
                    <span className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium group-hover:bg-emerald-500/20">
                      Transcript ↗
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </CollapsibleCard>
      <TranscriptDrawer meeting={open} open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }} />
    </>
  );
}
