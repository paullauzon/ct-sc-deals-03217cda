// Phase 8 — Deal-wide email recap slide-over.
// Calls the summarize-deal-emails edge function and renders the synthesized
// narrative across all analyzed threads for this lead.
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  leadId: string;
  leadName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RecapData {
  recap: string;
  threadCount: number;
  hotThreads?: number;
  sentimentMix?: { positive: number; neutral: number; cooling: number };
}

export function DealEmailRecapDialog({ leadId, leadName, open, onOpenChange }: Props) {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("summarize-deal-emails", {
        body: { leadId },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result as RecapData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate recap";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !data) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveToIntelligence = async () => {
    if (!data?.recap) return;
    setSaving(true);
    try {
      const { error } = await (supabase as never as { from: (t: string) => { insert: (v: unknown) => Promise<{ error: unknown }> } })
        .from("lead_intelligence_notes")
        .insert({
          lead_id: leadId,
          source: "email_recap",
          source_ref: "deal_wide",
          title: `Email recap · ${new Date().toLocaleDateString()}`,
          body: data.recap,
          signal_tags: ["email", "recap"],
        });
      if (error) throw error as Error;
      toast.success("Saved to Intelligence tab");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Email recap{leadName ? ` · ${leadName}` : ""}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading && (
            <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Synthesizing across threads…
            </div>
          )}
          {!loading && data && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  {data.threadCount} thread{data.threadCount !== 1 ? "s" : ""}
                </Badge>
                {data.hotThreads ? (
                  <Badge variant="outline" className="text-[10px]">
                    {data.hotThreads} hot
                  </Badge>
                ) : null}
                {data.sentimentMix && (
                  <span className="text-[10px] text-muted-foreground">
                    {data.sentimentMix.positive}↑ · {data.sentimentMix.neutral}→ · {data.sentimentMix.cooling}↓
                  </span>
                )}
              </div>
              <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                {data.recap.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
                  seg.startsWith("**") && seg.endsWith("**")
                    ? <strong key={i} className="block mt-1.5 first:mt-0 text-foreground">{seg.replace(/\*\*/g, "")}</strong>
                    : <span key={i}>{seg}</span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2 shrink-0 bg-background">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={generate} disabled={loading}
              className="h-8 text-[11px] gap-1.5"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Regenerate
            </Button>
            <Button
              size="sm"
              onClick={saveToIntelligence}
              disabled={!data?.recap || saving || loading}
              className="h-8 text-[11px] gap-1.5"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save to Intelligence
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
