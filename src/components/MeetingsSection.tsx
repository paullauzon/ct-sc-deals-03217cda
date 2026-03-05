import { useState } from "react";
import { Lead, Meeting, MeetingIntelligence, DealIntelligence, MeetingPrepBrief } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { useProcessing } from "@/contexts/ProcessingContext";
import { supabase } from "@/integrations/supabase/client";
import { processSuggestedUpdates as processSuggUpdates } from "@/lib/bulkProcessing";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, Mail, Copy, Check, CheckCircle, X, Loader2, User, Calendar } from "lucide-react";

// ─── Suggested Lead Update Types ───

interface SuggestedUpdate {
  value: string | number;
  confidence: "Certain" | "Likely" | "Possible";
  evidence: string;
}

interface SuggestedLeadUpdates {
  stage?: SuggestedUpdate;
  meetingOutcome?: SuggestedUpdate;
  meetingDate?: SuggestedUpdate;
  nextFollowUp?: SuggestedUpdate;
  priority?: SuggestedUpdate;
  forecastCategory?: SuggestedUpdate;
  icpFit?: SuggestedUpdate;
  serviceInterest?: SuggestedUpdate;
  dealValue?: SuggestedUpdate;
  assignedTo?: SuggestedUpdate;
}

const FIELD_LABELS: Record<string, string> = {
  stage: "Pipeline Stage",
  meetingOutcome: "Meeting Outcome",
  meetingDate: "Meeting Date",
  nextFollowUp: "Next Follow-Up",
  priority: "Priority",
  forecastCategory: "Forecast Category",
  icpFit: "ICP Fit",
  serviceInterest: "Service Interest",
  dealValue: "Deal Value",
  assignedTo: "Assigned To",
};

