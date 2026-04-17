import { useEffect, useState } from "react";
import { Lead } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Save, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

interface Props {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  save: (updates: Partial<Lead>) => void;
  /** Optional preset action passed when launched from "Draft follow-up" chip */
  presetAction?: "follow-up" | "default";
}

export function EmailComposeDrawer({ lead, open, onOpenChange, save, presetAction }: Props) {
  const [to, setTo] = useState(lead.email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(lead.email || "");
      setSubject("");
      setBody("");
      if (presetAction === "follow-up") {
        setTimeout(() => generate("default"), 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id]);

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

  const copyAndMark = async () => {
    const content = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    save({ lastContactDate: new Date().toISOString().split("T")[0] });
    await logActivity(lead.id, "field_update", `Email composed & copied: ${subject}`);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Copied to clipboard · last contact bumped");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
          <SheetTitle className="text-sm font-semibold">Compose email · {lead.name}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-sm mt-1" />
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
            <Button variant="outline" size="sm" onClick={saveDraft} disabled={!body.trim() || savingDraft}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {savingDraft ? "Saving…" : "Save draft"}
            </Button>
            <Button size="sm" onClick={copyAndMark} disabled={!body.trim()}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
              Copy & mark sent
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
