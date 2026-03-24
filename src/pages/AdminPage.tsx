import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Check, X, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Channel, ReactionType } from '../lib/database.types'
import { invalidateReactionTypesCache } from '../components/ReactionBar'
import { useNavigate } from 'react-router-dom'

interface EditState {
  name: string
  description: string
}

export default function AdminPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [noticeChannelId, setNoticeChannelId] = useState('')
  const [noticeContent, setNoticeContent] = useState('')
  const [postingNotice, setPostingNotice] = useState(false)
  const [noticeStatus, setNoticeStatus] = useState<string | null>(null)

  const [reactionTypes, setReactionTypes] = useState<ReactionType[]>([])
  const [newRType, setNewRType] = useState('')
  const [newRLabel, setNewRLabel] = useState('')
  const [newREmoji, setNewREmoji] = useState('')
  const [newRImageUrl, setNewRImageUrl] = useState('')
  const [addingR, setAddingR] = useState(false)

  useEffect(() => {
    if (!profile?.is_admin) { navigate('/'); return }
    Promise.all([
      supabase.from('channels').select('*').order('position'),
      supabase.from('reaction_types').select('*').order('position'),
    ]).then(([{ data: ch }, { data: rt }]) => {
      setChannels(ch ?? [])
      setReactionTypes(rt ?? [])
      setLoading(false)
    })
  }, [profile, navigate])

  useEffect(() => {
    if (channels.length === 0) return
    if (noticeChannelId && channels.some(ch => ch.id === noticeChannelId)) return
    const fallback = channels.find(ch => ch.slug === 'general')?.id ?? channels[0].id
    setNoticeChannelId(fallback)
  }, [channels, noticeChannelId])

  async function addChannel() {
    if (!newName.trim() || !newSlug.trim()) return
    setAdding(true)
    setError(null)
    const { data, error } = await supabase
      .from('channels')
      .insert({
        name: newName.trim(),
        slug: newSlug.trim(),
        description: newDesc.trim() || null,
        position: channels.length,
      })
      .select()
      .single()
    if (error) {
      setError(error.message)
    } else if (data) {
      setChannels(prev => [...prev, data])
      setNewName(''); setNewSlug(''); setNewDesc('')
    }
    setAdding(false)
  }

  async function deleteChannel(id: string) {
    if (!confirm('このチャンネルを削除しますか？（投稿もすべて削除されます）')) return
    const { error } = await supabase.from('channels').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setChannels(prev => prev.filter(c => c.id !== id))
  }

  function startEdit(ch: Channel) {
    setEditingId(ch.id)
    setEditState({ name: ch.name, description: ch.description ?? '' })
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    if (!editState.name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('channels')
      .update({ name: editState.name.trim(), description: editState.description.trim() || null })
      .eq('id', id)
    if (!error) {
      setChannels(prev => prev.map(c =>
        c.id === id ? { ...c, name: editState.name.trim(), description: editState.description.trim() || null } : c
      ))
      setEditingId(null)
    } else {
      setError(error.message)
    }
    setSaving(false)
  }

  async function postNotice() {
    if (!profile || !noticeChannelId || !noticeContent.trim()) return
    setPostingNotice(true)
    setError(null)
    setNoticeStatus(null)

    const { error } = await supabase
      .from('posts')
      .insert({
        user_id: profile.id,
        channel_id: noticeChannelId,
        content: noticeContent.trim(),
        image_urls: [],
        is_notice: true,
        is_anonymous: false,
        parent_id: null,
      })

    if (error) {
      setError(error.message)
    } else {
      setNoticeContent('')
      setNoticeStatus('お知らせを投稿しました')
    }
    setPostingNotice(false)
  }

  async function addReactionType() {
    if (!newRType.trim() || !newRLabel.trim()) return
    if (!newREmoji.trim() && !newRImageUrl.trim()) return
    setAddingR(true)
    const { data, error: err } = await supabase
      .from('reaction_types')
      .insert({
        type: newRType.trim(),
        label: newRLabel.trim(),
        emoji: newREmoji.trim() || null,
        image_url: newRImageUrl.trim() || null,
        position: reactionTypes.length,
      })
      .select()
      .single()
    if (!err && data) {
      setReactionTypes(prev => [...prev, data])
      setNewRType(''); setNewRLabel(''); setNewREmoji(''); setNewRImageUrl('')
      invalidateReactionTypesCache()
    } else if (err) {
      setError(err.message)
    }
    setAddingR(false)
  }

  async function deleteReactionType(type: string) {
    if (!confirm(`リアクション「${type}」を削除しますか？`)) return
    const { error: err } = await supabase.from('reaction_types').delete().eq('type', type)
    if (!err) {
      setReactionTypes(prev => prev.filter(r => r.type !== type))
      invalidateReactionTypesCache()
    } else {
      setError(err.message)
    }
  }

  async function moveReactionType(type: string, dir: -1 | 1) {
    const idx = reactionTypes.findIndex(r => r.type === type)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= reactionTypes.length) return
    const next = [...reactionTypes]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    const updates = next.map((r, i) => ({ type: r.type, position: i }))
    setReactionTypes(next.map((r, i) => ({ ...r, position: i })))
    await Promise.all(updates.map(u => supabase.from('reaction_types').update({ position: u.position }).eq('type', u.type)))
    invalidateReactionTypesCache()
  }

  if (loading) {
    return <div className="max-w-xl mx-auto py-16 px-4 text-center" style={{ color: 'var(--text-3)' }}>読み込み中...</div>
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <h2 className="font-display font-bold text-lg mb-6" style={{ color: 'var(--text-1)' }}>
        管理
      </h2>

      <div
        className="rounded-xl p-5 mb-6"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <p className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>
          お知らせを投稿
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>チャンネル</label>
            <select
              value={noticeChannelId}
              onChange={e => setNoticeChannelId(e.target.value)}
              className="input-base w-full text-sm"
            >
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>内容</label>
            <textarea
              value={noticeContent}
              onChange={e => setNoticeContent(e.target.value)}
              rows={4}
              className="input-base w-full text-sm resize-none"
              placeholder="お知らせ内容"
            />
          </div>
        </div>
        {noticeStatus && <p className="text-sm mt-3" style={{ color: 'var(--accent)' }}>{noticeStatus}</p>}
        <button
          onClick={postNotice}
          disabled={postingNotice || !noticeContent.trim() || !noticeChannelId}
          className="btn-primary flex items-center gap-1.5 text-sm mt-4"
        >
          <Plus size={14} />
          {postingNotice ? '投稿中...' : 'お知らせを流す'}
        </button>
      </div>

      {/* Existing channels */}
      <div
        className="rounded-xl overflow-hidden mb-6"
        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
      >
        {channels.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>チャンネルがありません</p>
        ) : (
          channels.map(ch => (
            <div
              key={ch.id}
              className="px-4 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {editingId === ch.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editState.name}
                    onChange={e => setEditState(s => ({ ...s, name: e.target.value }))}
                    className="input-base text-sm flex-1"
                    placeholder="チャンネル名"
                  />
                  <input
                    type="text"
                    value={editState.description}
                    onChange={e => setEditState(s => ({ ...s, description: e.target.value }))}
                    className="input-base text-sm flex-1 hidden sm:block"
                    placeholder="説明（任意）"
                  />
                  <button onClick={() => saveEdit(ch.id)} disabled={saving} className="btn-ghost p-1.5" style={{ color: 'var(--accent)' }}>
                    <Check size={14} />
                  </button>
                  <button onClick={cancelEdit} className="btn-ghost p-1.5">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{ch.name}</p>
                    <p className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>#{ch.slug}</p>
                  </div>
                  {ch.description && (
                    <p className="text-xs hidden sm:block truncate max-w-xs" style={{ color: 'var(--text-3)' }}>{ch.description}</p>
                  )}
                  <button onClick={() => startEdit(ch)} className="btn-ghost p-1.5">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteChannel(ch.id)}
                    className="btn-ghost p-1.5"
                    style={{ color: '#e87878' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {error && <p className="text-sm mb-4" style={{ color: '#e87878' }}>{error}</p>}

      {/* Reaction types */}
      <div
        className="rounded-xl overflow-hidden mb-6"
        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
      >
        <p className="font-display font-semibold text-sm px-4 py-3" style={{ color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }}>
          リアクション種別
        </p>
        {reactionTypes.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>リアクションがありません</p>
        ) : (
          reactionTypes.map((rt, idx) => (
            <div key={rt.type} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: 'var(--bg-raised)' }}>
                {rt.image_url
                  ? <img src={rt.image_url} alt={rt.label} className="w-5 h-5 object-contain" />
                  : <span className="text-lg leading-none">{rt.emoji}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{rt.label}</p>
                <p className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>{rt.type}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => moveReactionType(rt.type, -1)} disabled={idx === 0} className="btn-ghost p-1 disabled:opacity-20">
                  <ArrowUp size={13} />
                </button>
                <button onClick={() => moveReactionType(rt.type, 1)} disabled={idx === reactionTypes.length - 1} className="btn-ghost p-1 disabled:opacity-20">
                  <ArrowDown size={13} />
                </button>
                <button onClick={() => deleteReactionType(rt.type)} className="btn-ghost p-1" style={{ color: '#e87878' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add reaction type */}
      <div
        className="rounded-xl p-5 mb-6"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <p className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>
          リアクションを追加
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>識別子 *</label>
            <input type="text" value={newRType} onChange={e => setNewRType(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} className="input-base w-full text-sm font-mono" placeholder="bob_face" />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>表示名 *</label>
            <input type="text" value={newRLabel} onChange={e => setNewRLabel(e.target.value)} className="input-base w-full text-sm" placeholder="ボブい" />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>絵文字（どちらか必須）</label>
            <input type="text" value={newREmoji} onChange={e => { setNewREmoji(e.target.value); setNewRImageUrl('') }} className="input-base w-full text-sm" placeholder="😂" />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>画像URL</label>
            <input type="text" value={newRImageUrl} onChange={e => { setNewRImageUrl(e.target.value); setNewREmoji('') }} className="input-base w-full text-sm" placeholder="https://..." />
          </div>
        </div>
        <button
          onClick={addReactionType}
          disabled={addingR || !newRType.trim() || !newRLabel.trim() || (!newREmoji.trim() && !newRImageUrl.trim())}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus size={14} />
          追加
        </button>
      </div>

      {/* Add channel form */}
      <div
        className="rounded-xl p-5"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <p className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>
          チャンネルを追加
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>チャンネル名 *</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="input-base w-full text-sm" placeholder="映画・ドラマ" />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>スラッグ（URL用）*</label>
            <input
              type="text"
              value={newSlug}
              onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="input-base w-full text-sm font-mono"
              placeholder="movies"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>説明（任意）</label>
            <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="input-base w-full text-sm" placeholder="任意" />
          </div>
        </div>
        <button
          onClick={addChannel}
          disabled={adding || !newName.trim() || !newSlug.trim()}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus size={14} />
          追加
        </button>
      </div>
    </div>
  )
}
