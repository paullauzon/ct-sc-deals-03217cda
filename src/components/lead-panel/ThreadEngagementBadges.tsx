import { Badge } from "@/components/ui/badge";
import { Eye, MousePointerClick, Reply, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThreadEngagement } from "@/lib/threadEngagement";

interface Props {
  engagement: ThreadEngagement;
  className?: string;
}

/**
 * Renders compact engagement badges for a thread row:
 *   [Hot · 5 opens 48h]  Opens 18 · Clicks 7 · pricing×3, proposal×2  · Replied by Tim 3×
 */
export function ThreadEngagementBadges({ engagement, className }: Props) {
  const { opens, clicks, uniqueRepliers, isHot, hotReason, topClickedLinks } = engagement;
  const hasAny = opens > 0 || clicks > 0 || uniqueRepliers.length > 0 || isHot;
  if (!hasAny) return null;

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {isHot && (
        <Badge
          variant="outline"
          className="text-[9px] gap-0.5 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          title={hotReason}
        >
          <Flame className="h-2.5 w-2.5" /> Hot
          {hotReason ? <span className="ml-0.5 font-normal opacity-80">· {hotReason}</span> : null}
        </Badge>
      )}
      {opens > 0 && (
        <Badge variant="outline" className="text-[9px] gap-0.5 text-muted-foreground" title={`${opens} total opens`}>
          <Eye className="h-2.5 w-2.5" />{opens}
        </Badge>
      )}
      {clicks > 0 && (
        <Badge variant="outline" className="text-[9px] gap-0.5 text-muted-foreground" title={topClickedLinks.length ? `Clicked: ${topClickedLinks.map(l => `${l.label}×${l.count}`).join(", ")}` : `${clicks} clicks`}>
          <MousePointerClick className="h-2.5 w-2.5" />{clicks}
          {topClickedLinks.length > 0 && (
            <span className="ml-0.5 font-normal opacity-80 truncate max-w-[120px]">
              · {topClickedLinks.map(l => `${l.label}×${l.count}`).join(", ")}
            </span>
          )}
        </Badge>
      )}
      {uniqueRepliers.slice(0, 2).map((r) => (
        <Badge key={r.name} variant="outline" className="text-[9px] gap-0.5 text-muted-foreground" title={`${r.name} replied ${r.count}×`}>
          <Reply className="h-2.5 w-2.5" />{r.name}
          {r.count > 1 ? <span className="ml-0.5 font-normal opacity-80">×{r.count}</span> : null}
        </Badge>
      ))}
    </div>
  );
}
