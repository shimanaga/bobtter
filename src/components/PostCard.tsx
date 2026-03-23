import { useState } from 'react'
import { Heart, MessageCircle, Bookmark, Hash, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Channel, PostWithMeta } from '../lib/database.types'
import PostComposer from './PostComposer'

interface PostCardProps {
  post: PostWithMeta
  channels: Channel[]
  onUpdate: (updated: PostWithMeta) => void
  onDelete?: (id: string) => void
  showChannel?: boolean
  isReply?: boolean
}

const GRID_H = 240

function ImageGrid({ urls }: { urls: string[] }) {
  const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)
  const n = urls.length

  if (n === 1) {
    const url = urls[0]
    return isVideoUrl(url) ? (
      <video src={url} controls className="mt-3 rounded-xl w-full" style={{ maxHeight: GRID_H, border: '1px solid var(--border)' }} />
    ) : (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 block">
        <img src={url} alt="添付画像" className="rounded-xl w-full object-cover" style={{ maxHeight: GRID_H, border: '1px solid var(--border)' }} />
      </a>
    )
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    height: GRID_H,
    gap: 2,
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: n <= 2 ? '1fr' : '1fr 1fr',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    marginTop: '0.75rem',
  }

  return (
    <div style={gridStyle}>
      {urls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={n === 3 && i === 0 ? { gridRow: '1 / 3' } : {}}
        >
          <img src={url} alt={`添付画像 ${i + 1}`} className="w-full h-full object-cover" />
        </a>
      ))}
    </div>
  )
}

