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
    PostgrestVersion: "13.0.4"
  }
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
          casino_id: string
          created_at: string
          ctr_threshold: number
          gaming_day_start_time: string
          id: string
          timezone: string
          updated_at: string
          watchlist_floor: number
        }
        Insert: {
          casino_id: string
          created_at?: string
          ctr_threshold?: number
          gaming_day_start_time?: string
          id?: string
          timezone?: string
          updated_at?: string
          watchlist_floor?: number
        }
        Update: {
          casino_id?: string
          created_at?: string
          ctr_threshold?: number
          gaming_day_start_time?: string
          id?: string
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
          created_at: string
          decisions_per_hour: number
          game_type: Database["public"]["Enums"]["game_type"]
          house_edge: number
          id: string
          max_bet: number | null
          min_bet: number | null
          name: string
          point_multiplier: number | null
          points_conversion_rate: number | null
          rotation_interval_minutes: number | null
          seats_available: number
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          decisions_per_hour?: number
          game_type: Database["public"]["Enums"]["game_type"]
          house_edge?: number
          id?: string
          max_bet?: number | null
          min_bet?: number | null
          name: string
          point_multiplier?: number | null
          points_conversion_rate?: number | null
          rotation_interval_minutes?: number | null
          seats_available?: number
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          decisions_per_hour?: number
          game_type?: Database["public"]["Enums"]["game_type"]
          house_edge?: number
          id?: string
          max_bet?: number | null
          min_bet?: number | null
          name?: string
          point_multiplier?: number | null
          points_conversion_rate?: number | null
          rotation_interval_minutes?: number | null
          seats_available?: number
          updated_at?: string
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
      gaming_table: {
        Row: {
          casino_id: string
          created_at: string
          id: string
          label: string
          pit: string | null
          status: Database["public"]["Enums"]["table_status"]
          type: Database["public"]["Enums"]["game_type"]
        }
        Insert: {
          casino_id: string
          created_at?: string
          id?: string
          label: string
          pit?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          type: Database["public"]["Enums"]["game_type"]
        }
        Update: {
          casino_id?: string
          created_at?: string
          id?: string
          label?: string
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
      loyalty_ledger: {
        Row: {
          average_bet: number | null
          casino_id: string
          created_at: string
          duration_seconds: number | null
          game_type: Database["public"]["Enums"]["game_type"] | null
          id: string
          idempotency_key: string | null
          player_id: string
          points_earned: number
          rating_slip_id: string | null
          reason: Database["public"]["Enums"]["loyalty_reason"]
          staff_id: string | null
          visit_id: string | null
        }
        Insert: {
          average_bet?: number | null
          casino_id: string
          created_at?: string
          duration_seconds?: number | null
          game_type?: Database["public"]["Enums"]["game_type"] | null
          id?: string
          idempotency_key?: string | null
          player_id: string
          points_earned: number
          rating_slip_id?: string | null
          reason?: Database["public"]["Enums"]["loyalty_reason"]
          staff_id?: string | null
          visit_id?: string | null
        }
        Update: {
          average_bet?: number | null
          casino_id?: string
          created_at?: string
          duration_seconds?: number | null
          game_type?: Database["public"]["Enums"]["game_type"] | null
          id?: string
          idempotency_key?: string | null
          player_id?: string
          points_earned?: number
          rating_slip_id?: string | null
          reason?: Database["public"]["Enums"]["loyalty_reason"]
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
          id: string
          idempotency_key: string | null
          patron_uuid: string
          rating_slip_id: string | null
          staff_id: string | null
          visit_id: string | null
        }
        Insert: {
          amount: number
          area?: string | null
          casino_id: string
          created_at?: string
          direction: string
          id?: string
          idempotency_key?: string | null
          patron_uuid: string
          rating_slip_id?: string | null
          staff_id?: string | null
          visit_id?: string | null
        }
        Update: {
          amount?: number
          area?: string | null
          casino_id?: string
          created_at?: string
          direction?: string
          id?: string
          idempotency_key?: string | null
          patron_uuid?: string
          rating_slip_id?: string | null
          staff_id?: string | null
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
      player: {
        Row: {
          birth_date: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          first_name: string
          id?: string
          last_name: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
        }
        Relationships: []
      }
      player_casino: {
        Row: {
          casino_id: string
          enrolled_at: string
          player_id: string
          status: string
        }
        Insert: {
          casino_id: string
          enrolled_at?: string
          player_id: string
          status?: string
        }
        Update: {
          casino_id?: string
          enrolled_at?: string
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
          gaming_day: string | null
          id: string
          idempotency_key: string | null
          player_id: string
          rating_slip_id: string | null
          tender_type: string | null
          visit_id: string | null
        }
        Insert: {
          amount: number
          casino_id: string
          created_at?: string
          gaming_day?: string | null
          id?: string
          idempotency_key?: string | null
          player_id: string
          rating_slip_id?: string | null
          tender_type?: string | null
          visit_id?: string | null
        }
        Update: {
          amount?: number
          casino_id?: string
          created_at?: string
          gaming_day?: string | null
          id?: string
          idempotency_key?: string | null
          player_id?: string
          rating_slip_id?: string | null
          tender_type?: string | null
          visit_id?: string | null
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
      player_loyalty: {
        Row: {
          balance: number
          casino_id: string
          player_id: string
          preferences: Json
          tier: string | null
          updated_at: string
        }
        Insert: {
          balance?: number
          casino_id: string
          player_id: string
          preferences?: Json
          tier?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number
          casino_id?: string
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
            foreignKeyName: "player_loyalty_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_slip: {
        Row: {
          average_bet: number | null
          casino_id: string
          end_time: string | null
          game_settings: Json | null
          id: string
          player_id: string //Deprecated, needs to be dropped in PRD-002, derived from visit
          policy_snapshot: Json | null
          seat_number: string | null
          start_time: string
          status: Database["public"]["Enums"]["rating_slip_status"]
          table_id: string
          visit_id: string
        }
        Insert: {
          average_bet?: number | null
          casino_id: string
          end_time?: string | null
          game_settings?: Json | null
          id?: string
          player_id: string
          policy_snapshot?: Json | null
          seat_number?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["rating_slip_status"]
          table_id: string
          visit_id: string
        }
        Update: {
          average_bet?: number | null
          casino_id?: string
          end_time?: string | null
          game_settings?: Json | null
          id?: string
          player_id?: string
          policy_snapshot?: Json | null
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
            foreignKeyName: "rating_slip_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player"
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
      staff: {
        Row: {
          casino_id: string | null
          created_at: string
          email: string | null
          employee_id: string | null
          first_name: string
          id: string
          last_name: string
          role: Database["public"]["Enums"]["staff_role"]
          status: Database["public"]["Enums"]["staff_status"]
          user_id: string | null
        }
        Insert: {
          casino_id?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          first_name: string
          id?: string
          last_name: string
          role: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          user_id?: string | null
        }
        Update: {
          casino_id?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          first_name?: string
          id?: string
          last_name?: string
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
      table_credit: {
        Row: {
          amount_cents: number
          authorized_by: string | null
          casino_id: string
          chipset: Json
          created_at: string
          id: string
          received_by: string | null
          request_id: string
          sent_by: string | null
          slip_no: string | null
          table_id: string
        }
        Insert: {
          amount_cents: number
          authorized_by?: string | null
          casino_id: string
          chipset: Json
          created_at?: string
          id?: string
          received_by?: string | null
          request_id: string
          sent_by?: string | null
          slip_no?: string | null
          table_id: string
        }
        Update: {
          amount_cents?: number
          authorized_by?: string | null
          casino_id?: string
          chipset?: Json
          created_at?: string
          id?: string
          received_by?: string | null
          request_id?: string
          sent_by?: string | null
          slip_no?: string | null
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
          created_at: string
          delivered_by: string | null
          id: string
          received_by: string | null
          request_id: string
          requested_by: string | null
          slip_no: string | null
          table_id: string
        }
        Insert: {
          amount_cents: number
          casino_id: string
          chipset: Json
          created_at?: string
          delivered_by?: string | null
          id?: string
          received_by?: string | null
          request_id: string
          requested_by?: string | null
          slip_no?: string | null
          table_id: string
        }
        Update: {
          amount_cents?: number
          casino_id?: string
          chipset?: Json
          created_at?: string
          delivered_by?: string | null
          id?: string
          received_by?: string | null
          request_id?: string
          requested_by?: string | null
          slip_no?: string | null
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
          snapshot_type: string
          table_id: string
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
          snapshot_type: string
          table_id: string
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
          snapshot_type?: string
          table_id?: string
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
      visit: {
        Row: {
          casino_id: string
          ended_at: string | null
          id: string
          player_id: string | null
          started_at: string
          visit_kind: Database["public"]["Enums"]["visit_kind"]
        }
        Insert: {
          casino_id: string
          ended_at?: string | null
          id?: string
          player_id?: string | null
          started_at?: string
          visit_kind?: Database["public"]["Enums"]["visit_kind"]
        }
        Update: {
          casino_id?: string
          ended_at?: string | null
          id?: string
          player_id?: string | null
          started_at?: string
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
      [_ in never]: never
    }
    Functions: {
      compute_gaming_day:
        | {
            Args: { p_casino_id: string; p_timestamp?: string }
            Returns: string
          }
        | { Args: { gstart: string; ts: string }; Returns: string }
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
      exec_sql: { Args: { sql: string }; Returns: undefined }
      rpc_activate_floor_layout: {
        Args: {
          p_activated_by: string
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
      rpc_close_rating_slip: {
        Args: {
          p_actor_id: string
          p_average_bet?: number
          p_casino_id: string
          p_rating_slip_id: string
        }
        Returns: {
          duration_seconds: number
          slip: Database["public"]["Tables"]["rating_slip"]["Row"]
        }[]
      }
      rpc_create_financial_txn:
        | {
            Args: {
              p_amount: number
              p_casino_id: string
              p_created_at?: string
              p_idempotency_key?: string
              p_player_id: string
              p_rating_slip_id?: string
              p_tender_type?: string
              p_visit_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_amount: number
              p_casino_id: string
              p_created_at?: string
              p_player_id: string
              p_rating_slip_id?: string
              p_tender_type?: string
              p_visit_id?: string
            }
            Returns: string
          }
      rpc_create_floor_layout: {
        Args: {
          p_casino_id: string
          p_created_by: string
          p_description: string
          p_name: string
        }
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
      rpc_get_rating_slip_duration: {
        Args: { p_as_of?: string; p_rating_slip_id: string }
        Returns: number
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
      rpc_log_table_drop: {
        Args: {
          p_casino_id: string
          p_delivered_at?: string
          p_delivered_scan_at?: string
          p_drop_box_id: string
          p_gaming_day?: string
          p_note?: string
          p_removed_at?: string
          p_removed_by: string
          p_seal_no: string
          p_seq_no?: number
          p_table_id: string
          p_witnessed_by: string
        }
        Returns: {
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
          p_counted_by?: string
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
          snapshot_type: string
          table_id: string
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "table_inventory_snapshot"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_pause_rating_slip: {
        Args: {
          p_actor_id: string
          p_casino_id: string
          p_rating_slip_id: string
        }
        Returns: {
          average_bet: number | null
          casino_id: string
          end_time: string | null
          game_settings: Json | null
          id: string
          player_id: string
          policy_snapshot: Json | null
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
      rpc_request_table_credit: {
        Args: {
          p_amount_cents: number
          p_authorized_by: string
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
          created_at: string
          id: string
          received_by: string | null
          request_id: string
          sent_by: string | null
          slip_no: string | null
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
          p_requested_by: string
          p_slip_no: string
          p_table_id: string
        }
        Returns: {
          amount_cents: number
          casino_id: string
          chipset: Json
          created_at: string
          delivered_by: string | null
          id: string
          received_by: string | null
          request_id: string
          requested_by: string | null
          slip_no: string | null
          table_id: string
        }
        SetofOptions: {
          from: "*"
          to: "table_fill"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_resume_rating_slip: {
        Args: {
          p_actor_id: string
          p_casino_id: string
          p_rating_slip_id: string
        }
        Returns: {
          average_bet: number | null
          casino_id: string
          end_time: string | null
          game_settings: Json | null
          id: string
          player_id: string
          policy_snapshot: Json | null
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
      rpc_start_rating_slip: {
        Args: {
          p_actor_id: string
          p_casino_id: string
          p_game_settings: Json
          p_player_id: string
          p_seat_number: string
          p_table_id: string
          p_visit_id: string
        }
        Returns: {
          average_bet: number | null
          casino_id: string
          end_time: string | null
          game_settings: Json | null
          id: string
          player_id: string
          policy_snapshot: Json | null
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
      rpc_update_table_status: {
        Args: {
          p_actor_id: string
          p_casino_id: string
          p_new_status: Database["public"]["Enums"]["table_status"]
          p_table_id: string
        }
        Returns: {
          casino_id: string
          created_at: string
          id: string
          label: string
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      floor_layout_status: "draft" | "review" | "approved" | "archived"
      floor_layout_version_status:
        | "draft"
        | "pending_activation"
        | "active"
        | "retired"
      game_type: "blackjack" | "poker" | "roulette" | "baccarat"
      loyalty_reason:
        | "mid_session"
        | "session_end"
        | "manual_adjustment"
        | "promotion"
        | "correction"
      rating_slip_status: "open" | "paused" | "closed" | "archived"
      staff_role: "dealer" | "pit_boss" | "admin"
      staff_status: "active" | "inactive"
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
      floor_layout_status: ["draft", "review", "approved", "archived"],
      floor_layout_version_status: [
        "draft",
        "pending_activation",
        "active",
        "retired",
      ],
      game_type: ["blackjack", "poker", "roulette", "baccarat"],
      loyalty_reason: [
        "mid_session",
        "session_end",
        "manual_adjustment",
        "promotion",
        "correction",
      ],
      rating_slip_status: ["open", "paused", "closed", "archived"],
      staff_role: ["dealer", "pit_boss", "admin"],
      staff_status: ["active", "inactive"],
      table_status: ["inactive", "active", "closed"],
      visit_kind: [
        "reward_identified",
        "gaming_identified_rated",
        "gaming_ghost_unrated",
      ],
    },
  },
} as const
