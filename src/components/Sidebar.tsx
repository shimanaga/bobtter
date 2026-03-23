import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Bookmark, Settings, LogOut, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useChannelPrefs } from '../contexts/ChannelPrefsContext'

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const { visibleChannels } = useChannelPrefs()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside
      className="w-52 shrink-0 flex flex-col h-screen sticky top-0 py-5 px-3"
      style={{ borderRight: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
    >
      {/* Logo */}
      <div className="px-2 mb-7">
        <span
          className="font-display text-xl font-bold tracking-tight select-none"
          style={{ color: 'var(--accent)' }}
        >
          Bobtter
        </span>
      </div>

      {/* Main nav */}
      <nav className="space-y-0.5 mb-5">
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <Home size={15} />
          タイムライン
        </NavLink>
        <NavLink to="/bookmarks" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <Bookmark size={15} />
          ブックマーク
        </NavLink>
      </nav>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <p
          className="text-xs font-mono font-semibold uppercase tracking-widest px-2 mb-2"
          style={{ color: 'var(--text-3)' }}
        >
          ch
        </p>
        <nav className="space-y-0.5">
          {visibleChannels.map(ch => (
            <NavLink
              key={ch.id}
              to={`/ch/${ch.slug}`}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-3)' }}>#</span>
              <span className="truncate">{ch.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
        {profile?.is_admin && (
          <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Settings size={15} />
            管理
          </NavLink>
        )}
        <NavLink to="/profile" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <User size={15} />
          <span className="truncate">{profile?.display_name ?? 'プロフィール'}</span>
        </NavLink>
        <button onClick={handleSignOut} className="nav-link w-full text-left">
          <LogOut size={15} />
          ログアウト
        </button>
      </div>
    </aside>
  )
}
