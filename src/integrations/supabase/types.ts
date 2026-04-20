export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      business_cost_inputs: {
        Row: {
          ad_spend: number
          brand: string
          created_at: string
          id: string
          margin_pct: Json
          month: string
          sales_cost: number
          tool_cost: number
          updated_at: string
        }
        Insert: {
          ad_spend?: number
          brand: string
          created_at?: string
          id?: string
          margin_pct?: Json
          month: string
          sales_cost?: number
          tool_cost?: number
          updated_at?: string
        }
        Update: {
          ad_spend?: number
          brand?: string
          created_at?: string
          id?: string
          margin_pct?: Json
          month?: string
          sales_cost?: number
          tool_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      client_account_tasks: {
        Row: {
          account_id: string
          completed_at: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          sequence_order: number
          status: string
          task_type: string
          title: string
        }
        Insert: {
          account_id: string
          completed_at?: string | null
          created_at?: string
          description?: string
          due_date: string
          id?: string
          sequence_order?: number
          status?: string
          task_type: string
          title: string
        }
        Update: {
          account_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          sequence_order?: number
          status?: string
          task_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_account_tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accounts: {
        Row: {
          brand: string
          churn_date: string | null
          churn_reason: string
          company: string
          company_url: string
          contact_email: string
          contact_name: string
          contract_end: string | null
          contract_months: number | null
          contract_start: string | null
          created_at: string
          cs_stage: string
          deal_amount: number
          id: string
          lead_id: string
          mandate_fields: Json
          monthly_value: number
          notes: string
          onboarded_date: string | null
          owner: string
          pause_credit: number
          pause_reason: string
          paused_at: string | null
          re_engage_date: string | null
          renewal_flagged_at: string | null
          resume_date: string | null
          retainer_value: number
          service_type: string
          success_fee_pct: number
          updated_at: string
        }
        Insert: {
          brand?: string
          churn_date?: string | null
          churn_reason?: string
          company?: string
          company_url?: string
          contact_email?: string
          contact_name?: string
          contract_end?: string | null
          contract_months?: number | null
          contract_start?: string | null
          created_at?: string
          cs_stage?: string
          deal_amount?: number
          id?: string
          lead_id: string
          mandate_fields?: Json
          monthly_value?: number
          notes?: string
          onboarded_date?: string | null
          owner?: string
          pause_credit?: number
          pause_reason?: string
          paused_at?: string | null
          re_engage_date?: string | null
          renewal_flagged_at?: string | null
          resume_date?: string | null
          retainer_value?: number
          service_type?: string
          success_fee_pct?: number
          updated_at?: string
        }
        Update: {
          brand?: string
          churn_date?: string | null
          churn_reason?: string
          company?: string
          company_url?: string
          contact_email?: string
          contact_name?: string
          contract_end?: string | null
          contract_months?: number | null
          contract_start?: string | null
          created_at?: string
          cs_stage?: string
          deal_amount?: number
          id?: string
          lead_id?: string
          mandate_fields?: Json
          monthly_value?: number
          notes?: string
          onboarded_date?: string | null
          owner?: string
          pause_credit?: number
          pause_reason?: string
          paused_at?: string | null
          re_engage_date?: string | null
          renewal_flagged_at?: string | null
          resume_date?: string | null
          retainer_value?: number
          service_type?: string
          success_fee_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_sync_runs: {
        Row: {
          connection_id: string
          created_at: string
          email_address: string
          errors: Json
          fetched: number
          finished_at: string | null
          id: string
          inserted: number
          matched: number
          mode: string
          skipped: number
          started_at: string
          status: string
          unmatched: number
        }
        Insert: {
          connection_id: string
          created_at?: string
          email_address: string
          errors?: Json
          fetched?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          matched?: number
          mode?: string
          skipped?: number
          started_at?: string
          status?: string
          unmatched?: number
        }
        Update: {
          connection_id?: string
          created_at?: string
          email_address?: string
          errors?: Json
          fetched?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          matched?: number
          mode?: string
          skipped?: number
          started_at?: string
          status?: string
          unmatched?: number
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_template: string
          brand: string
          category: string
          created_at: string
          created_by: string
          id: string
          name: string
          subject_template: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          body_template?: string
          brand?: string
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          name: string
          subject_template?: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          body_template?: string
          brand?: string
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          subject_template?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      lead_activity_log: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          lead_id: string
          new_value: string | null
          old_value: string | null
          pinned_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          lead_id: string
          new_value?: string | null
          old_value?: string | null
          pinned_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          lead_id?: string
          new_value?: string | null
          old_value?: string | null
          pinned_at?: string | null
        }
        Relationships: []
      }
      lead_drafts: {
        Row: {
          action_key: string
          content: string
          context_label: string
          created_at: string
          draft_type: string
          id: string
          lead_id: string
          status: string
          updated_at: string
        }
        Insert: {
          action_key?: string
          content?: string
          context_label?: string
          created_at?: string
          draft_type?: string
          id?: string
          lead_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          content?: string
          context_label?: string
          created_at?: string
          draft_type?: string
          id?: string
          lead_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_email_metrics: {
        Row: {
          email_quarantined: boolean
          last_bounce_date: string | null
          last_clicked_date: string | null
          last_opened_date: string | null
          last_received_date: string | null
          last_replied_date: string | null
          last_sent_date: string | null
          lead_id: string
          total_bounces: number
          total_clicks: number
          total_opens: number
          total_received: number
          total_replies: number
          total_sent: number
          unsubscribed_all: boolean
          updated_at: string
        }
        Insert: {
          email_quarantined?: boolean
          last_bounce_date?: string | null
          last_clicked_date?: string | null
          last_opened_date?: string | null
          last_received_date?: string | null
          last_replied_date?: string | null
          last_sent_date?: string | null
          lead_id: string
          total_bounces?: number
          total_clicks?: number
          total_opens?: number
          total_received?: number
          total_replies?: number
          total_sent?: number
          unsubscribed_all?: boolean
          updated_at?: string
        }
        Update: {
          email_quarantined?: boolean
          last_bounce_date?: string | null
          last_clicked_date?: string | null
          last_opened_date?: string | null
          last_received_date?: string | null
          last_replied_date?: string | null
          last_sent_date?: string | null
          lead_id?: string
          total_bounces?: number
          total_clicks?: number
          total_opens?: number
          total_received?: number
          total_replies?: number
          total_sent?: number
          unsubscribed_all?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      lead_emails: {
        Row: {
          attachments: Json | null
          bcc_addresses: string[] | null
          body_html: string | null
          body_preview: string | null
          body_text: string | null
          bounce_reason: string | null
          cc_addresses: string[] | null
          clicks: Json | null
          created_at: string | null
          direction: string
          email_date: string
          from_address: string
          from_name: string | null
          id: string
          is_read: boolean | null
          lead_id: string
          logged: boolean | null
          message_id: string | null
          opens: Json | null
          provider_message_id: string | null
          raw_payload: Json | null
          replied_at: string | null
          scheduled_for: string | null
          send_status: string
          source: string | null
          subject: string | null
          thread_id: string | null
          to_addresses: string[] | null
          tracked: boolean | null
        }
        Insert: {
          attachments?: Json | null
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_preview?: string | null
          body_text?: string | null
          bounce_reason?: string | null
          cc_addresses?: string[] | null
          clicks?: Json | null
          created_at?: string | null
          direction?: string
          email_date?: string
          from_address: string
          from_name?: string | null
          id?: string
          is_read?: boolean | null
          lead_id: string
          logged?: boolean | null
          message_id?: string | null
          opens?: Json | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          replied_at?: string | null
          scheduled_for?: string | null
          send_status?: string
          source?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[] | null
          tracked?: boolean | null
        }
        Update: {
          attachments?: Json | null
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_preview?: string | null
          body_text?: string | null
          bounce_reason?: string | null
          cc_addresses?: string[] | null
          clicks?: Json | null
          created_at?: string | null
          direction?: string
          email_date?: string
          from_address?: string
          from_name?: string | null
          id?: string
          is_read?: boolean | null
          lead_id?: string
          logged?: boolean | null
          message_id?: string | null
          opens?: Json | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          replied_at?: string | null
          scheduled_for?: string | null
          send_status?: string
          source?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[] | null
          tracked?: boolean | null
        }
        Relationships: []
      }
      lead_stakeholders: {
        Row: {
          created_at: string
          email: string
          id: string
          last_contacted: string | null
          lead_id: string
          linkedin_url: string
          name: string
          notes: string
          role: string
          sentiment: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          last_contacted?: string | null
          lead_id: string
          linkedin_url?: string
          name?: string
          notes?: string
          role?: string
          sentiment?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_contacted?: string | null
          lead_id?: string
          linkedin_url?: string
          name?: string
          notes?: string
          role?: string
          sentiment?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_tasks: {
        Row: {
          ai_content: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          lead_id: string
          playbook: string
          sequence_order: number
          status: string
          task_type: string
          title: string
        }
        Insert: {
          ai_content?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          lead_id: string
          playbook: string
          sequence_order: number
          status?: string
          task_type: string
          title: string
        }
        Update: {
          ai_content?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          lead_id?: string
          playbook?: string
          sequence_order?: number
          status?: string
          task_type?: string
          title?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          acq_timeline: string
          acquisition_strategy: string
          active_searches: string
          archive_reason: string
          archived_at: string | null
          assigned_to: string
          authority_confirmed: string
          billing_frequency: string
          brand: string
          budget_confirmed: string
          buyer_type: string
          calendly_booked_at: string
          calendly_event_duration: number | null
          calendly_event_name: string
          calendly_event_type: string
          close_confidence: number | null
          close_reason: string
          closed_date: string
          company: string
          company_url: string
          competing_against: string
          competing_bankers: string
          contract_end: string
          contract_months: number | null
          contract_start: string
          created_at: string
          current_sourcing: string
          date_submitted: string
          days_in_current_stage: number
          deal_intelligence: Json | null
          deal_narrative: string
          deal_type: string
          deal_value: number
          deals_planned: string
          decision_blocker: string
          discovery_call_completed_at: string | null
          duplicate_of: string
          ebitda_max: string
          ebitda_min: string
          email: string
          enrichment: Json | null
          enrichment_status: string | null
          fireflies_next_steps: string
          fireflies_summary: string
          fireflies_transcript: string
          fireflies_url: string
          firm_aum: string
          forecast_category: string
          forecasted_close_date: string
          geography: string
          google_drive_link: string
          hear_about_us: string
          hours_to_meeting_set: number | null
          icp_fit: string
          id: string
          is_duplicate: boolean
          known_firm_domain_type: string | null
          known_firm_match: string | null
          last_acquisition_year: number | null
          last_contact_date: string
          lead_status: string
          linkedin_ma_experience: boolean | null
          linkedin_score: number | null
          linkedin_search_log: Json | null
          linkedin_title: string | null
          linkedin_url: string | null
          lost_reason: string
          lost_reason_v2: string
          meeting_date: string
          meeting_outcome: string
          meeting_set_date: string
          meetings: Json
          message: string
          name: string
          next_follow_up: string
          next_mutual_step: string
          next_mutual_step_date: string
          notes: string
          nurture_re_engage_date: string | null
          nurture_sequence_status: string | null
          nurture_started_at: string | null
          pe_backed: boolean | null
          pe_backed_stage2: boolean | null
          pe_sponsor_name: string | null
          phone: string
          portfolio_count: number | null
          pre_screen_completed: boolean
          priority: string
          proof_notes: string
          role: string
          sample_outcome: string
          sample_sent_date: string
          secondary_contacts: Json | null
          seniority_score: number | null
          service_interest: string
          source: string
          stage: string
          stage_entered_date: string
          stage_gate_overrides: Json
          stage1_score: number | null
          stage2_score: number | null
          stall_reason: string
          submissions: Json
          subscription_value: number
          target_criteria: string
          target_revenue: string
          tier: number | null
          tier_override: boolean | null
          transaction_type: string
          updated_at: string
          website_score: number | null
          website_url: string | null
          won_reason: string
        }
        Insert: {
          acq_timeline?: string
          acquisition_strategy?: string
          active_searches?: string
          archive_reason?: string
          archived_at?: string | null
          assigned_to?: string
          authority_confirmed?: string
          billing_frequency?: string
          brand?: string
          budget_confirmed?: string
          buyer_type?: string
          calendly_booked_at?: string
          calendly_event_duration?: number | null
          calendly_event_name?: string
          calendly_event_type?: string
          close_confidence?: number | null
          close_reason?: string
          closed_date?: string
          company?: string
          company_url?: string
          competing_against?: string
          competing_bankers?: string
          contract_end?: string
          contract_months?: number | null
          contract_start?: string
          created_at?: string
          current_sourcing?: string
          date_submitted?: string
          days_in_current_stage?: number
          deal_intelligence?: Json | null
          deal_narrative?: string
          deal_type?: string
          deal_value?: number
          deals_planned?: string
          decision_blocker?: string
          discovery_call_completed_at?: string | null
          duplicate_of?: string
          ebitda_max?: string
          ebitda_min?: string
          email?: string
          enrichment?: Json | null
          enrichment_status?: string | null
          fireflies_next_steps?: string
          fireflies_summary?: string
          fireflies_transcript?: string
          fireflies_url?: string
          firm_aum?: string
          forecast_category?: string
          forecasted_close_date?: string
          geography?: string
          google_drive_link?: string
          hear_about_us?: string
          hours_to_meeting_set?: number | null
          icp_fit?: string
          id: string
          is_duplicate?: boolean
          known_firm_domain_type?: string | null
          known_firm_match?: string | null
          last_acquisition_year?: number | null
          last_contact_date?: string
          lead_status?: string
          linkedin_ma_experience?: boolean | null
          linkedin_score?: number | null
          linkedin_search_log?: Json | null
          linkedin_title?: string | null
          linkedin_url?: string | null
          lost_reason?: string
          lost_reason_v2?: string
          meeting_date?: string
          meeting_outcome?: string
          meeting_set_date?: string
          meetings?: Json
          message?: string
          name?: string
          next_follow_up?: string
          next_mutual_step?: string
          next_mutual_step_date?: string
          notes?: string
          nurture_re_engage_date?: string | null
          nurture_sequence_status?: string | null
          nurture_started_at?: string | null
          pe_backed?: boolean | null
          pe_backed_stage2?: boolean | null
          pe_sponsor_name?: string | null
          phone?: string
          portfolio_count?: number | null
          pre_screen_completed?: boolean
          priority?: string
          proof_notes?: string
          role?: string
          sample_outcome?: string
          sample_sent_date?: string
          secondary_contacts?: Json | null
          seniority_score?: number | null
          service_interest?: string
          source?: string
          stage?: string
          stage_entered_date?: string
          stage_gate_overrides?: Json
          stage1_score?: number | null
          stage2_score?: number | null
          stall_reason?: string
          submissions?: Json
          subscription_value?: number
          target_criteria?: string
          target_revenue?: string
          tier?: number | null
          tier_override?: boolean | null
          transaction_type?: string
          updated_at?: string
          website_score?: number | null
          website_url?: string | null
          won_reason?: string
        }
        Update: {
          acq_timeline?: string
          acquisition_strategy?: string
          active_searches?: string
          archive_reason?: string
          archived_at?: string | null
          assigned_to?: string
          authority_confirmed?: string
          billing_frequency?: string
          brand?: string
          budget_confirmed?: string
          buyer_type?: string
          calendly_booked_at?: string
          calendly_event_duration?: number | null
          calendly_event_name?: string
          calendly_event_type?: string
          close_confidence?: number | null
          close_reason?: string
          closed_date?: string
          company?: string
          company_url?: string
          competing_against?: string
          competing_bankers?: string
          contract_end?: string
          contract_months?: number | null
          contract_start?: string
          created_at?: string
          current_sourcing?: string
          date_submitted?: string
          days_in_current_stage?: number
          deal_intelligence?: Json | null
          deal_narrative?: string
          deal_type?: string
          deal_value?: number
          deals_planned?: string
          decision_blocker?: string
          discovery_call_completed_at?: string | null
          duplicate_of?: string
          ebitda_max?: string
          ebitda_min?: string
          email?: string
          enrichment?: Json | null
          enrichment_status?: string | null
          fireflies_next_steps?: string
          fireflies_summary?: string
          fireflies_transcript?: string
          fireflies_url?: string
          firm_aum?: string
          forecast_category?: string
          forecasted_close_date?: string
          geography?: string
          google_drive_link?: string
          hear_about_us?: string
          hours_to_meeting_set?: number | null
          icp_fit?: string
          id?: string
          is_duplicate?: boolean
          known_firm_domain_type?: string | null
          known_firm_match?: string | null
          last_acquisition_year?: number | null
          last_contact_date?: string
          lead_status?: string
          linkedin_ma_experience?: boolean | null
          linkedin_score?: number | null
          linkedin_search_log?: Json | null
          linkedin_title?: string | null
          linkedin_url?: string | null
          lost_reason?: string
          lost_reason_v2?: string
          meeting_date?: string
          meeting_outcome?: string
          meeting_set_date?: string
          meetings?: Json
          message?: string
          name?: string
          next_follow_up?: string
          next_mutual_step?: string
          next_mutual_step_date?: string
          notes?: string
          nurture_re_engage_date?: string | null
          nurture_sequence_status?: string | null
          nurture_started_at?: string | null
          pe_backed?: boolean | null
          pe_backed_stage2?: boolean | null
          pe_sponsor_name?: string | null
          phone?: string
          portfolio_count?: number | null
          pre_screen_completed?: boolean
          priority?: string
          proof_notes?: string
          role?: string
          sample_outcome?: string
          sample_sent_date?: string
          secondary_contacts?: Json | null
          seniority_score?: number | null
          service_interest?: string
          source?: string
          stage?: string
          stage_entered_date?: string
          stage_gate_overrides?: Json
          stage1_score?: number | null
          stage2_score?: number | null
          stall_reason?: string
          submissions?: Json
          subscription_value?: number
          target_criteria?: string
          target_revenue?: string
          tier?: number | null
          tier_override?: boolean | null
          transaction_type?: string
          updated_at?: string
          website_score?: number | null
          website_url?: string | null
          won_reason?: string
        }
        Relationships: []
      }
      pipeline_snapshots: {
        Row: {
          created_at: string
          deal_count: number
          deals_advanced: number
          deals_lost: number
          id: string
          new_deals: number
          snapshot_date: string
          stage_data: Json
          total_pipeline_value: number
          weighted_pipeline_value: number
        }
        Insert: {
          created_at?: string
          deal_count?: number
          deals_advanced?: number
          deals_lost?: number
          id?: string
          new_deals?: number
          snapshot_date?: string
          stage_data?: Json
          total_pipeline_value?: number
          weighted_pipeline_value?: number
        }
        Update: {
          created_at?: string
          deal_count?: number
          deals_advanced?: number
          deals_lost?: number
          id?: string
          new_deals?: number
          snapshot_date?: string
          stage_data?: Json
          total_pipeline_value?: number
          weighted_pipeline_value?: number
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          acknowledged: boolean | null
          applied_fields: Json | null
          applied_updates: Json | null
          created_at: string | null
          deal_intelligence: Json | null
          error: string | null
          id: string
          job_type: string
          lead_data: Json
          lead_id: string
          lead_name: string
          new_meetings: Json | null
          pending_suggestions: Json | null
          progress_message: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          applied_fields?: Json | null
          applied_updates?: Json | null
          created_at?: string | null
          deal_intelligence?: Json | null
          error?: string | null
          id?: string
          job_type?: string
          lead_data?: Json
          lead_id: string
          lead_name: string
          new_meetings?: Json | null
          pending_suggestions?: Json | null
          progress_message?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          applied_fields?: Json | null
          applied_updates?: Json | null
          created_at?: string | null
          deal_intelligence?: Json | null
          error?: string | null
          id?: string
          job_type?: string
          lead_data?: Json
          lead_id?: string
          lead_name?: string
          new_meetings?: Json | null
          pending_suggestions?: Json | null
          progress_message?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          default_brand: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_brand?: string
          email?: string
          id: string
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_brand?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_email_connections: {
        Row: {
          access_token: string | null
          created_at: string
          email_address: string
          history_id: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_label: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          email_address: string
          history_id?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_label: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          email_address?: string
          history_id?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_label?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "rep"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "rep"],
    },
  },
} as const
