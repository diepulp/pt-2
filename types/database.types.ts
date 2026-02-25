export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          casino_id: string | null
          created_at: string
          details: Json | null
          domain: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          casino_id?: string | null
          created_at?: string
          details?: Json | null
          domain: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          casino_id?: string | null
          created_at?: string
          details?: Json | null
          domain?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
        ]
      }
      casino: {
        Row: {
          address: Json | null
          company_id: string | null
          created_at: string
          id: string
          location: string | null
          name: string
          status: string
        }
        Insert: {
          address?: Json | null
          company_id?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name: string
          status?: string
        }
        Update: {
          address?: Json | null
          company_id?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "casino_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      casino_settings: {
        Row: {
          alert_thresholds: Json
          casino_id: string
          created_at: string
          ctr_threshold: number
          gaming_day_start_time: string
          id: string
          promo_allow_anonymous_issuance: boolean
          promo_require_exact_match: boolean
          setup_completed_at: string | null
          setup_completed_by: string | null
          setup_status: string
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"]
          timezone: string
          updated_at: string
          watchlist_floor: number
        }
        Insert: {
          alert_thresholds?: Json
          casino_id: string
          created_at?: string
          ctr_threshold?: number
          gaming_day_start_time?: string
          id?: string
          promo_allow_anonymous_issuance?: boolean
          promo_require_exact_match?: boolean
          setup_completed_at?: string | null
          setup_completed_by?: string | null
          setup_status?: string
          table_bank_mode?: Database["public"]["Enums"]["table_bank_mode"]
          timezone?: string
          updated_at?: string
          watchlist_floor?: number
        }
        Update: {
          alert_thresholds?: Json
          casino_id?: string
          created_at?: string
          ctr_threshold?: number
          gaming_day_start_time?: string
          id?: string
          promo_allow_anonymous_issuance?: boolean
          promo_require_exact_match?: boolean
          setup_completed_at?: string | null
          setup_completed_by?: string | null
          setup_status?: string
          table_bank_mode?: Database["public"]["Enums"]["table_bank_mode"]
          timezone?: string
          updated_at?: string
          watchlist_floor?: number
        }
        Relationships: [
          {
            foreignKeyName: "casino_settings_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: true
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casino_settings_setup_completed_by_fkey"
            columns: ["setup_completed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          created_at: string
          id: string
          legal_name: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          legal_name?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          legal_name?: string | null
          name?: string
        }
        Relationships: []
      }
      dealer_rotation: {
        Row: {
          casino_id: string
          ended_at: string | null
          id: string
          staff_id: string | null
          started_at: string
          table_id: string
        }
        Insert: {
          casino_id: string
          ended_at?: string | null
          id?: string
          staff_id?: string | null
          started_at?: string
          table_id: string
        }
        Update: {
          casino_id?: string
          ended_at?: string | null
          id?: string
          staff_id?: string | null
          started_at?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_rotation_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_rotation_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_rotation_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_outbox: {
        Row: {
          attempt_count: number
          casino_id: string
          created_at: string
          event_type: string
          id: string
          ledger_id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          attempt_count?: number
          casino_id: string
          created_at?: string
          event_type: string
          id?: string
          ledger_id: string
          payload: Json
          processed_at?: string | null
        }
        Update: {
          attempt_count?: number
          casino_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ledger_id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_outbox_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_outbox_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "player_financial_transaction"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_layout: {
        Row: {
          approved_by: string | null
          casino_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          reviewed_by: string | null
          status: Database["public"]["Enums"]["floor_layout_status"]
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          casino_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["floor_layout_status"]
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          casino_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["floor_layout_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_layout_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_layout_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_layout_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_layout_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_layout_activation: {
        Row: {
          activated_at: string
          activated_by: string
          activation_request_id: string
          casino_id: string
          deactivated_at: string | null
          id: string
          layout_version_id: string
        }
        Insert: {
          activated_at?: string
          activated_by: string
          activation_request_id: string
          casino_id: string
          deactivated_at?: string | null
          id?: string
          layout_version_id: string
        }
        Update: {
          activated_at?: string
          activated_by?: string
          activation_request_id?: string
          casino_id?: string
          deactivated_at?: string | null
          id?: string
          layout_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_layout_activation_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_layout_activation_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_layout_activation_layout_version_id_fkey"
            columns: ["layout_version_id"]
            isOneToOne: false
            referencedRelation: "floor_layout_version"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_layout_version: {
        Row: {
          created_at: string
          created_by: string
          id: string
          layout_id: string
          layout_payload: Json
          notes: string | null
          status: Database["public"]["Enums"]["floor_layout_version_status"]
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          layout_id: string
          layout_payload?: Json
          notes?: string | null
          status?: Database["public"]["Enums"]["floor_layout_version_status"]
          version_no: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          layout_id?: string
          layout_payload?: Json
          notes?: string | null
          status?: Database["public"]["Enums"]["floor_layout_version_status"]
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "floor_layout_version_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_layout_version_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "floor_layout"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_pit: {
        Row: {
          capacity: number | null
          geometry: Json | null
          id: string
          label: string
          layout_version_id: string
          metadata: Json | null
          sequence: number
        }
        Insert: {
          capacity?: number | null
          geometry?: Json | null
          id?: string
          label: string
          layout_version_id: string
          metadata?: Json | null
          sequence?: number
        }
        Update: {
          capacity?: number | null
          geometry?: Json | null
          id?: string
          label?: string
          layout_version_id?: string
          metadata?: Json | null
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "floor_pit_layout_version_id_fkey"
            columns: ["layout_version_id"]
            isOneToOne: false
            referencedRelation: "floor_layout_version"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_table_slot: {
        Row: {
          coordinates: Json | null
          game_type: Database["public"]["Enums"]["game_type"]
          id: string
          layout_version_id: string
          metadata: Json | null
          orientation: string | null
          pit_id: string | null
          preferred_table_id: string | null
          slot_label: string
        }
        Insert: {
          coordinates?: Json | null
          game_type: Database["public"]["Enums"]["game_type"]
          id?: string
          layout_version_id: string
          metadata?: Json | null
          orientation?: string | null
          pit_id?: string | null
          preferred_table_id?: string | null
          slot_label: string
        }
        Update: {
          coordinates?: Json | null
          game_type?: Database["public"]["Enums"]["game_type"]
          id?: string
          layout_version_id?: string
          metadata?: Json | null
          orientation?: string | null
          pit_id?: string | null
          preferred_table_id?: string | null
          slot_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_table_slot_layout_version_id_fkey"
            columns: ["layout_version_id"]
            isOneToOne: false
            referencedRelation: "floor_layout_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_table_slot_pit_id_fkey"
            columns: ["pit_id"]
            isOneToOne: false
            referencedRelation: "floor_pit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_table_slot_preferred_table_id_fkey"
            columns: ["preferred_table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
        ]
      }
      game_settings: {
        Row: {
          casino_id: string
          code: string
          created_at: string
          decisions_per_hour: number
          deck_profile: string | null
          game_type: Database["public"]["Enums"]["game_type"]
          house_edge: number
          id: string
          max_bet: number | null
          min_bet: number | null
          name: string
          notes: string | null
          point_multiplier: number | null
          points_conversion_rate: number | null
          rating_edge_for_comp: number | null
          rotation_interval_minutes: number | null
          seats_available: number
          shoe_decks: number | null
          updated_at: string
          variant_name: string | null
        }
        Insert: {
          casino_id: string
          code: string
          created_at?: string
          decisions_per_hour?: number
          deck_profile?: string | null
          game_type: Database["public"]["Enums"]["game_type"]
          house_edge?: number
          id?: string
          max_bet?: number | null
          min_bet?: number | null
          name: string
          notes?: string | null
          point_multiplier?: number | null
          points_conversion_rate?: number | null
          rating_edge_for_comp?: number | null
          rotation_interval_minutes?: number | null
          seats_available?: number
          shoe_decks?: number | null
          updated_at?: string
          variant_name?: string | null
        }
        Update: {
          casino_id?: string
          code?: string
          created_at?: string
          decisions_per_hour?: number
          deck_profile?: string | null
          game_type?: Database["public"]["Enums"]["game_type"]
          house_edge?: number
          id?: string
          max_bet?: number | null
          min_bet?: number | null
          name?: string
          notes?: string | null
          point_multiplier?: number | null
          points_conversion_rate?: number | null
          rating_edge_for_comp?: number | null
          rotation_interval_minutes?: number | null
          seats_available?: number
          shoe_decks?: number | null
          updated_at?: string
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_settings_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
        ]
      }
      game_settings_side_bet: {
        Row: {
          casino_id: string
          created_at: string
          enabled_by_default: boolean
          game_settings_id: string
          house_edge: number
          id: string
          paytable_id: string | null
          side_bet_name: string
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          enabled_by_default?: boolean
          game_settings_id: string
          house_edge: number
          id?: string
          paytable_id?: string | null
          side_bet_name: string
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          enabled_by_default?: boolean
          game_settings_id?: string
          house_edge?: number
          id?: string
          paytable_id?: string | null
          side_bet_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_settings_side_bet_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_settings_side_bet_game_settings_id_fkey"
            columns: ["game_settings_id"]
            isOneToOne: false
            referencedRelation: "game_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      gaming_table: {
        Row: {
          casino_id: string
          created_at: string
          game_settings_id: string | null
          id: string
          label: string
          label_normalized: string | null
          par_total_cents: number | null
          par_updated_at: string | null
          par_updated_by: string | null
          pit: string | null
          status: Database["public"]["Enums"]["table_status"]
          type: Database["public"]["Enums"]["game_type"]
        }
        Insert: {
          casino_id: string
          created_at?: string
          game_settings_id?: string | null
          id?: string
          label: string
          label_normalized?: string | null
          par_total_cents?: number | null
          par_updated_at?: string | null
          par_updated_by?: string | null
          pit?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          type: Database["public"]["Enums"]["game_type"]
        }
        Update: {
          casino_id?: string
          created_at?: string
          game_settings_id?: string | null
          id?: string
          label?: string
          label_normalized?: string | null
          par_total_cents?: number | null
          par_updated_at?: string | null
          par_updated_by?: string | null
          pit?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          type?: Database["public"]["Enums"]["game_type"]
        }
        Relationships: [
          {
            foreignKeyName: "gaming_table_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gaming_table_game_settings_id_fkey"
            columns: ["game_settings_id"]
            isOneToOne: false
            referencedRelation: "game_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gaming_table_par_updated_by_fkey"
            columns: ["par_updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      gaming_table_settings: {
        Row: {
          active_from: string
          active_to: string | null
          casino_id: string
          id: string
          max_bet: number | null
          min_bet: number | null
          rotation_interval_minutes: number | null
          table_id: string
        }
        Insert: {
          active_from?: string
          active_to?: string | null
          casino_id: string
          id?: string
          max_bet?: number | null
          min_bet?: number | null
          rotation_interval_minutes?: number | null
          table_id: string
        }
        Update: {
          active_from?: string
          active_to?: string | null
          casino_id?: string
          id?: string
          max_bet?: number | null
          min_bet?: number | null
          rotation_interval_minutes?: number | null
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gaming_table_settings_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gaming_table_settings_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch: {
        Row: {
          attempt_count: number
          casino_id: string
          claimed_at: string | null
          claimed_by: string | null
          column_mapping: Json
          created_at: string
          created_by_staff_id: string
          file_name: string
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          last_error_at: string | null
          last_error_code: string | null
          original_file_name: string | null
          report_summary: Json | null
          status: Database["public"]["Enums"]["import_batch_status"]
          storage_path: string | null
          total_rows: number
          updated_at: string
          vendor_label: string | null
        }
        Insert: {
          attempt_count?: number
          casino_id: string
          claimed_at?: string | null
          claimed_by?: string | null
          column_mapping?: Json
          created_at?: string
          created_by_staff_id: string
          file_name: string
          heartbeat_at?: string | null
          id?: string
          idempotency_key: string
          last_error_at?: string | null
          last_error_code?: string | null
          original_file_name?: string | null
          report_summary?: Json | null
          status?: Database["public"]["Enums"]["import_batch_status"]
          storage_path?: string | null
          total_rows?: number
          updated_at?: string
          vendor_label?: string | null
        }
        Update: {
          attempt_count?: number
          casino_id?: string
          claimed_at?: string | null
          claimed_by?: string | null
          column_mapping?: Json
          created_at?: string
          created_by_staff_id?: string
          file_name?: string
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string
          last_error_at?: string | null
          last_error_code?: string | null
          original_file_name?: string | null
          report_summary?: Json | null
          status?: Database["public"]["Enums"]["import_batch_status"]
          storage_path?: string | null
          total_rows?: number
          updated_at?: string
          vendor_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      import_row: {
        Row: {
          batch_id: string
          casino_id: string
          created_at: string
          id: string
          matched_player_id: string | null
          normalized_payload: Json
          raw_row: Json
          reason_code: string | null
          reason_detail: string | null
          row_number: number
          status: Database["public"]["Enums"]["import_row_status"]
        }
        Insert: {
          batch_id: string
          casino_id: string
          created_at?: string
          id?: string
          matched_player_id?: string | null
          normalized_payload: Json
          raw_row: Json
          reason_code?: string | null
          reason_detail?: string | null
          row_number: number
          status?: Database["public"]["Enums"]["import_row_status"]
        }
        Update: {
          batch_id?: string
          casino_id?: string
          created_at?: string
          id?: string
          matched_player_id?: string | null
          normalized_payload?: Json
          raw_row?: Json
          reason_code?: string | null
          reason_detail?: string | null
          row_number?: number
          status?: Database["public"]["Enums"]["import_row_status"]
        }
        Relationships: [
          {
            foreignKeyName: "import_row_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_matched_player_id_fkey"
            columns: ["matched_player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_earn_config: {
        Row: {
          casino_id: string
          created_at: string
          default_point_multiplier: number
          effective_from: string | null
          is_active: boolean
          points_per_theo: number
          rounding_policy: string
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          default_point_multiplier?: number
          effective_from?: string | null
          is_active?: boolean
          points_per_theo?: number
          rounding_policy?: string
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          default_point_multiplier?: number
          effective_from?: string | null
          is_active?: boolean
          points_per_theo?: number
          rounding_policy?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_earn_config_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: true
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          campaign_id: string | null
          casino_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          metadata: Json
          note: string | null
          player_id: string
          points_delta: number
          rating_slip_id: string | null
          reason: Database["public"]["Enums"]["loyalty_reason"]
          source_id: string | null
          source_kind: string | null
          staff_id: string | null
          visit_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          casino_id: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          note?: string | null
          player_id: string
          points_delta: number
          rating_slip_id?: string | null
          reason: Database["public"]["Enums"]["loyalty_reason"]
          source_id?: string | null
          source_kind?: string | null
          staff_id?: string | null
          visit_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          casino_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          note?: string | null
          player_id?: string
          points_delta?: number
          rating_slip_id?: string | null
          reason?: Database["public"]["Enums"]["loyalty_reason"]
          source_id?: string | null
          source_kind?: string | null
          staff_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_rating_slip_id_fkey"
            columns: ["rating_slip_id"]
            isOneToOne: false
            referencedRelation: "rating_slip"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_outbox: {
        Row: {
          attempt_count: number
          casino_id: string
          created_at: string
          event_type: string
          id: string
          ledger_id: string | null
          payload: Json
          processed_at: string | null
        }
        Insert: {
          attempt_count?: number
          casino_id: string
          created_at?: string
          event_type: string
          id?: string
          ledger_id?: string | null
          payload: Json
          processed_at?: string | null
        }
        Update: {
          attempt_count?: number
          casino_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ledger_id?: string | null
          payload?: Json
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_outbox_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_outbox_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "loyalty_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      mtl_audit_note: {
        Row: {
          created_at: string
          id: string
          mtl_entry_id: string
          note: string
          staff_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mtl_entry_id: string
          note: string
          staff_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mtl_entry_id?: string
          note?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mtl_audit_note_mtl_entry_id_fkey"
            columns: ["mtl_entry_id"]
            isOneToOne: false
            referencedRelation: "mtl_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtl_audit_note_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      mtl_entry: {
        Row: {
          amount: number
          area: string | null
          casino_id: string
          created_at: string
          direction: string
          gaming_day: string | null
          id: string
          idempotency_key: string | null
          occurred_at: string
          patron_uuid: string
          rating_slip_id: string | null
          source: Database["public"]["Enums"]["mtl_source"]
          staff_id: string | null
          txn_type: Database["public"]["Enums"]["mtl_txn_type"]
          visit_id: string | null
        }
        Insert: {
          amount: number
          area?: string | null
          casino_id: string
          created_at?: string
          direction: string
          gaming_day?: string | null
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          patron_uuid: string
          rating_slip_id?: string | null
          source?: Database["public"]["Enums"]["mtl_source"]
          staff_id?: string | null
          txn_type?: Database["public"]["Enums"]["mtl_txn_type"]
          visit_id?: string | null
        }
        Update: {
          amount?: number
          area?: string | null
          casino_id?: string
          created_at?: string
          direction?: string
          gaming_day?: string | null
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          patron_uuid?: string
          rating_slip_id?: string | null
          source?: Database["public"]["Enums"]["mtl_source"]
          staff_id?: string | null
          txn_type?: Database["public"]["Enums"]["mtl_txn_type"]
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mtl_entry_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtl_entry_patron_uuid_fkey"
            columns: ["patron_uuid"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtl_entry_rating_slip_id_fkey"
            columns: ["rating_slip_id"]
            isOneToOne: false
            referencedRelation: "rating_slip"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtl_entry_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtl_entry_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit"
            referencedColumns: ["id"]
          },
        ]
      }
      pit_cash_observation: {
        Row: {
          amount: number
          amount_kind: Database["public"]["Enums"]["observation_amount_kind"]
          casino_id: string
          created_at: string
          created_by_staff_id: string
          direction: string
          gaming_day: string
          id: string
          idempotency_key: string | null
          note: string | null
          observed_at: string
          player_id: string
          rating_slip_id: string | null
          source: Database["public"]["Enums"]["observation_source"]
          visit_id: string
        }
        Insert: {
          amount: number
          amount_kind?: Database["public"]["Enums"]["observation_amount_kind"]
          casino_id: string
          created_at?: string
          created_by_staff_id: string
          direction?: string
          gaming_day: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          observed_at?: string
          player_id: string
          rating_slip_id?: string | null
          source?: Database["public"]["Enums"]["observation_source"]
          visit_id: string
        }
        Update: {
          amount?: number
          amount_kind?: Database["public"]["Enums"]["observation_amount_kind"]
          casino_id?: string
          created_at?: string
          created_by_staff_id?: string
          direction?: string
          gaming_day?: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          observed_at?: string
          player_id?: string
          rating_slip_id?: string | null
          source?: Database["public"]["Enums"]["observation_source"]
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pit_cash_observation_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pit_cash_observation_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pit_cash_observation_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pit_cash_observation_rating_slip_id_fkey"
            columns: ["rating_slip_id"]
            isOneToOne: false
            referencedRelation: "rating_slip"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pit_cash_observation_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit"
            referencedColumns: ["id"]
          },
        ]
      }
      player: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          phone_number: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          middle_name?: string | null
          phone_number?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          phone_number?: string | null
        }
        Relationships: []
      }
      player_casino: {
        Row: {
          casino_id: string
          enrolled_at: string
          enrolled_by: string | null
          player_id: string
          status: string
        }
        Insert: {
          casino_id: string
          enrolled_at?: string
          enrolled_by?: string | null
          player_id: string
          status?: string
        }
        Update: {
          casino_id?: string
          enrolled_at?: string
          enrolled_by?: string | null
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_casino_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_casino_enrolled_by_fkey"
            columns: ["enrolled_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_casino_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      player_financial_transaction: {
        Row: {
          amount: number
          casino_id: string
          created_at: string
          created_by_staff_id: string | null
          direction: Database["public"]["Enums"]["financial_direction"] | null
          external_ref: string | null
          gaming_day: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          player_id: string
          rating_slip_id: string | null
          reason_code:
            | Database["public"]["Enums"]["adjustment_reason_code"]
            | null
          related_transaction_id: string | null
          source: Database["public"]["Enums"]["financial_source"] | null
          tender_type: string | null
          txn_kind: Database["public"]["Enums"]["financial_txn_kind"]
          visit_id: string
        }
        Insert: {
          amount: number
          casino_id: string
          created_at?: string
          created_by_staff_id?: string | null
          direction?: Database["public"]["Enums"]["financial_direction"] | null
          external_ref?: string | null
          gaming_day?: string | null
          id?: string
          idempotency_key?: string | null
          note?: string | null
          player_id: string
          rating_slip_id?: string | null
          reason_code?:
            | Database["public"]["Enums"]["adjustment_reason_code"]
            | null
          related_transaction_id?: string | null
          source?: Database["public"]["Enums"]["financial_source"] | null
          tender_type?: string | null
          txn_kind?: Database["public"]["Enums"]["financial_txn_kind"]
          visit_id: string
        }
        Update: {
          amount?: number
          casino_id?: string
          created_at?: string
          created_by_staff_id?: string | null
          direction?: Database["public"]["Enums"]["financial_direction"] | null
          external_ref?: string | null
          gaming_day?: string | null
          id?: string
          idempotency_key?: string | null
          note?: string | null
          player_id?: string
          rating_slip_id?: string | null
          reason_code?:
            | Database["public"]["Enums"]["adjustment_reason_code"]
            | null
          related_transaction_id?: string | null
          source?: Database["public"]["Enums"]["financial_source"] | null
          tender_type?: string | null
          txn_kind?: Database["public"]["Enums"]["financial_txn_kind"]
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_financial_transaction_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_financial_transaction_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_financial_transaction_rating_slip_id_fkey"
            columns: ["rating_slip_id"]
            isOneToOne: false
            referencedRelation: "rating_slip"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_financial_transaction_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit"
            referencedColumns: ["id"]
          },
        ]
      }
      player_identity: {
        Row: {
          address: Json | null
          birth_date: string | null
          casino_id: string
          created_at: string
          created_by: string
          document_number_hash: string | null
          document_number_last4: string | null
          document_type: string | null
          expiration_date: string | null
          eye_color: string | null
          gender: string | null
          height: string | null
          id: string
          issue_date: string | null
          issuing_state: string | null
          player_id: string
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
          weight: string | null
        }
        Insert: {
          address?: Json | null
          birth_date?: string | null
          casino_id: string
          created_at?: string
          created_by: string
          document_number_hash?: string | null
          document_number_last4?: string | null
          document_type?: string | null
          expiration_date?: string | null
          eye_color?: string | null
          gender?: string | null
          height?: string | null
          id?: string
          issue_date?: string | null
          issuing_state?: string | null
          player_id: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          weight?: string | null
        }
        Update: {
          address?: Json | null
          birth_date?: string | null
          casino_id?: string
          created_at?: string
          created_by?: string
          document_number_hash?: string | null
          document_number_last4?: string | null
          document_type?: string | null
          expiration_date?: string | null
          eye_color?: string | null
          gender?: string | null
          height?: string | null
          id?: string
          issue_date?: string | null
          issuing_state?: string | null
          player_id?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_player_identity_enrollment"
            columns: ["casino_id", "player_id"]
            isOneToOne: true
            referencedRelation: "player_casino"
            referencedColumns: ["casino_id", "player_id"]
          },
          {
            foreignKeyName: "player_identity_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      player_loyalty: {
        Row: {
          casino_id: string
          current_balance: number
          player_id: string
          preferences: Json
          tier: string | null
          updated_at: string
        }
        Insert: {
          casino_id: string
          current_balance?: number
          player_id: string
          preferences?: Json
          tier?: string | null
          updated_at?: string
        }
        Update: {
          casino_id?: string
          current_balance?: number
          player_id?: string
          preferences?: Json
          tier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_loyalty_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_loyalty_player_casino_fk"
            columns: ["player_id", "casino_id"]
            isOneToOne: true
            referencedRelation: "player_casino"
            referencedColumns: ["player_id", "casino_id"]
          },
          {
            foreignKeyName: "player_loyalty_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      player_note: {
        Row: {
          casino_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          player_id: string
          visibility: string
        }
        Insert: {
          casino_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          player_id: string
          visibility?: string
        }
        Update: {
          casino_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          player_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_note_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_note_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_note_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      player_tag: {
        Row: {
          applied_by: string
          casino_id: string
          created_at: string
          id: string
          player_id: string
          removed_at: string | null
          removed_by: string | null
          tag_category: string
          tag_name: string
        }
        Insert: {
          applied_by: string
          casino_id: string
          created_at?: string
          id?: string
          player_id: string
          removed_at?: string | null
          removed_by?: string | null
          tag_category?: string
          tag_name: string
        }
        Update: {
          applied_by?: string
          casino_id?: string
          created_at?: string
          id?: string
          player_id?: string
          removed_at?: string | null
          removed_by?: string | null
          tag_category?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_tag_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tag_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tag_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tag_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_coupon: {
        Row: {
          casino_id: string
          cleared_at: string | null
          correlation_id: string | null
          expires_at: string | null
          face_value_amount: number
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_staff_id: string
          player_id: string | null
          promo_program_id: string
          replaced_at: string | null
          replaced_by_staff_id: string | null
          replacement_coupon_id: string | null
          required_match_wager_amount: number
          status: Database["public"]["Enums"]["promo_coupon_status"]
          validation_number: string
          visit_id: string | null
          voided_at: string | null
          voided_by_staff_id: string | null
        }
        Insert: {
          casino_id: string
          cleared_at?: string | null
          correlation_id?: string | null
          expires_at?: string | null
          face_value_amount: number
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by_staff_id: string
          player_id?: string | null
          promo_program_id: string
          replaced_at?: string | null
          replaced_by_staff_id?: string | null
          replacement_coupon_id?: string | null
          required_match_wager_amount: number
          status?: Database["public"]["Enums"]["promo_coupon_status"]
          validation_number: string
          visit_id?: string | null
          voided_at?: string | null
          voided_by_staff_id?: string | null
        }
        Update: {
          casino_id?: string
          cleared_at?: string | null
          correlation_id?: string | null
          expires_at?: string | null
          face_value_amount?: number
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by_staff_id?: string
          player_id?: string | null
          promo_program_id?: string
          replaced_at?: string | null
          replaced_by_staff_id?: string | null
          replacement_coupon_id?: string | null
          required_match_wager_amount?: number
          status?: Database["public"]["Enums"]["promo_coupon_status"]
          validation_number?: string
          visit_id?: string | null
          voided_at?: string | null
          voided_by_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_coupon_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_coupon_issued_by_staff_id_fkey"
            columns: ["issued_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_coupon_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_coupon_promo_program_id_fkey"
            columns: ["promo_program_id"]
            isOneToOne: false
            referencedRelation: "promo_program"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_coupon_replaced_by_staff_id_fkey"
            columns: ["replaced_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_coupon_replacement_coupon_id_fkey"
            columns: ["replacement_coupon_id"]
            isOneToOne: false
            referencedRelation: "promo_coupon"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_coupon_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_coupon_voided_by_staff_id_fkey"
            columns: ["voided_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_program: {
        Row: {
          casino_id: string
          created_at: string
          created_by_staff_id: string | null
          end_at: string | null
          face_value_amount: number
          id: string
          name: string
          promo_type: Database["public"]["Enums"]["promo_type_enum"]
          required_match_wager_amount: number
          start_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by_staff_id?: string | null
          end_at?: string | null
          face_value_amount: number
          id?: string
          name: string
          promo_type: Database["public"]["Enums"]["promo_type_enum"]
          required_match_wager_amount: number
          start_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by_staff_id?: string | null
          end_at?: string | null
          face_value_amount?: number
          id?: string
          name?: string
          promo_type?: Database["public"]["Enums"]["promo_type_enum"]
          required_match_wager_amount?: number
          start_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_program_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_program_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_slip: {
        Row: {
          accrual_kind: string
          accumulated_seconds: number
          average_bet: number | null
          casino_id: string
          duration_seconds: number | null
          end_time: string | null
          final_average_bet: number | null
          final_duration_seconds: number | null
          game_settings: Json | null
          id: string
          move_group_id: string | null
          pause_intervals: unknown[] | null
          policy_snapshot: Json | null
          previous_slip_id: string | null
          seat_number: string | null
          start_time: string
          status: Database["public"]["Enums"]["rating_slip_status"]
          table_id: string
          visit_id: string
        }
        Insert: {
          accrual_kind?: string
          accumulated_seconds?: number
          average_bet?: number | null
          casino_id: string
          duration_seconds?: number | null
          end_time?: string | null
          final_average_bet?: number | null
          final_duration_seconds?: number | null
          game_settings?: Json | null
          id?: string
          move_group_id?: string | null
          pause_intervals?: unknown[] | null
          policy_snapshot?: Json | null
          previous_slip_id?: string | null
          seat_number?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["rating_slip_status"]
          table_id: string
          visit_id: string
        }
        Update: {
          accrual_kind?: string
          accumulated_seconds?: number
          average_bet?: number | null
          casino_id?: string
          duration_seconds?: number | null
          end_time?: string | null
          final_average_bet?: number | null
          final_duration_seconds?: number | null
          game_settings?: Json | null
          id?: string
          move_group_id?: string | null
          pause_intervals?: unknown[] | null
          policy_snapshot?: Json | null
          previous_slip_id?: string | null
          seat_number?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["rating_slip_status"]
          table_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_slip_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_slip_previous_slip_id_fkey"
            columns: ["previous_slip_id"]
            isOneToOne: false
            referencedRelation: "rating_slip"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_slip_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_slip_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_slip_pause: {
        Row: {
          casino_id: string
          created_by: string | null
          ended_at: string | null
          id: string
          rating_slip_id: string
          started_at: string
        }
        Insert: {
          casino_id: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          rating_slip_id: string
          started_at?: string
        }
        Update: {
          casino_id?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          rating_slip_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_slip_pause_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_slip_pause_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_slip_pause_rating_slip_id_fkey"
            columns: ["rating_slip_id"]
            isOneToOne: false
            referencedRelation: "rating_slip"
            referencedColumns: ["id"]
          },
        ]
      }
      report: {
        Row: {
          casino_id: string | null
          generated_at: string
          id: string
          name: string
          payload: Json
        }
        Insert: {
          casino_id?: string | null
          generated_at?: string
          id?: string
          name: string
          payload: Json
        }
        Update: {
          casino_id?: string | null
          generated_at?: string
          id?: string
          name?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_catalog: {
        Row: {
          casino_id: string
          code: string
          created_at: string
          family: Database["public"]["Enums"]["reward_family"]
          fulfillment: string | null
          id: string
          is_active: boolean
          kind: string
          metadata: Json
          name: string
          ui_tags: string[] | null
          updated_at: string
        }
        Insert: {
          casino_id: string
          code: string
          created_at?: string
          family: Database["public"]["Enums"]["reward_family"]
          fulfillment?: string | null
          id?: string
          is_active?: boolean
          kind: string
          metadata?: Json
          name: string
          ui_tags?: string[] | null
          updated_at?: string
        }
        Update: {
          casino_id?: string
          code?: string
          created_at?: string
          family?: Database["public"]["Enums"]["reward_family"]
          fulfillment?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          metadata?: Json
          name?: string
          ui_tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_catalog_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_eligibility: {
        Row: {
          casino_id: string
          id: string
          max_tier: string | null
          min_points_balance: number | null
          min_tier: string | null
          reward_id: string
          visit_kinds: string[] | null
        }
        Insert: {
          casino_id: string
          id?: string
          max_tier?: string | null
          min_points_balance?: number | null
          min_tier?: string | null
          reward_id: string
          visit_kinds?: string[] | null
        }
        Update: {
          casino_id?: string
          id?: string
          max_tier?: string | null
          min_points_balance?: number | null
          min_tier?: string | null
          reward_id?: string
          visit_kinds?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_eligibility_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_eligibility_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_entitlement_tier: {
        Row: {
          benefit: Json
          casino_id: string
          id: string
          reward_id: string
          tier: string
        }
        Insert: {
          benefit: Json
          casino_id: string
          id?: string
          reward_id: string
          tier: string
        }
        Update: {
          benefit?: Json
          casino_id?: string
          id?: string
          reward_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_entitlement_tier_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_entitlement_tier_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_limits: {
        Row: {
          casino_id: string
          cooldown_minutes: number | null
          id: string
          max_issues: number
          requires_note: boolean
          reward_id: string
          scope: string
        }
        Insert: {
          casino_id: string
          cooldown_minutes?: number | null
          id?: string
          max_issues?: number
          requires_note?: boolean
          reward_id: string
          scope: string
        }
        Update: {
          casino_id?: string
          cooldown_minutes?: number | null
          id?: string
          max_issues?: number
          requires_note?: boolean
          reward_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_limits_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_limits_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_price_points: {
        Row: {
          allow_overdraw: boolean
          casino_id: string
          points_cost: number
          reward_id: string
        }
        Insert: {
          allow_overdraw?: boolean
          casino_id: string
          points_cost: number
          reward_id: string
        }
        Update: {
          allow_overdraw?: boolean
          casino_id?: string
          points_cost?: number
          reward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_price_points_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_price_points_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: true
            referencedRelation: "reward_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_checkpoint: {
        Row: {
          cash_out_observed_cents: number
          casino_id: string
          checkpoint_scope: string
          checkpoint_type: string
          created_at: string
          created_by: string | null
          credits_total_cents: number
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string | null
          grind_buyin_cents: number
          id: string
          notes: string | null
          pit_id: string | null
          rated_buyin_cents: number
          tables_active: number
          tables_with_coverage: number
          win_loss_cents: number | null
          window_end: string
          window_start: string
        }
        Insert: {
          cash_out_observed_cents?: number
          casino_id: string
          checkpoint_scope?: string
          checkpoint_type: string
          created_at?: string
          created_by?: string | null
          credits_total_cents?: number
          drop_total_cents?: number | null
          fills_total_cents?: number
          gaming_day: string
          gaming_table_id?: string | null
          grind_buyin_cents?: number
          id?: string
          notes?: string | null
          pit_id?: string | null
          rated_buyin_cents?: number
          tables_active?: number
          tables_with_coverage?: number
          win_loss_cents?: number | null
          window_end: string
          window_start: string
        }
        Update: {
          cash_out_observed_cents?: number
          casino_id?: string
          checkpoint_scope?: string
          checkpoint_type?: string
          created_at?: string
          created_by?: string | null
          credits_total_cents?: number
          drop_total_cents?: number | null
          fills_total_cents?: number
          gaming_day?: string
          gaming_table_id?: string | null
          grind_buyin_cents?: number
          id?: string
          notes?: string | null
          pit_id?: string | null
          rated_buyin_cents?: number
          tables_active?: number
          tables_with_coverage?: number
          win_loss_cents?: number | null
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_checkpoint_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_checkpoint_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_checkpoint_gaming_table_id_fkey"
            columns: ["gaming_table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          casino_id: string
          created_at: string
          email: string | null
          employee_id: string | null
          first_name: string
          id: string
          last_name: string
          pin_hash: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status: Database["public"]["Enums"]["staff_status"]
          user_id: string | null
        }
        Insert: {
          casino_id: string
          created_at?: string
          email?: string | null
          employee_id?: string | null
          first_name: string
          id?: string
          last_name: string
          pin_hash?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          user_id?: string | null
        }
        Update: {
          casino_id?: string
          created_at?: string
          email?: string | null
          employee_id?: string | null
          first_name?: string
          id?: string
          last_name?: string
          pin_hash?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invite: {
        Row: {
          accepted_at: string | null
          casino_id: string
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          staff_role: Database["public"]["Enums"]["staff_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          casino_id: string
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          staff_role: Database["public"]["Enums"]["staff_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          casino_id?: string
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          staff_role?: Database["public"]["Enums"]["staff_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invite_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invite_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pin_attempts: {
        Row: {
          attempt_count: number
          casino_id: string
          created_at: string
          id: string
          last_attempt_at: string
          staff_id: string
          window_start: string
        }
        Insert: {
          attempt_count?: number
          casino_id: string
          created_at?: string
          id?: string
          last_attempt_at?: string
          staff_id: string
          window_start: string
        }
        Update: {
          attempt_count?: number
          casino_id?: string
          created_at?: string
          id?: string
          last_attempt_at?: string
          staff_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pin_attempts_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_pin_attempts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      table_buyin_telemetry: {
        Row: {
          actor_id: string
          amount_cents: number
          casino_id: string
          created_at: string
          gaming_day: string
          id: string
          idempotency_key: string | null
          note: string | null
          occurred_at: string
          rating_slip_id: string | null
          source: string | null
          table_id: string
          telemetry_kind: string
          tender_type: string | null
          visit_id: string | null
        }
        Insert: {
          actor_id: string
          amount_cents: number
          casino_id: string
          created_at?: string
          gaming_day: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          occurred_at?: string
          rating_slip_id?: string | null
          source?: string | null
          table_id: string
          telemetry_kind: string
          tender_type?: string | null
          visit_id?: string | null
        }
        Update: {
          actor_id?: string
          amount_cents?: number
          casino_id?: string
          created_at?: string
          gaming_day?: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          occurred_at?: string
          rating_slip_id?: string | null
          source?: string | null
          table_id?: string
          telemetry_kind?: string
          tender_type?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_buyin_telemetry_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_buyin_telemetry_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_buyin_telemetry_rating_slip_id_fkey"
            columns: ["rating_slip_id"]
            isOneToOne: false
            referencedRelation: "rating_slip"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_buyin_telemetry_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_buyin_telemetry_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visit"
            referencedColumns: ["id"]
          },
        ]
      }
      table_credit: {
        Row: {
          amount_cents: number
          authorized_by: string | null
          casino_id: string
          chipset: Json
          confirmed_amount_cents: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          discrepancy_note: string | null
          id: string
          received_by: string | null
          request_id: string
          sent_by: string | null
          session_id: string | null
          slip_no: string | null
          status: string
          table_id: string
        }
        Insert: {
          amount_cents: number
          authorized_by?: string | null
          casino_id: string
          chipset: Json
          confirmed_amount_cents?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          discrepancy_note?: string | null
          id?: string
          received_by?: string | null
          request_id: string
          sent_by?: string | null
          session_id?: string | null
          slip_no?: string | null
          status?: string
          table_id: string
        }
        Update: {
          amount_cents?: number
          authorized_by?: string | null
          casino_id?: string
          chipset?: Json
          confirmed_amount_cents?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          discrepancy_note?: string | null
          id?: string
          received_by?: string | null
          request_id?: string
          sent_by?: string | null
          session_id?: string | null
          slip_no?: string | null
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_credit_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_credit_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_credit_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_credit_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_credit_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_credit_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_session"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_credit_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
        ]
      }
      table_drop_event: {
        Row: {
          cage_received_at: string | null
          cage_received_by: string | null
          casino_id: string
          delivered_at: string | null
          delivered_scan_at: string | null
          drop_box_id: string
          gaming_day: string | null
          id: string
          note: string | null
          removed_at: string
          removed_by: string | null
          seal_no: string | null
          seq_no: number | null
          table_id: string
          witnessed_by: string | null
        }
        Insert: {
          cage_received_at?: string | null
          cage_received_by?: string | null
          casino_id: string
          delivered_at?: string | null
          delivered_scan_at?: string | null
          drop_box_id: string
          gaming_day?: string | null
          id?: string
          note?: string | null
          removed_at?: string
          removed_by?: string | null
          seal_no?: string | null
          seq_no?: number | null
          table_id: string
          witnessed_by?: string | null
        }
        Update: {
          cage_received_at?: string | null
          cage_received_by?: string | null
          casino_id?: string
          delivered_at?: string | null
          delivered_scan_at?: string | null
          drop_box_id?: string
          gaming_day?: string | null
          id?: string
          note?: string | null
          removed_at?: string
          removed_by?: string | null
          seal_no?: string | null
          seq_no?: number | null
          table_id?: string
          witnessed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_drop_event_cage_received_by_fkey"
            columns: ["cage_received_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_drop_event_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_drop_event_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_drop_event_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_drop_event_witnessed_by_fkey"
            columns: ["witnessed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      table_fill: {
        Row: {
          amount_cents: number
          casino_id: string
          chipset: Json
          confirmed_amount_cents: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          delivered_by: string | null
          discrepancy_note: string | null
          id: string
          received_by: string | null
          request_id: string
          requested_by: string | null
          session_id: string | null
          slip_no: string | null
          status: string
          table_id: string
        }
        Insert: {
          amount_cents: number
          casino_id: string
          chipset: Json
          confirmed_amount_cents?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          delivered_by?: string | null
          discrepancy_note?: string | null
          id?: string
          received_by?: string | null
          request_id: string
          requested_by?: string | null
          session_id?: string | null
          slip_no?: string | null
          status?: string
          table_id: string
        }
        Update: {
          amount_cents?: number
          casino_id?: string
          chipset?: Json
          confirmed_amount_cents?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          delivered_by?: string | null
          discrepancy_note?: string | null
          id?: string
          received_by?: string | null
          request_id?: string
          requested_by?: string | null
          session_id?: string | null
          slip_no?: string | null
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_fill_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_fill_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_fill_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_fill_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_fill_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_fill_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_session"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_fill_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
        ]
      }
      table_inventory_snapshot: {
        Row: {
          casino_id: string
          chipset: Json
          counted_by: string | null
          created_at: string
          discrepancy_cents: number | null
          id: string
          note: string | null
          session_id: string | null
          snapshot_type: string
          table_id: string
          total_cents: number | null
          verified_by: string | null
        }
        Insert: {
          casino_id: string
          chipset: Json
          counted_by?: string | null
          created_at?: string
          discrepancy_cents?: number | null
          id?: string
          note?: string | null
          session_id?: string | null
          snapshot_type: string
          table_id: string
          total_cents?: number | null
          verified_by?: string | null
        }
        Update: {
          casino_id?: string
          chipset?: Json
          counted_by?: string | null
          created_at?: string
          discrepancy_cents?: number | null
          id?: string
          note?: string | null
          session_id?: string | null
          snapshot_type?: string
          table_id?: string
          total_cents?: number | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_inventory_snapshot_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_inventory_snapshot_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_inventory_snapshot_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_session"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_inventory_snapshot_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_inventory_snapshot_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      table_rundown_report: {
        Row: {
          casino_id: string
          closing_bankroll_cents: number | null
          closing_snapshot_id: string | null
          computation_grade: string
          computed_at: string
          computed_by: string | null
          created_at: string
          credits_total_cents: number
          drop_event_id: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          finalized_at: string | null
          finalized_by: string | null
          gaming_day: string
          gaming_table_id: string
          has_late_events: boolean
          id: string
          notes: string | null
          opening_bankroll_cents: number | null
          opening_snapshot_id: string | null
          opening_source: string
          par_target_cents: number | null
          table_session_id: string
          table_win_cents: number | null
          variance_from_par_cents: number | null
        }
        Insert: {
          casino_id: string
          closing_bankroll_cents?: number | null
          closing_snapshot_id?: string | null
          computation_grade?: string
          computed_at?: string
          computed_by?: string | null
          created_at?: string
          credits_total_cents?: number
          drop_event_id?: string | null
          drop_total_cents?: number | null
          fills_total_cents?: number
          finalized_at?: string | null
          finalized_by?: string | null
          gaming_day: string
          gaming_table_id: string
          has_late_events?: boolean
          id?: string
          notes?: string | null
          opening_bankroll_cents?: number | null
          opening_snapshot_id?: string | null
          opening_source: string
          par_target_cents?: number | null
          table_session_id: string
          table_win_cents?: number | null
          variance_from_par_cents?: number | null
        }
        Update: {
          casino_id?: string
          closing_bankroll_cents?: number | null
          closing_snapshot_id?: string | null
          computation_grade?: string
          computed_at?: string
          computed_by?: string | null
          created_at?: string
          credits_total_cents?: number
          drop_event_id?: string | null
          drop_total_cents?: number | null
          fills_total_cents?: number
          finalized_at?: string | null
          finalized_by?: string | null
          gaming_day?: string
          gaming_table_id?: string
          has_late_events?: boolean
          id?: string
          notes?: string | null
          opening_bankroll_cents?: number | null
          opening_snapshot_id?: string | null
          opening_source?: string
          par_target_cents?: number | null
          table_session_id?: string
          table_win_cents?: number | null
          variance_from_par_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "table_rundown_report_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_rundown_report_closing_snapshot_id_fkey"
            columns: ["closing_snapshot_id"]
            isOneToOne: false
            referencedRelation: "table_inventory_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_rundown_report_computed_by_fkey"
            columns: ["computed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_rundown_report_drop_event_id_fkey"
            columns: ["drop_event_id"]
            isOneToOne: false
            referencedRelation: "table_drop_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_rundown_report_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_rundown_report_gaming_table_id_fkey"
            columns: ["gaming_table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_rundown_report_opening_snapshot_id_fkey"
            columns: ["opening_snapshot_id"]
            isOneToOne: false
            referencedRelation: "table_inventory_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_rundown_report_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_session"
            referencedColumns: ["id"]
          },
        ]
      }
      table_session: {
        Row: {
          activated_by_staff_id: string | null
          casino_id: string
          close_note: string | null
          close_reason: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at: string | null
          closed_by_staff_id: string | null
          closing_inventory_snapshot_id: string | null
          created_at: string
          credits_total_cents: number
          crossed_gaming_day: boolean
          drop_event_id: string | null
          drop_posted_at: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string
          has_unresolved_items: boolean
          id: string
          metadata: Json | null
          need_total_cents: number | null
          notes: string | null
          opened_at: string
          opened_by_staff_id: string
          opening_inventory_snapshot_id: string | null
          paused_by_staff_id: string | null
          requires_reconciliation: boolean
          resumed_by_staff_id: string | null
          rolled_over_by_staff_id: string | null
          rundown_started_at: string | null
          rundown_started_by_staff_id: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"] | null
          updated_at: string
        }
        Insert: {
          activated_by_staff_id?: string | null
          casino_id: string
          close_note?: string | null
          close_reason?: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at?: string | null
          closed_by_staff_id?: string | null
          closing_inventory_snapshot_id?: string | null
          created_at?: string
          credits_total_cents?: number
          crossed_gaming_day?: boolean
          drop_event_id?: string | null
          drop_posted_at?: string | null
          drop_total_cents?: number | null
          fills_total_cents?: number
          gaming_day: string
          gaming_table_id: string
          has_unresolved_items?: boolean
          id?: string
          metadata?: Json | null
          need_total_cents?: number | null
          notes?: string | null
          opened_at?: string
          opened_by_staff_id: string
          opening_inventory_snapshot_id?: string | null
          paused_by_staff_id?: string | null
          requires_reconciliation?: boolean
          resumed_by_staff_id?: string | null
          rolled_over_by_staff_id?: string | null
          rundown_started_at?: string | null
          rundown_started_by_staff_id?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode?:
            | Database["public"]["Enums"]["table_bank_mode"]
            | null
          updated_at?: string
        }
        Update: {
          activated_by_staff_id?: string | null
          casino_id?: string
          close_note?: string | null
          close_reason?: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at?: string | null
          closed_by_staff_id?: string | null
          closing_inventory_snapshot_id?: string | null
          created_at?: string
          credits_total_cents?: number
          crossed_gaming_day?: boolean
          drop_event_id?: string | null
          drop_posted_at?: string | null
          drop_total_cents?: number | null
          fills_total_cents?: number
          gaming_day?: string
          gaming_table_id?: string
          has_unresolved_items?: boolean
          id?: string
          metadata?: Json | null
          need_total_cents?: number | null
          notes?: string | null
          opened_at?: string
          opened_by_staff_id?: string
          opening_inventory_snapshot_id?: string | null
          paused_by_staff_id?: string | null
          requires_reconciliation?: boolean
          resumed_by_staff_id?: string | null
          rolled_over_by_staff_id?: string | null
          rundown_started_at?: string | null
          rundown_started_by_staff_id?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode?:
            | Database["public"]["Enums"]["table_bank_mode"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_session_activated_by_staff_id_fkey"
            columns: ["activated_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_closed_by_staff_id_fkey"
            columns: ["closed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_gaming_table_id_fkey"
            columns: ["gaming_table_id"]
            isOneToOne: false
            referencedRelation: "gaming_table"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_opened_by_staff_id_fkey"
            columns: ["opened_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_paused_by_staff_id_fkey"
            columns: ["paused_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_resumed_by_staff_id_fkey"
            columns: ["resumed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_rolled_over_by_staff_id_fkey"
            columns: ["rolled_over_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_rundown_started_by_staff_id_fkey"
            columns: ["rundown_started_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      visit: {
        Row: {
          casino_id: string
          ended_at: string | null
          gaming_day: string
          id: string
          player_id: string | null
          started_at: string
          visit_group_id: string
          visit_kind: Database["public"]["Enums"]["visit_kind"]
        }
        Insert: {
          casino_id: string
          ended_at?: string | null
          gaming_day: string
          id?: string
          player_id?: string | null
          started_at?: string
          visit_group_id: string
          visit_kind?: Database["public"]["Enums"]["visit_kind"]
        }
        Update: {
          casino_id?: string
          ended_at?: string | null
          gaming_day?: string
          id?: string
          player_id?: string | null
          started_at?: string
          visit_group_id?: string
          visit_kind?: Database["public"]["Enums"]["visit_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "visit_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mtl_gaming_day_summary: {
        Row: {
          casino_id: string | null
          count_in: number | null
          count_out: number | null
          entry_count: number | null
          first_in_at: string | null
          first_out_at: string | null
          gaming_day: string | null
          last_in_at: string | null
          last_out_at: string | null
          max_single_in: number | null
          max_single_out: number | null
          patron_date_of_birth: string | null
          patron_first_name: string | null
          patron_last_name: string | null
          patron_uuid: string | null
          total_in: number | null
          total_out: number | null
          total_volume: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mtl_entry_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtl_entry_patron_uuid_fkey"
            columns: ["patron_uuid"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_loyalty_balance_reconciliation: {
        Row: {
          casino_id: string | null
          entry_count: number | null
          last_entry_at: string | null
          ledger_balance: number | null
          player_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_financial_summary: {
        Row: {
          casino_id: string | null
          event_count: number | null
          first_transaction_at: string | null
          last_transaction_at: string | null
          net_amount: number | null
          total_in: number | null
          total_out: number | null
          visit_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _persist_inline_rundown: {
        Args: {
          p_actor_id: string
          p_casino_id: string
          p_override_drop_event_id?: string
          p_session: Database["public"]["Tables"]["table_session"]["Row"]
          p_session_id: string
        }
        Returns: undefined
      }
      calculate_theo_from_snapshot: {
        Args: {
          p_loyalty_snapshot: Json
          p_slip_record: Record<string, unknown>
        }
        Returns: number
      }
      chipset_total_cents: { Args: { p_chipset: Json }; Returns: number }
      compute_gaming_day:
        | {
            Args: { p_casino_id: string; p_timestamp?: string }
            Returns: string
          }
        | {
            Args: { p_gaming_day_start: string; p_ts: string }
            Returns: string
          }
      compute_gaming_day_for_casino: {
        Args: { p_ts?: string }
        Returns: string
      }
      compute_slip_final_seconds: {
        Args: { p_slip_id: string }
        Returns: number
      }
      evaluate_mid_session_reward_policy: {
        Args: {
          p_average_bet: number
          p_minutes_played: number
          p_policy: Json
        }
        Returns: {
          eligible: boolean
          recommended_points: number
        }[]
      }
      evaluate_session_reward_suggestion: {
        Args: { p_as_of_ts?: string; p_rating_slip_id: string }
        Returns: {
          max_recommended_points: number
          notes: string
          policy_version: string
          suggested_points: number
          suggested_theo: number
        }[]
      }
      get_visit_cash_in_with_adjustments: {
        Args: { p_visit_id: string }
        Returns: {
          adjustment_count: number
          adjustment_total: number
          net_total: number
          original_total: number
        }[]
      }
      rpc_accept_staff_invite: {
        Args: { p_token: string }
        Returns: {
          casino_id: string
          staff_id: string
          staff_role: string
        }[]
      }
      rpc_accrue_on_close: {
        Args: {
          p_casino_id: string
          p_idempotency_key: string
          p_rating_slip_id: string
        }
        Returns: {
          balance_after: number
          is_existing: boolean
          ledger_id: string
          points_delta: number
          theo: number
        }[]
      }
      rpc_acknowledge_drop_received: {
        Args: { p_drop_event_id: string }
        Returns: {
          cage_received_at: string | null
          cage_received_by: string | null
          casino_id: string
          delivered_at: string | null
          delivered_scan_at: string | null
          drop_box_id: string
          gaming_day: string | null
          id: string
          note: string | null
          removed_at: string
          removed_by: string | null
          seal_no: string | null
          seq_no: number | null
          table_id: string
          witnessed_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "table_drop_event"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_activate_floor_layout: {
        Args: {
          p_casino_id: string
          p_layout_version_id: string
          p_request_id: string
        }
        Returns: {
          activated_at: string
          activated_by: string
          activation_request_id: string
          casino_id: string
          deactivated_at: string | null
          id: string
          layout_version_id: string
        }
        SetofOptions: {
          from: "*"
          to: "floor_layout_activation"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_apply_promotion: {
        Args: {
          p_bonus_points?: number
          p_campaign_id: string
          p_casino_id: string
          p_idempotency_key?: string
          p_promo_multiplier?: number
          p_rating_slip_id: string
        }
        Returns: {
          balance_after: number
          is_existing: boolean
          ledger_id: string
          points_delta: number
        }[]
      }
      rpc_bootstrap_casino: {
        Args: {
          p_casino_name: string
          p_gaming_day_start?: string
          p_timezone?: string
        }
        Returns: {
          casino_id: string
          staff_id: string
          staff_role: string
        }[]
      }
      rpc_check_table_seat_availability: {
        Args: { p_seat_number: number; p_table_id: string }
        Returns: Json
      }
      rpc_clear_pin_attempts: { Args: never; Returns: undefined }
      rpc_close_rating_slip: {
        Args: {
          p_average_bet?: number
          p_casino_id: string
          p_rating_slip_id: string
        }
        Returns: {
          duration_seconds: number
          slip: Database["public"]["Tables"]["rating_slip"]["Row"]
        }[]
      }
      rpc_close_table_session: {
        Args: {
          p_close_note?: string
          p_close_reason?: Database["public"]["Enums"]["close_reason_type"]
          p_closing_inventory_snapshot_id?: string
          p_drop_event_id?: string
          p_notes?: string
          p_table_session_id: string
        }
        Returns: {
          activated_by_staff_id: string | null
          casino_id: string
          close_note: string | null
          close_reason: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at: string | null
          closed_by_staff_id: string | null
          closing_inventory_snapshot_id: string | null
          created_at: string
          credits_total_cents: number
          crossed_gaming_day: boolean
          drop_event_id: string | null
          drop_posted_at: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string
          has_unresolved_items: boolean
          id: string
          metadata: Json | null
          need_total_cents: number | null
          notes: string | null
          opened_at: string
          opened_by_staff_id: string
          opening_inventory_snapshot_id: string | null
          paused_by_staff_id: string | null
          requires_reconciliation: boolean
          resumed_by_staff_id: string | null
          rolled_over_by_staff_id: string | null
          rundown_started_at: string | null
          rundown_started_by_staff_id: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"] | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_session"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_complete_casino_setup: { Args: { p_skip?: boolean }; Returns: Json }
      rpc_compute_table_rundown: {
        Args: { p_session_id: string }
        Returns: {
          closing_total_cents: number
          credits_total_cents: number
          drop_posted_at: string
          drop_total_cents: number
          fills_total_cents: number
          need_total_cents: number
          opening_total_cents: number
          session_id: string
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"]
          table_win_cents: number
        }[]
      }
      rpc_confirm_table_credit: {
        Args: {
          p_confirmed_amount_cents: number
          p_credit_id: string
          p_discrepancy_note?: string
        }
        Returns: {
          amount_cents: number
          authorized_by: string | null
          casino_id: string
          chipset: Json
          confirmed_amount_cents: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          discrepancy_note: string | null
          id: string
          received_by: string | null
          request_id: string
          sent_by: string | null
          session_id: string | null
          slip_no: string | null
          status: string
          table_id: string
        }
        SetofOptions: {
          from: "*"
          to: "table_credit"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_confirm_table_fill: {
        Args: {
          p_confirmed_amount_cents: number
          p_discrepancy_note?: string
          p_fill_id: string
        }
        Returns: {
          amount_cents: number
          casino_id: string
          chipset: Json
          confirmed_amount_cents: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          delivered_by: string | null
          discrepancy_note: string | null
          id: string
          received_by: string | null
          request_id: string
          requested_by: string | null
          session_id: string | null
          slip_no: string | null
          status: string
          table_id: string
        }
        SetofOptions: {
          from: "*"
          to: "table_fill"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_financial_adjustment: {
        Args: {
          p_casino_id: string
          p_delta_amount: number
          p_idempotency_key?: string
          p_note: string
          p_original_txn_id?: string
          p_player_id: string
          p_reason_code: Database["public"]["Enums"]["adjustment_reason_code"]
          p_visit_id: string
        }
        Returns: {
          amount: number
          casino_id: string
          created_at: string
          created_by_staff_id: string | null
          direction: Database["public"]["Enums"]["financial_direction"] | null
          external_ref: string | null
          gaming_day: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          player_id: string
          rating_slip_id: string | null
          reason_code:
            | Database["public"]["Enums"]["adjustment_reason_code"]
            | null
          related_transaction_id: string | null
          source: Database["public"]["Enums"]["financial_source"] | null
          tender_type: string | null
          txn_kind: Database["public"]["Enums"]["financial_txn_kind"]
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "player_financial_transaction"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_financial_txn: {
        Args: {
          p_amount: number
          p_casino_id: string
          p_created_at?: string
          p_created_by_staff_id: string
          p_direction: Database["public"]["Enums"]["financial_direction"]
          p_external_ref?: string
          p_idempotency_key?: string
          p_player_id: string
          p_rating_slip_id?: string
          p_related_transaction_id?: string
          p_source: Database["public"]["Enums"]["financial_source"]
          p_tender_type?: string
          p_visit_id: string
        }
        Returns: {
          amount: number
          casino_id: string
          created_at: string
          created_by_staff_id: string | null
          direction: Database["public"]["Enums"]["financial_direction"] | null
          external_ref: string | null
          gaming_day: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          player_id: string
          rating_slip_id: string | null
          reason_code:
            | Database["public"]["Enums"]["adjustment_reason_code"]
            | null
          related_transaction_id: string | null
          source: Database["public"]["Enums"]["financial_source"] | null
          tender_type: string | null
          txn_kind: Database["public"]["Enums"]["financial_txn_kind"]
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "player_financial_transaction"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_floor_layout: {
        Args: { p_casino_id: string; p_description: string; p_name: string }
        Returns: {
          approved_by: string | null
          casino_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          reviewed_by: string | null
          status: Database["public"]["Enums"]["floor_layout_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "floor_layout"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_pit_cash_observation: {
        Args: {
          p_amount: number
          p_amount_kind?: Database["public"]["Enums"]["observation_amount_kind"]
          p_idempotency_key?: string
          p_note?: string
          p_observed_at?: string
          p_rating_slip_id?: string
          p_source?: Database["public"]["Enums"]["observation_source"]
          p_visit_id: string
        }
        Returns: {
          amount: number
          amount_kind: Database["public"]["Enums"]["observation_amount_kind"]
          casino_id: string
          created_at: string
          created_by_staff_id: string
          direction: string
          gaming_day: string
          id: string
          idempotency_key: string | null
          note: string | null
          observed_at: string
          player_id: string
          rating_slip_id: string | null
          source: Database["public"]["Enums"]["observation_source"]
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pit_cash_observation"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_player: {
        Args: {
          p_birth_date?: string
          p_casino_id: string
          p_first_name: string
          p_last_name: string
        }
        Returns: Json
      }
      rpc_create_shift_checkpoint: {
        Args: { p_checkpoint_type: string; p_notes?: string }
        Returns: {
          cash_out_observed_cents: number
          casino_id: string
          checkpoint_scope: string
          checkpoint_type: string
          created_at: string
          created_by: string | null
          credits_total_cents: number
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string | null
          grind_buyin_cents: number
          id: string
          notes: string | null
          pit_id: string | null
          rated_buyin_cents: number
          tables_active: number
          tables_with_coverage: number
          win_loss_cents: number | null
          window_end: string
          window_start: string
        }
        SetofOptions: {
          from: "*"
          to: "shift_checkpoint"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_staff: {
        Args: {
          p_employee_id?: string
          p_first_name: string
          p_last_name: string
          p_role: Database["public"]["Enums"]["staff_role"]
        }
        Returns: {
          casino_id: string
          employee_id: string
          first_name: string
          id: string
          last_name: string
          role: string
          status: string
        }[]
      }
      rpc_create_staff_invite: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["staff_role"]
          p_ttl_hours?: number
        }
        Returns: {
          expires_at: string
          invite_id: string
          raw_token: string
        }[]
      }
      rpc_current_gaming_day: {
        Args: { p_timestamp?: string }
        Returns: string
      }
      rpc_enroll_player: {
        Args: { p_player_id: string }
        Returns: {
          casino_id: string
          enrolled_at: string
          enrolled_by: string
          player_id: string
          status: string
        }[]
      }
      rpc_finalize_rundown: {
        Args: { p_report_id: string }
        Returns: {
          casino_id: string
          closing_bankroll_cents: number | null
          closing_snapshot_id: string | null
          computation_grade: string
          computed_at: string
          computed_by: string | null
          created_at: string
          credits_total_cents: number
          drop_event_id: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          finalized_at: string | null
          finalized_by: string | null
          gaming_day: string
          gaming_table_id: string
          has_late_events: boolean
          id: string
          notes: string | null
          opening_bankroll_cents: number | null
          opening_snapshot_id: string | null
          opening_source: string
          par_target_cents: number | null
          table_session_id: string
          table_win_cents: number | null
          variance_from_par_cents: number | null
        }
        SetofOptions: {
          from: "*"
          to: "table_rundown_report"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_force_close_table_session: {
        Args: {
          p_close_note?: string
          p_close_reason: Database["public"]["Enums"]["close_reason_type"]
          p_table_session_id: string
        }
        Returns: {
          activated_by_staff_id: string | null
          casino_id: string
          close_note: string | null
          close_reason: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at: string | null
          closed_by_staff_id: string | null
          closing_inventory_snapshot_id: string | null
          created_at: string
          credits_total_cents: number
          crossed_gaming_day: boolean
          drop_event_id: string | null
          drop_posted_at: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string
          has_unresolved_items: boolean
          id: string
          metadata: Json | null
          need_total_cents: number | null
          notes: string | null
          opened_at: string
          opened_by_staff_id: string
          opening_inventory_snapshot_id: string | null
          paused_by_staff_id: string | null
          requires_reconciliation: boolean
          resumed_by_staff_id: string | null
          rolled_over_by_staff_id: string | null
          rundown_started_at: string | null
          rundown_started_by_staff_id: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"] | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_session"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_gaming_day_range: {
        Args: { p_end_timestamp?: string; p_weeks?: number }
        Returns: {
          end_gd: string
          start_gd: string
        }[]
      }
      rpc_get_current_table_session: {
        Args: { p_gaming_table_id: string }
        Returns: {
          activated_by_staff_id: string | null
          casino_id: string
          close_note: string | null
          close_reason: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at: string | null
          closed_by_staff_id: string | null
          closing_inventory_snapshot_id: string | null
          created_at: string
          credits_total_cents: number
          crossed_gaming_day: boolean
          drop_event_id: string | null
          drop_posted_at: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string
          has_unresolved_items: boolean
          id: string
          metadata: Json | null
          need_total_cents: number | null
          notes: string | null
          opened_at: string
          opened_by_staff_id: string
          opening_inventory_snapshot_id: string | null
          paused_by_staff_id: string | null
          requires_reconciliation: boolean
          resumed_by_staff_id: string | null
          rolled_over_by_staff_id: string | null
          rundown_started_at: string | null
          rundown_started_by_staff_id: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"] | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_session"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_get_dashboard_stats: { Args: never; Returns: Json }
      rpc_get_dashboard_tables_with_counts: {
        Args: { p_casino_id: string }
        Returns: Json
      }
      rpc_get_player_last_session_context: {
        Args: { p_casino_id: string; p_player_id: string }
        Returns: Json
      }
      rpc_get_player_ledger: {
        Args: {
          p_casino_id: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_player_id: string
        }
        Returns: {
          campaign_id: string
          casino_id: string
          created_at: string
          has_more: boolean
          id: string
          idempotency_key: string
          metadata: Json
          note: string
          player_id: string
          points_delta: number
          rating_slip_id: string
          reason: Database["public"]["Enums"]["loyalty_reason"]
          source_id: string
          source_kind: string
          staff_id: string
          visit_id: string
        }[]
      }
      rpc_get_player_recent_sessions: {
        Args: {
          p_casino_id: string
          p_cursor?: string
          p_limit?: number
          p_player_id: string
        }
        Returns: Json
      }
      rpc_get_player_timeline: {
        Args: {
          p_cursor_at?: string
          p_cursor_id?: string
          p_event_types?: Database["public"]["Enums"]["interaction_event_type"][]
          p_from_date?: string
          p_limit?: number
          p_player_id: string
          p_to_date?: string
        }
        Returns: {
          actor_id: string
          actor_name: string
          amount: number
          event_id: string
          event_type: Database["public"]["Enums"]["interaction_event_type"]
          has_more: boolean
          metadata: Json
          next_cursor_at: string
          next_cursor_id: string
          occurred_at: string
          source_id: string
          source_table: string
          summary: string
        }[]
      }
      rpc_get_rating_slip_duration: {
        Args: { p_as_of?: string; p_rating_slip_id: string }
        Returns: number
      }
      rpc_get_rating_slip_modal_data: {
        Args: { p_casino_id: string; p_slip_id: string }
        Returns: Json
      }
      rpc_get_visit_last_segment: {
        Args: { p_visit_id: string }
        Returns: Json
      }
      rpc_get_visit_live_view: {
        Args: {
          p_include_segments?: boolean
          p_segments_limit?: number
          p_visit_id: string
        }
        Returns: Json
      }
      rpc_get_visit_loyalty_summary: {
        Args: { p_visit_id: string }
        Returns: Json
      }
      rpc_import_create_batch:
        | {
            Args: {
              p_column_mapping?: Json
              p_file_name: string
              p_idempotency_key: string
              p_vendor_label?: string
            }
            Returns: {
              attempt_count: number
              casino_id: string
              claimed_at: string | null
              claimed_by: string | null
              column_mapping: Json
              created_at: string
              created_by_staff_id: string
              file_name: string
              heartbeat_at: string | null
              id: string
              idempotency_key: string
              last_error_at: string | null
              last_error_code: string | null
              original_file_name: string | null
              report_summary: Json | null
              status: Database["public"]["Enums"]["import_batch_status"]
              storage_path: string | null
              total_rows: number
              updated_at: string
              vendor_label: string | null
            }
            SetofOptions: {
              from: "*"
              to: "import_batch"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_column_mapping: Json
              p_file_name: string
              p_idempotency_key: string
              p_initial_status?: Database["public"]["Enums"]["import_batch_status"]
              p_vendor_label: string
            }
            Returns: {
              attempt_count: number
              casino_id: string
              claimed_at: string | null
              claimed_by: string | null
              column_mapping: Json
              created_at: string
              created_by_staff_id: string
              file_name: string
              heartbeat_at: string | null
              id: string
              idempotency_key: string
              last_error_at: string | null
              last_error_code: string | null
              original_file_name: string | null
              report_summary: Json | null
              status: Database["public"]["Enums"]["import_batch_status"]
              storage_path: string | null
              total_rows: number
              updated_at: string
              vendor_label: string | null
            }
            SetofOptions: {
              from: "*"
              to: "import_batch"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      rpc_import_execute: {
        Args: { p_batch_id: string }
        Returns: {
          attempt_count: number
          casino_id: string
          claimed_at: string | null
          claimed_by: string | null
          column_mapping: Json
          created_at: string
          created_by_staff_id: string
          file_name: string
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          last_error_at: string | null
          last_error_code: string | null
          original_file_name: string | null
          report_summary: Json | null
          status: Database["public"]["Enums"]["import_batch_status"]
          storage_path: string | null
          total_rows: number
          updated_at: string
          vendor_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "import_batch"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_import_stage_rows: {
        Args: { p_batch_id: string; p_rows: Json }
        Returns: {
          attempt_count: number
          casino_id: string
          claimed_at: string | null
          claimed_by: string | null
          column_mapping: Json
          created_at: string
          created_by_staff_id: string
          file_name: string
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          last_error_at: string | null
          last_error_code: string | null
          original_file_name: string | null
          report_summary: Json | null
          status: Database["public"]["Enums"]["import_batch_status"]
          storage_path: string | null
          total_rows: number
          updated_at: string
          vendor_label: string | null
        }
        SetofOptions: {
          from: "*"
          to: "import_batch"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_increment_pin_attempt: {
        Args: never
        Returns: {
          attempt_count: number
          is_limited: boolean
        }[]
      }
      rpc_issue_mid_session_reward: {
        Args: {
          p_casino_id: string
          p_idempotency_key?: string
          p_player_id: string
          p_points: number
          p_rating_slip_id: string
          p_reason?: Database["public"]["Enums"]["loyalty_reason"]
          p_staff_id: string
        }
        Returns: {
          balance_after: number
          ledger_id: string
        }[]
      }
      rpc_issue_promo_coupon: {
        Args: {
          p_correlation_id?: string
          p_expires_at?: string
          p_idempotency_key: string
          p_player_id?: string
          p_promo_program_id: string
          p_validation_number: string
          p_visit_id?: string
        }
        Returns: Json
      }
      rpc_list_active_players_casino_wide: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          average_bet: number
          pit_name: string
          player_birth_date: string
          player_first_name: string
          player_id: string
          player_last_name: string
          player_tier: string
          seat_number: string
          slip_id: string
          start_time: string
          status: string
          table_id: string
          table_name: string
          visit_id: string
        }[]
      }
      rpc_list_closed_slips_for_gaming_day: {
        Args: {
          p_cursor_end_time?: string
          p_cursor_id?: string
          p_gaming_day: string
          p_limit?: number
        }
        Returns: {
          average_bet: number
          end_time: string
          final_duration_seconds: number
          id: string
          player_first_name: string
          player_id: string
          player_last_name: string
          player_tier: string
          seat_number: string
          start_time: string
          table_id: string
          table_name: string
          visit_id: string
        }[]
      }
      rpc_log_table_buyin_telemetry: {
        Args: {
          p_amount_cents: number
          p_idempotency_key?: string
          p_note?: string
          p_rating_slip_id?: string
          p_source?: string
          p_table_id: string
          p_telemetry_kind: string
          p_tender_type?: string
          p_visit_id?: string
        }
        Returns: {
          actor_id: string
          amount_cents: number
          casino_id: string
          created_at: string
          gaming_day: string
          id: string
          idempotency_key: string | null
          note: string | null
          occurred_at: string
          rating_slip_id: string | null
          source: string | null
          table_id: string
          telemetry_kind: string
          tender_type: string | null
          visit_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "table_buyin_telemetry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_log_table_drop: {
        Args: {
          p_casino_id: string
          p_delivered_at?: string
          p_delivered_scan_at?: string
          p_drop_box_id: string
          p_gaming_day?: string
          p_note?: string
          p_removed_at?: string
          p_seal_no: string
          p_seq_no?: number
          p_table_id: string
          p_witnessed_by: string
        }
        Returns: {
          cage_received_at: string | null
          cage_received_by: string | null
          casino_id: string
          delivered_at: string | null
          delivered_scan_at: string | null
          drop_box_id: string
          gaming_day: string | null
          id: string
          note: string | null
          removed_at: string
          removed_by: string | null
          seal_no: string | null
          seq_no: number | null
          table_id: string
          witnessed_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "table_drop_event"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_log_table_inventory_snapshot: {
        Args: {
          p_casino_id: string
          p_chipset: Json
          p_discrepancy_cents?: number
          p_note?: string
          p_snapshot_type: string
          p_table_id: string
          p_verified_by?: string
        }
        Returns: {
          casino_id: string
          chipset: Json
          counted_by: string | null
          created_at: string
          discrepancy_cents: number | null
          id: string
          note: string | null
          session_id: string | null
          snapshot_type: string
          table_id: string
          total_cents: number | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "table_inventory_snapshot"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_manual_credit: {
        Args: {
          p_awarded_by_staff_id: string
          p_casino_id: string
          p_idempotency_key: string
          p_note: string
          p_player_id: string
          p_points: number
        }
        Returns: {
          balance_after: number
          is_existing: boolean
          ledger_id: string
          points_delta: number
        }[]
      }
      rpc_move_player: {
        Args: {
          p_average_bet?: number
          p_casino_id: string
          p_new_seat_number?: string
          p_new_table_id: string
          p_slip_id: string
        }
        Returns: Json
      }
      rpc_open_table_session: {
        Args: { p_gaming_table_id: string }
        Returns: {
          activated_by_staff_id: string | null
          casino_id: string
          close_note: string | null
          close_reason: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at: string | null
          closed_by_staff_id: string | null
          closing_inventory_snapshot_id: string | null
          created_at: string
          credits_total_cents: number
          crossed_gaming_day: boolean
          drop_event_id: string | null
          drop_posted_at: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string
          has_unresolved_items: boolean
          id: string
          metadata: Json | null
          need_total_cents: number | null
          notes: string | null
          opened_at: string
          opened_by_staff_id: string
          opening_inventory_snapshot_id: string | null
          paused_by_staff_id: string | null
          requires_reconciliation: boolean
          resumed_by_staff_id: string | null
          rolled_over_by_staff_id: string | null
          rundown_started_at: string | null
          rundown_started_by_staff_id: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"] | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_session"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_pause_rating_slip: {
        Args: { p_casino_id: string; p_rating_slip_id: string }
        Returns: {
          accrual_kind: string
          accumulated_seconds: number
          average_bet: number | null
          casino_id: string
          duration_seconds: number | null
          end_time: string | null
          final_average_bet: number | null
          final_duration_seconds: number | null
          game_settings: Json | null
          id: string
          move_group_id: string | null
          pause_intervals: unknown[] | null
          policy_snapshot: Json | null
          previous_slip_id: string | null
          seat_number: string | null
          start_time: string
          status: Database["public"]["Enums"]["rating_slip_status"]
          table_id: string
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rating_slip"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_persist_table_rundown: {
        Args: { p_table_session_id: string }
        Returns: {
          casino_id: string
          closing_bankroll_cents: number | null
          closing_snapshot_id: string | null
          computation_grade: string
          computed_at: string
          computed_by: string | null
          created_at: string
          credits_total_cents: number
          drop_event_id: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          finalized_at: string | null
          finalized_by: string | null
          gaming_day: string
          gaming_table_id: string
          has_late_events: boolean
          id: string
          notes: string | null
          opening_bankroll_cents: number | null
          opening_snapshot_id: string | null
          opening_source: string
          par_target_cents: number | null
          table_session_id: string
          table_win_cents: number | null
          variance_from_par_cents: number | null
        }
        SetofOptions: {
          from: "*"
          to: "table_rundown_report"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_post_table_drop_total: {
        Args: { p_drop_total_cents: number; p_session_id: string }
        Returns: {
          activated_by_staff_id: string | null
          casino_id: string
          close_note: string | null
          close_reason: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at: string | null
          closed_by_staff_id: string | null
          closing_inventory_snapshot_id: string | null
          created_at: string
          credits_total_cents: number
          crossed_gaming_day: boolean
          drop_event_id: string | null
          drop_posted_at: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string
          has_unresolved_items: boolean
          id: string
          metadata: Json | null
          need_total_cents: number | null
          notes: string | null
          opened_at: string
          opened_by_staff_id: string
          opening_inventory_snapshot_id: string | null
          paused_by_staff_id: string | null
          requires_reconciliation: boolean
          resumed_by_staff_id: string | null
          rolled_over_by_staff_id: string | null
          rundown_started_at: string | null
          rundown_started_by_staff_id: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"] | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_session"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_promo_coupon_inventory: {
        Args: {
          p_promo_program_id?: string
          p_status?: Database["public"]["Enums"]["promo_coupon_status"]
        }
        Returns: {
          coupon_count: number
          status: Database["public"]["Enums"]["promo_coupon_status"]
          total_face_value: number
          total_match_wager: number
        }[]
      }
      rpc_promo_exposure_rollup: {
        Args: {
          p_from_ts?: string
          p_gaming_day?: string
          p_shift_id?: string
          p_to_ts?: string
        }
        Returns: Json
      }
      rpc_reconcile_loyalty_balance: {
        Args: { p_casino_id: string; p_player_id: string }
        Returns: {
          drift_detected: boolean
          new_balance: number
          old_balance: number
        }[]
      }
      rpc_redeem: {
        Args: {
          p_allow_overdraw?: boolean
          p_casino_id: string
          p_idempotency_key: string
          p_issued_by_staff_id: string
          p_note: string
          p_player_id: string
          p_points: number
          p_reference?: string
          p_reward_id?: string
        }
        Returns: {
          balance_after: number
          balance_before: number
          is_existing: boolean
          ledger_id: string
          overdraw_applied: boolean
          points_delta: number
        }[]
      }
      rpc_replace_promo_coupon: {
        Args: {
          p_correlation_id?: string
          p_coupon_id: string
          p_idempotency_key: string
          p_new_expires_at?: string
          p_new_validation_number: string
        }
        Returns: Json
      }
      rpc_request_table_credit: {
        Args: {
          p_amount_cents: number
          p_casino_id: string
          p_chipset: Json
          p_received_by: string
          p_request_id: string
          p_sent_by: string
          p_slip_no: string
          p_table_id: string
        }
        Returns: {
          amount_cents: number
          authorized_by: string | null
          casino_id: string
          chipset: Json
          confirmed_amount_cents: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          discrepancy_note: string | null
          id: string
          received_by: string | null
          request_id: string
          sent_by: string | null
          session_id: string | null
          slip_no: string | null
          status: string
          table_id: string
        }
        SetofOptions: {
          from: "*"
          to: "table_credit"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_request_table_fill: {
        Args: {
          p_amount_cents: number
          p_casino_id: string
          p_chipset: Json
          p_delivered_by: string
          p_received_by: string
          p_request_id: string
          p_slip_no: string
          p_table_id: string
        }
        Returns: {
          amount_cents: number
          casino_id: string
          chipset: Json
          confirmed_amount_cents: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          delivered_by: string | null
          discrepancy_note: string | null
          id: string
          received_by: string | null
          request_id: string
          requested_by: string | null
          session_id: string | null
          slip_no: string | null
          status: string
          table_id: string
        }
        SetofOptions: {
          from: "*"
          to: "table_fill"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_resolve_current_slip_context: {
        Args: { p_slip_id: string }
        Returns: Json
      }
      rpc_resume_rating_slip: {
        Args: { p_casino_id: string; p_rating_slip_id: string }
        Returns: {
          accrual_kind: string
          accumulated_seconds: number
          average_bet: number | null
          casino_id: string
          duration_seconds: number | null
          end_time: string | null
          final_average_bet: number | null
          final_duration_seconds: number | null
          game_settings: Json | null
          id: string
          move_group_id: string | null
          pause_intervals: unknown[] | null
          policy_snapshot: Json | null
          previous_slip_id: string | null
          seat_number: string | null
          start_time: string
          status: Database["public"]["Enums"]["rating_slip_status"]
          table_id: string
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rating_slip"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_seed_game_settings_defaults: {
        Args: { p_template?: string }
        Returns: number
      }
      rpc_set_staff_pin: { Args: { p_pin_hash: string }; Returns: undefined }
      rpc_shift_active_visitors_summary: {
        Args: never
        Returns: {
          rated_count: number
          rated_percentage: number
          total_count: number
          unrated_count: number
        }[]
      }
      rpc_shift_cash_obs_alerts: {
        Args: { p_end_ts: string; p_start_ts: string }
        Returns: {
          alert_type: string
          entity_id: string
          entity_label: string
          entity_type: string
          is_telemetry: boolean
          message: string
          observed_value: number
          severity: string
          threshold: number
        }[]
      }
      rpc_shift_cash_obs_casino: {
        Args: { p_end_ts: string; p_start_ts: string }
        Returns: {
          cash_out_last_observed_at: string
          cash_out_observation_count: number
          cash_out_observed_confirmed_total: number
          cash_out_observed_estimate_total: number
        }[]
      }
      rpc_shift_cash_obs_pit: {
        Args: { p_end_ts: string; p_pit?: string; p_start_ts: string }
        Returns: {
          cash_out_last_observed_at: string
          cash_out_observation_count: number
          cash_out_observed_confirmed_total: number
          cash_out_observed_estimate_total: number
          pit: string
        }[]
      }
      rpc_shift_cash_obs_table: {
        Args: { p_end_ts: string; p_start_ts: string; p_table_id?: string }
        Returns: {
          cash_out_last_observed_at: string
          cash_out_observation_count: number
          cash_out_observed_confirmed_total: number
          cash_out_observed_estimate_total: number
          pit: string
          table_id: string
          table_label: string
        }[]
      }
      rpc_shift_casino_metrics:
        | {
            Args: { p_window_end: string; p_window_start: string }
            Returns: {
              credits_total_cents: number
              estimated_drop_buyins_total_cents: number
              estimated_drop_grind_total_cents: number
              estimated_drop_rated_total_cents: number
              fills_total_cents: number
              pits_count: number
              tables_count: number
              tables_good_coverage_count: number
              tables_grade_estimate: number
              tables_with_closing_snapshot: number
              tables_with_opening_snapshot: number
              tables_with_telemetry_count: number
              win_loss_estimated_total_cents: number
              win_loss_inventory_total_cents: number
              window_end: string
              window_start: string
            }[]
          }
        | {
            Args: {
              p_internal_actor_id: string
              p_window_end: string
              p_window_start: string
            }
            Returns: {
              credits_total_cents: number
              estimated_drop_buyins_total_cents: number
              estimated_drop_grind_total_cents: number
              estimated_drop_rated_total_cents: number
              fills_total_cents: number
              pits_count: number
              tables_count: number
              tables_good_coverage_count: number
              tables_grade_estimate: number
              tables_with_closing_snapshot: number
              tables_with_opening_snapshot: number
              tables_with_telemetry_count: number
              win_loss_estimated_total_cents: number
              win_loss_inventory_total_cents: number
              window_end: string
              window_start: string
            }[]
          }
      rpc_shift_pit_metrics:
        | {
            Args: {
              p_pit_id: string
              p_window_end: string
              p_window_start: string
            }
            Returns: {
              credits_total_cents: number
              estimated_drop_buyins_total_cents: number
              estimated_drop_grind_total_cents: number
              estimated_drop_rated_total_cents: number
              fills_total_cents: number
              pit_id: string
              tables_count: number
              tables_good_coverage_count: number
              tables_grade_estimate: number
              tables_with_closing_snapshot: number
              tables_with_opening_snapshot: number
              tables_with_telemetry_count: number
              win_loss_estimated_total_cents: number
              win_loss_inventory_total_cents: number
              window_end: string
              window_start: string
            }[]
          }
        | {
            Args: {
              p_internal_actor_id: string
              p_pit_id: string
              p_window_end: string
              p_window_start: string
            }
            Returns: {
              credits_total_cents: number
              estimated_drop_buyins_total_cents: number
              estimated_drop_grind_total_cents: number
              estimated_drop_rated_total_cents: number
              fills_total_cents: number
              pit_id: string
              tables_count: number
              tables_good_coverage_count: number
              tables_grade_estimate: number
              tables_with_closing_snapshot: number
              tables_with_opening_snapshot: number
              tables_with_telemetry_count: number
              win_loss_estimated_total_cents: number
              win_loss_inventory_total_cents: number
              window_end: string
              window_start: string
            }[]
          }
      rpc_shift_table_metrics:
        | {
            Args: { p_window_end: string; p_window_start: string }
            Returns: {
              closing_bankroll_total_cents: number
              closing_snapshot_at: string
              closing_snapshot_id: string
              credits_total_cents: number
              drop_custody_present: boolean
              estimated_drop_buyins_cents: number
              estimated_drop_grind_cents: number
              estimated_drop_rated_cents: number
              fills_total_cents: number
              metric_grade: string
              missing_closing_snapshot: boolean
              missing_opening_snapshot: boolean
              opening_bankroll_total_cents: number
              opening_snapshot_at: string
              opening_snapshot_id: string
              pit_id: string
              table_id: string
              table_label: string
              telemetry_notes: string
              telemetry_quality: string
              win_loss_estimated_cents: number
              win_loss_inventory_cents: number
              window_end: string
              window_start: string
            }[]
          }
        | {
            Args: {
              p_internal_actor_id: string
              p_window_end: string
              p_window_start: string
            }
            Returns: {
              closing_bankroll_total_cents: number
              closing_snapshot_at: string
              closing_snapshot_id: string
              credits_total_cents: number
              drop_custody_present: boolean
              estimated_drop_buyins_cents: number
              estimated_drop_grind_cents: number
              estimated_drop_rated_cents: number
              fills_total_cents: number
              metric_grade: string
              missing_closing_snapshot: boolean
              missing_opening_snapshot: boolean
              opening_bankroll_total_cents: number
              opening_snapshot_at: string
              opening_snapshot_id: string
              pit_id: string
              table_id: string
              table_label: string
              telemetry_notes: string
              telemetry_quality: string
              win_loss_estimated_cents: number
              win_loss_inventory_cents: number
              window_end: string
              window_start: string
            }[]
          }
      rpc_start_or_resume_visit: {
        Args: { p_player_id: string }
        Returns: {
          gaming_day: string
          is_new: boolean
          resumed: boolean
          visit: Database["public"]["Tables"]["visit"]["Row"]
        }[]
      }
      rpc_start_rating_slip: {
        Args: {
          p_actor_id?: string
          p_casino_id: string
          p_game_settings: Json
          p_seat_number: string
          p_table_id: string
          p_visit_id: string
        }
        Returns: {
          accrual_kind: string
          accumulated_seconds: number
          average_bet: number | null
          casino_id: string
          duration_seconds: number | null
          end_time: string | null
          final_average_bet: number | null
          final_duration_seconds: number | null
          game_settings: Json | null
          id: string
          move_group_id: string | null
          pause_intervals: unknown[] | null
          policy_snapshot: Json | null
          previous_slip_id: string | null
          seat_number: string | null
          start_time: string
          status: Database["public"]["Enums"]["rating_slip_status"]
          table_id: string
          visit_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rating_slip"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_start_table_rundown: {
        Args: { p_table_session_id: string }
        Returns: {
          activated_by_staff_id: string | null
          casino_id: string
          close_note: string | null
          close_reason: Database["public"]["Enums"]["close_reason_type"] | null
          closed_at: string | null
          closed_by_staff_id: string | null
          closing_inventory_snapshot_id: string | null
          created_at: string
          credits_total_cents: number
          crossed_gaming_day: boolean
          drop_event_id: string | null
          drop_posted_at: string | null
          drop_total_cents: number | null
          fills_total_cents: number
          gaming_day: string
          gaming_table_id: string
          has_unresolved_items: boolean
          id: string
          metadata: Json | null
          need_total_cents: number | null
          notes: string | null
          opened_at: string
          opened_by_staff_id: string
          opening_inventory_snapshot_id: string | null
          paused_by_staff_id: string | null
          requires_reconciliation: boolean
          resumed_by_staff_id: string | null
          rolled_over_by_staff_id: string | null
          rundown_started_at: string | null
          rundown_started_by_staff_id: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["table_session_status"]
          table_bank_mode: Database["public"]["Enums"]["table_bank_mode"] | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "table_session"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_table_status:
        | {
            Args: {
              p_casino_id: string
              p_new_status: Database["public"]["Enums"]["table_status"]
              p_table_id: string
            }
            Returns: {
              casino_id: string
              created_at: string
              game_settings_id: string | null
              id: string
              label: string
              label_normalized: string | null
              par_total_cents: number | null
              par_updated_at: string | null
              par_updated_by: string | null
              pit: string | null
              status: Database["public"]["Enums"]["table_status"]
              type: Database["public"]["Enums"]["game_type"]
            }
            SetofOptions: {
              from: "*"
              to: "gaming_table"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_actor_id: string
              p_casino_id: string
              p_new_status: Database["public"]["Enums"]["table_status"]
              p_table_id: string
            }
            Returns: {
              casino_id: string
              created_at: string
              game_settings_id: string | null
              id: string
              label: string
              label_normalized: string | null
              par_total_cents: number | null
              par_updated_at: string | null
              par_updated_by: string | null
              pit: string | null
              status: Database["public"]["Enums"]["table_status"]
              type: Database["public"]["Enums"]["game_type"]
            }
            SetofOptions: {
              from: "*"
              to: "gaming_table"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      rpc_void_promo_coupon: {
        Args: {
          p_correlation_id?: string
          p_coupon_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      set_rls_context: {
        Args: {
          p_actor_id: string
          p_casino_id: string
          p_correlation_id?: string
          p_staff_role: string
        }
        Returns: undefined
      }
      set_rls_context_from_staff: {
        Args: { p_correlation_id?: string }
        Returns: {
          actor_id: string
          casino_id: string
          staff_role: string
        }[]
      }
      set_rls_context_internal: {
        Args: {
          p_actor_id: string
          p_casino_id: string
          p_correlation_id?: string
          p_staff_role: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_staff_jwt_claims: {
        Args: { p_staff_id: string }
        Returns: undefined
      }
    }
    Enums: {
      adjustment_reason_code:
        | "data_entry_error"
        | "duplicate"
        | "wrong_player"
        | "wrong_amount"
        | "system_bug"
        | "other"
      close_reason_type:
        | "end_of_shift"
        | "maintenance"
        | "game_change"
        | "dealer_unavailable"
        | "low_demand"
        | "security_hold"
        | "emergency"
        | "other"
      financial_direction: "in" | "out"
      financial_source: "pit" | "cage" | "system"
      financial_txn_kind: "original" | "adjustment" | "reversal"
      floor_layout_status: "draft" | "review" | "approved" | "archived"
      floor_layout_version_status:
        | "draft"
        | "pending_activation"
        | "active"
        | "retired"
      game_type:
        | "blackjack"
        | "poker"
        | "roulette"
        | "baccarat"
        | "pai_gow"
        | "carnival"
      import_batch_status:
        | "staging"
        | "executing"
        | "completed"
        | "failed"
        | "created"
        | "uploaded"
        | "parsing"
      import_row_status:
        | "staged"
        | "created"
        | "linked"
        | "skipped"
        | "conflict"
        | "error"
      interaction_event_type:
        | "visit_start"
        | "visit_end"
        | "visit_resume"
        | "rating_start"
        | "rating_pause"
        | "rating_resume"
        | "rating_close"
        | "cash_in"
        | "cash_out"
        | "cash_observation"
        | "financial_adjustment"
        | "points_earned"
        | "points_redeemed"
        | "points_adjusted"
        | "promo_issued"
        | "promo_redeemed"
        | "note_added"
        | "tag_applied"
        | "tag_removed"
        | "mtl_recorded"
        | "player_enrolled"
        | "identity_verified"
      loyalty_reason:
        | "base_accrual"
        | "promotion"
        | "redeem"
        | "manual_reward"
        | "adjustment"
        | "reversal"
      mtl_source: "table" | "cage" | "kiosk" | "other"
      mtl_txn_type:
        | "buy_in"
        | "cash_out"
        | "marker"
        | "front_money"
        | "chip_fill"
      observation_amount_kind: "estimate" | "cage_confirmed"
      observation_source: "walk_with" | "phone_confirmed" | "observed"
      promo_coupon_status:
        | "issued"
        | "voided"
        | "replaced"
        | "expired"
        | "cleared"
      promo_type_enum: "match_play"
      rating_slip_status: "open" | "paused" | "closed" | "archived"
      reward_family: "points_comp" | "entitlement"
      staff_role: "dealer" | "pit_boss" | "cashier" | "admin"
      staff_status: "active" | "inactive"
      table_bank_mode: "INVENTORY_COUNT" | "IMPREST_TO_PAR"
      table_session_status: "OPEN" | "ACTIVE" | "RUNDOWN" | "CLOSED"
      table_status: "inactive" | "active" | "closed"
      visit_kind:
        | "reward_identified"
        | "gaming_identified_rated"
        | "gaming_ghost_unrated"
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
      adjustment_reason_code: [
        "data_entry_error",
        "duplicate",
        "wrong_player",
        "wrong_amount",
        "system_bug",
        "other",
      ],
      close_reason_type: [
        "end_of_shift",
        "maintenance",
        "game_change",
        "dealer_unavailable",
        "low_demand",
        "security_hold",
        "emergency",
        "other",
      ],
      financial_direction: ["in", "out"],
      financial_source: ["pit", "cage", "system"],
      financial_txn_kind: ["original", "adjustment", "reversal"],
      floor_layout_status: ["draft", "review", "approved", "archived"],
      floor_layout_version_status: [
        "draft",
        "pending_activation",
        "active",
        "retired",
      ],
      game_type: [
        "blackjack",
        "poker",
        "roulette",
        "baccarat",
        "pai_gow",
        "carnival",
      ],
      import_batch_status: [
        "staging",
        "executing",
        "completed",
        "failed",
        "created",
        "uploaded",
        "parsing",
      ],
      import_row_status: [
        "staged",
        "created",
        "linked",
        "skipped",
        "conflict",
        "error",
      ],
      interaction_event_type: [
        "visit_start",
        "visit_end",
        "visit_resume",
        "rating_start",
        "rating_pause",
        "rating_resume",
        "rating_close",
        "cash_in",
        "cash_out",
        "cash_observation",
        "financial_adjustment",
        "points_earned",
        "points_redeemed",
        "points_adjusted",
        "promo_issued",
        "promo_redeemed",
        "note_added",
        "tag_applied",
        "tag_removed",
        "mtl_recorded",
        "player_enrolled",
        "identity_verified",
      ],
      loyalty_reason: [
        "base_accrual",
        "promotion",
        "redeem",
        "manual_reward",
        "adjustment",
        "reversal",
      ],
      mtl_source: ["table", "cage", "kiosk", "other"],
      mtl_txn_type: [
        "buy_in",
        "cash_out",
        "marker",
        "front_money",
        "chip_fill",
      ],
      observation_amount_kind: ["estimate", "cage_confirmed"],
      observation_source: ["walk_with", "phone_confirmed", "observed"],
      promo_coupon_status: [
        "issued",
        "voided",
        "replaced",
        "expired",
        "cleared",
      ],
      promo_type_enum: ["match_play"],
      rating_slip_status: ["open", "paused", "closed", "archived"],
      reward_family: ["points_comp", "entitlement"],
      staff_role: ["dealer", "pit_boss", "cashier", "admin"],
      staff_status: ["active", "inactive"],
      table_bank_mode: ["INVENTORY_COUNT", "IMPREST_TO_PAR"],
      table_session_status: ["OPEN", "ACTIVE", "RUNDOWN", "CLOSED"],
      table_status: ["inactive", "active", "closed"],
      visit_kind: [
        "reward_identified",
        "gaming_identified_rated",
        "gaming_ghost_unrated",
      ],
    },
  },
} as const

