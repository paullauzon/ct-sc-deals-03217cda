export type CSStage = "Onboarding" | "Active" | "Renewal Due" | "Paused" | "Churned";

export const CS_STAGES: CSStage[] = ["Onboarding", "Active", "Renewal Due", "Paused", "Churned"];

export interface ClientAccount {
  id: string;
  lead_id: string;
  brand: string;
  contact_name: string;
  contact_email: string;
  company: string;
  company_url: string;
  owner: string;
  cs_stage: CSStage;
  onboarded_date: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_months: number | null;
  monthly_value: number;
  retainer_value: number;
  success_fee_pct: number;
  service_type: string;
  deal_amount: number;
  mandate_fields: Record<string, unknown>;
  pause_reason: string;
  pause_credit: number;
  resume_date: string | null;
  paused_at: string | null;
  churn_reason: string;
  churn_date: string | null;
  re_engage_date: string | null;
  renewal_flagged_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ClientAccountTask {
  id: string;
  account_id: string;
  task_type: string;
  title: string;
  description: string;
  due_date: string;
  status: string;
  sequence_order: number;
  completed_at: string | null;
  created_at: string;
}

export const CS_STAGE_DESCRIPTIONS: Record<CSStage, string> = {
  Onboarding: "Guide sent, kick-off scheduled, billing fields filled",
  Active: "Service running, monthly check-ins, renewal date tracked",
  "Renewal Due": "Auto-flagged 60 days before contract end",
  Paused: "Service paused, reason + credit logged",
  Churned: "Churn reason captured, off-boarded",
};
