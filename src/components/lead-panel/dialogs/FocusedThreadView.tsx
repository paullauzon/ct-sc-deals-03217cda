// Phase 8 — Focused thread view (Sheet that hides other threads and presents
// a single thread with a back-link header bar plus quick reply/AI reply CTAs).
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Reply, Sparkles } from "lucide-react";
import { Lead } from "@/types/lead";
import { ExpandedThreadView } from "@/components/lead-panel/ExpandedThreadView";
import type { ReplyPrefill } from "@/components/EmailsSection";

interface FocusedEmail {
  id: string;
  thread_id?: string;
  message_id?: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name?: string;
  to_addresses?: string[];
  subject?: string;
  body_html?: string;
  body_text?: string;
  body_preview?: string;
  attachments?: Array<{ name?: string; url?: string }>;
  opens?: Array<{ at?: string }> | number;
  clicks?: Array<{ at?: string; url?: string }> | number;
  replied_at?: string | null;
  email_date: string;
  ai_drafted?: boolean;
  sequence_step?: string | null;
  is_read?: boolean | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead;
  threadId: string;
  threadSubject: string;
  emails: FocusedEmail[];
  threadLatestDate: string;
  sequenceStep?: string | null;
  onReply?: (prefill: ReplyPrefill) => void;
  onMarkRead?: (id: string) => void;
}

export function FocusedThreadView({
  open, onOpenChange, lead, threadId, threadSubject, emails, threadLatestDate, sequenceStep, onReply, onMarkRead,
}: Props) {
  const latestInbound = [...emails]
    .filter(e => e.direction === "inbound")
    .sort((a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime())[0];

  const handleReply = () => {
    if (!onReply) return;
    if (latestInbound) {
      const subj = latestInbound.subject || threadSubject;
      const replySubj = /^re:/i.test(subj) ? subj : `Re: ${subj}`;
      onReply({
        to: latestInbound.from_address,
        subject: replySubj,
        thread_id: latestInbound.thread_id || threadId,
        in_reply_to: latestInbound.message_id || "",
      });
    } else {
      onReply({ subject: threadSubject, thread_id: threadId });
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <div className="border-b border-border px-4 py-2.5 flex items-center justify-between gap-2 shrink-0 bg-background">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost" size="sm"
              className="h-7 text-[11px] gap-1 text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to threads
            </Button>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-xs font-semibold truncate" title={threadSubject}>{threadSubject}</span>
            {sequenceStep && (
              <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0 shrink-0">
                {sequenceStep}
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px] shrink-0">
              {emails.length} email{emails.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          {onReply && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" onClick={handleReply}>
                <Reply className="h-3 w-3" /> Reply
              </Button>
              <Button variant="default" size="sm" className="h-7 text-[11px] gap-1.5" onClick={handleReply}>
                <Sparkles className="h-3 w-3" /> AI reply
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <ExpandedThreadView
            lead={lead}
            threadId={threadId}
            threadSubject={threadSubject}
            emails={emails}
            threadLatestDate={threadLatestDate}
            onReply={onReply}
            onMarkRead={onMarkRead}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
