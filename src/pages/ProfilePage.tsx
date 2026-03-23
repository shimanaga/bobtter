import { useState, useRef } from 'react'
import { Camera, Check, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChannelPrefs } from '../contexts/ChannelPrefsContext'
import { uploadAvatar } from '../lib/uploadImage'
import type { ChannelVisibility } from '../lib/database.types'

const VISIBILITY_OPTIONS: { value: ChannelVisibility; label: string }[] = [
  { value: 'visible',     label: '表示' },
  { value: 'main_hidden', label: 'メインのみ非表示' },
  { value: 'hidden',      label: '完全非表示' },
]

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const { allSorted, move, setVisibility } = useChannelPrefs()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleMove(id: string, dir: 'up' | 'down') {
    const err = await move(id, dir)
    setPrefsError(err)
  }

  async function handleSetVisibility(id: string, visibility: ChannelVisibility) {
    const err = await setVisibility(id, visibility)
    setPrefsError(err)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setUploadingAvatar(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const publicUrl = await uploadAvatar(file, session!.access_token)
      setAvatarPreview(publicUrl + '?t=' + Date.now())
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), username: username.trim(), bio: bio.trim(), updated_at: new Date().toISOString() })
      .eq('id', profile.id)
    if (error) {
      setError(error.message)
    } else {
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  if (!profile) return null

  const avatarText = profile.display_name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
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
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
            ) : avatarText}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            {uploadingAvatar
              ? <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-1)' }} />
              : <Camera size={18} style={{ color: 'var(--text-1)' }} />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        </div>
        <div>
          <p className="font-display font-semibold" style={{ color: 'var(--text-1)' }}>{profile.display_name}</p>
          <p className="font-mono text-sm" style={{ color: 'var(--text-3)' }}>@{profile.username}</p>
        </div>
      </div>

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
          <div className="flex items-center gap-1">
            <span className="text-sm" style={{ color: 'var(--text-3)' }}>@</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              required
              className="input-base flex-1"
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
            />
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

        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          {saved ? <><Check size={14} /> 保存しました</> : saving ? '保存中...' : '保存する'}
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
          「メインのみ非表示」はサイドバーには表示されますが全体タイムラインには流れません。「完全非表示」はサイドバーからも消えます。どちらの場合もチャンネル単体は引き続き閲覧できます。
        </p>
      </div>
    </div>
  )
}
