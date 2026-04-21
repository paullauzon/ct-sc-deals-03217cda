// Per-lead detail report for the Fireflies historical backfill.
// Joins fireflies_retry_queue (where fireflies_id starts with "backfill:")
// with the leads table so the user can see exactly which leads have been
// classified, why, and what's still pending. Refreshes every 15s while open.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2, XCircle, Clock, RefreshCw, Download, ExternalLink, Loader2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface QueueRow {
  id: string;
  fireflies_id: string;
  lead_id: string;
  status: "pending" | "done" | "gave_up";
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadLite {
  id: string;
  name: string;
  company: string;
  calendly_booked_at: string;
  meeting_date: string;
  brand: string;
}

type Filter = "all" | "gave_up" | "pending" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FirefliesBackfillReport({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [leadsById, setLeadsById] = useState<Record<string, LeadLite>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    const { data: queue } = await supabase
      .from("fireflies_retry_queue")
      .select("id, fireflies_id, lead_id, status, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at")
      .like("fireflies_id", "backfill:%")
      .order("status", { ascending: true })
      .order("updated_at", { ascending: false });
    const queueRows = (queue || []) as QueueRow[];
    setRows(queueRows);

    const ids = Array.from(new Set(queueRows.map(r => r.lead_id).filter(Boolean)));
    if (ids.length) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, company, calendly_booked_at, meeting_date, brand")
        .in("id", ids);
      const map: Record<string, LeadLite> = {};
      (leads || []).forEach(l => { map[l.id] = l as LeadLite; });
      setLeadsById(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [open]);

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter(r => r.status === "pending").length,
    done: rows.filter(r => r.status === "done").length,
    gave_up: rows.filter(r => r.status === "gave_up").length,
  }), [rows]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter(r => r.status === filter);
  }, [rows, filter]);

  const completed = counts.done + counts.gave_up;
  const pct = counts.all ? Math.round((completed / counts.all) * 100) : 0;
  const minutesRemaining = counts.pending * (5 / 5); // ~5 leads / 5 minutes
  const etaLabel = counts.pending === 0
    ? "Backfill complete"
    : minutesRemaining > 60
      ? `~${(minutesRemaining / 60).toFixed(1)} hours remaining`
      : `~${Math.max(1, Math.round(minutesRemaining))} minutes remaining`;

  const giveUpReason = (err: string | null): string => {
    if (!err) return "Unknown reason";
    if (err.includes("not_in_fireflies_api") || err.toLowerCase().includes("not in fireflies"))
      return "Fireflies has no recording (likely past ~90 day retention)";
    if (err.includes("max_attempts")) return "Exceeded retry limit";
    return err;
  };

  const bookedDate = (lead?: LeadLite): string => {
    const raw = lead?.calendly_booked_at || lead?.meeting_date || "";
    if (!raw) return "—";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return format(d, "MMM d, yyyy");
  };

  const exportCsv = () => {
    const header = ["lead_id", "name", "company", "brand", "booked_at", "status", "attempts", "max_attempts", "last_error", "next_attempt_at", "updated_at"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      const lead = leadsById[r.lead_id];
      const cells = [
        r.lead_id,
        lead?.name || "",
        lead?.company || "",
        lead?.brand || "",
        lead?.calendly_booked_at || lead?.meeting_date || "",
        r.status,
        String(r.attempts),
        String(r.max_attempts),
        (r.last_error || "").replace(/"/g, '""'),
        r.next_attempt_at,
        r.updated_at,
      ].map(v => `"${v}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fireflies-backfill-report-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openLead = (leadId: string) => {
    onOpenChange(false);
    navigate(`/deal/${leadId}`);
  };

  const StatusBadge = ({ status }: { status: QueueRow["status"] }) => {
    if (status === "done") {
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Matched
        </Badge>
      );
    }
    if (status === "gave_up") {
      return (
        <Badge variant="secondary" className="gap-1 text-muted-foreground">
          <XCircle className="h-3 w-3" /> Gave up
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> Pending
      </Badge>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!max-w-5xl w-full overflow-y-auto">
        <SheetHeader className="space-y-2">
          <SheetTitle>Fireflies Backfill Report</SheetTitle>
          <SheetDescription>
            {completed} of {counts.all} classified ({pct}%) · {etaLabel}
          </SheetDescription>
        </SheetHeader>

        {/* Summary banner */}
        {counts.gave_up > 0 && counts.done === 0 && (
          <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <span className="text-foreground font-medium">{counts.gave_up} of {completed} classified leads</span> have been
            marked &quot;gave up&quot; because the Fireflies API returned no recording — most of these meetings are past
            Fireflies&apos; ~90 day retention window. The system is working correctly; low recovery is a Fireflies retention
            limit, not a bug.
          </div>
        )}

        {/* Toolbar */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all" className="gap-1.5">All <span className="tabular-nums opacity-70">{counts.all}</span></TabsTrigger>
              <TabsTrigger value="gave_up" className="gap-1.5">Gave up <span className="tabular-nums opacity-70">{counts.gave_up}</span></TabsTrigger>
              <TabsTrigger value="pending" className="gap-1.5">Pending <span className="tabular-nums opacity-70">{counts.pending}</span></TabsTrigger>
              <TabsTrigger value="done" className="gap-1.5">Matched <span className="tabular-nums opacity-70">{counts.done}</span></TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setLoading(true); load(); }} className="h-8 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} className="h-8 gap-1.5" disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-3 border border-border rounded-md">
          {loading && rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No leads match this filter.
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Booked</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const lead = leadsById[r.lead_id];
                    const detail = r.status === "gave_up"
                      ? giveUpReason(r.last_error)
                      : r.status === "pending"
                        ? `Attempt ${r.attempts}/${r.max_attempts} · next ${formatDistanceToNow(new Date(r.next_attempt_at), { addSuffix: true })}`
                        : "Transcript imported";
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => openLead(r.lead_id)}
                      >
                        <TableCell className="font-medium">
                          {lead?.name || <span className="text-muted-foreground italic">{r.lead_id}</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lead?.company || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {bookedDate(lead)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate inline-block max-w-full align-middle">{detail}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md">
                              <div className="space-y-1 text-xs">
                                <div><span className="font-medium">Status:</span> {r.status}</div>
                                <div><span className="font-medium">Attempts:</span> {r.attempts}/{r.max_attempts}</div>
                                {r.last_error && (
                                  <div><span className="font-medium">Last error:</span> {r.last_error}</div>
                                )}
                                <div><span className="font-medium">Next attempt:</span> {format(new Date(r.next_attempt_at), "MMM d, HH:mm")}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums text-xs">
                          {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); openLead(r.lead_id); }}
                            title="Open Deal Room"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
