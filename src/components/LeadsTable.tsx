import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { useProcessing } from "@/contexts/ProcessingContext";
import { Lead, LeadStage, LeadSource, Brand } from "@/types/lead";
import { toast } from "sonner";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { BrandLogo } from "@/components/BrandLogo";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getBrandBorderClass } from "@/lib/brandColors";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { computeDaysInStage } from "@/lib/leadUtils";
import { FirefliesImportDialog } from "@/components/FirefliesImport";
import { BulkProcessingDialog } from "@/components/BulkProcessingDialog";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw, Linkedin, CalendarCheck, Archive, MoreHorizontal, Zap, Target, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

// Re-export the new HubSpot-style full-screen lead panel so all 6 import sites
// (Pipeline, ActionQueue, Dashboard, BusinessSystem, IntelligenceCenter, Index/Cmd+K)
// pick it up without changing their import paths.
export { LeadDetailPanel as LeadDetail } from "@/components/LeadDetailPanel";

// Local alias for the JSX self-reference inside <LeadsTable />.
import { LeadDetailPanel as LeadDetail } from "@/components/LeadDetailPanel";

import { ALL_STAGES } from "@/lib/leadUtils";
const STAGES: LeadStage[] = ALL_STAGES;

const SOURCE_LABELS: Record<LeadSource, string> = {
  "CT Contact Form": "CT Contact",
  "CT Free Targets Form": "CT Targets",
  "SC Intro Call Form": "SC Intro",
  "SC Free Targets Form": "SC Targets",
};

type SortKey = "name" | "company" | "stage" | "dealValue" | "days" | "priority" | "dateSubmitted" | "source" | "serviceInterest" | "role" | "score" | "tier";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

// (Old LeadDetail and its helpers removed — see src/components/LeadDetailPanel.tsx
// and src/components/lead-panel/* for the new HubSpot-style full-screen workspace.)