/** Apply "Certain" updates automatically, return "Likely" ones for review */
function processSuggestedUpdates(
  suggestions: SuggestedLeadUpdates | null,
  leadId: string,
  updateLead: (id: string, updates: Partial<Lead>) => void
): { applied: string[]; pending: Array<{ field: string; label: string; value: string | number; evidence: string }> } {
  if (!suggestions) return { applied: [], pending: [] };

  const certainUpdates: Partial<Lead> = {};
  const applied: string[] = [];
  const pending: Array<{ field: string; label: string; value: string | number; evidence: string }> = [];

  const today = new Date().toISOString().split("T")[0];

  for (const [field, suggestion] of Object.entries(suggestions)) {
    if (!suggestion || !suggestion.value) continue;

    // Reject past dates for date fields
    if ((field === "nextFollowUp" || field === "meetingDate") && typeof suggestion.value === "string" && suggestion.value < today && field === "nextFollowUp") {
      console.warn(`Skipping past nextFollowUp date: ${suggestion.value}`);
      continue;
    }

    if (suggestion.confidence === "Certain") {
      (certainUpdates as any)[field] = suggestion.value;
      applied.push(`${FIELD_LABELS[field] || field}: ${suggestion.value}`);
    } else if (suggestion.confidence === "Likely") {
      pending.push({
        field,
        label: FIELD_LABELS[field] || field,
        value: suggestion.value,
        evidence: suggestion.evidence,
      });
    }
    // "Possible" is intentionally ignored
  }

  if (Object.keys(certainUpdates).length > 0) {
    updateLead(leadId, certainUpdates);
  }

  return { applied, pending };
}

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
  const { startAutoFind, leadJobs } = useProcessing();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPrepDialog, setShowPrepDialog] = useState(false);
  const [prepBrief, setPrepBrief] = useState<MeetingPrepBrief | null>(null);
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpEmail, setFollowUpEmail] = useState("");
  const [followUpMeetingId, setFollowUpMeetingId] = useState<string | null>(null);
  const [generatingFollowUp, setGeneratingFollowUp] = useState(false);

  const searching = leadJobs[lead.id]?.searching ?? false;

  const meetings = lead.meetings || [];

  const handleAutoFind = () => {
    startAutoFind(lead);
  };

  const synthesizeDealIntelligence = async (allMeetings: Meeting[], currentLead: Lead) => {
    try {
      toast.info("Synthesizing deal intelligence across all meetings...");
      const { synthesizeDealIntelligence } = await import("@/lib/bulkProcessing");
      const dealIntel = await synthesizeDealIntelligence(allMeetings, currentLead);
      if (dealIntel) {
        updateLead(currentLead.id, { dealIntelligence: dealIntel });
        toast.success("Deal intelligence synthesized from all meetings");
      }
    } catch (e: any) {
      console.error("Deal intelligence synthesis error:", e);
      toast.error("Failed to synthesize deal intelligence");
    }
  };

  const handleGeneratePrep = async () => {
    setGeneratingPrep(true);
    setPrepBrief(null);
    setShowPrepDialog(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-meeting-prep", {
        body: {
          meetings: meetings,
          leadFields: {
            name: lead.name,
            company: lead.company,
            role: lead.role,
            stage: lead.stage,
            priority: lead.priority,
            dealValue: lead.dealValue,
            serviceInterest: lead.serviceInterest,
            brand: lead.brand,
          },
          dealIntelligence: lead.dealIntelligence || null,
        },
      });
      if (error) throw error;
      if (data?.brief) {
        setPrepBrief(data.brief);
      } else {
        throw new Error("No brief generated");
      }
    } catch (e: any) {
      console.error("Prep brief error:", e);
      toast.error(e.message || "Failed to generate prep brief");
      setShowPrepDialog(false);
    } finally {
      setGeneratingPrep(false);
    }
  };

  const handleDraftFollowUp = async (meeting: Meeting) => {
    setGeneratingFollowUp(true);
    setFollowUpEmail("");
    setFollowUpMeetingId(meeting.id);
    setShowFollowUpDialog(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-followup", {
        body: {
          meeting,
          leadFields: {
            name: lead.name,
            company: lead.company,
            role: lead.role,
            brand: lead.brand,
          },
          dealIntelligence: lead.dealIntelligence || null,
        },
      });
      if (error) throw error;
      if (data?.email) {
        setFollowUpEmail(data.email);
      } else {
        throw new Error("No email generated");
      }
    } catch (e: any) {
      console.error("Follow-up draft error:", e);
      toast.error(e.message || "Failed to draft follow-up");
      setShowFollowUpDialog(false);
    } finally {
      setGeneratingFollowUp(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Meetings ({meetings.length})
        </h3>
        <div className="flex gap-1.5">
          {meetings.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleGeneratePrep} disabled={generatingPrep} className="text-xs h-7 gap-1">
              <FileText className="h-3 w-3" />
              {generatingPrep ? "Generating..." : "Prep Brief"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleAutoFind} disabled={searching} className="text-xs h-7">
            {searching ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Searching...</>
            ) : (
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
                  // Recalculate lastContactDate from remaining meetings
                  const latestDate = updated.length > 0
                    ? updated.reduce((latest, m) => m.date > latest ? m.date : latest, updated[0].date)
                    : "";
                  const meetingsWithIntel = updated.filter(m => m.intelligence);
                  // Clear or re-synthesize deal intelligence
                  if (meetingsWithIntel.length === 0) {
                    updateLead(lead.id, { meetings: updated, lastContactDate: latestDate, dealIntelligence: undefined });
                  } else {
                    updateLead(lead.id, { meetings: updated, lastContactDate: latestDate });
                    synthesizeDealIntelligence(updated, lead);
                  }
                  toast.success("Meeting removed");
                }}
                onDraftFollowUp={() => handleDraftFollowUp(meeting)}
                generatingFollowUp={generatingFollowUp && followUpMeetingId === meeting.id}
              />
            ))}
        </div>
      )}

      <AddMeetingDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        lead={lead}
        existingMeetings={meetings}
        onAdd={(meeting, suggestedUpdates) => {
          const updatedMeetings = [...meetings, meeting];
          const updates: Partial<typeof lead> = { meetings: updatedMeetings };
          if (meeting.date && (!lead.lastContactDate || meeting.date > lead.lastContactDate)) {
            updates.lastContactDate = meeting.date;
          }
          updateLead(lead.id, updates);
          if (meeting.intelligence) {
            const meetingsWithIntel = updatedMeetings.filter(m => m.intelligence);
            if (meetingsWithIntel.length > 0) {
              synthesizeDealIntelligence(updatedMeetings, lead);
            }
          }
          // For manual adds with suggested updates, apply certain ones directly
          if (suggestedUpdates) {
            const { applied } = processSuggUpdates(suggestedUpdates, lead.id, updateLead);
            if (applied.length > 0) {
              toast.success(`Auto-updated ${applied.length} field${applied.length !== 1 ? "s" : ""}`, {
                description: applied.join(" · "),
                duration: 6000,
              });
            }
          }
        }}
      />

      {/* Prep Brief Dialog */}
      <PrepBriefDialog open={showPrepDialog} onOpenChange={setShowPrepDialog} brief={prepBrief} loading={generatingPrep} leadName={lead.name} />

      {/* Follow-Up Email Dialog */}
      <FollowUpDialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog} email={followUpEmail} loading={generatingFollowUp} />
    </div>
  );
}

