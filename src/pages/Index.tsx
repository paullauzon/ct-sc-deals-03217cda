import { useState, useEffect, useCallback } from "react";
import { Dashboard } from "@/components/Dashboard";
import { LeadsTable, LeadDetail } from "@/components/LeadsTable";
import { Pipeline } from "@/components/Pipeline";
import { ActionQueue } from "@/components/ActionQueue";
import { CommandPalette } from "@/components/CommandPalette";
import { useLeads } from "@/contexts/LeadContext";
import { GlobalProcessingOverlay } from "@/components/GlobalProcessingOverlay";

type View = "today" | "dashboard" | "leads" | "pipeline";

function AppContent() {
  const [view, setView] = useState<View>("today");
  const { unseenCount, clearUnseen } = useLeads();
  const [cmdLeadId, setCmdLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (view === "leads") clearUnseen();
  }, [view, clearUnseen]);

  const handleCmdNavigate = useCallback((v: string) => {
    setView(v as View);
  }, []);

  const handleCmdSelectLead = useCallback((id: string) => {
    setCmdLeadId(id);
  }, []);

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
          <div className="ml-auto">
            <button
              onClick={() => setCmdLeadId(null)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 border border-border rounded"
              title="Cmd+K"
            >
              ⌘K Search
            </button>
          </div>
        </div>
      </nav>

      {view === "today" && <ActionQueue />}
      {view === "dashboard" && <Dashboard />}
      {view === "leads" && <LeadsTable />}
      {view === "pipeline" && <Pipeline />}

      <CommandPalette onNavigate={handleCmdNavigate} onSelectLead={handleCmdSelectLead} />
      <LeadDetail leadId={cmdLeadId} open={!!cmdLeadId} onClose={() => setCmdLeadId(null)} />
    </div>
  );
}

const Index = () => {
  return (
    <AppContent />
  );
};

export default Index;
