import { useState, useEffect, useCallback } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Search, BarChart3, Kanban, List, CalendarDays, User } from "lucide-react";

interface Props {
  onNavigate: (view: string) => void;
  onSelectLead: (id: string) => void;
}

export function CommandPalette({ onNavigate, onSelectLead }: Props) {
  const [open, setOpen] = useState(false);
  const { leads } = useLeads();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleNav = useCallback((view: string) => {
    onNavigate(view);
    setOpen(false);
  }, [onNavigate]);

  const handleLead = useCallback((id: string) => {
    onSelectLead(id);
    setOpen(false);
  }, [onSelectLead]);

  // Recent leads (last 10 by updated_at or dateSubmitted)
  const recentLeads = leads
    .slice()
    .sort((a, b) => new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime())
    .slice(0, 8);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search leads, navigate, or run commands…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleNav("today")}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Go to Today
          </CommandItem>
          <CommandItem onSelect={() => handleNav("dashboard")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Go to Dashboard
          </CommandItem>
          <CommandItem onSelect={() => handleNav("leads")}>
            <List className="mr-2 h-4 w-4" />
            Go to Leads
          </CommandItem>
          <CommandItem onSelect={() => handleNav("pipeline")}>
            <Kanban className="mr-2 h-4 w-4" />
            Go to Pipeline
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Recent Leads">
          {recentLeads.map(lead => (
            <CommandItem key={lead.id} onSelect={() => handleLead(lead.id)}>
              <User className="mr-2 h-4 w-4" />
              <div className="flex flex-1 items-center justify-between">
                <span>{lead.name}</span>
                <span className="text-xs text-muted-foreground">{lead.company} · {lead.stage}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="All Leads">
          {leads.map(lead => (
            <CommandItem key={lead.id} value={`${lead.name} ${lead.company} ${lead.email}`} onSelect={() => handleLead(lead.id)}>
              <User className="mr-2 h-4 w-4" />
              <div className="flex flex-1 items-center justify-between">
                <span>{lead.name}</span>
                <span className="text-xs text-muted-foreground">{lead.company} · {lead.stage}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
