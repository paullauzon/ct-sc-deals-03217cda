import { useState, useEffect, useMemo } from "react";
import { Lead, Brand, ServiceInterest, IcpFit, ForecastCategory } from "@/types/lead";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Filter, Flame, DollarSign, CalendarClock, Zap, User } from "lucide-react";
import { computeDaysInStage } from "@/lib/leadUtils";

// ─── Filter types ───

export interface PipelineFilters {
  owners: string[];
  priorities: string[];
  brands: Brand[];
  serviceInterests: ServiceInterest[];
  icpFits: string[];
  forecastCategories: string[];
  momentum: string[];
  daysInStage: string[];
  hasMeetings: string | null; // "yes" | "no" | null
  dealValueRange: string[];
  overdue: boolean;
}

const EMPTY_FILTERS: PipelineFilters = {
  owners: [],
  priorities: [],
  brands: [],
  serviceInterests: [],
  icpFits: [],
  forecastCategories: [],
  momentum: [],
  daysInStage: [],
  hasMeetings: null,
  dealValueRange: [],
  overdue: false,
};

const STORAGE_KEY = "pipeline-filters";

function loadFilters(): PipelineFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY_FILTERS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...EMPTY_FILTERS };
}

function saveFilters(f: PipelineFilters) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
}

// ─── Filter matching ───

function getDealMomentum(lead: Lead): string {
  return lead.dealIntelligence?.momentumSignals?.momentum || "Unknown";
}

function getDaysInStageBucket(lead: Lead): string {
  const days = computeDaysInStage(lead.stageEnteredDate);
  if (days < 7) return "<7d";
  if (days < 14) return "7-14d";
  if (days < 30) return "14-30d";
  return "30d+";
}

function getDealValueBucket(lead: Lead): string {
  if (lead.dealValue < 5000) return "<$5K";
  if (lead.dealValue < 25000) return "$5-25K";
  if (lead.dealValue < 100000) return "$25-100K";
  return "$100K+";
}

export function matchesFilters(lead: Lead, filters: PipelineFilters): boolean {
  if (filters.owners.length > 0 && !filters.owners.includes(lead.assignedTo || "Unassigned")) return false;
  if (filters.priorities.length > 0 && !filters.priorities.includes(lead.priority)) return false;
  if (filters.brands.length > 0 && !filters.brands.includes(lead.brand)) return false;
  if (filters.serviceInterests.length > 0 && !filters.serviceInterests.includes(lead.serviceInterest)) return false;
  if (filters.icpFits.length > 0) {
    const fit = lead.icpFit || "Unscored";
    if (!filters.icpFits.includes(fit)) return false;
  }
  if (filters.forecastCategories.length > 0) {
    const fc = lead.forecastCategory || "Unset";
    if (!filters.forecastCategories.includes(fc)) return false;
  }
  if (filters.momentum.length > 0 && !filters.momentum.includes(getDealMomentum(lead))) return false;
  if (filters.daysInStage.length > 0 && !filters.daysInStage.includes(getDaysInStageBucket(lead))) return false;
  if (filters.hasMeetings === "yes" && (!lead.meetings || lead.meetings.length === 0)) return false;
  if (filters.hasMeetings === "no" && lead.meetings && lead.meetings.length > 0) return false;
  if (filters.dealValueRange.length > 0 && !filters.dealValueRange.includes(getDealValueBucket(lead))) return false;
  if (filters.overdue) {
    if (!lead.nextFollowUp || new Date(lead.nextFollowUp) >= new Date()) return false;
  }
  return true;
}

// ─── Multi-select filter popover ───

