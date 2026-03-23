import { useTimeline } from '../hooks/useTimeline'
import PostCard from '../components/PostCard'
import PostComposer from '../components/PostComposer'
import ThreadItem from '../components/ThreadItem'
import { useChannelPrefs } from '../contexts/ChannelPrefsContext'
import type { Channel } from '../lib/database.types'

interface HomePageProps {
  channels: Channel[]
}

export default function HomePage({ channels }: HomePageProps) {
  const { mainExcludedIds } = useChannelPrefs()
  const { items, loading, loadingMore, hasMore, fetchMore, updateItem, deleteItem, addPost } = useTimeline(undefined, mainExcludedIds)

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--text-1)' }}>
          タイムライン
        </h2>
        <PostComposer channels={channels} onPosted={addPost} />
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl h-24 animate-pulse"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>
          <p className="font-display text-4xl mb-3">✦</p>
          <p className="text-sm">まだ投稿がありません</p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
        >
          {items.map(item =>
            item.type === 'thread' ? (
              <ThreadItem
                key={`thread-${item.parent.id}-${item.reply.id}`}
                parent={item.parent}
                reply={item.reply}
                channels={channels}
                onUpdate={updateItem}
                onDelete={deleteItem}
              />
            ) : (
              <PostCard
                key={item.post.id}
                post={item.post}
                channels={channels}
                onUpdate={updateItem}
                onDelete={deleteItem}
                showChannel
              />
            )
          )}
          {hasMore && (
            <button
              onClick={fetchMore}
              disabled={loadingMore}
              className="w-full py-3 text-sm transition-colors"
              style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
            >
              {loadingMore ? '読み込み中...' : 'もっと見る'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
