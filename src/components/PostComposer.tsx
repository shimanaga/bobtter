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

export default function PostComposer({ channels, defaultChannelId, parentId, onPosted, compact = false }: PostComposerProps) {
  const { profile } = useAuth()
  const [content, setContent] = useState('')
  const [channelId, setChannelId] = useState(defaultChannelId ?? channels[0]?.id ?? '')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [isMediaVideo, setIsMediaVideo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    if (isVideo(file)) {
      if (file.size > VIDEO_MAX_BYTES) {
        setError('動画は50MB以下にしてください')
        return
      }
    } else {
      if (file.size > 20 * 1024 * 1024) {
        setError('画像は20MB以下にしてください')
        return
      }
    }

    setMediaFile(file)
    setMediaPreview(URL.createObjectURL(file))
    setIsMediaVideo(isVideo(file))
  }

  function removeMedia() {
    setMediaFile(null)
    setMediaPreview(null)
    setIsMediaVideo(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() && !mediaFile) return
    if (!profile) return
    setSubmitting(true)
    setError(null)

    try {
      let imageUrl: string | null = null
      if (mediaFile) {
        if (!isMediaVideo) setCompressing(true)
        const { data: { session } } = await supabase.auth.getSession()
        imageUrl = isMediaVideo
          ? await uploadVideo(mediaFile, session!.access_token)
          : await uploadPostImage(mediaFile, session!.access_token)
        setCompressing(false)
      }

      const { data: post, error: insertError } = await supabase
        .from('posts')
        .insert({
          user_id: isAnonymous ? null : profile.id,
          channel_id: channelId,
          content: content.trim(),
          image_url: imageUrl,
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
      removeMedia()
    } catch (err) {
      setError(err instanceof Error ? err.message : '投稿に失敗しました')
    } finally {
      setSubmitting(false)
      setCompressing(false)
    }
  }

  const overLimit = content.length > 1000

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl p-4 ${compact ? 'mb-3' : 'mb-4'}`}
      style={{ backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)' }}
    >
      {/* Channel selector */}
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
        placeholder={parentId ? '返信を書く...' : 'いまなにしてる？'}
        rows={compact ? 2 : 3}
        className="w-full bg-transparent resize-none focus:outline-none text-sm leading-relaxed"
        style={{ color: 'var(--text-1)' }}
      />

      {/* 動画添付時の警告 */}
      {isMediaVideo && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 mt-2 text-xs"
          style={{
            backgroundColor: 'rgba(232,160,96,0.1)',
            border: '1px solid rgba(232,160,96,0.3)',
            color: 'var(--accent)',
          }}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>動画の添付は推奨されていません。最大 50MB まで投稿できます。</span>
        </div>
      )}

      {/* メディアプレビュー */}
      {mediaPreview && (
        <div className="relative mt-2 inline-block">
          {isMediaVideo ? (
            <video
              src={mediaPreview}
              controls
              className="max-h-48 rounded-lg"
              style={{ border: '1px solid var(--border)' }}
            />
          ) : (
            <img src={mediaPreview} alt="preview" className="max-h-40 rounded-lg object-cover" />
          )}
          <button
            type="button"
            onClick={removeMedia}
            className="absolute top-1 right-1 rounded-full p-0.5"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'var(--text-1)' }}
          >
            <X size={13} />
          </button>
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
            onClick={() => fileInputRef.current?.click()}
            className="btn-ghost p-1.5"
            title="画像・動画を添付"
          >
            <Image size={16} />
          </button>
          {/* image/* + video/* で HEVC (.mov) も含むすべての動画を受け付ける */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />

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
            disabled={submitting || compressing || overLimit || (!content.trim() && !mediaFile)}
            className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-4"
          >
            {compressing
              ? <><Loader2 size={13} className="animate-spin" />圧縮中</>
              : submitting
              ? <><Loader2 size={13} className="animate-spin" />送信中</>
              : <><Send size={13} />投稿</>}
          </button>
        </div>
      </div>
    </form>
  )
}
