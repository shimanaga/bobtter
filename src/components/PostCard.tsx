import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { pendingLikeOps } from '../hooks/useTimeline'
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
  noBorderBottom?: boolean
  noNavigate?: boolean
  noRepliesList?: boolean
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

  const content = (
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

  return createPortal(content, document.body)
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

const URL_REGEX = /https?:\/\/[^\s<>"（）「」【】。、！？]+/g

function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_REGEX)
  if (!match) return null
  return match[0].replace(/[.,;:!?）」】。、！？]+$/, '')
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([^&#\s]+)/,
    /youtu\.be\/([^?&#\s]+)/,
    /\/shorts\/([^?&#\s]+)/,
    /\/live\/([^?&#\s]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

interface OgpData {
  title?: string | null
  description?: string | null
  image?: string | null
  siteName?: string | null
}
const ogpCache = new Map<string, OgpData | null>()

function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = new RegExp(URL_REGEX.source, 'g')
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:!?）」】。、！？]+$/, '')
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="underline break-all"
        style={{ color: 'var(--accent)' }}
      >{url}</a>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return <>{parts}</>
}

function OgpCard({ url }: { url: string }) {
  const [ogp, setOgp] = useState<OgpData | null | undefined>(
    ogpCache.has(url) ? ogpCache.get(url) : undefined
  )

  useEffect(() => {
    if (ogpCache.has(url)) return
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    fetch(`${supabaseUrl}/functions/v1/get-ogp?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${anonKey}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: OgpData | null) => {
        const result = data?.title ? data : null
        ogpCache.set(url, result)
        setOgp(result)
      })
      .catch(() => { ogpCache.set(url, null); setOgp(null) })
  }, [url])

  if (!ogp?.title) return null

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="mt-3 flex overflow-hidden rounded-xl hover:opacity-80 transition-opacity"
      style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-raised)', textDecoration: 'none', display: 'flex' }}
    >
      {ogp.image && (
        <img src={ogp.image} alt="" className="w-20 h-20 object-cover shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      )}
      <div className="p-3 min-w-0 flex flex-col justify-center gap-0.5">
        {ogp.siteName && <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{ogp.siteName}</p>}
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{ogp.title}</p>
        {ogp.description && (
          <p className="text-xs" style={{ color: 'var(--text-3)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {ogp.description}
          </p>
        )}
        <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
          {(() => { try { return new URL(url).hostname } catch { return url } })()}
        </p>
      </div>
    </a>
  )
}

function UrlEmbed({ url }: { url: string }) {
  const ytId = extractYouTubeId(url)
  if (ytId) {
    return (
      <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
          <iframe
            src={`https://www.youtube.com/embed/${ytId}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    )
  }
  return <OgpCard url={url} />
}

export default function PostCard({ post, channels, onUpdate, onDelete, showChannel = true, depth = 0, threadLine = false, noBorderBottom = false, noNavigate = false, noRepliesList = false }: PostCardProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [showReply, setShowReply] = useState(false)
  const [replies, setReplies] = useState<PostWithMeta[]>([])
  const [repliesLoaded, setRepliesLoaded] = useState(false)
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isNotice = post.is_notice
  const displayName = isNotice ? 'お知らせ' : post.is_anonymous ? '匿名' : (post.profiles?.display_name ?? '不明')
  const avatarText = isNotice ? 'お' : post.is_anonymous ? '?' : (post.profiles?.display_name?.[0] ?? '?')
  const shouldTruncate = post.content.length > TRUNCATE_AT
  const imageOnlyUrls = post.image_urls.filter(u => !isVideoUrl(u))
  const firstUrl = extractFirstUrl(post.content)

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
    pendingLikeOps.add(post.id)
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
    setConfirmDelete(false)
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
    if (showReply) { setShowReply(false); return }
    window.dispatchEvent(new CustomEvent('reply-opened', { detail: post.id }))
    setLoadingReplies(true)
    setShowReply(true)

    const { data } = await supabase
      .from('posts')
      .select('*, profiles!posts_user_id_fkey(*), channels!posts_channel_id_fkey(*)')
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
    setShowReply(false)
    setRepliesLoaded(true)
  }

  const timeStr = new Date(post.created_at).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <>
      {confirmDelete && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="rounded-xl p-6 w-72 shadow-xl"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-1)' }}>投稿を削除しますか？</p>
            <p className="text-xs mb-5" style={{ color: 'var(--text-3)' }}>この操作は取り消せません。</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-1.5 rounded-lg text-sm transition-colors"
                style={{ color: 'var(--text-2)', backgroundColor: 'var(--bg-raised)' }}
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ color: '#fff', backgroundColor: '#e05252' }}
              >
                削除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {lightboxIndex !== null && (
        <Lightbox
          urls={imageOnlyUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <article
        onClick={() => { if (!noNavigate) navigate(`/post/${post.id}`) }}
        className={`post-enter ${depth > 0 ? 'pl-10' : ''} ${!noNavigate ? 'cursor-pointer' : ''}`}
        style={noBorderBottom ? undefined : { borderBottom: '1px solid var(--border)' }}
      >
        <div className="px-5 py-4">
          <div className="flex gap-3">
            {/* Avatar + スレッドライン */}
            <div className="flex flex-col items-center shrink-0">
              <div
                data-thread-avatar=""
                className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm overflow-hidden"
                style={{
                  background: isNotice
                    ? 'linear-gradient(135deg, rgba(255,205,110,0.22) 0%, rgba(255,162,89,0.3) 100%)'
                    : post.is_anonymous
                    ? 'linear-gradient(135deg, var(--bg-raised) 0%, var(--ink-600) 100%)'
                    : `linear-gradient(135deg, var(--accent-dim) 0%, color-mix(in srgb, var(--accent) 40%, transparent) 100%)`,
                  color: isNotice ? '#ffc86f' : post.is_anonymous ? 'var(--text-3)' : 'var(--accent)',
                }}
              >
                {post.profiles?.avatar_url && !post.is_anonymous && !isNotice ? (
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
                {isNotice ? (
                  <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                    @Notice
                  </span>
                ) : !post.is_anonymous && post.profiles?.username ? (
                  <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                    @{post.profiles.username}
                  </span>
                ) : null}
                <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                  {timeStr}
                </span>
              </div>

              {/* Channel badge */}
              {showChannel && (
                <div className="flex items-center gap-1 mb-2">
                  <Hash size={9} style={{ color: 'var(--accent)' }} />
                  <span className="font-mono text-xs" style={{ color: 'var(--accent)', opacity: 0.7 }}>
                    {post.channels.name}
                  </span>
                </div>
              )}

              {/* Content */}
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-1)' }}>
                <RichText text={shouldTruncate && !expanded ? post.content.slice(0, TRUNCATE_AT) + '…' : post.content} />
              </p>
              {shouldTruncate && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                  className="text-xs mt-1 transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  {expanded ? '折りたたむ' : 'さらに表示'}
                </button>
              )}

              {/* 画像・動画 */}
              {post.image_urls.length > 0 && (
                <div onClick={e => e.stopPropagation()}>
                  <ImageGrid urls={post.image_urls} onOpen={i => setLightboxIndex(i)} />
                </div>
              )}

              {/* URL embed (YouTube or OGP card) */}
              {firstUrl && <UrlEmbed url={firstUrl} />}

              {/* Actions */}
              <div className="flex items-center gap-5 mt-3" onClick={e => e.stopPropagation()}>
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
                    onClick={() => setConfirmDelete(true)}
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
          <div className="pb-3 px-5" onClick={e => e.stopPropagation()}>
            <PostComposer
              channels={channels}
              defaultChannelId={post.channel_id}
              parentId={post.id}
              replyTargetIsAnonymous={post.is_anonymous}
              onPosted={handleReplyPosted}
              compact
            />
            {loadingReplies && (
              <p className="text-xs py-2" style={{ color: 'var(--text-3)' }}>読み込み中...</p>
            )}
            {!noRepliesList && replies.map(r => (
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
