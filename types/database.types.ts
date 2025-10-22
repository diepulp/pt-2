export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          casino_id: string | null;
          created_at: string;
          details: Json | null;
          domain: string;
          id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          casino_id?: string | null;
          created_at?: string;
          details?: Json | null;
          domain: string;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          casino_id?: string | null;
          created_at?: string;
          details?: Json | null;
          domain?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
      casino: {
        Row: {
          address: Json | null;
          company_id: string | null;
          created_at: string;
          id: string;
          location: string | null;
          name: string;
          status: string;
        };
        Insert: {
          address?: Json | null;
          company_id?: string | null;
          created_at?: string;
          id?: string;
          location?: string | null;
          name: string;
          status?: string;
        };
        Update: {
          address?: Json | null;
          company_id?: string | null;
          created_at?: string;
          id?: string;
          location?: string | null;
          name?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "casino_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "company";
            referencedColumns: ["id"];
          },
        ];
      };
      casino_settings: {
        Row: {
          casino_id: string;
          created_at: string;
          ctr_threshold: number;
          gaming_day_start_time: string;
          id: string;
          timezone: string;
          updated_at: string;
          watchlist_floor: number;
        };
        Insert: {
          casino_id: string;
          created_at?: string;
          ctr_threshold?: number;
          gaming_day_start_time?: string;
          id?: string;
          timezone?: string;
          updated_at?: string;
          watchlist_floor?: number;
        };
        Update: {
          casino_id?: string;
          created_at?: string;
          ctr_threshold?: number;
          gaming_day_start_time?: string;
          id?: string;
          timezone?: string;
          updated_at?: string;
          watchlist_floor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "casino_settings_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: true;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
      company: {
        Row: {
          created_at: string;
          id: string;
          legal_name: string | null;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          legal_name?: string | null;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          legal_name?: string | null;
          name?: string;
        };
        Relationships: [];
      };
      dealer_rotation: {
        Row: {
          casino_id: string;
          ended_at: string | null;
          id: string;
          staff_id: string | null;
          started_at: string;
          table_id: string;
        };
        Insert: {
          casino_id: string;
          ended_at?: string | null;
          id?: string;
          staff_id?: string | null;
          started_at?: string;
          table_id: string;
        };
        Update: {
          casino_id?: string;
          ended_at?: string | null;
          id?: string;
          staff_id?: string | null;
          started_at?: string;
          table_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dealer_rotation_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dealer_rotation_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dealer_rotation_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "gaming_table";
            referencedColumns: ["id"];
          },
        ];
      };
      game_settings: {
        Row: {
          casino_id: string;
          game_type: Database["public"]["Enums"]["game_type"];
          id: string;
          max_bet: number | null;
          min_bet: number | null;
          rotation_interval_minutes: number | null;
        };
        Insert: {
          casino_id: string;
          game_type: Database["public"]["Enums"]["game_type"];
          id?: string;
          max_bet?: number | null;
          min_bet?: number | null;
          rotation_interval_minutes?: number | null;
        };
        Update: {
          casino_id?: string;
          game_type?: Database["public"]["Enums"]["game_type"];
          id?: string;
          max_bet?: number | null;
          min_bet?: number | null;
          rotation_interval_minutes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "game_settings_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
      gaming_table: {
        Row: {
          casino_id: string;
          created_at: string;
          id: string;
          label: string;
          pit: string | null;
          status: Database["public"]["Enums"]["table_status"];
          type: Database["public"]["Enums"]["game_type"];
        };
        Insert: {
          casino_id: string;
          created_at?: string;
          id?: string;
          label: string;
          pit?: string | null;
          status?: Database["public"]["Enums"]["table_status"];
          type: Database["public"]["Enums"]["game_type"];
        };
        Update: {
          casino_id?: string;
          created_at?: string;
          id?: string;
          label?: string;
          pit?: string | null;
          status?: Database["public"]["Enums"]["table_status"];
          type?: Database["public"]["Enums"]["game_type"];
        };
        Relationships: [
          {
            foreignKeyName: "gaming_table_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
      gaming_table_settings: {
        Row: {
          active_from: string;
          active_to: string | null;
          casino_id: string;
          id: string;
          max_bet: number | null;
          min_bet: number | null;
          rotation_interval_minutes: number | null;
          table_id: string;
        };
        Insert: {
          active_from?: string;
          active_to?: string | null;
          casino_id: string;
          id?: string;
          max_bet?: number | null;
          min_bet?: number | null;
          rotation_interval_minutes?: number | null;
          table_id: string;
        };
        Update: {
          active_from?: string;
          active_to?: string | null;
          casino_id?: string;
          id?: string;
          max_bet?: number | null;
          min_bet?: number | null;
          rotation_interval_minutes?: number | null;
          table_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gaming_table_settings_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gaming_table_settings_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "gaming_table";
            referencedColumns: ["id"];
          },
        ];
      };
      loyalty_ledger: {
        Row: {
          average_bet: number | null;
          casino_id: string;
          created_at: string;
          duration_seconds: number | null;
          game_type: Database["public"]["Enums"]["game_type"] | null;
          id: string;
          idempotency_key: string | null;
          player_id: string;
          points_earned: number;
          rating_slip_id: string | null;
          reason: Database["public"]["Enums"]["loyalty_reason"];
          staff_id: string | null;
          visit_id: string | null;
        };
        Insert: {
          average_bet?: number | null;
          casino_id: string;
          created_at?: string;
          duration_seconds?: number | null;
          game_type?: Database["public"]["Enums"]["game_type"] | null;
          id?: string;
          idempotency_key?: string | null;
          player_id: string;
          points_earned: number;
          rating_slip_id?: string | null;
          reason?: Database["public"]["Enums"]["loyalty_reason"];
          staff_id?: string | null;
          visit_id?: string | null;
        };
        Update: {
          average_bet?: number | null;
          casino_id?: string;
          created_at?: string;
          duration_seconds?: number | null;
          game_type?: Database["public"]["Enums"]["game_type"] | null;
          id?: string;
          idempotency_key?: string | null;
          player_id?: string;
          points_earned?: number;
          rating_slip_id?: string | null;
          reason?: Database["public"]["Enums"]["loyalty_reason"];
          staff_id?: string | null;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loyalty_ledger_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loyalty_ledger_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "rating_slip";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loyalty_ledger_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loyalty_ledger_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
        ];
      };
      mtl_audit_note: {
        Row: {
          created_at: string;
          id: string;
          mtl_entry_id: string;
          note: string;
          staff_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mtl_entry_id: string;
          note: string;
          staff_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          mtl_entry_id?: string;
          note?: string;
          staff_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mtl_audit_note_mtl_entry_id_fkey";
            columns: ["mtl_entry_id"];
            isOneToOne: false;
            referencedRelation: "mtl_entry";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_audit_note_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      mtl_entry: {
        Row: {
          amount: number;
          area: string | null;
          casino_id: string;
          created_at: string;
          direction: string;
          id: string;
          idempotency_key: string | null;
          patron_uuid: string;
          rating_slip_id: string | null;
          staff_id: string | null;
          visit_id: string | null;
        };
        Insert: {
          amount: number;
          area?: string | null;
          casino_id: string;
          created_at?: string;
          direction: string;
          id?: string;
          idempotency_key?: string | null;
          patron_uuid: string;
          rating_slip_id?: string | null;
          staff_id?: string | null;
          visit_id?: string | null;
        };
        Update: {
          amount?: number;
          area?: string | null;
          casino_id?: string;
          created_at?: string;
          direction?: string;
          id?: string;
          idempotency_key?: string | null;
          patron_uuid?: string;
          rating_slip_id?: string | null;
          staff_id?: string | null;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mtl_entry_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_patron_uuid_fkey";
            columns: ["patron_uuid"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "rating_slip";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
        ];
      };
      player: {
        Row: {
          birth_date: string | null;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
        };
        Insert: {
          birth_date?: string | null;
          created_at?: string;
          first_name: string;
          id?: string;
          last_name: string;
        };
        Update: {
          birth_date?: string | null;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
        };
        Relationships: [];
      };
      player_casino: {
        Row: {
          casino_id: string;
          enrolled_at: string;
          player_id: string;
          status: string;
        };
        Insert: {
          casino_id: string;
          enrolled_at?: string;
          player_id: string;
          status?: string;
        };
        Update: {
          casino_id?: string;
          enrolled_at?: string;
          player_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "player_casino_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_casino_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
        ];
      };
      player_financial_transaction: {
        Row: {
          amount: number;
          casino_id: string;
          created_at: string;
          gaming_day: string | null;
          id: string;
          player_id: string;
          rating_slip_id: string | null;
          tender_type: string | null;
          visit_id: string | null;
        };
        Insert: {
          amount: number;
          casino_id: string;
          created_at?: string;
          gaming_day?: string | null;
          id?: string;
          player_id: string;
          rating_slip_id?: string | null;
          tender_type?: string | null;
          visit_id?: string | null;
        };
        Update: {
          amount?: number;
          casino_id?: string;
          created_at?: string;
          gaming_day?: string | null;
          id?: string;
          player_id?: string;
          rating_slip_id?: string | null;
          tender_type?: string | null;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_financial_transaction_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_financial_transaction_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_financial_transaction_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "rating_slip";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_financial_transaction_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
        ];
      };
      player_loyalty: {
        Row: {
          balance: number;
          casino_id: string;
          player_id: string;
          preferences: Json;
          tier: string | null;
          updated_at: string;
        };
        Insert: {
          balance?: number;
          casino_id: string;
          player_id: string;
          preferences?: Json;
          tier?: string | null;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          casino_id?: string;
          player_id?: string;
          preferences?: Json;
          tier?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "player_loyalty_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_loyalty_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
        ];
      };
      rating_slip: {
        Row: {
          average_bet: number | null;
          casino_id: string;
          end_time: string | null;
          game_settings: Json | null;
          id: string;
          player_id: string;
          policy_snapshot: Json | null;
          start_time: string;
          status: string;
          table_id: string | null;
          visit_id: string | null;
        };
        Insert: {
          average_bet?: number | null;
          casino_id: string;
          end_time?: string | null;
          game_settings?: Json | null;
          id?: string;
          player_id: string;
          policy_snapshot?: Json | null;
          start_time?: string;
          status?: string;
          table_id?: string | null;
          visit_id?: string | null;
        };
        Update: {
          average_bet?: number | null;
          casino_id?: string;
          end_time?: string | null;
          game_settings?: Json | null;
          id?: string;
          player_id?: string;
          policy_snapshot?: Json | null;
          start_time?: string;
          status?: string;
          table_id?: string | null;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rating_slip_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rating_slip_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rating_slip_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "gaming_table";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rating_slip_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
        ];
      };
      report: {
        Row: {
          casino_id: string | null;
          generated_at: string;
          id: string;
          name: string;
          payload: Json;
        };
        Insert: {
          casino_id?: string | null;
          generated_at?: string;
          id?: string;
          name: string;
          payload: Json;
        };
        Update: {
          casino_id?: string | null;
          generated_at?: string;
          id?: string;
          name?: string;
          payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "report_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          casino_id: string | null;
          created_at: string;
          email: string | null;
          employee_id: string | null;
          first_name: string;
          id: string;
          last_name: string;
          role: Database["public"]["Enums"]["staff_role"];
          status: Database["public"]["Enums"]["staff_status"];
        };
        Insert: {
          casino_id?: string | null;
          created_at?: string;
          email?: string | null;
          employee_id?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
          role?: Database["public"]["Enums"]["staff_role"];
          status?: Database["public"]["Enums"]["staff_status"];
        };
        Update: {
          casino_id?: string | null;
          created_at?: string;
          email?: string | null;
          employee_id?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          status?: Database["public"]["Enums"]["staff_status"];
        };
        Relationships: [
          {
            foreignKeyName: "staff_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
      visit: {
        Row: {
          casino_id: string;
          ended_at: string | null;
          id: string;
          player_id: string;
          started_at: string;
        };
        Insert: {
          casino_id: string;
          ended_at?: string | null;
          id?: string;
          player_id: string;
          started_at?: string;
        };
        Update: {
          casino_id?: string;
          ended_at?: string | null;
          id?: string;
          player_id?: string;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visit_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visit_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      compute_gaming_day: {
        Args: { gstart: string; ts: string };
        Returns: string;
      };
      rpc_create_financial_txn: {
        Args: {
          p_amount: number;
          p_casino_id: string;
          p_created_at?: string;
          p_player_id: string;
          p_rating_slip_id?: string;
          p_tender_type?: string;
          p_visit_id?: string;
        };
        Returns: string;
      };
      rpc_issue_mid_session_reward: {
        Args: {
          p_casino_id: string;
          p_idempotency_key?: string;
          p_player_id: string;
          p_points: number;
          p_rating_slip_id: string;
          p_reason?: Database["public"]["Enums"]["loyalty_reason"];
          p_staff_id: string;
        };
        Returns: {
          balance_after: number;
          ledger_id: string;
        }[];
      };
    };
    Enums: {
      game_type: "blackjack" | "poker" | "roulette" | "baccarat";
      loyalty_reason:
        | "mid_session"
        | "session_end"
        | "manual_adjustment"
        | "promotion"
        | "correction";
      staff_role: "dealer" | "pit_boss" | "admin";
      staff_status: "active" | "inactive";
      table_status: "inactive" | "active" | "closed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      game_type: ["blackjack", "poker", "roulette", "baccarat"],
      loyalty_reason: [
        "mid_session",
        "session_end",
        "manual_adjustment",
        "promotion",
        "correction",
      ],
      staff_role: ["dealer", "pit_boss", "admin"],
      staff_status: ["active", "inactive"],
      table_status: ["inactive", "active", "closed"],
    },
  },
} as const;
