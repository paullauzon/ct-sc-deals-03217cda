// 4-step timeline visual matching the wireframe. Used in the Overview tab.

import { Sparkles, Phone, Send, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SequenceDef, SequenceStep } from "./sequenceConfig";

const KIND_META: Record<SequenceStep["kind"], { label: string; icon: typeof Sparkles }> = {
  "ai-personalized": { label: "AI-personalized", icon: Sparkles },
  manual: { label: "Malik manual", icon: Phone },
  auto: { label: "Auto", icon: Send },
};

export function SequenceTimeline({ seq }: { seq: SequenceDef }) {
  return (
    <div className="space-y-3">
      {seq.steps.map((step, idx) => {
        const Meta = KIND_META[step.kind];
        const Icon = Meta.icon;
        return (
          <div key={step.key} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-secondary/40 border-b border-border">
              <div className="flex items-center justify-center h-7 w-7 rounded-full bg-background border border-border text-xs font-mono">
                {idx + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{step.label}</div>
                <div className="text-[11px] text-muted-foreground font-mono">Day {step.day}</div>
              </div>
              <Badge variant="secondary" className="gap-1.5">
                <Icon className="h-3 w-3" />
                {Meta.label}
              </Badge>
            </div>
            <div className="p-4 space-y-3 bg-background">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Subject</div>
                <div className="text-sm font-mono text-foreground">{step.subjectTemplate}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Body</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.bodyTemplate}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Workflow className="h-3 w-3" />
                  Personalization inputs
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {step.inputs.map((inp) => (
                    <code key={inp} className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono">
                      {inp}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
