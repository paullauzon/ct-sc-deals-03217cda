import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Meeting } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  meeting: Meeting | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

/** Render Fireflies transcript text in a side drawer, no external nav required. */
export function TranscriptDrawer({ meeting, open, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);

  const transcript = meeting?.transcript || "";
  const hasTranscript = transcript.trim().length > 0;

  // Best-effort speaker formatting: lines like "Speaker (00:01): text"
  // are rendered with a slight visual rhythm for readability.
  const lines = useMemo(() => transcript.split(/\n+/).filter(l => l.trim().length > 0), [transcript]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      toast.success("Transcript copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — clipboard blocked");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">
            {meeting?.title || "Meeting transcript"}
          </SheetTitle>
          {meeting?.date && (
            <p className="text-[11px] text-muted-foreground tabular-nums">{formatDate(meeting.date)}</p>
          )}
        </SheetHeader>

        <div className="mt-3 flex items-center gap-1.5">
          {hasTranscript && (
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" onClick={copyAll}>
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy all"}
            </Button>
          )}
          {meeting?.firefliesUrl && (
            <a
              href={meeting.firefliesUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Open in Fireflies
            </a>
          )}
        </div>

        {meeting?.summary && (
          <div className="mt-4 rounded border border-border bg-secondary/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
            <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">{meeting.summary}</p>
          </div>
        )}

        {meeting?.nextSteps && (
          <div className="mt-3 rounded border border-border bg-secondary/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Next steps</p>
            <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">{meeting.nextSteps}</p>
          </div>
        )}

        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Transcript</p>
          {!hasTranscript ? (
            <p className="text-xs text-muted-foreground/60 py-8 text-center">
              No transcript text stored for this meeting.
              {meeting?.firefliesUrl ? " Open in Fireflies to view." : ""}
            </p>
          ) : (
            <div className="space-y-1.5 text-xs leading-relaxed text-foreground/90 max-h-[60vh] overflow-y-auto pr-2">
              {lines.map((line, i) => {
                // Highlight speaker label if pattern matches "Name: text" or "Name (00:00): text"
                const m = line.match(/^([A-Z][\w .'-]{1,40})(\s*\(\d{1,2}:\d{2}(?::\d{2})?\))?\s*[:\-]\s*(.+)$/);
                if (m) {
                  return (
                    <p key={i} className="whitespace-pre-wrap">
                      <span className="font-semibold text-foreground">{m[1]}</span>
                      {m[2] && <span className="text-muted-foreground/60 tabular-nums">{m[2]}</span>}
                      <span className="text-muted-foreground"> · </span>
                      <span>{m[3]}</span>
                    </p>
                  );
                }
                return <p key={i} className="whitespace-pre-wrap">{line}</p>;
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
