import { useState, useRef } from 'react'
import { Camera, Check, Loader2, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChannelPrefs } from '../contexts/ChannelPrefsContext'
import { uploadAvatar } from '../lib/uploadImage'
import AvatarCropperModal from '../components/AvatarCropperModal'
import type { ChannelVisibility } from '../lib/database.types'

const VISIBILITY_OPTIONS: { value: ChannelVisibility; label: string }[] = [
  { value: 'visible',     label: '表示' },
  { value: 'main_hidden', label: 'メインのみ非表示' },
  { value: 'hidden',      label: '非表示' },
]

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const { allSorted, move, setVisibility } = useChannelPrefs()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Avatar state
  const discordAvatarUrl = profile?.discord_avatar_url ?? null
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [pendingReset, setPendingReset] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Displayed avatar: pending crop > pending reset (discord) > saved
  const displayAvatarUrl = pendingBlob
    ? pendingPreview
    : pendingReset
    ? discordAvatarUrl
    : (profile?.avatar_url ?? null)

  const avatarChanged = pendingBlob !== null || pendingReset

  function handleUsernameChange(value: string) {
    const cleaned = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15)
    setUsername(cleaned)

    if (usernameDebounce.current) clearTimeout(usernameDebounce.current)

    // 現在と同じなら確認不要
    if (!cleaned || cleaned === profile?.username) {
      setUsernameStatus('idle')
      return
    }

    setUsernameStatus('checking')
    usernameDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleaned)
        .neq('id', profile!.id)
        .maybeSingle()
      setUsernameStatus(data ? 'taken' : 'available')
    }, 500)
  }

  async function handleMove(id: string, dir: 'up' | 'down') {
    const err = await move(id, dir)
    setPrefsError(err)
  }

  async function handleSetVisibility(id: string, visibility: ChannelVisibility) {
    const err = await setVisibility(id, visibility)
    setPrefsError(err)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''
    const url = URL.createObjectURL(file)
    setCropSrc(url)
  }

  function handleCropConfirm(blob: Blob) {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    const preview = URL.createObjectURL(blob)
    setPendingBlob(blob)
    setPendingPreview(preview)
    setPendingReset(false)
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function handleReset() {
    if (!discordAvatarUrl) return
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingBlob(null)
    setPendingPreview(null)
    setPendingReset(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setError(null)

    try {
      // 保存直前にも重複確認（素早く入力→すぐ保存した場合の安全策）
      if (username.trim() !== profile.username) {
        const { data: taken } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.trim())
          .neq('id', profile.id)
          .maybeSingle()
        if (taken) {
          setUsernameStatus('taken')
          setError('このユーザー名はすでに使われています')
          setSaving(false)
          return
        }
      }

      let newAvatarUrl: string | undefined

      if (pendingBlob) {
        const { data: { session } } = await supabase.auth.getSession()
        const file = new File([pendingBlob], 'avatar.webp', { type: 'image/webp' })
        newAvatarUrl = await uploadAvatar(file, session!.access_token)
      } else if (pendingReset && discordAvatarUrl) {
        newAvatarUrl = discordAvatarUrl
      }

      const update: Record<string, string> = {
        display_name: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
        updated_at: new Date().toISOString(),
      }
      if (newAvatarUrl !== undefined) update.avatar_url = newAvatarUrl

      const { error: dbError } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', profile.id)

      if (dbError) throw dbError

      await refreshProfile()
      if (pendingPreview) URL.revokeObjectURL(pendingPreview)
      setPendingBlob(null)
      setPendingPreview(null)
      setPendingReset(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  const avatarText = profile.display_name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      {cropSrc && (
        <AvatarCropperModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      <h2 className="font-display font-bold text-lg mb-6" style={{ color: 'var(--text-1)' }}>
        プロフィール
      </h2>

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-8">
        <div className="relative group">
          <div
            className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center font-display font-bold text-2xl cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, var(--accent-dim) 0%, color-mix(in srgb, var(--accent) 30%, transparent) 100%)',
              color: 'var(--accent)',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            {displayAvatarUrl ? (
              <img src={displayAvatarUrl} alt="" className="w-full h-full object-cover" />
            ) : avatarText}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <Camera size={18} style={{ color: '#fff' }} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="font-display font-semibold" style={{ color: 'var(--text-1)' }}>{profile.display_name}</p>
          <p className="font-mono text-sm" style={{ color: 'var(--text-3)' }}>@{profile.username}</p>
          {discordAvatarUrl && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: pendingReset ? 'var(--accent)' : 'var(--text-3)' }}
            >
              <RotateCcw size={11} />
              初期アバターに戻す
            </button>
          )}
        </div>
      </div>

      {/* Pending avatar notice */}
      {avatarChanged && !saving && (
        <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
          アバターの変更は「保存する」を押すと反映されます
        </p>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-4 mb-10">
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text-2)' }}>表示名</label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            required
            className="input-base w-full"
            maxLength={40}
          />
        </div>
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text-2)' }}>ユーザー名</label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm" style={{ color: 'var(--text-3)' }}>@</span>
            <input
              type="text"
              value={username}
              onChange={e => handleUsernameChange(e.target.value)}
              required
              className="input-base flex-1"
              maxLength={15}
              pattern="[a-zA-Z0-9_]+"
            />
            <span className="text-xs font-mono w-16 text-right shrink-0" style={{
              color: usernameStatus === 'available' ? '#6abf69'
                : usernameStatus === 'taken' ? '#e87878'
                : 'var(--text-3)',
            }}>
              {usernameStatus === 'checking' && '確認中…'}
              {usernameStatus === 'available' && '✓ 使用可'}
              {usernameStatus === 'taken' && '✗ 使用中'}
              {usernameStatus === 'idle' && `${username.length}/15`}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text-2)' }}>ひとこと</label>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={3}
            className="input-base w-full resize-none"
            maxLength={160}
            placeholder="自己紹介など"
          />
        </div>

        {error && <p className="text-sm" style={{ color: '#e87878' }}>{error}</p>}

        <button type="submit" disabled={saving || usernameStatus === 'taken' || usernameStatus === 'checking'} className="btn-primary flex items-center gap-2">
          {saving
            ? <><Loader2 size={14} className="animate-spin" />保存中...</>
            : saved
            ? <><Check size={14} />保存しました</>
            : '保存する'}
        </button>
      </form>

      {/* Channel preferences */}
      <div>
        <h3 className="font-display font-semibold text-sm mb-3" style={{ color: 'var(--text-2)' }}>
          チャンネル表示設定
        </h3>
        {prefsError && (
          <p className="text-xs mb-3" style={{ color: '#e87878' }}>保存に失敗しました: {prefsError}</p>
        )}
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
        >
          {allSorted.map((ch, idx) => (
            <div
              key={ch.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{
                borderBottom: idx < allSorted.length - 1 ? '1px solid var(--border)' : undefined,
                opacity: ch.visibility === 'hidden' ? 0.45 : 1,
              }}
            >
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => handleMove(ch.id, 'up')}
                  disabled={idx === 0}
                  className="btn-ghost p-0.5 disabled:opacity-20"
                  title="上へ"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  onClick={() => handleMove(ch.id, 'down')}
                  disabled={idx === allSorted.length - 1}
                  className="btn-ghost p-0.5 disabled:opacity-20"
                  title="下へ"
                >
                  <ChevronDown size={13} />
                </button>
              </div>

              <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-3)' }}>#</span>
              <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-1)' }}>{ch.name}</span>

              <div className="flex items-center rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }}>
                {VISIBILITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleSetVisibility(ch.id, opt.value)}
                    className="text-xs px-2 py-1 transition-colors"
                    style={{
                      backgroundColor: ch.visibility === opt.value ? 'var(--accent-dim)' : 'transparent',
                      color: ch.visibility === opt.value ? 'var(--accent)' : 'var(--text-3)',
                      borderLeft: opt.value !== 'visible' ? '1px solid var(--border)' : undefined,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
          「メインのみ非表示」は全体タイムラインに流れなくなりますが、チャンネル単体での閲覧は引き続き可能です。「非表示」はチャンネル一覧からも消えます。
        </p>
      </div>
    </div>
  )
}
