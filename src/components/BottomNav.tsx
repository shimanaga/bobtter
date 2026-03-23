import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Bookmark, User, Hash, X, LogOut, Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useChannelPrefs } from '../contexts/ChannelPrefsContext'

export default function BottomNav() {
  const { profile, signOut } = useAuth()
  const { visibleChannels } = useChannelPrefs()
  const navigate = useNavigate()
  const [showChannels, setShowChannels] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {/* Channel drawer overlay */}
      {showChannels && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowChannels(false)}
        >
          <div
            className="absolute bottom-16 left-0 right-0 rounded-t-2xl p-4"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xs font-mono font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-3)' }}
              >
                チャンネル
              </span>
              <button onClick={() => setShowChannels(false)} className="btn-ghost p-1">
                <X size={15} />
              </button>
            </div>

            <nav className="space-y-0.5 max-h-72 overflow-y-auto">
              {visibleChannels.map(ch => (
                <NavLink
                  key={ch.id}
                  to={`/ch/${ch.slug}`}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={() => setShowChannels(false)}
                >
                  <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-3)' }}>#</span>
                  <span className="truncate">{ch.name}</span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-3 pt-3 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
              {profile?.is_admin && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={() => setShowChannels(false)}
                >
                  <Settings size={15} />
                  管理
                </NavLink>
              )}
              <button onClick={handleSignOut} className="nav-link w-full text-left">
                <LogOut size={15} />
                ログアウト
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-4 md:hidden"
        style={{
          height: '56px',
          backgroundColor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <NavLink
          to="/"
          end
          className="flex flex-col items-center gap-0.5 text-xs transition-colors"
          style={({ isActive }) => ({ color: isActive ? 'var(--accent)' : 'var(--text-3)' })}
        >
          <Home size={20} />
          <span>ホーム</span>
        </NavLink>

        <button
          onClick={() => setShowChannels(v => !v)}
          className="flex flex-col items-center gap-0.5 text-xs transition-colors"
          style={{ color: showChannels ? 'var(--accent)' : 'var(--text-3)' }}
        >
          <Hash size={20} />
          <span>チャンネル</span>
        </button>

        <NavLink
          to="/bookmarks"
          className="flex flex-col items-center gap-0.5 text-xs transition-colors"
          style={({ isActive }) => ({ color: isActive ? 'var(--accent)' : 'var(--text-3)' })}
        >
          <Bookmark size={20} />
          <span>保存済み</span>
        </NavLink>

        <NavLink
          to="/profile"
          className="flex flex-col items-center gap-0.5 text-xs transition-colors"
          style={({ isActive }) => ({ color: isActive ? 'var(--accent)' : 'var(--text-3)' })}
        >
          <User size={20} />
          <span>プロフィール</span>
        </NavLink>
      </nav>
    </>
  )
}
