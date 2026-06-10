import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { POST_SELECT, fetchPostsMeta, metaOf } from '../lib/queries'
import { beginLoading } from '../lib/loadingBus'
import type { PostWithMeta, ReactionSummary } from '../lib/database.types'

export type TimelineItem =
  | { type: 'post'; post: PostWithMeta }
  | { type: 'thread'; parent: PostWithMeta; reply: PostWithMeta }

const PAGE_SIZE = 30

/**
 * バッチ内の投稿＋バッチ外の親投稿をエンリッチして返す。
 * メタ集計 RPC は親の ID も先に含められるので、
 * 「親の行を取る fetch」と「全件分のメタ RPC」を並列 1 往復で済ませる。
 * excludeParentIds: 既に画面にある親は取り直さない（fetchMore 用）
 */
async function enrichBatch(
  data: any[],
  userId: string,
  excludeParentIds?: Set<string>,
): Promise<Map<string, PostWithMeta>> {
  if (data.length === 0) return new Map()
  const dataIds = new Set(data.map((p: any) => p.id))
  const missingParentIds = [...new Set(
    data
      .filter((p: any) => p.parent_id && !dataIds.has(p.parent_id) && !excludeParentIds?.has(p.parent_id))
      .map((p: any) => p.parent_id as string)
  )]

  const [metaMap, parentsRes] = await Promise.all([
    fetchPostsMeta([...dataIds, ...missingParentIds], userId),
    missingParentIds.length > 0
      ? supabase.from('posts').select(POST_SELECT).in('id', missingParentIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const map = new Map<string, PostWithMeta>()
  ;[...data, ...(parentsRes.data ?? [])].forEach((p: any) => {
    map.set(p.id, { ...p, ...metaOf(metaMap, p.id) })
  })
  return map
}

// エンリッチ前のプレースホルダー（いいね数等はデフォルト値）で即時表示するためのマップ
function makePlaceholderMap(data: any[]): Map<string, PostWithMeta> {
  const map = new Map<string, PostWithMeta>()
  data.forEach((p: any) => {
    map.set(p.id, {
      ...p,
      likes_count: 0,
      replies_count: 0,
      liked_by_me: false,
      bookmarked_by_me: false,
      reactions: [],
    })
  })
  return map
}

function buildItemsFromBatch(
  data: any[],
  enrichedMap: Map<string, PostWithMeta>,
  excludeIds: Set<string>,
): { items: TimelineItem[]; parentIdsUsed: Set<string> } {
  const parentIdsUsed = new Set<string>()
  const all: Array<{ item: TimelineItem; sortTime: number }> = []

  for (const p of data.filter((p: any) => p.parent_id)) {
    if (excludeIds.has(p.id)) continue
    const parent = enrichedMap.get(p.parent_id)
    const reply = enrichedMap.get(p.id)
    if (!parent || !reply) continue
    if (excludeIds.has(parent.id)) continue
    parentIdsUsed.add(parent.id)
    all.push({ item: { type: 'thread', parent, reply }, sortTime: new Date(p.created_at).getTime() })
  }

  for (const p of data.filter((p: any) => !p.parent_id)) {
    if (excludeIds.has(p.id) || parentIdsUsed.has(p.id)) continue
    const post = enrichedMap.get(p.id)
    if (!post) continue
    all.push({ item: { type: 'post', post }, sortTime: new Date(p.created_at).getTime() })
  }

  return {
    items: all.sort((a, b) => b.sortTime - a.sortTime).map(({ item }) => item),
    parentIdsUsed,
  }
}

function removePostById(prev: TimelineItem[], id: string): TimelineItem[] {
  const replyIdsInOtherThreads = new Set(
    prev
      .filter((item): item is { type: 'thread'; parent: PostWithMeta; reply: PostWithMeta } =>
        item.type === 'thread' && item.reply.id !== id)
      .map(item => item.reply.id)
  )
  return prev.flatMap(item => {
    if (item.type === 'post' && item.post.id === id) return []
    if (item.type === 'thread') {
      if (item.reply.id === id) {
        if (replyIdsInOtherThreads.has(item.parent.id)) return []
        return [{ type: 'post' as const, post: item.parent }]
      }
      if (item.parent.id === id) return []
    }
    return [item]
  })
}

// slug → channel_id の解決結果をキャッシュ（ページ送り・Realtime のたびに引かない）
const channelIdBySlug = new Map<string, string>()

async function resolveChannelId(slug: string): Promise<string | undefined> {
  const cached = channelIdBySlug.get(slug)
  if (cached) return cached
  const { data: ch } = await supabase.from('channels').select('id').eq('slug', slug).single()
  if (ch) { channelIdBySlug.set(slug, ch.id); return ch.id }
  return undefined
}

// タイムラインのメモリキャッシュ（ページ遷移から戻ったとき即時表示し、裏で再検証する）
// key: `${uid}:${channelSlug ?? 'home'}:${excludeIds}`
const timelineCache = new Map<string, { items: TimelineItem[]; cursor: string | null; hasMore: boolean }>()

// 同一デバイスからのいいね操作をマーク（Realtimeの二重適用防止）
export const pendingLikeOps = new Set<string>()
// 同一デバイスからのリアクション操作をマーク（Realtimeの二重適用防止）
// key: `${post_id}:${reaction_type}`
export const pendingReactionOps = new Set<string>()

function applyReactionUpdate(item: TimelineItem, postId: string, reactionType: string, delta: number, reactedByMe?: boolean): TimelineItem {
  const patch = (p: PostWithMeta): PostWithMeta => {
    if (p.id !== postId) return p
    const existing = p.reactions.find(r => r.type === reactionType)
    let reactions: ReactionSummary[]
    if (existing) {
      const newCount = existing.count + delta
      if (newCount <= 0) {
        reactions = p.reactions.filter(r => r.type !== reactionType)
      } else {
        reactions = p.reactions.map(r => r.type !== reactionType ? r : {
          ...r, count: newCount,
          ...(reactedByMe !== undefined && { reacted_by_me: reactedByMe }),
        })
      }
    } else if (delta > 0) {
      reactions = [...p.reactions, { type: reactionType, count: 1, reacted_by_me: reactedByMe ?? false }]
    } else {
      return p
    }
    return { ...p, reactions }
  }
  if (item.type === 'post') return { ...item, post: patch(item.post) }
  return { ...item, parent: patch(item.parent), reply: patch(item.reply) }
}

function applyLikeUpdate(item: TimelineItem, postId: string, delta: number, likedByMe?: boolean): TimelineItem {
  const patch = (p: PostWithMeta): PostWithMeta => p.id !== postId ? p : {
    ...p,
    likes_count: Math.max(0, p.likes_count + delta),
    ...(likedByMe !== undefined && { liked_by_me: likedByMe }),
  }
  if (item.type === 'post') return { ...item, post: patch(item.post) }
  return { ...item, parent: patch(item.parent), reply: patch(item.reply) }
}

export function useTimeline(channelSlug?: string, excludeChannelIds?: string[]) {
  // セッションさえあればタイムラインを取り始められる（profile の取得完了を待たない）。
  // user.id === profiles.id なのでメタ取得にもそのまま使える。
  const { user } = useAuth()
  const uid = user?.id
  const excludeKey = excludeChannelIds?.join(',') ?? ''
  const cacheKey = `${uid}:${channelSlug ?? 'home'}:${excludeKey}`

  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // カーソル: 最後に取得したバッチの最古の created_at
  const cursorRef = useRef<string | null>(null)
  // 表示済みの post ID（追加ページで重複を避けるため）
  const displayedIdsRef = useRef(new Set<string>())
  // 初回ロードのトークン（チャンネル切替などで stale な非同期結果を破棄するため）
  const loadTokenRef = useRef(0)
  // 現在の items がどの cacheKey のものか（キー切替の過渡期に誤キャッシュしないため）
  const itemsKeyRef = useRef<string | null>(null)

  function trackDisplayed(newItems: TimelineItem[]) {
    newItems.forEach(item => {
      if (item.type === 'post') displayedIdsRef.current.add(item.post.id)
      else { displayedIdsRef.current.add(item.parent.id); displayedIdsRef.current.add(item.reply.id) }
    })
  }

  // items が更新されるたびキャッシュへ書き戻す（Realtime・いいね等の変更も反映される）
  useEffect(() => {
    if (itemsKeyRef.current === cacheKey && items.length > 0) {
      timelineCache.set(cacheKey, { items, cursor: cursorRef.current, hasMore })
    }
  }, [items, hasMore, cacheKey])

  async function buildQuery(lt?: string) {
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (lt) query = query.lt('created_at', lt)

    if (channelSlug) {
      const chId = await resolveChannelId(channelSlug)
      if (chId) query = query.eq('channel_id', chId)
    } else if (excludeChannelIds?.length) {
      query = query.not('channel_id', 'in', `(${excludeChannelIds.join(',')})`)
    }
    return query
  }

  const buildTimeline = useCallback(async () => {
    if (!uid) return
    const token = ++loadTokenRef.current
    displayedIdsRef.current = new Set()
    cursorRef.current = null

    // キャッシュがあれば即時表示（loading は立てない）→ 裏で最新ページ1を取り直して差し替え
    const cached = timelineCache.get(cacheKey)
    if (cached) {
      cursorRef.current = cached.cursor
      setHasMore(cached.hasMore)
      trackDisplayed(cached.items)
      itemsKeyRef.current = cacheKey
      setItems(cached.items)
      setLoading(false)
    } else {
      setLoading(true)
    }

    const endPosts = beginLoading('投稿を読み込んでいます...')
    const { data } = await buildQuery().finally(endPosts)
    if (loadTokenRef.current !== token) return
    if (!data) { setLoading(false); return }

    setHasMore(data.length === PAGE_SIZE)
    cursorRef.current = data.length > 0 ? data[data.length - 1].created_at : null

    if (!cached) {
      // Phase 1: エンリッチを待たずプレースホルダーで即時表示（読み込めた投稿から順に表示）
      const placeholderMap = makePlaceholderMap(data)
      const { items: placeholderItems } = buildItemsFromBatch(data, placeholderMap, new Set())
      displayedIdsRef.current = new Set()
      trackDisplayed(placeholderItems)
      itemsKeyRef.current = cacheKey
      setItems(placeholderItems)
      setLoading(false)
    }

    // Phase 2: いいね数・リアクション等のメタと親投稿を並列で取得して差し替え
    const endMeta = beginLoading('リアクションを読み込んでいます...')
    const enrichedMap = await enrichBatch(data, uid).finally(endMeta)
    if (loadTokenRef.current !== token) return

    const { items: newItems } = buildItemsFromBatch(data, enrichedMap, new Set())
    displayedIdsRef.current = new Set()
    trackDisplayed(newItems)
    itemsKeyRef.current = cacheKey
    setItems(newItems)
  }, [uid, channelSlug, excludeKey])

  useEffect(() => { buildTimeline() }, [buildTimeline])

  async function fetchMore() {
    if (!uid || loadingMore || !hasMore || !cursorRef.current) return
    setLoadingMore(true)
    const endPosts = beginLoading('投稿を読み込んでいます...')

    try {
      const { data } = await buildQuery(cursorRef.current)
      if (!data) return

      setHasMore(data.length === PAGE_SIZE)
      if (data.length > 0) cursorRef.current = data[data.length - 1].created_at

      const enrichedMap = await enrichBatch(data, uid, displayedIdsRef.current)

      const { items: newItems } = buildItemsFromBatch(data, enrichedMap, displayedIdsRef.current)
      trackDisplayed(newItems)
      itemsKeyRef.current = cacheKey
      setItems(prev => [...prev, ...newItems])
    } finally {
      endPosts()
      setLoadingMore(false)
    }
  }

  // Realtime
  useEffect(() => {
    if (!uid) return

    const channelName = `timeline-realtime:${channelSlug ?? 'home'}:${excludeKey}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async payload => {
        const newPost = payload.new as { id: string; parent_id: string | null; user_id: string | null; channel_id: string }

        if (newPost.parent_id) {
          const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', newPost.id).single()
          if (!data) return
          const reply: PostWithMeta = { ...data, likes_count: 0, replies_count: 0, liked_by_me: false, bookmarked_by_me: false, reactions: [] }
          setItems(prev => {
            // 既に表示済みなら追加しない（replyHandlerと二重追加防止）
            if (prev.some(item => item.type === 'thread' && item.reply.id === reply.id)) return prev
            let parent: PostWithMeta | undefined
            for (const item of prev) {
              if (item.type === 'post' && item.post.id === newPost.parent_id) { parent = { ...item.post, replies_count: item.post.replies_count + 1 }; break }
              if (item.type === 'thread' && item.reply.id === newPost.parent_id) { parent = { ...item.reply, replies_count: item.reply.replies_count + 1 }; break }
              if (item.type === 'thread' && item.parent.id === newPost.parent_id) { parent = { ...item.parent, replies_count: item.parent.replies_count + 1 }; break }
            }
            if (!parent) return prev
            const filtered = prev.filter(item => !(item.type === 'post' && item.post.id === newPost.parent_id))
            return [{ type: 'thread', parent, reply }, ...filtered]
          })
          return
        }

        const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', newPost.id).single()
        if (!data) return
        if (channelSlug && data.channels?.slug !== channelSlug) return
        if (!channelSlug && excludeChannelIds?.includes(data.channel_id)) return
        const post: PostWithMeta = { ...data, likes_count: 0, replies_count: 0, liked_by_me: false, bookmarked_by_me: false, reactions: [] }
        setItems(prev => {
          if (prev.some(item => item.type === 'post' && item.post.id === post.id)) return prev
          return [{ type: 'post', post }, ...prev]
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, payload => {
        if (payload.eventType === 'INSERT') {
          const { post_id, user_id } = payload.new as { post_id: string; user_id: string }
          if (user_id === uid) {
            if (pendingLikeOps.has(post_id)) { pendingLikeOps.delete(post_id); return }
            setItems(prev => prev.map(item => applyLikeUpdate(item, post_id, 1, true)))
            return
          }
          setItems(prev => prev.map(item => applyLikeUpdate(item, post_id, 1)))
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<{ post_id: string; user_id: string }>
          if (!old.post_id) return
          if (old.user_id === uid) {
            if (pendingLikeOps.has(old.post_id)) { pendingLikeOps.delete(old.post_id); return }
            setItems(prev => prev.map(item => applyLikeUpdate(item, old.post_id!, -1, false)))
            return
          }
          setItems(prev => prev.map(item => applyLikeUpdate(item, old.post_id!, -1)))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, payload => {
        if (payload.eventType === 'INSERT') {
          const { post_id, user_id, reaction_type } = payload.new as { post_id: string; user_id: string; reaction_type: string }
          const key = `${post_id}:${reaction_type}`
          if (user_id === uid) {
            if (pendingReactionOps.has(key)) { pendingReactionOps.delete(key); return }
            setItems(prev => prev.map(item => applyReactionUpdate(item, post_id, reaction_type, 1, true)))
            return
          }
          setItems(prev => prev.map(item => applyReactionUpdate(item, post_id, reaction_type, 1)))
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<{ post_id: string; user_id: string; reaction_type: string }>
          if (!old.post_id || !old.reaction_type) return
          const key = `${old.post_id}:${old.reaction_type}`
          if (old.user_id === uid) {
            if (pendingReactionOps.has(key)) { pendingReactionOps.delete(key); return }
            setItems(prev => prev.map(item => applyReactionUpdate(item, old.post_id!, old.reaction_type!, -1, false)))
            return
          }
          setItems(prev => prev.map(item => applyReactionUpdate(item, old.post_id!, old.reaction_type!, -1)))
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, payload => {
        const old = payload.old as Partial<{ id: string }>
        if (!old.id) return
        setItems(prev => removePostById(prev, old.id!))
      })
      .subscribe()

    const replyHandler = (e: Event) => {
      const { reply, parentId } = (e as CustomEvent).detail as { reply: PostWithMeta; parentId: string }
      setItems(prev => {
        // 既に表示済みなら追加しない
        if (prev.some(item => item.type === 'thread' && item.reply.id === reply.id)) return prev
        let parent: PostWithMeta | undefined
        for (const item of prev) {
          if (item.type === 'post' && item.post.id === parentId) { parent = item.post; break }
          if (item.type === 'thread' && item.reply.id === parentId) { parent = item.reply; break }
          if (item.type === 'thread' && item.parent.id === parentId) { parent = item.parent; break }
        }
        if (!parent) return prev
        const filtered = prev.filter(item => !(item.type === 'post' && item.post.id === parentId))
        return [{ type: 'thread', parent, reply }, ...filtered]
      })
    }
    window.addEventListener('reply-posted', replyHandler)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('reply-posted', replyHandler)
    }
  }, [uid, channelSlug, excludeKey, buildTimeline])

  function updateItem(updated: PostWithMeta) {
    setItems(prev => prev.map(item => {
      if (item.type === 'post' && item.post.id === updated.id) return { ...item, post: updated }
      if (item.type === 'thread') {
        let { parent, reply } = item
        if (parent.id === updated.id) parent = updated
        if (reply.id === updated.id) reply = updated
        return { ...item, parent, reply }
      }
      return item
    }))
  }

  function deleteItem(id: string) {
    setItems(prev => removePostById(prev, id))
  }

  function addPost(post: PostWithMeta) {
    setItems(prev => {
      if (prev.some(item => item.type === 'post' && item.post.id === post.id)) return prev
      return [{ type: 'post', post }, ...prev]
    })
  }

  return { items, loading, loadingMore, hasMore, fetchMore, updateItem, deleteItem, addPost }
}
