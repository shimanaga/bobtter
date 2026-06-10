import { useState, useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { subscribeLoading, currentLoadingLabel } from '../lib/loadingBus'

// 表示までの猶予。これより速く終わる読み込みではトーストを出さない（チラつき防止）
const SHOW_DELAY_MS = 250
const FADE_MS = 200

export default function LoadingToast() {
  const label = useSyncExternalStore(subscribeLoading, currentLoadingLabel)
  const [shown, setShown] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (label) {
      // 既に表示中ならラベルだけ差し替え（投稿→リアクション等の遷移）
      if (visible) { setShown(label); return }
      const t = setTimeout(() => { setShown(label); setVisible(true) }, SHOW_DELAY_MS)
      return () => clearTimeout(t)
    }
    if (visible) {
      setVisible(false)
      const t = setTimeout(() => setShown(null), FADE_MS)
      return () => clearTimeout(t)
    }
  }, [label, visible])

  if (!shown) return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 z-50 flex items-center gap-2.5 rounded-full pl-3.5 pr-4 py-2 bottom-[4.25rem] md:bottom-6 pointer-events-none"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.1)',
        transform: `translateX(-50%) translateY(${visible ? '0' : '8px'})`,
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
      }}
    >
      <span
        aria-hidden
        className="w-3.5 h-3.5 rounded-full animate-spin shrink-0"
        style={{ border: '2px solid #3b82f6', borderTopColor: 'transparent' }}
      />
      <span className="text-xs font-semibold whitespace-nowrap" style={{ color: '#4b5563' }}>
        {shown}
      </span>
    </div>,
    document.body
  )
}
