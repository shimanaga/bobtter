import { useRef, useLayoutEffect, useState, useCallback } from 'react'
import type { Channel, PostWithMeta } from '../lib/database.types'
import PostCard from './PostCard'

interface ThreadItemProps {
  parent: PostWithMeta
  reply: PostWithMeta
  channels: Channel[]
  onUpdate: (updated: PostWithMeta) => void
  onDelete: (id: string) => void
}

interface Connector {
  x: number
  top: number
  height: number
  width: number
}

export default function ThreadItem({ parent, reply, channels, onUpdate, onDelete }: ThreadItemProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [connector, setConnector] = useState<Connector | null>(null)

  const measure = useCallback(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const avatars = wrapper.querySelectorAll<HTMLElement>('[data-thread-avatar]')
    if (avatars.length < 2) return
    const wRect = wrapper.getBoundingClientRect()
    const pAv = avatars[0].getBoundingClientRect()
    const rAv = avatars[1].getBoundingClientRect()
    const x = pAv.left + pAv.width / 2 - wRect.left - 0.5
    const top = pAv.bottom - wRect.top
    const height = rAv.top + rAv.height / 2 - pAv.bottom
    const width = rAv.left - (pAv.left + pAv.width / 2) + 0.5
    if (height > 0 && width > 0) {
      setConnector({ x, top, height, width })
    }
  }, [])

  useLayoutEffect(() => {
    measure()
    // post-enter is a 0.2s translateY animation; re-measure after it finishes
    const timer = setTimeout(measure, 250)
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const ro = new ResizeObserver(measure)
    ro.observe(wrapper)
    return () => { clearTimeout(timer); ro.disconnect() }
  }, [parent.id, reply.id, measure])

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {connector && (
        <div
          style={{
            position: 'absolute',
            left: `${connector.x}px`,
            top: `${connector.top}px`,
            width: `${connector.width}px`,
            height: `${connector.height}px`,
            borderLeft: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderBottomLeftRadius: Math.min(connector.width, 12),
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <PostCard
          post={parent}
          channels={channels}
          onUpdate={onUpdate}
          onDelete={onDelete}
          showChannel
          threadLine
          noBorderBottom
        />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
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
