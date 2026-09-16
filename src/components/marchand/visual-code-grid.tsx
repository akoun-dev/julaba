'use client'

import { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { RotateCcw } from 'lucide-react'

const ICON_POOL = [
  { id: 'tomate', emoji: '🍅', label: 'Tomate' },
  { id: 'oignon', emoji: '🧅', label: 'Oignon' },
  { id: 'piment', emoji: '🌶️', label: 'Piment' },
  { id: 'aubergine', emoji: '🍆', label: 'Aubergine' },
  { id: 'gombo', emoji: '🥘', label: 'Gombo' },
  { id: 'carotte', emoji: '🥕', label: 'Carotte' },
  { id: 'salade', emoji: '🥬', label: 'Salade' },
  { id: 'ignam', emoji: '🥔', label: 'Ignam' },
  { id: 'banane', emoji: '🍌', label: 'Banane' },
  { id: 'avocat', emoji: '🥑', label: 'Avocat' },
  { id: 'mais', emoji: '🌽', label: 'Maïs' },
  { id: 'riz', emoji: '🍚', label: 'Riz' },
  { id: 'oeuf', emoji: '🥚', label: 'Œuf' },
  { id: 'arachide', emoji: '🥜', label: 'Arachide' },
  { id: 'poisson', emoji: '🐟', label: 'Poisson' },
  { id: 'poulet', emoji: '🐔', label: 'Poulet' },
] as const

function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const shuffled = [...arr]
  let s = seed
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647
    const j = s % (i + 1)
    const tmp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = tmp
  }
  return shuffled
}

interface VisualCodeGridProps {
  onComplete: (sequence: string[]) => void
  disabled?: boolean
  error?: boolean
  success?: boolean
  requiredLength?: number
  gridSize?: number
  soleilMode?: boolean
}

export function VisualCodeGrid({
  onComplete,
  disabled = false,
  error = false,
  success = false,
  requiredLength = 4,
  gridSize = 3,
  soleilMode = false,
}: VisualCodeGridProps) {
  const [selection, setSelection] = useState<string[]>([])
  const [gridSeed] = useState(() => Math.floor(Math.random() * 100000))

  const gridIcons = useMemo(
    () => seededShuffle(ICON_POOL, gridSeed).slice(0, gridSize * gridSize),
    [gridSeed, gridSize],
  )

  const isFull = selection.length >= requiredLength

  const handleTap = useCallback(
    (iconId: string) => {
      if (disabled || isFull || success) return

      if (selection.includes(iconId)) {
        const idx = selection.indexOf(iconId)
        setSelection(selection.slice(0, idx))
      } else if (selection.length < requiredLength) {
        const newSelection = [...selection, iconId]
        setSelection(newSelection)

        if (newSelection.length === requiredLength) {
          setTimeout(() => {
            onComplete(newSelection)
          }, 400)
        }
      }
    },
    [disabled, isFull, success, selection, requiredLength, onComplete],
  )

  const handleReset = useCallback(() => {
    if (disabled || success) return
    setSelection([])
  }, [disabled, success])

  const cols = `repeat(${gridSize}, 1fr)`
  /* Fluide : la grille se cale sur la largeur disponible (max 264px en
     standard, 312px en mode Soleil) au lieu d'imposer 3 cellules fixes —
     à 320px les cellules rétrécissent au lieu de faire déborder la carte
     de login. Les cellules passent en aspect-square pour garder des
     cibles carrées quelle que soit la largeur rendue. */
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: cols,
    width: '100%',
    maxWidth: soleilMode ? 312 : 264,
  } as React.CSSProperties

  const progressDots = Array.from({ length: requiredLength }).map((_, i) => {
    const filled = i < selection.length
    let dotClass = 'w-3 h-3 rounded-full transition-all duration-300'
    if (soleilMode) dotClass += ' w-4 h-4'
    if (filled) {
      if (error) dotClass += ' bg-red-500 scale-125'
      else if (success) dotClass += ' bg-green-500 scale-125'
      else dotClass += ' bg-[#C66A2C] scale-110'
    } else {
      dotClass += ' bg-muted-foreground/20'
    }
    return (
      <div key={i} className={dotClass} />
    )
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-1.5">
        {progressDots}
        <span className={cn('text-xs text-muted-foreground ml-2', soleilMode && 'text-sm')}>
          {selection.length}/{requiredLength}
        </span>
      </div>

      <div
        className={cn(
          'grid mx-auto gap-3',
          error && 'animate-[shake_0.4s_ease-in-out]',
          success && 'animate-[pulse_0.6s_ease-in-out]',
        )}
        style={gridStyle}
      >
        {gridIcons.map((icon) => {
          const order = selection.indexOf(icon.id)
          const isSelected = order !== -1

          let cellClass = 'relative flex flex-col items-center justify-center rounded-2xl transition-all duration-200 active:scale-95 w-full aspect-square'

          if (isSelected) {
            if (error) cellClass += ' bg-red-100 border-2 border-red-400 scale-95'
            else if (success) cellClass += ' bg-green-100 border-2 border-green-400 scale-95'
            else cellClass += ' bg-[#C66A2C]/10 border-2 border-[#C66A2C] scale-95'
          } else {
            cellClass += ' bg-muted/50 border-2 border-transparent hover:border-[#C66A2C]/30 hover:bg-[#C66A2C]/5'
          }

          if (disabled) cellClass += ' opacity-50 pointer-events-none'

          let emojiClass = 'leading-none transition-transform duration-200'
          if (soleilMode) emojiClass += ' text-4xl'
          else emojiClass += ' text-3xl'
          if (isSelected) emojiClass += ' scale-110'

          let labelClass = 'mt-0.5 text-[10px] leading-tight font-medium'
          if (soleilMode) labelClass += ' text-xs'
          if (isSelected) {
            if (error) labelClass += ' text-red-600'
            else if (success) labelClass += ' text-green-600'
            else labelClass += ' text-[#C66A2C]'
          } else {
            labelClass += ' text-muted-foreground'
          }

          let badgeClass = 'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white'
          if (soleilMode) badgeClass += ' w-6 h-6 text-xs'
          if (error) badgeClass += ' bg-red-500'
          else if (success) badgeClass += ' bg-green-500'
          else badgeClass += ' bg-[#C66A2C]'

          return (
            <button
              key={icon.id}
              type="button"
              onClick={() => handleTap(icon.id)}
              disabled={disabled || success}
              className={cellClass}
            >
              <span className={emojiClass}>{icon.emoji}</span>
              <span className={labelClass}>{icon.label}</span>
              {isSelected && (
                <div className={badgeClass}>{order + 1}</div>
              )}
            </button>
          )
        })}
      </div>

      {!isFull && selection.length > 0 && !success && (
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            'flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#C66A2C] transition-colors',
            soleilMode && 'text-base',
          )}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Recommencer
        </button>
      )}
    </div>
  )
}

export function visualCodeToHash(sequence: string[]): string {
  let hash = 0
  const str = sequence.join('>')
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + c
    hash |= 0
  }
  return hash.toString()
}
