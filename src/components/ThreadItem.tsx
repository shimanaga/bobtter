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
      {/* 親投稿 - スレッドラインあり */}
      <PostCard
        post={parent}
        channels={channels}
        onUpdate={onUpdate}
        onDelete={onDelete}
        showChannel
        threadLine
        noBorderBottom
      />
      {/* 返信 - L字カーブコネクター付き */}
      <div style={{ position: 'relative' }}>
        {/*
          左端からの距離:
            親アバター中心 = px-5(20px) + w-8/2(16px) = 36px → left: 35px
            返信アバター左端 = pl-10(40px) + px-5(20px) = 60px
          高さ: py-4(16px) + アバター中心まで(16px) = 32px → 28px に抑える
        */}
        <div
          style={{
            position: 'absolute',
            left: '35px',
            top: 0,
            width: '27px',
            height: '28px',
            borderLeft: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderBottomLeftRadius: '10px',
            pointerEvents: 'none',
          }}
        />
        <PostCard
          post={reply}
          channels={channels}
          onUpdate={onUpdate}
          onDelete={onDelete}
          showChannel={false}
          depth={1}
        />
      </div>
    </div>
  )
}
