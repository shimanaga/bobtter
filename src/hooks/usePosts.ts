import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { PostWithMeta } from '../lib/database.types'

export function usePosts(channelSlug?: string, excludeChannelIds?: string[]) {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<PostWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 30

  const fetchPosts = useCallback(async (offset = 0) => {
    if (!profile) return
    setLoading(true)

    let query = supabase
      .from('posts')
      .select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)')
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (channelSlug) {
      const { data: channel } = await supabase
        .from('channels')
        .select('id')
        .eq('slug', channelSlug)
        .single()
      if (channel) query = query.eq('channel_id', channel.id)
    } else if (excludeChannelIds && excludeChannelIds.length > 0) {
      query = query.not('channel_id', 'in', `(${excludeChannelIds.join(',')})`)
    }

    const { data } = await query
    if (!data) { setLoading(false); return }

    const postIds = data.map(p => p.id)
    const [{ data: likes }, { data: bookmarks }, { data: replyCounts }] = await Promise.all([
      supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      supabase.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      supabase.from('posts').select('parent_id').in('parent_id', postIds),
    ])

    const likedSet = new Set(likes?.map(l => l.post_id) ?? [])
    const bookmarkedSet = new Set(bookmarks?.map(b => b.post_id) ?? [])
    const replyCountMap: Record<string, number> = {}
    replyCounts?.forEach(r => {
      if (r.parent_id) replyCountMap[r.parent_id] = (replyCountMap[r.parent_id] ?? 0) + 1
    })

    // Fetch like counts
    const likeCountMap: Record<string, number> = {}
    if (postIds.length > 0) {
      const { data: lc } = await supabase
        .from('likes')
        .select('post_id')
        .in('post_id', postIds)
      lc?.forEach(l => { likeCountMap[l.post_id] = (likeCountMap[l.post_id] ?? 0) + 1 })
    }

    const enriched: PostWithMeta[] = data.map(p => ({
      ...p,
      likes_count: likeCountMap[p.id] ?? 0,
      replies_count: replyCountMap[p.id] ?? 0,
      liked_by_me: likedSet.has(p.id),
      bookmarked_by_me: bookmarkedSet.has(p.id),
    }))

    if (offset === 0) {
      setPosts(enriched)
    } else {
      setPosts(prev => [...prev, ...enriched])
    }
    setHasMore(data.length === PAGE_SIZE)
    setLoading(false)
  }, [profile, channelSlug, excludeChannelIds?.join(',')])

  useEffect(() => {
    fetchPosts(0)
  }, [fetchPosts])

  // Realtime subscription
  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel('posts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async payload => {
        const newPost = payload.new as { id: string; parent_id: string | null; user_id: string | null }
        if (newPost.parent_id) {
          // 自分の返信はオプティミスティック更新済みなのでスキップ
          if (newPost.user_id === profile.id) return
          setPosts(prev => prev.map(p =>
            p.id === newPost.parent_id ? { ...p, replies_count: p.replies_count + 1 } : p
          ))
          return
        }

        const { data } = await supabase
          .from('posts')
          .select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)')
          .eq('id', newPost.id)
          .single()

        if (!data) return
        if (channelSlug && data.channels.slug !== channelSlug) return
        if (!channelSlug && excludeChannelIds?.includes(data.channel_id)) return

        setPosts(prev => {
          if (prev.some(p => p.id === data.id)) return prev
          return [{
            ...data,
            likes_count: 0,
            replies_count: 0,
            liked_by_me: false,
            bookmarked_by_me: false,
          }, ...prev]
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, payload => {
        const { post_id, user_id } = payload.new as { post_id: string; user_id: string }
        if (user_id === profile.id) return // 自分の操作はオプティミスティック更新済み
        setPosts(prev => prev.map(p =>
          p.id === post_id ? { ...p, likes_count: p.likes_count + 1 } : p
        ))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' }, payload => {
        // REPLICA IDENTITY FULL が設定されている場合のみ post_id が取れる
        const old = payload.old as Partial<{ post_id: string; user_id: string }>
        if (!old.post_id) return
        if (old.user_id === profile.id) return
        setPosts(prev => prev.map(p =>
          p.id === old.post_id ? { ...p, likes_count: Math.max(0, p.likes_count - 1) } : p
        ))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile, channelSlug, excludeChannelIds?.join(',')])

  function updatePost(updated: PostWithMeta) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  function addPost(post: PostWithMeta) {
    setPosts(prev => [post, ...prev])
  }

  function deletePost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  return { posts, loading, hasMore, fetchMore: () => fetchPosts(posts.length), updatePost, addPost, deletePost }
}
