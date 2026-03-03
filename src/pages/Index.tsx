import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { LeadsTable } from "@/components/LeadsTable";
import { Pipeline } from "@/components/Pipeline";
import { LeadProvider } from "@/contexts/LeadContext";
import { ProcessingProvider } from "@/contexts/ProcessingContext";
import { GlobalProcessingOverlay } from "@/components/GlobalProcessingOverlay";

type View = "dashboard" | "leads" | "pipeline";

const Index = () => {
  const [view, setView] = useState<View>("dashboard");

  return (
    <LeadProvider>
      <ProcessingProvider>
        <div className="min-h-screen bg-background">
          {/* Navigation */}
          <nav className="border-b border-border shadow-sm">
            <div className="max-w-7xl mx-auto px-6 flex items-center h-14 gap-8">
              <span className="text-sm font-bold tracking-tight">CAPTARGET</span>
              <div className="flex gap-1">
                {(["dashboard", "leads", "pipeline"] as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 text-sm transition-colors border-b-2 ${
                      view === v
                        ? "border-foreground text-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          {/* Content */}
          {view === "dashboard" && <Dashboard />}
          {view === "leads" && <LeadsTable />}
          {view === "pipeline" && <Pipeline />}
        </div>
        <GlobalProcessingOverlay />
      </ProcessingProvider>
    </LeadProvider>
  );
};

export default Index;
