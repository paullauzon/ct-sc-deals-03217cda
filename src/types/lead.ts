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

export interface DealSignals {
  buyingIntent: "Strong" | "Moderate" | "Low" | "None detected";
  sentiment: "Very Positive" | "Positive" | "Neutral" | "Cautious" | "Negative";
  timeline: string;
  budgetMentioned: string;
  champions: string[];
  competitors: string[];
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
  intelligence?: MeetingIntelligence;
}

export type BillingFrequency = "Monthly" | "Quarterly" | "Annually" | "";

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
  // AI Enrichment
  enrichment?: LeadEnrichment;
  // Legacy fields (kept for migration)
  firefliesUrl: string;
  firefliesTranscript: string;
  firefliesSummary: string;
  firefliesNextSteps: string;
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
  // New holistic deal intelligence fields
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
