import { useParams } from 'react-router-dom'
import { useTimeline } from '../hooks/useTimeline'
import { useChannelPrefs } from '../contexts/ChannelPrefsContext'
import PostCard from '../components/PostCard'
import PostComposer from '../components/PostComposer'
import ThreadItem from '../components/ThreadItem'
import type { Channel } from '../lib/database.types'

interface ChannelPageProps {
  channels: Channel[]
}

export default function ChannelPage({ channels }: ChannelPageProps) {
  const { slug } = useParams<{ slug: string }>()
  const channel = channels.find(c => c.slug === slug)
  const { items, loading, loadingMore, hasMore, fetchMore, updateItem, deleteItem, addPost } = useTimeline(slug)
  const { getHideReplies, setHideReplies } = useChannelPrefs()

  const hideReplies = channel ? getHideReplies(channel.id) : false
  const displayItems = hideReplies
    ? items.flatMap(item => {
        if (item.type === 'post') return item.post.parent_id === null ? [item] : []
        // thread: parentをスタンドアロン投稿として表示、replyは非表示
        return [{ type: 'post' as const, post: item.parent }]
      })
    : items

  if (!channel) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center" style={{ color: 'var(--text-3)' }}>
        チャンネルが見つかりません
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h2 className="font-display font-bold text-lg leading-tight" style={{ color: 'var(--text-1)' }}>
          # {channel.name}
        </h2>
        {channel.description && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>{channel.description}</p>
        )}
      </div>

      <PostComposer channels={channels} defaultChannelId={channel.id} onPosted={addPost} />

      <div className="flex w-full mt-3 mb-1 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {([false, true] as const).map(val => (
          <button
            key={String(val)}
            onClick={() => setHideReplies(channel.id, val)}
            className="flex-1 text-xs py-1.5 transition-colors text-center"
            style={{
              backgroundColor: hideReplies === val ? 'var(--accent-dim)' : 'transparent',
              color: hideReplies === val ? 'var(--accent)' : 'var(--text-3)',
              borderRight: !val ? '1px solid var(--border)' : undefined,
            }}
          >
            {val ? '返信を非表示' : '全て表示'}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-4 mt-4">
          {[...Array(4)].map((_, i) => (
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
          <p className="text-sm">このチャンネルにはまだ投稿がありません</p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden mt-4"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}
        >
          {displayItems.map(item =>
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
                showChannel={false}
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
