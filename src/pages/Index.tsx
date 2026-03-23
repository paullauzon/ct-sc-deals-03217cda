import { useState, useEffect, useCallback } from "react";
import { Dashboard } from "@/components/Dashboard";
import { LeadsTable, LeadDetail } from "@/components/LeadsTable";
import { Pipeline } from "@/components/Pipeline";
import { ActionQueue } from "@/components/ActionQueue";
import { CommandPalette } from "@/components/CommandPalette";
import { useLeads } from "@/contexts/LeadContext";
import { GlobalProcessingOverlay } from "@/components/GlobalProcessingOverlay";
import { Search, BarChart3, Kanban, Users, CalendarCheck } from "lucide-react";

type View = "dashboard" | "pipeline" | "leads" | "today";

const VALID_VIEWS = new Set<View>(["dashboard", "pipeline", "leads", "today"]);

function parseViewFromHash(): View {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  const v = params.get("view");
  return v && VALID_VIEWS.has(v as View) ? (v as View) : "dashboard";
}

function updateHash(view: View) {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  params.set("view", view);
  if (view !== "dashboard") params.delete("tab");
  window.location.hash = params.toString();
}

const NAV_ITEMS: { key: View; label: string; desc: string; icon: typeof BarChart3 }[] = [
  { key: "dashboard", label: "Dashboard", desc: "Executive Summary", icon: BarChart3 },
  { key: "pipeline", label: "Pipeline", desc: "Deal Flow", icon: Kanban },
  { key: "leads", label: "Leads", desc: "All Contacts", icon: Users },
  { key: "today", label: "Today", desc: "Action Queue", icon: CalendarCheck },
];

function AppContent() {
  const [view, setView] = useState<View>("dashboard");
  const { unseenCount, clearUnseen } = useLeads();
  const [cmdLeadId, setCmdLeadId] = useState<string | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);

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
            {NAV_ITEMS.map(({ key, label, desc, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors border-b-2 ${
                  view === key
                    ? "border-foreground text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                <span className="hidden lg:inline text-[10px] text-muted-foreground/60 ml-0.5">· {desc}</span>
                {key === "leads" && unseenCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1 animate-pulse">
                    {unseenCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-2 w-52 h-8 px-3 rounded-md border border-border bg-secondary/50 text-sm text-muted-foreground hover:bg-secondary transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
          </div>
        </div>
      </nav>

      {view === "today" && <ActionQueue />}
      {view === "dashboard" && <Dashboard />}
      {view === "leads" && <LeadsTable />}
      {view === "pipeline" && <Pipeline />}

      <CommandPalette onNavigate={handleCmdNavigate} onSelectLead={handleCmdSelectLead} externalOpen={cmdOpen} onExternalOpenChange={setCmdOpen} />
      <LeadDetail leadId={cmdLeadId} open={!!cmdLeadId} onClose={() => setCmdLeadId(null)} />
      <GlobalProcessingOverlay />
    </div>
  );
}

const Index = () => {
  return (
    <AppContent />
  );
};

export default Index;
