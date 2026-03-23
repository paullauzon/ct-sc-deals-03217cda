import { useMemo } from "react";
import { Lead, Brand } from "@/types/lead";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type DateRange = "30" | "60" | "90" | "all";

export interface DashboardFilters {
  dateRange: DateRange;
  brand: "all" | Brand;
  owner: string;
  priority: string;
}

const DEFAULT_FILTERS: DashboardFilters = {
  dateRange: "all",
  brand: "all",
  owner: "all",
  priority: "all",
};

interface Props {
  leads: Lead[];
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
}

export function useDashboardFilters(leads: Lead[], filters: DashboardFilters) {
  return useMemo(() => {
    let filtered = leads;
    if (filters.dateRange !== "all") {
      const days = parseInt(filters.dateRange);
      const cutoff = new Date(Date.now() - days * 86400000);
      filtered = filtered.filter(l => new Date(l.dateSubmitted) >= cutoff);
    }
    if (filters.brand !== "all") {
      filtered = filtered.filter(l => l.brand === filters.brand);
    }
    if (filters.owner !== "all") {
      filtered = filtered.filter(l =>
        filters.owner === "Unassigned" ? !l.assignedTo : l.assignedTo === filters.owner
      );
    }
    if (filters.priority !== "all") {
      filtered = filtered.filter(l => l.priority === filters.priority);
    }
    return filtered;
  }, [leads, filters]);
}

export { DEFAULT_FILTERS };

export function DashboardFilterBar({ leads, filters, onFiltersChange }: Props) {
  const filteredCount = useDashboardFilters(leads, filters).length;
  const isFiltered = filters.dateRange !== "all" || filters.brand !== "all" || filters.owner !== "all" || filters.priority !== "all";

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select value={filters.dateRange} onValueChange={v => onFiltersChange({ ...filters, dateRange: v as DateRange })}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="60">Last 60 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
          <SelectItem value="all">All Time</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.brand} onValueChange={v => onFiltersChange({ ...filters, brand: v as "all" | Brand })}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Brands</SelectItem>
          <SelectItem value="Captarget">Captarget</SelectItem>
          <SelectItem value="SourceCo">SourceCo</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.owner} onValueChange={v => onFiltersChange({ ...filters, owner: v })}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Owners</SelectItem>
          <SelectItem value="Malik">Malik</SelectItem>
          <SelectItem value="Valeria">Valeria</SelectItem>
          <SelectItem value="Tomos">Tomos</SelectItem>
          <SelectItem value="Unassigned">Unassigned</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.priority} onValueChange={v => onFiltersChange({ ...filters, priority: v })}>
        <SelectTrigger className="h-8 w-[110px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          <SelectItem value="High">High</SelectItem>
          <SelectItem value="Medium">Medium</SelectItem>
          <SelectItem value="Low">Low</SelectItem>
        </SelectContent>
      </Select>

      {isFiltered && (
        <>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onFiltersChange(DEFAULT_FILTERS)}>
            Clear
          </Button>
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            Showing {filteredCount} of {leads.length} leads
          </span>
        </>
      )}
    </div>
  );
}
