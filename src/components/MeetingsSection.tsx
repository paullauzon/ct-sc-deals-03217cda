import { useState } from "react";
import { Lead, Meeting, MeetingIntelligence } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

function generateMeetingId(): string {
  return `mtg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

function formatMeetingDate(dateStr: string): string {
  if (!dateStr) return "Unknown date";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export function MeetingsSection({ lead }: { lead: Lead }) {
  const { updateLead } = useLeads();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searching, setSearching] = useState(false);

  const meetings = lead.meetings || [];

  const handleAutoFind = async () => {
    setSearching(true);
    try {
      const genericDomains = new Set([
        "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
        "icloud.com", "mail.com", "protonmail.com", "live.com", "msn.com",
      ]);
      const searchDomains: string[] = [];
      if (lead.email) {
        const domain = lead.email.split("@")[1]?.toLowerCase();
        if (domain && !genericDomains.has(domain)) searchDomains.push(domain);
      }
      if (searchDomains.length === 0 && lead.companyUrl) {
        try {
          const urlDomain = new URL(lead.companyUrl.startsWith("http") ? lead.companyUrl : `https://${lead.companyUrl}`).hostname.replace(/^www\./, "").toLowerCase();
          if (urlDomain && !genericDomains.has(urlDomain)) searchDomains.push(urlDomain);
        } catch { /* skip */ }
      }

      const searchCompanies: string[] = [];
      if (lead.company?.trim()) searchCompanies.push(lead.company.trim());

      // Search BOTH Fireflies accounts in parallel to find meetings regardless of which account recorded them
      const searchBody = {
        searchEmails: lead.email ? [lead.email] : [],
        searchNames: lead.name ? [lead.name] : [],
        searchDomains,
        searchCompanies,
        limit: 100,
        summarize: false,
      };

      const [ctResult, scResult] = await Promise.all([
        supabase.functions.invoke("fetch-fireflies", { body: { ...searchBody, brand: "Captarget" } }),
        supabase.functions.invoke("fetch-fireflies", { body: { ...searchBody, brand: "SourceCo" } }),
      ]);

      if (ctResult.error && scResult.error) throw ctResult.error;

      const ctMeetings = (ctResult.data?.meetings || []).map((m: any) => ({ ...m, sourceBrand: "Captarget" }));
      const scMeetings = (scResult.data?.meetings || []).map((m: any) => ({ ...m, sourceBrand: "SourceCo" }));

      // Merge and deduplicate by firefliesId
      const seenIds = new Set<string>();
      const foundMeetings: any[] = [];
      for (const m of [...ctMeetings, ...scMeetings]) {
        if (m.firefliesId && seenIds.has(m.firefliesId)) continue;
        if (m.firefliesId) seenIds.add(m.firefliesId);
        foundMeetings.push(m);
      }
      const existingIds = new Set(meetings.map((m) => m.firefliesId).filter(Boolean));
      const newMeetings = foundMeetings.filter((m: any) => !existingIds.has(m.firefliesId));

      if (newMeetings.length === 0) {
        toast.info("No new meetings found in Fireflies for this lead.");
        return;
      }

      const addedMeetings: Meeting[] = [];
      for (const m of newMeetings) {
        const transcript = m.transcript || "";
        const allMeetings = [...meetings, ...addedMeetings].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        let summary = m.summary || "";
        let nextSteps = m.nextSteps || "";
        let intelligence: MeetingIntelligence | undefined;

        if (transcript.length > 20) {
          try {
            const { data: aiData, error: aiError } = await supabase.functions.invoke("process-meeting", {
              body: { transcript, priorMeetings: allMeetings },
            });
            if (!aiError && aiData) {
              summary = aiData.summary || summary;
              nextSteps = aiData.nextSteps || nextSteps;
              intelligence = aiData.intelligence || undefined;
            }
          } catch { /* fallback */ }
        }

        addedMeetings.push({
          id: generateMeetingId(),
          date: m.date || new Date().toISOString().split("T")[0],
          title: m.title || "Untitled Meeting",
          firefliesId: m.firefliesId,
          firefliesUrl: m.transcriptUrl || "",
          transcript,
          summary,
          nextSteps,
          addedAt: new Date().toISOString(),
          intelligence,
          sourceBrand: m.sourceBrand || undefined,
        });
      }

      const updatedMeetings = [...meetings, ...addedMeetings];
      // Auto-update lastContactDate to the latest meeting date
      const allDates = updatedMeetings.map(m => m.date).filter(Boolean).sort();
      const latestDate = allDates[allDates.length - 1] || "";
      const updates: Partial<Lead> = { meetings: updatedMeetings };
      if (latestDate && (!lead.lastContactDate || latestDate > lead.lastContactDate)) {
        updates.lastContactDate = latestDate;
      }
      // Auto-suggest nextFollowUp from meeting next steps with deadlines
      const allNextSteps = addedMeetings
        .flatMap(m => m.intelligence?.nextSteps || [])
        .filter(ns => ns.deadline)
        .map(ns => ns.deadline)
        .filter(Boolean)
        .sort();
      if (allNextSteps.length > 0 && (!lead.nextFollowUp || allNextSteps[0] < lead.nextFollowUp)) {
        updates.nextFollowUp = allNextSteps[0];
      }
      updateLead(lead.id, updates);
      toast.success(`Found and processed ${addedMeetings.length} new meeting${addedMeetings.length !== 1 ? "s" : ""} from Fireflies`);
    } catch (e: any) {
      console.error("Auto-find error:", e);
      toast.error(e.message || "Failed to search Fireflies");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Meetings ({meetings.length})
        </h3>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={handleAutoFind} disabled={searching} className="text-xs h-7">
            {searching ? "Searching..." : (
              <><img src="/fireflies-icon.svg" alt="" className="w-3.5 h-3.5 mr-1" />Auto-find</>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAddDialog(true)} className="text-xs h-7">
            + Add Meeting
          </Button>
        </div>
      </div>

      {meetings.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 text-center py-4">
          No meetings yet. Add a transcript or auto-find from Fireflies.
        </p>
      ) : (
        <div className="space-y-2">
          {[...meetings]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                onRemove={() => {
                  const updated = meetings.filter((m) => m.id !== meeting.id);
                  updateLead(lead.id, { meetings: updated });
                  toast.success("Meeting removed");
                }}
              />
            ))}
        </div>
      )}

      <AddMeetingDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        lead={lead}
        existingMeetings={meetings}
        onAdd={(meeting) => {
          updateLead(lead.id, { meetings: [...meetings, meeting] });
        }}
      />
    </div>
  );
}