export default function PostCard({ post, channels, onUpdate, onDelete, showChannel = true, isReply = false }: PostCardProps) {
  const { profile } = useAuth()
  const [showReply, setShowReply] = useState(false)
  const [replies, setReplies] = useState<PostWithMeta[]>([])
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [loadingReplies, setLoadingReplies] = useState(false)

  const displayName = post.is_anonymous ? '匿名' : (post.profiles?.display_name ?? '不明')
  const avatarText = post.is_anonymous ? '?' : (post.profiles?.display_name?.[0] ?? '?')

  async function toggleLike() {
    if (!profile) return
    if (post.liked_by_me) {
      await supabase.from('likes').delete().match({ post_id: post.id, user_id: profile.id })
      onUpdate({ ...post, liked_by_me: false, likes_count: post.likes_count - 1 })
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: profile.id })
      onUpdate({ ...post, liked_by_me: true, likes_count: post.likes_count + 1 })
    }
  }

  async function deletePost() {
    if (!profile || post.user_id !== profile.id) return
    await supabase.from('posts').delete().eq('id', post.id)
    onDelete?.(post.id)
  }

  async function toggleBookmark() {
    if (!profile) return
    if (post.bookmarked_by_me) {
      await supabase.from('bookmarks').delete().match({ post_id: post.id, user_id: profile.id })
      onUpdate({ ...post, bookmarked_by_me: false })
    } else {
      await supabase.from('bookmarks').insert({ post_id: post.id, user_id: profile.id })
      onUpdate({ ...post, bookmarked_by_me: true })
    }
  }

  async function loadReplies() {
    if (repliesLoaded) { setShowReply(v => !v); return }
    setLoadingReplies(true)
    setShowReply(true)

    const { data } = await supabase
      .from('posts')
      .select('*, profiles(*), channels(*)')
      .eq('parent_id', post.id)
      .order('created_at', { ascending: true })

    if (data && profile) {
      const postIds = data.map(p => p.id)
      const [{ data: likes }, { data: bookmarks }, { data: allLikes }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
        supabase.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
        supabase.from('likes').select('post_id').in('post_id', postIds),
      ])
      const likedSet = new Set(likes?.map(l => l.post_id))
      const bookmarkedSet = new Set(bookmarks?.map(b => b.post_id))
      const likeCountMap: Record<string, number> = {}
      allLikes?.forEach(l => { likeCountMap[l.post_id] = (likeCountMap[l.post_id] ?? 0) + 1 })
      setReplies(data.map(p => ({
        ...p,
        likes_count: likeCountMap[p.id] ?? 0,
        replies_count: 0,
        liked_by_me: likedSet.has(p.id),
        bookmarked_by_me: bookmarkedSet.has(p.id),
      })))
      setRepliesLoaded(true)
    }
    setLoadingReplies(false)
  }

  function handleReplyPosted(newReply: PostWithMeta) {
    setReplies(r => [...r, newReply])
    onUpdate({ ...post, replies_count: post.replies_count + 1 })
    setShowReply(true)
    setRepliesLoaded(true)
  }

  const timeStr = new Date(post.created_at).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <article
      className={`post-enter ${isReply ? 'pl-10' : ''}`}
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div className="px-5 py-4">
        <div className="flex gap-3">
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm shrink-0 overflow-hidden"
            style={{
              background: post.is_anonymous
                ? 'linear-gradient(135deg, var(--bg-raised) 0%, var(--ink-600) 100%)'
                : `linear-gradient(135deg, var(--accent-dim) 0%, color-mix(in srgb, var(--accent) 40%, transparent) 100%)`,
              color: post.is_anonymous ? 'var(--text-3)' : 'var(--accent)',
            }}
          >
            {post.profiles?.avatar_url && !post.is_anonymous ? (
              <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              avatarText.toUpperCase()
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-display font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                {displayName}
              </span>
              {!post.is_anonymous && post.profiles?.username && (
                <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                  @{post.profiles.username}
                </span>
              )}
              <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                {timeStr}
              </span>
            </div>

            {/* Channel badge */}
            {showChannel && (
              <div className="flex items-center gap-1 mb-2">
                <Hash size={9} style={{ color: 'var(--text-3)' }} />
                <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                  {post.channels.name}
                </span>
              </div>
            )}

            {/* Content */}
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-1)' }}>
              {post.content}
            </p>

            {/* 画像・動画 */}
            {post.image_urls.length > 0 && <ImageGrid urls={post.image_urls} />}

            {/* Actions */}
            <div className="flex items-center gap-5 mt-3">
              <button
                onClick={loadReplies}
                className="flex items-center gap-1.5 text-xs transition-colors group"
                style={{ color: 'var(--text-3)' }}
              >
                <MessageCircle
                  size={14}
                  className="group-hover:stroke-teal-400 transition-colors"
                />
                <span className="group-hover:text-teal-400 transition-colors">
                  {post.replies_count > 0 ? post.replies_count : ''}
                </span>
              </button>

              <button
                onClick={toggleLike}
                className="flex items-center gap-1.5 text-xs transition-colors group"
                style={{ color: post.liked_by_me ? '#e87878' : 'var(--text-3)' }}
              >
                <Heart
                  size={14}
                  fill={post.liked_by_me ? 'currentColor' : 'none'}
                  className={`transition-all ${!post.liked_by_me ? 'group-hover:stroke-rose-400' : ''}`}
                  style={post.liked_by_me ? { filter: 'drop-shadow(0 0 4px #e87878aa)' } : {}}
                />
                <span className={!post.liked_by_me ? 'group-hover:text-rose-400' : ''}>
                  {post.likes_count > 0 ? post.likes_count : ''}
                </span>
              </button>

              <button
                onClick={toggleBookmark}
                className="flex items-center gap-1.5 text-xs transition-colors group"
                style={{ color: post.bookmarked_by_me ? 'var(--accent)' : 'var(--text-3)' }}
              >
                <Bookmark
                  size={14}
                  fill={post.bookmarked_by_me ? 'currentColor' : 'none'}
                  className={!post.bookmarked_by_me ? 'group-hover:stroke-sky-400' : ''}
                  style={post.bookmarked_by_me ? { filter: 'drop-shadow(0 0 4px var(--accent))' } : {}}
                />
              </button>

              {profile?.id === post.user_id && onDelete && (
                <button
                  onClick={deletePost}
                  className="flex items-center gap-1.5 text-xs transition-colors group ml-auto"
                  style={{ color: 'var(--text-3)' }}
                >
                  <Trash2 size={14} className="group-hover:stroke-red-400 transition-colors" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Replies */}
      {!isReply && showReply && (
        <div className="pb-3 px-5">
          <PostComposer
            channels={channels}
            defaultChannelId={post.channel_id}
            parentId={post.id}
            onPosted={handleReplyPosted}
            compact
          />
          {loadingReplies && (
            <p className="text-xs py-2" style={{ color: 'var(--text-3)' }}>読み込み中...</p>
          )}
          {replies.map(r => (
            <PostCard
              key={r.id}
              post={r}
              channels={channels}
              onUpdate={updated => setReplies(rs => rs.map(x => x.id === updated.id ? updated : x))}
              showChannel={false}
              isReply
            />
          ))}
        </div>
      )}
    </article>
  )
}
