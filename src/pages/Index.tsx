import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { LeadsTable } from "@/components/LeadsTable";
import { Pipeline } from "@/components/Pipeline";
import { LeadProvider } from "@/contexts/LeadContext";

type View = "dashboard" | "leads" | "pipeline";

const Index = () => {
  const [view, setView] = useState<View>("dashboard");

  return (
    <LeadProvider>
      <div className="min-h-screen bg-background">
        {/* Navigation */}
        <nav className="border-b border-border">
          <div className="max-w-7xl mx-auto px-6 flex items-center h-12 gap-8">
            <span className="text-sm font-semibold tracking-tight">CAPTARGET</span>
            <div className="flex gap-1">
              {(["dashboard", "leads", "pipeline"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    view === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
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
    </LeadProvider>
  );
};

export default Index;
