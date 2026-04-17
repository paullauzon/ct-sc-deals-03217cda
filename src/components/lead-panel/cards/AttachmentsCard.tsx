import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Paperclip, ExternalLink, FileText, FolderOpen } from "lucide-react";

interface Props { lead: Lead }

interface Attachment {
  name: string;
  url?: string;
  size?: string;
  fromMeeting?: string;
}

export function AttachmentsCard({ lead }: Props) {
  const meetingAttachments: Attachment[] = (lead.meetings || []).flatMap((m: any) =>
    (m.attachments || []).map((a: any) => ({
      name: a.name || a.title || "Attachment",
      url: a.url || a.link,
      size: a.size,
      fromMeeting: m.title || m.date,
    }))
  );

  const total = (lead.googleDriveLink ? 1 : 0) + meetingAttachments.length;
  if (total === 0) return null;

  return (
    <CollapsibleCard
      title="Attachments"
      icon={<Paperclip className="h-3.5 w-3.5" />}
      count={total}
      defaultOpen={false}
    >
      <ul className="space-y-1.5">
        {lead.googleDriveLink && (
          <li>
            <a
              href={lead.googleDriveLink}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded border border-border/60 hover:border-border hover:bg-secondary/40 p-2 transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium truncate">Drive folder</p>
                <p className="text-[10px] text-muted-foreground truncate">Open in Google Drive</p>
              </div>
              <ExternalLink className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            </a>
          </li>
        )}
        {meetingAttachments.map((a, i) => (
          <li key={i}>
            <a
              href={a.url || "#"}
              target="_blank" rel="noreferrer"
              onClick={(e) => { if (!a.url) e.preventDefault(); }}
              className="flex items-center gap-2 rounded border border-border/60 hover:border-border hover:bg-secondary/40 p-2 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium truncate">{a.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {a.fromMeeting ? `From: ${a.fromMeeting}` : ""}{a.size ? ` · ${a.size}` : ""}
                </p>
              </div>
              {a.url && <ExternalLink className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
            </a>
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  );
}
