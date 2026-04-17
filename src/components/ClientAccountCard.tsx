import { ClientAccount } from "@/types/clientAccount";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  account: ClientAccount;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function ClientAccountCard({ account, onClick, onDragStart }: Props) {
  const renewalDays = daysUntil(account.contract_end);
  const isRenewalSoon = renewalDays !== null && renewalDays <= 90 && renewalDays >= 0;
  const isOverdue = renewalDays !== null && renewalDays < 0;
  const billingDisplay = account.monthly_value > 0
    ? `$${account.monthly_value.toLocaleString()}/mo`
    : account.retainer_value > 0
      ? `$${account.retainer_value.toLocaleString()} retainer`
      : null;

  const brandStripe = account.brand === "Captarget" ? "border-l-[hsl(0_72%_51%)]" : "border-l-[hsl(38_92%_50%)]";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "group bg-card border border-border border-l-2 rounded-md p-2.5 cursor-pointer hover:border-foreground/30 transition-colors",
        brandStripe
      )}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <CompanyAvatar companyUrl={account.company_url} email={account.contact_email} companyName={account.company} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate leading-tight">{account.company || "—"}</p>
          <p className="text-[10px] text-muted-foreground truncate leading-tight">{account.contact_name}</p>
        </div>
      </div>

      {billingDisplay && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
          <DollarSign className="h-2.5 w-2.5" />
          <span>{billingDisplay}</span>
          {account.success_fee_pct > 0 && <span>· {account.success_fee_pct}% fee</span>}
        </div>
      )}

      {renewalDays !== null && account.cs_stage !== "Churned" && (
        <div className={cn(
          "flex items-center gap-1 text-[10px] mt-1",
          isOverdue ? "text-foreground font-medium" : isRenewalSoon ? "text-foreground" : "text-muted-foreground"
        )}>
          {isOverdue ? <AlertCircle className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
          <span>
            {isOverdue ? `Renewal ${Math.abs(renewalDays)}d overdue` : `Renews in ${renewalDays}d`}
          </span>
        </div>
      )}

      {account.cs_stage === "Paused" && account.pause_reason && (
        <Badge variant="outline" className="text-[9px] mt-1.5 truncate max-w-full">
          {account.pause_reason.slice(0, 30)}
        </Badge>
      )}
      {account.cs_stage === "Churned" && account.churn_reason && (
        <Badge variant="outline" className="text-[9px] mt-1.5 truncate max-w-full">
          {account.churn_reason.slice(0, 30)}
        </Badge>
      )}
    </div>
  );
}
