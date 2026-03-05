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
      lead_emails: {
        Row: {
          body_preview: string | null
          created_at: string | null
          direction: string
          email_date: string
          from_address: string
          from_name: string | null
          id: string
          lead_id: string
          message_id: string | null
          raw_payload: Json | null
          source: string | null
          subject: string | null
          thread_id: string | null
          to_addresses: string[] | null
        }
        Insert: {
          body_preview?: string | null
          created_at?: string | null
          direction?: string
          email_date?: string
          from_address: string
          from_name?: string | null
          id?: string
          lead_id: string
          message_id?: string | null
          raw_payload?: Json | null
          source?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[] | null
        }
        Update: {
          body_preview?: string | null
          created_at?: string | null
          direction?: string
          email_date?: string
          from_address?: string
          from_name?: string | null
          id?: string
          lead_id?: string
          message_id?: string | null
          raw_payload?: Json | null
          source?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[] | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          acquisition_strategy: string
          assigned_to: string
          billing_frequency: string
          brand: string
          buyer_type: string
          close_reason: string
          closed_date: string
          company: string
          company_url: string
          contract_end: string
          contract_start: string
          created_at: string
          current_sourcing: string
          date_submitted: string
          days_in_current_stage: number
          deal_intelligence: Json | null
          deal_value: number
          deals_planned: string
          duplicate_of: string
          email: string
          enrichment: Json | null
          fireflies_next_steps: string
          fireflies_summary: string
          fireflies_transcript: string
          fireflies_url: string
          forecast_category: string
          geography: string
          hear_about_us: string
          hours_to_meeting_set: number | null
          icp_fit: string
          id: string
          is_duplicate: boolean
          last_contact_date: string
          lost_reason: string
          meeting_date: string
          meeting_outcome: string
          meeting_set_date: string
          meetings: Json
          message: string
          name: string
          next_follow_up: string
          notes: string
          phone: string
          priority: string
          role: string
          service_interest: string
          source: string
          stage: string
          stage_entered_date: string
          submissions: Json
          subscription_value: number
          target_criteria: string
          target_revenue: string
          updated_at: string
          won_reason: string
        }
        Insert: {
          acquisition_strategy?: string
          assigned_to?: string
          billing_frequency?: string
          brand?: string
          buyer_type?: string
          close_reason?: string
          closed_date?: string
          company?: string
          company_url?: string
          contract_end?: string
          contract_start?: string
          created_at?: string
          current_sourcing?: string
          date_submitted?: string
          days_in_current_stage?: number
          deal_intelligence?: Json | null
          deal_value?: number
          deals_planned?: string
          duplicate_of?: string
          email?: string
          enrichment?: Json | null
          fireflies_next_steps?: string
          fireflies_summary?: string
          fireflies_transcript?: string
          fireflies_url?: string
          forecast_category?: string
          geography?: string
          hear_about_us?: string
          hours_to_meeting_set?: number | null
          icp_fit?: string
          id: string
          is_duplicate?: boolean
          last_contact_date?: string
          lost_reason?: string
          meeting_date?: string
          meeting_outcome?: string
          meeting_set_date?: string
          meetings?: Json
          message?: string
          name?: string
          next_follow_up?: string
          notes?: string
          phone?: string
          priority?: string
          role?: string
          service_interest?: string
          source?: string
          stage?: string
          stage_entered_date?: string
          submissions?: Json
          subscription_value?: number
          target_criteria?: string
          target_revenue?: string
          updated_at?: string
          won_reason?: string
        }
        Update: {
          acquisition_strategy?: string
          assigned_to?: string
          billing_frequency?: string
          brand?: string
          buyer_type?: string
          close_reason?: string
          closed_date?: string
          company?: string
          company_url?: string
          contract_end?: string
          contract_start?: string
          created_at?: string
          current_sourcing?: string
          date_submitted?: string
          days_in_current_stage?: number
          deal_intelligence?: Json | null
          deal_value?: number
          deals_planned?: string
          duplicate_of?: string
          email?: string
          enrichment?: Json | null
          fireflies_next_steps?: string
          fireflies_summary?: string
          fireflies_transcript?: string
          fireflies_url?: string
          forecast_category?: string
          geography?: string
          hear_about_us?: string
          hours_to_meeting_set?: number | null
          icp_fit?: string
          id?: string
          is_duplicate?: boolean
          last_contact_date?: string
          lost_reason?: string
          meeting_date?: string
          meeting_outcome?: string
          meeting_set_date?: string
          meetings?: Json
          message?: string
          name?: string
          next_follow_up?: string
          notes?: string
          phone?: string
          priority?: string
          role?: string
          service_interest?: string
          source?: string
          stage?: string
          stage_entered_date?: string
          submissions?: Json
          subscription_value?: number
          target_criteria?: string
          target_revenue?: string
          updated_at?: string
          won_reason?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
