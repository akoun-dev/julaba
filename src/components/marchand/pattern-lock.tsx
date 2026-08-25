'use client'

import { useRef, useState, useCallback } from 'react'

/*
 * Grid layout (3x3):
 *   0  1  2
 *   3  4  5
 *   6  7  8
 */
const DOT_POSITIONS = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0, y: 1 },
  { x: 0.5, y: 1 },
  { x: 1, y: 1 },
]

const INTERMEDIATES: Record<string, number> = {
  '0-2': 1, '2-0': 1,
  '0-6': 3, '6-0': 3,
  '0-8': 4, '8-0': 4,
  '1-7': 4, '7-1': 4,
  '2-6': 4, '6-2': 4,
  '2-8': 7, '8-2': 7,
  '3-5': 4, '5-3': 4,
  '6-8': 7, '8-6': 7,
}

const MIN_DOTS = 4

export interface PatternLockProps {
  onComplete: (pattern: number[]) => void
  disabled?: boolean
  size?: number
  error?: boolean
  success?: boolean
}

export function PatternLock({
  onComplete,
  disabled = false,
  size = 260,
  error = false,
  success = false,
}: PatternLockProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [trackingPos, setTrackingPos] = useState<{ x: number; y: number } | null>(null)
  const isDrawingRef = useRef(false)
  const selectedRef = useRef<number[]>([])

  const padding = 48
  const gridSize = size - padding * 2
  const hitRadius = 28

  const dotCenter = (i: number) => ({
    x: padding + DOT_POSITIONS[i].x * gridSize,
    y: padding + DOT_POSITIONS[i].y * gridSize,
  })

  const toSVG = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const scaleX = size / rect.width
    const scaleY = size / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const hitTest = (x: number, y: number): number => {
    for (let i = 0; i < 9; i++) {
      if (selectedRef.current.includes(i)) continue
      const c = dotCenter(i)
      if (Math.hypot(x - c.x, y - c.y) <= hitRadius) return i
    }
    return -1
  }

  const addDot = useCallback((dot: number) => {
    if (selectedRef.current.includes(dot)) return
    const last = selectedRef.current[selectedRef.current.length - 1]
    if (last !== undefined) {
      const mid = INTERMEDIATES[`${last}-${dot}`]
      if (mid !== undefined && !selectedRef.current.includes(mid)) {
        selectedRef.current = [...selectedRef.current, mid]
      }
    }
    selectedRef.current = [...selectedRef.current, dot]
    setSelected([...selectedRef.current])
  }, [])

  const resetPattern = useCallback(() => {
    isDrawingRef.current = false
    selectedRef.current = []
    setSelected([])
    setTrackingPos(null)
  }, [])

  const onStart = (clientX: number, clientY: number) => {
    if (disabled || error) return
    resetPattern()
    const pt = toSVG(clientX, clientY)
    const dot = hitTest(pt.x, pt.y)
    if (dot >= 0) {
      isDrawingRef.current = true
      selectedRef.current = [dot]
      setSelected([dot])
      setTrackingPos(pt)
    }
  }

  const onMove = (clientX: number, clientY: number) => {
    if (!isDrawingRef.current) return
    const pt = toSVG(clientX, clientY)
    setTrackingPos(pt)
    const dot = hitTest(pt.x, pt.y)
    if (dot >= 0) addDot(dot)
  }

  const onEnd = () => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    setTrackingPos(null)
    if (selectedRef.current.length >= MIN_DOTS) {
      onComplete([...selectedRef.current])
    } else if (selectedRef.current.length > 0) {
      setSelected([])
      selectedRef.current = []
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    const t = e.touches[0]
    onStart(t.clientX, t.clientY)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    const t = e.touches[0]
    onMove(t.clientX, t.clientY)
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    onEnd()
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    onStart(e.clientX, e.clientY)
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault()
    onMove(e.clientX, e.clientY)
  }
  const handleMouseUp = () => onEnd()

  const handleGlobalMouseUp = useCallback(() => {
    if (isDrawingRef.current) onEnd()
  }, [onEnd])

  const activeColor = error ? '#DC2626' : success ? '#16A34A' : '#C66A2C'
  const dotInactive = '#D4C4B0'
  const dotRing = error ? 'rgba(220,38,38,0.2)' : success ? 'rgba(22,163,74,0.2)' : 'rgba(198,106,44,0.15)'
  const lastSelected = selected.length > 0 ? selected[selected.length - 1] : -1

  return (
    <div
      ref={containerRef}
      className="relative select-none touch-none"
      style={{ width: size, height: size }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleGlobalMouseUp}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {selected.map((dotIdx, i) => {
          if (i === 0) return null
          const from = dotCenter(selected[i - 1])
          const dest = dotCenter(dotIdx)
          return (
            <line
              key={`line-${i}`}
              x1={from.x} y1={from.y}
              x2={dest.x} y2={dest.y}
              stroke={activeColor}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.7}
            />
          )
        })}

        {trackingPos && lastSelected >= 0 && (
          <line
            x1={dotCenter(lastSelected).x}
            y1={dotCenter(lastSelected).y}
            x2={trackingPos.x}
            y2={trackingPos.y}
            stroke={activeColor}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.35}
          />
        )}

        {DOT_POSITIONS.map((_, i) => {
          const c = dotCenter(i)
          const isActive = selected.includes(i)
          return (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r={hitRadius} fill="transparent" />
              {isActive && (
                <circle cx={c.x} cy={c.y} r={22} fill={dotRing} />
              )}
              <circle
                cx={c.x} cy={c.y}
                r={isActive ? 10 : 8}
                fill={isActive ? activeColor : dotInactive}
              />
              {isActive && (
                <circle cx={c.x} cy={c.y} r={4} fill="white" />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
