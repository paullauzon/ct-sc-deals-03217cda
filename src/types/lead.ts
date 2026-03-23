export type Brand = "Captarget" | "SourceCo";

export type DealOwner = "Malik" | "Valeria" | "Tomos" | "";

export type LeadSource =
  | "CT Contact Form"
  | "CT Free Targets Form"
  | "SC Intro Call Form"
  | "SC Free Targets Form";

export type LeadStage =
  | "New Lead"
  | "Qualified"
  | "Contacted"
  | "Meeting Set"
  | "Meeting Held"
  | "Proposal Sent"
  | "Negotiation"
  | "Contract Sent"
  | "Closed Won"
  | "Closed Lost"
  | "Went Dark";

export type ServiceInterest =
  | "Off-Market Email Origination"
  | "Direct Calling"
  | "Banker/Broker Coverage"
  | "Full Platform (All 3)"
  | "SourceCo Retained Search"
  | "Other"
  | "TBD";

export type CloseReason =
  | "Budget"
  | "Timing"
  | "Competitor"
  | "No Fit"
  | "No Response"
  | "Not Qualified"
  | "Champion Left"
  | "Other"
  | "";

export type MeetingOutcome =
  | "Scheduled"
  | "Held"
  | "No-Show"
  | "Rescheduled"
  | "Cancelled"
  | "";

export type ForecastCategory =
  | "Commit"
  | "Best Case"
  | "Pipeline"
  | "Omit"
  | "";

export type IcpFit = "Strong" | "Moderate" | "Weak" | "";

export type BillingFrequency = "Monthly" | "Quarterly" | "Annually" | "";

// ─── Meeting Intelligence Types ───

export interface MeetingAttendee {
  name: string;
  role: string;
  company: string;
}

export interface MeetingActionItem {
  item: string;
  owner: string;
  deadline: string;
  status: string;
}

export interface MeetingNextStep {
  action: string;
  owner: string;
  deadline: string;
}

export interface PriorFollowUp {
  item: string;
  status: "Addressed" | "Outstanding" | "Dropped";
}

export interface CompetitorDetail {
  name: string;
  context: string;
  prospectSentiment: string;
  strengthsMentioned: string[];
  weaknessesMentioned: string[];
}

export interface DealSignals {
  buyingIntent: "Strong" | "Moderate" | "Low" | "None detected";
  sentiment: "Very Positive" | "Positive" | "Neutral" | "Cautious" | "Negative";
  timeline: string;
  budgetMentioned: string;
  champions: string[];
  competitors: string[];
  competitorDetails?: CompetitorDetail[];
  currentSolution?: string;
  evaluationCriteria?: string[];
  switchingBarriers?: string[];
  competitorPricingIntel?: string;
  objections: string[];
  riskFactors: string[];
  decisionProcess: string;
  urgencyDrivers: string[];
}

export interface MeetingIntelligence {
  summary: string;
  attendees: MeetingAttendee[];
  keyTopics: string[];
  nextSteps: MeetingNextStep[];
  actionItems: MeetingActionItem[];
  decisions: string[];
  dealSignals: DealSignals;
  priorFollowUps: PriorFollowUp[];
  relationshipProgression: string;
  questionsAsked: string[];
  painPoints: string[];
  valueProposition: string;
  engagementLevel: "Highly Engaged" | "Engaged" | "Passive" | "Disengaged";
  talkingPoints: string[];
  competitiveIntel: string;
  pricingDiscussion: string;
  // Coaching metrics
  talkRatio?: number;
  questionQuality?: "Strong" | "Adequate" | "Weak";
  objectionHandling?: "Effective" | "Partial" | "Missed";
}

// ─── Meeting Prep Brief ───

export interface PrepBriefActionItem {
  item: string;
  deadline: string;
  context: string;
}

export interface PrepBriefTheyOwe {
  item: string;
  followUpApproach: string;
}

export interface PrepBriefObjection {
  objection: string;
  recommendedApproach: string;
  evidence: string;
}

export interface PrepBriefStakeholder {
  name: string;
  role: string;
  stance: string;
  keyInterests: string;
  approachTips: string;
}

export interface PrepBriefCompetitor {
  competitor: string;
  threat: string;
  counterStrategy: string;
}

