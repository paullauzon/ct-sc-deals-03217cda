import { useEffect, useState } from "react";
import { Lead, Stakeholder } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Sparkles, Loader2, Save, Copy, Check, Plus, Send, Mail, FileText, Clock, ChevronDown, BookmarkPlus, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, bumpStakeholderContact } from "@/lib/activityLog";
import { toast } from "sonner";
import { format, addHours, set, addDays } from "date-fns";
import { cn } from "@/lib/utils";

interface ReplyContext {
  to?: string;
  subject?: string;
  thread_id?: string;
  in_reply_to?: string;
  quote?: string;
}

interface Props {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  save: (updates: Partial<Lead>) => void;
  presetAction?: "follow-up" | "default";
  replyContext?: ReplyContext | null;
  /** When set, marks the outgoing email as ai_drafted=true and flips the source draft to status='sent'. */
  sourceDraftId?: string | null;
  /** Optional prefill (subject/body) used when opening from an AI draft in the Actions tab. */
  prefill?: { subject?: string; body?: string } | null;
}

interface Mailbox {
  id: string;
  email_address: string;
  user_label: string;
  provider: string;
}

interface TemplateLite {
  id: string;
  name: string;
  brand: string;
  category: string;
  subject_template: string;
  body_template: string;
  usage_count: number;
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

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([a-z_]+)\}\}/gi, (_, key) => {
    const v = vars[key.toLowerCase()];
    return v != null && v !== "" ? v : `{{${key}}}`;
  });
}

function buildVars(lead: Lead, myName: string): Record<string, string> {
  const first = (lead.name || "").trim().split(/\s+/)[0] || "";
  return {
    first_name: first,
    name: lead.name || "",
    company: lead.company || "",
    role: lead.role || "",
    deal_value: lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "",
    stage: lead.stage || "",
    my_name: myName,
  };
}

