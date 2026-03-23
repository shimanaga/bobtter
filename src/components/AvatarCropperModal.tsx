import { useState, useRef } from 'react'
import { Check, ZoomIn, ZoomOut } from 'lucide-react'

const CROP_SIZE = 280 // px — display diameter of the crop circle

interface Props {
  src: string
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

function clamp(ox: number, oy: number, s: number, natW: number, natH: number) {
  const maxOx = (natW * s - CROP_SIZE) / 2
  const maxOy = (natH * s - CROP_SIZE) / 2
  return {
    x: Math.max(-maxOx, Math.min(maxOx, ox)),
    y: Math.max(-maxOy, Math.min(maxOy, oy)),
  }
}

export default function AvatarCropperModal({ src, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [nat, setNat] = useState({ w: 1, h: 1 })
  const [minScale, setMinScale] = useState(1)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })
  const lastTouchDist = useRef<number | null>(null)

  function onImgLoad() {
    const img = imgRef.current!
    const w = img.naturalWidth
    const h = img.naturalHeight
    setNat({ w, h })
    const min = Math.max(CROP_SIZE / w, CROP_SIZE / h)
    setMinScale(min)
    setScale(min)
    setOffset({ x: 0, y: 0 })
  }

  function applyScale(next: number) {
    const s = Math.max(minScale, Math.min(next, minScale * 5))
    setScale(s)
    setOffset(prev => clamp(prev.x, prev.y, s, nat.w, nat.h))
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    applyScale(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
  }

  function handleMouseDown(e: React.MouseEvent) {
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    offsetStart.current = { ...offset }
    e.preventDefault()
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return
    setOffset(clamp(
      offsetStart.current.x + e.clientX - dragStart.current.x,
      offsetStart.current.y + e.clientY - dragStart.current.y,
      scale, nat.w, nat.h,
    ))
  }

  function stopDrag() { dragging.current = false }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      dragging.current = true
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      offsetStart.current = { ...offset }
    } else if (e.touches.length === 2) {
      dragging.current = false
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastTouchDist.current = Math.hypot(dx, dy)
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 1 && dragging.current) {
      setOffset(clamp(
        offsetStart.current.x + e.touches[0].clientX - dragStart.current.x,
        offsetStart.current.y + e.touches[0].clientY - dragStart.current.y,
        scale, nat.w, nat.h,
      ))
    } else if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      applyScale(scale * dist / lastTouchDist.current)
      lastTouchDist.current = dist
    }
  }

  function handleTouchEnd() {
    dragging.current = false
    lastTouchDist.current = null
  }

  function handleRangeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const t = parseInt(e.target.value) / 100
    applyScale(minScale + t * minScale * 4)
  }

  function handleConfirm() {
    const img = imgRef.current!
    const OUTPUT = 400
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2)
    ctx.clip()
    // Map display circle center → source image rect
    const sr = (CROP_SIZE / 2) / scale
    const sx = nat.w / 2 - offset.x / scale
    const sy = nat.h / 2 - offset.y / scale
    ctx.drawImage(img, sx - sr, sy - sr, sr * 2, sr * 2, 0, 0, OUTPUT, OUTPUT)
    canvas.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/webp', 0.85)
  }

  const imgW = nat.w * scale
  const imgH = nat.h * scale
  const rangeVal = Math.round(((scale - minScale) / (minScale * 4)) * 100)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-2xl p-5 flex flex-col items-center gap-4"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <p className="font-display font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
          アバターの位置を調整
        </p>

        {/* Crop circle */}
        <div
          style={{
            width: CROP_SIZE,
            height: CROP_SIZE,
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
            cursor: 'grab',
            border: '2px solid var(--accent)',
            userSelect: 'none',
            touchAction: 'none',
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <img
            ref={imgRef}
            src={src}
            onLoad={onImgLoad}
            draggable={false}
            style={{
              position: 'absolute',
              left: CROP_SIZE / 2 + offset.x - imgW / 2,
              top: CROP_SIZE / 2 + offset.y - imgH / 2,
              width: imgW,
              height: imgH,
              pointerEvents: 'none',
            }}
            alt=""
          />
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-3 w-full">
          <button onClick={() => applyScale(scale / 1.2)} className="btn-ghost p-1">
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={rangeVal}
            onChange={handleRangeChange}
            className="flex-1"
          />
          <button onClick={() => applyScale(scale * 1.2)} className="btn-ghost p-1">
            <ZoomIn size={16} />
          </button>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          ドラッグで移動・スクロールでズーム
        </p>

        <div className="flex gap-2 w-full">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm transition-colors"
            style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-base)' }}
          >
            <Check size={14} />
            決定
          </button>
        </div>
      </div>
    </div>
  )
}
