// Phase 5 — Smart Scheduler popover.
// Renders:
//   • Top-3 recommended slots (clickable chips) based on recipient open behavior
//   • Day × hour heatmap visualization (compact 7×24 grid)
//   • Sample-size disclosure (e.g. "Based on 14 opens from this contact")
//   • Quick presets ("In 1 hour", "Tomorrow 8 AM")
//   • Custom date/time picker (Calendar + time input)
//
// All recommendations show timezone-aware previews using the viewer's local tz.
import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Clock, CalendarIcon, ChevronDown, TrendingUp, Zap } from "lucide-react";
import { addHours, addDays, set, format } from "date-fns";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  computeSendTimeIntel, formatRelativeSlot, DOW_LABELS, DOW_FULL,
  type SendTimeIntel, type HourBucketStats,
} from "@/lib/sendTimeIntelligence";

interface Props {
  /** The lead/deal we're sending to (used to scope the open-event lookup). */
  leadId?: string;
  /** Primary recipient email — drives the per-contact analysis. */
  recipientEmail?: string;
  /** Sender's mailbox connection. Reserved for future per-mailbox stats. */
  fromConnectionId?: string;
  /** Disabled if the user hasn't met send prerequisites (vars missing, etc.). */
  disabled?: boolean;
  /** Whether a send is currently in flight. */
  scheduling?: boolean;
  /** Called with the final scheduled Date in viewer's local tz. */
  onSchedule: (when: Date) => void | Promise<void>;
  /** Compact trigger button (used in the composer footer split-button). */
  triggerLabel?: React.ReactNode;
  /** Pass through className to the trigger. */
  triggerClassName?: string;
}

