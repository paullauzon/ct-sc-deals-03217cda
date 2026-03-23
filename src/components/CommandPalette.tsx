import { useState, useEffect, useCallback } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { BarChart3, Kanban, List, CalendarDays, User, Brain } from "lucide-react";

interface Props {
  onNavigate: (view: string) => void;
  onSelectLead: (id: string) => void;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ onNavigate, onSelectLead, externalOpen, onExternalOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const { leads } = useLeads();

  // Sync external open state
  useEffect(() => {
    if (externalOpen !== undefined) setOpen(externalOpen);
  }, [externalOpen]);

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    onExternalOpenChange?.(val);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const handleNav = useCallback((view: string) => {
    onNavigate(view);
    handleOpenChange(false);
  }, [onNavigate]);

  const handleLead = useCallback((id: string) => {
    onSelectLead(id);
    handleOpenChange(false);
  }, [onSelectLead]);

  const recentLeads = leads
    .slice()
    .sort((a, b) => new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime())
    .slice(0, 8);

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Search leads, navigate, or run commands…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleNav("dashboard")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Dashboard — Executive Summary
          </CommandItem>
          <CommandItem onSelect={() => handleNav("pipeline")}>
            <Kanban className="mr-2 h-4 w-4" />
            Pipeline — Deal Flow
          </CommandItem>
          <CommandItem onSelect={() => handleNav("intel")}>
            <Brain className="mr-2 h-4 w-4" />
            Intel — Signal Center
          </CommandItem>
          <CommandItem onSelect={() => handleNav("leads")}>
            <List className="mr-2 h-4 w-4" />
            Leads — All Contacts
          </CommandItem>
          <CommandItem onSelect={() => handleNav("today")}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Today — Action Queue
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
