export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      ai_preferences: {
        Row: {
          model: string;
          provider: 'openai' | 'gemini';
          updated_at: string;
          user_id: string;
        };
        Insert: {
          model: string;
          provider: 'openai' | 'gemini';
          updated_at?: string;
          user_id: string;
        };
        Update: {
          model?: string;
          provider?: 'openai' | 'gemini';
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      datasets: {
        Row: {
          active_version_id: string | null;
          created_at: string;
          id: string;
          name: string;
          source_filename: string;
          source_format: 'csv' | 'xlsx' | 'json' | 'jsonl';
          status: 'UPLOADING' | 'UPLOADED' | 'PROFILING' | 'READY' | 'PROCESSING' | 'ERROR';
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          active_version_id?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          source_filename: string;
          source_format: 'csv' | 'xlsx' | 'json' | 'jsonl';
          status?: 'UPLOADING' | 'UPLOADED' | 'PROFILING' | 'READY' | 'PROCESSING' | 'ERROR';
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          active_version_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          source_filename?: string;
          source_format?: 'csv' | 'xlsx' | 'json' | 'jsonl';
          status?: 'UPLOADING' | 'UPLOADED' | 'PROFILING' | 'READY' | 'PROCESSING' | 'ERROR';
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      dataset_versions: {
        Row: {
          bucket_id: string;
          column_count: number;
          content_sha256: string;
          created_at: string;
          created_by: string | null;
          dataset_id: string;
          file_size_bytes: number;
          id: string;
          parent_version_id: string | null;
          row_count: number;
          schema_json: Json;
          storage_path: string;
          version_number: number;
        };
        Insert: {
          bucket_id?: string;
          column_count?: number;
          content_sha256: string;
          created_at?: string;
          created_by?: string | null;
          dataset_id: string;
          file_size_bytes?: number;
          id?: string;
          parent_version_id?: string | null;
          row_count?: number;
          schema_json?: Json;
          storage_path: string;
          version_number: number;
        };
        Update: {
          bucket_id?: string;
          column_count?: number;
          content_sha256?: string;
          created_at?: string;
          created_by?: string | null;
          dataset_id?: string;
          file_size_bytes?: number;
          id?: string;
          parent_version_id?: string | null;
          row_count?: number;
          schema_json?: Json;
          storage_path?: string;
          version_number?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Workspace = Database['public']['Tables']['workspaces']['Row'];
export type AIPreference = Database['public']['Tables']['ai_preferences']['Row'];
export type Dataset = Database['public']['Tables']['datasets']['Row'];
export type DatasetVersion = Database['public']['Tables']['dataset_versions']['Row'];
