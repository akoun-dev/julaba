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
      actors: {
        Row: {
          actor_code: string
          actor_type: string
          categorie_marchand: string | null
          created_at: string
          first_name: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          identificateur_name: string | null
          identificateur_user_id: string | null
          last_name: string | null
          linked_merchant_user_id: string | null
          linked_producer_user_id: string | null
          notes: string | null
          organization_id: string
          phone: string
          photo_path: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validated_by_user_id: string | null
          zone_id: string
        }
        Insert: {
          actor_code: string
          actor_type?: string
          categorie_marchand?: string | null
          created_at?: string
          first_name: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          identificateur_name?: string | null
          identificateur_user_id?: string | null
          last_name?: string | null
          linked_merchant_user_id?: string | null
          linked_producer_user_id?: string | null
          notes?: string | null
          organization_id: string
          phone: string
          photo_path?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by_user_id?: string | null
          zone_id: string
        }
        Update: {
          actor_code?: string
          actor_type?: string
          categorie_marchand?: string | null
          created_at?: string
          first_name?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          identificateur_name?: string | null
          identificateur_user_id?: string | null
          last_name?: string | null
          linked_merchant_user_id?: string | null
          linked_producer_user_id?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string
          photo_path?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by_user_id?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actor_zone_same_org"
            columns: ["organization_id", "zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "actors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by_user_id: string | null
          created_at: string
          id: string
          message: string
          module: string
          organization_id: string
          severity: string
          title: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by_user_id?: string | null
          created_at?: string
          id?: string
          message: string
          module: string
          organization_id: string
          severity?: string
          title: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by_user_id?: string | null
          created_at?: string
          id?: string
          message?: string
          module?: string
          organization_id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string
          permissions: string
          request_count: number
          secret_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id: string
          permissions?: string
          request_count?: number
          secret_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          permissions?: string
          request_count?: number
          secret_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          metadata: Json
          organization_id: string | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          client_id: string | null
          closed_at: string | null
          closing_amount: number | null
          created_at: string
          id: string
          is_open: boolean
          merchant_user_id: string
          opened_at: string
          opening_float: number
          organization_id: string
          total_expenses: number
          total_sales: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          closed_at?: string | null
          closing_amount?: number | null
          created_at?: string
          id?: string
          is_open?: boolean
          merchant_user_id: string
          opened_at?: string
          opening_float?: number
          organization_id: string
          total_expenses?: number
          total_sales?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          closed_at?: string | null
          closing_amount?: number | null
          created_at?: string
          id?: string
          is_open?: boolean
          merchant_user_id?: string
          opened_at?: string
          opening_float?: number
          organization_id?: string
          total_expenses?: number
          total_sales?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          content: string
          created_at: string
          created_by_user_id: string | null
          delivery_rate: number | null
          id: string
          organization_id: string
          sent_at: string | null
          sent_count: number
          status: string
          target_group: string
          target_zone_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by_user_id?: string | null
          delivery_rate?: number | null
          id?: string
          organization_id: string
          sent_at?: string | null
          sent_count?: number
          status?: string
          target_group?: string
          target_zone_id?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by_user_id?: string | null
          delivery_rate?: number | null
          id?: string
          organization_id?: string
          sent_at?: string | null
          sent_count?: number
          status?: string
          target_group?: string
          target_zone_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_zone_same_org"
            columns: ["organization_id", "target_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "communications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_scores: {
        Row: {
          actor_id: string
          created_at: string
          credit_limit: number | null
          id: string
          last_calculated_at: string | null
          organization_id: string
          risk_level: string
          score: number
          updated_at: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          credit_limit?: number | null
          id?: string
          last_calculated_at?: string | null
          organization_id: string
          risk_level: string
          score: number
          updated_at?: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          credit_limit?: number | null
          id?: string
          last_calculated_at?: string | null
          organization_id?: string
          risk_level?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_scores_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_jobs: {
        Row: {
          avg_duration_ms: number | null
          command: string | null
          created_at: string
          duration_ms: number | null
          id: string
          last_run_at: string | null
          name: string
          next_run_at: string | null
          organization_id: string
          run_count: number
          schedule: string
          status: string
          updated_at: string
        }
        Insert: {
          avg_duration_ms?: number | null
          command?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          organization_id: string
          run_count?: number
          schedule: string
          status?: string
          updated_at?: string
        }
        Update: {
          avg_duration_ms?: number | null
          command?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          organization_id?: string
          run_count?: number
          schedule?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cron_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          address: string
          courier_name: string | null
          created_at: string
          delivered_at: string | null
          id: string
          order_reference: string | null
          organization_id: string
          pickup_at: string | null
          recipient_name: string
          recipient_phone: string
          sender_name: string
          sender_phone: string
          status: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          address: string
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_reference?: string | null
          organization_id: string
          pickup_at?: string | null
          recipient_name: string
          recipient_phone: string
          sender_name: string
          sender_phone: string
          status?: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          address?: string
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_reference?: string | null
          organization_id?: string
          pickup_at?: string | null
          recipient_name?: string
          recipient_phone?: string
          sender_name?: string
          sender_phone?: string
          status?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_zone_same_org"
            columns: ["organization_id", "zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          device_key_hash: string
          expires_at: string
          id: string
          label: string | null
          last_seen_at: string | null
          organization_id: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_key_hash: string
          expires_at: string
          id?: string
          label?: string | null
          last_seen_at?: string | null
          organization_id: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_key_hash?: string
          expires_at?: string
          id?: string
          label?: string | null
          last_seen_at?: string | null
          organization_id?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolments: {
        Row: {
          actor_name: string
          actor_type: string
          categorie_marchand: string | null
          activite: string | null
          created_at: string
          dossier_id: string
          gps_lat: number | null
          gps_lng: number | null
          has_gps: boolean
          has_photo: boolean
          id: string
          identificateur_name: string
          identificateur_user_id: string | null
          organization_id: string
          phone: string
          reject_reason: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validated_by_user_id: string | null
          zone_id: string
        }
        Insert: {
          actor_name: string
          actor_type?: string
          categorie_marchand?: string | null
          activite?: string | null
          created_at?: string
          dossier_id: string
          gps_lat?: number | null
          gps_lng?: number | null
          has_gps?: boolean
          has_photo?: boolean
          id?: string
          identificateur_name: string
          identificateur_user_id?: string | null
          organization_id: string
          phone: string
          reject_reason?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by_user_id?: string | null
          zone_id: string
        }
        Update: {
          actor_name?: string
          actor_type?: string
          categorie_marchand?: string | null
          activite?: string | null
          created_at?: string
          dossier_id?: string
          gps_lat?: number | null
          gps_lng?: number | null
          has_gps?: boolean
          has_photo?: boolean
          id?: string
          identificateur_name?: string
          identificateur_user_id?: string | null
          organization_id?: string
          phone?: string
          reject_reason?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by_user_id?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolment_zone_same_org"
            columns: ["organization_id", "zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "enrolments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          cash_session_id: string | null
          category: string
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          merchant_user_id: string
          organization_id: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          category: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          merchant_user_id: string
          organization_id: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          category?: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          merchant_user_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      harvests: {
        Row: {
          buyer: string | null
          client_id: string | null
          created_at: string
          desired_price_per_kg: number
          harvested_at: string
          id: string
          notes: string | null
          organization_id: string
          photo_paths: Json
          plot: string
          producer_user_id: string
          product_name: string
          quality: string
          quantity_kg: number
          sale_amount: number | null
          status: string
          updated_at: string
        }
        Insert: {
          buyer?: string | null
          client_id?: string | null
          created_at?: string
          desired_price_per_kg: number
          harvested_at: string
          id?: string
          notes?: string | null
          organization_id: string
          photo_paths?: Json
          plot: string
          producer_user_id: string
          product_name: string
          quality?: string
          quantity_kg: number
          sale_amount?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          buyer?: string | null
          client_id?: string | null
          created_at?: string
          desired_price_per_kg?: number
          harvested_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          photo_paths?: Json
          plot?: string
          producer_user_id?: string
          product_name?: string
          quality?: string
          quantity_kg?: number
          sale_amount?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "harvests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          linked_actors: number
          name: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          linked_actors?: number
          name: string
          organization_id: string
          type: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          linked_actors?: number
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institutions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      keiwa_accounts: {
        Row: {
          balance: number
          created_at: string
          holder_name: string
          holder_phone: string
          id: string
          is_active: boolean
          organization_id: string
          transaction_count: number
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          holder_name: string
          holder_phone: string
          id?: string
          is_active?: boolean
          organization_id: string
          transaction_count?: number
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          holder_name?: string
          holder_phone?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          transaction_count?: number
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keiwa_account_zone_same_org"
            columns: ["organization_id", "zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "keiwa_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      keiwa_transactions: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          id: string
          organization_id: string
          recipient_name: string | null
          recipient_phone: string | null
          sender_name: string | null
          sender_phone: string | null
          status: string
          type: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          id?: string
          organization_id: string
          recipient_name?: string | null
          recipient_phone?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          status?: string
          type: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          organization_id?: string
          recipient_name?: string | null
          recipient_phone?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "keiwa_transaction_same_org"
            columns: ["organization_id", "account_id"]
            isOneToOne: false
            referencedRelation: "keiwa_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "keiwa_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "keiwa_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keiwa_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          assignee_name: string | null
          assignee_user_id: string | null
          created_at: string
          current_count: number
          description: string | null
          ends_on: string | null
          id: string
          organization_id: string
          starts_on: string
          status: string
          target_count: number
          title: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          assignee_name?: string | null
          assignee_user_id?: string | null
          created_at?: string
          current_count?: number
          description?: string | null
          ends_on?: string | null
          id?: string
          organization_id: string
          starts_on: string
          status?: string
          target_count?: number
          title: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          assignee_name?: string | null
          assignee_user_id?: string | null
          created_at?: string
          current_count?: number
          description?: string | null
          ends_on?: string | null
          id?: string
          organization_id?: string
          starts_on?: string
          status?: string
          target_count?: number
          title?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_zone_same_org"
            columns: ["organization_id", "zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "missions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_reports: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          reason: string
          reported_by_user_id: string | null
          severity: string
          status: string
          target_id: string | null
          target_name: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          reason: string
          reported_by_user_id?: string | null
          severity?: string
          status?: string
          target_id?: string | null
          target_name?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          reason?: string
          reported_by_user_id?: string | null
          severity?: string
          status?: string
          target_id?: string | null
          target_name?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mutations: {
        Row: {
          actor_id: string
          created_at: string
          from_zone_id: string
          id: string
          organization_id: string
          processed_at: string | null
          processed_by_user_id: string | null
          reason: string | null
          requested_at: string
          requested_by_user_id: string | null
          status: string
          to_zone_id: string
          updated_at: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          from_zone_id: string
          id?: string
          organization_id: string
          processed_at?: string | null
          processed_by_user_id?: string | null
          reason?: string | null
          requested_at?: string
          requested_by_user_id?: string | null
          status?: string
          to_zone_id: string
          updated_at?: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          from_zone_id?: string
          id?: string
          organization_id?: string
          processed_at?: string | null
          processed_by_user_id?: string | null
          reason?: string | null
          requested_at?: string
          requested_by_user_id?: string | null
          status?: string
          to_zone_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutation_from_zone_same_org"
            columns: ["organization_id", "from_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "mutation_to_zone_same_org"
            columns: ["organization_id", "to_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "mutations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          id: string
          organization_id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          id?: string
          organization_id: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          is_active: boolean
          organization_id: string
          role: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          organization_id: string
          role: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          is_active?: boolean
          organization_id?: string
          role?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_zone_same_org"
            columns: ["organization_id", "zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          code: string
          module: string
        }
        Insert: {
          code: string
          module: string
        }
        Update: {
          code?: string
          module?: string
        }
        Relationships: []
      }
      platform_configs: {
        Row: {
          category: string
          config: Json
          created_at: string
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          category: string
          config?: Json
          created_at?: string
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          config?: Json
          created_at?: string
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_journals: {
        Row: {
          client_id: string | null
          created_at: string
          cycle_id: string
          entry_date: string
          id: string
          organization_id: string
          photo_path: string | null
          producer_user_id: string
          text: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          cycle_id: string
          entry_date: string
          id?: string
          organization_id: string
          photo_path?: string | null
          producer_user_id: string
          text: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          cycle_id?: string
          entry_date?: string
          id?: string
          organization_id?: string
          photo_path?: string | null
          producer_user_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_journals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_orders: {
        Row: {
          amount: number
          buyer_name: string
          carrier: string | null
          client_id: string | null
          created_at: string
          desired_delivery_date: string
          id: string
          is_urgent: boolean
          organization_id: string
          producer_user_id: string
          product_name: string
          quantity_kg: number
          reference: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_name: string
          carrier?: string | null
          client_id?: string | null
          created_at?: string
          desired_delivery_date: string
          id?: string
          is_urgent?: boolean
          organization_id: string
          producer_user_id: string
          product_name: string
          quantity_kg: number
          reference: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_name?: string
          carrier?: string | null
          client_id?: string | null
          created_at?: string
          desired_delivery_date?: string
          id?: string
          is_urgent?: boolean
          organization_id?: string
          producer_user_id?: string
          product_name?: string
          quantity_kg?: number
          reference?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          client_id: string | null
          created_at: string
          id: string
          image_path: string | null
          is_active: boolean
          merchant_user_id: string
          name: string
          organization_id: string
          price_unit: number
          stock_qty: number
          updated_at: string
        }
        Insert: {
          category?: string
          client_id?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          merchant_user_id: string
          name: string
          organization_id: string
          price_unit?: number
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          category?: string
          client_id?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          merchant_user_id?: string
          name?: string
          organization_id?: string
          price_unit?: number
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          actor_type: string
          created_at: string
          first_name: string
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          actor_type?: string
          created_at?: string
          first_name?: string
          id: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          actor_type?: string
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_code: string
          role_code: string
        }
        Insert: {
          permission_code: string
          role_code: string
        }
        Update: {
          permission_code?: string
          role_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          is_backoffice: boolean
          label: string
          rank: number
        }
        Insert: {
          code: string
          is_backoffice?: boolean
          label: string
          rank: number
        }
        Update: {
          code?: string
          is_backoffice?: boolean
          label?: string
          rank?: number
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          id: string
          product_id: string
          product_name: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          id?: string
          product_id: string
          product_name: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
        }
        Update: {
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          sale_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_received: number
          cash_session_id: string | null
          change_amount: number
          client_id: string | null
          created_at: string
          id: string
          merchant_user_id: string
          note: string | null
          organization_id: string
          total_amount: number
        }
        Insert: {
          amount_received?: number
          cash_session_id?: string | null
          change_amount?: number
          client_id?: string | null
          created_at?: string
          id?: string
          merchant_user_id: string
          note?: string | null
          organization_id: string
          total_amount: number
        }
        Update: {
          amount_received?: number
          cash_session_id?: string | null
          change_amount?: number
          client_id?: string | null
          created_at?: string
          id?: string
          merchant_user_id?: string
          note?: string | null
          organization_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          movement_type: string
          organization_id: string
          product_id: string
          quantity: number
          reason: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          movement_type: string
          organization_id: string
          product_id: string
          quantity: number
          reason?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          movement_type?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflict_reports: {
        Row: {
          client_created_at: string | null
          client_id: string | null
          entity: string
          id: string
          message: string
          organization_id: string
          payload: Json
          reported_at: string
          user_id: string
        }
        Insert: {
          client_created_at?: string | null
          client_id?: string | null
          entity: string
          id?: string
          message: string
          organization_id: string
          payload?: Json
          reported_at?: string
          user_id: string
        }
        Update: {
          client_created_at?: string | null
          client_id?: string | null
          entity?: string
          id?: string
          message?: string
          organization_id?: string
          payload?: Json
          reported_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflict_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_events: {
        Row: {
          created_at: string
          id: number
          level: string
          message: string
          metadata: Json
          organization_id: string | null
          source: string
        }
        Insert: {
          created_at?: string
          id?: never
          level?: string
          message: string
          metadata?: Json
          organization_id?: string | null
          source: string
        }
        Update: {
          created_at?: string
          id?: never
          level?: string
          message?: string
          metadata?: Json
          organization_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tontine_contributions: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          id: string
          member_user_id: string
          organization_id: string
          tontine_id: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          id?: string
          member_user_id: string
          organization_id: string
          tontine_id: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          id?: string
          member_user_id?: string
          organization_id?: string
          tontine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribution_same_org"
            columns: ["organization_id", "tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tontine_contributions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tontine_members: {
        Row: {
          client_id: string | null
          id: string
          joined_at: string
          member_user_id: string
          organization_id: string
          tontine_id: string
        }
        Insert: {
          client_id?: string | null
          id?: string
          joined_at?: string
          member_user_id: string
          organization_id: string
          tontine_id: string
        }
        Update: {
          client_id?: string | null
          id?: string
          joined_at?: string
          member_user_id?: string
          organization_id?: string
          tontine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tontine_member_same_org"
            columns: ["organization_id", "tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tontine_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tontines: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          frequency: string
          id: string
          member_count: number
          name: string
          next_due_date: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          frequency?: string
          id?: string
          member_count?: number
          name: string
          next_due_date?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          frequency?: string
          id?: string
          member_count?: number
          name?: string
          next_due_date?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tontines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_contents: {
        Row: {
          author: string | null
          category: string | null
          content: string
          created_at: string
          difficulty: string | null
          duration: string | null
          excerpt: string | null
          id: string
          media_url: string | null
          organization_id: string
          sort_order: number
          status: string
          target_role: string | null
          title: string
          type: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author?: string | null
          category?: string | null
          content: string
          created_at?: string
          difficulty?: string | null
          duration?: string | null
          excerpt?: string | null
          id?: string
          media_url?: string | null
          organization_id: string
          sort_order?: number
          status?: string
          target_role?: string | null
          title: string
          type: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author?: string | null
          category?: string | null
          content?: string
          created_at?: string
          difficulty?: string | null
          duration?: string | null
          excerpt?: string | null
          id?: string
          media_url?: string | null
          organization_id?: string
          sort_order?: number
          status?: string
          target_role?: string | null
          title?: string
          type?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_contents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_logs: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          intent: string | null
          merchant_user_id: string
          organization_id: string
          response_text: string | null
          transcript: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          intent?: string | null
          merchant_user_id: string
          organization_id: string
          response_text?: string | null
          transcript: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          intent?: string | null
          merchant_user_id?: string
          organization_id?: string
          response_text?: string | null
          transcript?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          region: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          region?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_products: {
        Row: {
          category: string
          client_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          merchant_id: string
          name: string
          price_unit: number
          stock_qty: number
          updated_at: string
        }
        Insert: {
          category?: string
          client_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          merchant_id: string
          name: string
          price_unit?: number
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          category?: string
          client_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          merchant_id?: string
          name?: string
          price_unit?: number
          stock_qty?: number
          updated_at?: string
        }
        Relationships: []
      }
      legacy_sales: {
        Row: {
          amount_received: number
          change_amount: number
          client_id: string | null
          created_at: string
          id: string
          is_voice_sale: boolean
          merchant_id: string
          note: string | null
          session_id: string | null
          total_amount: number
          updated_at: string
          voice_transcript: string | null
        }
        Insert: {
          amount_received?: number
          change_amount?: number
          client_id?: string | null
          created_at?: string
          id?: string
          is_voice_sale?: boolean
          merchant_id: string
          note?: string | null
          session_id?: string | null
          total_amount: number
          updated_at?: string
          voice_transcript?: string | null
        }
        Update: {
          amount_received?: number
          change_amount?: number
          client_id?: string | null
          created_at?: string
          id?: string
          is_voice_sale?: boolean
          merchant_id?: string
          note?: string | null
          session_id?: string | null
          total_amount?: number
          updated_at?: string
          voice_transcript?: string | null
        }
        Relationships: []
      }
      legacy_sale_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          subtotal?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      legacy_expenses: {
        Row: {
          amount: number
          category: string
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          is_voice: boolean
          merchant_id: string
          updated_at: string
          voice_transcript: string | null
        }
        Insert: {
          amount: number
          category: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_voice?: boolean
          merchant_id: string
          updated_at?: string
          voice_transcript?: string | null
        }
        Update: {
          amount?: number
          category?: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_voice?: boolean
          merchant_id?: string
          updated_at?: string
          voice_transcript?: string | null
        }
        Relationships: []
      }
      legacy_tontines: {
        Row: {
          amount: number
          created_at: string
          frequency: string
          id: string
          member_count: number
          name: string
          next_due_date: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          frequency?: string
          id?: string
          member_count?: number
          name: string
          next_due_date?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          frequency?: string
          id?: string
          member_count?: number
          name?: string
          next_due_date?: string | null
        }
        Relationships: []
      }
      legacy_tontine_members: {
        Row: {
          id: string
          joined_at: string
          merchant_id: string
          tontine_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          merchant_id: string
          tontine_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          merchant_id?: string
          tontine_id?: string
        }
        Relationships: []
      }
      legacy_tontine_contributions: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          id: string
          merchant_id: string
          tontine_id: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          tontine_id: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          tontine_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      close_cash_session: {
        Args: { p_organization_id: string; p_session_id: string }
        Returns: {
          client_id: string | null
          closed_at: string | null
          closing_amount: number | null
          created_at: string
          id: string
          is_open: boolean
          merchant_user_id: string
          opened_at: string
          opening_float: number
          organization_id: string
          total_expenses: number
          total_sales: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_sale: {
        Args: {
          p_amount_received: number
          p_cash_session_id?: string
          p_client_id: string
          p_items: Json
          p_note: string
          p_organization_id: string
        }
        Returns: {
          amount_received: number
          cash_session_id: string | null
          change_amount: number
          client_id: string | null
          created_at: string
          id: string
          merchant_user_id: string
          note: string | null
          organization_id: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_org_role: {
        Args: { allowed_roles: string[]; target_org: string }
        Returns: boolean
      }
      is_org_member: { Args: { target_org: string }; Returns: boolean }
      open_cash_session: {
        Args: {
          p_client_id?: string
          p_opening_float: number
          p_organization_id: string
        }
        Returns: {
          client_id: string | null
          closed_at: string | null
          closing_amount: number | null
          created_at: string
          id: string
          is_open: boolean
          merchant_user_id: string
          opened_at: string
          opening_float: number
          organization_id: string
          total_expenses: number
          total_sales: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_tontine_contribution: {
        Args: {
          p_amount: number
          p_client_id?: string
          p_organization_id: string
          p_tontine_id: string
        }
        Returns: {
          amount: number
          client_id: string | null
          created_at: string
          id: string
          member_user_id: string
          organization_id: string
          tontine_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tontine_contributions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_enrolment: {
        Args: {
          p_actor_name: string
          p_actor_type: string
          p_dossier_id: string
          p_gps_lat?: number
          p_gps_lng?: number
          p_has_gps?: boolean
          p_has_photo?: boolean
          p_organization_id: string
          p_phone: string
          p_zone_id: string
        }
        Returns: {
          actor_name: string
          actor_type: string
          created_at: string
          dossier_id: string
          gps_lat: number | null
          gps_lng: number | null
          has_gps: boolean
          has_photo: boolean
          id: string
          identificateur_name: string
          identificateur_user_id: string | null
          organization_id: string
          phone: string
          reject_reason: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validated_by_user_id: string | null
          zone_id: string
        }
        SetofOptions: {
          from: "*"
          to: "enrolments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_enrolment: {
        Args: { p_enrolment_id: string; p_reject_reason?: string }
        Returns: {
          actor_name: string
          actor_type: string
          created_at: string
          dossier_id: string
          gps_lat: number | null
          gps_lng: number | null
          has_gps: boolean
          has_photo: boolean
          id: string
          identificateur_name: string
          identificateur_user_id: string | null
          organization_id: string
          phone: string
          reject_reason: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validated_by_user_id: string | null
          zone_id: string
        }
        SetofOptions: {
          from: "*"
          to: "enrolments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_audit_event: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_organization_id: string
          p_resource_id: string
          p_resource_type: string
        }
        Returns: undefined
      }
      write_system_event: {
        Args: {
          p_level: string
          p_message: string
          p_metadata?: Json
          p_organization_id: string
          p_source: string
        }
        Returns: undefined
      }
      write_system_notification: {
        Args: {
          p_body: string
          p_data?: Json
          p_organization_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

