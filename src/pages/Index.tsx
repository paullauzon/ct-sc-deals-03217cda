import { useState, useEffect, useCallback } from "react";
import { Dashboard } from "@/components/Dashboard";
import { LeadsTable, LeadDetail } from "@/components/LeadsTable";
import { Pipeline } from "@/components/Pipeline";
import { ActionQueue } from "@/components/ActionQueue";
import { CommandPalette } from "@/components/CommandPalette";
import { useLeads } from "@/contexts/LeadContext";
import { GlobalProcessingOverlay } from "@/components/GlobalProcessingOverlay";
import { SystemSwitcher } from "@/components/SystemSwitcher";
import { BusinessSystem } from "@/components/BusinessSystem";
import { ClientSuccessSystem } from "@/components/ClientSuccessSystem";
import { Search, BarChart3, Kanban, Users, CalendarCheck, Settings } from "lucide-react";
import { MailboxSettings } from "@/components/MailboxSettings";
import { UserMenu } from "@/components/UserMenu";
import { AutomationHealthChip } from "@/components/AutomationHealthChip";

type View = "dashboard" | "pipeline" | "leads" | "today" | "settings";
type System = "crm" | "business" | "client-success";

const VALID_VIEWS = new Set<View>(["dashboard", "pipeline", "leads", "today", "settings"]);

function parseHashState(): { view: View; system: System } {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  const v = params.get("view");
  const s = params.get("sys");
  return {
    view: v && VALID_VIEWS.has(v as View) ? (v as View) : "dashboard",
    system: s === "business" ? "business" : s === "client-success" ? "client-success" : "crm",
  };
}

function updateHash(view: View, system: System = "crm") {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  params.set("view", view);
  params.set("sys", system);
  if (view !== "dashboard") params.delete("tab");
  window.location.hash = params.toString();
}

const NAV_ITEMS: { key: View; label: string; desc: string; icon: typeof BarChart3 }[] = [
  { key: "dashboard", label: "Dashboard", desc: "Executive Summary", icon: BarChart3 },
  { key: "pipeline", label: "Pipeline", desc: "Deal Flow", icon: Kanban },
  { key: "leads", label: "Leads", desc: "All Contacts", icon: Users },
  { key: "today", label: "Command", desc: "Sales Cockpit", icon: CalendarCheck },
];

function AppContent() {
  const [view, setViewState] = useState<View>(() => parseHashState().view);
  const [system, setSystemState] = useState<System>(() => parseHashState().system);
  const { unseenCount, clearUnseen } = useLeads();
  const [cmdLeadId, setCmdLeadId] = useState<string | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);

  const setView = useCallback((v: View) => {
    setViewState(v);
    updateHash(v, system);
  }, [system]);

  const setSystem = useCallback((s: System) => {
    setSystemState(s);
    const hash = window.location.hash.replace("#", "");
    const params = new URLSearchParams(hash);
    params.set("sys", s);
    if (s === "business" || s === "client-success") { params.delete("view"); params.delete("tab"); }
    else { params.set("view", view); }
    window.location.hash = params.toString();
  }, [view]);

  useEffect(() => {
    const onHashChange = () => {
      const state = parseHashState();
      setViewState(state.view);
      setSystemState(state.system);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (view === "leads") clearUnseen();
  }, [view, clearUnseen]);

  const handleCmdNavigate = useCallback((v: string) => {
    setView(v as View);
  }, [setView]);

  const handleCmdSelectLead = useCallback((id: string) => {
    setCmdLeadId(id);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6 flex items-center h-14 gap-8">
          <SystemSwitcher current={system} onChange={setSystem} />
          {system === "crm" && (
            <>
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
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setCmdOpen(true)}
                  className="flex items-center gap-2 w-52 h-8 px-3 rounded-md border border-border bg-secondary/50 text-sm text-muted-foreground hover:bg-secondary transition-colors"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">Search…</span>
                  <kbd className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
                </button>
                <AutomationHealthChip onClick={() => {
                  const params = new URLSearchParams(window.location.hash.replace("#",""));
                  params.set("view", "settings"); params.set("sys", "crm"); params.set("tab", "automation");
                  window.location.hash = params.toString();
                  setViewState("settings");
                }} />
                <button
                  onClick={() => setView("settings")}
                  className={`h-8 w-8 flex items-center justify-center rounded-md border border-border transition-colors ${
                    view === "settings"
                      ? "bg-foreground text-background"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                  title="Mailbox settings"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <UserMenu />
              </div>
            </>
          )}
          {system === "business" && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-sm text-muted-foreground">Business Operations</span>
              <AutomationHealthChip onClick={() => {
                const params = new URLSearchParams();
                params.set("view", "settings"); params.set("sys", "crm"); params.set("tab", "automation");
                window.location.hash = params.toString();
              }} />
              <UserMenu />
            </div>
          )}
          {system === "client-success" && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-sm text-muted-foreground">Client Success · Account Management</span>
              <AutomationHealthChip onClick={() => {
                const params = new URLSearchParams();
                params.set("view", "settings"); params.set("sys", "crm"); params.set("tab", "automation");
                window.location.hash = params.toString();
              }} />
              <UserMenu />
            </div>
          )}
        </div>
      </nav>

      {system === "crm" && (
        <>
          {view === "today" && <ActionQueue />}
          {view === "dashboard" && <Dashboard />}
          {view === "leads" && <LeadsTable />}
          {view === "pipeline" && <Pipeline />}
          {view === "settings" && <MailboxSettings />}
        </>
      )}

      {system === "business" && <BusinessSystem />}
      {system === "client-success" && <ClientSuccessSystem />}

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
