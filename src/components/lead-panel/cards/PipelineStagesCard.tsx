import { Lead, LeadStage } from "@/types/lead";
import { ACTIVE_STAGES, TERMINAL_STAGES } from "@/lib/leadUtils";
import { Check, Circle, HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { lead: Lead }

/** Dispatches a custom event consumed by LeadPanelHeader, which routes through
 *  the existing close-won / move-back guards so we don't duplicate modals. */
function requestStageChange(stage: LeadStage) {
  window.dispatchEvent(new CustomEvent("request-stage-change", { detail: { stage } }));
}

export function PipelineStagesCard({ lead }: Props) {
  const currentIdx = ACTIVE_STAGES.indexOf(lead.stage);
  const isWon = lead.stage === "Closed Won";
  const inActive = currentIdx >= 0;

  return (
    <div className="border-b border-border px-4 py-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Pipeline Stages
      </h4>
      <ul className="space-y-0.5">
        {ACTIVE_STAGES.map((stage, i) => {
          const passed = inActive && i < currentIdx;
          const current = stage === lead.stage;
          return (
            <StageRow
              key={stage}
              stage={stage}
              index={i + 1}
              passed={passed}
              current={current}
              dimmed={!inActive}
              onClick={() => !current && requestStageChange(stage)}
            />
          );
        })}
      </ul>

      <div className="mt-2 mb-1.5 border-t border-border/60" />
      <ul className="space-y-0.5">
        {TERMINAL_STAGES.map((stage, i) => {
          const current = stage === lead.stage;
          return (
            <StageRow
              key={stage}
              stage={stage}
              index={ACTIVE_STAGES.length + i + 1}
              passed={false}
              current={current}
              dimmed={!current}
              onClick={() => !current && requestStageChange(stage)}
            />
          );
        })}
      </ul>

      {/* Closed Won handoff hint */}
      {!isWon && (
        <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2 flex items-start gap-2">
          <HeartHandshake className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed text-emerald-700 dark:text-emerald-300">
            When marked <span className="font-semibold">Closed Won</span>, an account auto-creates in Valeria's Client Success pipeline at <span className="font-semibold">Onboarding</span>.
          </p>
        </div>
      )}
    </div>
  );
}

function StageRow({
  stage, index, passed, current, dimmed, onClick,
}: { stage: LeadStage; index: number; passed: boolean; current: boolean; dimmed: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2 px-1.5 py-1 rounded text-left text-[11px] transition-colors group",
          current ? "bg-amber-500/10 text-foreground" : "hover:bg-secondary/60",
          dimmed && !current && "opacity-50 hover:opacity-100",
        )}
      >
        <span className={cn(
          "w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors",
          current ? "bg-amber-500 text-white" :
          passed ? "bg-emerald-500 text-white" :
          stage === "Closed Won" && current ? "bg-emerald-500 text-white" :
          "bg-secondary text-muted-foreground border border-border",
        )}>
          {passed || (stage === "Closed Won" && current) ? <Check className="h-2.5 w-2.5" /> : <Circle className="h-1 w-1 fill-current" />}
        </span>
        <span className="text-[9px] text-muted-foreground/60 tabular-nums w-3 shrink-0">{index}</span>
        <span className={cn("flex-1 truncate", current && "font-semibold")}>{stage}</span>
        {current && <span className="text-[9px] text-amber-700 dark:text-amber-400 font-medium shrink-0">← here</span>}
      </button>
    </li>
  );
}
