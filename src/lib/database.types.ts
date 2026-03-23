export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string
          avatar_url: string | null
          bio: string | null
          is_admin: boolean
          discord_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name: string
          avatar_url?: string | null
          bio?: string | null
          is_admin?: boolean
          discord_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string
          avatar_url?: string | null
          bio?: string | null
          is_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pending_verifications: {
        Row: {
          id: string
          discord_id: string
          display_name: string
          code: string
          expires_at: string
          used: boolean
          created_at: string
        }
        Insert: {
          id?: string
          discord_id: string
          display_name: string
          code: string
          expires_at: string
          used?: boolean
          created_at?: string
        }
        Update: {
          used?: boolean
        }
        Relationships: []
      }
      channels: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          position?: number
        }
        Relationships: []
      }
      posts: {
        Row: {
          id: string
          user_id: string | null   // null = 匿名投稿
          channel_id: string
          content: string
          image_urls: string[]
          is_anonymous: boolean
          parent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          channel_id: string
          content: string
          image_urls?: string[]
          is_anonymous?: boolean
          parent_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          content?: string
          image_urls?: string[]
          is_anonymous?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          }
        ]
      }
      likes: {
        Row: {
          id: string
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      bookmarks: {
        Row: {
          id: string
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      user_channel_preferences: {
        Row: {
          user_id: string
          channel_id: string
          position: number
          visibility: 'visible' | 'main_hidden' | 'hidden'
        }
        Insert: {
          user_id: string
          channel_id: string
          position: number
          visibility?: 'visible' | 'main_hidden' | 'hidden'
        }
        Update: {
          position?: number
          visibility?: 'visible' | 'main_hidden' | 'hidden'
        }
        Relationships: [
          {
            foreignKeyName: "ch_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ch_prefs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          }
        ]
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

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Channel = Database['public']['Tables']['channels']['Row']
export type Post = Database['public']['Tables']['posts']['Row']
export type Like = Database['public']['Tables']['likes']['Row']
export type Bookmark = Database['public']['Tables']['bookmarks']['Row']

export interface PostWithMeta extends Post {
  profiles: Profile | null   // null = 匿名投稿（user_id も null）
  channels: Channel
  likes_count: number
  replies_count: number
  liked_by_me: boolean
  bookmarked_by_me: boolean
}

export type ChannelVisibility = 'visible' | 'main_hidden' | 'hidden'

// チャンネルにユーザー設定を付加した型（ProfilePage の設定UIで使用）
export interface ChannelWithPref extends Channel {
  visibility: ChannelVisibility
}
