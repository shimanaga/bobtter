import type { Channel, PostWithMeta } from '../lib/database.types'
import PostCard from './PostCard'

interface ThreadItemProps {
  parent: PostWithMeta
  reply: PostWithMeta
  channels: Channel[]
  onUpdate: (updated: PostWithMeta) => void
  onDelete: (id: string) => void
}

export default function ThreadItem({ parent, reply, channels, onUpdate, onDelete }: ThreadItemProps) {
  return (
    <div>
      {/* 親投稿 - スレッドラインあり、フルアクション */}
      <PostCard
        post={parent}
        channels={channels}
        onUpdate={onUpdate}
        onDelete={onDelete}
        showChannel
        noBorderBottom
      />
      {/* 返信 */}
      <PostCard
        post={reply}
        channels={channels}
        onUpdate={onUpdate}
        onDelete={onDelete}
        showChannel={false}
        depth={1}
      />
    </div>
  )
}
