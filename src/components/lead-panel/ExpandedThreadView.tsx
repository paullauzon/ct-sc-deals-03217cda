import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownLeft, Eye, MousePointerClick, Reply, Sparkles, Paperclip, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { Lead } from "@/types/lead";
import { ThreadAiStrip } from "@/components/lead-panel/ThreadAiStrip";
import { MessageAiReading } from "@/components/lead-panel/MessageAiReading";
import { MessageActionBar } from "@/components/lead-panel/MessageActionBar";
import { LinkToDealFieldDialog } from "@/components/lead-panel/dialogs/LinkToDealFieldDialog";
import type { ReplyPrefill } from "@/components/EmailsSection";

interface ExpandedEmail {
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
  lead?: Lead;
  threadId: string;
  threadSubject: string;
  emails: ExpandedEmail[];
  threadLatestDate: string;
  onReply?: (prefill: ReplyPrefill) => void;
  onMarkRead?: (id: string) => void;
}

const COLLAPSE_THRESHOLD = 4;
const VISIBLE_TAIL = 3;

function MessageBody({ html, text }: { html?: string; text?: string }) {
  if (html) {
    return (
      <iframe
        srcDoc={`<style>body{font-family:system-ui;font-size:12px;color:#333;margin:0;padding:8px;line-height:1.5}img{max-width:100%}a{color:#1d4ed8}</style>${html}`}
        sandbox=""
        className="w-full min-h-[200px] border rounded bg-background"
        title="Email body"
      />
    );
  }
  if (text) {
    return (
      <pre className="text-[11px] whitespace-pre-wrap font-sans text-foreground p-2 bg-secondary/30 rounded leading-relaxed">
        {text}
      </pre>
    );
  }
  return null;
}

function ImportantBadge() {
  return (
    <Badge variant="secondary" className="text-[9px] gap-0.5">
      <Sparkles className="h-2.5 w-2.5" /> Important
    </Badge>
  );
}

