import { useParams } from 'react-router-dom'
import { usePosts } from '../hooks/usePosts'
import PostCard from '../components/PostCard'
import PostComposer from '../components/PostComposer'
import type { Channel } from '../lib/database.types'

interface ChannelPageProps {
  channels: Channel[]
}

export default function ChannelPage({ channels }: ChannelPageProps) {
  const { slug } = useParams<{ slug: string }>()
  const channel = channels.find(c => c.slug === slug)
  const { posts, loading, hasMore, fetchMore, updatePost, addPost } = usePosts(slug)

  if (!channel) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center" style={{ color: 'var(--text-3)' }}>
        チャンネルが見つかりません
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      {/* Channel header */}
      <div className="mb-6">
        <h2 className="font-display font-bold text-lg leading-tight" style={{ color: 'var(--text-1)' }}>
          # {channel.name}
        </h2>
        {channel.description && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>{channel.description}</p>
        )}
      </div>

      <PostComposer channels={channels} defaultChannelId={channel.id} onPosted={addPost} />

      {loading && posts.length === 0 ? (
        <div className="space-y-4 mt-4">
          {[...Array(4)].map((_, i) => (
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
          <p className="text-sm">このチャンネルにはまだ投稿がありません</p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden mt-4"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
        >
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              channels={channels}
              onUpdate={updatePost}
              showChannel={false}
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
