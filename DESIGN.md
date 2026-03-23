# bobtter 設計・実装ドキュメント

## 概要

6人程度の身内向けクローズド SNS。外部からの閲覧は一切不可。
Twitter ライクなタイムライン + Discord ライクなチャンネル分類を組み合わせた設計。

## 機能要件

| 機能 | 状態 |
|------|------|
| ログイン（Discord DM 認証コード） | 実装済み |
| タイムライン（全チャンネル） | 実装済み |
| チャンネル別タイムライン | 実装済み |
| 投稿（テキスト + 画像 + 動画） | 実装済み |
| 匿名投稿（DB に user_id を保存しない完全匿名） | 実装済み |
| いいね | 実装済み |
| 返信（スレッド、PostCard インライン） | 実装済み |
| ブックマーク | 実装済み |
| プロフィール編集 | 実装済み |
| 管理画面（チャンネル追加・編集・削除） | 実装済み |
| Discord DM 経由アカウント登録 / ログイン | 実装済み |
| Discord アバター自動取得（初回ログイン時） | 実装済み |
| レスポンシブ対応（PC: サイドバー、モバイル: ボトムナビ） | 実装済み |

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 18 + TypeScript + Vite 4 |
| スタイリング | Tailwind CSS 3 |
| ルーティング | React Router v6 |
| アイコン | lucide-react |
| バックエンド / Auth / DB | Supabase（PostgreSQL + Auth + Realtime） |
| 画像・動画ストレージ | Cloudflare R2（署名付き PUT URL 方式、出口転送無料） |
| ホスティング | GitHub Pages（`/bobtter/` base path） |
| デプロイ | `gh-pages` パッケージで `dist/` を `gh-pages` ブランチに push |

## ディレクトリ構成

```
bobtter/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── Layout.tsx          # 全体レイアウト（PC: Sidebar、モバイル: BottomNav）
│   │   ├── Sidebar.tsx         # 左サイドバー（PC のみ表示）
│   │   ├── BottomNav.tsx       # ボトムナビ（モバイルのみ表示）
│   │   ├── PostCard.tsx        # 投稿カード（いいね・返信インライン・ブックマーク）
│   │   └── PostComposer.tsx    # 投稿フォーム（テキスト・画像・動画・匿名トグル）
│   ├── pages/
│   │   ├── LoginPage.tsx       # ログイン画面
│   │   ├── HomePage.tsx        # メインタイムライン（全チャンネル）
│   │   ├── ChannelPage.tsx     # チャンネル別タイムライン
│   │   ├── ProfilePage.tsx     # プロフィール表示・編集
│   │   ├── BookmarksPage.tsx   # ブックマーク一覧
│   │   └── AdminPage.tsx       # 管理画面
│   ├── contexts/
│   │   ├── AuthContext.tsx           # 認証状態管理（session / profile）
│   │   └── ChannelPrefsContext.tsx   # チャンネル表示設定（並び順・表示/非表示）
│   ├── lib/
│   │   ├── supabase.ts         # Supabase クライアント
│   │   ├── database.types.ts   # DB 型定義
│   │   └── uploadImage.ts      # 画像圧縮 + R2 アップロード共通処理
│   ├── App.tsx                 # ルーティング定義
│   ├── main.tsx                # エントリーポイント
│   └── index.css               # Tailwind ディレクティブ
├── supabase/
│   ├── schema.sql              # DB スキーマ（Supabase SQL Editor で実行）
│   └── functions/
│       ├── request-verification/   # Discord DM 認証コード発行
│       ├── complete-verification/  # 認証コード検証・セッション発行
│       └── get-upload-url/         # R2 署名付き PUT URL 発行
├── .env.example                # 環境変数テンプレート
├── .gitignore
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## データベーススキーマ

### profiles
```sql
id           uuid  PK → auth.users(id)
username     text  UNIQUE
display_name text
avatar_url   text  nullable
bio          text  nullable
is_admin     bool  default false
discord_id   text  UNIQUE NOT NULL
created_at   timestamptz
updated_at   timestamptz
```

### channels
```sql
id          uuid  PK
name        text
slug        text  UNIQUE（URLに使用）
description text  nullable
position    int   デフォルト表示順
created_at  timestamptz
```

### user_channel_preferences
```sql
user_id    uuid  → profiles(id)  ┐ PK（複合）
channel_id uuid  → channels(id)  ┘
position   int   ユーザーが設定した表示順
is_visible bool  サイドバーに表示するか
```

デフォルトチャンネル: 雑談 / 日記 / 映画・アニメ / 音楽 / ゲーム / その他

### posts
```sql
id           uuid  PK
user_id      uuid  → profiles(id)
channel_id   uuid  → channels(id)
content      text  最大1000文字
image_url    text  nullable（Cloudflare R2 公開 URL。画像・動画どちらも保存）
is_anonymous bool  true の場合、フロントでは「匿名」表示
parent_id    uuid  nullable → posts(id)（返信の場合）
created_at   timestamptz
```

### likes
```sql
id        uuid  PK
post_id   uuid  → posts(id)
user_id   uuid  → profiles(id)
UNIQUE(post_id, user_id)
```

### bookmarks
```sql
id        uuid  PK
post_id   uuid  → posts(id)
user_id   uuid  → profiles(id)
UNIQUE(post_id, user_id)
```

## Row Level Security 方針

- **全テーブル**: `authenticated` ロール以外は読み書き不可（外部からの閲覧を完全ブロック）
- **profiles**: 読み取りは全認証ユーザー、更新は本人のみ
- **channels**: 読み取りは全認証ユーザー、書き込みは `is_admin = true` のユーザーのみ
- **posts**: 読み書きは全認証ユーザー、削除は本人のみ
- **likes / bookmarks**: 読み書き・削除は本人のみ

## 匿名投稿の仕組み

- 匿名投稿時は `user_id = NULL`、`is_anonymous = true` で保存
- **誰の投稿かは DB にも記録されない** — 管理者を含め誰にも特定不可能
- RLS により `is_anonymous = true` のとき `user_id IS NULL` を強制（DB レベルで保証）
- 匿名投稿は投稿者本人でも削除不可（user_id がないため）

## 管理画面の機能

1. **チャンネル管理**: 追加 / 編集 / 削除

アクセス制御: `profile.is_admin === true` のユーザーのみ表示・アクセス可能

※ Supabase Storage は使用していません。画像・動画はすべて Cloudflare R2 に保存します。

## GitHub Pages デプロイ

```bash
# 初回
npm install
cp .env.example .env   # SUPABASE_URL, SUPABASE_ANON_KEY を記入

