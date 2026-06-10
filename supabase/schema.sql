-- ============================================================
-- bobtter schema
-- Supabase の SQL Editor にそのまま貼り付けて実行してください。
--
-- 既に本番 DB が動いている場合は、このファイル末尾の
-- 「Migration（既存 DB 向け差分）」セクションだけを実行してください。
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- Tables
-- ============================================================

-- Profiles (auth.users と 1:1 対応)
--   discord_id / discord_avatar_url は「秘匿列」。
--   一般クライアント（anon / authenticated）からは読めないよう、
--   下の「Column privileges」で列単位の SELECT 権限を絞る。
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           text unique not null,
  display_name       text not null,
  discord_id         text unique not null,    -- Discord ユーザー ID（数字・秘匿）
  avatar_url         text,
  discord_avatar_url text,                     -- 初期 Discord アバター（秘匿。本人の復元用）
  bio                text,
  is_admin           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
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
  image_urls   text[] not null default '{}',  -- 画像・動画の公開 URL（Cloudflare R2）
  is_notice    boolean not null default false,
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

-- Reaction types（管理者が種別を定義。絵文字 or 画像のいずれか）
create table public.reaction_types (
  type      text primary key,
  label     text not null,
  emoji     text,
  image_url text,
  position  integer not null default 0
);

