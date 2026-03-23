import { useState, useRef } from 'react'
import { Image, EyeOff, Eye, X, Send, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { uploadPostImage, uploadVideo, isVideo, VIDEO_MAX_BYTES } from '../lib/uploadImage'
import type { Channel, PostWithMeta } from '../lib/database.types'

interface PostComposerProps {
  channels: Channel[]
  defaultChannelId?: string
  parentId?: string
  onPosted: (post: PostWithMeta) => void
  compact?: boolean
}

const MAX_IMAGES = 4

export default function PostComposer({ channels, defaultChannelId, parentId, onPosted, compact = false }: PostComposerProps) {
  const { profile } = useAuth()
  const [content, setContent] = useState('')
  const [channelId, setChannelId] = useState(defaultChannelId ?? channels[0]?.id ?? '')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])
  const [hasVideo, setHasVideo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? [])
    if (!incoming.length) return
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (incoming.some(f => isVideo(f))) {
      const video = incoming.find(f => isVideo(f))!
      if (video.size > VIDEO_MAX_BYTES) { setError('動画は50MB以下にしてください'); return }
      mediaPreviews.forEach(u => URL.revokeObjectURL(u))
      setMediaFiles([video])
      setMediaPreviews([URL.createObjectURL(video)])
      setHasVideo(true)
      return
    }

    for (const f of incoming) {
      if (f.size > 20 * 1024 * 1024) { setError('画像は20MB以下にしてください'); return }
    }
    const base = hasVideo ? [] : mediaFiles
    const basePreviews = hasVideo ? [] : mediaPreviews
    if (hasVideo) mediaPreviews.forEach(u => URL.revokeObjectURL(u))
    const addCount = MAX_IMAGES - base.length
    const next = [...base, ...incoming.slice(0, addCount)]
    const nextPreviews = [...basePreviews, ...incoming.slice(0, addCount).map(f => URL.createObjectURL(f))]
    setMediaFiles(next)
    setMediaPreviews(nextPreviews)
    setHasVideo(false)
  }

  function removeMedia(index: number) {
    URL.revokeObjectURL(mediaPreviews[index])
    const next = mediaFiles.filter((_, i) => i !== index)
    setMediaFiles(next)
    setMediaPreviews(prev => prev.filter((_, i) => i !== index))
    if (next.length === 0) setHasVideo(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() && mediaFiles.length === 0) return
    if (!profile) return
    setSubmitting(true)
    setError(null)

    try {
      let imageUrls: string[] = []
      if (mediaFiles.length > 0) {
        if (!hasVideo) setCompressing(true)
        const { data: { session } } = await supabase.auth.getSession()
        imageUrls = await Promise.all(
          mediaFiles.map(f => isVideo(f)
            ? uploadVideo(f, session!.access_token)
            : uploadPostImage(f, session!.access_token)
          )
        )
        setCompressing(false)
      }

      const { data: post, error: insertError } = await supabase
        .from('posts')
        .insert({
          user_id: isAnonymous ? null : profile.id,
          channel_id: channelId,
          content: content.trim(),
          image_urls: imageUrls,
          is_anonymous: isAnonymous,
          parent_id: parentId ?? null,
        })
        .select('*, profiles(*), channels(*)')
        .single()

      if (insertError) throw insertError

      const channel = channels.find(c => c.id === channelId)!
      onPosted({
        ...post,
        profiles: isAnonymous ? null : profile,
        channels: channel,
        likes_count: 0,
        replies_count: 0,
        liked_by_me: false,
        bookmarked_by_me: false,
      })

      setContent('')
      mediaPreviews.forEach(u => URL.revokeObjectURL(u))
      setMediaFiles([])
      setMediaPreviews([])
      setHasVideo(false)
    } catch (err) {
      console.error('post error:', err)
      setError(err instanceof Error ? err.message : (err as any)?.message ?? JSON.stringify(err) ?? '投稿に失敗しました')
    } finally {
      setSubmitting(false)
      setCompressing(false)
    }
  }

  const overLimit = content.length > 1000
  const canAddMore = !hasVideo && mediaFiles.length < MAX_IMAGES

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl p-4 ${compact ? 'mb-3' : 'mb-4'}`}
      style={{ backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)' }}
    >
      {!parentId && !defaultChannelId && (
        <div className="mb-3">
          <select
            value={channelId}
            onChange={e => setChannelId(e.target.value)}
            className="input-base text-sm py-1.5"
          >
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </div>
      )}

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={parentId ? '返信を書く...' : 'いまボブい？'}
        rows={compact ? 2 : 3}
        className="w-full bg-transparent resize-none focus:outline-none text-sm leading-relaxed"
        style={{ color: 'var(--text-1)' }}
      />

      {hasVideo && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 mt-2 text-xs"
          style={{ backgroundColor: 'rgba(232,160,96,0.1)', border: '1px solid rgba(232,160,96,0.3)', color: 'var(--accent)' }}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>動画の添付は推奨されていません。最大 50MB まで添付できます。</span>
        </div>
      )}

      {mediaPreviews.length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {mediaPreviews.map((preview, i) => (
            <div key={i} className="relative shrink-0">
              {hasVideo ? (
                <video src={preview} className="h-20 rounded-lg" style={{ border: '1px solid var(--border)' }} />
              ) : (
                <img src={preview} alt="" className="h-20 w-20 object-cover rounded-lg" style={{ border: '1px solid var(--border)' }} />
              )}
              <button
                type="button"
                onClick={() => removeMedia(i)}
                className="absolute top-0.5 right-0.5 rounded-full p-0.5"
                style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs mt-2" style={{ color: '#e87878' }}>{error}</p>
      )}

      <div
        className="flex items-center justify-between mt-3 pt-3"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => canAddMore && fileInputRef.current?.click()}
            disabled={!canAddMore}
            className="btn-ghost p-1.5 disabled:opacity-30"
            title={canAddMore ? '画像・動画を添付' : `画像は${MAX_IMAGES}枚まで`}
          >
            <Image size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          {!hasVideo && mediaFiles.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              {mediaFiles.length}/{MAX_IMAGES}
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsAnonymous(v => !v)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all"
            style={isAnonymous ? {
              borderColor: '#7c5fb0',
              color: '#b48de0',
              backgroundColor: '#1a1228',
            } : {
              borderColor: 'var(--border)',
              color: 'var(--text-3)',
            }}
          >
            {isAnonymous ? <EyeOff size={11} /> : <Eye size={11} />}
            {isAnonymous ? '匿名' : '匿名で投稿'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="font-mono text-xs"
            style={{ color: overLimit ? '#e87878' : 'var(--text-3)' }}
          >
            {content.length}/1000
          </span>
          <button
            type="submit"
            disabled={submitting || compressing || overLimit || (!content.trim() && mediaFiles.length === 0)}
            className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-4"
          >
            {compressing
              ? <><Loader2 size={13} className="animate-spin" />圧縮中</>
              : submitting
              ? <><Loader2 size={13} className="animate-spin" />送信中</>
              : <><Send size={13} />ボブる</>}
          </button>
        </div>
      </div>
    </form>
  )
}
