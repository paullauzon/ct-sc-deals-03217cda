import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowUpRight, ArrowDownLeft, ChevronDown, Mail, Paperclip, Reply, AlertCircle, PenSquare, Eye, MousePointerClick, Sparkles, Loader2, Copy, Check, Clock, X } from "lucide-react";
import { Lead } from "@/types/lead";
import { detectEmailObjections, DetectedObjection } from "@/lib/meetingCoach";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { EmailTabHeader } from "@/components/lead-panel/EmailTabHeader";
import { computeThreadEngagement } from "@/lib/threadEngagement";
import { ThreadEngagementBadges } from "@/components/lead-panel/ThreadEngagementBadges";
import { ThreadAiStrip } from "@/components/lead-panel/ThreadAiStrip";
import { ExpandedThreadView } from "@/components/lead-panel/ExpandedThreadView";

interface LeadEmail {
  id: string;
  lead_id: string;
  message_id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string;
  to_addresses: string[];
  cc_addresses?: string[];
  subject: string;
  body_preview: string;
  body_html?: string;
  body_text?: string;
  attachments?: Array<{ name?: string; url?: string; has?: boolean }>;
  opens?: Array<{ at?: string }> | number;
  clicks?: Array<{ at?: string; url?: string }> | number;
  replied_at?: string | null;
  bounce_reason?: string;
  email_date: string;
  source: string;
  created_at: string;
  is_read?: boolean | null;
  scheduled_for?: string | null;
  send_status?: string;
  ai_drafted?: boolean;
  email_type?: string;
  sequence_step?: string | null;
}

/** Compute thread reply status for the header pill. */
function getThreadStatus(emails: LeadEmail[], leadName?: string): { label: string; tone: "neutral" | "muted" | "success" | "auto" } | null {
  if (!emails.length) return null;
  const inbound = emails.filter(e => e.direction === "inbound");
  const outbound = emails.filter(e => e.direction === "outbound");
  // Auto-triggered: from Calendly / system addresses
  const allAuto = emails.every(e => /calendly|noreply|no-reply|mailer-daemon/i.test(e.from_address || ""));
  if (allAuto) return { label: "Auto-triggered", tone: "auto" };
  // AI from Fireflies recap
  const allAi = outbound.length > 0 && outbound.every(e => e.ai_drafted) && /recap|fireflies|meeting notes/i.test(emails[0].subject || "");
  if (allAi) return { label: "AI from Fireflies", tone: "auto" };
  if (inbound.length > 0) {
    const first = leadName?.split(" ")[0] || "Lead";
    return { label: `${first} replied`, tone: "success" };
  }
  if (outbound.length > 0) return { label: "Thread — no reply yet", tone: "muted" };
  return null;
}

function EmailTabIntro({ leadName }: { leadName?: string }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("emailTabIntroDismissed") === "1";
  });
  if (dismissed) return null;
  const first = leadName?.split(" ")[0] || "this lead";
  return (
    <div className="relative rounded-md border border-border bg-secondary/30 px-3 py-2.5 mb-3">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem("emailTabIntroDismissed", "1");
          setDismissed(true);
        }}
        className="absolute top-1.5 right-1.5 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="text-[11px] font-semibold text-foreground uppercase tracking-[0.12em] mb-1 pr-6">
        About this view
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground pr-6">
        Shows only 1-to-1 emails between you and {first}, grouped into reply threads. Marketing, no-reply system emails, and sequences sent from brand mailboxes appear in Activities only.
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80 mt-1 pr-6">
        Toggle <span className="font-medium text-foreground">Individual rows</span> to flatten threads · <span className="font-medium text-foreground">Show all</span> to include marketing/transactional.
      </p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

interface ThreadGroup {
  threadId: string;
  subject: string;
  emails: LeadEmail[];
  latestDate: string;
}

