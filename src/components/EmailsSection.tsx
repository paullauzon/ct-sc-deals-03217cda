import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowUpRight, ArrowDownLeft, ChevronDown, Mail, Paperclip, Reply, AlertCircle, PenSquare } from "lucide-react";

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
  replied_at?: string | null;
  bounce_reason?: string;
  email_date: string;
  source: string;
  created_at: string;
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

export function EmailsSection({ leadId, onCompose }: { leadId: string; onCompose?: () => void }) {
  const [emails, setEmails] = useState<LeadEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchEmails() {
      const { data, error } = await supabase
        .from("lead_emails")
        .select("*")
        .eq("lead_id", leadId)
        .order("email_date", { ascending: false })
        .limit(100);

      if (!cancelled) {
        if (data) setEmails(data as unknown as LeadEmail[]);
        if (error) console.error("Error fetching emails:", error);
        setLoading(false);
      }
    }

    fetchEmails();

    // Realtime subscription
    const channel = supabase
      .channel(`lead-emails-${leadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_emails", filter: `lead_id=eq.${leadId}` },
        (payload) => {
          const newEmail = payload.new as unknown as LeadEmail;
          setEmails((prev) => [newEmail, ...prev]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const header = onCompose ? (
    <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Email Correspondence{emails.length > 0 ? ` (${emails.length})` : ""}
        </h3>
      </div>
      <Button variant="outline" size="sm" onClick={onCompose} className="h-7 text-xs gap-1.5">
        <PenSquare className="h-3 w-3" /> Compose
      </Button>
    </div>
  ) : null;

  if (loading) {
    return (
      <div>
        {header}
        <div className="text-xs text-muted-foreground/60 text-center py-4">
          Loading emails...
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div>
        {header}
        <p className="text-xs text-muted-foreground/60 text-center py-4">
          No emails yet. {onCompose ? "Click Compose to start a conversation, or " : ""}connect Gmail/Outlook via Zapier to see correspondence here.
        </p>
      </div>
    );
  }

  const threads = groupByThread(emails);

  return (
    <div>
      {header}
      <ScrollArea className="max-h-[480px]">
        <div className="space-y-1.5">
          {threads.map((thread) => (
            <ThreadCard key={thread.threadId} thread={thread} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ThreadCard({ thread }: { thread: ThreadGroup }) {
  const isSingleEmail = thread.emails.length === 1;

  if (isSingleEmail) {
    return <EmailRow email={thread.emails[0]} />;
  }

  return (
    <Collapsible>
      <CollapsibleTrigger className="w-full text-left">
        <div className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/40 transition-colors">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium truncate">{thread.subject}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {thread.emails.length}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {formatDate(thread.latestDate)}
            </div>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 transition-transform" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-4 space-y-0.5 border-l-2 border-border ml-3 mt-1 mb-2">
          {thread.emails.map((email) => (
            <EmailRow key={email.id} email={email} compact />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EmailRow({ email, compact }: { email: LeadEmail; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isOutbound = email.direction === "outbound";
  const Icon = isOutbound ? ArrowUpRight : ArrowDownLeft;
  const dirColor = isOutbound
    ? "text-blue-600 bg-blue-500/10"
    : "text-emerald-600 bg-emerald-500/10";
  const dirLabel = isOutbound ? "Sent" : "Received";
  const hasAttachments = (email.attachments?.length || 0) > 0;
  const hasFullBody = !!(email.body_html || email.body_text);

  return (
    <div className={`rounded-md hover:bg-secondary/30 transition-colors ${compact ? "py-1" : ""}`}>
      <button
        type="button"
        onClick={() => hasFullBody && setExpanded((v) => !v)}
        className={`w-full text-left flex items-start gap-2 p-2 ${hasFullBody ? "cursor-pointer" : ""}`}
      >
        <div className={`rounded-full p-1 shrink-0 mt-0.5 ${dirColor}`}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium truncate">
              {compact ? (email.from_name || email.from_address) : (email.subject || "(No subject)")}
            </span>
            {!compact && (
              <Badge variant="outline" className={`text-[9px] shrink-0 ${dirColor}`}>
                {dirLabel}
              </Badge>
            )}
            {email.replied_at && (
              <Badge variant="outline" className="text-[9px] shrink-0 gap-0.5">
                <Reply className="h-2.5 w-2.5" />Replied
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
        </div>
      )}
    </div>
  );
}
