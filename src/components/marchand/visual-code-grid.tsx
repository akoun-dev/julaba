'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Eraser, ShoppingBasket, Sun, Droplet, Key, Sailboat, Leaf, Star, Grip, Armchair, type LucideIcon } from 'lucide-react'

/*
 * Design auth (maquettes) : 9 symboles culturels ivoiriens en grille fixe
 * 3x3 — le code visuel est la séquence de symboles touchés dans l'ordre.
 * ⚠ Le pool historique (emojis légumes, ids 'tomate', 'oignon'…) a été
 * remplacé : les comptes enrôlés avec l'ancien code visuel doivent le
 * re-définir lors d'un nouvel enrôlement (les ids alimentent le hash).
 */
const SYMBOL_POOL: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'panier', label: 'Panier', Icon: ShoppingBasket },
  { id: 'soleil', label: 'Soleil', Icon: Sun },
  { id: 'calabasse', label: 'Calabasse', Icon: Droplet },
  { id: 'cle', label: 'Clé', Icon: Key },
  { id: 'pirogue', label: 'Pirogue', Icon: Sailboat },
  { id: 'cotonnier', label: 'Cotonnier', Icon: Leaf },
  { id: 'etoile', label: 'Étoile', Icon: Star },
  { id: 'cacao', label: 'Cacao', Icon: Grip },
  { id: 'diembe', label: 'Diembé', Icon: Armchair },
]

interface VisualCodeGridProps {
  onComplete: (sequence: string[]) => void
  disabled?: boolean
  error?: boolean
  success?: boolean
  requiredLength?: number
  gridSize?: number
  soleilMode?: boolean
  /** true (défaut) : la séquence est soumise dès qu'elle est complète
   * (enrôlement identificateur). false : la validation passe par un CTA
   * externe (design « Ouvrir ma caisse ») — onChange diffuse la sélection. */
  autoSubmit?: boolean
  /** Diffuse la sélection courante à chaque touche (mode CTA). */
  onChange?: (sequence: string[]) => void
}

export function VisualCodeGrid({
  onComplete,
  disabled = false,
  error = false,
  success = false,
  requiredLength = 4,
  gridSize = 3,
  soleilMode = false,
  autoSubmit = true,
  onChange,
}: VisualCodeGridProps) {
  const [selection, setSelection] = useState<string[]>([])

  // Pool fixe de 9 symboles (design maquette) : la grille 3x3 les affiche
  // tous, toujours au même endroit — repérage mémoriel facilité.
  const gridIcons = SYMBOL_POOL.slice(0, gridSize * gridSize)

  const isFull = selection.length >= requiredLength

  const handleTap = useCallback(
    (iconId: string) => {
      if (disabled || isFull || success) return

      if (selection.includes(iconId)) {
        const idx = selection.indexOf(iconId)
        const next = selection.slice(0, idx)
        setSelection(next)
        onChange?.(next)
      } else if (selection.length < requiredLength) {
        const newSelection = [...selection, iconId]
        setSelection(newSelection)
        onChange?.(newSelection)

        if (autoSubmit && newSelection.length === requiredLength) {
          setTimeout(() => {
            onComplete(newSelection)
          }, 400)
        }
      }
    },
    [disabled, isFull, success, selection, requiredLength, onComplete, autoSubmit, onChange],
  )

  const handleReset = useCallback(() => {
    if (disabled || success) return
    setSelection([])
    onChange?.([])
  }, [disabled, success, onChange])

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
    maxWidth: soleilMode ? 312 : 280,
  } as React.CSSProperties

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={cn(
          'grid mx-auto gap-2.5',
          error && 'animate-[shake_0.4s_ease-in-out]',
          success && 'animate-[pulse_0.6s_ease-in-out]',
        )}
        style={gridStyle}
      >
        {gridIcons.map(({ id, label, Icon }) => {
          const order = selection.indexOf(id)
          const isSelected = order !== -1

          return (
            <button
              key={id}
              type="button"
              onClick={() => handleTap(id)}
              disabled={disabled || success}
              aria-pressed={isSelected}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-white transition-all duration-200 active:scale-95 w-full aspect-square',
                isSelected
                  ? error
                    ? 'border-red-400 bg-red-50 scale-95'
                    : success
                      ? 'border-green-400 bg-green-50 scale-95'
                      : 'border-[#B4531F] bg-[#FBF0E1] scale-95'
                  : 'border-[#F0E4D3] shadow-[0_1px_2px_rgba(122,62,29,0.06)] hover:border-[#BC5A2E]/40',
                disabled && 'opacity-50 pointer-events-none',
              )}
            >
              <Icon
                className={cn(
                  'transition-transform duration-200',
                  soleilMode ? 'w-9 h-9' : 'w-7 h-7',
                  isSelected && 'scale-110',
                  isSelected
                    ? error
                      ? 'text-red-600'
                      : success
                        ? 'text-green-600'
                        : 'text-[#B4531F]'
                    : 'text-[#7A4A2B]',
                )}
                strokeWidth={isSelected ? 2.2 : 1.8}
              />
              <span
                className={cn(
                  'leading-tight font-medium',
                  soleilMode ? 'text-xs' : 'text-[11px]',
                  isSelected
                    ? error
                      ? 'text-red-600'
                      : success
                        ? 'text-green-600'
                        : 'text-[#B4531F]'
                    : 'text-[#8C7B6B]',
                )}
              >
                {label}
              </span>
              {isSelected && (
                <div
                  className={cn(
                    'absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center font-bold text-white border-2 border-white',
                    error
                      ? 'bg-red-500'
                      : success
                        ? 'bg-green-500'
                        : 'bg-[#BC5A2E]',
                    soleilMode ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-[10px]',
                  )}
                >
                  {order + 1}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selection.length > 0 && !success && (
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            'flex items-center gap-1.5 rounded-full border border-[#F0E4D3] bg-white px-3.5 py-1.5 text-sm font-medium text-[#7A4A2B] shadow-sm transition-colors hover:border-[#BC5A2E]/40',
            soleilMode && 'text-base',
          )}
        >
          <Eraser className="w-3.5 h-3.5" />
          Effacer
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