function groupByThread(emails: LeadEmail[]): ThreadGroup[] {
  const threads = new Map<string, LeadEmail[]>();

  for (const email of emails) {
    const key = email.thread_id || email.id;
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key)!.push(email);
  }

  return Array.from(threads.entries())
    .map(([threadId, emails]) => ({
      threadId,
      subject: emails[0].subject || "(No subject)",
      emails: emails.sort((a, b) => new Date(a.email_date).getTime() - new Date(b.email_date).getTime()),
      latestDate: emails.reduce((latest, e) => e.email_date > latest ? e.email_date : latest, emails[0].email_date),
    }))
    .sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
}

interface SuggestedResponse {
  approach: string;
  subject: string;
  body: string;
}

export interface ReplyPrefill {
  to?: string;
  subject?: string;
  thread_id?: string;
  in_reply_to?: string;
  quote?: string;
}

export function EmailsSection({ leadId, lead, onCompose, onReply }: { leadId: string; lead?: Lead; onCompose?: () => void; onReply?: (prefill: ReplyPrefill) => void }) {
  const [emails, setEmails] = useState<LeadEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [responseDialog, setResponseDialog] = useState<{ email: LeadEmail; objections: DetectedObjection[] } | null>(null);
  const [showMarketing, setShowMarketing] = useState(false);
  const [expandAllSignal, setExpandAllSignal] = useState<"expand" | "collapse" | null>(null);
  const [flatten, setFlatten] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchEmails() {
      // Fetch 1-to-1 by default; marketing/transactional hidden unless toggled
      let query = supabase
        .from("lead_emails")
        .select("*")
        .eq("lead_id", leadId)
        .order("email_date", { ascending: false })
        .limit(100);
      if (!showMarketing) {
        query = query.in("email_type", ["one_to_one", "sequence"]);
      }
      const { data, error } = await query;

      if (!cancelled) {
        if (data) setEmails(data as unknown as LeadEmail[]);
        if (error) console.error("Error fetching emails:", error);
        setLoading(false);
      }
    }

    fetchEmails();

    // Realtime subscription — listen for inserts AND updates
    const channel = supabase
      .channel(`lead-emails-${leadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_emails", filter: `lead_id=eq.${leadId}` },
        (payload) => {
          const newEmail = payload.new as unknown as LeadEmail;
          const type = (newEmail as any).email_type || "one_to_one";
          if (!showMarketing && !["one_to_one", "sequence"].includes(type)) return;
          setEmails((prev) => [newEmail, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lead_emails", filter: `lead_id=eq.${leadId}` },
        (payload) => {
          const updated = payload.new as unknown as LeadEmail;
          setEmails((prev) => prev.map((e) => e.id === updated.id ? updated : e));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "lead_emails", filter: `lead_id=eq.${leadId}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setEmails((prev) => prev.filter((e) => e.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [leadId, showMarketing]);

  const markRead = async (emailId: string) => {
    setEmails((prev) => prev.map(e => e.id === emailId ? { ...e, is_read: true } : e));
    await supabase.from("lead_emails").update({ is_read: true } as any).eq("id", emailId);
  };

  const cancelScheduled = async (emailId: string) => {
    if (!window.confirm("Cancel this scheduled email?")) return;
    const { error } = await supabase.from("lead_emails").delete().eq("id", emailId);
    if (error) { toast.error(error.message); return; }
    toast.success("Scheduled email cancelled");
  };

  // Thread-level aggregate stats
  const totalOpens = emails.reduce((sum, e) => sum + (Array.isArray(e.opens) ? e.opens.length : 0), 0);
  const totalClicks = emails.reduce((sum, e) => sum + (Array.isArray(e.clicks) ? e.clicks.length : 0), 0);
  const totalReplies = emails.filter(e => e.replied_at).length;

  // Mailbox scoping — distinct outbound from-addresses (rep mailboxes)
  const mailboxes = Array.from(new Set(
    emails.filter(e => e.direction === "outbound" && e.from_address).map(e => e.from_address.toLowerCase())
  ));
  const multipleMailboxes = mailboxes.length > 1;

  const deliveredForCount = emails.filter(e => e.send_status !== "scheduled");
  const threadCount = groupByThread(deliveredForCount).length;
  const emailCount = deliveredForCount.length;
  const firstName = lead?.name?.split(" ")[0] || lead?.name || "";

  const header = onCompose ? (
    <div className="flex items-center justify-between border-b border-border pb-2 mb-3 flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
          All email threads{firstName ? ` — ${firstName}` : ""}
          {emailCount > 0 && (
            <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal font-normal">
              ({threadCount} thread{threadCount !== 1 ? "s" : ""}, {emailCount} email{emailCount !== 1 ? "s" : ""} total)
            </span>
          )}
        </h3>
        {(totalOpens > 0 || totalClicks > 0 || totalReplies > 0) && (
          <span className="text-[10px] text-muted-foreground">
            {totalOpens > 0 && `${totalOpens} open${totalOpens !== 1 ? "s" : ""}`}
            {totalClicks > 0 && ` · ${totalClicks} click${totalClicks !== 1 ? "s" : ""}`}
            {totalReplies > 0 && ` · ${totalReplies} repl${totalReplies !== 1 ? "ies" : "y"}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost" size="sm"
          onClick={() => setShowMarketing(v => !v)}
          className="h-7 text-[10px] text-muted-foreground"
          title={showMarketing ? "Hide marketing/transactional" : "Show marketing/transactional"}
        >
          {showMarketing ? "1-to-1 only" : "Show all"}
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => setFlatten(v => !v)}
          className="h-7 text-[10px] text-muted-foreground"
          title={flatten ? "Group emails into threads" : "Show one row per email"}
        >
          {flatten ? "Group threads" : "Individual rows"}
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => setExpandAllSignal(s => s === "expand" ? "collapse" : "expand")}
          className="h-7 text-[10px] text-muted-foreground"
        >
          {expandAllSignal === "expand" ? "Collapse all" : "Expand all"}
        </Button>
        <Button variant="outline" size="sm" onClick={onCompose} className="h-7 text-xs gap-1.5">
          <PenSquare className="h-3 w-3" /> Compose
        </Button>
      </div>
    </div>
  ) : null;

  if (loading) {
    return (
      <div>
        <EmailTabIntro leadName={lead?.name} />
        {header}
        <div className="text-xs text-muted-foreground/60 text-center py-4">
          Loading emails...
        </div>
      </div>
    );
  }

  const scheduled = emails.filter(e => e.send_status === "scheduled").sort(
    (a, b) => new Date(a.scheduled_for || a.email_date).getTime() - new Date(b.scheduled_for || b.email_date).getTime()
  );
  const delivered = emails.filter(e => e.send_status !== "scheduled");

  if (delivered.length === 0 && scheduled.length === 0) {
    return (
      <div>
        <EmailTabHeader lead={lead} emails={emails as any} threadCount={0} onCompose={onCompose} />
        {header}
        <p className="text-xs text-muted-foreground/60 text-center py-4">
          No emails yet. {onCompose ? "Click Compose to start a conversation, or " : ""}connect a mailbox in Settings → Mailboxes to see correspondence here.
        </p>
      </div>
    );
  }

  const threads = groupByThread(delivered);
  const flatEmails = [...delivered].sort((a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime());

  return (
    <div>
      <EmailTabHeader lead={lead} emails={emails as any} threadCount={threads.length} onCompose={onCompose} />
      <EmailTabIntro leadName={lead?.name} />
      {header}
      {scheduled.length > 0 && (
        <ScheduledStrip scheduled={scheduled} onCancel={cancelScheduled} />
      )}
      <ScrollArea className="max-h-[480px]">
        <div className="space-y-1.5">
          {flatten
            ? flatEmails.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  expandAllSignal={expandAllSignal}
                  onSuggestResponses={(em, objs) => setResponseDialog({ email: em, objections: objs })}
                  onReply={onReply}
                  onMarkRead={markRead}
                  showMailbox={multipleMailboxes}
                />
              ))
            : threads.map((thread) => (
                <ThreadCard
                  key={thread.threadId}
                  thread={thread}
                  leadId={leadId}
                  lead={lead}
                  expandAllSignal={expandAllSignal}
                  onSuggestResponses={(email, objections) => setResponseDialog({ email, objections })}
                  onReply={onReply}
                  onMarkRead={markRead}
                  leadName={lead?.name}
                  showMailbox={multipleMailboxes}
                />
              ))}
        </div>
      </ScrollArea>

      {responseDialog && (
        <SuggestResponsesDialog
          email={responseDialog.email}
          objections={responseDialog.objections}
          lead={lead}
          onClose={() => setResponseDialog(null)}
          onUseDraft={(draft) => {
            // Copy to clipboard so user can paste in Compose
            navigator.clipboard?.writeText(draft.body).then(
              () => toast.success("Draft copied", { description: "Paste it into Compose to send." }),
              () => toast.info("Draft ready", { description: draft.body.slice(0, 60) + "…" })
            );
            setResponseDialog(null);
            if (onCompose) onCompose();
          }}
        />
      )}
    </div>
  );
}

function ScheduledStrip({ scheduled, onCancel }: { scheduled: LeadEmail[]; onCancel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-md mb-2 bg-secondary/30">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-secondary/50 transition-colors rounded-md"
      >
        <div className="flex items-center gap-2 text-xs">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">{scheduled.length} scheduled email{scheduled.length === 1 ? "" : "s"}</span>
        </div>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {scheduled.map((e) => (
            <div key={e.id} className="flex items-start gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{e.subject || "(no subject)"}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  To: {(e.to_addresses || []).join(", ")}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {e.scheduled_for ? format(new Date(e.scheduled_for), "EEE, MMM d 'at' h:mm a") : ""}
                  {" · "}
                  {e.scheduled_for ? formatDistanceToNow(new Date(e.scheduled_for), { addSuffix: true }) : ""}
                </div>
              </div>
              <Button
                variant="ghost" size="sm"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => onCancel(e.id)}
              >
                <X className="h-3 w-3" /> Cancel
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadCard({ thread, leadId, lead, expandAllSignal, onSuggestResponses, onReply, onMarkRead, leadName, showMailbox }: { thread: ThreadGroup; leadId: string; lead?: Lead; expandAllSignal?: "expand" | "collapse" | null; onSuggestResponses: (email: LeadEmail, objections: DetectedObjection[]) => void; onReply?: (prefill: ReplyPrefill) => void; onMarkRead?: (id: string) => void; leadName?: string; showMailbox?: boolean }) {
  const isSingleEmail = thread.emails.length === 1;
  const unreadCount = thread.emails.filter(e => e.direction === "inbound" && !e.is_read).length;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (expandAllSignal === "expand") setOpen(true);
    else if (expandAllSignal === "collapse") setOpen(false);
  }, [expandAllSignal]);

  // Latest inbound reply preview
  const latestInbound = [...thread.emails]
    .filter(e => e.direction === "inbound")
    .sort((a, b) => new Date(b.email_date).getTime() - new Date(a.email_date).getTime())[0];
  const replyPreview = latestInbound && thread.emails.length > 1 ? latestInbound.body_preview?.trim() : "";
  const truncatedPreview = replyPreview && replyPreview.length > 120 ? replyPreview.slice(0, 120) + "…" : replyPreview;

  // Thread-level signals
  const threadStatus = getThreadStatus(thread.emails, leadName);
  const hasAi = thread.emails.some(e => e.ai_drafted);
  // Pick the earliest sequence step touched in this thread (for display anchor)
  const sequenceStep = thread.emails.find(e => e.sequence_step)?.sequence_step;
  const engagement = computeThreadEngagement(thread.emails);

  // Anchor reply data — used by AI Draft to prefill compose
  const replyAnchor = latestInbound ? {
    to: latestInbound.from_address,
    subject: latestInbound.subject || thread.subject,
    thread_id: latestInbound.thread_id || thread.threadId,
    in_reply_to: latestInbound.message_id || "",
  } : {
    subject: thread.subject,
    thread_id: thread.threadId,
  };

  const handleAiDraft = (prefill: ReplyPrefill & { body?: string }) => {
    if (!onReply) return;
    // Pass body via the quote slot so existing composer surfaces it
    onReply({
      to: prefill.to,
      subject: prefill.subject,
      thread_id: prefill.thread_id,
      in_reply_to: prefill.in_reply_to,
      quote: prefill.body || "",
    });
  };

  if (isSingleEmail) {
    return (
      <div className="space-y-1">
        <EmailRow email={thread.emails[0]} expandAllSignal={expandAllSignal} onSuggestResponses={onSuggestResponses} onReply={onReply} onMarkRead={onMarkRead} showMailbox={showMailbox} />
        {(engagement.isHot || engagement.opens > 2 || engagement.clicks > 0) && (
          <div className="ml-7 mb-1">
            <ThreadAiStrip
              threadId={thread.threadId}
              leadId={leadId}
              threadEmailCount={thread.emails.length}
              threadLatestDate={thread.latestDate}
              onUseDraft={handleAiDraft}
              replyAnchor={replyAnchor}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full text-left">
        <div className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/40 transition-colors">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {unreadCount > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title={`${unreadCount} unread`} />
              )}
              <span className={cn("text-xs truncate", unreadCount > 0 ? "font-semibold" : "font-medium")}>{thread.subject}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {thread.emails.length}
              </Badge>
              {sequenceStep && (
                <Badge variant="secondary" className="text-[9px] shrink-0 font-mono px-1.5 py-0">
                  {sequenceStep}
                </Badge>
              )}
              {hasAi && (
                <Badge variant="secondary" className="text-[9px] shrink-0 gap-0.5">
                  <Sparkles className="h-2.5 w-2.5" />AI
                </Badge>
              )}
              {threadStatus && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] shrink-0",
                    threadStatus.tone === "success" && "text-emerald-600 border-emerald-500/30 bg-emerald-500/5",
                    threadStatus.tone === "muted" && "text-muted-foreground",
                    threadStatus.tone === "auto" && "text-muted-foreground italic",
                  )}
                >
                  {threadStatus.label}
                </Badge>
              )}
            </div>
            {/* Engagement badges row */}
            <ThreadEngagementBadges engagement={engagement} className="mt-1" />
            {truncatedPreview && (
              <div className="text-[10px] text-muted-foreground/80 truncate mt-0.5 italic">
                Last reply · {formatDate(latestInbound.email_date)} · "{truncatedPreview}"
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              {formatDate(thread.latestDate)}
            </div>
          </div>
          <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ExpandedThreadView
          lead={(typeof window !== "undefined" ? (window as any).__currentLead : undefined) as Lead | undefined}
          threadId={thread.threadId}
          threadSubject={thread.subject}
          emails={thread.emails as any}
          threadLatestDate={thread.latestDate}
          onReply={onReply}
          onMarkRead={onMarkRead}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function EmailRow({ email, compact, expandAllSignal, onSuggestResponses, onReply, onMarkRead, showMailbox }: { email: LeadEmail; compact?: boolean; expandAllSignal?: "expand" | "collapse" | null; onSuggestResponses?: (email: LeadEmail, objections: DetectedObjection[]) => void; onReply?: (prefill: ReplyPrefill) => void; onMarkRead?: (id: string) => void; showMailbox?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasFullBody = !!(email.body_html || email.body_text);
  useEffect(() => {
    if (!hasFullBody) return;
    if (expandAllSignal === "expand") setExpanded(true);
    else if (expandAllSignal === "collapse") setExpanded(false);
  }, [expandAllSignal, hasFullBody]);
  const isOutbound = email.direction === "outbound";
  const isUnread = !isOutbound && email.is_read === false;
  const Icon = isOutbound ? ArrowUpRight : ArrowDownLeft;
  const dirColor = isOutbound
    ? "text-blue-600 bg-blue-500/10"
    : "text-emerald-600 bg-emerald-500/10";
  const dirLabel = isOutbound ? "Sent" : "Received";
  const hasAttachments = (email.attachments?.length || 0) > 0;
  // hasFullBody already defined above

  const opensCount = Array.isArray(email.opens) ? email.opens.length : (typeof email.opens === "number" ? email.opens : 0);
  const clicksCount = Array.isArray(email.clicks) ? email.clicks.length : (typeof email.clicks === "number" ? email.clicks : 0);

  // Detect objections in inbound emails only
  const objections: DetectedObjection[] =
    !isOutbound && onSuggestResponses
      ? detectEmailObjections(`${email.subject || ""}\n${email.body_text || email.body_preview || ""}`)
      : [];
  const hasObjections = objections.length > 0;

  return (
    <div className={`rounded-md hover:bg-secondary/30 transition-colors ${compact ? "py-1" : ""}`}>
      <button
        type="button"
        onClick={() => {
          if (hasFullBody) {
            const next = !expanded;
            setExpanded(next);
            if (next && isUnread && onMarkRead) onMarkRead(email.id);
          }
        }}
        className={`w-full text-left flex items-start gap-2 p-2 ${hasFullBody ? "cursor-pointer" : ""}`}
      >
        <div className={`rounded-full p-1 shrink-0 mt-0.5 ${dirColor}`}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isUnread && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Unread" />
            )}
            <span className={cn("text-xs truncate", isUnread ? "font-semibold" : "font-medium")}>
              {compact ? (email.from_name || email.from_address) : (email.subject || "(No subject)")}
            </span>
            {!compact && (
              <Badge variant="outline" className={`text-[9px] shrink-0 ${dirColor}`}>
                {dirLabel}
              </Badge>
            )}
            {email.sequence_step && (
              <Badge variant="secondary" className="text-[9px] shrink-0 font-mono px-1.5 py-0">
                {email.sequence_step}
              </Badge>
            )}
            {email.ai_drafted && (
              <Badge variant="secondary" className="text-[9px] shrink-0 gap-0.5" title="AI-drafted">
                <Sparkles className="h-2.5 w-2.5" />AI
              </Badge>
            )}
            {showMailbox && isOutbound && email.from_address && (
              <Badge variant="outline" className="text-[9px] shrink-0 text-muted-foreground" title={`Sent from ${email.from_address}`}>
                {email.from_address.split("@")[0]}
              </Badge>
            )}
            {email.replied_at && (
              <Badge variant="outline" className="text-[9px] shrink-0 gap-0.5">
                <Reply className="h-2.5 w-2.5" />Replied
              </Badge>
            )}
            {opensCount > 0 && isOutbound && (
              <Badge variant="outline" className="text-[9px] shrink-0 gap-0.5" title={`${opensCount} open${opensCount !== 1 ? "s" : ""}`}>
                <Eye className="h-2.5 w-2.5" />{opensCount}
              </Badge>
            )}
            {clicksCount > 0 && isOutbound && (
              <Badge variant="outline" className="text-[9px] shrink-0 gap-0.5" title={`${clicksCount} click${clicksCount !== 1 ? "s" : ""}`}>
                <MousePointerClick className="h-2.5 w-2.5" />{clicksCount}
              </Badge>
            )}
            {hasObjections && (
              <Badge variant="outline" className="text-[9px] shrink-0 gap-0.5" title={`Objection signals: ${objections.map(o => o.label).join(", ")}`}>
                <AlertCircle className="h-2.5 w-2.5" />{objections[0].label}
              </Badge>
            )}
            {hasAttachments && (
              <Badge variant="outline" className="text-[9px] shrink-0 gap-0.5">
                <Paperclip className="h-2.5 w-2.5" />
                {email.attachments?.length || 1}
              </Badge>
            )}
            {email.bounce_reason && (
              <Badge variant="destructive" className="text-[9px] shrink-0 gap-0.5">
                <AlertCircle className="h-2.5 w-2.5" />Bounced
              </Badge>
            )}
          </div>
          {!compact && (
            <div className="text-[10px] text-muted-foreground truncate">
              {isOutbound ? `To: ${email.to_addresses.join(", ")}` : `From: ${email.from_name || email.from_address}`}
            </div>
          )}
          {email.body_preview && !expanded && (
            <p className="text-[11px] text-muted-foreground/80 line-clamp-2 mt-0.5 leading-relaxed">
              {email.body_preview}
            </p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
          {formatDate(email.email_date)}
        </span>
      </button>
      {expanded && hasFullBody && (
        <div className="px-2 pb-2 ml-7">
          {email.body_html ? (
            <iframe
              srcDoc={`<style>body{font-family:system-ui;font-size:12px;color:#333;margin:0;padding:8px;line-height:1.5}img{max-width:100%}</style>${email.body_html}`}
              sandbox=""
              className="w-full min-h-[200px] border rounded bg-background"
              title="Email body"
            />
          ) : (
            <pre className="text-[11px] whitespace-pre-wrap font-sans text-muted-foreground p-2 bg-secondary/30 rounded">
              {email.body_text}
            </pre>
          )}
          <div className="mt-2 flex justify-end gap-1.5">
            {!isOutbound && onReply && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  const subj = email.subject || "";
                  const replySubj = /^re:/i.test(subj) ? subj : `Re: ${subj}`;
                  const dateStr = new Date(email.email_date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
                  const sender = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;
                  const quoted = (email.body_text || email.body_preview || "")
                    .split("\n").map(l => `> ${l}`).join("\n");
                  const quote = `On ${dateStr}, ${sender} wrote:\n${quoted}`;
                  onReply({
                    to: email.from_address,
                    subject: replySubj,
                    thread_id: email.thread_id || "",
                    in_reply_to: email.message_id || "",
                    quote,
                  });
                }}
              >
                <Reply className="h-3 w-3" /> Reply
              </Button>
            )}
            {hasObjections && onSuggestResponses && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={(e) => { e.stopPropagation(); onSuggestResponses(email, objections); }}
              >
                <Sparkles className="h-3 w-3" /> Suggest 3 responses
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestResponsesDialog({
  email,
  objections,
  lead,
  onClose,
  onUseDraft,
}: {
  email: LeadEmail;
  objections: DetectedObjection[];
  lead?: Lead;
  onClose: () => void;
  onUseDraft: (draft: SuggestedResponse) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<SuggestedResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("suggest-email-responses", {
          body: {
            emailSubject: email.subject,
            emailBody: email.body_text || email.body_preview || "",
            fromName: email.from_name || email.from_address,
            detectedObjections: objections,
            leadContext: lead ? {
              name: lead.name,
              company: lead.company,
              role: lead.role,
              brand: lead.brand,
              stage: lead.stage,
              serviceInterest: lead.serviceInterest,
            } : undefined,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setResponses(data?.responses || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to generate responses");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [email.id]);

  const handleCopy = (r: SuggestedResponse, idx: number) => {
    navigator.clipboard?.writeText(r.body).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Suggested responses
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2 mb-1">
          Detected: <span className="font-medium text-foreground">{objections.map(o => o.label).join(", ")}</span>
        </div>

        {loading && (
          <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Drafting responses…
          </div>
        )}

        {error && (
          <div className="py-4 text-center text-xs text-destructive">{error}</div>
        )}

        {!loading && !error && responses.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">No responses returned.</div>
        )}

        {!loading && responses.length > 0 && (
          <div className="space-y-3">
            {responses.map((r, i) => (
              <div key={i} className="border border-border rounded-md p-3 hover:bg-secondary/20 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <Badge variant="outline" className="text-[10px]">{r.approach}</Badge>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleCopy(r, i)}>
                      {copiedIdx === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedIdx === i ? "Copied" : "Copy"}
                    </Button>
                    <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={() => onUseDraft(r)}>
                      Use
                    </Button>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground mb-1 italic">Re: {r.subject}</div>
                <p className="text-xs leading-relaxed whitespace-pre-line">{r.body}</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
