// Phase 4 — Compose v2.
// Layout matches the wireframe:
//   • Top metadata bar (From / To / Re / Sequence)
//   • AI context panel listing variables + proof points
//   • 3 draft cards side-by-side (recommended badge on one)
//   • Selected draft expands into editable surface with inline writing tools
//   • Send / Schedule / Save as variant
//
// Variable handling: drafts contain [bracket_tokens] which are displayed as
// chips. Missing values turn the chip red and block sending.
import { useEffect, useMemo, useRef, useState } from "react";
import { Lead, Stakeholder } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Sparkles, Loader2, Save, Send, Mail, ChevronDown, BookmarkPlus,
  Wand2, Scissors, Plus, Layers, AlertTriangle, RefreshCw,
  Eye, EyeOff, ArrowLeftRight, Paperclip, X as XIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity, bumpStakeholderContact } from "@/lib/activityLog";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  buildVariableMap, extractVariables, missingVariables,
  resolveVariables, variableLabel, type VariableMap,
} from "@/lib/emailVariables";
import { SmartScheduler } from "@/components/lead-panel/SmartScheduler";
import { logComposeEvent } from "@/lib/composeLearning";
import { Switch } from "@/components/ui/switch";
import { ShieldOff } from "lucide-react";

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
  sourceDraftId?: string | null;
  prefill?: { subject?: string; body?: string } | null;
}

interface Mailbox {
  id: string;
  email_address: string;
  user_label: string;
  provider: string;
}

type Approach = "direct" | "data_led" | "question_led";

interface DraftCard {
  approach: Approach;
  label: string;
  rationale: string;
  subject: string;
  body: string;
  proof_points_used: string[];
}

const APPROACH_LABEL: Record<Approach, string> = {
  direct: "Direct ask",
  data_led: "Proof-led",
  question_led: "Open question",
};

const SEQUENCE_OPTIONS = [
  { value: "free_form", label: "Free-form (no sequence)" },
  { value: "follow_up", label: "Follow-up" },
  { value: "stall_response", label: "Re-engage stalled deal" },
  { value: "outreach", label: "First-touch outreach" },
  { value: "objection", label: "Handle objection" },
];

