import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { Channel, ChannelVisibility, ChannelWithPref } from '../lib/database.types'

interface Pref { position: number; visibility: ChannelVisibility; hideReplies: boolean }

interface ChannelPrefsContextValue {
  /** サイドバー・ナビ用（'hidden' 以外のチャンネル、ユーザーの並び順） */
  visibleChannels: Channel[]
  /** メインタイムラインから除外するチャンネル ID（'main_hidden' | 'hidden'） */
  mainExcludedIds: string[]
  /** 設定画面用（全チャンネルをユーザーの並び順で、visibility 付き） */
  allSorted: ChannelWithPref[]
  /** 成功時は null、失敗時はエラーメッセージを返す */
  move: (channelId: string, dir: 'up' | 'down') => Promise<string | null>
  setVisibility: (channelId: string, visibility: ChannelVisibility) => Promise<string | null>
  getHideReplies: (channelId: string) => boolean
  setHideReplies: (channelId: string, value: boolean) => Promise<string | null>
}

const ChannelPrefsContext = createContext<ChannelPrefsContextValue | null>(null)

export function ChannelPrefsProvider({ channels, children }: { channels: Channel[]; children: ReactNode }) {
  const { profile } = useAuth()
  const [prefs, setPrefs] = useState<Map<string, Pref>>(new Map())

  useEffect(() => {
    if (!profile || channels.length === 0) return
    supabase
      .from('user_channel_preferences')
      .select('channel_id, position, visibility, hide_replies')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        const map = new Map<string, Pref>()
        data?.forEach(p => map.set(p.channel_id, {
          position: p.position,
          visibility: p.visibility as ChannelVisibility,
          hideReplies: p.hide_replies ?? false,
        }))
        setPrefs(map)
      })
  }, [profile?.id, channels.length])

  const allSorted = useMemo<ChannelWithPref[]>(() => {
    return [...channels]
      .sort((a, b) => {
        const pa = prefs.get(a.id)?.position ?? a.position
        const pb = prefs.get(b.id)?.position ?? b.position
        return pa - pb
      })
      .map(ch => ({ ...ch, visibility: prefs.get(ch.id)?.visibility ?? 'visible' }))
  }, [channels, prefs])

  const visibleChannels = useMemo(
    () => allSorted.filter(ch => ch.visibility !== 'hidden'),
    [allSorted],
  )

  const mainExcludedIds = useMemo(
    () => allSorted.filter(ch => ch.visibility !== 'visible').map(ch => ch.id),
    [allSorted],
  )

  async function move(channelId: string, dir: 'up' | 'down'): Promise<string | null> {
    if (!profile) return null
    const idx = allSorted.findIndex(ch => ch.id === channelId)
    const newIdx = dir === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= allSorted.length) return null

    const next = [...allSorted]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]

    const upserts = next.map((ch, i) => ({
      user_id: profile.id,
      channel_id: ch.id,
      position: i,
      visibility: ch.visibility,
    }))
    const { error } = await supabase.from('user_channel_preferences').upsert(upserts)
    if (error) return error.message
    setPrefs(new Map(next.map((ch, i) => [ch.id, {
      position: i,
      visibility: ch.visibility,
      hideReplies: prefs.get(ch.id)?.hideReplies ?? false,
    }])))
    return null
  }

  async function setVisibility(channelId: string, visibility: ChannelVisibility): Promise<string | null> {
    if (!profile) return null
    const currentPos = prefs.get(channelId)?.position ?? allSorted.findIndex(c => c.id === channelId)

    const { error } = await supabase.from('user_channel_preferences').upsert({
      user_id: profile.id,
      channel_id: channelId,
      position: currentPos,
      visibility,
    })
    if (error) return error.message
    setPrefs(prev => {
      const next = new Map(prev)
      next.set(channelId, { position: currentPos, visibility, hideReplies: prev.get(channelId)?.hideReplies ?? false })
      return next
    })
    return null
  }

  function getHideReplies(channelId: string): boolean {
    return prefs.get(channelId)?.hideReplies ?? false
  }

  async function setHideReplies(channelId: string, value: boolean): Promise<string | null> {
    if (!profile) return null
    const pref = prefs.get(channelId)
    const currentPos = pref?.position ?? allSorted.findIndex(c => c.id === channelId)
    const currentVisibility = pref?.visibility ?? 'visible'

    const { error } = await supabase.from('user_channel_preferences').upsert({
      user_id: profile.id,
      channel_id: channelId,
      position: currentPos,
      visibility: currentVisibility,
      hide_replies: value,
    })
    if (error) return error.message
    setPrefs(prev => {
      const next = new Map(prev)
      next.set(channelId, { position: currentPos, visibility: currentVisibility, hideReplies: value })
      return next
    })
    return null
  }

  return (
    <ChannelPrefsContext.Provider value={{ visibleChannels, mainExcludedIds, allSorted, move, setVisibility, getHideReplies, setHideReplies }}>
      {children}
    </ChannelPrefsContext.Provider>
  )
}

export function useChannelPrefs() {
  const ctx = useContext(ChannelPrefsContext)
  if (!ctx) throw new Error('useChannelPrefs must be used within ChannelPrefsProvider')
  return ctx
}
