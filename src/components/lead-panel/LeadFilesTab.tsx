import { Lead } from "@/types/lead";
import { FolderOpen, ExternalLink, Calendar, Paperclip } from "lucide-react";

export function LeadFilesTab({ lead }: { lead: Lead }) {
  const meetingsWithRecording = (lead.meetings || []).filter(m => m.firefliesUrl);
  const meetingsWithAttachments = (lead.meetings || []).filter((m: any) => Array.isArray(m.attachments) && m.attachments.length > 0);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h3 className="text-sm font-semibold">Files & Links</h3>

      {lead.googleDriveLink ? (
        <a href={lead.googleDriveLink} target="_blank" rel="noreferrer"
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-secondary/40 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded bg-secondary flex items-center justify-center shrink-0">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Google Drive folder</p>
              <p className="text-xs text-muted-foreground truncate">{lead.googleDriveLink}</p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
        </a>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <FolderOpen className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">No Drive folder linked yet.</p>
        </div>
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
