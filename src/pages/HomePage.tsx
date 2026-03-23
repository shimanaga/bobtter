import { usePosts } from '../hooks/usePosts'
import PostCard from '../components/PostCard'
import PostComposer from '../components/PostComposer'
import { useChannelPrefs } from '../contexts/ChannelPrefsContext'
import type { Channel } from '../lib/database.types'

interface HomePageProps {
  channels: Channel[]
}

export default function HomePage({ channels }: HomePageProps) {
  const { mainExcludedIds } = useChannelPrefs()
  const { posts, loading, hasMore, fetchMore, updatePost, addPost, deletePost } = usePosts(undefined, mainExcludedIds)

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--text-1)' }}>
          タイムライン
        </h2>
        <PostComposer channels={channels} onPosted={addPost} />
      </div>

      {loading && posts.length === 0 ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl h-24 animate-pulse"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>
          <p className="font-display text-4xl mb-3">✦</p>
          <p className="text-sm">まだ投稿がありません</p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
        >
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              channels={channels}
              onUpdate={updatePost}
              onDelete={deletePost}
              showChannel
            />
          ))}

          {hasMore && (
            <button
              onClick={fetchMore}
              disabled={loading}
              className="w-full py-3 text-sm transition-colors"
              style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
            >
              {loading ? '読み込み中...' : 'もっと見る'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