export function EmailComposeDrawer({ lead, open, onOpenChange, save, presetAction, replyContext, sourceDraftId, prefill }: Props) {
  const [to, setTo] = useState(lead.email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [fromConnectionId, setFromConnectionId] = useState<string>("");
  const [threadId, setThreadId] = useState<string>("");
  const [inReplyTo, setInReplyTo] = useState<string>("");
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("general");
  const [savingTpl, setSavingTpl] = useState(false);
  const [pickTimeOpen, setPickTimeOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date | undefined>(undefined);
  const [pickedTime, setPickedTime] = useState<string>("09:00");

  useEffect(() => {
    if (open) {
      if (replyContext) {
        setTo(replyContext.to || lead.email || "");
        setSubject(replyContext.subject || "");
        setBody(replyContext.quote ? `\n\n${replyContext.quote}` : "");
        setThreadId(replyContext.thread_id || "");
        setInReplyTo(replyContext.in_reply_to || "");
      } else if (prefill && (prefill.subject || prefill.body)) {
        setTo(lead.email || "");
        setSubject(prefill.subject || "");
        setBody(prefill.body || "");
        setThreadId("");
        setInReplyTo("");
      } else {
        setTo(lead.email || "");
        setSubject("");
        setBody("");
        setThreadId("");
        setInReplyTo("");
      }
      (async () => {
        const { data } = await (supabase as any)
          .from("lead_stakeholders")
          .select("*")
          .eq("lead_id", lead.id);
        setStakeholders((data || []) as Stakeholder[]);
      })();
      (async () => {
        const { data } = await supabase
          .from("user_email_connections")
          .select("id, email_address, user_label, provider")
          .eq("is_active", true)
          .order("created_at", { ascending: false });
        const list = (data || []) as Mailbox[];
        setMailboxes(list);
        if (list.length > 0 && !fromConnectionId) setFromConnectionId(list[0].id);
      })();
      (async () => {
        const { data } = await supabase
          .from("email_templates")
          .select("id, name, brand, category, subject_template, body_template, usage_count")
          .or(`brand.eq.${lead.brand},brand.eq.Both`)
          .order("category", { ascending: true })
          .order("usage_count", { ascending: false });
        setTemplates((data || []) as TemplateLite[]);
      })();
      if (presetAction === "follow-up" && !replyContext) {
        setTimeout(() => generate("default"), 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id, replyContext]);

  const myName = (() => {
    const mb = mailboxes.find((m) => m.id === fromConnectionId);
    if (!mb) return "";
    // Strip brand suffix from "First — Brand"
    return mb.user_label.split(/[—-]/)[0].trim();
  })();

  const insertTemplate = async (t: TemplateLite) => {
    const vars = buildVars(lead, myName);
    setSubject(interpolate(t.subject_template, vars));
    setBody(interpolate(t.body_template, vars));
    setPickerOpen(false);
    toast.success(`Template "${t.name}" inserted`);
    // Increment usage count (fire & forget)
    supabase.from("email_templates")
      .update({ usage_count: t.usage_count + 1 })
      .eq("id", t.id)
      .then(() => {});
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) { toast.error("Name is required"); return; }
    if (!subject.trim() && !body.trim()) { toast.error("Subject or body required"); return; }
    setSavingTpl(true);
    try {
      const { error } = await supabase.from("email_templates").insert({
        name: tplName.trim(),
        brand: lead.brand || "Both",
        category: tplCategory,
        subject_template: subject,
        body_template: body,
      });
      if (error) throw error;
      toast.success(`Template "${tplName}" saved`);
      setSaveTplOpen(false);
      setTplName("");
      setTplCategory("general");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSavingTpl(false);
    }
  };

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
      toast.error("Connect a mailbox in Settings first");
      return;
    }
    const selectedMailbox = mailboxes.find(m => m.id === fromConnectionId);
    const sendFn = selectedMailbox?.provider === "outlook" ? "send-outlook-email" : "send-gmail-email";
    setSending(true);
    try {
      const recipients = to.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke(sendFn, {
        body: {
          connection_id: fromConnectionId,
          lead_id: lead.id,
          to: recipients,
          subject,
          body_text: body,
          ...(threadId ? { thread_id: threadId } : {}),
          ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
          ...(sourceDraftId ? { ai_drafted: true, source_draft_id: sourceDraftId } : {}),
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

  const scheduleSend = async (when: Date) => {
    if (!body.trim() || !subject.trim() || !to.trim()) {
      toast.error("Subject, recipient, and body required");
      return;
    }
    if (!fromConnectionId) {
      toast.error("Connect a mailbox in Settings first");
      return;
    }
    if (when.getTime() <= Date.now() + 30_000) {
      toast.error("Pick a time at least 30 seconds from now");
      return;
    }
    setScheduling(true);
    try {
      const recipients = to.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
      const { data, error } = await supabase
        .from("lead_emails")
        .insert({
          lead_id: lead.id,
          direction: "outbound",
          from_address: mailboxes.find(m => m.id === fromConnectionId)?.email_address || "",
          to_addresses: recipients,
          subject,
          body_text: body,
          body_preview: body.slice(0, 200),
          email_date: when.toISOString(),
          scheduled_for: when.toISOString(),
          send_status: "scheduled",
          source: selectedMailbox2?.provider || "gmail",
          thread_id: threadId || null,
          raw_payload: {
            connection_id: fromConnectionId,
            in_reply_to: inReplyTo || null,
          },
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      const undoToast = toast.success(`Scheduled for ${format(when, "EEE, MMM d 'at' h:mm a")}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase.from("lead_emails").delete().eq("id", data.id);
            toast.info("Scheduled email cancelled");
          },
        },
        duration: 5000,
      });
      void undoToast;
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Schedule failed");
    } finally {
      setScheduling(false);
    }
  };

  const handlePickTimeConfirm = () => {
    if (!pickedDate) { toast.error("Pick a date"); return; }
    const [hh, mm] = pickedTime.split(":").map(Number);
    const when = set(pickedDate, { hours: hh, minutes: mm, seconds: 0, milliseconds: 0 });
    setPickTimeOpen(false);
    scheduleSend(when);
  };

  const copyAndMark = async () => {
    const content = `Subject: ${subject}\n\n${body}`;
    const ok = await tryCopy(content);
    if (!ok) { toast.error("Couldn't copy — your browser blocked clipboard access"); return; }
    setCopied(true);
    save({ lastContactDate: new Date().toISOString().split("T")[0] });
    await logActivity(lead.id, "field_update", `Email composed & copied: ${subject}`);
    const recipients = to.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
    if (recipients.length > 0) {
      await bumpStakeholderContact(lead.id, recipients);
    }
    setTimeout(() => setCopied(false), 1500);
    toast.success("Copied to clipboard · last contact bumped");
  };

  const stakeholderOptions = stakeholders.filter(s => s.email && s.email.trim());
  const hasMailbox = mailboxes.length > 0;
  const canSend = !!(body.trim() && subject.trim() && to.trim() && hasMailbox);

  // Group templates by category for the picker
  const groupedTemplates = templates.reduce<Record<string, TemplateLite[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  // Schedule presets
  const tomorrow8 = set(addDays(new Date(), 1), { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 });
  const tomorrow1 = set(addDays(new Date(), 1), { hours: 13, minutes: 0, seconds: 0, milliseconds: 0 });
  const inOneHour = addHours(new Date(), 1);

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
                    {m.email_address}{m.user_label ? ` — ${m.user_label}` : ""} ({m.provider})
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground bg-secondary/40 rounded-md px-2.5 py-2">
                <Mail className="h-3.5 w-3.5" />
                No mailbox connected. Open Settings to connect Gmail or Outlook, or use "Copy & mark sent" below.
              </div>
            )}
          </div>

          {/* Template picker */}
          <div className="flex items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5">
                  <FileText className="h-3 w-3" />
                  Insert template
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                {templates.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    No templates for {lead.brand}. Create some in Settings → Templates.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto py-1">
                    {Object.entries(groupedTemplates).map(([cat, items]) => (
                      <div key={cat}>
                        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/40">
                          {cat}
                        </div>
                        {items.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => insertTemplate(t)}
                            className="w-full text-left px-3 py-2 hover:bg-secondary/60 transition-colors"
                          >
                            <div className="text-xs font-medium">{t.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {t.subject_template || "(no subject)"}
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Popover open={saveTplOpen} onOpenChange={setSaveTplOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 text-[11px] gap-1.5"
                  disabled={!subject.trim() && !body.trim()}
                >
                  <BookmarkPlus className="h-3 w-3" /> Save as template
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-3 space-y-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
                  <Input
                    value={tplName} onChange={(e) => setTplName(e.target.value)}
                    placeholder="e.g. Discovery follow-up"
                    className="h-8 text-xs mt-1"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</Label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value)}
                    className="w-full h-8 mt-1 text-xs bg-background border border-input rounded-md px-2 capitalize"
                  >
                    {["discovery", "follow-up", "proposal", "proof", "re-engage", "scheduling", "general"].map(c =>
                      <option key={c} value={c}>{c}</option>
                    )}
                  </select>
                </div>
                <div className="flex justify-end gap-1.5 pt-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSaveTplOpen(false)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={saveAsTemplate} disabled={savingTpl || !tplName.trim()}>
                    {savingTpl ? "Saving…" : "Save"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
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
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="text-sm font-mono resize-none" placeholder="Write your message or click Generate with AI…" />
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
            {/* Split Send button */}
            <div className="inline-flex">
              <Button
                size="sm"
                className="rounded-r-none"
                onClick={sendNow}
                disabled={!canSend || sending || scheduling}
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                {sending ? "Sending…" : "Send"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-l-none border-l border-primary-foreground/20 px-2"
                    disabled={!canSend || sending || scheduling}
                    title="Schedule send"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Send later
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => scheduleSend(inOneHour)}>
                    <Clock className="h-3.5 w-3.5 mr-2" /> In 1 hour
                    <span className="ml-auto text-[10px] text-muted-foreground">{format(inOneHour, "h:mm a")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => scheduleSend(tomorrow8)}>
                    <Clock className="h-3.5 w-3.5 mr-2" /> Tomorrow 8 AM
                    <span className="ml-auto text-[10px] text-muted-foreground">{format(tomorrow8, "EEE")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => scheduleSend(tomorrow1)}>
                    <Clock className="h-3.5 w-3.5 mr-2" /> Tomorrow 1 PM
                    <span className="ml-auto text-[10px] text-muted-foreground">{format(tomorrow1, "EEE")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => { e.preventDefault(); setPickTimeOpen(true); }}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-2" /> Pick date & time…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Pick date & time popover */}
        <Popover open={pickTimeOpen} onOpenChange={setPickTimeOpen}>
          <PopoverTrigger asChild>
            <span className="hidden" />
          </PopoverTrigger>
          <PopoverContent align="end" side="top" className="w-auto p-3 space-y-2">
            <Calendar
              mode="single"
              selected={pickedDate}
              onSelect={setPickedDate}
              initialFocus
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              className={cn("p-0 pointer-events-auto")}
            />
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Time</Label>
              <Input
                type="time"
                value={pickedTime}
                onChange={(e) => setPickedTime(e.target.value)}
                className="h-8 text-xs w-32"
              />
            </div>
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPickTimeOpen(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={handlePickTimeConfirm} disabled={!pickedDate || scheduling}>
                {scheduling ? "Scheduling…" : "Schedule"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </SheetContent>
    </Sheet>
  );
}
