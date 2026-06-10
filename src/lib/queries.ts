import { supabase } from './supabase'
import type { ReactionSummary } from './database.types'

// profiles から一般クライアントに返してよい列だけを列挙する。
// discord_id / discord_avatar_url は秘匿列なので含めない（RLS の列権限でも遮断する）。
export const PROFILE_COLS = 'id,username,display_name,avatar_url,bio,is_admin,created_at,updated_at'

// posts を投稿者プロフィール・チャンネル付きで取得する共通 select。
// プロフィールは秘匿列を除いた PROFILE_COLS のみを埋め込む。
export const POST_SELECT =
  `*, profiles!posts_user_id_fkey(${PROFILE_COLS}), channels!posts_channel_id_fkey(*)`

export interface PostMeta {
  likes_count: number
  replies_count: number
  liked_by_me: boolean
  bookmarked_by_me: boolean
  reactions: ReactionSummary[]
}

const EMPTY_META: PostMeta = {
  likes_count: 0,
  replies_count: 0,
  liked_by_me: false,
  bookmarked_by_me: false,
  reactions: [],
}

/**
 * 複数投稿のいいね数・返信数・リアクション集計・自分の操作状態を
 * 1 回の RPC でまとめて取得する。
 *
 * 以前は likes / reactions の全行をクライアントへ転送して JS 側で件数を
 * 数えていたため、投稿が人気になるほど転送量が線形に増えていた。
 * 集計は get_posts_meta（DB 関数）に寄せて件数だけを返す。
 */
export async function fetchPostsMeta(ids: string[], uid: string): Promise<Map<string, PostMeta>> {
  const map = new Map<string, PostMeta>()
  if (ids.length === 0) return map

  const { data, error } = await supabase.rpc('get_posts_meta', { p_ids: ids, p_uid: uid })
  if (error || !data) return map

  for (const row of data) {
    map.set(row.post_id, {
      likes_count: Number(row.likes_count) || 0,
      replies_count: Number(row.replies_count) || 0,
      liked_by_me: !!row.liked_by_me,
      bookmarked_by_me: !!row.bookmarked_by_me,
      reactions: (row.reactions as ReactionSummary[] | null) ?? [],
    })
  }
  return map
}

export function metaOf(map: Map<string, PostMeta>, id: string): PostMeta {
  return map.get(id) ?? EMPTY_META
}
