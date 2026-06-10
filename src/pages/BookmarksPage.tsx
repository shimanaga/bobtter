import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POST_SELECT, fetchPostsMeta, metaOf } from '../lib/queries'
import { beginLoading } from '../lib/loadingBus'
import { useAuth } from '../contexts/AuthContext'
import PostCard from '../components/PostCard'
import type { Channel, PostWithMeta } from '../lib/database.types'

interface BookmarksPageProps {
  channels: Channel[]
}

export default function BookmarksPage({ channels }: BookmarksPageProps) {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<PostWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    async function load() {
      const end = beginLoading('ブックマークを読み込んでいます...')
      try {
        const { data } = await supabase
          .from('bookmarks')
          .select(`post_id, posts(${POST_SELECT})`)
          .eq('user_id', profile!.id)
          .order('created_at', { ascending: false })

        if (!data) return

        const rawPosts = data.map(b => b.posts).filter(Boolean) as unknown as PostWithMeta[]
        const metaMap = await fetchPostsMeta(rawPosts.map(p => p.id), profile!.id)

        setPosts(rawPosts.map(p => ({ ...p, ...metaOf(metaMap, p.id), bookmarked_by_me: true })))
      } finally {
        end()
        setLoading(false)
      }
    }
    load()
  }, [profile])

  function updatePost(updated: PostWithMeta) {
    if (!updated.bookmarked_by_me) {
      setPosts(prev => prev.filter(p => p.id !== updated.id))
    } else {
      setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
    }
  }

  function deletePost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <h2 className="font-display font-bold text-lg mb-6" style={{ color: 'var(--text-1)' }}>
        ブックマーク
      </h2>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl h-24 animate-pulse" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>
          <p className="font-display text-4xl mb-3">✦</p>
          <p className="text-sm">ブックマークした投稿はありません</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
          {posts.map(post => (
            <PostCard key={post.id} post={post} channels={channels} onUpdate={updatePost} onDelete={deletePost} showChannel />
          ))}
        </div>
      )}
    </div>
  )
}
