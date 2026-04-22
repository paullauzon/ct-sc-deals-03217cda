// Phase 7 — Top 3 most relevant recent emails on the Overview tab.
// Surfaces inbound replies, scheduled sends, and hot opens without
// requiring the user to open the Emails tab.

import { Lead } from "@/types/lead";
import { useEmailHighlights } from "@/lib/emailSignals";
import { Mail, Inbox, Send, Flame, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface Props {
  lead: Lead;
}

export function EmailHighlightsCard({ lead }: Props) {
  const highlights = useEmailHighlights(lead.id);
  const navigate = useNavigate();

  if (highlights.length === 0) return null;

  return (
    <div className="border border-border rounded-md">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Email highlights</span>
        <span className="text-[10px] text-muted-foreground">({highlights.length})</span>
      </div>
      <ul className="divide-y divide-border">
        {highlights.map((h) => {
          const Icon = h.scheduledFor ? Clock
            : h.direction === "inbound" ? Inbox
            : h.isHot ? Flame
            : Send;
          return (
            <li
              key={h.id}
              className="px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors"
              onClick={() => navigate(`/deal/${lead.id}?tab=emails&thread=${encodeURIComponent(h.threadId || h.id)}`)}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn(
                  "h-3.5 w-3.5 shrink-0 mt-0.5",
                  h.scheduledFor ? "text-muted-foreground" :
                  h.direction === "inbound" ? "text-foreground" :
                  h.isHot ? "text-foreground" :
                  "text-muted-foreground",
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate flex-1">{h.subject}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(h.emailDate), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{h.reason}</p>
                  {h.bodyPreview && (
                    <p className="text-[10px] text-muted-foreground/80 mt-1 line-clamp-1">
                      {h.bodyPreview}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
