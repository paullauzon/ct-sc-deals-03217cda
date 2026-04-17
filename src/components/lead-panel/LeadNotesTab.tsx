import { useState } from "react";
import { Lead } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

interface NoteEntry {
  date: string;
  author: string;
  body: string;
  /** original index in chronological (oldest-first) order — used for re-serialization */
  index: number;
}

/** Parse the serialized notes string into chronologically-ordered entries (oldest first). */
function parseNotesChronological(raw: string): NoteEntry[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/\n*--- /).filter(p => p.trim());
  const entries: NoteEntry[] = [];
  parts.forEach((part, i) => {
    const m = part.match(/^([\d-]+)\s*·\s*([^-]+?)\s*---\n?([\s\S]*)$/);
    if (m) {
      entries.push({ date: m[1].trim(), author: m[2].trim(), body: m[3].trim(), index: i });
    } else {
      entries.push({ date: "Legacy", author: "—", body: part.trim(), index: i });
    }
  });
  return entries;
}

/** Re-serialize entries (chronological order) back into the lead.notes string format. */
function serializeNotes(entries: NoteEntry[]): string {
  return entries
    .map(e => {
      if (e.date === "Legacy") return e.body;
      return `--- ${e.date} · ${e.author} ---\n${e.body}`;
    })
    .join("\n\n");
}

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
  onAddNote: () => void;
}

export function LeadNotesTab({ lead, save, onAddNote }: Props) {
  const chronological = parseNotesChronological(lead.notes);
  // Display newest first
  const display = [...chronological].reverse();

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const beginEdit = (e: NoteEntry) => {
    setEditingIndex(e.index);
    setDraftBody(e.body);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraftBody("");
  };

  const saveEdit = async () => {
    if (editingIndex == null) return;
    const trimmed = draftBody.trim();
    if (!trimmed) {
      toast.error("Note can't be empty");
      return;
    }
    const updated = chronological.map(e => (e.index === editingIndex ? { ...e, body: trimmed } : e));
    save({ notes: serializeNotes(updated) });
    await logActivity(lead.id, "note_edited", `Edited note: ${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}`);
    toast.success("Note updated");
    cancelEdit();
  };

  const confirmDelete = async () => {
    if (deleteIndex == null) return;
    const target = chronological.find(e => e.index === deleteIndex);
    const remaining = chronological.filter(e => e.index !== deleteIndex);
    save({ notes: serializeNotes(remaining) });
    await logActivity(
      lead.id,
      "note_deleted",
      `Deleted note: ${target?.body.slice(0, 80) || ""}${(target?.body.length || 0) > 80 ? "…" : ""}`
    );
    toast.success("Note deleted");
    setDeleteIndex(null);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="text-[11px] text-muted-foreground">
            {display.length} {display.length === 1 ? "entry" : "entries"} · timestamped & audit-logged
          </p>
        </div>
        <Button size="sm" onClick={onAddNote} className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add note
        </Button>
      </div>

      {display.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-xs text-muted-foreground">No notes yet</p>
          <button onClick={onAddNote} className="mt-2 text-xs font-medium text-foreground hover:underline">
            Add the first note
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {display.map(e => {
            const isEditing = editingIndex === e.index;
            return (
              <div key={e.index} className="group rounded-lg border border-border bg-background px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {e.author}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground tabular-nums">{e.date}</span>
                    {!isEditing && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => beginEdit(e)}
                          className="p-1 text-muted-foreground hover:text-foreground rounded"
                          title="Edit note"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setDeleteIndex(e.index)}
                          className="p-1 text-muted-foreground hover:text-destructive rounded"
                          title="Delete note"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={draftBody}
                      onChange={ev => setDraftBody(ev.target.value)}
                      rows={4}
                      className="text-xs resize-none"
                      autoFocus
                      onKeyDown={ev => {
                        if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
                          ev.preventDefault();
                          saveEdit();
                        } else if (ev.key === "Escape") {
                          ev.preventDefault();
                          cancelEdit();
                        }
                      }}
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={cancelEdit}>
                        <X className="h-3 w-3" /> Cancel
                      </Button>
                      <Button size="sm" className="h-6 text-[11px] gap-1" onClick={saveEdit}>
                        <Check className="h-3 w-3" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">{e.body}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteIndex !== null} onOpenChange={o => { if (!o) setDeleteIndex(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the entry from the lead's notes. The deletion will be recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
