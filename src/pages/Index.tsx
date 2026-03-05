import { useState, useEffect } from "react";
import { Dashboard } from "@/components/Dashboard";
import { LeadsTable } from "@/components/LeadsTable";
import { Pipeline } from "@/components/Pipeline";
import { ActionQueue } from "@/components/ActionQueue";
import { LeadProvider, useLeads } from "@/contexts/LeadContext";
import { ProcessingProvider } from "@/contexts/ProcessingContext";
import { GlobalProcessingOverlay } from "@/components/GlobalProcessingOverlay";

type View = "today" | "dashboard" | "leads" | "pipeline";

function AppContent() {
  const [view, setView] = useState<View>("today");
  const { unseenCount, clearUnseen } = useLeads();

  useEffect(() => {
    if (view === "leads") clearUnseen();
  }, [view, clearUnseen]);

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6 flex items-center h-14 gap-8">
          <span className="text-sm font-bold tracking-tight">CAPTARGET</span>
          <div className="flex gap-1">
            {(["today", "dashboard", "leads", "pipeline"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`relative px-3 py-1.5 text-sm transition-colors border-b-2 ${
                  view === v
                    ? "border-foreground text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "today" ? "Today" : v.charAt(0).toUpperCase() + v.slice(1)}
                {v === "leads" && unseenCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1 animate-pulse">
                    {unseenCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {view === "today" && <ActionQueue />}
      {view === "dashboard" && <Dashboard />}
      {view === "leads" && <LeadsTable />}
      {view === "pipeline" && <Pipeline />}
    </div>
  );
}

const Index = () => {
  return (
    <LeadProvider>
      <ProcessingProvider>
        <AppContent />
        <GlobalProcessingOverlay />
      </ProcessingProvider>
    </LeadProvider>
  );
};

export default Index;
