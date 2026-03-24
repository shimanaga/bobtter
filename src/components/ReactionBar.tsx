import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { SmilePlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ReactionType, ReactionSummary } from '../lib/database.types'

// reaction_types はほぼ変わらないのでモジュールレベルでキャッシュ
let cachedReactionTypes: ReactionType[] | null = null
const reactionTypeListeners = new Set<() => void>()

async function loadReactionTypes(): Promise<ReactionType[]> {
  if (cachedReactionTypes) return cachedReactionTypes
  const { data } = await supabase
    .from('reaction_types')
    .select('*')
    .order('position')
  cachedReactionTypes = data ?? []
  reactionTypeListeners.forEach(fn => fn())
  return cachedReactionTypes
}

export function invalidateReactionTypesCache() {
  cachedReactionTypes = null
}

interface ReactionBarProps {
  reactions: ReactionSummary[]
  onToggle: (type: string) => void
}

export default function ReactionBar({ reactions, onToggle }: ReactionBarProps) {
  const [reactionTypes, setReactionTypes] = useState<ReactionType[]>(cachedReactionTypes ?? [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (cachedReactionTypes) return
    loadReactionTypes().then(types => setReactionTypes(types))
    const update = () => setReactionTypes(cachedReactionTypes ?? [])
    reactionTypeListeners.add(update)
    return () => { reactionTypeListeners.delete(update) }
  }, [])

  const openPicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPickerPos({ top: rect.top - 8, left: rect.left })
    setPickerOpen(v => !v)
  }, [])

  useEffect(() => {
    if (!pickerOpen) return
    const close = (e: MouseEvent) => {
      // ピッカー内またはボタン自体のクリックはここで処理しない
      const pickerEl = document.querySelector('[data-reaction-picker]')
      if (pickerEl?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      // それ以外（投稿本文・他のボタンなど）はピッカーを閉じてナビゲーションも止める
      e.stopPropagation()
      setPickerOpen(false)
    }
    document.addEventListener('click', close, true)
    return () => document.removeEventListener('click', close, true)
  }, [pickerOpen])

  function renderReactionContent(rt: ReactionType) {
    if (rt.image_url) {
      return <img src={rt.image_url} alt={rt.label} className="w-4 h-4 object-contain" />
    }
    return <span className="text-sm leading-none">{rt.emoji}</span>
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
      {reactions.map(r => {
        const rt = reactionTypes.find(t => t.type === r.type)
        if (!rt) return null
        return (
          <button
            key={r.type}
            onClick={() => onToggle(r.type)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all"
            style={r.reacted_by_me ? {
              backgroundColor: 'var(--accent-dim)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
            } : {
              backgroundColor: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
            }}
            title={rt.label}
          >
            {renderReactionContent(rt)}
            <span className="font-mono">{r.count}</span>
          </button>
        )
      })}

      {reactionTypes.length > 0 && (
        <button
          ref={btnRef}
          onClick={openPicker}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all btn-ghost"
          style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
          title="リアクションを追加"
        >
          <SmilePlus size={13} />
        </button>
      )}

      {pickerOpen && pickerPos && createPortal(
        <div
          className="fixed z-50 flex items-center gap-1 px-2 py-1.5 rounded-xl shadow-lg"
          style={{
            top: pickerPos.top,
            left: pickerPos.left,
            transform: 'translateY(-100%)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
          }}
          onClick={e => e.stopPropagation()}
          data-reaction-picker=""
        >
          {reactionTypes.map(rt => {
            const existing = reactions.find(r => r.type === rt.type)
            return (
              <button
                key={rt.type}
                onClick={() => { onToggle(rt.type); setPickerOpen(false) }}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:scale-110"
                style={existing?.reacted_by_me ? {
                  backgroundColor: 'var(--accent-dim)',
                } : {
                  backgroundColor: 'transparent',
                }}
                title={rt.label}
              >
                {renderReactionContent(rt)}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