-- Reactions（投稿への絵文字リアクション）
create table public.reactions (
  post_id       uuid not null references public.posts(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null references public.reaction_types(type) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (post_id, user_id, reaction_type)
);

-- DELETE イベントで post_id / reaction_type を取得するため REPLICA IDENTITY FULL
alter table public.reactions replica identity full;

-- ユーザーごとのチャンネル表示設定（表示順・表示状態・返信の表示可否）
-- visibility: 'visible'     = サイドバー表示 + メインタイムラインに表示
--             'main_hidden' = サイドバー表示 + メインタイムラインには非表示
--             'hidden'      = サイドバー非表示 + メインタイムラインにも非表示
create table public.user_channel_preferences (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  channel_id   uuid not null references public.channels(id) on delete cascade,
  position     integer not null default 0,
  visibility   text not null default 'visible'
    check (visibility in ('visible', 'main_hidden', 'hidden')),
  hide_replies boolean not null default false,
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
create index reactions_post_id_idx  on public.reactions(post_id);
create index pending_discord_id_idx on public.pending_verifications(discord_id);
create index ch_prefs_user_id_idx   on public.user_channel_preferences(user_id);

-- ============================================================
-- Column privileges（profiles の秘匿列を一般ロールから遮断）
--   ・SELECT: discord_id / discord_avatar_url を読ませない
--   ・UPDATE: 本人でも is_admin / discord_* を書き換えさせない
--            （RLS の own-update だけでは is_admin 自己昇格を防げないため）
--   Edge Function は service_role で操作するためこれらの制限を受けない。
-- ============================================================
revoke select on public.profiles from anon, authenticated;
grant  select (id, username, display_name, avatar_url, bio, is_admin, created_at, updated_at)
  on public.profiles to anon, authenticated;

revoke update on public.profiles from anon, authenticated;
grant  update (username, display_name, avatar_url, bio, updated_at)
  on public.profiles to authenticated;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles                  enable row level security;
alter table public.pending_verifications     enable row level security;
alter table public.channels                  enable row level security;
alter table public.posts                     enable row level security;
alter table public.likes                     enable row level security;
alter table public.bookmarks                 enable row level security;
alter table public.reaction_types            enable row level security;
alter table public.reactions                 enable row level security;
alter table public.user_channel_preferences  enable row level security;

-- profiles: 認証済みユーザーのみ読み取り可、自分のみ更新可
--   （更新できる列は上の column privileges で制限済み）
create policy "profiles: auth read"  on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles: own update" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- pending_verifications: Edge Function（service_role）のみアクセス。
-- → RLS 有効 + 一般ポリシーなし で完全にブロック。

-- channels: 認証済みユーザー読み取り可、管理者のみ書き込み可
create policy "channels: auth read"   on public.channels for select using (auth.role() = 'authenticated');
create policy "channels: admin write" on public.channels for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- posts: 認証済みユーザーのみ。
--   お知らせ（is_notice=true）は管理者だけが作成できる。
create policy "posts: auth read"   on public.posts for select using (auth.role() = 'authenticated');
create policy "posts: auth insert" on public.posts for insert with check (
  auth.role() = 'authenticated'
  and (
    (is_anonymous = true  and user_id is null) or   -- 匿名: user_id は必ず NULL
    (is_anonymous = false and user_id = auth.uid())  -- 記名: 自分のIDのみ
  )
  and (
    is_notice = false
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
);
create policy "posts: own delete"  on public.posts for delete using (
  user_id = auth.uid()  -- 匿名投稿（user_id IS NULL）は削除不可（意図的）
);

-- likes
create policy "likes: auth read"   on public.likes for select using (auth.role() = 'authenticated');
create policy "likes: auth insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes: own delete"  on public.likes for delete using (auth.uid() = user_id);

-- bookmarks（ブックマークは非公開。自分の分だけ読める）
create policy "bookmarks: own read"    on public.bookmarks for select using (auth.uid() = user_id);
create policy "bookmarks: auth insert" on public.bookmarks for insert with check (auth.uid() = user_id);
create policy "bookmarks: own delete"  on public.bookmarks for delete using (auth.uid() = user_id);

-- reaction_types: 認証済みユーザー読み取り可、管理者のみ書き込み可
create policy "reaction_types: auth read"   on public.reaction_types for select using (auth.role() = 'authenticated');
create policy "reaction_types: admin write" on public.reaction_types for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- reactions
create policy "reactions: auth read"   on public.reactions for select using (auth.role() = 'authenticated');
create policy "reactions: auth insert" on public.reactions for insert with check (auth.uid() = user_id);
create policy "reactions: own delete"  on public.reactions for delete using (auth.uid() = user_id);

-- user_channel_preferences: 自分のみ読み書き
create policy "ch_prefs: own all" on public.user_channel_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Functions
-- ============================================================

-- 複数投稿のメタ情報（いいね数・返信数・リアクション集計・自分の操作状態）を
-- 1 回でまとめて返す。クライアントが likes/reactions の全行を取得して
-- 数えなくて済むようにするための集計関数。
-- security invoker のため呼び出し側ユーザーの RLS が適用される。
create or replace function public.get_posts_meta(p_ids uuid[], p_uid uuid)
returns table (
  post_id          uuid,
  likes_count      bigint,
  replies_count    bigint,
  liked_by_me      boolean,
  bookmarked_by_me boolean,
  reactions        jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    (select count(*) from likes l where l.post_id = p.id),
    (select count(*) from posts r where r.parent_id = p.id),
    exists (select 1 from likes l where l.post_id = p.id and l.user_id = p_uid),
    exists (select 1 from bookmarks b where b.post_id = p.id and b.user_id = p_uid),
    coalesce((
      select jsonb_agg(
               jsonb_build_object('type', g.reaction_type, 'count', g.cnt, 'reacted_by_me', g.mine)
               order by g.reaction_type
             )
      from (
        select rx.reaction_type,
               count(*)                 as cnt,
               bool_or(rx.user_id = p_uid) as mine
        from reactions rx
        where rx.post_id = p.id
        group by rx.reaction_type
      ) g
    ), '[]'::jsonb)
  from posts p
  where p.id = any(p_ids);
$$;

grant execute on function public.get_posts_meta(uuid[], uuid) to authenticated;

-- 自分の初期（Discord）アバター URL だけを返す。
-- discord_avatar_url は秘匿列なので、本人の復元 UI 用にこの関数経由で取得する。
create or replace function public.my_discord_avatar_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select discord_avatar_url from public.profiles where id = auth.uid();
$$;

grant execute on function public.my_discord_avatar_url() to authenticated;

-- ============================================================
-- Realtime publication
-- （posts / likes / reactions の変更をクライアントへ配信する）
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.posts;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.likes;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.reactions;
exception when duplicate_object then null; end $$;

-- ============================================================
-- Seed data: デフォルトチャンネル
-- ============================================================
insert into public.channels (name, slug, description, position) values
  ('雑談',        'general', 'なんでも',             0),
  ('音ゲー',        'rg',   'たのしい',         1),
  ('えなが', 'enaga',   'えなが',           2),
  ('布教',        'oshi',   '推し語り',               3),
  ('スパム',      'spam',   'なんでも2',         4),
  ('アビスギョザー',      'abyss',    '深淵なる混沌', 5);

-- ============================================================
-- Migration（既存 DB 向け差分）
-- すでにスキーマを実行済みの本番 DB には、以下だけを SQL Editor で実行する。
-- 各文は IF NOT EXISTS 等で冪等にしてあるので再実行しても安全。
-- ============================================================
-- -- 1) 秘匿列の追加（未追加なら）
-- alter table public.profiles add column if not exists discord_avatar_url text;
--
-- -- 2) profiles の列単位権限（discord_id / discord_avatar_url を隠し、is_admin 自己昇格を防ぐ）
-- revoke select on public.profiles from anon, authenticated;
-- grant  select (id, username, display_name, avatar_url, bio, is_admin, created_at, updated_at)
--   on public.profiles to anon, authenticated;
-- revoke update on public.profiles from anon, authenticated;
-- grant  update (username, display_name, avatar_url, bio, updated_at)
--   on public.profiles to authenticated;
--
-- -- 3) お知らせ偽装防止: posts insert ポリシーを貼り替え
-- drop policy if exists "posts: auth insert" on public.posts;
-- create policy "posts: auth insert" on public.posts for insert with check (
--   auth.role() = 'authenticated'
--   and (
--     (is_anonymous = true  and user_id is null) or
--     (is_anonymous = false and user_id = auth.uid())
--   )
--   and (
--     is_notice = false
--     or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
--   )
-- );
--
-- -- 4) profiles own-update に WITH CHECK を付与（行差し替えによる別人化を防ぐ）
-- drop policy if exists "profiles: own update" on public.profiles;
-- create policy "profiles: own update" on public.profiles for update
--   using (auth.uid() = id) with check (auth.uid() = id);
--
-- -- 5) 集計関数（get_posts_meta）と本人アバター関数を作成
-- --    → 上の Functions セクションの create function 2 つと grant をそのまま実行
--
-- -- 6) 返信非表示設定の列（未追加なら）
-- alter table public.user_channel_preferences add column if not exists hide_replies boolean not null default false;
--
-- -- 7) ブックマークを非公開化（他人のブックマークを読めなくする）
-- drop policy if exists "bookmarks: auth read" on public.bookmarks;
-- create policy "bookmarks: own read" on public.bookmarks for select using (auth.uid() = user_id);
--
-- -- 8) reactions / reaction_types を手動で追加済みの本番では、REPLICA IDENTITY と
-- --    Realtime publication が未設定のことがあるので確認:
-- -- alter table public.reactions replica identity full;
-- -- do $$ begin alter publication supabase_realtime add table public.reactions; exception when duplicate_object then null; end $$;
