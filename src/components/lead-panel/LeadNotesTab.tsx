import { Lead } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface NoteEntry {
  date: string;
  author: string;
  body: string;
}

function parseNotes(raw: string): NoteEntry[] {
  if (!raw?.trim()) return [];
  // Split on the timestamp separator pattern. If no separators exist, treat as a single legacy entry.
  const parts = raw.split(/\n*--- /).filter(p => p.trim());
  const entries: NoteEntry[] = [];
  for (const part of parts) {
    const m = part.match(/^([\d-]+)\s*·\s*([^-]+?)\s*---\n?([\s\S]*)$/);
    if (m) {
      entries.push({ date: m[1].trim(), author: m[2].trim(), body: m[3].trim() });
    } else {
      entries.push({ date: "Legacy", author: "—", body: part.trim() });
    }
  }
  return entries.reverse(); // newest first
}

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
  onAddNote: () => void;
}

export function LeadNotesTab({ lead, onAddNote }: Props) {
  const entries = parseNotes(lead.notes);
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="text-[11px] text-muted-foreground">{entries.length} entry{entries.length !== 1 ? "ies" : ""} · timestamped & audit-logged</p>
        </div>
        <Button size="sm" onClick={onAddNote} className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add note
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-xs text-muted-foreground">No notes yet</p>
          <button onClick={onAddNote} className="mt-2 text-xs font-medium text-foreground hover:underline">
            Add the first note
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className="rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{e.author}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{e.date}</span>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">{e.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