export function EmailComposerV2({
  lead, open, onOpenChange, save, presetAction, replyContext, sourceDraftId, prefill,
}: Props) {
  // Header / routing state
  const [to, setTo] = useState(lead.email || "");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [fromConnectionId, setFromConnectionId] = useState<string>("");
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [threadId, setThreadId] = useState<string>("");
  const [inReplyTo, setInReplyTo] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("free_form");
  const [customInstruction, setCustomInstruction] = useState<string>("");

  // Drafts state
  const [drafts, setDrafts] = useState<DraftCard[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [generating, setGenerating] = useState(false);
  const [recommendedApproach, setRecommendedApproach] = useState<Approach>("direct");
  const [aiVariables, setAiVariables] = useState<VariableMap>({});

  // Editable working copy of the selected draft
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [refining, setRefining] = useState<string | null>(null); // mode key while refining
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Send / schedule state
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // Save-as-template
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("general");
  const [savingTpl, setSavingTpl] = useState(false);

  // Add-proof popover
  const [proofOpen, setProofOpen] = useState(false);
  const [proofText, setProofText] = useState("");

  // Phase 6 — learning loop
  const [doNotTrain, setDoNotTrain] = useState(false);
  // Snapshot of the body/subject as the AI delivered it for the selected draft.
  // Used to compute edit-distance when the user finally sends.
  const initialSnapshotRef = useRef<{ subject: string; body: string }>({ subject: "", body: "" });

  // Phase 8 — tracking pref (per-mailbox), stakeholder popover, attachments
  const [trackingEnabled, setTrackingEnabled] = useState<boolean>(true);
  const [stakeholderPopOpen, setStakeholderPopOpen] = useState(false);
  const [stakeholderQuery, setStakeholderQuery] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [uploadingAtt, setUploadingAtt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ───────── Load on open ─────────
  useEffect(() => {
    if (!open) return;
    // Reset core state
    setDrafts([]);
    setSelectedIdx(0);
    setSubject(prefill?.subject || replyContext?.subject || "");
    setBody(prefill?.body || (replyContext?.quote ? `\n\n${replyContext.quote}` : ""));
    setTo(replyContext?.to || lead.email || "");
    setThreadId(replyContext?.thread_id || "");
    setInReplyTo(replyContext?.in_reply_to || "");
    setPurpose(replyContext ? "follow_up" : (presetAction === "follow-up" ? "follow_up" : "free_form"));
    setCustomInstruction("");

    (async () => {
      const { data } = await (supabase as any)
        .from("lead_stakeholders").select("*").eq("lead_id", lead.id);
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
      if (list.length > 0) setFromConnectionId(prev => prev || list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id, replyContext?.thread_id]);

  // Phase 8 — load tracking preference for the selected mailbox
  useEffect(() => {
    if (!fromConnectionId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("mailbox_preferences")
        .select("tracking_enabled")
        .eq("connection_id", fromConnectionId)
        .maybeSingle();
      if (!cancelled) setTrackingEnabled(data?.tracking_enabled ?? true);
    })();
    return () => { cancelled = true; };
  }, [fromConnectionId]);

  const toggleTracking = async (next: boolean) => {
    setTrackingEnabled(next);
    if (!fromConnectionId) return;
    const { error } = await (supabase as any)
      .from("mailbox_preferences")
      .upsert({ connection_id: fromConnectionId, tracking_enabled: next, updated_at: new Date().toISOString() }, { onConflict: "connection_id" });
    if (error) toast.error("Could not save tracking preference");
    else toast.success(`Open/click tracking ${next ? "ON" : "OFF"} for this mailbox`);
  };

  // Phase 8 — switch sender brand: pick the next mailbox of the other brand if available
  const currentMailbox = mailboxes.find(m => m.id === fromConnectionId);
  const isCaptarget = (m: Mailbox) => /captarget/i.test(`${m.email_address} ${m.user_label}`);
  const isSourceCo = (m: Mailbox) => /source/i.test(`${m.email_address} ${m.user_label}`);
  const otherBrandMailbox = useMemo(() => {
    if (!currentMailbox) return null;
    if (isCaptarget(currentMailbox)) return mailboxes.find(isSourceCo) || null;
    if (isSourceCo(currentMailbox)) return mailboxes.find(isCaptarget) || null;
    // Fallback: if labels don't carry brand, just pick any other mailbox
    return mailboxes.find(m => m.id !== currentMailbox.id) || null;
  }, [currentMailbox, mailboxes]);
  const switchSenderBrand = () => {
    if (!otherBrandMailbox) return;
    setFromConnectionId(otherBrandMailbox.id);
    toast.success(`Switched sender to ${otherBrandMailbox.email_address}`);
  };

  // Phase 8 — attachment upload to email-attachments bucket
  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingAtt(true);
    try {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name} exceeds 20MB`); continue; }
        const path = `${lead.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("email-attachments").upload(path, file, { upsert: false });
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); continue; }
        const { data: pub } = supabase.storage.from("email-attachments").getPublicUrl(path);
        setAttachments(prev => [...prev, { name: file.name, url: pub.publicUrl, size: file.size }]);
      }
      toast.success("Attachment(s) added");
    } finally {
      setUploadingAtt(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  // ───────── Variable resolution ─────────
  const senderName = useMemo(() => {
    const mb = mailboxes.find(m => m.id === fromConnectionId);
    if (!mb) return "";
    return mb.user_label.split(/[—-]/)[0].trim();
  }, [mailboxes, fromConnectionId]);

  const variables = useMemo(() => {
    // Local map ALWAYS wins over stale AI map (sender can change after gen)
    const local = buildVariableMap(lead, senderName);
    return { ...aiVariables, ...local };
  }, [lead, senderName, aiVariables]);

  const resolvedSubject = useMemo(() => resolveVariables(subject, variables), [subject, variables]);
  const resolvedBody = useMemo(() => resolveVariables(body, variables), [body, variables]);
  const missingVars = useMemo(
    () => Array.from(new Set([...missingVariables(subject, variables), ...missingVariables(body, variables)])),
    [subject, body, variables],
  );
  const referencedVars = useMemo(
    () => Array.from(new Set([...extractVariables(subject), ...extractVariables(body)])),
    [subject, body],
  );

  // ───────── Generate 3 drafts ─────────
  const generateDrafts = async (override?: { customInstruction?: string; purpose?: string }) => {
    setGenerating(true);
    try {
      // Build last-inbound excerpt if we're replying
      const lastInboundExcerpt = replyContext?.quote?.slice(0, 800) || "";
      const { data, error } = await supabase.functions.invoke("compose-email-drafts", {
        body: {
          lead: {
            id: lead.id,
            name: lead.name,
            company: lead.company,
            email: lead.email,
            role: lead.role,
            brand: lead.brand,
            stage: lead.stage,
            serviceInterest: lead.serviceInterest,
            targetCriteria: (lead as any).targetCriteria,
            geography: (lead as any).geography,
            targetRevenue: (lead as any).targetRevenue,
            ebitdaMin: (lead as any).ebitdaMin,
            ebitdaMax: (lead as any).ebitdaMax,
            dealValue: lead.dealValue,
            daysInCurrentStage: (lead as any).daysInCurrentStage,
            stallReason: (lead as any).stallReason,
            nextMutualStep: (lead as any).nextMutualStep,
            forecastedCloseDate: (lead as any).forecastedCloseDate,
            competingBankers: (lead as any).competingBankers,
            decisionBlocker: (lead as any).decisionBlocker,
            firefliesSummary: (lead as any).firefliesSummary,
            firefliesNextSteps: (lead as any).firefliesNextSteps,
            dealNarrative: (lead as any).dealNarrative,
          },
          context: {
            purpose: override?.purpose || purpose,
            sequenceStep: replyContext ? "reply" : undefined,
            lastInboundExcerpt: lastInboundExcerpt || undefined,
            senderName,
            customInstruction: override?.customInstruction || customInstruction || undefined,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const list: DraftCard[] = data?.drafts || [];
      if (list.length === 0) throw new Error("AI returned no drafts");
      setDrafts(list);
      setRecommendedApproach((data?.recommendedApproach as Approach) || "direct");
      setAiVariables(data?.variables || {});
      setSelectedIdx(0);
      setSubject(list[0].subject);
      setBody(list[0].body);
      initialSnapshotRef.current = { subject: list[0].subject, body: list[0].body };
      toast.success("3 drafts ready");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate drafts");
    } finally {
      setGenerating(false);
    }
  };

  const selectDraft = (i: number) => {
    if (i === selectedIdx) return;
    setSelectedIdx(i);
    setSubject(drafts[i].subject);
    setBody(drafts[i].body);
    initialSnapshotRef.current = { subject: drafts[i].subject, body: drafts[i].body };
  };

  // ───────── Inline writing tools ─────────
  const refineBody = async (mode: "improve" | "shorten" | "expand" | "soften" | "strengthen" | "add_proof", proofPoint?: string) => {
    if (!body.trim()) { toast.error("Nothing to rewrite"); return; }
    setRefining(mode);
    try {
      const { data, error } = await supabase.functions.invoke("refine-email-line", {
        body: { text: body, fullBody: body, mode, proofPoint },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.rewritten) setBody(data.rewritten);
      toast.success(`Body ${mode === "shorten" ? "shortened" : mode === "improve" ? "improved" : mode === "expand" ? "expanded" : mode === "add_proof" ? "updated with proof" : `rewritten (${mode})`}`);
    } catch (e: any) {
      toast.error(e.message || "Rewrite failed");
    } finally {
      setRefining(null);
    }
  };

  const handleAddProof = async () => {
    if (!proofText.trim()) { toast.error("Enter a proof point"); return; }
    setProofOpen(false);
    await refineBody("add_proof", proofText.trim());
    setProofText("");
  };

  // ───────── Send / Schedule ─────────
  const hasMailbox = mailboxes.length > 0;
  const canSend = !!(resolvedBody.trim() && resolvedSubject.trim() && to.trim() && hasMailbox && missingVars.length === 0);

  const sendNow = async () => {
    if (!canSend) {
      if (missingVars.length > 0) toast.error(`Fill in: ${missingVars.map(variableLabel).join(", ")}`);
      else toast.error("Subject, recipient, body, and a mailbox are required");
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
          subject: resolvedSubject,
          body_text: resolvedBody,
          ...(threadId ? { thread_id: threadId } : {}),
          ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
          ...(drafts.length > 0 ? { ai_drafted: true } : {}),
          ...(sourceDraftId ? { source_draft_id: sourceDraftId } : {}),
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Send failed");
      save({ lastContactDate: new Date().toISOString().split("T")[0] });
      await logActivity(lead.id, "field_update", `Email sent: ${resolvedSubject}`);
      if (recipients.length > 0) await bumpStakeholderContact(lead.id, recipients);
      // Phase 6 — capture compose event for the learning loop
      await logComposeEvent({
        leadId: lead.id,
        emailId: (data as any)?.email_id || (data as any)?.id || null,
        brand: lead.brand,
        stage: lead.stage,
        firmType: (lead as any).buyerType || (lead as any).firmAum || "",
        purpose,
        draftsOffered: drafts.map(d => ({ approach: d.approach, label: d.label, subject: d.subject, body: d.body })),
        recommendedApproach,
        draftPicked: drafts.length === 0 ? "scratch" : drafts[selectedIdx].approach,
        pickedIndex: drafts.length === 0 ? -1 : selectedIdx,
        initialSubject: initialSnapshotRef.current.subject,
        initialBody: initialSnapshotRef.current.body,
        finalSubject: subject,
        finalBody: body,
        sent: true,
        scheduled: false,
        doNotTrain,
        model: "google/gemini-3-flash-preview",
      });
      toast.success("Email sent");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const scheduleSend = async (when: Date) => {
    if (!canSend) {
      if (missingVars.length > 0) toast.error(`Fill in: ${missingVars.map(variableLabel).join(", ")}`);
      else toast.error("Subject, recipient, body, and a mailbox are required");
      return;
    }
    if (when.getTime() <= Date.now() + 30_000) {
      toast.error("Pick a time at least 30 seconds from now");
      return;
    }
    setScheduling(true);
    try {
      const recipients = to.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
      const mailbox = mailboxes.find(m => m.id === fromConnectionId);
      const { data, error } = await supabase
        .from("lead_emails")
        .insert({
          lead_id: lead.id,
          direction: "outbound",
          from_address: mailbox?.email_address || "",
          to_addresses: recipients,
          subject: resolvedSubject,
          body_text: resolvedBody,
          body_preview: resolvedBody.slice(0, 200),
          email_date: when.toISOString(),
          scheduled_for: when.toISOString(),
          send_status: "scheduled",
          source: mailbox?.provider || "gmail",
          thread_id: threadId || null,
          ai_drafted: drafts.length > 0,
          raw_payload: {
            connection_id: fromConnectionId,
            in_reply_to: inReplyTo || null,
          },
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      // Phase 6 — capture compose event for scheduled sends as well
      await logComposeEvent({
        leadId: lead.id,
        emailId: (data as any)?.id || null,
        brand: lead.brand,
        stage: lead.stage,
        firmType: (lead as any).buyerType || "",
        purpose,
        draftsOffered: drafts.map(d => ({ approach: d.approach, label: d.label, subject: d.subject, body: d.body })),
        recommendedApproach,
        draftPicked: drafts.length === 0 ? "scratch" : drafts[selectedIdx].approach,
        pickedIndex: drafts.length === 0 ? -1 : selectedIdx,
        initialSubject: initialSnapshotRef.current.subject,
        initialBody: initialSnapshotRef.current.body,
        finalSubject: subject,
        finalBody: body,
        sent: true,
        scheduled: true,
        doNotTrain,
        model: "google/gemini-3-flash-preview",
      });
      toast.success(`Scheduled for ${format(when, "EEE, MMM d 'at' h:mm a")}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase.from("lead_emails").delete().eq("id", data.id);
            toast.info("Scheduled email cancelled");
          },
        },
        duration: 5000,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Schedule failed");
    } finally {
      setScheduling(false);
    }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) { toast.error("Name is required"); return; }
    if (!subject.trim() && !body.trim()) { toast.error("Subject or body required"); return; }
    setSavingTpl(true);
    try {
      // Save with the [bracket_tokens] preserved so the template is reusable.
      const { error } = await supabase.from("email_templates").insert({
        name: tplName.trim(),
        brand: lead.brand || "Both",
        category: tplCategory,
        subject_template: subject.replace(/\[([a-z_]+)\]/gi, "{{$1}}"),
        body_template: body.replace(/\[([a-z_]+)\]/gi, "{{$1}}"),
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

  // Primary recipient drives per-contact send-time intelligence
  const primaryRecipient = useMemo(
    () => to.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean)[0] || lead.email || "",
    [to, lead.email],
  );

  const stakeholderOptions = stakeholders.filter(s => s.email && s.email.trim());

  // ───────── Available proof points (drives "Add proof" suggestions) ─────────
  const proofBank: string[] = useMemo(() => {
    const arr: string[] = [];
    const fSummary = (lead as any).firefliesSummary as string | undefined;
    const fNext = (lead as any).firefliesNextSteps as string | undefined;
    const dn = (lead as any).dealNarrative as string | undefined;
    const tc = (lead as any).targetCriteria as string | undefined;
    if (fSummary) arr.push(`Last call: ${fSummary.slice(0, 140)}`);
    if (fNext) arr.push(`Agreed next: ${fNext.slice(0, 140)}`);
    if (dn) arr.push(`Narrative: ${dn.slice(0, 140)}`);
    if (tc) arr.push(`Criteria: ${tc.slice(0, 140)}`);
    return arr;
  }, [lead]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl flex flex-col p-0">
        <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            Compose · {lead.name}
            {drafts.length > 0 && (
              <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">AI assisted</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* ───────── Metadata bar ───────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  No mailbox connected. Open Settings → Mailboxes.
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</label>
              <Input value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Re</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-9 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sequence</label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full h-9 mt-1 text-sm bg-background border border-input rounded-md px-2"
              >
                {SEQUENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Add stakeholder chips */}
          {stakeholderOptions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-muted-foreground/70 self-center mr-0.5">Add recipient:</span>
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

          {/* ───────── AI Context Panel ───────── */}
          <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
                <Sparkles className="h-3 w-3" />
                AI is drafting using this context
              </div>
              <Button
                variant="ghost" size="sm"
                className="h-6 text-[11px] gap-1.5"
                onClick={() => generateDrafts()}
                disabled={generating || !hasMailbox}
                title={hasMailbox ? "Generate 3 drafts" : "Connect a mailbox first"}
              >
                {generating
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Drafting…</>
                  : drafts.length > 0
                    ? <><RefreshCw className="h-3 w-3" /> Regenerate</>
                    : <><Sparkles className="h-3 w-3" /> Generate 3 drafts</>}
              </Button>
            </div>

            {/* Context chips: stage, days in stage, stall reason, etc. */}
            <div className="flex flex-wrap gap-1.5">
              {lead.stage && <ContextChip label="Stage" value={lead.stage} />}
              {(lead as any).daysInCurrentStage > 0 && (
                <ContextChip label="Days in stage" value={`${(lead as any).daysInCurrentStage}`} />
              )}
              {(lead as any).stallReason && <ContextChip label="Stall" value={(lead as any).stallReason} />}
              {lead.serviceInterest && <ContextChip label="Service" value={lead.serviceInterest} />}
              {(lead as any).geography && <ContextChip label="Geo" value={(lead as any).geography} />}
              {(lead as any).targetRevenue && <ContextChip label="Revenue" value={(lead as any).targetRevenue} />}
              {(lead as any).nextMutualStep && <ContextChip label="Next step" value={(lead as any).nextMutualStep} />}
            </div>

            {/* Variable chips */}
            {referencedVars.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Variables in draft</div>
                <div className="flex flex-wrap gap-1.5">
                  {referencedVars.map(key => {
                    const value = variables[key] || "";
                    const isMissing = !value.trim();
                    return (
                      <span
                        key={key}
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono",
                          isMissing
                            ? "bg-destructive/10 text-destructive border border-destructive/30"
                            : "bg-background border border-border text-foreground",
                        )}
                        title={isMissing ? `[${key}] has no value — fill it before sending` : `[${key}] = ${value}`}
                      >
                        {isMissing && <AlertTriangle className="h-2.5 w-2.5" />}
                        [{key}]{!isMissing && <span className="text-muted-foreground">= {value}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom instruction */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Optional steer</label>
              <Input
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder='e.g. "Mention the SaaS portfolio overlap"'
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>

          {/* ───────── Draft cards ───────── */}
          {drafts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pick a draft</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {drafts.map((d, i) => {
                  const isSelected = i === selectedIdx;
                  const isRecommended = d.approach === recommendedApproach;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectDraft(i)}
                      className={cn(
                        "text-left rounded-md border p-2.5 transition-colors min-h-[120px] flex flex-col gap-1",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:bg-secondary/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground">
                          {d.label || APPROACH_LABEL[d.approach]}
                        </span>
                        {isRecommended && (
                          <Badge variant="secondary" className="text-[9px]">Recommended</Badge>
                        )}
                      </div>
                      <div className="text-[11px] font-medium text-foreground line-clamp-1">{d.subject}</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-3 leading-relaxed">{d.body}</div>
                      {d.rationale && (
                        <div className="text-[10px] text-muted-foreground/70 italic mt-auto pt-1 border-t border-border/40 line-clamp-2">
                          {d.rationale}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ───────── Editable body + inline tools ───────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Body (editable)</label>
              <div className="flex items-center gap-1 flex-wrap">
                <ToolButton
                  icon={<Wand2 className="h-3 w-3" />}
                  label="Improve"
                  busy={refining === "improve"}
                  disabled={!body.trim() || !!refining}
                  onClick={() => refineBody("improve")}
                />
                <ToolButton
                  icon={<Scissors className="h-3 w-3" />}
                  label="Shorten"
                  busy={refining === "shorten"}
                  disabled={!body.trim() || !!refining}
                  onClick={() => refineBody("shorten")}
                />
                <Popover open={proofOpen} onOpenChange={setProofOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" disabled={!body.trim() || !!refining}>
                      <Plus className="h-3 w-3" />
                      Proof point
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-3 space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Proof to weave in</Label>
                    <Textarea
                      value={proofText}
                      onChange={(e) => setProofText(e.target.value)}
                      rows={3}
                      placeholder='e.g. "We sourced 12 platform deals for Riverside last quarter"'
                      className="text-xs"
                    />
                    {proofBank.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggested</div>
                        {proofBank.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setProofText(p)}
                            className="w-full text-left text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded px-1.5 py-1 line-clamp-2"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setProofOpen(false)}>Cancel</Button>
                      <Button size="sm" className="h-7 text-xs" onClick={handleAddProof} disabled={!proofText.trim()}>
                        Weave in
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" disabled={!body.trim() || !!refining}>
                      <Layers className="h-3 w-3" />
                      More
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => refineBody("expand")}>Expand</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => refineBody("strengthen")}>Make more direct</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => refineBody("soften")}>Soften tone</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="text-sm font-mono resize-none"
              placeholder={drafts.length > 0
                ? "Edit the selected draft…"
                : 'Write your message, or click "Generate 3 drafts" above to start with AI…'}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <div>
                {referencedVars.length > 0 && (
                  <span>
                    {referencedVars.length} variable{referencedVars.length !== 1 ? "s" : ""} ·{" "}
                    {missingVars.length > 0
                      ? <span className="text-destructive font-medium">{missingVars.length} missing</span>
                      : <span className="text-emerald-600 font-medium">All filled</span>}
                  </span>
                )}
              </div>
              <div>{resolvedBody.split(/\s+/).filter(Boolean).length} words · preview shown after vars resolved</div>
            </div>
          </div>

          {/* Live preview — when variables are resolved */}
          {referencedVars.length > 0 && missingVars.length === 0 && resolvedBody !== body && (
            <details className="rounded-md border border-border bg-secondary/20">
              <summary className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-1.5 cursor-pointer">
                Preview (variables resolved)
              </summary>
              <div className="px-3 py-2 text-[11px] whitespace-pre-wrap text-foreground">
                <div className="font-semibold mb-1">{resolvedSubject}</div>
                {resolvedBody}
              </div>
            </details>
          )}
        </div>

        {/* ───────── Footer ───────── */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2 shrink-0 bg-background">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Popover open={saveTplOpen} onOpenChange={setSaveTplOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1.5" disabled={!subject.trim() && !body.trim()}>
                  <BookmarkPlus className="h-3 w-3" /> Save as variant
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-3 space-y-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
                  <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Proposal nudge" className="h-8 text-xs mt-1" autoFocus />
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
            {/* Phase 6 — per-email do-not-train toggle for sensitive content */}
            <label
              className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none"
              title="When ON, this send is excluded from AI learning and pattern stats."
            >
              <ShieldOff className="h-3 w-3" />
              Don't train
              <Switch
                checked={doNotTrain}
                onCheckedChange={setDoNotTrain}
                className="scale-75 -ml-0.5"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            {missingVars.length > 0 && (
              <span className="text-[10px] text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Fill {missingVars.length} variable{missingVars.length !== 1 ? "s" : ""}
              </span>
            )}
            <div className="inline-flex">
              <Button
                size="sm"
                className="rounded-r-none"
                onClick={sendNow}
                disabled={!canSend || sending || scheduling}
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                {sending ? "Sending…" : "Send now"}
              </Button>
              <SmartScheduler
                leadId={lead.id}
                recipientEmail={primaryRecipient}
                fromConnectionId={fromConnectionId}
                disabled={!canSend || sending}
                scheduling={scheduling}
                onSchedule={scheduleSend}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-background border border-border rounded px-1.5 py-0.5">
      <span className="text-muted-foreground uppercase tracking-wider text-[9px]">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

function ToolButton({
  icon, label, onClick, disabled, busy,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Button
      variant="ghost" size="sm"
      className="h-6 text-[10px] gap-1"
      onClick={onClick}
      disabled={disabled || busy}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      {label}
    </Button>
  );
}
