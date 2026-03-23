-- ============================================================
-- bobtter schema
-- Supabase の SQL Editor にそのまま貼り付けて実行してください
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- Tables
-- ============================================================

-- Profiles (auth.users と 1:1 対応)
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text not null,
  discord_id    text unique not null,  -- Discord ユーザー ID（数字）
  avatar_url    text,
  bio           text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Pending verifications（Discord DM 認証コード管理）
create table public.pending_verifications (
  id            uuid primary key default uuid_generate_v4(),
  discord_id    text not null,
  display_name  text not null,         -- 初回登録時に指定した名前
  code          text not null,         -- 6桁の認証コード
  expires_at    timestamptz not null,  -- 発行から15分
  used          boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Channels
create table public.channels (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text unique not null,
  description text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Posts (投稿 & 返信)
-- user_id は匿名投稿時は NULL（誰の投稿かは管理者を含め一切記録しない）
create table public.posts (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references public.profiles(id) on delete cascade,  -- NULL = 匿名投稿
  channel_id   uuid not null references public.channels(id) on delete cascade,
  content      text not null check (char_length(content) <= 1000),
  image_url    text,  -- 画像・動画どちらも格納（Cloudflare R2 公開 URL）
  is_anonymous boolean not null default false,
  parent_id    uuid references public.posts(id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- Likes
create table public.likes (
  id         uuid primary key default uuid_generate_v4(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

-- DELETE イベントで post_id を取得するために REPLICA IDENTITY FULL を設定
alter table public.likes replica identity full;

-- Bookmarks
create table public.bookmarks (
  id         uuid primary key default uuid_generate_v4(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

-- ユーザーごとのチャンネル表示設定（表示順・表示状態）
-- visibility: 'visible'     = サイドバー表示 + メインタイムラインに表示
--             'main_hidden' = サイドバー表示 + メインタイムラインには非表示
--             'hidden'      = サイドバー非表示 + メインタイムラインにも非表示
create table public.user_channel_preferences (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  position   integer not null default 0,
  visibility text not null default 'visible'
    check (visibility in ('visible', 'main_hidden', 'hidden')),
  primary key (user_id, channel_id)
);

-- ============================================================
-- Indexes
-- ============================================================
create index posts_channel_id_idx   on public.posts(channel_id);
create index posts_parent_id_idx    on public.posts(parent_id);
create index posts_created_at_idx   on public.posts(created_at desc);
create index likes_post_id_idx      on public.likes(post_id);
create index bookmarks_user_id_idx  on public.bookmarks(user_id);
create index pending_discord_id_idx on public.pending_verifications(discord_id);
create index ch_prefs_user_id_idx   on public.user_channel_preferences(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles                  enable row level security;
alter table public.pending_verifications     enable row level security;
alter table public.channels                  enable row level security;
alter table public.posts                     enable row level security;
alter table public.likes                     enable row level security;
alter table public.bookmarks                 enable row level security;
alter table public.user_channel_preferences  enable row level security;

-- profiles: 認証済みユーザーのみ読み取り可、自分のみ更新可
create policy "profiles: auth read"  on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles: own update" on public.profiles for update using (auth.uid() = id);

-- pending_verifications: Edge Function のみアクセス（service_role 経由）
-- → RLS を有効にしつつ、一般ユーザーポリシーなしにすることで完全にブロック
-- Edge Function は service_role キーで操作するため RLS をバイパス

-- channels: 認証済みユーザー読み取り可、管理者のみ書き込み可
create policy "channels: auth read"   on public.channels for select using (auth.role() = 'authenticated');
create policy "channels: admin write" on public.channels for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- posts: 認証済みユーザーのみ
create policy "posts: auth read"   on public.posts for select using (auth.role() = 'authenticated');
create policy "posts: auth insert" on public.posts for insert with check (
  auth.role() = 'authenticated' AND (
    (is_anonymous = true  AND user_id IS NULL) OR   -- 匿名: user_id は必ず NULL
    (is_anonymous = false AND user_id = auth.uid())  -- 記名: 自分のIDのみ
  )
);
create policy "posts: own delete"  on public.posts for delete using (
  user_id = auth.uid()  -- 匿名投稿（user_id IS NULL）は削除不可（意図的）
);

-- likes
create policy "likes: auth read"   on public.likes for select using (auth.role() = 'authenticated');
create policy "likes: auth insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes: own delete"  on public.likes for delete using (auth.uid() = user_id);

-- bookmarks
create policy "bookmarks: auth read"   on public.bookmarks for select using (auth.role() = 'authenticated');
create policy "bookmarks: auth insert" on public.bookmarks for insert with check (auth.uid() = user_id);
create policy "bookmarks: own delete"  on public.bookmarks for delete using (auth.uid() = user_id);

-- user_channel_preferences: 自分のみ読み書き
create policy "ch_prefs: own all" on public.user_channel_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Functions
-- ============================================================

-- プロフィール自動作成トリガー（Edge Function 側で明示的に作成するため不要だが念のため残す）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  -- Edge Function が profiles を INSERT するため、ここでは何もしない
  -- (discord_id が必須のため自動生成不可)
  return new;
end;
$$;

-- ============================================================
-- Seed data: デフォルトチャンネル
-- ============================================================
-- ============================================================
-- Migration: image_url → image_urls（複数画像対応）
-- 既にスキーマを実行済みの場合はこの2行だけ SQL Editor で実行してください
-- ============================================================
-- alter table public.posts add column image_urls text[] not null default '{}';
-- alter table public.posts drop column image_url;

insert into public.channels (name, slug, description, position) values
  ('雑談',        'general', 'なんでも',             0),
  ('音ゲー',        'rg',   'たのしい',         1),
  ('えなが', 'enaga',   'えなが',           2),
  ('布教',        'oshi',   '推し語り',               3),
  ('スパム',      'spam',   'なんでも2',         4),
  ('アビスギョザー',      'abyss',    '深淵なる混沌', 5);
