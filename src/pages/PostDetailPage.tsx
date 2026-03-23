import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PostCard from '../components/PostCard'
import PostComposer from '../components/PostComposer'
import type { Channel, PostWithMeta } from '../lib/database.types'

interface Props {
  channels: Channel[]
}

async function fetchWithMeta(data: any[], userId: string): Promise<Map<string, PostWithMeta>> {
  if (!data.length) return new Map()
  const ids = data.map(p => p.id)
  const [{ data: likes }, { data: bookmarks }, { data: allLikes }, { data: replyCounts }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('likes').select('post_id').in('post_id', ids),
    supabase.from('posts').select('parent_id').in('parent_id', ids),
  ])
  const likedSet = new Set(likes?.map(l => l.post_id))
  const bookmarkedSet = new Set(bookmarks?.map(b => b.post_id))
  const likeMap: Record<string, number> = {}
  allLikes?.forEach(l => { likeMap[l.post_id] = (likeMap[l.post_id] ?? 0) + 1 })
  const replyMap: Record<string, number> = {}
  replyCounts?.forEach(r => { if (r.parent_id) replyMap[r.parent_id] = (replyMap[r.parent_id] ?? 0) + 1 })
  const map = new Map<string, PostWithMeta>()
  data.forEach(p => map.set(p.id, {
    ...p,
    likes_count: likeMap[p.id] ?? 0,
    replies_count: replyMap[p.id] ?? 0,
    liked_by_me: likedSet.has(p.id),
    bookmarked_by_me: bookmarkedSet.has(p.id),
  }))
  return map
}

export default function PostDetailPage({ channels }: Props) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [post, setPost] = useState<PostWithMeta | null>(null)
  const [parent, setParent] = useState<PostWithMeta | null>(null)
  const [replies, setReplies] = useState<PostWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || !profile) return
    load()
  }, [id, profile?.id])

  async function load() {
    setLoading(true)
    setPost(null)
    setParent(null)
    setReplies([])

    const { data: postData } = await supabase
      .from('posts').select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)')
      .eq('id', id!).single()
    if (!postData) { setLoading(false); return }

    const { data: repliesData } = await supabase
      .from('posts').select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)')
      .eq('parent_id', id!).order('created_at', { ascending: true })

    const allData = [postData, ...(repliesData ?? [])]

    let parentData: any = null
    if (postData.parent_id) {
      const { data } = await supabase
        .from('posts').select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)')
        .eq('id', postData.parent_id).single()
      parentData = data
      if (data) allData.push(data)
    }

    const enriched = await fetchWithMeta(allData, profile!.id)
    setPost(enriched.get(postData.id) ?? null)
    setReplies(repliesData?.map(r => enriched.get(r.id)!).filter(Boolean) ?? [])
    if (parentData) setParent(enriched.get(parentData.id) ?? null)
    setLoading(false)
  }

  function handleReplyPosted(newReply: PostWithMeta) {
    setReplies(prev => [...prev, newReply])
    setPost(prev => prev ? { ...prev, replies_count: prev.replies_count + 1 } : prev)
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-6 px-4">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl h-24 animate-pulse"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center" style={{ color: 'var(--text-3)' }}>
        投稿が見つかりません
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm mb-4 transition-colors"
        style={{ color: 'var(--text-3)' }}
      >
        <ArrowLeft size={16} />
        戻る
      </button>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
        {parent && (
          <PostCard
            post={parent}
            channels={channels}
            onUpdate={p => setParent(p)}
            showChannel
            noBorderBottom
          />
        )}

        <PostCard
          post={post}
          channels={channels}
          onUpdate={p => setPost(p)}
          onDelete={() => navigate(-1)}
          showChannel
          noNavigate
        />

        <div style={{ borderTop: '1px solid var(--border)' }} className="px-5 py-3">
          <PostComposer
            channels={channels}
            defaultChannelId={post.channel_id}
            parentId={post.id}
            onPosted={handleReplyPosted}
            compact
          />
        </div>

        {replies.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {replies.map(r => (
              <PostCard
                key={r.id}
                post={r}
                channels={channels}
                onUpdate={updated => setReplies(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onDelete={rid => setReplies(prev => prev.filter(x => x.id !== rid))}
                showChannel={false}
                depth={1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
