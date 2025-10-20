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
      AuditLog: {
        Row: {
          action: string;
          details: Json | null;
          entity: string;
          entityId: string;
          id: string;
          timestamp: string;
          userId: string;
        };
        Insert: {
          action: string;
          details?: Json | null;
          entity: string;
          entityId: string;
          id?: string;
          timestamp?: string;
          userId: string;
        };
        Update: {
          action?: string;
          details?: Json | null;
          entity?: string;
          entityId?: string;
          id?: string;
          timestamp?: string;
          userId?: string;
        };
        Relationships: [
          {
            foreignKeyName: "AuditLog_userId_fkey";
            columns: ["userId"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      BreakAlert: {
        Row: {
          alertTime: string;
          dealerId: string;
          id: string;
          message: string;
          tableId: string;
        };
        Insert: {
          alertTime?: string;
          dealerId: string;
          id?: string;
          message: string;
          tableId: string;
        };
        Update: {
          alertTime?: string;
          dealerId?: string;
          id?: string;
          message?: string;
          tableId?: string;
        };
        Relationships: [
          {
            foreignKeyName: "BreakAlert_dealerId_fkey";
            columns: ["dealerId"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "BreakAlert_tableId_fkey";
            columns: ["tableId"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
        ];
      };
      casino: {
        Row: {
          company_id: string | null;
          id: string;
          location: string;
          name: string;
        };
        Insert: {
          company_id?: string | null;
          id?: string;
          location: string;
          name: string;
        };
        Update: {
          company_id?: string | null;
          id?: string;
          location?: string;
          name?: string;
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
          gaming_day_start: string;
          id: string;
          timezone: string;
          updated_at: string;
          watchlist_floor: number;
        };
        Insert: {
          casino_id: string;
          created_at?: string;
          ctr_threshold?: number;
          gaming_day_start?: string;
          id: string;
          timezone?: string;
          updated_at?: string;
          watchlist_floor?: number;
        };
        Update: {
          casino_id?: string;
          created_at?: string;
          ctr_threshold?: number;
          gaming_day_start?: string;
          id?: string;
          timezone?: string;
          updated_at?: string;
          watchlist_floor?: number;
        };
        Relationships: [];
      };
      ChipCountEvent: {
        Row: {
          countDetails: Json;
          countedById: string;
          countType: Database["public"]["Enums"]["CountType"];
          gamingTableId: string;
          id: string;
          timestamp: string;
        };
        Insert: {
          countDetails: Json;
          countedById: string;
          countType: Database["public"]["Enums"]["CountType"];
          gamingTableId: string;
          id?: string;
          timestamp?: string;
        };
        Update: {
          countDetails?: Json;
          countedById?: string;
          countType?: Database["public"]["Enums"]["CountType"];
          gamingTableId?: string;
          id?: string;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ChipCountEvent_countedById_fkey";
            columns: ["countedById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ChipCountEvent_gamingTableId_fkey";
            columns: ["gamingTableId"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
        ];
      };
      company: {
        Row: {
          id: string;
          name: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      ComplianceAlert: {
        Row: {
          alertType: Database["public"]["Enums"]["AlertType"];
          description: string;
          id: string;
          relatedEventId: string | null;
          resolvedAt: string | null;
          triggeredAt: string;
        };
        Insert: {
          alertType: Database["public"]["Enums"]["AlertType"];
          description: string;
          id?: string;
          relatedEventId?: string | null;
          resolvedAt?: string | null;
          triggeredAt?: string;
        };
        Update: {
          alertType?: Database["public"]["Enums"]["AlertType"];
          description?: string;
          id?: string;
          relatedEventId?: string | null;
          resolvedAt?: string | null;
          triggeredAt?: string;
        };
        Relationships: [];
      };
      DealerRotation: {
        Row: {
          dealerId: string;
          id: string;
          shiftEnd: string;
          shiftStart: string;
          tableStringId: string;
        };
        Insert: {
          dealerId: string;
          id?: string;
          shiftEnd: string;
          shiftStart: string;
          tableStringId: string;
        };
        Update: {
          dealerId?: string;
          id?: string;
          shiftEnd?: string;
          shiftStart?: string;
          tableStringId?: string;
        };
        Relationships: [
          {
            foreignKeyName: "DealerRotation_dealerId_fkey";
            columns: ["dealerId"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      DropEvent: {
        Row: {
          actualPulledAt: string | null;
          amount: number;
          gamingTableId: string;
          id: string;
          recordedById: string;
          scheduledAt: string;
          variance: number | null;
        };
        Insert: {
          actualPulledAt?: string | null;
          amount: number;
          gamingTableId: string;
          id?: string;
          recordedById: string;
          scheduledAt: string;
          variance?: number | null;
        };
        Update: {
          actualPulledAt?: string | null;
          amount?: number;
          gamingTableId?: string;
          id?: string;
          recordedById?: string;
          scheduledAt?: string;
          variance?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "DropEvent_gamingTableId_fkey";
            columns: ["gamingTableId"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "DropEvent_recordedById_fkey";
            columns: ["recordedById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      FillSlip: {
        Row: {
          approvedAt: string | null;
          approvedById: string | null;
          casinoId: string;
          createdAt: string;
          createdById: string;
          denominations: Json;
          gamingTableId: string;
          id: string;
        };
        Insert: {
          approvedAt?: string | null;
          approvedById?: string | null;
          casinoId: string;
          createdAt?: string;
          createdById: string;
          denominations: Json;
          gamingTableId: string;
          id?: string;
        };
        Update: {
          approvedAt?: string | null;
          approvedById?: string | null;
          casinoId?: string;
          createdAt?: string;
          createdById?: string;
          denominations?: Json;
          gamingTableId?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "FillSlip_approvedById_fkey";
            columns: ["approvedById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "FillSlip_casinoId_fkey";
            columns: ["casinoId"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "FillSlip_createdById_fkey";
            columns: ["createdById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "FillSlip_gamingTableId_fkey";
            columns: ["gamingTableId"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
        ];
      };
      gamesettings: {
        Row: {
          average_rounds_per_hour: number;
          created_at: string | null;
          house_edge: number;
          id: string;
          name: string;
          point_multiplier: number | null;
          points_conversion_rate: number | null;
          seats_available: number | null;
          updated_at: string | null;
          version: number;
        };
        Insert: {
          average_rounds_per_hour: number;
          created_at?: string | null;
          house_edge: number;
          id?: string;
          name: string;
          point_multiplier?: number | null;
          points_conversion_rate?: number | null;
          seats_available?: number | null;
          updated_at?: string | null;
          version: number;
        };
        Update: {
          average_rounds_per_hour?: number;
          created_at?: string | null;
          house_edge?: number;
          id?: string;
          name?: string;
          point_multiplier?: number | null;
          points_conversion_rate?: number | null;
          seats_available?: number | null;
          updated_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      gamingtable: {
        Row: {
          casino_id: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          table_number: string;
          type: string;
          updated_at: string | null;
        };
        Insert: {
          casino_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          table_number: string;
          type: string;
          updated_at?: string | null;
        };
        Update: {
          casino_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          table_number?: string;
          type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "gamingtable_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
      gamingtablesettings: {
        Row: {
          active_from: string;
          active_until: string | null;
          description: string | null;
          game_settings_id: string;
          gaming_table_id: string;
          id: string;
          is_active: boolean;
        };
        Insert: {
          active_from: string;
          active_until?: string | null;
          description?: string | null;
          game_settings_id: string;
          gaming_table_id: string;
          id?: string;
          is_active?: boolean;
        };
        Update: {
          active_from?: string;
          active_until?: string | null;
          description?: string | null;
          game_settings_id?: string;
          gaming_table_id?: string;
          id?: string;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "gamingtablesettings_game_settings_id_fkey";
            columns: ["game_settings_id"];
            isOneToOne: false;
            referencedRelation: "gamesettings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gamingtablesettings_gaming_table_id_fkey";
            columns: ["gaming_table_id"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
        ];
      };
      KeyControlLog: {
        Row: {
          action: Database["public"]["Enums"]["KeyAction"];
          authorizedById: string | null;
          id: string;
          keyIdentifier: string;
          performedById: string;
          timestamp: string;
        };
        Insert: {
          action: Database["public"]["Enums"]["KeyAction"];
          authorizedById?: string | null;
          id?: string;
          keyIdentifier: string;
          performedById: string;
          timestamp?: string;
        };
        Update: {
          action?: Database["public"]["Enums"]["KeyAction"];
          authorizedById?: string | null;
          id?: string;
          keyIdentifier?: string;
          performedById?: string;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "KeyControlLog_authorizedById_fkey";
            columns: ["authorizedById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "KeyControlLog_performedById_fkey";
            columns: ["performedById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      language: {
        Row: {
          group_name: string | null;
          id: string;
          name: string;
        };
        Insert: {
          group_name?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          group_name?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      loyalty_ledger: {
        Row: {
          balance_after: number | null;
          balance_before: number | null;
          correlation_id: string | null;
          created_at: string;
          event_type: string | null;
          id: string;
          player_id: string;
          points_change: number;
          rating_slip_id: string | null;
          reason: string | null;
          session_id: string | null;
          source: string;
          staff_id: string | null;
          tier_after: string | null;
          tier_before: string | null;
          transaction_type: string;
          visit_id: string | null;
        };
        Insert: {
          balance_after?: number | null;
          balance_before?: number | null;
          correlation_id?: string | null;
          created_at?: string;
          event_type?: string | null;
          id?: string;
          player_id: string;
          points_change: number;
          rating_slip_id?: string | null;
          reason?: string | null;
          session_id?: string | null;
          source?: string;
          staff_id?: string | null;
          tier_after?: string | null;
          tier_before?: string | null;
          transaction_type: string;
          visit_id?: string | null;
        };
        Update: {
          balance_after?: number | null;
          balance_before?: number | null;
          correlation_id?: string | null;
          created_at?: string;
          event_type?: string | null;
          id?: string;
          player_id?: string;
          points_change?: number;
          rating_slip_id?: string | null;
          reason?: string | null;
          session_id?: string | null;
          source?: string;
          staff_id?: string | null;
          tier_after?: string | null;
          tier_before?: string | null;
          transaction_type?: string;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
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
            referencedRelation: "ratingslip";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loyalty_ledger_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "ratingslip_with_financials";
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
      loyalty_tier: {
        Row: {
          multiplier: number;
          threshold_points: number;
          tier: string;
        };
        Insert: {
          multiplier?: number;
          threshold_points: number;
          tier: string;
        };
        Update: {
          multiplier?: number;
          threshold_points?: number;
          tier?: string;
        };
        Relationships: [];
      };
      mtl_audit_note: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          mtl_entry_id: number;
          note: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          mtl_entry_id: number;
          note: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          mtl_entry_id?: number;
          note?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mtl_audit_note_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_audit_note_mtl_entry_id_fkey";
            columns: ["mtl_entry_id"];
            isOneToOne: false;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_audit_note_mtl_entry_id_fkey";
            columns: ["mtl_entry_id"];
            isOneToOne: false;
            referencedRelation: "mtl_entry";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_audit_note_mtl_entry_id_fkey";
            columns: ["mtl_entry_id"];
            isOneToOne: false;
            referencedRelation: "mtl_entry_with_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      mtl_entry: {
        Row: {
          amount: number;
          area: Database["public"]["Enums"]["MtlArea"];
          casino_id: string;
          correlation_id: string | null;
          created_at: string;
          direction: Database["public"]["Enums"]["MtlDirection"];
          event_time: string;
          gaming_day: string;
          id: number;
          idempotency_key: string | null;
          location_note: string | null;
          notes: string | null;
          patron_id: string | null;
          person_description: string | null;
          person_last_name: string | null;
          person_name: string | null;
          rating_slip_id: string | null;
          recorded_by_employee_id: string;
          recorded_by_signature: string;
          table_number: string | null;
          tender_type: Database["public"]["Enums"]["TenderType"];
          updated_at: string;
          visit_id: string | null;
        };
        Insert: {
          amount: number;
          area: Database["public"]["Enums"]["MtlArea"];
          casino_id: string;
          correlation_id?: string | null;
          created_at?: string;
          direction: Database["public"]["Enums"]["MtlDirection"];
          event_time: string;
          gaming_day: string;
          id?: number;
          idempotency_key?: string | null;
          location_note?: string | null;
          notes?: string | null;
          patron_id?: string | null;
          person_description?: string | null;
          person_last_name?: string | null;
          person_name?: string | null;
          rating_slip_id?: string | null;
          recorded_by_employee_id: string;
          recorded_by_signature: string;
          table_number?: string | null;
          tender_type?: Database["public"]["Enums"]["TenderType"];
          updated_at?: string;
          visit_id?: string | null;
        };
        Update: {
          amount?: number;
          area?: Database["public"]["Enums"]["MtlArea"];
          casino_id?: string;
          correlation_id?: string | null;
          created_at?: string;
          direction?: Database["public"]["Enums"]["MtlDirection"];
          event_time?: string;
          gaming_day?: string;
          id?: number;
          idempotency_key?: string | null;
          location_note?: string | null;
          notes?: string | null;
          patron_id?: string | null;
          person_description?: string | null;
          person_last_name?: string | null;
          person_name?: string | null;
          rating_slip_id?: string | null;
          recorded_by_employee_id?: string;
          recorded_by_signature?: string;
          table_number?: string | null;
          tender_type?: Database["public"]["Enums"]["TenderType"];
          updated_at?: string;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mtl_entry_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "ratingslip";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "ratingslip_with_financials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_recorded_by_employee_id_fkey";
            columns: ["recorded_by_employee_id"];
            isOneToOne: false;
            referencedRelation: "Staff";
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
      performance_alerts: {
        Row: {
          actual_value: number | null;
          alert_type: Database["public"]["Enums"]["AlertTypePerf"];
          created_at: string;
          id: string;
          message: string;
          metadata: Json | null;
          metric_name: string;
          metric_type: Database["public"]["Enums"]["MetricType"];
          resolved_at: string | null;
          severity: Database["public"]["Enums"]["Severity"];
          threshold_value: number | null;
        };
        Insert: {
          actual_value?: number | null;
          alert_type: Database["public"]["Enums"]["AlertTypePerf"];
          created_at?: string;
          id?: string;
          message: string;
          metadata?: Json | null;
          metric_name: string;
          metric_type: Database["public"]["Enums"]["MetricType"];
          resolved_at?: string | null;
          severity: Database["public"]["Enums"]["Severity"];
          threshold_value?: number | null;
        };
        Update: {
          actual_value?: number | null;
          alert_type?: Database["public"]["Enums"]["AlertTypePerf"];
          created_at?: string;
          id?: string;
          message?: string;
          metadata?: Json | null;
          metric_name?: string;
          metric_type?: Database["public"]["Enums"]["MetricType"];
          resolved_at?: string | null;
          severity?: Database["public"]["Enums"]["Severity"];
          threshold_value?: number | null;
        };
        Relationships: [];
      };
      performance_config: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          metric_name: string;
          target_value: number;
          updated_at: string;
          warning_value: number;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          metric_name: string;
          target_value: number;
          updated_at?: string;
          warning_value: number;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          metric_name?: string;
          target_value?: number;
          updated_at?: string;
          warning_value?: number;
        };
        Relationships: [];
      };
      performance_metrics: {
        Row: {
          created_at: string;
          id: string;
          metadata: Json | null;
          metric_name: string;
          metric_type: Database["public"]["Enums"]["MetricType"];
          page_path: string | null;
          timestamp: string;
          user_session: string | null;
          value: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          metric_name: string;
          metric_type: Database["public"]["Enums"]["MetricType"];
          page_path?: string | null;
          timestamp?: string;
          user_session?: string | null;
          value: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          metric_name?: string;
          metric_type?: Database["public"]["Enums"]["MetricType"];
          page_path?: string | null;
          timestamp?: string;
          user_session?: string | null;
          value?: number;
        };
        Relationships: [];
      };
      performance_thresholds: {
        Row: {
          created_at: string;
          critical_threshold: number;
          enabled: boolean;
          id: string;
          metric_name: string;
          metric_type: Database["public"]["Enums"]["MetricType"];
          updated_at: string;
          warning_threshold: number;
        };
        Insert: {
          created_at?: string;
          critical_threshold: number;
          enabled?: boolean;
          id?: string;
          metric_name: string;
          metric_type: Database["public"]["Enums"]["MetricType"];
          updated_at?: string;
          warning_threshold: number;
        };
        Update: {
          created_at?: string;
          critical_threshold?: number;
          enabled?: boolean;
          id?: string;
          metric_name?: string;
          metric_type?: Database["public"]["Enums"]["MetricType"];
          updated_at?: string;
          warning_threshold?: number;
        };
        Relationships: [];
      };
      player: {
        Row: {
          address: Json | null;
          company_id: string | null;
          dob: string | null;
          documentNumber: string | null;
          email: string;
          expirationDate: string | null;
          eyeColor: string | null;
          firstName: string;
          gender: Database["public"]["Enums"]["Gender"] | null;
          height: string | null;
          id: string;
          issueDate: string | null;
          issuingState: string | null;
          lastName: string;
          middleName: string | null;
          phone_number: string | null;
          weight: string | null;
        };
        Insert: {
          address?: Json | null;
          company_id?: string | null;
          dob?: string | null;
          documentNumber?: string | null;
          email: string;
          expirationDate?: string | null;
          eyeColor?: string | null;
          firstName: string;
          gender?: Database["public"]["Enums"]["Gender"] | null;
          height?: string | null;
          id?: string;
          issueDate?: string | null;
          issuingState?: string | null;
          lastName: string;
          middleName?: string | null;
          phone_number?: string | null;
          weight?: string | null;
        };
        Update: {
          address?: Json | null;
          company_id?: string | null;
          dob?: string | null;
          documentNumber?: string | null;
          email?: string;
          expirationDate?: string | null;
          eyeColor?: string | null;
          firstName?: string;
          gender?: Database["public"]["Enums"]["Gender"] | null;
          height?: string | null;
          id?: string;
          issueDate?: string | null;
          issuingState?: string | null;
          lastName?: string;
          middleName?: string | null;
          phone_number?: string | null;
          weight?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "company";
            referencedColumns: ["id"];
          },
        ];
      };
      player_financial_transaction: {
        Row: {
          cash_in: number | null;
          chips_brought: number | null;
          chips_taken: number | null;
          created_at: string;
          event_type: Database["public"]["Enums"]["financial_event_type"];
          id: string;
          idempotency_key: string | null;
          net_change: number | null;
          notes: string | null;
          player_id: string;
          rating_slip_id: string | null;
          reconciled_at: string | null;
          reconciliation_status: Database["public"]["Enums"]["reconciliationstatus"];
          transaction_time: string;
          transaction_type: Database["public"]["Enums"]["transactiontype"];
          updated_at: string;
          version: number | null;
          visit_id: string;
        };
        Insert: {
          cash_in?: number | null;
          chips_brought?: number | null;
          chips_taken?: number | null;
          created_at?: string;
          event_type: Database["public"]["Enums"]["financial_event_type"];
          id?: string;
          idempotency_key?: string | null;
          net_change?: number | null;
          notes?: string | null;
          player_id: string;
          rating_slip_id?: string | null;
          reconciled_at?: string | null;
          reconciliation_status?: Database["public"]["Enums"]["reconciliationstatus"];
          transaction_time?: string;
          transaction_type: Database["public"]["Enums"]["transactiontype"];
          updated_at?: string;
          version?: number | null;
          visit_id: string;
        };
        Update: {
          cash_in?: number | null;
          chips_brought?: number | null;
          chips_taken?: number | null;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["financial_event_type"];
          id?: string;
          idempotency_key?: string | null;
          net_change?: number | null;
          notes?: string | null;
          player_id?: string;
          rating_slip_id?: string | null;
          reconciled_at?: string | null;
          reconciliation_status?: Database["public"]["Enums"]["reconciliationstatus"];
          transaction_time?: string;
          transaction_type?: Database["public"]["Enums"]["transactiontype"];
          updated_at?: string;
          version?: number | null;
          visit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "player_financial_transaction_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
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
            referencedRelation: "ratingslip";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_financial_transaction_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "ratingslip_with_financials";
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
          created_at: string | null;
          current_balance: number | null;
          id: string;
          lifetime_points: number | null;
          player_id: string;
          tier: string;
          tier_progress: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          current_balance?: number | null;
          id?: string;
          lifetime_points?: number | null;
          player_id: string;
          tier?: string;
          tier_progress?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          current_balance?: number | null;
          id?: string;
          lifetime_points?: number | null;
          player_id?: string;
          tier?: string;
          tier_progress?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_loyalty_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: true;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
          },
          {
            foreignKeyName: "player_loyalty_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: true;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
        ];
      };
      player_notes: {
        Row: {
          category: string;
          content: string;
          created_at: string | null;
          created_by: string;
          id: string;
          is_flagged: boolean;
          is_private: boolean;
          player_id: string;
          priority: string;
          tags: string[] | null;
          title: string;
          updated_at: string | null;
          updated_by: string;
        };
        Insert: {
          category?: string;
          content: string;
          created_at?: string | null;
          created_by: string;
          id?: string;
          is_flagged?: boolean;
          is_private?: boolean;
          player_id: string;
          priority?: string;
          tags?: string[] | null;
          title: string;
          updated_at?: string | null;
          updated_by: string;
        };
        Update: {
          category?: string;
          content?: string;
          created_at?: string | null;
          created_by?: string;
          id?: string;
          is_flagged?: boolean;
          is_private?: boolean;
          player_id?: string;
          priority?: string;
          tags?: string[] | null;
          title?: string;
          updated_at?: string | null;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "player_notes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_notes_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
          },
          {
            foreignKeyName: "player_notes_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_notes_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      player_preferences: {
        Row: {
          accessibility_needs: Json | null;
          communication_preferences: Json | null;
          created_at: string | null;
          id: string;
          notes: string | null;
          player_id: string;
          preferred_games: string[] | null;
          preferred_limits: Json | null;
          preferred_tables: string[] | null;
          special_requests: string[] | null;
          updated_at: string | null;
        };
        Insert: {
          accessibility_needs?: Json | null;
          communication_preferences?: Json | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          player_id: string;
          preferred_games?: string[] | null;
          preferred_limits?: Json | null;
          preferred_tables?: string[] | null;
          special_requests?: string[] | null;
          updated_at?: string | null;
        };
        Update: {
          accessibility_needs?: Json | null;
          communication_preferences?: Json | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          player_id?: string;
          preferred_games?: string[] | null;
          preferred_limits?: Json | null;
          preferred_tables?: string[] | null;
          special_requests?: string[] | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_preferences_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: true;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
          },
          {
            foreignKeyName: "player_preferences_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: true;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
        ];
      };
      player_recommendations: {
        Row: {
          created_at: string | null;
          game_recommendations: Json | null;
          id: string;
          last_updated: string | null;
          personalized_offers: Json | null;
          player_id: string;
          promotion_recommendations: Json | null;
          table_recommendations: Json | null;
        };
        Insert: {
          created_at?: string | null;
          game_recommendations?: Json | null;
          id?: string;
          last_updated?: string | null;
          personalized_offers?: Json | null;
          player_id: string;
          promotion_recommendations?: Json | null;
          table_recommendations?: Json | null;
        };
        Update: {
          created_at?: string | null;
          game_recommendations?: Json | null;
          id?: string;
          last_updated?: string | null;
          personalized_offers?: Json | null;
          player_id?: string;
          promotion_recommendations?: Json | null;
          table_recommendations?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_recommendations_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: true;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
          },
          {
            foreignKeyName: "player_recommendations_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: true;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
        ];
      };
      playercasino: {
        Row: {
          casino_id: string;
          player_id: string;
        };
        Insert: {
          casino_id: string;
          player_id: string;
        };
        Update: {
          casino_id?: string;
          player_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playercasino_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playercasino_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
          },
          {
            foreignKeyName: "playercasino_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
        ];
      };
      playerlanguage: {
        Row: {
          language_id: string;
          player_id: string;
        };
        Insert: {
          language_id: string;
          player_id: string;
        };
        Update: {
          language_id?: string;
          player_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playerlanguage_language_id_fkey";
            columns: ["language_id"];
            isOneToOne: false;
            referencedRelation: "language";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playerlanguage_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
          },
          {
            foreignKeyName: "playerlanguage_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
        ];
      };
      playerReward: {
        Row: {
          details: Json | null;
          expires_at: string | null;
          id: string;
          issued_at: string;
          player_id: string;
          reward_id: string;
          status: Database["public"]["Enums"]["RewardStatus"];
          visit_id: string | null;
        };
        Insert: {
          details?: Json | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          player_id: string;
          reward_id: string;
          status?: Database["public"]["Enums"]["RewardStatus"];
          visit_id?: string | null;
        };
        Update: {
          details?: Json | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          player_id?: string;
          reward_id?: string;
          status?: Database["public"]["Enums"]["RewardStatus"];
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "playerReward_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
          },
          {
            foreignKeyName: "playerReward_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playerReward_reward_id_fkey";
            columns: ["reward_id"];
            isOneToOne: false;
            referencedRelation: "reward";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playerReward_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
        ];
      };
      ratingslip: {
        Row: {
          accumulated_seconds: number;
          average_bet: number;
          end_time: string | null;
          game_settings: Json;
          game_settings_id: string | null;
          gaming_table_id: string | null;
          id: string;
          pause_intervals: Json | null;
          playerId: string;
          seat_number: number | null;
          start_time: string;
          status: Database["public"]["Enums"]["RatingSlipStatus"];
          version: number;
          visit_id: string | null;
        };
        Insert: {
          accumulated_seconds?: number;
          average_bet: number;
          end_time?: string | null;
          game_settings: Json;
          game_settings_id?: string | null;
          gaming_table_id?: string | null;
          id?: string;
          pause_intervals?: Json | null;
          playerId: string;
          seat_number?: number | null;
          start_time: string;
          status?: Database["public"]["Enums"]["RatingSlipStatus"];
          version?: number;
          visit_id?: string | null;
        };
        Update: {
          accumulated_seconds?: number;
          average_bet?: number;
          end_time?: string | null;
          game_settings?: Json;
          game_settings_id?: string | null;
          gaming_table_id?: string | null;
          id?: string;
          pause_intervals?: Json | null;
          playerId?: string;
          seat_number?: number | null;
          start_time?: string;
          status?: Database["public"]["Enums"]["RatingSlipStatus"];
          version?: number;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ratingslip_game_settings_id_fkey";
            columns: ["game_settings_id"];
            isOneToOne: false;
            referencedRelation: "gamesettings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ratingslip_gaming_table_id_fkey";
            columns: ["gaming_table_id"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ratingslip_playerId_fkey";
            columns: ["playerId"];
            isOneToOne: false;
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
          },
          {
            foreignKeyName: "ratingslip_playerId_fkey";
            columns: ["playerId"];
            isOneToOne: false;
            referencedRelation: "player";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ratingslip_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
        ];
      };
      Report: {
        Row: {
          format: Database["public"]["Enums"]["ReportFormat"];
          generatedAt: string;
          generatedById: string;
          id: string;
          name: string;
          parameters: Json;
          type: Database["public"]["Enums"]["ReportType"];
        };
        Insert: {
          format: Database["public"]["Enums"]["ReportFormat"];
          generatedAt?: string;
          generatedById: string;
          id?: string;
          name: string;
          parameters: Json;
          type: Database["public"]["Enums"]["ReportType"];
        };
        Update: {
          format?: Database["public"]["Enums"]["ReportFormat"];
          generatedAt?: string;
          generatedById?: string;
          id?: string;
          name?: string;
          parameters?: Json;
          type?: Database["public"]["Enums"]["ReportType"];
        };
        Relationships: [
          {
            foreignKeyName: "Report_generatedById_fkey";
            columns: ["generatedById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      reward: {
        Row: {
          casino_id: string | null;
          created_at: string;
          criteria: Json;
          description: string | null;
          expiry_duration: number | null;
          id: string;
          issuance_limit: number | null;
          name: string;
          type: Database["public"]["Enums"]["RewardType"];
          updated_at: string;
        };
        Insert: {
          casino_id?: string | null;
          created_at?: string;
          criteria: Json;
          description?: string | null;
          expiry_duration?: number | null;
          id?: string;
          issuance_limit?: number | null;
          name: string;
          type: Database["public"]["Enums"]["RewardType"];
          updated_at?: string;
        };
        Update: {
          casino_id?: string | null;
          created_at?: string;
          criteria?: Json;
          description?: string | null;
          expiry_duration?: number | null;
          id?: string;
          issuance_limit?: number | null;
          name?: string;
          type?: Database["public"]["Enums"]["RewardType"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reward_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
      RFIDChipMovement: {
        Row: {
          chipSerial: string;
          eventType: Database["public"]["Enums"]["RFIDEvent"];
          gamingTableId: string | null;
          id: string;
          location: string;
          staffId: string | null;
          timestamp: string;
        };
        Insert: {
          chipSerial: string;
          eventType: Database["public"]["Enums"]["RFIDEvent"];
          gamingTableId?: string | null;
          id?: string;
          location: string;
          staffId?: string | null;
          timestamp?: string;
        };
        Update: {
          chipSerial?: string;
          eventType?: Database["public"]["Enums"]["RFIDEvent"];
          gamingTableId?: string | null;
          id?: string;
          location?: string;
          staffId?: string | null;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RFIDChipMovement_gamingTableId_fkey";
            columns: ["gamingTableId"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RFIDChipMovement_staffId_fkey";
            columns: ["staffId"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      ShiftHandover: {
        Row: {
          fromDealerId: string;
          gamingTableId: string;
          id: string;
          shiftEnd: string;
          shiftStart: string;
          signedByFrom: string;
          signedByTo: string;
          timestamp: string;
          toDealerId: string;
        };
        Insert: {
          fromDealerId: string;
          gamingTableId: string;
          id?: string;
          shiftEnd: string;
          shiftStart: string;
          signedByFrom: string;
          signedByTo: string;
          timestamp?: string;
          toDealerId: string;
        };
        Update: {
          fromDealerId?: string;
          gamingTableId?: string;
          id?: string;
          shiftEnd?: string;
          shiftStart?: string;
          signedByFrom?: string;
          signedByTo?: string;
          timestamp?: string;
          toDealerId?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ShiftHandover_fromDealerId_fkey";
            columns: ["fromDealerId"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ShiftHandover_gamingTableId_fkey";
            columns: ["gamingTableId"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ShiftHandover_toDealerId_fkey";
            columns: ["toDealerId"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      Staff: {
        Row: {
          createdAt: string;
          email: string;
          firstName: string;
          id: string;
          lastName: string;
          role: Database["public"]["Enums"]["StaffRole"];
          updatedAt: string;
        };
        Insert: {
          createdAt?: string;
          email: string;
          firstName: string;
          id?: string;
          lastName: string;
          role: Database["public"]["Enums"]["StaffRole"];
          updatedAt: string;
        };
        Update: {
          createdAt?: string;
          email?: string;
          firstName?: string;
          id?: string;
          lastName?: string;
          role?: Database["public"]["Enums"]["StaffRole"];
          updatedAt?: string;
        };
        Relationships: [];
      };
      staff_permissions: {
        Row: {
          capabilities: string[];
          created_at: string;
          staff_id: string;
          updated_at: string;
        };
        Insert: {
          capabilities?: string[];
          created_at?: string;
          staff_id: string;
          updated_at?: string;
        };
        Update: {
          capabilities?: string[];
          created_at?: string;
          staff_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_permissions_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: true;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      TableInventorySlip: {
        Row: {
          closedAt: string | null;
          closedById: string | null;
          finalCount: Json | null;
          gamingTableId: string;
          id: string;
          initialCount: Json;
          openedAt: string;
          openedById: string;
          slipType: Database["public"]["Enums"]["InventorySlipType"];
        };
        Insert: {
          closedAt?: string | null;
          closedById?: string | null;
          finalCount?: Json | null;
          gamingTableId: string;
          id?: string;
          initialCount: Json;
          openedAt?: string;
          openedById: string;
          slipType: Database["public"]["Enums"]["InventorySlipType"];
        };
        Update: {
          closedAt?: string | null;
          closedById?: string | null;
          finalCount?: Json | null;
          gamingTableId?: string;
          id?: string;
          initialCount?: Json;
          openedAt?: string;
          openedById?: string;
          slipType?: Database["public"]["Enums"]["InventorySlipType"];
        };
        Relationships: [
          {
            foreignKeyName: "TableInventorySlip_closedById_fkey";
            columns: ["closedById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "TableInventorySlip_gamingTableId_fkey";
            columns: ["gamingTableId"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "TableInventorySlip_openedById_fkey";
            columns: ["openedById"];
            isOneToOne: false;
            referencedRelation: "Staff";
            referencedColumns: ["id"];
          },
        ];
      };
      visit: {
        Row: {
          casino_id: string;
          check_in_date: string;
          check_out_date: string | null;
          id: string;
          mode: Database["public"]["Enums"]["VisitMode"];
          player_id: string;
          status: Database["public"]["Enums"]["VisitStatus"];
        };
        Insert: {
          casino_id: string;
          check_in_date: string;
          check_out_date?: string | null;
          id?: string;
          mode?: Database["public"]["Enums"]["VisitMode"];
          player_id: string;
          status?: Database["public"]["Enums"]["VisitStatus"];
        };
        Update: {
          casino_id?: string;
          check_in_date?: string;
          check_out_date?: string | null;
          id?: string;
          mode?: Database["public"]["Enums"]["VisitMode"];
          player_id?: string;
          status?: Database["public"]["Enums"]["VisitStatus"];
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
            referencedRelation: "mtl_compliance_context";
            referencedColumns: ["player_uuid"];
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
      mtl_compliance_context: {
        Row: {
          amount: number | null;
          area: Database["public"]["Enums"]["MtlArea"] | null;
          casino_id: string | null;
          correlation_id: string | null;
          created_at: string | null;
          ctr_percentage: number | null;
          direction: Database["public"]["Enums"]["MtlDirection"] | null;
          event_time: string | null;
          gaming_day: string | null;
          id: number | null;
          idempotency_key: string | null;
          location_note: string | null;
          loyalty_balance_after: number | null;
          loyalty_balance_before: number | null;
          loyalty_ledger_id: string | null;
          loyalty_reason: string | null;
          loyalty_source: string | null;
          loyalty_staff_id: string | null;
          loyalty_tier_after: string | null;
          loyalty_tier_before: string | null;
          loyalty_transaction_type: string | null;
          notes: string | null;
          patron_id: string | null;
          person_description: string | null;
          person_last_name: string | null;
          person_name: string | null;
          player_first_name: string | null;
          player_last_name: string | null;
          player_uuid: string | null;
          points_change: number | null;
          proximity_status: string | null;
          rating_slip_id: string | null;
          recorded_by_employee_id: string | null;
          recorded_by_signature: string | null;
          session_avg_bet: number | null;
          session_duration_seconds: number | null;
          session_status:
            | Database["public"]["Enums"]["RatingSlipStatus"]
            | null;
          staff_first_name: string | null;
          staff_last_name: string | null;
          staff_role: Database["public"]["Enums"]["StaffRole"] | null;
          table_number: string | null;
          tender_type: Database["public"]["Enums"]["TenderType"] | null;
          threshold_status: string | null;
          updated_at: string | null;
          visit_check_in: string | null;
          visit_check_out: string | null;
          visit_id: string | null;
          watchlist_percentage: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "mtl_entry_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "ratingslip";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "ratingslip_with_financials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_recorded_by_employee_id_fkey";
            columns: ["recorded_by_employee_id"];
            isOneToOne: false;
            referencedRelation: "Staff";
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
      mtl_daily_summary: {
        Row: {
          area_breakdown: Json | null;
          casino_id: string | null;
          ctr_candidates: number | null;
          gaming_day: string | null;
          total_cash_in: number | null;
          total_cash_out: number | null;
          total_transactions: number | null;
          unique_patrons: number | null;
          watchlist_candidates: number | null;
        };
        Relationships: [];
      };
      mtl_entry_with_notes: {
        Row: {
          amount: number | null;
          area: Database["public"]["Enums"]["MtlArea"] | null;
          audit_notes: Json | null;
          casino_id: string | null;
          correlation_id: string | null;
          created_at: string | null;
          direction: Database["public"]["Enums"]["MtlDirection"] | null;
          event_time: string | null;
          gaming_day: string | null;
          id: number | null;
          idempotency_key: string | null;
          location_note: string | null;
          notes: string | null;
          patron_id: string | null;
          person_description: string | null;
          person_last_name: string | null;
          person_name: string | null;
          rating_slip_id: string | null;
          recorded_by_employee_id: string | null;
          recorded_by_signature: string | null;
          table_number: string | null;
          tender_type: Database["public"]["Enums"]["TenderType"] | null;
          updated_at: string | null;
          visit_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mtl_entry_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "ratingslip";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_rating_slip_id_fkey";
            columns: ["rating_slip_id"];
            isOneToOne: false;
            referencedRelation: "ratingslip_with_financials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mtl_entry_recorded_by_employee_id_fkey";
            columns: ["recorded_by_employee_id"];
            isOneToOne: false;
            referencedRelation: "Staff";
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
      mtl_patron_aggregates: {
        Row: {
          cash_in_count: number | null;
          cash_in_total: number | null;
          cash_out_count: number | null;
          cash_out_total: number | null;
          casino_id: string | null;
          first_transaction_time: string | null;
          gaming_day: string | null;
          last_transaction_time: string | null;
          max_direction_total: number | null;
          patron_id: string | null;
          patron_key: string | null;
          person_description: string | null;
          person_last_name: string | null;
          person_name: string | null;
          transaction_count: number | null;
        };
        Relationships: [];
      };
      mtl_performance_metrics: {
        Row: {
          avg_amount: number | null;
          avg_transactions_per_hour: number | null;
          casino_id: string | null;
          gaming_day: string | null;
          max_amount: number | null;
          transaction_count: number | null;
          unique_patrons: number | null;
          volume_status: string | null;
        };
        Relationships: [];
      };
      mtl_threshold_monitor: {
        Row: {
          cash_in_count: number | null;
          cash_in_total: number | null;
          cash_out_count: number | null;
          cash_out_total: number | null;
          casino_id: string | null;
          ctr_percentage: number | null;
          ctr_threshold: number | null;
          first_transaction_time: string | null;
          gaming_day: string | null;
          last_transaction_time: string | null;
          max_direction_total: number | null;
          patron_id: string | null;
          patron_key: string | null;
          person_description: string | null;
          person_last_name: string | null;
          person_name: string | null;
          proximity_status: string | null;
          threshold_status: string | null;
          transaction_count: number | null;
          watchlist_floor: number | null;
          watchlist_percentage: number | null;
        };
        Relationships: [];
      };
      ratingslip_with_financials: {
        Row: {
          average_bet: number | null;
          cash_in: number | null;
          chips_brought: number | null;
          chips_taken: number | null;
          end_time: string | null;
          financial_transaction_count: number | null;
          game_settings: Json | null;
          gaming_table_id: string | null;
          id: string | null;
          last_transaction_at: string | null;
          seat_number: number | null;
          start_time: string | null;
          visit_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ratingslip_gaming_table_id_fkey";
            columns: ["gaming_table_id"];
            isOneToOne: false;
            referencedRelation: "gamingtable";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ratingslip_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
        ];
      };
      visit_financial_summary: {
        Row: {
          last_transaction_at: string | null;
          total_cash_in: number | null;
          total_chips_brought: number | null;
          total_chips_taken: number | null;
          transaction_count: number | null;
          visit_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_financial_transaction_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
        ];
      };
      visit_financial_summary_gd: {
        Row: {
          casino_id: string | null;
          gaming_day: string | null;
          gaming_day_start: string | null;
          last_transaction_at: string | null;
          timezone: string | null;
          total_cash_in: number | null;
          total_chips_brought: number | null;
          total_chips_taken: number | null;
          transaction_count: number | null;
          visit_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_financial_transaction_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visit_casino_id_fkey";
            columns: ["casino_id"];
            isOneToOne: false;
            referencedRelation: "casino";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      close_player_session: {
        Args: {
          p_chips_taken: number;
          p_end_time?: string;
          p_rating_slip_id: string;
          p_visit_id: string;
        };
        Returns: undefined;
      };
      close_visit: {
        Args: {
          p_auto_close_slips?: boolean;
          p_idempotency_key?: string;
          p_staff_id: string;
          p_visit_id: string;
        };
        Returns: Json;
      };
      convert_unrated_to_rated: {
        Args: {
          p_idempotency_key?: string;
          p_seat_number?: number;
          p_staff_id: string;
          p_table_id: string;
          p_visit_id: string;
        };
        Returns: Json;
      };
      create_performance_alert: {
        Args: {
          p_actual_value?: number;
          p_alert_type: string;
          p_message?: string;
          p_metadata?: Json;
          p_metric_name: string;
          p_metric_type: string;
          p_severity: string;
          p_threshold_value?: number;
        };
        Returns: string;
      };
      gbt_bit_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_bool_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_bool_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_bpchar_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_bytea_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_cash_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_cash_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_date_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_date_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_decompress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_enum_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_enum_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_float4_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_float4_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_float8_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_float8_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_inet_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_int2_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_int2_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_int4_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_int4_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_int8_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_int8_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_intv_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_intv_decompress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_intv_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_macad_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_macad_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_macad8_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_macad8_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_numeric_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_oid_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_oid_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_text_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_time_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_time_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_timetz_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_ts_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_ts_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_tstz_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_uuid_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_uuid_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_var_decompress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbt_var_fetch: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey_var_in: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey_var_out: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey16_in: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey16_out: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey2_in: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey2_out: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey32_in: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey32_out: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey4_in: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey4_out: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey8_in: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gbtreekey8_out: {
        Args: { "": unknown };
        Returns: unknown;
      };
      get_permissions_by_role: {
        Args: { staff_role: string };
        Returns: Json;
      };
      gtrgm_compress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gtrgm_decompress: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gtrgm_in: {
        Args: { "": unknown };
        Returns: unknown;
      };
      gtrgm_options: {
        Args: { "": unknown };
        Returns: undefined;
      };
      gtrgm_out: {
        Args: { "": unknown };
        Returns: unknown;
      };
      increment_player_loyalty: {
        Args: { p_delta_points: number; p_player_id: string };
        Returns: {
          balance_after: number;
          balance_before: number;
          current_balance: number;
          lifetime_points: number;
          player_id: string;
          row_locked: boolean;
          tier: string;
          tier_after: string;
          tier_before: string;
          tier_progress: number;
          updated_at: string;
        }[];
      };
      jwt_get_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["StaffRole"];
      };
      populate_staff_claims: {
        Args: { user_email: string };
        Returns: Json;
      };
      refresh_user_claims: {
        Args: { user_email: string };
        Returns: Json;
      };
      resolve_performance_alert: {
        Args: { alert_id: string };
        Returns: boolean;
      };
      set_limit: {
        Args: { "": number };
        Returns: number;
      };
      show_limit: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      show_trgm: {
        Args: { "": string };
        Returns: string[];
      };
      start_rated_visit: {
        Args: {
          p_average_bet?: number;
          p_casino_id: string;
          p_game_settings_id?: string;
          p_idempotency_key?: string;
          p_player_id: string;
          p_seat_number?: number;
          p_staff_id: string;
          p_table_id: string;
        };
        Returns: Json;
      };
      start_unrated_visit: {
        Args: {
          p_casino_id: string;
          p_idempotency_key?: string;
          p_player_id: string;
          p_staff_id: string;
        };
        Returns: Json;
      };
      validate_visit_seat_availability: {
        Args: {
          p_exclude_player_id?: string;
          p_seat_number: number;
          p_table_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      AlertType: "CTR" | "MTL" | "VARIANCE" | "BREAK_OVERDUE" | "SECURITY";
      AlertTypePerf:
        | "threshold_breach"
        | "sla_violation"
        | "error_spike"
        | "performance_degradation";
      CountType: "INITIAL" | "PERIODIC" | "CLOSING";
      financial_event_type:
        | "CASH_IN"
        | "CHIPS_BROUGHT"
        | "CHIPS_TAKEN"
        | "REVERSAL";
      Gender: "M" | "F";
      InventorySlipType: "OPEN" | "CLOSE";
      KeyAction: "CHECKOUT" | "RETURN";
      LedgerDirection: "CREDIT" | "DEBIT";
      MetricType:
        | "page_load"
        | "api_response"
        | "ui_interaction"
        | "resource_load"
        | "error";
      MtlArea:
        | "pit"
        | "cage"
        | "slot"
        | "poker"
        | "kiosk"
        | "sportsbook"
        | "other";
      MtlDirection: "cash_in" | "cash_out";
      RatingSlipStatus: "OPEN" | "CLOSED" | "PAUSED";
      reconciliationstatus: "PENDING" | "RECONCILED" | "DISCREPANCY";
      ReportFormat: "PDF" | "CSV" | "JSON";
      ReportType: "SHIFT_SUMMARY" | "DAILY_OVERVIEW" | "CUSTOM";
      RewardStatus: "PENDING" | "ISSUED" | "REDEEMED" | "EXPIRED";
      RewardType: "MATCH_PLAY_LEVEL" | "MEAL_COMPLIMENTARY";
      RFIDEvent: "IN" | "OUT";
      Severity: "low" | "medium" | "high" | "critical";
      StaffRole: "DEALER" | "SUPERVISOR" | "PIT_BOSS" | "AUDITOR";
      TenderType:
        | "cash"
        | "cashier_check"
        | "tito"
        | "money_order"
        | "chips"
        | "other";
      transactiontype: "DEPOSIT" | "WITHDRAWAL" | "EXCHANGE" | "ADJUSTMENT";
      VisitMode: "RATED" | "UNRATED";
      VisitStatus: "ONGOING" | "COMPLETED" | "CANCELED";
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
      AlertType: ["CTR", "MTL", "VARIANCE", "BREAK_OVERDUE", "SECURITY"],
      AlertTypePerf: [
        "threshold_breach",
        "sla_violation",
        "error_spike",
        "performance_degradation",
      ],
      CountType: ["INITIAL", "PERIODIC", "CLOSING"],
      financial_event_type: [
        "CASH_IN",
        "CHIPS_BROUGHT",
        "CHIPS_TAKEN",
        "REVERSAL",
      ],
      Gender: ["M", "F"],
      InventorySlipType: ["OPEN", "CLOSE"],
      KeyAction: ["CHECKOUT", "RETURN"],
      LedgerDirection: ["CREDIT", "DEBIT"],
      MetricType: [
        "page_load",
        "api_response",
        "ui_interaction",
        "resource_load",
        "error",
      ],
      MtlArea: ["pit", "cage", "slot", "poker", "kiosk", "sportsbook", "other"],
      MtlDirection: ["cash_in", "cash_out"],
      RatingSlipStatus: ["OPEN", "CLOSED", "PAUSED"],
      reconciliationstatus: ["PENDING", "RECONCILED", "DISCREPANCY"],
      ReportFormat: ["PDF", "CSV", "JSON"],
      ReportType: ["SHIFT_SUMMARY", "DAILY_OVERVIEW", "CUSTOM"],
      RewardStatus: ["PENDING", "ISSUED", "REDEEMED", "EXPIRED"],
      RewardType: ["MATCH_PLAY_LEVEL", "MEAL_COMPLIMENTARY"],
      RFIDEvent: ["IN", "OUT"],
      Severity: ["low", "medium", "high", "critical"],
      StaffRole: ["DEALER", "SUPERVISOR", "PIT_BOSS", "AUDITOR"],
      TenderType: [
        "cash",
        "cashier_check",
        "tito",
        "money_order",
        "chips",
        "other",
      ],
      transactiontype: ["DEPOSIT", "WITHDRAWAL", "EXCHANGE", "ADJUSTMENT"],
      VisitMode: ["RATED", "UNRATED"],
      VisitStatus: ["ONGOING", "COMPLETED", "CANCELED"],
    },
  },
} as const;