export function LeadsTable() {
  const { leads, addLead, isLeadNew, markLeadSeen, archiveLead, refreshLeads } = useLeads();
  const { startBulkProcessing } = useProcessing();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showFireflies, setShowFireflies] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [scoringAll, setScoringAll] = useState(false);
  const [linkedinEnriching, setLinkedinEnriching] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [archivedLeads, setArchivedLeads] = useState<any[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("dateSubmitted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const linkedinStats = useMemo(() => {
    const total = leads.length;
    const found = leads.filter(l => l.linkedinUrl && l.linkedinUrl.includes("linkedin.com/in/")).length;
    const notFound = leads.filter(l => l.linkedinUrl === "").length;
    const pending = total - found - notFound;
    const pct = total > 0 ? Math.round((found / total) * 100) : 0;
    
    // Failure pattern breakdown for not-found leads
    const failedLeads = leads.filter(l => l.linkedinUrl === "");
    const noCompany = failedLeads.filter(l => !l.company || l.company.trim() === "").length;
    const singleName = failedLeads.filter(l => l.name.split(/\s+/).filter(p => p.length >= 2).length < 2 && l.company).length;
    const personalEmail = failedLeads.filter(l => {
      const domain = l.email?.split("@")[1]?.toLowerCase() || "";
      return ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "protonmail.com"].includes(domain);
    }).length;
    const otherFailures = notFound - noCompany - singleName;
    
    return { total, found, notFound, pending, pct, noCompany, singleName, personalEmail, otherFailures: Math.max(0, otherFailures) };
  }, [leads]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    const filtered = leads.filter((l) => {
      const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.email.toLowerCase().includes(search.toLowerCase()) || l.company.toLowerCase().includes(search.toLowerCase());
      const matchStage = stageFilter === "all" || l.stage === stageFilter;
      const matchBrand = brandFilter === "all" || l.brand === brandFilter;
      return matchSearch && matchStage && matchBrand;
    });

    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name": return dir * a.name.localeCompare(b.name);
        case "company": return dir * (a.company || "").localeCompare(b.company || "");
        case "role": return dir * a.role.localeCompare(b.role);
        case "stage": return dir * STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) * (dir > 0 ? 1 : -1) || 0;
        case "dealValue": return dir * (a.dealValue - b.dealValue);
        case "days": return dir * (computeDaysInStage(a.stageEnteredDate) - computeDaysInStage(b.stageEnteredDate));
        case "priority": return dir * ((PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));
        case "dateSubmitted": return dir * (a.createdAt || a.dateSubmitted).localeCompare(b.createdAt || b.dateSubmitted);
        case "source": return dir * a.source.localeCompare(b.source);
        case "serviceInterest": return dir * a.serviceInterest.localeCompare(b.serviceInterest);
        case "score": return dir * ((a.stage2Score ?? a.stage1Score ?? -1) - (b.stage2Score ?? b.stage1Score ?? -1));
        case "tier": return dir * ((a.tier ?? 99) - (b.tier ?? 99));
        default: return 0;
      }
    });
  }, [leads, search, stageFilter, brandFilter, sortKey, sortDir]);

  const exportCSV = () => {
    const headers = ["Brand","Name","Email","Phone","Company","Role","Source","Date Submitted","Stage","Service Interest","Deal Value","Subscription Value","Billing Frequency","Contract Start","Contract End","Lead Score","Tier","Priority","Assigned To","Meeting Date","Meeting Outcome","Forecast Category","ICP Fit","Days In Stage","Hours To Meeting Set","Close Reason","Won Reason","Lost Reason","Closed Date","Last Contact","Next Follow-up","Duplicate","Meetings","Enriched","Momentum","Notes"];
    const rows = leads.map((l) => {
      const avgTalk = l.meetings?.length ? Math.round(l.meetings.filter(m => m.intelligence?.talkRatio).reduce((s, m) => s + (m.intelligence?.talkRatio || 0), 0) / l.meetings.filter(m => m.intelligence?.talkRatio).length) || "" : "";
      return [
        l.brand, l.name, l.email, l.phone, l.company, l.role, l.source, l.dateSubmitted, l.stage, l.serviceInterest,
        l.dealValue || "", l.subscriptionValue || "", l.billingFrequency || "", l.contractStart || "", l.contractEnd || "",
        l.stage2Score ?? l.stage1Score ?? "", l.tier ?? "",
        l.priority, l.assignedTo, l.meetingDate, l.meetingOutcome, l.forecastCategory,
        l.icpFit, computeDaysInStage(l.stageEnteredDate), l.hoursToMeetingSet ?? "", l.closeReason, l.wonReason, l.lostReason,
        l.closedDate, l.lastContactDate, l.nextFollowUp, l.isDuplicate ? "Yes" : "",
        l.meetings?.length || 0, l.enrichment ? "Yes" : "No",
        l.dealIntelligence?.momentumSignals?.momentum || "",
        `"${(l.notes || "").replace(/"/g, '""')}"`
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-export-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const unscoredCount = useMemo(() => leads.filter(l => l.stage1Score == null).length, [leads]);

  const handleScoreAll = async () => {
    setScoringAll(true);
    try {
      let totalScored = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("backfill-lead-scores");
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        totalScored += data?.scored || 0;
        hasMore = data?.hasMore || false;
      }
      toast.success(`Scored ${totalScored} lead${totalScored !== 1 ? "s" : ""}`);
    } catch (e: any) {
      console.error("Score all failed:", e);
      toast.error(e.message || "Failed to score leads");
    } finally {
      setScoringAll(false);
    }
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "role", label: "Role" },
    { key: "stage", label: "Stage" },
    { key: "serviceInterest", label: "Service" },
    { key: "dealValue", label: "Value" },
    { key: "days", label: "Days" },
    { key: "score", label: "Score" },
    { key: "tier", label: "Tier" },
    { key: "priority", label: "Priority" },
    { key: "dateSubmitted", label: "Date" },
    { key: "source", label: "Source" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">{sorted.length} of {leads.length} leads</p>
        </div>
        <div className="flex gap-2">
          {/* Sync All — Calendly + Fireflies + bulk process */}
          <Button variant="outline" size="sm" disabled={backfilling} onClick={async () => {
            setBackfilling(true);
            toast.info("Syncing — Calendly → Fireflies → processing...");
            try {
              const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
              await supabase.from("processing_jobs")
                .update({ acknowledged: true, status: "failed", error: "Timed out (zombie cleanup)" })
                .in("status", ["queued", "processing"])
                .lt("created_at", fifteenMinAgo);

              toast.info("Running Calendly sync...");
              const res = await supabase.functions.invoke("backfill-calendly");
              const calendlyResults = res.data?.results?.filter((r: any) => r.status === "advanced_to_meeting_set" || r.status === "stamped_only") || [];
              toast.success(`Calendly: ${calendlyResults.length} matches found`);

               await refreshLeads();

               const { data: freshLeads } = await supabase.from("leads").select("id, meetings").is("archived_at", null);
               const { data: doneJobs } = await supabase.from("processing_jobs").select("lead_id").in("status", ["done", "completed"]).neq("new_meetings", "[]");
               const doneIds = new Set((doneJobs || []).map((r: any) => r.lead_id));
               const unprocessed = (freshLeads || []).filter((l: any) => {
                 const meetings = Array.isArray(l.meetings) ? l.meetings : [];
                 return meetings.length === 0 && !doneIds.has(l.id);
               });

               if (unprocessed.length > 0) {
                 toast.info(`Queuing ${unprocessed.length} leads for Fireflies search...`);
                 startBulkProcessing(unprocessed.length);
              } else {
                toast.success("All leads already processed!");
              }
            } catch (err) {
              toast.error("Sync failed: " + (err as Error).message);
            } finally {
              setBackfilling(false);
            }
          }}>
            {backfilling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {backfilling ? "Syncing..." : "Sync All"}
          </Button>

          {/* LinkedIn Enrich — split button with Re-enrich Stale */}
          <div className="flex">
            <Button variant="outline" size="sm" disabled={linkedinEnriching} className="rounded-r-none border-r-0" onClick={async () => {
              setLinkedinEnriching(true);
              toast.info("Starting LinkedIn enrichment...");
              try {
                const { data, error } = await supabase.functions.invoke("backfill-linkedin", { body: { retry_failed: true } });
                if (error) throw error;
                if (data?.error) throw new Error(data.error);
                toast.success(`LinkedIn: ${data?.found || 0}/${data?.processed || 0} profiles found (${data?.chainsRun || 1} chains)`);
                refreshLeads();
              } catch (err) {
                toast.error("LinkedIn enrichment failed: " + (err as Error).message);
              } finally {
                setLinkedinEnriching(false);
              }
            }}>
              {linkedinEnriching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Linkedin className="w-4 h-4" />}
              {linkedinEnriching ? "Enriching..." : "LinkedIn Enrich"}
              {linkedinStats.total > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] text-muted-foreground ml-1 cursor-help">({linkedinStats.found}/{linkedinStats.total})</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs space-y-1 max-w-[220px]">
                      <p className="font-medium">LinkedIn Coverage</p>
                      <p>Found: {linkedinStats.found}</p>
                      <p>Not found: {linkedinStats.notFound}</p>
                      <p>Pending: {linkedinStats.pending}</p>
                      {linkedinStats.notFound > 0 && (
                        <>
                          <p className="font-medium pt-1 border-t border-border mt-1">Failure Patterns</p>
                          {linkedinStats.noCompany > 0 && <p>No company info: {linkedinStats.noCompany}</p>}
                          {linkedinStats.singleName > 0 && <p>Single name only: {linkedinStats.singleName}</p>}
                          {linkedinStats.personalEmail > 0 && <p>Personal email: {linkedinStats.personalEmail}</p>}
                          {linkedinStats.otherFailures > 0 && <p>Other: {linkedinStats.otherFailures}</p>}
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-l-none px-1.5" disabled={linkedinEnriching}>
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={async () => {
                  setLinkedinEnriching(true);
                  toast.info("Enriching leads with no LinkedIn profile (never searched)...");
                  try {
                    const { data, error } = await supabase.functions.invoke("backfill-linkedin", { body: {} });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    toast.success(`Enrich Missing: ${data?.found || 0}/${data?.processed || 0} found (${data?.chainsRun || 1} chains)`);
                    refreshLeads();
                  } catch (err) {
                    toast.error("Enrichment failed: " + (err as Error).message);
                  } finally {
                    setLinkedinEnriching(false);
                  }
                }}>
                  <Linkedin className="w-4 h-4 mr-2" />
                  Enrich Missing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  setLinkedinEnriching(true);
                  toast.info("Re-enriching leads searched 30+ days ago...");
                  try {
                    const { data, error } = await supabase.functions.invoke("backfill-linkedin", { body: { minAge: 30 } });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    toast.success(`Stale re-enrichment: ${data?.found || 0}/${data?.processed || 0} found (${data?.chainsRun || 1} chains)`);
                    refreshLeads();
                  } catch (err) {
                    toast.error("Re-enrichment failed: " + (err as Error).message);
                  } finally {
                    setLinkedinEnriching(false);
                  }
                }}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-enrich Stale (30+ days)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* More — secondary actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="w-4 h-4" />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {unscoredCount > 0 && (
                <DropdownMenuItem onClick={handleScoreAll} disabled={scoringAll}>
                  <Target className="w-4 h-4 mr-2" />
                  {scoringAll ? "Scoring..." : `Score ${unscoredCount} Leads`}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowBulk(true)}>
                <Zap className="w-4 h-4 mr-2" />
                Process Leads
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowFireflies(true)}>
                <img src="/fireflies-icon.svg" alt="" className="w-4 h-4 mr-2" />
                Import Fireflies
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
          <Button size="sm" onClick={() => setShowNewLead(true)}>New Lead</Button>
        </div>
      </div>
      {scoringAll && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Target className="h-3.5 w-3.5 animate-pulse text-primary" />
            <span>Scoring leads in batches...</span>
          </div>
          <Progress value={undefined} className="h-1.5 [&>div]:animate-pulse" />
        </div>
      )}

      <div className="flex gap-3 items-center">
        <div className="flex rounded-md border border-border overflow-hidden mr-2">
          <button
            onClick={() => setViewMode("active")}
            className={cn("px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "active" ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted")}
          >Active</button>
          <button
            onClick={() => {
              setViewMode("archived");
              setLoadingArchived(true);
              supabase.from("leads").select("id, name, company, stage, archive_reason, archived_at, brand").not("archived_at", "is", null).order("archived_at", { ascending: false }).then(({ data }) => {
                setArchivedLeads(data || []);
                setLoadingArchived(false);
              });
            }}
            className={cn("px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "archived" ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted")}
          >Archived</button>
        </div>
        {viewMode === "active" && (
          <>
            <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Stages" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="All Brands" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                <SelectItem value="Captarget">Captarget</SelectItem>
                <SelectItem value="SourceCo">SourceCo</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {viewMode === "archived" ? (
        <div className="border border-border rounded-md overflow-x-auto">
          {loadingArchived ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading archived leads...</div>
          ) : archivedLeads.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No archived leads</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Stage</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Archive Reason</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Archived</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {archivedLeads.map((al: any) => (
                  <tr key={al.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <BrandLogo brand={al.brand} size="xxs" />
                        {al.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{al.company || "—"}</td>
                    <td className="px-4 py-3 text-xs">{al.stage}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{al.archive_reason || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{al.archived_at ? format(parseISO(al.archived_at), "MMM d, yyyy") : "—"}</td>
                    <td className="px-2 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          supabase.from("leads").update({ archived_at: null, archive_reason: '' } as any).eq("id", al.id).then(({ error }) => {
                            if (error) { toast.error("Failed to restore"); return; }
                            setArchivedLeads(prev => prev.filter(a => a.id !== al.id));
                            refreshLeads();
                            toast.success(`${al.name} restored`);
                          });
                        }}
                      >Restore</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
      <div className="border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none transition-colors"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((lead) => (
              <tr key={lead.id} onClick={() => { setSelectedLeadId(lead.id); markLeadSeen(lead.id); }} className={cn("cursor-pointer hover:bg-secondary/30 transition-colors", getBrandBorderClass(lead.brand))}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div>
                      <div className="font-medium flex items-center gap-1.5">
                        <BrandLogo brand={lead.brand} size="xxs" />
                        {lead.name}
                        {lead.linkedinUrl && (
                          <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={lead.linkedinTitle || "LinkedIn Profile"}>
                            <Linkedin className="h-3.5 w-3.5 text-[#0A66C2] hover:opacity-70 transition-opacity" />
                          </a>
                        )}
                        {isLeadNew(lead.id) && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 animate-pulse">NEW</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </div>
                    {lead.isDuplicate && <span className="text-[10px] px-1 py-0.5 bg-secondary rounded ml-1">DUP</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground"><span className="flex items-center gap-1.5"><CompanyAvatar companyUrl={lead.companyUrl} email={lead.email} companyName={lead.company} size="xs" />{lead.company || "—"}</span></td>
                <td className="px-4 py-3 text-muted-foreground">{lead.role}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs px-1.5 py-0.5 border border-border rounded w-fit">{lead.stage}</span>
                    {lead.calendlyBookedAt && (
                      <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium whitespace-nowrap">
                        <CalendarCheck className="h-3 w-3 shrink-0" />
                        {lead.calendlyEventName || "Calendly"}{lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration}m` : ""}{lead.meetingDate ? ` · ${(() => { try { return format(parseISO(lead.meetingDate), "MMM d, h:mm a"); } catch { return ""; } })()}` : ""}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.serviceInterest !== "TBD" ? lead.serviceInterest : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{computeDaysInStage(lead.stageEnteredDate)}d</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{lead.stage2Score ?? lead.stage1Score ?? "—"}</td>
                <td className="px-4 py-3">
                  {lead.tier != null ? (
                    <span className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded",
                      lead.tier === 1 && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                      lead.tier === 2 && "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                      lead.tier === 3 && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      lead.tier === 4 && "bg-orange-500/15 text-orange-700 dark:text-orange-400",
                      lead.tier === 5 && "bg-red-500/15 text-red-700 dark:text-red-400",
                    )}>T{lead.tier}</span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-xs">{lead.priority}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.createdAt ? format(parseISO(lead.createdAt), "MMM d, h:mm a") : lead.dateSubmitted}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{SOURCE_LABELS[lead.source] || lead.source}</td>
                <td className="px-2 py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); setArchiveTarget({ id: lead.id, name: lead.name }); }}
                    className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Archive lead"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      <NewLeadDialog open={showNewLead} onClose={() => setShowNewLead(false)} onSave={addLead} />
      <FirefliesImportDialog open={showFireflies} onOpenChange={setShowFireflies} />
      <BulkProcessingDialog open={showBulk} onOpenChange={setShowBulk} />
      <ArchiveDialog
        open={!!archiveTarget}
        leadName={archiveTarget?.name || ""}
        onConfirm={(reason) => { if (archiveTarget) { archiveLead(archiveTarget.id, reason); setArchiveTarget(null); } }}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

function NewLeadDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (lead: any) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", companyUrl: "", role: "", message: "", dealsPlanned: "0-2" });
  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.name || !form.email) return;
    const today = new Date().toISOString().split("T")[0];
    onSave({
      brand: "Captarget" as Brand,
      name: form.name, email: form.email, phone: form.phone, company: form.company,
      companyUrl: form.companyUrl, role: form.role, message: form.message, dealsPlanned: form.dealsPlanned,
      source: "CT Contact Form" as LeadSource, dateSubmitted: today,
      stage: "Unassigned" as LeadStage, serviceInterest: "TBD" as const, dealValue: 0, assignedTo: "",
      meetingDate: "", meetingSetDate: "", closeReason: "" as const, closedDate: "", notes: "",
      lastContactDate: "", nextFollowUp: "", priority: "Medium" as const,
      meetingOutcome: "" as const, forecastCategory: "" as const, icpFit: "" as const, preScreenCompleted: false,
      wonReason: "", lostReason: "", targetCriteria: "", targetRevenue: "", geography: "", currentSourcing: "",
      isDuplicate: false, duplicateOf: "", hearAboutUs: "", acquisitionStrategy: "", buyerType: "",
      meetings: [],
      subscriptionValue: 0, billingFrequency: "" as const, contractStart: "", contractEnd: "",
      firefliesUrl: "", firefliesTranscript: "", firefliesSummary: "", firefliesNextSteps: "",
      stage1Score: null, stage2Score: null, tier: null, tierOverride: false, enrichmentStatus: "",
      linkedinUrl: "", linkedinTitle: "", createdAt: new Date().toISOString(),
      calendlyBookedAt: "",
    });
    setForm({ name: "", email: "", phone: "", company: "", companyUrl: "", role: "", message: "", dealsPlanned: "0-2" });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="sm:max-w-md" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>New Lead</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder="Name *" value={form.name} onChange={(e) => update("name", e.target.value)} />
          <Input placeholder="Email *" value={form.email} onChange={(e) => update("email", e.target.value)} />
          <Input placeholder="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          <Input placeholder="Company" value={form.company} onChange={(e) => update("company", e.target.value)} />
          <Input placeholder="Role" value={form.role} onChange={(e) => update("role", e.target.value)} />
          <Textarea placeholder="Message / Notes" value={form.message} onChange={(e) => update("message", e.target.value)} rows={3} />
          <Button onClick={handleSave} className="w-full" disabled={!form.name || !form.email}>Create Lead</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}