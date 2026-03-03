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
  // Fireflies meeting recording
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
