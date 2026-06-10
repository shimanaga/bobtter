import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ChannelPrefsProvider } from './contexts/ChannelPrefsContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { supabase } from './lib/supabase'
import type { Channel } from './lib/database.types'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ChannelPage from './pages/ChannelPage'
import BookmarksPage from './pages/BookmarksPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import PostDetailPage from './pages/PostDetailPage'

const CHANNELS_CACHE_KEY = 'bobtter:channels'

function readChannelsCache(): Channel[] {
  try { return JSON.parse(localStorage.getItem(CHANNELS_CACHE_KEY) ?? '[]') } catch { return [] }
}

function AppRoutes() {
  const { session, loading } = useAuth()
  // 前回のチャンネル一覧を即座に使い、サーバー応答で差し替える
  const [channels, setChannels] = useState<Channel[]>(readChannelsCache)

  useEffect(() => {
    if (!session) return
    supabase.from('channels').select('*').order('position').then(({ data }) => {
      if (!data) return
      setChannels(data)
      try { localStorage.setItem(CHANNELS_CACHE_KEY, JSON.stringify(data)) } catch { /* ignore */ }
    })
  }, [session])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="font-display text-4xl font-bold" style={{ color: 'var(--accent)', opacity: 0.3 }}>
          Bobtter
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <ChannelPrefsProvider channels={channels}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage channels={channels} />} />
          <Route path="/ch/:slug" element={<ChannelPage channels={channels} />} />
          <Route path="/bookmarks" element={<BookmarksPage channels={channels} />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/post/:id" element={<PostDetailPage channels={channels} />} />
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ChannelPrefsProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename="/bobtter">
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