export interface MeetingPrepBrief {
  executiveSummary: string;
  openActionItemsWeOwe: PrepBriefActionItem[];
  openActionItemsTheyOwe: PrepBriefTheyOwe[];
  unresolvedObjections: PrepBriefObjection[];
  stakeholderBriefing: PrepBriefStakeholder[];
  competitiveThreats: PrepBriefCompetitor[];
  talkingPoints: string[];
  questionsToAsk: string[];
  risksToWatch: string[];
  desiredOutcomes: string[];
}

export interface Meeting {
  id: string;
  date: string;
  title: string;
  firefliesId?: string;
  firefliesUrl: string;
  transcript: string;
  summary: string;
  nextSteps: string;
  addedAt: string;
  sourceBrand?: Brand;
  noRecording?: boolean;
  intelligence?: MeetingIntelligence;
}

// ─── Deal Intelligence (Accumulated Cross-Meeting Synthesis) ───

export interface StakeholderProfile {
  name: string;
  role: string;
  company: string;
  stance: "Champion" | "Supporter" | "Neutral" | "Skeptic" | "Blocker" | "Unknown";
  influence: "Decision Maker" | "High" | "Medium" | "Low" | "Unknown";
  concerns: string[];
  mentions: number;
  firstSeen: string;
  lastSeen: string;
  // Psychographic dimensions
  personalWin?: string;
  careerRisk?: string;
  communicationStyle?: "Analytical" | "Driver" | "Amiable" | "Expressive" | "";
  decisionTrigger?: string;
  hiddenConcern?: string;
}

export interface PowerDynamics {
  realInfluenceMap: string;
  internalPolitics: string;
  relationshipTensions: string;
  winningOrder: string[];
}

export interface PsychologicalProfile {
  realWhy: string;
  fearFactor: string;
  trustLevel: string;
  trustEvidence: string[];
  emotionalTriggers: string[];
  unspokenAsk: string;
  cognitivebiases: string[];
  recommendedApproach: string;
}

export interface WinStrategy {
  numberOneCloser: string;
  landmines: string[];
  powerMove: string;
  relationshipLeverage: string;
  dealTemperature: "On Fire" | "Warm" | "Lukewarm" | "Cold" | "Ice Cold";
  closingWindow: string;
  negotiationStyle: string;
}

export interface ObjectionRecord {
  objection: string;
  raisedIn: string;
  status: "Open" | "Addressed" | "Recurring";
  addressedIn: string;
  resolution: string;
}

export interface ActionItemRecord {
  item: string;
  owner: string;
  createdIn: string;
  status: "Open" | "Completed" | "Overdue" | "Dropped";
  resolvedIn: string;
  deadline: string;
}

export interface DealMilestone {
  date: string;
  event: string;
  significance: string;
}

export interface RiskRecord {
  risk: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  source: string;
  mitigationStatus: "Unmitigated" | "Partially Mitigated" | "Mitigated";
}

export interface CompetitiveEvent {
  date: string;
  event: string;
}

export interface MomentumSignals {
  meetingFrequencyDays: number;
  sentimentTrajectory: string[];
  intentTrajectory: string[];
  engagementTrajectory: string[];
  completionRate: number;
  momentum: "Accelerating" | "Steady" | "Stalling" | "Stalled";
}

export interface BuyingCommittee {
  decisionMaker: string;
  champion: string;
  influencers: string[];
  blockers: string[];
  unknowns: string[];
}

export interface DealIntelligence {
  dealNarrative: string;
  stakeholderMap: StakeholderProfile[];
  objectionTracker: ObjectionRecord[];
  actionItemTracker: ActionItemRecord[];
  momentumSignals: MomentumSignals;
  keyMilestones: DealMilestone[];
  riskRegister: RiskRecord[];
  competitiveTimeline: CompetitiveEvent[];
  buyingCommittee: BuyingCommittee;
  dealStageEvidence: string;
  synthesizedAt: string;
  // Deep psychological dimensions
  powerDynamics?: PowerDynamics;
  psychologicalProfile?: PsychologicalProfile;
  winStrategy?: WinStrategy;
}

// ─── AI Enrichment Types ───

export interface SuggestedFieldUpdate {
  value: string | number;
  reason: string;
}