function FilterPopover({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const activeCount = selected.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap ${
          activeCount > 0 ? "border-foreground/30 bg-foreground/5 text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
        }`}>
          {label}
          {activeCount > 0 && (
            <span className="bg-foreground text-background rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{activeCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer text-xs">
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => onToggle(opt)}
                className="h-3.5 w-3.5"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Summary stats ───

function SummaryStats({ filtered, total }: { filtered: Lead[]; total: Lead[] }) {
  const pipelineValue = filtered.reduce((s, l) => s + l.dealValue, 0);
  const stallingCount = filtered.filter(l => {
    const m = l.dealIntelligence?.momentumSignals?.momentum;
    return m === "Stalling" || m === "Stalled";
  }).length;
  const avgDays = filtered.length > 0
    ? Math.round(filtered.reduce((s, l) => s + computeDaysInStage(l.stageEnteredDate), 0) / filtered.length)
    : 0;
  const overdueCount = filtered.filter(l => {
    if (!l.nextFollowUp) return false;
    return new Date(l.nextFollowUp) < new Date();
  }).length;

  const isFiltered = filtered.length !== total.length;

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
      <span className="tabular-nums">
        {isFiltered ? `${filtered.length} of ${total.length}` : filtered.length} deals
      </span>
      <span className="tabular-nums">${pipelineValue.toLocaleString()} pipeline</span>
      {stallingCount > 0 && (
        <span className="text-destructive font-medium">{stallingCount} stalling</span>
      )}
      <span className="tabular-nums">{avgDays}d avg in stage</span>
      {overdueCount > 0 && (
        <span className="text-destructive font-medium">{overdueCount} overdue follow-ups</span>
      )}
    </div>
  );
}

// ─── Main component ───

const OWNERS = ["Malik", "Valeria", "Tomos", "Unassigned"];
const PRIORITIES = ["High", "Medium", "Low"];
const BRANDS: Brand[] = ["Captarget", "SourceCo"];
const SERVICE_INTERESTS: ServiceInterest[] = [
  "Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage",
  "Full Platform (All 3)", "SourceCo Retained Search", "Other", "TBD",
];
const ICP_FITS = ["Strong", "Moderate", "Weak", "Unscored"];
const FORECAST_CATS = ["Commit", "Best Case", "Pipeline", "Omit", "Unset"];
const MOMENTUM_OPTIONS = ["Accelerating", "Steady", "Stalling", "Stalled", "Unknown"];
const DAYS_BUCKETS = ["<7d", "7-14d", "14-30d", "30d+"];
const VALUE_BUCKETS = ["<$5K", "$5-25K", "$25-100K", "$100K+"];

export function PipelineFilterBar({
  leads,
  onFiltersChange,
}: {
  leads: Lead[];
  onFiltersChange: (filters: PipelineFilters) => void;
}) {
  const [filters, setFilters] = useState<PipelineFilters>(loadFilters);

  useEffect(() => {
    saveFilters(filters);
    onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  const filteredLeads = useMemo(() => leads.filter(l => matchesFilters(l, filters)), [leads, filters]);

  const hasActiveFilters = useMemo(() => {
    return filters.owners.length > 0 || filters.priorities.length > 0 || filters.brands.length > 0 ||
      filters.serviceInterests.length > 0 || filters.icpFits.length > 0 || filters.forecastCategories.length > 0 ||
      filters.momentum.length > 0 || filters.daysInStage.length > 0 || filters.hasMeetings !== null ||
      filters.dealValueRange.length > 0 || filters.overdue;
  }, [filters]);


  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (name: string, preset: Partial<PipelineFilters>) => {
    if (activePreset === name) {
      // Toggle off
      setFilters({ ...EMPTY_FILTERS });
      setActivePreset(null);
    } else {
      setFilters({ ...EMPTY_FILTERS, ...preset });
      setActivePreset(name);
    }
  };

  // Clear active preset when filters change manually
  const toggle = (key: keyof PipelineFilters, value: string) => {
    setActivePreset(null);
    setFilters(prev => {
      const arr = prev[key] as string[];
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  };

  const clearAll = () => { setFilters({ ...EMPTY_FILTERS }); setActivePreset(null); };

  const presets = [
    { name: "attention", label: "Needs Attention", icon: <Flame className="h-3 w-3" />, preset: { priorities: ["High"], daysInStage: ["14-30d", "30d+"] } },
    { name: "big", label: "Big Deals", icon: <DollarSign className="h-3 w-3" />, preset: { dealValueRange: ["$25-100K", "$100K+"] } },
    { name: "overdue", label: "Overdue Follow-ups", icon: <CalendarClock className="h-3 w-3" />, preset: { overdue: true } },
    { name: "hot", label: "Hot Momentum", icon: <Zap className="h-3 w-3" />, preset: { momentum: ["Accelerating"] } },
  ];

  return (
    <div className="space-y-3">
      {/* Quick-filter presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mr-1">Quick:</span>
        {presets.map(p => (
          <button
            key={p.name}
            onClick={() => applyPreset(p.name, p.preset as Partial<PipelineFilters>)}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors ${
              activePreset === p.name
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
            }`}
          >
            {p.icon} {p.label}
          </button>
        ))}
        {hasActiveFilters && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-medium">Filtered</Badge>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <FilterPopover label="Owner" options={OWNERS} selected={filters.owners} onToggle={(v) => toggle("owners", v)} />
        <FilterPopover label="Priority" options={PRIORITIES} selected={filters.priorities} onToggle={(v) => toggle("priorities", v)} />
        <FilterPopover label="Brand" options={BRANDS} selected={filters.brands} onToggle={(v) => toggle("brands", v as any)} />
        <FilterPopover label="Service" options={SERVICE_INTERESTS} selected={filters.serviceInterests} onToggle={(v) => toggle("serviceInterests", v as any)} />
        <FilterPopover label="ICP Fit" options={ICP_FITS} selected={filters.icpFits} onToggle={(v) => toggle("icpFits", v)} />
        <FilterPopover label="Forecast" options={FORECAST_CATS} selected={filters.forecastCategories} onToggle={(v) => toggle("forecastCategories", v)} />
        <FilterPopover label="Momentum" options={MOMENTUM_OPTIONS} selected={filters.momentum} onToggle={(v) => toggle("momentum", v)} />
        <FilterPopover label="Days in Stage" options={DAYS_BUCKETS} selected={filters.daysInStage} onToggle={(v) => toggle("daysInStage", v)} />
        <FilterPopover label="Deal Value" options={VALUE_BUCKETS} selected={filters.dealValueRange} onToggle={(v) => toggle("dealValueRange", v)} />

        {/* Has meetings toggle */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap ${
              filters.hasMeetings !== null ? "border-foreground/30 bg-foreground/5 text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
            }`}>
              Meetings
              {filters.hasMeetings !== null && (
                <span className="bg-foreground text-background rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">1</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-2" align="start">
            <div className="space-y-1">
              {[{ label: "Has meetings", value: "yes" }, { label: "No meetings", value: "no" }].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer text-xs">
                  <Checkbox
                    checked={filters.hasMeetings === opt.value}
                    onCheckedChange={() => setFilters(prev => ({ ...prev, hasMeetings: prev.hasMeetings === opt.value ? null : opt.value }))}
                    className="h-3.5 w-3.5"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      {/* Summary stats */}
      <SummaryStats filtered={filteredLeads} total={leads} />
    </div>
  );
}
