// Generated-style types for the Supabase schema.
// Regenerate after changing migrations:  npm run db:types   (from the repo root)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          timezone: string;
          onboarded: boolean;
          created_at: string;
          last_seen_at: string | null;
          screen_time_status: string | null;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          timezone?: string;
          onboarded?: boolean;
          created_at?: string;
          last_seen_at?: string | null;
          screen_time_status?: string | null;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          timezone?: string;
          onboarded?: boolean;
          created_at?: string;
          last_seen_at?: string | null;
          screen_time_status?: string | null;
        };
        Relationships: [];
      };
      partnerships: {
        Row: {
          id: string;
          owner_id: string;
          partner_id: string;
          status: string;
          created_at: string;
          removal_effective_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          partner_id: string;
          status?: string;
          created_at?: string;
          removal_effective_at?: string | null;
        };
        Update: {
          id?: string;
          owner_id?: string;
          partner_id?: string;
          status?: string;
          created_at?: string;
          removal_effective_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'partnerships_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'partnerships_partner_id_fkey';
            columns: ['partner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      limits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: Database['public']['Enums']['limit_kind'];
          minutes: number;
          strictness: Database['public']['Enums']['strictness'];
          approvals_required: number;
          active: boolean;
          created_at: string;
          pending_change: Json | null;
          pending_effective_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          kind: Database['public']['Enums']['limit_kind'];
          minutes: number;
          strictness?: Database['public']['Enums']['strictness'];
          approvals_required?: number;
          active?: boolean;
          created_at?: string;
          pending_change?: Json | null;
          pending_effective_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          kind?: Database['public']['Enums']['limit_kind'];
          minutes?: number;
          strictness?: Database['public']['Enums']['strictness'];
          approvals_required?: number;
          active?: boolean;
          created_at?: string;
          pending_change?: Json | null;
          pending_effective_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'limits_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      extension_requests: {
        Row: {
          id: string;
          requester_id: string;
          limit_id: string | null;
          minutes_requested: number;
          reason: string | null;
          status: Database['public']['Enums']['request_status'];
          minutes_granted: number | null;
          approvals_required: number;
          expires_at: string;
          decided_at: string | null;
          created_at: string;
          emergency: boolean;
        };
        Insert: {
          id?: string;
          requester_id: string;
          limit_id?: string | null;
          minutes_requested: number;
          reason?: string | null;
          status?: Database['public']['Enums']['request_status'];
          minutes_granted?: number | null;
          approvals_required?: number;
          expires_at?: string;
          decided_at?: string | null;
          created_at?: string;
          emergency?: boolean;
        };
        Update: {
          id?: string;
          requester_id?: string;
          limit_id?: string | null;
          minutes_requested?: number;
          reason?: string | null;
          status?: Database['public']['Enums']['request_status'];
          minutes_granted?: number | null;
          approvals_required?: number;
          expires_at?: string;
          decided_at?: string | null;
          created_at?: string;
          emergency?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'extension_requests_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'extension_requests_limit_id_fkey';
            columns: ['limit_id'];
            isOneToOne: false;
            referencedRelation: 'limits';
            referencedColumns: ['id'];
          },
        ];
      };
      request_votes: {
        Row: {
          request_id: string;
          voter_id: string;
          decision: string;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          request_id: string;
          voter_id: string;
          decision: string;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          request_id?: string;
          voter_id?: string;
          decision?: string;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_votes_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'extension_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_votes_voter_id_fkey';
            columns: ['voter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token?: string;
          platform?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tamper_events: {
        Row: { id: string; user_id: string; kind: string; created_at: string };
        Insert: { id?: string; user_id: string; kind: string; created_at?: string };
        Update: { id?: string; user_id?: string; kind?: string; created_at?: string };
        Relationships: [
          {
            foreignKeyName: 'tamper_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      vote_tokens: {
        Row: {
          token_hash: string;
          request_id: string;
          voter_id: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          token_hash: string;
          request_id: string;
          voter_id: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          token_hash?: string;
          request_id?: string;
          voter_id?: string;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invite: { Args: { p_partnership: string }; Returns: undefined };
      cancel_partner_removal: { Args: { p_partnership: string }; Returns: undefined };
      cancel_request: { Args: { p_request: string }; Returns: undefined };
      emergency_unlock: { Args: { p_minutes: number; p_reason: string; p_limit?: string | null }; Returns: string };
      can_vote: { Args: { p_request: string }; Returns: boolean };
      invite_partner: { Args: { p_username: string }; Returns: string };
      is_accepted_partner: { Args: { p_owner: string; p_partner: string }; Returns: boolean };
      register_push_token: { Args: { p_token: string; p_platform: string }; Returns: undefined };
      report_screen_time_status: { Args: { p_status: string }; Returns: undefined };
      safe_timezone: { Args: { tz: string }; Returns: string };
      user_stats: { Args: { p_user: string }; Returns: Json };
    };
    Enums: {
      limit_kind: 'daily' | 'session';
      request_status: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';
      strictness: 'relaxed' | 'standard' | 'strict' | 'locked';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
