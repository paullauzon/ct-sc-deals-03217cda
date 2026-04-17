import { Meeting, Lead } from "@/types/lead";
import { deriveCoachingInsights } from "@/lib/meetingCoach";
import { Sparkles, AlertCircle, HelpCircle, ArrowRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

export function MeetingCoachCard({ meeting, lead }: { meeting: Meeting; lead: Lead }) {
  const [open, setOpen] = useState(false);
  const insight = deriveCoachingInsights(meeting, lead);
  if (!insight) return null;

  const ratingColor =
    insight.overallRating === "Strong" ? "text-foreground border-foreground/30 bg-secondary/40" :
    insight.overallRating === "Adequate" ? "text-foreground border-border bg-secondary/30" :
    "text-amber-700 border-amber-500/30 bg-amber-500/5";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-secondary/30 transition-colors text-left">
            <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Coach</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ratingColor}`}>
              {insight.overallRating}
            </span>
            <span className="text-[10px] text-muted-foreground truncate flex-1">{insight.ratingReason}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{open ? "▴" : "▾"}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-2.5 space-y-2.5 border-t border-border text-xs">
            {/* What to do next — always visible, top */}
            <div className="flex items-start gap-1.5 p-2 rounded bg-secondary/40">
              <ArrowRight className="h-3 w-3 mt-0.5 text-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Do next</div>
                <p className="text-xs text-foreground/90 leading-snug mt-0.5">{insight.whatToDoNext}</p>
              </div>
            </div>

            {insight.missedSignals.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Signals to revisit
                </div>
                <ul className="space-y-1">
                  {insight.missedSignals.map((s, i) => (
                    <li key={i} className="leading-snug">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground"> — {s.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insight.objectionHandlingNote && (
              <div className="text-[11px] text-foreground/80 leading-snug border-l-2 border-border pl-2">
                {insight.objectionHandlingNote}
              </div>
            )}

            {insight.questionGaps.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" /> Discovery gaps
                </div>
                <div className="flex flex-wrap gap-1">
                  {insight.questionGaps.map((q, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary/30">
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
