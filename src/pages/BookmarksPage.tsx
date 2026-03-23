import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PostCard from '../components/PostCard'
import type { Channel, PostWithMeta } from '../lib/database.types'

interface BookmarksPageProps {
  channels: Channel[]
}

export default function BookmarksPage({ channels }: BookmarksPageProps) {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<PostWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    async function load() {
      const { data } = await supabase
        .from('bookmarks')
        .select('post_id, posts(*, profiles(*), channels(*))')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })

      if (!data) { setLoading(false); return }

      const rawPosts = data.map(b => b.posts).filter(Boolean) as PostWithMeta[]
      const postIds = rawPosts.map(p => p.id)

      const [{ data: likes }, { data: replyCounts }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', profile!.id).in('post_id', postIds),
        supabase.from('posts').select('parent_id').in('parent_id', postIds),
      ])
      const likedSet = new Set(likes?.map(l => l.post_id) ?? [])
      const replyMap: Record<string, number> = {}
      replyCounts?.forEach(r => { if (r.parent_id) replyMap[r.parent_id] = (replyMap[r.parent_id] ?? 0) + 1 })

      const { data: lc } = await supabase.from('likes').select('post_id').in('post_id', postIds)
      const likeCountMap: Record<string, number> = {}
      lc?.forEach(l => { likeCountMap[l.post_id] = (likeCountMap[l.post_id] ?? 0) + 1 })

      setPosts(rawPosts.map(p => ({
        ...p,
        likes_count: likeCountMap[p.id] ?? 0,
        replies_count: replyMap[p.id] ?? 0,
        liked_by_me: likedSet.has(p.id),
        bookmarked_by_me: true,
      })))
      setLoading(false)
    }
    load()
  }, [profile])

  function updatePost(updated: PostWithMeta) {
    if (!updated.bookmarked_by_me) {
      setPosts(prev => prev.filter(p => p.id !== updated.id))
    } else {
      setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
    }
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <h2 className="font-display font-bold text-lg mb-6" style={{ color: 'var(--text-1)' }}>
        ブックマーク
      </h2>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl h-24 animate-pulse" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>
          <p className="font-display text-4xl mb-3">✦</p>
          <p className="text-sm">ブックマークした投稿はありません</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
          {posts.map(post => (
            <PostCard key={post.id} post={post} channels={channels} onUpdate={updatePost} showChannel />
          ))}
        </div>
      )}
    </div>
  )
}