// ─── Sentiment / Intent badge colors ───

const intentColors: Record<string, string> = {
  "Strong": "bg-green-500/15 text-green-700 border-green-500/30",
  "Moderate": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Low": "bg-orange-500/15 text-orange-700 border-orange-500/30",
  "None detected": "bg-muted text-muted-foreground border-border",
};

const sentimentColors: Record<string, string> = {
  "Very Positive": "bg-green-500/15 text-green-700 border-green-500/30",
  "Positive": "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  "Neutral": "bg-muted text-muted-foreground border-border",
  "Cautious": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Negative": "bg-red-500/15 text-red-700 border-red-500/30",
};

const engagementColors: Record<string, string> = {
  "Highly Engaged": "bg-green-500/15 text-green-700 border-green-500/30",
  "Engaged": "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  "Passive": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Disengaged": "bg-red-500/15 text-red-700 border-red-500/30",
};

const followUpStatusColors: Record<string, string> = {
  "Addressed": "bg-green-500/15 text-green-700 border-green-500/30",
  "Outstanding": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Dropped": "bg-red-500/15 text-red-700 border-red-500/30",
};

// ─── Intelligence Display ───

function IntelligenceDisplay({ intel }: { intel: MeetingIntelligence }) {
  return (
    <Tabs defaultValue="summary" className="w-full">
      <TabsList className="w-full justify-start flex-wrap h-auto gap-0.5 p-1">
        <TabsTrigger value="summary" className="text-xs h-7">Summary</TabsTrigger>
        <TabsTrigger value="actions" className="text-xs h-7">Actions</TabsTrigger>
        <TabsTrigger value="signals" className="text-xs h-7">Deal Signals</TabsTrigger>
        <TabsTrigger value="insights" className="text-xs h-7">Insights</TabsTrigger>
        {intel.priorFollowUps?.length > 0 && (
          <TabsTrigger value="followups" className="text-xs h-7">Follow-ups</TabsTrigger>
        )}
      </TabsList>

      {/* Summary Tab */}
      <TabsContent value="summary" className="space-y-3">
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge className={`text-[10px] ${engagementColors[intel.engagementLevel] || ""}`}>
            {intel.engagementLevel}
          </Badge>
          {intel.dealSignals?.sentiment && (
            <Badge className={`text-[10px] ${sentimentColors[intel.dealSignals.sentiment] || ""}`}>
              {intel.dealSignals.sentiment}
            </Badge>
          )}
          {intel.dealSignals?.buyingIntent && (
            <Badge className={`text-[10px] ${intentColors[intel.dealSignals.buyingIntent] || ""}`}>
              Intent: {intel.dealSignals.buyingIntent}
            </Badge>
          )}
        </div>

        <div className="text-sm leading-relaxed p-3 bg-secondary/30 rounded-md whitespace-pre-line">
          {intel.summary}
        </div>

        {intel.attendees?.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Attendees</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {intel.attendees.map((a, i) => (
                <span key={i} className="text-xs bg-secondary/50 rounded-full px-2 py-0.5">
                  {a.name}{a.role ? ` · ${a.role}` : ""}{a.company ? ` @ ${a.company}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {intel.keyTopics?.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Key Topics</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {intel.keyTopics.map((t, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {intel.relationshipProgression && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Relationship</label>
            <p className="text-xs text-muted-foreground mt-1">{intel.relationshipProgression}</p>
          </div>
        )}
      </TabsContent>

      {/* Actions Tab */}
      <TabsContent value="actions" className="space-y-3">
        {intel.nextSteps?.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Next Steps</label>
            <div className="mt-1 space-y-1">
              {intel.nextSteps.map((ns, i) => (
                <div key={i} className="text-xs flex items-start gap-2 p-2 bg-secondary/20 rounded">
                  <span className="text-primary mt-0.5">→</span>
                  <div className="flex-1">
                    <span>{ns.action}</span>
                    <div className="flex gap-2 mt-0.5 text-muted-foreground">
                      {ns.owner && <span>👤 {ns.owner}</span>}
                      {ns.deadline && <span>📅 {ns.deadline}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {intel.actionItems?.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Action Items</label>
            <div className="mt-1 space-y-1">
              {intel.actionItems.map((ai, i) => (
                <div key={i} className="text-xs flex items-start gap-2 p-2 bg-secondary/20 rounded">
                  <span className="text-muted-foreground">☐</span>
                  <div className="flex-1">
                    <span>{ai.item}</span>
                    <div className="flex gap-2 mt-0.5 text-muted-foreground">
                      {ai.owner && <span>👤 {ai.owner}</span>}
                      {ai.deadline && <span>📅 {ai.deadline}</span>}
                      <Badge variant="outline" className="text-[9px] h-4">{ai.status}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {intel.decisions?.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Decisions Made</label>
            <ul className="mt-1 space-y-0.5">
              {intel.decisions.map((d, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="text-green-600">✓</span> {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {intel.talkingPoints?.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Talking Points for Follow-up</label>
            <ul className="mt-1 space-y-0.5">
              {intel.talkingPoints.map((tp, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {tp}</li>
              ))}
            </ul>
          </div>
        )}
      </TabsContent>

      {/* Deal Signals Tab */}
      <TabsContent value="signals" className="space-y-3">
        {intel.dealSignals && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <SignalCard label="Buying Intent" value={intel.dealSignals.buyingIntent} colorMap={intentColors} />
              <SignalCard label="Sentiment" value={intel.dealSignals.sentiment} colorMap={sentimentColors} />
              <div className="p-2 bg-secondary/20 rounded">
                <label className="text-[10px] text-muted-foreground uppercase">Timeline</label>
                <p className="text-xs font-medium mt-0.5">{intel.dealSignals.timeline || "Not discussed"}</p>
              </div>
              <div className="p-2 bg-secondary/20 rounded">
                <label className="text-[10px] text-muted-foreground uppercase">Budget</label>
                <p className="text-xs font-medium mt-0.5">{intel.dealSignals.budgetMentioned || "Not discussed"}</p>
              </div>
            </div>

            {intel.dealSignals.decisionProcess && (
              <div className="p-2 bg-secondary/20 rounded">
                <label className="text-[10px] text-muted-foreground uppercase">Decision Process</label>
                <p className="text-xs mt-0.5">{intel.dealSignals.decisionProcess}</p>
              </div>
            )}

            <TagList label="Champions" items={intel.dealSignals.champions} emoji="⭐" />
            <TagList label="Competitors" items={intel.dealSignals.competitors} emoji="⚔️" />
            <TagList label="Objections" items={intel.dealSignals.objections} emoji="⚠️" variant="destructive" />
            <TagList label="Risk Factors" items={intel.dealSignals.riskFactors} emoji="🚩" variant="destructive" />
            <TagList label="Urgency Drivers" items={intel.dealSignals.urgencyDrivers} emoji="⏰" />

            {intel.competitiveIntel && intel.competitiveIntel !== "Not discussed" && (
              <div className="p-2 bg-secondary/20 rounded">
                <label className="text-[10px] text-muted-foreground uppercase">Competitive Intel</label>
                <p className="text-xs mt-0.5">{intel.competitiveIntel}</p>
              </div>
            )}

            {intel.pricingDiscussion && intel.pricingDiscussion !== "Not discussed" && (
              <div className="p-2 bg-secondary/20 rounded">
                <label className="text-[10px] text-muted-foreground uppercase">Pricing Discussion</label>
                <p className="text-xs mt-0.5">{intel.pricingDiscussion}</p>
              </div>
            )}
          </>
        )}
      </TabsContent>

      {/* Insights Tab */}
      <TabsContent value="insights" className="space-y-3">
        {intel.painPoints?.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pain Points</label>
            <ul className="mt-1 space-y-0.5">
              {intel.painPoints.map((p, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="text-orange-500">●</span> {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {intel.valueProposition && (
          <div className="p-2 bg-primary/5 border border-primary/20 rounded">
            <label className="text-[10px] text-primary uppercase font-medium">What Resonated</label>
            <p className="text-xs mt-0.5">{intel.valueProposition}</p>
          </div>
        )}

        {intel.questionsAsked?.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Questions Asked</label>
            <ul className="mt-1 space-y-0.5">
              {intel.questionsAsked.map((q, i) => (
                <li key={i} className="text-xs text-muted-foreground">❓ {q}</li>
              ))}
            </ul>
          </div>
        )}
      </TabsContent>

      {/* Follow-ups Tab */}
      {intel.priorFollowUps?.length > 0 && (
        <TabsContent value="followups" className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Prior Follow-up Status</label>
          <div className="space-y-1">
            {intel.priorFollowUps.map((fu, i) => (
              <div key={i} className="text-xs flex items-start gap-2 p-2 bg-secondary/20 rounded">
                <Badge className={`text-[9px] h-4 shrink-0 ${followUpStatusColors[fu.status] || ""}`}>
                  {fu.status}
                </Badge>
                <span>{fu.item}</span>
              </div>
            ))}
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}

function SignalCard({ label, value, colorMap }: { label: string; value: string; colorMap: Record<string, string> }) {
  return (
    <div className="p-2 bg-secondary/20 rounded">
      <label className="text-[10px] text-muted-foreground uppercase">{label}</label>
      <Badge className={`mt-1 text-[10px] ${colorMap[value] || "bg-muted text-muted-foreground"}`}>
        {value}
      </Badge>
    </div>
  );
}

function TagList({ label, items, emoji, variant }: { label: string; items?: string[]; emoji: string; variant?: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase">{label}</label>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {items.map((item, i) => (
          <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${variant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-secondary/50 text-secondary-foreground"}`}>
            {emoji} {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Meeting Card ───

function MeetingCard({ meeting, onRemove }: { meeting: Meeting; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const intel = meeting.intelligence;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left border border-border rounded-lg p-3 hover:bg-secondary/20 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs shrink-0">{open ? "▾" : "▸"}</span>
              {meeting.sourceBrand && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground shrink-0">
                  {meeting.sourceBrand === "Captarget" ? "CT" : "SC"}
                </span>
              )}
              <span className="text-sm font-medium truncate">{meeting.title}</span>
              {/* Quick signal badges in collapsed view */}
              {!open && intel && (
                <div className="hidden sm:flex gap-1">
                  {intel.dealSignals?.buyingIntent && (
                    <Badge className={`text-[9px] h-4 ${intentColors[intel.dealSignals.buyingIntent] || ""}`}>
                      {intel.dealSignals.buyingIntent}
                    </Badge>
                  )}
                  {intel.engagementLevel && (
                    <Badge className={`text-[9px] h-4 ${engagementColors[intel.engagementLevel] || ""}`}>
                      {intel.engagementLevel}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">{formatMeetingDate(meeting.date)}</span>
              {meeting.firefliesUrl && (
                <a href={meeting.firefliesUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline" onClick={(e) => e.stopPropagation()}>🔗</a>
              )}
              {confirmingDelete ? (
                <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { onRemove(); setConfirmingDelete(false); }} className="text-xs text-destructive font-medium hover:underline">Yes</button>
                  <button onClick={() => setConfirmingDelete(false)} className="text-xs text-muted-foreground hover:underline">No</button>
                </span>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }} className="text-xs text-muted-foreground hover:text-destructive transition-colors" title="Remove meeting">✕</button>
              )}
            </div>
          </div>
          {!open && meeting.summary && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 pl-5">{intel?.summary || meeting.summary}</p>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border border-t-0 border-border rounded-b-lg p-3 space-y-3 -mt-1">
          {intel ? (
            <IntelligenceDisplay intel={intel} />
          ) : (
            <>
              {meeting.summary && (
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Summary</label>
                  <div className="mt-1 text-sm leading-relaxed p-4 bg-secondary/30 rounded-md whitespace-pre-line min-h-[80px]">
                    {meeting.summary}
                  </div>
                </div>
              )}
              {meeting.nextSteps && (
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Next Steps</label>
                  <div className="mt-1 text-sm leading-relaxed p-3 bg-secondary/30 rounded-md whitespace-pre-line">
                    {meeting.nextSteps}
                  </div>
                </div>
              )}
            </>
          )}
          {meeting.transcript && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="text-xs text-primary hover:underline">Show full transcript</button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="max-h-60 mt-2">
                  <pre className="text-xs leading-relaxed p-3 bg-secondary/20 rounded-md whitespace-pre-wrap font-sans">
                    {meeting.transcript}
                  </pre>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Add Meeting Dialog ───

function AddMeetingDialog({
  open,
  onOpenChange,
  lead,
  existingMeetings,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  existingMeetings: Meeting[];
  onAdd: (meeting: Meeting) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [transcript, setTranscript] = useState("");
  const [firefliesUrl, setFirefliesUrl] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleSave = async () => {
    if (!transcript.trim() && !firefliesUrl.trim()) {
      toast.error("Please paste a transcript or Fireflies URL");
      return;
    }

    setProcessing(true);
    let summary = "";
    let nextSteps = "";
    let intelligence: MeetingIntelligence | undefined;

    if (transcript.trim().length > 20) {
      try {
        const priorMeetings = [...existingMeetings].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        const { data, error } = await supabase.functions.invoke("process-meeting", {
          body: { transcript: transcript.trim(), priorMeetings },
        });
        if (error) throw error;
        summary = data.summary || "";
        nextSteps = data.nextSteps || "";
        intelligence = data.intelligence || undefined;
      } catch (e: any) {
        console.error("AI processing error:", e);
        toast.error("AI processing failed, saving without summary");
      }
    }

    const meeting: Meeting = {
      id: generateMeetingId(),
      date,
      title: title || `Meeting ${existingMeetings.length + 1}`,
      firefliesUrl,
      transcript: transcript.trim(),
      summary,
      nextSteps,
      addedAt: new Date().toISOString(),
      intelligence,
    };

    onAdd(meeting);
    toast.success("Meeting added and processed");
    setTitle("");
    setDate(new Date().toISOString().split("T")[0]);
    setTranscript("");
    setFirefliesUrl("");
    setProcessing(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Meeting for {lead.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Intro Call" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <img src="/fireflies-icon.svg" alt="" className="w-3.5 h-3.5" /> Fireflies URL (optional)
            </label>
            <Input value={firefliesUrl} onChange={(e) => setFirefliesUrl(e.target.value)} placeholder="https://app.fireflies.ai/view/..." className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Transcript</label>
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the meeting transcript here..." rows={8} className="mt-1" />
          </div>
          {transcript.trim().length > 20 && (
            <p className="text-xs text-muted-foreground">
              ✨ AI will extract full intelligence: summary, action items, deal signals, sentiment & more
              {existingMeetings.length > 0 && ` — informed by ${existingMeetings.length} prior meeting${existingMeetings.length !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={processing || (!transcript.trim() && !firefliesUrl.trim())}>
            {processing ? "Extracting intelligence..." : "Save & Process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
