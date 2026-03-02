import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead, LeadStage, LeadSource, ServiceInterest, CloseReason, MeetingOutcome, ForecastCategory, IcpFit } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeDaysInStage } from "@/lib/leadUtils";

const STAGES: LeadStage[] = ["New Lead", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Closed Won", "Closed Lost", "Went Dark"];
const SERVICES: ServiceInterest[] = ["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "Other", "TBD"];
const PRIORITIES = ["High", "Medium", "Low"] as const;
const CLOSE_REASONS: CloseReason[] = ["Budget", "Timing", "Competitor", "No Fit", "No Response", "Not Qualified", "Champion Left", "Other"];
const MEETING_OUTCOMES: MeetingOutcome[] = ["Scheduled", "Held", "No-Show", "Rescheduled", "Cancelled"];
const FORECAST_CATEGORIES: ForecastCategory[] = ["Commit", "Best Case", "Pipeline", "Omit"];
const ICP_FITS: IcpFit[] = ["Strong", "Moderate", "Weak"];

type SortKey = "name" | "company" | "stage" | "dealValue" | "days" | "priority" | "dateSubmitted" | "source" | "serviceInterest" | "role";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export function LeadDetail({ leadId, open, onClose }: { leadId: string | null; open: boolean; onClose: () => void }) {
  const { leads, updateLead } = useLeads();
  const lead = leads.find((l) => l.id === leadId) || null;
  if (!lead) return null;

  const save = (updates: Partial<Lead>) => updateLead(lead.id, updates);
  const days = computeDaysInStage(lead.stageEnteredDate);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="overflow-y-auto" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">{lead.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">{lead.role} · {lead.company || "No company"}</p>
        </SheetHeader>

        <div className="space-y-6 mt-4">
          {/* Contact Info */}
          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Email" value={lead.email} />
              <Field label="Phone" value={lead.phone || "—"} />
              <Field label="Website" value={lead.companyUrl ? <a href={lead.companyUrl} target="_blank" rel="noreferrer" className="underline">{lead.companyUrl}</a> : "—"} />
              <Field label="Source" value={lead.source} />
              <Field label="Submitted" value={lead.dateSubmitted} />
              <Field label="Deals Planned" value={lead.dealsPlanned} />
            </div>
          </Section>

          {/* Message */}
          <Section title="Original Message">
            <p className="text-sm leading-relaxed">{lead.message}</p>
          </Section>

          {/* Target Criteria (if available) */}
          {lead.targetCriteria && (
            <Section title="Target Criteria">
              <p className="text-sm leading-relaxed">{lead.targetCriteria}</p>
              <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                <Field label="Revenue Range" value={lead.targetRevenue || "—"} />
                <Field label="Geography" value={lead.geography || "—"} />
                <Field label="Current Sourcing" value={lead.currentSourcing || "—"} />
              </div>
            </Section>
          )}

          {/* Deal Management */}
          <Section title="Deal Management">
            <div className="grid grid-cols-2 gap-4">
              <SelectField label="Stage" value={lead.stage} options={STAGES} onChange={(v) => save({ stage: v as LeadStage })} />
              <SelectField label="Service Interest" value={lead.serviceInterest} options={SERVICES} onChange={(v) => save({ serviceInterest: v as ServiceInterest })} />
              <SelectField label="Priority" value={lead.priority} options={[...PRIORITIES]} onChange={(v) => save({ priority: v as "High" | "Medium" | "Low" })} />
              <ClearableSelectField label="Forecast Category" value={lead.forecastCategory} options={FORECAST_CATEGORIES} onChange={(v) => save({ forecastCategory: v as ForecastCategory })} />
              <ClearableSelectField label="ICP Fit" value={lead.icpFit} options={ICP_FITS} onChange={(v) => save({ icpFit: v as IcpFit })} />
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Deal Value ($)</label>
                <Input type="number" value={lead.dealValue || ""} onChange={(e) => save({ dealValue: Number(e.target.value) || 0 })} className="mt-1" placeholder="Enter deal value" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Assigned To</label>
                <Input value={lead.assignedTo} onChange={(e) => save({ assignedTo: e.target.value })} className="mt-1" placeholder="Team member" />
              </div>
            </div>
          </Section>

          {/* Meeting Management */}
          <Section title="Meeting">
            <div className="grid grid-cols-2 gap-4">
              <ClearableSelectField label="Meeting Outcome" value={lead.meetingOutcome} options={MEETING_OUTCOMES} onChange={(v) => save({ meetingOutcome: v as MeetingOutcome })} />
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Meeting Date</label>
                <Input type="date" value={lead.meetingDate} onChange={(e) => save({ meetingDate: e.target.value, meetingSetDate: lead.meetingSetDate || new Date().toISOString().split("T")[0] })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Next Follow-up</label>
                <Input type="date" value={lead.nextFollowUp} onChange={(e) => save({ nextFollowUp: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Last Contact</label>
                <Input type="date" value={lead.lastContactDate} onChange={(e) => save({ lastContactDate: e.target.value })} className="mt-1" />
              </div>
            </div>
          </Section>

          {/* Close Reasons */}
          {lead.stage === "Closed Won" && (
            <Section title="Won Details">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Won Reason</label>
                <Input value={lead.wonReason} onChange={(e) => save({ wonReason: e.target.value })} className="mt-1" placeholder="Why did we win this deal?" />
              </div>
            </Section>
          )}

          {(lead.stage === "Closed Lost" || lead.stage === "Went Dark") && (
            <Section title="Lost / Dark Details">
              <div className="grid grid-cols-2 gap-4">
                <ClearableSelectField label="Close Reason" value={lead.closeReason} options={CLOSE_REASONS} onChange={(v) => save({ closeReason: v as CloseReason })} />
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Detail</label>
                  <Input value={lead.lostReason} onChange={(e) => save({ lostReason: e.target.value })} className="mt-1" placeholder="Additional context..." />
                </div>
              </div>
            </Section>
          )}

          {/* Tracking */}
          <Section title="Tracking">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Field label="Days in Stage" value={days} />
              <Field label="Hours to Meeting Set" value={lead.hoursToMeetingSet !== null ? lead.hoursToMeetingSet : "—"} />
              <Field label="Stage Entered" value={lead.stageEnteredDate || "—"} />
            </div>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <Textarea
              value={lead.notes}
              onChange={(e) => save({ notes: e.target.value })}
              placeholder="Add notes about this lead..."
              rows={4}
            />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border pb-1">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function SelectField({ label, value, options, onChange, placeholder }: { label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1"><SelectValue placeholder={placeholder || label} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

/** Select with a "None" clearable option for optional fields */
function ClearableSelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="mt-1"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function LeadsTable() {
  const { leads, addLead } = useLeads();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("dateSubmitted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
      return matchSearch && matchStage;
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
        case "dateSubmitted": return dir * a.dateSubmitted.localeCompare(b.dateSubmitted);
        case "source": return dir * a.source.localeCompare(b.source);
        case "serviceInterest": return dir * a.serviceInterest.localeCompare(b.serviceInterest);
        default: return 0;
      }
    });
  }, [leads, search, stageFilter, sortKey, sortDir]);

  const exportCSV = () => {
    const headers = ["Name","Email","Phone","Company","Role","Source","Date Submitted","Stage","Service Interest","Deal Value","Priority","Assigned To","Meeting Date","Meeting Outcome","Forecast Category","ICP Fit","Days In Stage","Hours To Meeting Set","Close Reason","Won Reason","Lost Reason","Closed Date","Last Contact","Next Follow-up","Notes"];
    const rows = leads.map((l) => [
      l.name, l.email, l.phone, l.company, l.role, l.source, l.dateSubmitted, l.stage, l.serviceInterest,
      l.dealValue || "", l.priority, l.assignedTo, l.meetingDate, l.meetingOutcome, l.forecastCategory,
      l.icpFit, computeDaysInStage(l.stageEnteredDate), l.hoursToMeetingSet ?? "", l.closeReason, l.wonReason, l.lostReason,
      l.closedDate, l.lastContactDate, l.nextFollowUp, `"${(l.notes || "").replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-export-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "role", label: "Role" },
    { key: "stage", label: "Stage" },
    { key: "serviceInterest", label: "Service" },
    { key: "dealValue", label: "Value" },
    { key: "days", label: "Days" },
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
          <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
          <Button size="sm" onClick={() => setShowNewLead(true)}>New Lead</Button>
        </div>
      </div>

      <div className="flex gap-3">
        <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Stages" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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
              <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)} className="cursor-pointer hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-xs text-muted-foreground">{lead.email}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{lead.company || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{lead.role}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 border border-border rounded">{lead.stage}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.serviceInterest !== "TBD" ? lead.serviceInterest : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{computeDaysInStage(lead.stageEnteredDate)}d</td>
                <td className="px-4 py-3 text-xs">{lead.priority}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.dateSubmitted}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{lead.source === "Contact Form" ? "CF" : "TF"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      <NewLeadDialog open={showNewLead} onClose={() => setShowNewLead(false)} onSave={addLead} />
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
      name: form.name, email: form.email, phone: form.phone, company: form.company,
      companyUrl: form.companyUrl, role: form.role, message: form.message, dealsPlanned: form.dealsPlanned,
      source: "Contact Form" as LeadSource, dateSubmitted: today,
      stage: "New Lead" as LeadStage, serviceInterest: "TBD" as const, dealValue: 0, assignedTo: "",
      meetingDate: "", meetingSetDate: "", closeReason: "" as const, closedDate: "", notes: "",
      lastContactDate: "", nextFollowUp: "", priority: "Medium" as const,
      meetingOutcome: "" as const, forecastCategory: "" as const, icpFit: "" as const,
      wonReason: "", lostReason: "", targetCriteria: "", targetRevenue: "", geography: "", currentSourcing: "",
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
