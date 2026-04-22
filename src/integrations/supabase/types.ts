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
      auto_classified_noise_senders: {
        Row: {
          classified_as: string
          classified_at: string
          classified_by: string | null
          message_count: number
          reason: string
          sender: string
        }
        Insert: {
          classified_as?: string
          classified_at?: string
          classified_by?: string | null
          message_count?: number
          reason?: string
          sender: string
        }
        Update: {
          classified_as?: string
          classified_at?: string
          classified_by?: string | null
          message_count?: number
          reason?: string
          sender?: string
        }
        Relationships: []
      }
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
      cron_run_log: {
        Row: {
          details: Json
          error_message: string | null
          id: string
          items_processed: number
          job_name: string
          ran_at: string
          status: string
        }
        Insert: {
          details?: Json
          error_message?: string | null
          id?: string
          items_processed?: number
          job_name: string
          ran_at?: string
          status?: string
        }
        Update: {
          details?: Json
          error_message?: string | null
          id?: string
          items_processed?: number
          job_name?: string
          ran_at?: string
          status?: string
        }
        Relationships: []
      }
      email_backfill_jobs: {
        Row: {
          connection_id: string
          created_at: string
          discovery_complete: boolean
          discovery_cursor: string | null
          discovery_cursor_sent: string | null
          email_address: string
          estimated_total: number
          finished_at: string | null
          id: string
          last_chunked_at: string | null
          last_error: string | null
          messages_discovered: number
          messages_inserted: number
          messages_matched: number
          messages_processed: number
          messages_skipped: number
          messages_unmatched: number
          provider: string
          started_at: string
          status: string
          target_window: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          discovery_complete?: boolean
          discovery_cursor?: string | null
          discovery_cursor_sent?: string | null
          email_address: string
          estimated_total?: number
          finished_at?: string | null
          id?: string
          last_chunked_at?: string | null
          last_error?: string | null
          messages_discovered?: number
          messages_inserted?: number
          messages_matched?: number
          messages_processed?: number
          messages_skipped?: number
          messages_unmatched?: number
          provider: string
          started_at?: string
          status?: string
          target_window?: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          discovery_complete?: boolean
          discovery_cursor?: string | null
          discovery_cursor_sent?: string | null
          email_address?: string
          estimated_total?: number
          finished_at?: string | null
          id?: string
          last_chunked_at?: string | null
          last_error?: string | null
          messages_discovered?: number
          messages_inserted?: number
          messages_matched?: number
          messages_processed?: number
          messages_skipped?: number
          messages_unmatched?: number
          provider?: string
          started_at?: string
          status?: string
          target_window?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_backfill_queue: {
        Row: {
          attempts: number
          connection_id: string
          enqueued_at: string
          folder: string
          id: number
          job_id: string
          last_error: string | null
          processed_at: string | null
          provider_message_id: string
          status: string
        }
        Insert: {
          attempts?: number
          connection_id: string
          enqueued_at?: string
          folder?: string
          id?: number
          job_id: string
          last_error?: string | null
          processed_at?: string | null
          provider_message_id: string
          status?: string
        }
        Update: {
          attempts?: number
          connection_id?: string
          enqueued_at?: string
          folder?: string
          id?: number
          job_id?: string
          last_error?: string | null
          processed_at?: string | null
          provider_message_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_backfill_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "email_backfill_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_compose_events: {
        Row: {
          brand: string
          created_at: string
          do_not_train: boolean
          draft_picked: string
          drafts_offered: Json
          edit_distance_body: number
          edit_distance_pct: number
          edit_distance_subject: number
          email_id: string | null
          final_body: string
          final_subject: string
          firm_type: string
          id: string
          initial_body: string
          initial_subject: string
          lead_id: string
          model: string
          picked_index: number
          purpose: string
          recommended_approach: string
          scheduled: boolean
          sent: boolean
          sent_at: string | null
          stage: string
          user_id: string | null
        }
        Insert: {
          brand?: string
          created_at?: string
          do_not_train?: boolean
          draft_picked?: string
          drafts_offered?: Json
          edit_distance_body?: number
          edit_distance_pct?: number
          edit_distance_subject?: number
          email_id?: string | null
          final_body?: string
          final_subject?: string
          firm_type?: string
          id?: string
          initial_body?: string
          initial_subject?: string
          lead_id: string
          model?: string
          picked_index?: number
          purpose?: string
          recommended_approach?: string
          scheduled?: boolean
          sent?: boolean
          sent_at?: string | null
          stage?: string
          user_id?: string | null
        }
        Update: {
          brand?: string
          created_at?: string
          do_not_train?: boolean
          draft_picked?: string
          drafts_offered?: Json
          edit_distance_body?: number
          edit_distance_pct?: number
          edit_distance_subject?: number
          email_id?: string | null
          final_body?: string
          final_subject?: string
          firm_type?: string
          id?: string
          initial_body?: string
          initial_subject?: string
          lead_id?: string
          model?: string
          picked_index?: number
          purpose?: string
          recommended_approach?: string
          scheduled?: boolean
          sent?: boolean
          sent_at?: string | null
          stage?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_compose_outcomes: {
        Row: {
          click_count: number
          clicked: boolean
          email_id: string
          event_id: string
          measured_at: string
          open_count: number
          opened: boolean
          replied: boolean
          replied_at: string | null
          stage_advanced: boolean
          stage_after: string
          stage_before: string
        }
        Insert: {
          click_count?: number
          clicked?: boolean
          email_id: string
          event_id: string
          measured_at?: string
          open_count?: number
          opened?: boolean
          replied?: boolean
          replied_at?: string | null
          stage_advanced?: boolean
          stage_after?: string
          stage_before?: string
        }
        Update: {
          click_count?: number
          clicked?: boolean
          email_id?: string
          event_id?: string
          measured_at?: string
          open_count?: number
          opened?: boolean
          replied?: boolean
          replied_at?: string | null
          stage_advanced?: boolean
          stage_after?: string
          stage_before?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_compose_outcomes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "email_compose_events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_field_links: {
        Row: {
          created_at: string
          created_by: string | null
          email_id: string
          field_key: string
          field_label: string
          id: string
          lead_id: string
          new_value: string
          previous_value: string
          quote: string
          source_excerpt: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email_id: string
          field_key: string
          field_label?: string
          id?: string
          lead_id: string
          new_value?: string
          previous_value?: string
          quote?: string
          source_excerpt?: string
          thread_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email_id?: string
          field_key?: string
          field_label?: string
          id?: string
          lead_id?: string
          new_value?: string
          previous_value?: string
          quote?: string
          source_excerpt?: string
          thread_id?: string
        }
        Relationships: []
      }
      email_noise_domains: {
        Row: {
          added_by: string | null
          created_at: string
          domain: string
          reason: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          domain: string
          reason?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          domain?: string
          reason?: string
        }
        Relationships: []
      }
      email_send_suppression: {
        Row: {
          added_at: string
          added_by: string | null
          email: string
          reason: string
          source_lead_id: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          email: string
          reason?: string
          source_lead_id?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          email?: string
          reason?: string
          source_lead_id?: string | null
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
      email_thread_intelligence: {
        Row: {
          email_count: number
          generated_at: string
          hot_flag: boolean
          last_email_at: string | null
          lead_id: string
          model: string
          recommended_action: string
          recommended_body: string
          recommended_subject: string
          sentiment: string
          signal_tags: string[]
          suggested_sequence_step: string
          summary: string
          thread_id: string
        }
        Insert: {
          email_count?: number
          generated_at?: string
          hot_flag?: boolean
          last_email_at?: string | null
          lead_id: string
          model?: string
          recommended_action?: string
          recommended_body?: string
          recommended_subject?: string
          sentiment?: string
          signal_tags?: string[]
          suggested_sequence_step?: string
          summary?: string
          thread_id: string
        }
        Update: {
          email_count?: number
          generated_at?: string
          hot_flag?: boolean
          last_email_at?: string | null
          lead_id?: string
          model?: string
          recommended_action?: string
          recommended_body?: string
          recommended_subject?: string
          sentiment?: string
          signal_tags?: string[]
          suggested_sequence_step?: string
          summary?: string
          thread_id?: string
        }
        Relationships: []
      }
      fireflies_retry_queue: {
        Row: {
          attempts: number
          created_at: string
          fireflies_id: string
          id: string
          last_error: string | null
          lead_id: string
          max_attempts: number
          next_attempt_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          fireflies_id: string
          id?: string
          last_error?: string | null
          lead_id: string
          max_attempts?: number
          next_attempt_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          fireflies_id?: string
          id?: string
          last_error?: string | null
          lead_id?: string
          max_attempts?: number
          next_attempt_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      firm_activity_emails: {
        Row: {
          email_id: string
          firm_domain: string
          id: string
          note: string
          set_aside_at: string
          set_aside_by: string | null
        }
        Insert: {
          email_id: string
          firm_domain: string
          id?: string
          note?: string
          set_aside_at?: string
          set_aside_by?: string | null
        }
        Update: {
          email_id?: string
          firm_domain?: string
          id?: string
          note?: string
          set_aside_at?: string
          set_aside_by?: string | null
        }
        Relationships: []
      }
      lead_activity_log: {
        Row: {
          actor_name: string
          actor_user_id: string | null
          created_at: string
          description: string
          event_type: string
          id: string
          lead_id: string
          metadata: Json
          new_value: string | null
          old_value: string | null
          pinned_at: string | null
        }
        Insert: {
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          lead_id: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
          pinned_at?: string | null
        }
        Update: {
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          lead_id?: string
          metadata?: Json
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
      lead_email_filters: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          pattern_type: string
          sender_pattern: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          pattern_type?: string
          sender_pattern: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          pattern_type?: string
          sender_pattern?: string
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
          ai_drafted: boolean
          attachments: Json | null
          bcc_addresses: string[] | null
          body_html: string | null
          body_preview: string | null
          body_text: string | null
          bounce_reason: string | null
          canonical_thread_lead_id: string | null
          cc_addresses: string[] | null
          classification_reason: string | null
          clicks: Json | null
          created_at: string | null
          direction: string
          email_date: string
          email_type: string
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
          sequence_step: string | null
          source: string | null
          subject: string | null
          thread_id: string | null
          to_addresses: string[] | null
          tracked: boolean | null
        }
        Insert: {
          ai_drafted?: boolean
          attachments?: Json | null
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_preview?: string | null
          body_text?: string | null
          bounce_reason?: string | null
          canonical_thread_lead_id?: string | null
          cc_addresses?: string[] | null
          classification_reason?: string | null
          clicks?: Json | null
          created_at?: string | null
          direction?: string
          email_date?: string
          email_type?: string
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
          sequence_step?: string | null
          source?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[] | null
          tracked?: boolean | null
        }
        Update: {
          ai_drafted?: boolean
          attachments?: Json | null
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_preview?: string | null
          body_text?: string | null
          bounce_reason?: string | null
          canonical_thread_lead_id?: string | null
          cc_addresses?: string[] | null
          classification_reason?: string | null
          clicks?: Json | null
          created_at?: string | null
          direction?: string
          email_date?: string
          email_type?: string
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
          sequence_step?: string | null
          source?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[] | null
          tracked?: boolean | null
        }
        Relationships: []
      }
      lead_intelligence_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          signal_tags: string[]
          source: string
          source_ref: string
          title: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          signal_tags?: string[]
          source?: string
          source_ref?: string
          title?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          signal_tags?: string[]
          source?: string
          source_ref?: string
          title?: string
        }
        Relationships: []
      }
      lead_stakeholders: {
        Row: {
          created_at: string
          email: string
          id: string
          is_intermediary: boolean
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
          is_intermediary?: boolean
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
          is_intermediary?: boolean
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
          first_email_fact: string
          first_email_fact_source: string
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
          nurture_exit_reason: string
          nurture_re_engage_date: string | null
          nurture_sequence_status: string | null
          nurture_started_at: string | null
          nurture_step_log: Json
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
          first_email_fact?: string
          first_email_fact_source?: string
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
          nurture_exit_reason?: string
          nurture_re_engage_date?: string | null
          nurture_sequence_status?: string | null
          nurture_started_at?: string | null
          nurture_step_log?: Json
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
          first_email_fact?: string
          first_email_fact_source?: string
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
          nurture_exit_reason?: string
          nurture_re_engage_date?: string | null
          nurture_sequence_status?: string | null
          nurture_started_at?: string | null
          nurture_step_log?: Json
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
      mailbox_preferences: {
        Row: {
          connection_id: string
          id: string
          tracking_enabled: boolean
          updated_at: string
        }
        Insert: {
          connection_id: string
          id?: string
          tracking_enabled?: boolean
          updated_at?: string
        }
        Update: {
          connection_id?: string
          id?: string
          tracking_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pending_attribution_suggestions: {
        Row: {
          created_at: string
          email_count: number
          id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          sample_email_id: string | null
          sender_domain: string
          sender_email: string
          status: string
          suggested_lead_id: string
        }
        Insert: {
          created_at?: string
          email_count?: number
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sample_email_id?: string | null
          sender_domain: string
          sender_email: string
          status?: string
          suggested_lead_id: string
        }
        Update: {
          created_at?: string
          email_count?: number
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sample_email_id?: string | null
          sender_domain?: string
          sender_email?: string
          status?: string
          suggested_lead_id?: string
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          email: string
          invited_at: string
          invited_by: string | null
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          email: string
          invited_at?: string
          invited_by?: string | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          email?: string
          invited_at?: string
          invited_by?: string | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
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
      list_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          schedule: string
        }[]
      }
      list_cron_run_details: {
        Args: { _limit_per_job?: number }
        Returns: {
          end_time: string
          jobname: string
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
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
