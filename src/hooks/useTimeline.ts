import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { PostWithMeta, ReactionSummary } from '../lib/database.types'

export type TimelineItem =
  | { type: 'post'; post: PostWithMeta }
  | { type: 'thread'; parent: PostWithMeta; reply: PostWithMeta }

const PAGE_SIZE = 30

async function enrichPosts(data: any[], userId: string): Promise<Map<string, PostWithMeta>> {
  if (data.length === 0) return new Map()
  const postIds = data.map((p: any) => p.id)
  const [{ data: likes }, { data: bookmarks }, { data: allLikes }, { data: replyCounts }, { data: myReactions }, { data: allReactions }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
    supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', postIds),
    supabase.from('likes').select('post_id').in('post_id', postIds),
    supabase.from('posts').select('parent_id').in('parent_id', postIds),
    supabase.from('reactions').select('post_id, reaction_type').eq('user_id', userId).in('post_id', postIds),
    supabase.from('reactions').select('post_id, reaction_type').in('post_id', postIds),
  ])
  const likedSet = new Set(likes?.map((l: any) => l.post_id) ?? [])
  const bookmarkedSet = new Set(bookmarks?.map((b: any) => b.post_id) ?? [])
  const likeCountMap: Record<string, number> = {}
  allLikes?.forEach((l: any) => { likeCountMap[l.post_id] = (likeCountMap[l.post_id] ?? 0) + 1 })
  const replyCountMap: Record<string, number> = {}
  replyCounts?.forEach((r: any) => { if (r.parent_id) replyCountMap[r.parent_id] = (replyCountMap[r.parent_id] ?? 0) + 1 })
  const myReactionSet = new Set(myReactions?.map((r: any) => `${r.post_id}:${r.reaction_type}`) ?? [])
  const reactionCountMap: Record<string, Record<string, number>> = {}
  allReactions?.forEach((r: any) => {
    if (!reactionCountMap[r.post_id]) reactionCountMap[r.post_id] = {}
    reactionCountMap[r.post_id][r.reaction_type] = (reactionCountMap[r.post_id][r.reaction_type] ?? 0) + 1
  })
  const map = new Map<string, PostWithMeta>()
  data.forEach((p: any) => {
    const reactions: ReactionSummary[] = Object.entries(reactionCountMap[p.id] ?? {}).map(([type, count]) => ({
      type, count, reacted_by_me: myReactionSet.has(`${p.id}:${type}`),
    }))
    map.set(p.id, {
      ...p,
      likes_count: likeCountMap[p.id] ?? 0,
      replies_count: replyCountMap[p.id] ?? 0,
      liked_by_me: likedSet.has(p.id),
      bookmarked_by_me: bookmarkedSet.has(p.id),
      reactions,
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
  const { profile } = useAuth()
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // カーソル: 最後に取得したバッチの最古の created_at
  const cursorRef = useRef<string | null>(null)
  // 表示済みの post ID（追加ページで重複を避けるため）
  const displayedIdsRef = useRef(new Set<string>())

  function trackDisplayed(newItems: TimelineItem[]) {
    newItems.forEach(item => {
      if (item.type === 'post') displayedIdsRef.current.add(item.post.id)
      else { displayedIdsRef.current.add(item.parent.id); displayedIdsRef.current.add(item.reply.id) }
    })
  }

  async function buildQuery(lt?: string) {
    let query = supabase
      .from('posts')
      .select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (lt) query = query.lt('created_at', lt)

    if (channelSlug) {
      const { data: ch } = await supabase.from('channels').select('id').eq('slug', channelSlug).single()
      if (ch) query = query.eq('channel_id', ch.id)
    } else if (excludeChannelIds?.length) {
      query = query.not('channel_id', 'in', `(${excludeChannelIds.join(',')})`)
    }
    return query
  }

  const buildTimeline = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    displayedIdsRef.current = new Set()
    cursorRef.current = null

    const { data } = await buildQuery()
    if (!data) { setLoading(false); return }

    setHasMore(data.length === PAGE_SIZE)
    if (data.length > 0) cursorRef.current = data[data.length - 1].created_at

    const enrichedMap = await enrichPosts(data, profile.id)

    const missingParentIds = [...new Set(
      data.filter((p: any) => p.parent_id && !enrichedMap.has(p.parent_id)).map((p: any) => p.parent_id as string)
    )]
    if (missingParentIds.length > 0) {
      const { data: parents } = await supabase.from('posts').select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)').in('id', missingParentIds)
      if (parents) {
        const parentMap = await enrichPosts(parents, profile.id)
        parentMap.forEach((v, k) => enrichedMap.set(k, v))
      }
    }

    const { items: newItems } = buildItemsFromBatch(data, enrichedMap, new Set())
    trackDisplayed(newItems)
    setItems(newItems)
    setLoading(false)
  }, [profile, channelSlug, excludeChannelIds?.join(',')])

  useEffect(() => { buildTimeline() }, [buildTimeline])

  async function fetchMore() {
    if (!profile || loadingMore || !hasMore || !cursorRef.current) return
    setLoadingMore(true)

    const { data } = await buildQuery(cursorRef.current)
    if (!data) { setLoadingMore(false); return }

    setHasMore(data.length === PAGE_SIZE)
    if (data.length > 0) cursorRef.current = data[data.length - 1].created_at

    const enrichedMap = await enrichPosts(data, profile.id)

    const missingParentIds = [...new Set(
      data
        .filter((p: any) => p.parent_id && !enrichedMap.has(p.parent_id) && !displayedIdsRef.current.has(p.parent_id))
        .map((p: any) => p.parent_id as string)
    )]
    if (missingParentIds.length > 0) {
      const { data: parents } = await supabase.from('posts').select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)').in('id', missingParentIds)
      if (parents) {
        const parentMap = await enrichPosts(parents, profile.id)
        parentMap.forEach((v, k) => enrichedMap.set(k, v))
      }
    }

    const { items: newItems } = buildItemsFromBatch(data, enrichedMap, displayedIdsRef.current)
    trackDisplayed(newItems)
    setItems(prev => [...prev, ...newItems])
    setLoadingMore(false)
  }

  // Realtime
  useEffect(() => {
    if (!profile) return

    const channel = supabase
      .channel('timeline-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async payload => {
        const newPost = payload.new as { id: string; parent_id: string | null; user_id: string | null; channel_id: string }

        if (newPost.parent_id) {
          const { data } = await supabase.from('posts').select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)').eq('id', newPost.id).single()
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

        const { data } = await supabase.from('posts').select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)').eq('id', newPost.id).single()
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
          if (user_id === profile.id) {
            if (pendingLikeOps.has(post_id)) { pendingLikeOps.delete(post_id); return }
            setItems(prev => prev.map(item => applyLikeUpdate(item, post_id, 1, true)))
            return
          }
          setItems(prev => prev.map(item => applyLikeUpdate(item, post_id, 1)))
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<{ post_id: string; user_id: string }>
          if (!old.post_id) return
          if (old.user_id === profile.id) {
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
          if (user_id === profile.id) {
            if (pendingReactionOps.has(key)) { pendingReactionOps.delete(key); return }
            setItems(prev => prev.map(item => applyReactionUpdate(item, post_id, reaction_type, 1, true)))
            return
          }
          setItems(prev => prev.map(item => applyReactionUpdate(item, post_id, reaction_type, 1)))
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<{ post_id: string; user_id: string; reaction_type: string }>
          if (!old.post_id || !old.reaction_type) return
          const key = `${old.post_id}:${old.reaction_type}`
          if (old.user_id === profile.id) {
            if (pendingReactionOps.has(key)) { pendingReactionOps.delete(key); return }
            setItems(prev => prev.map(item => applyReactionUpdate(item, old.post_id!, old.reaction_type!, -1, false)))
            return
          }
          setItems(prev => prev.map(item => applyReactionUpdate(item, old.post_id!, old.reaction_type!, -1)))
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, async payload => {
        const old = payload.old as Partial<{ id: string; user_id: string }>
        if (!old.id) return
        if (old.user_id === profile.id) return // 自分の削除はhandleDelete側で処理済み
        await buildTimeline()
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
  }, [profile, channelSlug, excludeChannelIds?.join(','), buildTimeline])

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
