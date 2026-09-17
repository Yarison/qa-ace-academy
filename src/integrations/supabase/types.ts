export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      mock_sessions: {
        Row: {
          created_at: string;
          id: string;
          score: number | null;
          summary: string | null;
          topic: string;
          transcript: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          score?: number | null;
          summary?: string | null;
          topic: string;
          transcript?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          score?: number | null;
          summary?: string | null;
          topic?: string;
          transcript?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      prep_sessions: {
        Row: {
          answers: Json;
          completed: Json;
          created_at: string;
          id: string;
          interview_date: string | null;
          jd_analysis: Json | null;
          job_description: string | null;
          plan: Json | null;
          resume_analysis: Json | null;
          resume_text: string | null;
          rotation: Json | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          answers?: Json;
          completed?: Json;
          created_at?: string;
          id?: string;
          interview_date?: string | null;
          jd_analysis?: Json | null;
          job_description?: string | null;
          plan?: Json | null;
          resume_analysis?: Json | null;
          resume_text?: string | null;
          rotation?: Json | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          answers?: Json;
          completed?: Json;
          created_at?: string;
          id?: string;
          interview_date?: string | null;
          jd_analysis?: Json | null;
          job_description?: string | null;
          plan?: Json | null;
          resume_analysis?: Json | null;
          resume_text?: string | null;
          rotation?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          tier: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          tier?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          tier?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          answer: string;
          category: string;
          created_at: string;
          difficulty: string;
          id: string;
          question: string;
          tags: string[];
        };
        Insert: {
          answer: string;
          category: string;
          created_at?: string;
          difficulty: string;
          id?: string;
          question: string;
          tags?: string[];
        };
        Update: {
          answer?: string;
          category?: string;
          created_at?: string;
          difficulty?: string;
          id?: string;
          question?: string;
          tags?: string[];
        };
        Relationships: [];
      };
      study_plans: {
        Row: {
          completed: Json;
          created_at: string;
          id: string;
          interview_date: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed?: Json;
          created_at?: string;
          id?: string;
          interview_date: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed?: Json;
          created_at?: string;
          id?: string;
          interview_date?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_usage_anonymous: {
        Row: {
          ip_address: string;
          calls_used: number;
          first_seen: string;
          updated_at: string;
        };
        Insert: {
          ip_address: string;
          calls_used?: number;
          first_seen?: string;
          updated_at?: string;
        };
        Update: {
          ip_address?: string;
          calls_used?: number;
          first_seen?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_usage_user_daily: {
        Row: {
          user_id: string;
          date: string;
          points_used: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          points_used?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          date?: string;
          points_used?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_ai_user_points: {
        Args: { p_cost: number };
        Returns: Array<{ remaining: number; limit_value: number; tier: string }>;
      };
      consume_anonymous_ai_call: {
        Args: { p_ip_address: string };
        Returns: Array<{ remaining: number; limit_value: number }>;
      };
      set_user_tier: {
        Args: {
          p_user_id: string;
          p_tier: string;
          p_stripe_customer_id?: string | null;
          p_stripe_subscription_id?: string | null;
        };
        Returns: void;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