# 開発
npm run dev

# デプロイ
npm run deploy
# → dist/ を gh-pages ブランチに push → GitHub Pages が自動公開
```

`vite.config.ts` の `base: '/bobtter/'` はリポジトリ名に合わせて変更してください。

## 環境変数

`.env` ファイルに以下を設定（git には含めない）:

```
VITE_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyxxxxxxxxxxxxxx
```

## Discord DM 認証フロー（実装済み）

メールアドレス・パスワード不要。Discord DM による認証のみ。
ログインと新規登録が同一フロー（初回なら自動でアカウント作成）。

### フロー

```
1. ログインページで Discord ユーザー ID（数字）と表示名（初回のみ）を入力
2. フロントエンド → Edge Function: request-verification
3. Edge Function:
   - 6桁コードを生成し pending_verifications に保存（有効期限 15 分）
   - 既存 Discord Bot の HTTP エンドポイントを叩いて DM 送信を依頼
4. Discord Bot → ユーザーに DM:「認証コード: 123456（15分間有効）」
5. ログインページでコードを入力
6. フロントエンド → Edge Function: complete-verification
7. Edge Function:
   - コードを検証
   - 新規ユーザーなら auth.users + profiles を作成
   - magic link 経由で Supabase セッション（access_token / refresh_token）を発行
8. フロントエンドが supabase.auth.setSession() でセッションをセット → ログイン完了
```

### ファイル構成

```
supabase/functions/
├── request-verification/index.ts   ← コード発行・DM 送信依頼
└── complete-verification/index.ts  ← コード検証・セッション発行
```

### 必要な Supabase Secrets

| キー名 | 説明 |
|--------|------|
| `DISCORD_BOT_ENDPOINT` | 既存 Bot の DM 送信エンドポイント URL |
| `DISCORD_BOT_SECRET` | Bot エンドポイントの認証トークン（任意） |
| `DISCORD_BOT_TOKEN` | Bot トークン（初回登録時のアバター自動取得に使用） |

### Discord Bot 側に追加するエンドポイント

```
POST /send-dm
Body: { "discord_id": "123456789", "message": "認証コード: 123456..." }
Header: X-Bot-Secret: <DISCORD_BOT_SECRET>
→ 200 OK
```

### Edge Function のデプロイ

```bash
# Supabase CLI インストール済みの場合
supabase login
supabase link --project-ref <project-id>
supabase secrets set DISCORD_BOT_ENDPOINT=https://your-bot.example.com/send-dm
supabase secrets set DISCORD_BOT_SECRET=your-secret-token
supabase functions deploy request-verification
supabase functions deploy complete-verification
```

### 内部実装メモ

- auth.users のメールは `{discord_id}@discord.bobtter.internal`（プレースホルダー、外部非公開）
- パスワードは `crypto.randomUUID()` でランダム生成（使用しない）
- セッション発行は `auth.admin.generateLink({ type: 'magiclink' })` + `auth.verifyOtp()` の組み合わせ
- `profiles.discord_id` に UNIQUE 制約 → 同一 Discord アカウントで複数登録不可
