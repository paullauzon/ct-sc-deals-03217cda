export type LeadSource = "Contact Form" | "Free Targets Form";

export type LeadStage =
  | "New Lead"
  | "Contacted"
  | "Meeting Set"
  | "Meeting Held"
  | "Proposal Sent"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost"
  | "Went Dark";

export type ServiceInterest =
  | "Deal Origination"
  | "Managed Outreach"
  | "Pipeline Building"
  | "Add-on Sourcing"
  | "Custom Campaign"
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

export interface Lead {
  id: string;
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
  // Target-specific fields
  targetCriteria: string;
  targetRevenue: string;
  geography: string;
  currentSourcing: string;
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
