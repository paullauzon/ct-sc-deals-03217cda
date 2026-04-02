import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { DashboardBusiness } from "@/components/DashboardBusiness";
import { DashboardFilterBar, DEFAULT_FILTERS, useDashboardFilters, type DashboardFilters } from "@/components/DashboardFilters";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LeadDetail } from "@/components/LeadsTable";
import { Lead } from "@/types/lead";
import { cn } from "@/lib/utils";
import { Eye, DollarSign, Settings2, TrendingUp, Lock } from "lucide-react";

type BizTab = "overview" | "economics" | "operations" | "forecast";

const TABS: { key: BizTab; label: string; desc: string; icon: typeof Eye; ready: boolean }[] = [
  { key: "overview", label: "Overview", desc: "Brand Scorecards", icon: Eye, ready: true },
  { key: "economics", label: "Economics", desc: "Unit Economics", icon: DollarSign, ready: false },
  { key: "operations", label: "Operations", desc: "Capacity & Health", icon: Settings2, ready: false },
  { key: "forecast", label: "Forecast", desc: "Revenue Projections", icon: TrendingUp, ready: false },
];

interface DrillDown {
  title: string;
  leads: Lead[];
}

export function BusinessSystem() {
  const { leads } = useLeads();
  const [tab, setTab] = useState<BizTab>("overview");
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const filteredLeads = useDashboardFilters(leads, filters);

  const handleDrillDown = (title: string, drillLeads: Lead[]) => {
    setDrillDown({ title, leads: drillLeads });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border pb-px">
        {TABS.map(({ key, label, desc, icon: Icon, ready }) => (
          <button
            key={key}
            onClick={() => ready && setTab(key)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2",
              tab === key
                ? "border-foreground text-foreground font-medium"
                : ready
                  ? "border-transparent text-muted-foreground hover:text-foreground"
                  : "border-transparent text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            <span className="hidden lg:inline text-[10px] text-muted-foreground/60 ml-0.5">· {desc}</span>
            {!ready && <Lock className="h-2.5 w-2.5 ml-1" />}
          </button>
        ))}
      </div>

      {/* Filters */}
      <DashboardFilterBar leads={filteredLeads} filters={filters} onFiltersChange={setFilters} />

      {/* Content */}
      {tab === "overview" && (
        <DashboardBusiness leads={filteredLeads} onDrillDown={handleDrillDown} />
      )}

      {tab !== "overview" && (
        <div className="flex items-center justify-center h-64 border border-dashed border-border rounded-lg">
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Coming Soon</p>
            <p className="text-xs text-muted-foreground/60">
              {tab === "economics" && "Unit Economics, CAC, LTV, and margin analysis"}
              {tab === "operations" && "Capacity utilization, pipeline aging, and health metrics"}
              {tab === "forecast" && "Revenue projections and retention tracking"}
            </p>
          </div>
        </div>
      )}

      {/* Drill-down sheet */}
      <Sheet open={!!drillDown} onOpenChange={(open) => !open && setDrillDown(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drillDown?.title}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {drillDown?.leads.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedLeadId(l.id)}
                className="w-full text-left p-3 rounded-md border border-border hover:bg-muted transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.company}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{l.stage}</span>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
