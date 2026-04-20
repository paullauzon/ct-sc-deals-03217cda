import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { CheckSquare, Plus, Check } from "lucide-react";
import { useLeadTasks } from "@/hooks/useLeadTasks";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Props { lead: Lead; onAddTask: () => void }

function inferPriority(taskType: string, overdue: boolean, leadStage: string): "High" | "Normal" {
  if (overdue) return "High";
  if (leadStage === "Contract Sent" || leadStage === "Negotiation") return "High";
  if (taskType === "follow_up" || taskType === "close_won_sla") return "High";
  return "Normal";
}

export function OpenTasksCard({ lead, onAddTask }: Props) {
  const { tasks, completeTask } = useLeadTasks([lead.id]);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <CollapsibleCard
      title="Open Tasks"
      icon={<CheckSquare className="h-3.5 w-3.5" />}
      count={tasks.length}
      defaultOpen={false}
      rightSlot={
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddTask(); }}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded inline-flex items-center gap-0.5 text-[10px]"
          title="Add task"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      }
    >
      {tasks.length === 0 ? (
        <button
          onClick={onAddTask}
          className="w-full text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-3 py-2.5 transition-colors"
        >
          + Add first task
        </button>
      ) : (
        <ul className="space-y-1.5">
          {tasks.slice(0, 4).map(t => {
            let dueLabel = "";
            let overdue = false;
            try {
              const d = parseISO(t.due_date);
              dueLabel = format(d, "MMM d");
              overdue = d < today;
            } catch { /* noop */ }
            const isAuto = !!(t.playbook && t.playbook.trim());
            const priority = inferPriority(t.task_type, overdue, lead.stage);
            const owner = lead.assignedTo || "Unassigned";
            return (
              <li key={t.id} className="flex items-start gap-2 group">
                <button
                  type="button"
                  onClick={() => completeTask(t.id)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border border-border hover:bg-foreground hover:border-foreground flex items-center justify-center text-background transition-colors shrink-0"
                  title="Mark complete"
                >
                  <Check className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-medium leading-tight">{t.title}</p>
                    {dueLabel && (
                      <span className={cn(
                        "text-[10px] tabular-nums shrink-0",
                        overdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"
                      )}>
                        {dueLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">
                      Assigned to {owner} · <span className={priority === "High" ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>{priority} priority</span>
                    </span>
                    {isAuto && (
                      <span className="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-secondary text-muted-foreground">
                        auto-created
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {tasks.length > 4 && (
            <li className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
              +{tasks.length - 4} more
            </li>
          )}
        </ul>
      )}
    </CollapsibleCard>
  );
}
