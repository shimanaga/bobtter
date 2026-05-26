import { Sparkles, PawPrint } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

// variant='sidebar': サイドバー下部のナビ風ボタン
// variant='row'    : 設定画面用のラベル付き行
export default function ThemeToggle({ variant = 'sidebar' }: { variant?: 'sidebar' | 'row' }) {
  const { theme, toggleTheme } = useTheme()
  const cute = theme === 'cute'

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
      >
        <span className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--text-1)' }}>
          {cute
            ? <PawPrint size={16} style={{ color: 'var(--accent)' }} />
            : <Sparkles size={16} style={{ color: 'var(--accent)' }} />}
          現在: {cute ? 'もふもふモード' : 'サイバーモード'}
        </span>
        <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
          {cute ? 'サイバーに切替' : 'もふもふに切替'}
        </span>
      </button>
    )
  }

  return (
    <button type="button" onClick={toggleTheme} className="nav-link w-full text-left">
      {cute ? <Sparkles size={15} /> : <PawPrint size={15} />}
      {cute ? 'サイバーモード' : 'もふもふモード'}
    </button>
  )
}