function MessageRow({
  email,
  lead,
  threadId,
  isExpandedDefault,
  onReply,
  onMarkRead,
  onLinkToField,
  important,
  onToggleImportant,
}: {
  email: ExpandedEmail;
  lead?: Lead;
  threadId: string;
  isExpandedDefault: boolean;
  onReply?: (prefill: ReplyPrefill) => void;
  onMarkRead?: (id: string) => void;
  onLinkToField: (email: ExpandedEmail, quote: string, sourceExcerpt: string) => void;
  important: boolean;
  onToggleImportant: (id: string, next: boolean) => void;
}) {
  const [open, setOpen] = useState(isExpandedDefault);
  const isOutbound = email.direction === "outbound";
  const Icon = isOutbound ? ArrowUpRight : ArrowDownLeft;
  const dirColor = isOutbound ? "text-blue-600 bg-blue-500/10" : "text-emerald-600 bg-emerald-500/10";
  const opens = Array.isArray(email.opens) ? email.opens.length : 0;
  const clicks = Array.isArray(email.clicks) ? email.clicks.length : 0;
  const isUnread = !isOutbound && email.is_read === false;

  useEffect(() => {
    if (open && isUnread && onMarkRead) onMarkRead(email.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-start gap-2 p-2 hover:bg-secondary/30 rounded-t-md transition-colors"
      >
        <div className={cn("rounded-full p-1 shrink-0 mt-0.5", dirColor)}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Unread" />}
            <span className={cn("text-xs", isUnread ? "font-semibold" : "font-medium")}>
              {email.from_name || email.from_address}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {isOutbound ? "→" : "←"} {isOutbound ? (email.to_addresses?.[0] || "") : "you"}
            </span>
            {email.sequence_step && (
              <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0">
                {email.sequence_step}
              </Badge>
            )}
            {email.ai_drafted && (
              <Badge variant="secondary" className="text-[9px] gap-0.5">
                <Sparkles className="h-2.5 w-2.5" />AI
              </Badge>
            )}
            {important && <ImportantBadge />}
            {email.replied_at && (
              <Badge variant="outline" className="text-[9px] gap-0.5">
                <Reply className="h-2.5 w-2.5" />Replied
              </Badge>
            )}
            {opens > 0 && isOutbound && (
              <Badge variant="outline" className="text-[9px] gap-0.5" title={`${opens} opens`}>
                <Eye className="h-2.5 w-2.5" />{opens}
              </Badge>
            )}
            {clicks > 0 && isOutbound && (
              <Badge variant="outline" className="text-[9px] gap-0.5" title={`${clicks} clicks`}>
                <MousePointerClick className="h-2.5 w-2.5" />{clicks}
              </Badge>
            )}
            {(email.attachments?.length || 0) > 0 && (
              <Badge variant="outline" className="text-[9px] gap-0.5">
                <Paperclip className="h-2.5 w-2.5" />{email.attachments?.length}
              </Badge>
            )}
          </div>
          {!open && email.body_preview && (
            <p className="text-[11px] text-muted-foreground/80 line-clamp-1 mt-0.5">
              {email.body_preview}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-muted-foreground" title={format(new Date(email.email_date), "PPpp")}>
            {formatDistanceToNow(new Date(email.email_date), { addSuffix: true })}
          </div>
          <ChevronDown className={cn("h-3 w-3 text-muted-foreground inline-block transition-transform mt-0.5", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <MessageBody html={email.body_html} text={email.body_text || email.body_preview} />
          <MessageAiReading
            emailId={email.id}
            subject={email.subject}
            body={email.body_text || email.body_preview || ""}
            direction={email.direction}
            fromName={email.from_name || email.from_address}
            leadFirstName={lead?.name?.split(" ")[0]}
            enabled={open}
            className="mt-2"
          />
          <MessageActionBar
            email={email}
            onReply={onReply}
            onLinkToField={(quote, source) => onLinkToField(email, quote, source)}
            onMarkImportant={onToggleImportant}
            isImportant={important}
          />
        </div>
      )}
    </div>
  );
}

export function ExpandedThreadView({
  lead,
  threadId,
  threadSubject,
  emails,
  threadLatestDate,
  onReply,
  onMarkRead,
}: Props) {
  const [showAllEarlier, setShowAllEarlier] = useState(false);
  const [importantIds, setImportantIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = JSON.parse(localStorage.getItem(`important-emails:${lead?.id || "anon"}`) || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  });
  const [linkDialog, setLinkDialog] = useState<{ email: ExpandedEmail; quote: string; source: string } | null>(null);

  const replyAnchor = useMemo(() => {
    const latestInbound = [...emails].filter(e => e.direction === "inbound")
      .sort((a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime())[0];
    if (!latestInbound) return { subject: threadSubject, thread_id: threadId };
    return {
      to: latestInbound.from_address,
      subject: latestInbound.subject || threadSubject,
      thread_id: latestInbound.thread_id || threadId,
      in_reply_to: latestInbound.message_id || "",
    };
  }, [emails, threadSubject, threadId]);

  const handleAiDraft = (prefill: ReplyPrefill & { body?: string }) => {
    if (!onReply) return;
    onReply({
      to: prefill.to,
      subject: prefill.subject,
      thread_id: prefill.thread_id,
      in_reply_to: prefill.in_reply_to,
      quote: prefill.body || "",
    });
  };

  const toggleImportant = (id: string, next: boolean) => {
    setImportantIds(prev => {
      const updated = new Set(prev);
      if (next) updated.add(id); else updated.delete(id);
      try {
        localStorage.setItem(`important-emails:${lead?.id || "anon"}`, JSON.stringify(Array.from(updated)));
      } catch { /* ignore */ }
      return updated;
    });
  };

  const handleLinkToField = (email: ExpandedEmail, quote: string, source: string) => {
    setLinkDialog({ email, quote, source });
  };

  // Render strategy: latest first within the visible block, with collapse for old messages
  const sorted = [...emails].sort((a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime());
  const collapsedCount = Math.max(0, sorted.length - VISIBLE_TAIL);
  const showCollapse = sorted.length > COLLAPSE_THRESHOLD && !showAllEarlier;
  const visible = showCollapse ? sorted.slice(0, VISIBLE_TAIL) : sorted;

  return (
    <div className="space-y-2 pl-4 ml-3 border-l-2 border-border mt-1 mb-2">
      {/* Thread-level AI summary */}
      <ThreadAiStrip
        threadId={threadId}
        leadId={lead?.id || ""}
        threadEmailCount={emails.length}
        threadLatestDate={threadLatestDate}
        onUseDraft={handleAiDraft}
        replyAnchor={replyAnchor}
      />

      {/* Messages, latest at top, oldest at bottom */}
      {visible.map((email, idx) => (
        <MessageRow
          key={email.id}
          email={email}
          lead={lead}
          threadId={threadId}
          isExpandedDefault={idx === 0}
          onReply={onReply}
          onMarkRead={onMarkRead}
          onLinkToField={handleLinkToField}
          important={importantIds.has(email.id)}
          onToggleImportant={toggleImportant}
        />
      ))}

      {showCollapse && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] gap-1.5 text-muted-foreground w-full justify-center"
          onClick={() => setShowAllEarlier(true)}
        >
          <ChevronUp className="h-3 w-3" />
          Show {collapsedCount} earlier message{collapsedCount === 1 ? "" : "s"}
        </Button>
      )}

      {linkDialog && lead && (
        <LinkToDealFieldDialog
          open={true}
          onOpenChange={(v) => !v && setLinkDialog(null)}
          lead={lead}
          emailId={linkDialog.email.id}
          threadId={threadId}
          initialQuote={linkDialog.quote}
          sourceExcerpt={linkDialog.source}
        />
      )}
    </div>
  );
}
