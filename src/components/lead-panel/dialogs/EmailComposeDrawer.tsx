import { useEffect, useState } from "react";
import { Lead, Stakeholder } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Save, Copy, Check, Plus, Send, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, bumpStakeholderContact } from "@/lib/activityLog";
import { toast } from "sonner";

interface Props {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  save: (updates: Partial<Lead>) => void;
  /** Optional preset action passed when launched from "Draft follow-up" chip */
  presetAction?: "follow-up" | "default";
}

interface Mailbox {
  id: string;
  email_address: string;
  user_label: string;
}

async function tryCopy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

export function EmailComposeDrawer({ lead, open, onOpenChange, save, presetAction }: Props) {
  const [to, setTo] = useState(lead.email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [fromConnectionId, setFromConnectionId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setTo(lead.email || "");
      setSubject("");
      setBody("");
      // Load stakeholders for the chip strip
      (async () => {
        const { data } = await (supabase as any)
          .from("lead_stakeholders")
          .select("*")
          .eq("lead_id", lead.id);
        setStakeholders((data || []) as Stakeholder[]);
      })();
      // Load active mailboxes for sender picker
      (async () => {
        const { data } = await supabase
          .from("user_email_connections")
          .select("id, email_address, user_label")
          .eq("provider", "gmail")
          .eq("is_active", true)
          .order("created_at", { ascending: false });
        const list = (data || []) as Mailbox[];
        setMailboxes(list);
        if (list.length > 0 && !fromConnectionId) setFromConnectionId(list[0].id);
      })();
      if (presetAction === "follow-up") {
        setTimeout(() => generate("default"), 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id]);

  const addRecipient = (email: string) => {
    if (!email) return;
    const list = to.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
    if (list.includes(email)) return;
    list.push(email);
    setTo(list.join(", "));
  };

  const generate = async (actionType: "default" | "follow-up" = "default") => {
    setGenerating(true);
    try {
      const meetings = lead.meetings || [];
      const lastMeeting = meetings[meetings.length - 1] || null;
      const { data, error } = await supabase.functions.invoke("draft-followup", {
        body: {
          meeting: lastMeeting || { title: "Outreach", date: new Date().toISOString(), summary: lead.message || `Follow-up to ${lead.name}` },
          leadFields: {
            name: lead.name, role: lead.role, company: lead.company, brand: lead.brand,
            serviceInterest: lead.serviceInterest, targetCriteria: lead.targetCriteria,
            targetRevenue: lead.targetRevenue, geography: lead.geography, stage: lead.stage,
            assignedTo: lead.assignedTo,
          },
          dealIntelligence: lead.dealIntelligence,
          actionType,
        },
      });
      if (error) throw error;
      const text = data?.email || "";
      const lines = text.split("\n");
      const subj = lines[0]?.replace(/^subject:\s*/i, "").trim();
      const rest = lines.slice(1).join("\n").trim();
      if (subj) setSubject(subj);
      setBody(rest || text);
      toast.success("Draft generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate draft");
    } finally {
      setGenerating(false);
    }
  };

  const saveDraft = async () => {
    if (!body.trim()) return;
    setSavingDraft(true);
    try {
      const content = `Subject: ${subject}\n\n${body}`;
      await supabase.from("lead_drafts").insert({
        lead_id: lead.id,
        draft_type: "email",
        action_key: "manual-compose",
        context_label: subject || "Manual compose",
        content,
        status: "draft",
      } as any);
      await logActivity(lead.id, "field_update", `Draft saved: ${subject || "(no subject)"}`);
      toast.success("Draft saved");
      onOpenChange(false);
    } finally {
      setSavingDraft(false);
    }
  };

  const sendNow = async () => {
    if (!body.trim() || !subject.trim() || !to.trim()) {
      toast.error("Subject, recipient, and body required");
      return;
    }
    if (!fromConnectionId) {
      toast.error("Connect a Gmail mailbox in Settings first");
      return;
    }
    setSending(true);
    try {
      const recipients = to.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("send-gmail-email", {
        body: {
          connection_id: fromConnectionId,
          lead_id: lead.id,
          to: recipients,
          subject,
          body_text: body,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Send failed");
      save({ lastContactDate: new Date().toISOString().split("T")[0] });
      await logActivity(lead.id, "field_update", `Email sent: ${subject}`);
      if (recipients.length > 0) await bumpStakeholderContact(lead.id, recipients);
      toast.success("Email sent");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const copyAndMark = async () => {
    const content = `Subject: ${subject}\n\n${body}`;
    const ok = await tryCopy(content);
    if (!ok) { toast.error("Couldn't copy — your browser blocked clipboard access"); return; }
    setCopied(true);
    save({ lastContactDate: new Date().toISOString().split("T")[0] });
    await logActivity(lead.id, "field_update", `Email composed & copied: ${subject}`);
    // Auto-bump stakeholder last_contacted for any matching recipients
    const recipients = to.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
    if (recipients.length > 0) {
      await bumpStakeholderContact(lead.id, recipients);
    }
    setTimeout(() => setCopied(false), 1500);
    toast.success("Copied to clipboard · last contact bumped");
  };

  const stakeholderOptions = stakeholders.filter(s => s.email && s.email.trim());
  const hasMailbox = mailboxes.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
          <SheetTitle className="text-sm font-semibold">Compose email · {lead.name}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</label>
            {hasMailbox ? (
              <select
                value={fromConnectionId}
                onChange={(e) => setFromConnectionId(e.target.value)}
                className="w-full h-9 mt-1 text-sm bg-background border border-input rounded-md px-2"
              >
                {mailboxes.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.email_address}{m.user_label ? ` — ${m.user_label}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground bg-secondary/40 rounded-md px-2.5 py-2">
                <Mail className="h-3.5 w-3.5" />
                No mailbox connected. Open Settings to connect Gmail, or use "Copy & mark sent" below.
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-sm mt-1" />
            {stakeholderOptions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-[10px] text-muted-foreground/70 self-center mr-0.5">Add:</span>
                {stakeholderOptions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addRecipient(s.email)}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-foreground/80 hover:bg-secondary/80 transition-colors"
                    title={`Add ${s.email}`}
                  >
                    <Plus className="h-2.5 w-2.5" />
                    {s.name || s.email}
                    {s.role && <span className="text-muted-foreground">· {s.role}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" className="h-9 text-sm mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Body</label>
              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => generate("default")} disabled={generating}>
                {generating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                {generating ? "Generating…" : (body ? "Regenerate" : "Generate with AI")}
              </Button>
            </div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="text-sm font-mono resize-none" placeholder="Write your message or click Generate with AI…" />
          </div>
        </div>
        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2 shrink-0 bg-background">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={saveDraft} disabled={!body.trim() || savingDraft}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {savingDraft ? "Saving…" : "Save draft"}
            </Button>
            <Button variant="outline" size="sm" onClick={copyAndMark} disabled={!body.trim()}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
              Copy & mark sent
            </Button>
            <Button size="sm" onClick={sendNow} disabled={!body.trim() || !subject.trim() || !to.trim() || sending || !hasMailbox}>
              {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