// ─── Coaching Badge Colors ───

const talkRatioColor = (ratio?: number): string => {
  if (ratio === undefined) return "";
  if (ratio <= 40) return "bg-green-500/15 text-green-700 border-green-500/30";
  if (ratio <= 60) return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
  return "bg-red-500/15 text-red-700 border-red-500/30";
};

const questionQualityColors: Record<string, string> = {
  "Strong": "bg-green-500/15 text-green-700 border-green-500/30",
  "Adequate": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Weak": "bg-red-500/15 text-red-700 border-red-500/30",
};

const objectionHandlingColors: Record<string, string> = {
  "Effective": "bg-green-500/15 text-green-700 border-green-500/30",
  "Partial": "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "Missed": "bg-red-500/15 text-red-700 border-red-500/30",
};

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
        {(intel.talkRatio !== undefined || intel.questionQuality || intel.objectionHandling) && (
          <TabsTrigger value="coaching" className="text-xs h-7">Coaching</TabsTrigger>
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
                      {ns.owner && <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" /> {ns.owner}</span>}
                      {ns.deadline && <span className="flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" /> {ns.deadline}</span>}
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
                      {ai.owner && <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" /> {ai.owner}</span>}
                      {ai.deadline && <span className="flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" /> {ai.deadline}</span>}
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

      {/* Coaching Tab */}
      {(intel.talkRatio !== undefined || intel.questionQuality || intel.objectionHandling) && (
        <TabsContent value="coaching" className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {intel.talkRatio !== undefined && (
              <div className="p-2.5 bg-secondary/20 rounded text-center space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase">Talk Ratio</label>
                <div className="text-lg font-bold">{intel.talkRatio}%</div>
                <Badge className={`text-[9px] ${talkRatioColor(intel.talkRatio)}`}>
                  {intel.talkRatio <= 40 ? "Great Listening" : intel.talkRatio <= 60 ? "Balanced" : "Too Much Talking"}
                </Badge>
              </div>
            )}
            {intel.questionQuality && (
              <div className="p-2.5 bg-secondary/20 rounded text-center space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase">Question Quality</label>
                <Badge className={`text-xs mt-1 ${questionQualityColors[intel.questionQuality] || ""}`}>
                  {intel.questionQuality}
                </Badge>
              </div>
            )}
            {intel.objectionHandling && (
              <div className="p-2.5 bg-secondary/20 rounded text-center space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase">Objection Handling</label>
                <Badge className={`text-xs mt-1 ${objectionHandlingColors[intel.objectionHandling] || ""}`}>
                  {intel.objectionHandling}
                </Badge>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            💡 Ideal: Talk ratio ≤40%, strong discovery questions, effective objection handling.
          </p>
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

function MeetingCard({ meeting, onRemove, onDraftFollowUp, generatingFollowUp }: { meeting: Meeting; onRemove: () => void; onDraftFollowUp: () => void; generatingFollowUp: boolean }) {
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
                  {/* Coaching badges in collapsed view */}
                  {intel.talkRatio !== undefined && (
                    <Badge className={`text-[9px] h-4 ${talkRatioColor(intel.talkRatio)}`}>
                      🎤 {intel.talkRatio}%
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
          {/* Draft Follow-Up button */}
          {(intel || meeting.summary) && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onDraftFollowUp} disabled={generatingFollowUp}>
                <Mail className="h-3 w-3" />
                {generatingFollowUp ? "Drafting..." : "Draft Follow-Up"}
              </Button>
            </div>
          )}

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

// ─── Prep Brief Dialog ───

function PrepBriefDialog({ open, onOpenChange, brief, loading, leadName }: { open: boolean; onOpenChange: (v: boolean) => void; brief: MeetingPrepBrief | null; loading: boolean; leadName: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Meeting Prep Brief — {leadName}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-12 space-y-2">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">Generating your battle-ready prep brief...</p>
          </div>
        ) : brief ? (
          <div className="space-y-5 text-sm">
            {/* Executive Summary */}
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <p className="leading-relaxed">{brief.executiveSummary}</p>
            </div>

            {/* Action Items We Owe */}
            {brief.openActionItemsWeOwe?.length > 0 && (
              <PrepSection title="⚡ Action Items WE Owe (Critical)" variant="destructive">
                {brief.openActionItemsWeOwe.map((a, i) => (
                  <div key={i} className="p-2 bg-secondary/20 rounded space-y-0.5">
                    <p className="font-medium text-xs">{a.item}</p>
                    {a.deadline && <p className="text-[10px] text-muted-foreground">📅 {a.deadline}</p>}
                    <p className="text-[10px] text-muted-foreground">{a.context}</p>
                  </div>
                ))}
              </PrepSection>
            )}

            {/* Action Items They Owe */}
            {brief.openActionItemsTheyOwe?.length > 0 && (
              <PrepSection title="📋 Action Items THEY Owe (Follow-up Leverage)">
                {brief.openActionItemsTheyOwe.map((a, i) => (
                  <div key={i} className="p-2 bg-secondary/20 rounded space-y-0.5">
                    <p className="font-medium text-xs">{a.item}</p>
                    <p className="text-[10px] text-muted-foreground">Approach: {a.followUpApproach}</p>
                  </div>
                ))}
              </PrepSection>
            )}

            {/* Unresolved Objections */}
            {brief.unresolvedObjections?.length > 0 && (
              <PrepSection title="⚠️ Unresolved Objections" variant="destructive">
                {brief.unresolvedObjections.map((o, i) => (
                  <div key={i} className="p-2 bg-secondary/20 rounded space-y-0.5">
                    <p className="font-medium text-xs">{o.objection}</p>
                    <p className="text-[10px] text-muted-foreground">Strategy: {o.recommendedApproach}</p>
                    <p className="text-[10px] text-muted-foreground">Evidence: {o.evidence}</p>
                  </div>
                ))}
              </PrepSection>
            )}

            {/* Stakeholder Briefing */}
            {brief.stakeholderBriefing?.length > 0 && (
              <PrepSection title="👥 Stakeholder Briefing">
                {brief.stakeholderBriefing.map((s, i) => (
                  <div key={i} className="p-2 bg-secondary/20 rounded space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground">{s.role}</span>
                      <Badge variant="outline" className="text-[9px] h-4">{s.stance}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Interests: {s.keyInterests}</p>
                    <p className="text-[10px] text-muted-foreground">Approach: {s.approachTips}</p>
                  </div>
                ))}
              </PrepSection>
            )}

            {/* Competitive Threats */}
            {brief.competitiveThreats?.length > 0 && (
              <PrepSection title="⚔️ Competitive Threats">
                {brief.competitiveThreats.map((c, i) => (
                  <div key={i} className="p-2 bg-secondary/20 rounded space-y-0.5">
                    <p className="font-medium text-xs">{c.competitor}</p>
                    <p className="text-[10px] text-muted-foreground">Threat: {c.threat}</p>
                    <p className="text-[10px] text-muted-foreground">Counter: {c.counterStrategy}</p>
                  </div>
                ))}
              </PrepSection>
            )}

            {/* Talking Points */}
            {brief.talkingPoints?.length > 0 && (
              <PrepSection title="💬 Talking Points">
                <ul className="space-y-0.5">
                  {brief.talkingPoints.map((tp, i) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <span className="text-primary shrink-0">{i + 1}.</span> {tp}
                    </li>
                  ))}
                </ul>
              </PrepSection>
            )}

            {/* Questions to Ask */}
            {brief.questionsToAsk?.length > 0 && (
              <PrepSection title="❓ Questions to Ask">
                <ul className="space-y-0.5">
                  {brief.questionsToAsk.map((q, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {q}</li>
                  ))}
                </ul>
              </PrepSection>
            )}

            {/* Risks & Desired Outcomes side by side */}
            <div className="grid grid-cols-2 gap-3">
              {brief.risksToWatch?.length > 0 && (
                <PrepSection title="🚩 Risks to Watch">
                  <ul className="space-y-0.5">
                    {brief.risksToWatch.map((r, i) => (
                      <li key={i} className="text-xs text-destructive/80">• {r}</li>
                    ))}
                  </ul>
                </PrepSection>
              )}
              {brief.desiredOutcomes?.length > 0 && (
                <PrepSection title="🎯 Desired Outcomes">
                  <ul className="space-y-0.5">
                    {brief.desiredOutcomes.map((o, i) => (
                      <li key={i} className="text-xs text-green-700">• {o}</li>
                    ))}
                  </ul>
                </PrepSection>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PrepSection({ title, children, variant }: { title: string; children: React.ReactNode; variant?: string }) {
  return (
    <div className="space-y-1.5">
      <h4 className={`text-xs font-medium uppercase tracking-wider ${variant === "destructive" ? "text-destructive" : "text-muted-foreground"}`}>{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ─── Follow-Up Email Dialog ───

function FollowUpDialog({ open, onOpenChange, email, loading }: { open: boolean; onOpenChange: (v: boolean) => void; email: string; loading: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Follow-Up Email Draft
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-12 space-y-2">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">Drafting your follow-up email...</p>
          </div>
        ) : email ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-secondary/20 p-4">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{email}</pre>
            </div>
            <Button onClick={handleCopy} variant="outline" size="sm" className="w-full gap-2">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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
  onAdd: (meeting: Meeting, suggestedUpdates?: SuggestedLeadUpdates) => void;
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
    let suggestedUpdates: SuggestedLeadUpdates | undefined;

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
        suggestedUpdates = data.suggestedLeadUpdates || undefined;
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

    onAdd(meeting, suggestedUpdates);
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
              ✨ AI will extract full intelligence + auto-update CRM fields from transcript
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

// ─── Suggested CRM Updates Dialog ───

function SuggestedUpdatesDialog({
  open,
  onOpenChange,
  suggestions,
  leadId,
  updateLead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suggestions: Array<{ field: string; label: string; value: string | number; evidence: string }>;
  leadId: string;
  updateLead: (id: string, updates: Partial<Lead>) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const remaining = suggestions.filter(s => !dismissed.has(s.field));

  const handleAccept = (field: string, value: string | number) => {
    updateLead(leadId, { [field]: value } as Partial<Lead>);
    setDismissed(prev => new Set([...prev, field]));
    toast.success(`Updated ${FIELD_LABELS[field] || field}`);
  };

  const handleDismiss = (field: string) => {
    setDismissed(prev => new Set([...prev, field]));
  };

  const handleAcceptAll = () => {
    const updates: Partial<Lead> = {};
    for (const s of remaining) {
      (updates as any)[s.field] = s.value;
    }
    updateLead(leadId, updates);
    toast.success(`Applied ${remaining.length} suggested updates`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            AI Suggested CRM Updates
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          These updates are <strong>likely</strong> based on transcript evidence but not 100% certain. Review and accept or dismiss each one.
        </p>
        {remaining.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">All suggestions reviewed ✓</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {remaining.map((s) => (
              <div key={s.field} className="border border-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</span>
                    <p className="text-sm font-medium">{String(s.value)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                      onClick={() => handleAccept(s.field, s.value)}
                      title="Accept"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDismiss(s.field)}
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  📝 {s.evidence}
                </p>
              </div>
            ))}
          </div>
        )}
        {remaining.length > 1 && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Dismiss All</Button>
            <Button size="sm" onClick={handleAcceptAll}>Accept All ({remaining.length})</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}