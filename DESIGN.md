# bobtter 設計・実装ドキュメント

## 概要

6人程度の身内向けクローズド SNS。外部からの閲覧は一切不可。
Twitter ライクなタイムライン + Discord ライクなチャンネル分類を組み合わせた設計。

## 機能要件

| 機能 | 状態 |
|------|------|
| ログイン（Discord DM 認証コード） | 実装済み |
| タイムライン（全チャンネル・無限スクロール） | 実装済み |
| チャンネル別タイムライン | 実装済み |
| 投稿（テキスト + 画像最大4枚 + 動画） | 実装済み |
| 匿名投稿（DB に user_id を保存しない完全匿名） | 実装済み |
| いいね（リアルタイム同期） | 実装済み |
| 返信・スレッド表示 | 実装済み |
| ブックマーク | 実装済み |
| リアクション（管理者が設定した絵文字・画像） | 実装済み |
| お知らせ投稿（管理者のみ） | 実装済み |
| URL プレビュー（OGP カード・YouTube 埋め込み） | 実装済み |
| 画像ライトボックス | 実装済み |
| プロフィール編集 | 実装済み |
| 管理画面（チャンネル・リアクション種別管理・お知らせ投稿） | 実装済み |
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
│   │   ├── PostCard.tsx        # 投稿カード（いいね・返信・ブックマーク・リアクション）
│   │   ├── PostComposer.tsx    # 投稿フォーム（テキスト・画像・動画・匿名トグル）
│   │   ├── ThreadItem.tsx      # スレッド（親投稿 + 返信）をコネクタ線付きで表示
│   │   └── ReactionBar.tsx     # リアクション pill + ピッカー
│   ├── hooks/
│   │   ├── useTimeline.ts      # タイムライン取得・無限スクロール・Realtime
│   │   └── usePosts.ts         # 旧フック（PostDetailPage などで使用）
│   ├── pages/
│   │   ├── LoginPage.tsx       # ログイン画面
│   │   ├── HomePage.tsx        # メインタイムライン（全チャンネル）
│   │   ├── ChannelPage.tsx     # チャンネル別タイムライン
│   │   ├── PostDetailPage.tsx  # 投稿詳細・返信一覧
│   │   ├── ProfilePage.tsx     # プロフィール表示・編集
│   │   ├── BookmarksPage.tsx   # ブックマーク一覧
│   │   └── AdminPage.tsx       # 管理画面
│   ├── contexts/
│   │   ├── AuthContext.tsx           # 認証状態管理（session / profile）
│   │   └── ChannelPrefsContext.tsx   # チャンネル表示設定（並び順・表示/非表示）
│   ├── lib/
│   │   ├── supabase.ts         # Supabase クライアント
│   │   ├── database.types.ts   # DB 型定義（PostWithMeta など便利型を含む）
│   │   └── uploadImage.ts      # 画像圧縮 + R2 アップロード共通処理
│   ├── App.tsx                 # ルーティング定義
│   ├── main.tsx                # エントリーポイント
│   └── index.css               # Tailwind ディレクティブ + カスタム CSS 変数
├── supabase/
│   ├── schema.sql              # DB スキーマ（Supabase SQL Editor で実行）
│   └── functions/
│       ├── request-verification/   # Discord DM 認証コード発行
│       ├── complete-verification/  # 認証コード検証・セッション発行
│       ├── get-upload-url/         # R2 署名付き PUT URL 発行
│       └── get-ogp/                # OGP メタデータ取得プロキシ
├── .env.example
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
id                  uuid  PK → auth.users(id)
username            text  UNIQUE（最大15文字）
display_name        text
avatar_url          text  nullable（カスタム画像）
discord_avatar_url  text  nullable（Discord アバター、初回取得）
bio                 text  nullable
is_admin            bool  default false
discord_id          text  UNIQUE NOT NULL
created_at          timestamptz
updated_at          timestamptz
```

### channels
```sql
id          uuid  PK
name        text
slug        text  UNIQUE（URL に使用）
description text  nullable
position    int   デフォルト表示順
created_at  timestamptz
```

### user_channel_preferences
```sql
user_id     uuid  → profiles(id)  ┐ PK（複合）
channel_id  uuid  → channels(id)  ┘
position    int   ユーザーが設定した表示順
visibility  text  'visible' | 'main_hidden' | 'hidden'
hide_replies bool default false
```

### posts
```sql
id           uuid  PK
user_id      uuid  nullable → profiles(id)（匿名投稿時は NULL）
channel_id   uuid  → channels(id)
content      text  最大1000文字
image_urls   text[]  Cloudflare R2 URL の配列（画像・動画混在可、最大4枚）
is_notice    bool  default false（管理者が投稿するお知らせ）
is_anonymous bool  default false
parent_id    uuid  nullable → posts(id)（返信の場合）
created_at   timestamptz
```

### likes
```sql
post_id    uuid  → posts(id)  ┐ PK（複合）
user_id    uuid  → profiles(id)  ┘
created_at timestamptz
REPLICA IDENTITY DEFAULT（複合 PK なので DELETE 時に全列取得可能）
```

### bookmarks
```sql
id        uuid  PK
post_id   uuid  → posts(id)
user_id   uuid  → profiles(id)
UNIQUE(post_id, user_id)
```

### reaction_types
```sql
type       text  PK（識別子、例: "bob_face"）
label      text  表示名
emoji      text  nullable（絵文字文字列）
image_url  text  nullable（カスタム画像 URL）
position   int   表示順
※ emoji と image_url はどちらか一方を設定
```

### reactions
```sql
post_id       uuid  → posts(id)   ┐
user_id       uuid  → profiles(id) ├ PK（複合）
reaction_type text  → reaction_types(type) ┘
created_at    timestamptz
REPLICA IDENTITY DEFAULT（複合 PK なので DELETE 時に全列取得可能）
```

## Row Level Security 方針

- **全テーブル**: `authenticated` ロール以外は読み書き不可
- **profiles**: 読み取りは全認証ユーザー、更新は本人のみ
- **channels**: 読み取りは全認証ユーザー、書き込みは `is_admin = true` のみ
- **posts**: 読み書きは全認証ユーザー、削除は本人のみ
- **likes / bookmarks**: 読み書き・削除は本人のみ
- **reaction_types**: 読み取りは全認証ユーザー、書き込みは `is_admin = true` のみ
- **reactions**: 読み取りは全認証ユーザー、追加・削除は本人のみ

## 匿名投稿の仕組み

- 匿名投稿時は `user_id = NULL`、`is_anonymous = true` で保存
- **誰の投稿かは DB にも記録されない** — 管理者を含め誰にも特定不可能
- 匿名投稿への返信は強制的に匿名になる
- `abyss` スラッグのチャンネルは匿名投稿限定

## タイムラインの仕組み（useTimeline）

- カーソルベースページネーション（`created_at` で降順、PAGE_SIZE=30）
- 返信がある投稿はスレッド形式（`{ type: 'thread', parent, reply }`）で表示
- 親投稿がページ外にある場合は別途フェッチして補完
- Realtime: posts・likes・reactions テーブルの変更を即時反映
- 同一デバイスからの操作はオプティミスティック更新済みのため Realtime イベントを無視（`pendingLikeOps`・`pendingReactionOps`）

## リアクション機能

- 管理者が `reaction_types` テーブルで絵文字またはカスタム画像を登録・並び替え
- ユーザーは各投稿に複数種類のリアクションを付与可能（1人1投稿1種別で1つまで）
- `ReactionBar` コンポーネントが `reaction_types` をモジュールレベルでキャッシュ（初回のみ取得）
- 管理画面でリアクション種別を変更した際は `invalidateReactionTypesCache()` でキャッシュ破棄

## 管理画面の機能

1. **お知らせ投稿**: 任意チャンネルに `is_notice = true` の投稿を作成
2. **チャンネル管理**: 追加 / 編集 / 削除
3. **リアクション種別管理**: 追加（絵文字 or 画像URL）/ 削除 / 並び替え

アクセス制御: `profile.is_admin === true` のユーザーのみ表示・アクセス可能

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

## Discord DM 認証フロー

メールアドレス・パスワード不要。Discord DM による認証のみ。
ログインと新規登録が同一フロー（初回なら自動でアカウント作成）。

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
   - 新規ユーザーなら auth.users + profiles を作成（Discord アバターも取得）
   - magic link 経由で Supabase セッション（access_token / refresh_token）を発行
8. フロントエンドが supabase.auth.setSession() でセッションをセット → ログイン完了
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
supabase login
supabase link --project-ref <project-id>
supabase secrets set DISCORD_BOT_ENDPOINT=https://your-bot.example.com/send-dm
supabase secrets set DISCORD_BOT_SECRET=your-secret-token
supabase functions deploy request-verification
supabase functions deploy complete-verification
supabase functions deploy get-upload-url
supabase functions deploy get-ogp
```

### 内部実装メモ

- auth.users のメールは `{discord_id}@discord.bobtter.internal`（プレースホルダー、外部非公開）
- パスワードは `crypto.randomUUID()` でランダム生成（使用しない）
- セッション発行は `auth.admin.generateLink({ type: 'magiclink' })` + `auth.verifyOtp()` の組み合わせ
- `profiles.discord_id` に UNIQUE 制約 → 同一 Discord アカウントで複数登録不可
