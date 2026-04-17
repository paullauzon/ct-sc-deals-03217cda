import { useEffect, useState } from "react";
import { Lead } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { HeartHandshake, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props { lead: Lead }

export function LinkedAccountCard({ lead }: Props) {
  const [account, setAccount] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lead.stage !== "Closed Won") { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("client_accounts" as any)
        .select("id, cs_stage, monthly_value, contract_end, churn_reason, owner")
        .eq("lead_id", lead.id)
        .maybeSingle();
      if (!cancelled) { setAccount(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [lead.id, lead.stage]);

  if (lead.stage !== "Closed Won") return null;
  if (loading) return null;
  if (!account) return null;

  const goToAccount = () => {
    window.location.hash = `view=accounts&sys=client-success&account=${account.id}`;
  };

  const isChurned = account.cs_stage === "Churned";

  return (
    <CollapsibleCard
      title="Client Success"
      icon={<HeartHandshake className="h-3.5 w-3.5" />}
      defaultOpen={true}
    >
      <button
        onClick={goToAccount}
        className="w-full text-left flex items-start justify-between gap-2 p-2 -m-1 rounded hover:bg-secondary/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge variant={isChurned ? "outline" : "secondary"} className="text-[10px]">
              {account.cs_stage}
            </Badge>
            <span className="text-[10px] text-muted-foreground">Owner: {account.owner}</span>
          </div>
          {account.monthly_value > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              ${Number(account.monthly_value).toLocaleString()}/mo
              {account.contract_end && ` · renews ${account.contract_end}`}
            </p>
          )}
          {isChurned && account.churn_reason && (
            <p className="text-[11px] text-muted-foreground mt-1 italic">{account.churn_reason}</p>
          )}
        </div>
        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
      </button>
    </CollapsibleCard>
  );
}
