import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Channel } from '../lib/database.types'
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

  useEffect(() => {
    if (!profile?.is_admin) { navigate('/'); return }
    supabase.from('channels').select('*').order('position').then(({ data }) => {
      setChannels(data ?? [])
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