/** Compact 7-row × 24-col heatmap. Cells colored by intensity. */
function Heatmap({ buckets }: { buckets: HourBucketStats[] }) {
  const max = Math.max(1, ...buckets.map(b => b.count));
  const grid: Map<string, HourBucketStats> = new Map(
    buckets.map(b => [`${b.dow}:${b.hour}`, b]),
  );
  // Render rows Mon..Fri first, then Sat, Sun (B2B-friendly)
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const peakHours = [6, 9, 12, 15, 18, 21]; // axis labels

  return (
    <TooltipProvider delayDuration={150}>
      <div className="text-[9px] text-muted-foreground">
        <div className="flex">
          <div className="w-6 shrink-0" />
          <div className="grid grid-cols-24 gap-px flex-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="text-center text-[8px] leading-none h-3">
                {peakHours.includes(h) ? (h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`) : ""}
              </div>
            ))}
          </div>
        </div>
        {dowOrder.map(dow => (
          <div key={dow} className="flex items-center">
            <div className="w-6 shrink-0 text-[9px] text-muted-foreground">{DOW_LABELS[dow]}</div>
            <div className="grid gap-px flex-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
              {Array.from({ length: 24 }).map((_, hour) => {
                const bucket = grid.get(`${dow}:${hour}`);
                const intensity = bucket ? bucket.count / max : 0;
                return (
                  <Tooltip key={hour}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "h-3 rounded-[1px] transition-colors",
                          intensity === 0 ? "bg-secondary/40" : "",
                        )}
                        style={
                          intensity > 0
                            ? { backgroundColor: `hsl(var(--primary) / ${0.15 + intensity * 0.85})` }
                            : undefined
                        }
                      />
                    </TooltipTrigger>
                    {bucket && (
                      <TooltipContent side="top" className="text-[10px] py-1 px-2">
                        {DOW_FULL[dow]} {hour}:00 · {bucket.count} open{bucket.count !== 1 ? "s" : ""}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}

export function SmartScheduler({
  leadId, recipientEmail, fromConnectionId,
  disabled, scheduling,
  onSchedule, triggerLabel, triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [intel, setIntel] = useState<SendTimeIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date | undefined>(undefined);
  const [pickedTime, setPickedTime] = useState<string>("09:00");
  const [showCustom, setShowCustom] = useState(false);

  // Lazy-load intel only when popover opens
  useEffect(() => {
    if (!open || intel) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await computeSendTimeIntel({
          leadId, recipientEmail, fromConnectionId,
        });
        if (!cancelled) setIntel(result);
      } catch (e) {
        console.error("send-time-intel failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, leadId, recipientEmail, fromConnectionId, intel]);

  // Quick presets
  const inOneHour = useMemo(() => addHours(new Date(), 1), [open]);
  const tomorrow8 = useMemo(
    () => set(addDays(new Date(), 1), { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }),
    [open],
  );
  const tomorrow1 = useMemo(
    () => set(addDays(new Date(), 1), { hours: 13, minutes: 0, seconds: 0, milliseconds: 0 }),
    [open],
  );

  const handlePick = (when: Date) => {
    setOpen(false);
    setShowCustom(false);
    onSchedule(when);
  };

  const handleCustomConfirm = () => {
    if (!pickedDate) return;
    const [hh, mm] = pickedTime.split(":").map(Number);
    const when = set(pickedDate, { hours: hh, minutes: mm, seconds: 0, milliseconds: 0 });
    handlePick(when);
  };

  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; }
  }, []);

  const buckets = intel
    ? (intel.usedGlobalFallback ? intel.globalBuckets : intel.recipientBuckets)
    : [];

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowCustom(false); }}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className={cn("rounded-l-none border-l border-primary-foreground/20 px-2", triggerClassName)}
          disabled={disabled || scheduling}
          title="Smart schedule"
          aria-label="Schedule send"
        >
          {triggerLabel ?? <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[420px] p-0 z-50">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold tracking-wide uppercase">Smart Send</span>
            {intel && !loading && (
              <Badge variant="secondary" className="ml-auto text-[9px] gap-1">
                <TrendingUp className="h-2.5 w-2.5" />
                {intel.usedGlobalFallback
                  ? `${intel.globalSampleSize} opens (team)`
                  : `${intel.recipientSampleSize} opens (this contact)`}
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {loading
              ? "Analyzing past opens…"
              : intel?.meanLagMinutes != null
                ? `Typically opens within ${intel.meanLagMinutes < 60 ? `${intel.meanLagMinutes}m` : `${Math.round(intel.meanLagMinutes / 60)}h`}`
                : "Pick a window when this contact is most likely to be in their inbox"}
          </div>
        </div>

        {/* Body */}
        {!showCustom ? (
          <div className="p-3 space-y-3">
            {/* Recommended slots */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Recommended
                {intel?.usedGlobalFallback && (
                  <span className="text-[9px] normal-case text-muted-foreground/70 ml-auto">
                    Using team-wide patterns (low data on this contact)
                  </span>
                )}
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-2 py-3">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing engagement patterns…
                </div>
              ) : intel?.recommended.length ? (
                <div className="space-y-1">
                  {intel.recommended.map((slot, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handlePick(slot.when)}
                      disabled={scheduling}
                      className={cn(
                        "w-full text-left rounded-md border border-border bg-background hover:bg-secondary/50",
                        "px-2.5 py-2 transition-colors flex items-center gap-2 group",
                        i === 0 && "border-primary/30 bg-primary/5",
                      )}
                    >
                      <div
                        className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 text-[9px] font-semibold"
                        style={{ backgroundColor: `hsl(var(--primary) / ${0.2 + slot.score * 0.6})`, color: "hsl(var(--primary-foreground))" }}
                      >
                        {Math.round(slot.score * 100)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-foreground">
                          {format(slot.when, "EEE, MMM d 'at' h:mm a")}
                          {i === 0 && <Badge variant="secondary" className="ml-1.5 text-[9px]">Best</Badge>}
                        </div>
                        <div className="text-[9px] text-muted-foreground">{slot.reason} · {formatRelativeSlot(slot.when)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground italic px-2 py-1.5">
                  Not enough engagement data yet. Use a quick preset below.
                </div>
              )}
            </div>

            {/* Heatmap */}
            {!loading && buckets.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Open pattern
                </div>
                <div className="rounded-md border border-border bg-secondary/20 px-1.5 py-1.5">
                  <Heatmap buckets={buckets} />
                </div>
              </div>
            )}

            {/* Quick presets */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Quick presets
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePick(inOneHour)}
                  disabled={scheduling}
                  className="rounded-md border border-border bg-background hover:bg-secondary/50 px-2 py-1.5 text-left"
                >
                  <div className="text-[10px] font-medium">In 1 hour</div>
                  <div className="text-[9px] text-muted-foreground">{format(inOneHour, "h:mm a")}</div>
                </button>
                <button
                  type="button"
                  onClick={() => handlePick(tomorrow8)}
                  disabled={scheduling}
                  className="rounded-md border border-border bg-background hover:bg-secondary/50 px-2 py-1.5 text-left"
                >
                  <div className="text-[10px] font-medium">Tomorrow</div>
                  <div className="text-[9px] text-muted-foreground">8:00 AM</div>
                </button>
                <button
                  type="button"
                  onClick={() => handlePick(tomorrow1)}
                  disabled={scheduling}
                  className="rounded-md border border-border bg-background hover:bg-secondary/50 px-2 py-1.5 text-left"
                >
                  <div className="text-[10px] font-medium">Tomorrow</div>
                  <div className="text-[9px] text-muted-foreground">1:00 PM</div>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <div className="text-[9px] text-muted-foreground truncate">
                {tz && <>Times shown in <span className="font-medium">{tz}</span></>}
              </div>
              <Button
                variant="ghost" size="sm" className="h-7 text-[11px] gap-1"
                onClick={() => setShowCustom(true)}
              >
                <CalendarIcon className="h-3 w-3" />
                Pick custom…
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Custom date & time
            </div>
            <Calendar
              mode="single"
              selected={pickedDate}
              onSelect={setPickedDate}
              initialFocus
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              className="p-0 pointer-events-auto"
            />
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Time</Label>
              <Input
                type="time"
                value={pickedTime}
                onChange={(e) => setPickedTime(e.target.value)}
                className="h-8 text-xs w-32"
              />
              {tz && <span className="text-[9px] text-muted-foreground">{tz}</span>}
            </div>
            <div className="flex justify-between gap-1.5 pt-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCustom(false)}>
                Back
              </Button>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm" className="h-7 text-xs"
                  onClick={handleCustomConfirm}
                  disabled={!pickedDate || scheduling}
                >
                  {scheduling ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Scheduling…</>
                  ) : (
                    <><Clock className="h-3 w-3 mr-1" />Schedule</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
