import { useState, useEffect } from 'react'
import { Heart, MessageCircle, Bookmark, Hash, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react'
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
  depth?: number
  threadLine?: boolean
}

const GRID_H = 240
const TRUNCATE_AT = 100

function isVideoUrl(u: string) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)
}

function Lightbox({ urls, initialIndex, onClose }: { urls: string[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex(i => Math.min(urls.length - 1, i + 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [urls.length, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)' }}
        onClick={onClose}
      >
        <X size={20} />
      </button>

      <img
        src={urls[index]}
        alt=""
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg select-none"
        onClick={e => e.stopPropagation()}
        draggable={false}
      />

      {urls.length > 1 && (
        <>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full disabled:opacity-20"
            style={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.15)' }}
            onClick={e => { e.stopPropagation(); setIndex(i => Math.max(0, i - 1)) }}
            disabled={index === 0}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full disabled:opacity-20"
            style={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.15)' }}
            onClick={e => { e.stopPropagation(); setIndex(i => Math.min(urls.length - 1, i + 1)) }}
            disabled={index === urls.length - 1}
          >
            <ChevronRight size={24} />
          </button>
          <div className="absolute bottom-4 flex gap-2">
            {urls.map((_, i) => (
              <button
                key={i}
                className="w-2 h-2 rounded-full transition-all"
                style={{ backgroundColor: i === index ? '#fff' : 'rgba(255,255,255,0.35)' }}
                onClick={e => { e.stopPropagation(); setIndex(i) }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ImageGrid({ urls, onOpen }: { urls: string[]; onOpen: (imageIndex: number) => void }) {
  let imgCount = 0
  const imageIndexMap = urls.map(url => isVideoUrl(url) ? -1 : imgCount++)
  const n = urls.length

  if (n === 1) {
    const url = urls[0]
    return isVideoUrl(url) ? (
      <video src={url} controls className="mt-3 rounded-xl w-full" style={{ maxHeight: GRID_H, border: '1px solid var(--border)' }} />
    ) : (
      <button onClick={() => onOpen(0)} className="mt-3 block w-full cursor-zoom-in">
        <img src={url} alt="添付画像" className="rounded-xl w-full object-cover" style={{ maxHeight: GRID_H, border: '1px solid var(--border)' }} />
      </button>
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
      {urls.map((url, i) =>
        isVideoUrl(url) ? (
          <video
            key={i}
            src={url}
            controls
            className="w-full h-full object-cover"
            style={n === 3 && i === 0 ? { gridRow: '1 / 3' } : {}}
          />
        ) : (
          <button
            key={i}
            onClick={() => onOpen(imageIndexMap[i])}
            className="w-full h-full overflow-hidden cursor-zoom-in"
            style={n === 3 && i === 0 ? { gridRow: '1 / 3' } : {}}
          >
            <img src={url} alt={`添付画像 ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        )
      )}
    </div>
  )
}

export default function PostCard({ post, channels, onUpdate, onDelete, showChannel = true, depth = 0, threadLine = false }: PostCardProps) {
  const { profile } = useAuth()
  const [showReply, setShowReply] = useState(false)
  const [replies, setReplies] = useState<PostWithMeta[]>([])
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)

  const displayName = post.is_anonymous ? '匿名' : (post.profiles?.display_name ?? '不明')
  const avatarText = post.is_anonymous ? '?' : (post.profiles?.display_name?.[0] ?? '?')
  const shouldTruncate = post.content.length > TRUNCATE_AT
  const imageOnlyUrls = post.image_urls.filter(u => !isVideoUrl(u))

  // 別の投稿の返信が開かれたら閉じる
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== post.id) setShowReply(false)
    }
    window.addEventListener('reply-opened', handler)
    return () => window.removeEventListener('reply-opened', handler)
  }, [post.id])

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

  async function handleDelete() {
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
    if (showReply && repliesLoaded) { setShowReply(false); return }
    window.dispatchEvent(new CustomEvent('reply-opened', { detail: post.id }))
    if (repliesLoaded) { setShowReply(true); return }
    setLoadingReplies(true)
    setShowReply(true)

    const { data } = await supabase
      .from('posts')
      .select('*, profiles(*), channels(*)')
      .eq('parent_id', post.id)
      .order('created_at', { ascending: true })

    if (data && profile) {
      const postIds = data.map(p => p.id)
      const [{ data: likes }, { data: bookmarks }, { data: allLikes }, { data: subReplies }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
        supabase.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
        supabase.from('likes').select('post_id').in('post_id', postIds),
        supabase.from('posts').select('parent_id').in('parent_id', postIds),
      ])
      const likedSet = new Set(likes?.map(l => l.post_id))
      const bookmarkedSet = new Set(bookmarks?.map(b => b.post_id))
      const likeCountMap: Record<string, number> = {}
      allLikes?.forEach(l => { likeCountMap[l.post_id] = (likeCountMap[l.post_id] ?? 0) + 1 })
      const replyCountMap: Record<string, number> = {}
      subReplies?.forEach(r => { if (r.parent_id) replyCountMap[r.parent_id] = (replyCountMap[r.parent_id] ?? 0) + 1 })
      setReplies(data.map(p => ({
        ...p,
        likes_count: likeCountMap[p.id] ?? 0,
        replies_count: replyCountMap[p.id] ?? 0,
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
    window.dispatchEvent(new CustomEvent('reply-posted', { detail: { reply: newReply, parentId: post.id } }))
    setShowReply(true)
    setRepliesLoaded(true)
  }

  const timeStr = new Date(post.created_at).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <>
      {lightboxIndex !== null && (
        <Lightbox
          urls={imageOnlyUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <article
        className={`post-enter ${depth > 0 ? 'pl-10' : ''}`}
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="px-5 py-4">
          <div className="flex gap-3">
            {/* Avatar + スレッドライン */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm overflow-hidden"
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
              {threadLine && (
                <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--border)', minHeight: '1rem' }} />
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
                {shouldTruncate && !expanded ? post.content.slice(0, TRUNCATE_AT) + '…' : post.content}
              </p>
              {shouldTruncate && (
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="text-xs mt-1 transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  {expanded ? '折りたたむ' : 'さらに表示'}
                </button>
              )}

              {/* 画像・動画 */}
              {post.image_urls.length > 0 && (
                <ImageGrid urls={post.image_urls} onOpen={i => setLightboxIndex(i)} />
              )}

              {/* Actions */}
              <div className="flex items-center gap-5 mt-3">
                <button
                  onClick={loadReplies}
                  className="flex items-center gap-1.5 text-xs transition-colors group"
                  style={{ color: 'var(--text-3)' }}
                >
                  <MessageCircle size={14} className="group-hover:stroke-teal-400 transition-colors" />
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
                    onClick={handleDelete}
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
        {showReply && (
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
                onDelete={id => setReplies(rs => rs.filter(x => x.id !== id))}
                showChannel={false}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </article>
    </>
  )
}
