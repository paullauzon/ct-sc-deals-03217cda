import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Reply, Sparkles, Forward, Star, Link2, Loader2, ExternalLink, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ReplyPrefill } from "@/components/EmailsSection";

interface Email {
  id: string;
  thread_id?: string;
  message_id?: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  body_preview?: string;
  email_date: string;
}

interface Props {
  email: Email;
  onReply?: (prefill: ReplyPrefill) => void;
  onLinkToField?: (quote: string, sourceExcerpt: string) => void;
  onMarkImportant?: (id: string, next: boolean) => void;
  isImportant?: boolean;
}

/** Quote a message inline-reply style. */
function buildReplyQuote(email: Email): string {
  const dateStr = new Date(email.email_date).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  const sender = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;
  const quoted = (email.body_text || email.body_preview || "")
    .split("\n").map(l => `> ${l}`).join("\n");
  return `On ${dateStr}, ${sender} wrote:\n${quoted}`;
}

export function MessageActionBar({
  email,
  onReply,
  onLinkToField,
  onMarkImportant,
  isImportant,
}: Props) {
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = email.body_text || email.body_preview || "";
    if (!text) { toast.info("No plain text body to copy"); return; }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const handleViewOriginal = () => {
    const html = email.body_html;
    if (!html) {
      toast.info("Original HTML not stored for this message");
      return;
    }
    const win = window.open("", "_blank");
    if (!win) { toast.error("Popup blocked — allow popups to view original"); return; }
    win.document.write(`<!doctype html><html><head><title>${(email.subject || "Email").replace(/[<>]/g, "")}</title>
<style>body{font-family:system-ui;font-size:14px;color:#222;margin:0;padding:18px;line-height:1.5}img{max-width:100%}a{color:#1d4ed8}</style>
</head><body><div style="max-width:720px;margin:0 auto"><h2 style="font-size:16px;margin:0 0 12px">${(email.subject || "").replace(/[<>]/g, "")}</h2>
<div style="font-size:12px;color:#666;margin-bottom:12px">From: ${(email.from_name || email.from_address || "").replace(/[<>]/g, "")} · ${new Date(email.email_date).toLocaleString()}</div>
${html}</div></body></html>`);
    win.document.close();
  };

  const handleReply = () => {
    if (!onReply) return;
    const subj = email.subject || "";
    const replySubj = /^re:/i.test(subj) ? subj : `Re: ${subj}`;
    onReply({
      to: email.from_address,
      subject: replySubj,
      thread_id: email.thread_id || "",
      in_reply_to: email.message_id || "",
      quote: buildReplyQuote(email),
    });
  };

  const handleAiReply = async () => {
    if (!onReply) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-email-thread", {
        body: { threadId: email.thread_id || email.id, force: false },
      });
      if (error) throw error;
      const intel = data?.intelligence;
      const subj = email.subject || "";
      const replySubj = intel?.recommended_subject || (/^re:/i.test(subj) ? subj : `Re: ${subj}`);
      onReply({
        to: email.from_address,
        subject: replySubj,
        thread_id: email.thread_id || "",
        in_reply_to: email.message_id || "",
        quote: intel?.recommended_body || buildReplyQuote(email),
      });
    } catch (e: any) {
      toast.error(e?.message || "AI reply unavailable");
      // Fall back to plain reply
      handleReply();
    } finally {
      setAiLoading(false);
    }
  };

  const handleForward = () => {
    if (!onReply) return;
    const subj = email.subject || "";
    const fwdSubj = /^fwd?:/i.test(subj) ? subj : `Fwd: ${subj}`;
    onReply({
      to: "",
      subject: fwdSubj,
      thread_id: "",
      in_reply_to: "",
      quote: `---------- Forwarded message ----------\nFrom: ${email.from_name || email.from_address}\nDate: ${new Date(email.email_date).toLocaleString()}\nSubject: ${email.subject || ""}\n\n${email.body_text || email.body_preview || ""}`,
    });
  };

  const handleLinkField = () => {
    if (!onLinkToField) return;
    const body = email.body_text || email.body_preview || "";
    // Try to capture user-selected text first
    const sel = typeof window !== "undefined" ? window.getSelection?.()?.toString().trim() : "";
    const quote = sel || body.slice(0, 200);
    onLinkToField(quote, body);
  };

  return (
    <div className="flex items-center flex-wrap gap-1 pt-1.5">
      {email.direction === "inbound" && onReply && (
        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" onClick={handleReply}>
          <Reply className="h-3 w-3" /> Reply
        </Button>
      )}
      {email.direction === "inbound" && onReply && (
        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" onClick={handleAiReply} disabled={aiLoading}>
          {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          AI reply
        </Button>
      )}
      {onReply && (
        <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1.5 text-muted-foreground" onClick={handleForward}>
          <Forward className="h-3 w-3" /> Forward
        </Button>
      )}
      {onMarkImportant && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] gap-1.5 text-muted-foreground"
          onClick={() => onMarkImportant(email.id, !isImportant)}
          title={isImportant ? "Unmark important" : "Mark important"}
        >
          <Star className={isImportant ? "h-3 w-3 fill-current" : "h-3 w-3"} />
          {isImportant ? "Important" : "Mark important"}
        </Button>
      )}
      {onLinkToField && (
        <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1.5 text-muted-foreground" onClick={handleLinkField} title="Attach a quote to a CRM field">
          <Link2 className="h-3 w-3" /> Link to deal field
        </Button>
      )}
    </div>
  );
}