export interface SuggestedUpdates {
  stage?: SuggestedFieldUpdate;
  priority?: SuggestedFieldUpdate;
  forecastCategory?: SuggestedFieldUpdate;
  icpFit?: SuggestedFieldUpdate;
  nextFollowUp?: SuggestedFieldUpdate;
  dealValue?: SuggestedFieldUpdate;
  serviceInterest?: SuggestedFieldUpdate;
  meetingOutcome?: SuggestedFieldUpdate;
}

export interface LeadEnrichment {
  companyDescription: string;
  acquisitionCriteria: string;
  buyerMotivation: string;
  urgency: string;
  decisionMakers: string;
  competitorTools: string;
  keyInsights: string;
  dataSources?: string;
  enrichedAt: string;
  // External Research fields (no overlap with Deal Intelligence)
  companyDossier?: string;
  prospectProfile?: string;
  preMeetingAmmo?: string;
  competitivePositioning?: string;
  // AI-suggested field updates
  suggestedUpdates?: SuggestedUpdates;
  // Legacy fields (kept for backward compatibility with existing enrichments)
  objectionsSummary?: string;
  dealRiskAssessment?: string;
  recommendedNextActions?: string;
  competitiveLandscape?: string;
  relationshipMap?: string;
  dealHealthScore?: string;
  engagementTrend?: string;
  likelihoodToClose?: string;
  sentimentAnalysis?: string;
}

// ─── Submission (historical form entry) ───

export interface Submission {
  brand: Brand;
  source: LeadSource;
  dateSubmitted: string;
  message: string;
  dealsPlanned: string;
  targetCriteria: string;
  targetRevenue: string;
  geography: string;
  currentSourcing: string;
  hearAboutUs: string;
  acquisitionStrategy: string;
  buyerType: string;
  role: string;
  phone: string;
  companyUrl: string;
}

// ─── Lead ───

export interface Lead {
  id: string;
  brand: Brand;
  name: string;
  email: string;
  phone: string;
  company: string;
  companyUrl: string;
  role: string;
  source: LeadSource;
  dateSubmitted: string;
  message: string;
  dealsPlanned: string;
  // Deal management fields
  stage: LeadStage;
  serviceInterest: ServiceInterest;
  dealValue: number;
  assignedTo: string;
  meetingDate: string;
  meetingSetDate: string;
  hoursToMeetingSet: number | null;
  daysInCurrentStage: number;
  stageEnteredDate: string;
  closeReason: CloseReason;
  closedDate: string;
  notes: string;
  lastContactDate: string;
  nextFollowUp: string;
  priority: "High" | "Medium" | "Low";
  // Extended fields
  meetingOutcome: MeetingOutcome;
  forecastCategory: ForecastCategory;
  icpFit: IcpFit;
  preScreenCompleted: boolean;
  wonReason: string;
  lostReason: string;
  // Revenue & Contract fields
  subscriptionValue: number;
  billingFrequency: BillingFrequency;
  contractStart: string;
  contractEnd: string;
  // Target-specific fields
  targetCriteria: string;
  targetRevenue: string;
  geography: string;
  currentSourcing: string;
  // Cross-brand & SourceCo fields
  isDuplicate: boolean;
  duplicateOf: string;
  hearAboutUs: string;
  acquisitionStrategy: string;
  buyerType: string;
  // Multi-meeting support
  meetings: Meeting[];
  // Submission history (all form entries from this person)
  submissions: Submission[];
  // AI Enrichment
  enrichment?: LeadEnrichment;
  // Accumulated Deal Intelligence
  dealIntelligence?: DealIntelligence;
  // Lead Scoring
  stage1Score: number | null;
  stage2Score: number | null;
  tier: number | null;
  tierOverride: boolean;
  enrichmentStatus: string;
  // LinkedIn
  linkedinUrl: string;
  linkedinTitle: string;
  // Legacy fields (kept for migration)
  firefliesUrl: string;
  firefliesTranscript: string;
  firefliesSummary: string;
  firefliesNextSteps: string;
}

export interface PipelineMetrics {
  totalLeads: number;
  totalPipelineValue: number;
  avgDealValue: number;
  meetingsSet: number;
  closedWon: number;
  closedLost: number;
  wentDark: number;
  conversionRate: number;
  avgDaysToMeeting: number;
  stageValues: Record<LeadStage, { count: number; value: number }>;
}
