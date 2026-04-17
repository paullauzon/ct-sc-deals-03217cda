import { Lead } from "@/types/lead";
import { FolderOpen, ExternalLink, Calendar, Paperclip, Pencil, Check, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

export function LeadFilesTab({ lead, save }: Props) {
  const meetingsWithRecording = (lead.meetings || []).filter(m => m.firefliesUrl);
  const meetingsWithAttachments = (lead.meetings || []).filter((m: any) => Array.isArray(m.attachments) && m.attachments.length > 0);
  const totalAttachments = meetingsWithAttachments.reduce((acc, m: any) => acc + (m.attachments?.length || 0), 0);
  const totalItems = (lead.googleDriveLink ? 1 : 0) + meetingsWithRecording.length + totalAttachments;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lead.googleDriveLink || "");

  const saveDriveLink = () => {
    save({ googleDriveLink: draft.trim() });
    setEditing(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Files & Links</h3>
        <p className="text-[11px] text-muted-foreground">
          {totalItems} item{totalItems !== 1 ? "s" : ""} · {meetingsWithRecording.length} recording{meetingsWithRecording.length !== 1 ? "s" : ""} · {totalAttachments} attachment{totalAttachments !== 1 ? "s" : ""}
        </p>
      </div>

      {editing ? (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Google Drive folder URL</label>
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://drive.google.com/…" className="h-8 text-xs" autoFocus />
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditing(false); setDraft(lead.googleDriveLink || ""); }}>
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={saveDriveLink}>
              <Check className="h-3 w-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      ) : lead.googleDriveLink ? (
        <div className="group flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-secondary/40 transition-colors">
          <a href={lead.googleDriveLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded bg-secondary flex items-center justify-center shrink-0">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Google Drive folder</p>
              <p className="text-xs text-muted-foreground truncate">{lead.googleDriveLink}</p>
            </div>
          </a>
          <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary" title="Edit link">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <a href={lead.googleDriveLink} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          </a>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full rounded-lg border border-dashed border-border p-6 text-center hover:bg-secondary/40 transition-colors"
        >
          <FolderOpen className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">Add Drive folder link</p>
        </button>
      )}

      {meetingsWithRecording.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meeting recordings</h4>
          {meetingsWithRecording.map(m => (
            <a key={m.id} href={m.firefliesUrl} target="_blank" rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-secondary/40 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded bg-secondary flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.date}</p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      )}

      {meetingsWithAttachments.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meeting attachments</h4>
          {meetingsWithAttachments.map((m: any) => (m.attachments || []).map((att: any, i: number) => (
            <a key={`${m.id}-${i}`} href={att.url} target="_blank" rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 hover:bg-secondary/40 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs truncate">{att.name || att.url}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{m.title}</span>
            </a>
          )))}
        </div>
      )}
    </div>
  );
}
