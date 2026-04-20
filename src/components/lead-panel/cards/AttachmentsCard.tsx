import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { Paperclip, ExternalLink, FolderOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props { lead: Lead }

interface Attachment {
  name: string;
  url?: string;
  size?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  fromMeeting?: string;
}

function getExtBadge(filename: string): { ext: string; tone: string } {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "pdf":
      return { ext: "PDF", tone: "bg-red-500/10 text-red-600 dark:text-red-400" };
    case "csv":
    case "xls":
    case "xlsx":
      return { ext: ext.toUpperCase(), tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
    case "doc":
    case "docx":
      return { ext: ext.toUpperCase(), tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
    case "ppt":
    case "pptx":
      return { ext: ext.toUpperCase(), tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
    case "":
      return { ext: "FILE", tone: "bg-secondary text-muted-foreground" };
    default:
      return { ext: ext.toUpperCase(), tone: "bg-secondary text-muted-foreground" };
  }
}

export function AttachmentsCard({ lead }: Props) {
  const meetingAttachments: Attachment[] = (lead.meetings || []).flatMap((m: any) =>
    (m.attachments || []).map((a: any) => ({
      name: a.name || a.title || "Attachment",
      url: a.url || a.link,
      size: a.size,
      uploadedAt: a.uploadedAt || a.uploaded_at,
      uploadedBy: a.uploadedBy || a.uploaded_by,
      fromMeeting: m.title || m.date,
    }))
  );

  const total = (lead.googleDriveLink ? 1 : 0) + meetingAttachments.length;
  if (total === 0) {
    return (
      <CollapsibleCard
        title="Attachments"
        icon={<Paperclip className="h-3.5 w-3.5" />}
        count={0}
        defaultOpen={false}
        rightSlot={
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toast.info("File upload coming soon"); }}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded inline-flex items-center gap-0.5 text-[10px]"
            title="Upload file"
          >
            <Plus className="h-3 w-3" /> Upload
          </button>
        }
      >
        <p className="text-[11px] text-muted-foreground/60">No files yet.</p>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard
      title="Attachments"
      icon={<Paperclip className="h-3.5 w-3.5" />}
      count={total}
      defaultOpen={false}
      rightSlot={
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toast.info("File upload coming soon"); }}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded inline-flex items-center gap-0.5 text-[10px]"
          title="Upload file"
        >
          <Plus className="h-3 w-3" /> Upload
        </button>
      }
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
        {meetingAttachments.map((a, i) => {
          const badge = getExtBadge(a.name);
          let dateLabel = "";
          if (a.uploadedAt) {
            try {
              const d = new Date(a.uploadedAt);
              if (!isNaN(d.getTime())) dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            } catch { /* noop */ }
          }
          const subtitleParts: string[] = [];
          if (dateLabel) subtitleParts.push(`Added ${dateLabel}`);
          if (a.uploadedBy) subtitleParts.push(a.uploadedBy);
          if (!dateLabel && !a.uploadedBy && a.fromMeeting) subtitleParts.push(`From: ${a.fromMeeting}`);
          if (a.size) subtitleParts.push(a.size);
          const subtitle = subtitleParts.join(" · ");

          return (
            <li key={i}>
              <a
                href={a.url || "#"}
                target="_blank" rel="noreferrer"
                onClick={(e) => { if (!a.url) e.preventDefault(); }}
                className="flex items-center gap-2 rounded border border-border/60 hover:border-border hover:bg-secondary/40 p-2 transition-colors"
              >
                <span className={cn(
                  "shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded min-w-[34px] text-center",
                  badge.tone,
                )}>
                  {badge.ext}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium truncate">{a.name}</p>
                  {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
                </div>
                {a.url && <ExternalLink className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
              </a>
            </li>
          );
        })}
      </ul>
    </CollapsibleCard>
  );
}
