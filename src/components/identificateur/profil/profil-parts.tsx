/**
 * MODE-998 (DET-001 tranche 10) — parts partagées du profil identificateur,
 * extraites VERBATIM de ident-profil-screen.tsx (seuls les préfixes export
 * et les imports sont ajoutés) : couleur d'accent, InfoRow, pavé PIN
 * (NUMPAD_KEYS + PinDots + PinNumpad) et FAQ repliable (FaqItem).
 */
import { useState } from 'react'
import { User, Delete, ChevronDown } from 'lucide-react'
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@/components/ui/collapsible'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'

export const IDENT_COLOR = '#9F8170'

// ─── Info row component ──────────────────────────────────────────────────────

export function InfoRow({ icon: Icon, label, value, soleilMode: sm, darkMode }: { icon: typeof User; label: string; value: string; soleilMode: boolean; darkMode: boolean }) {
  const textCls = darkMode ? 'text-stone-100' : sm ? 'text-black' : ''
  const mutedCls = darkMode ? 'text-stone-400' : 'text-[#78716C]'
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <Icon className={cn('w-4 h-4', mutedCls)} />
        <span className={cn('text-sm', textCls, sm && 'text-base')}>{label}</span>
      </div>
      <span className={cn('text-sm font-medium', mutedCls, textCls, sm && 'text-base')}>
        {value}
      </span>
    </div>
  )
}

// ─── PIN Numpad (used in change PIN sheet) ───────────────────────────────────

export const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export function PinDots({ length }: { length: number }) {
  return (
    <div className="flex justify-center gap-4 mb-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-4 h-4 rounded-full border-2 transition-all duration-150',
            i < length
              ? 'border-[#9F8170] bg-[#9F8170]'
              : 'border-[#9F8170]/40 bg-transparent',
          )}
        />
      ))}
    </div>
  )
}

export function PinNumpad({ onDigit, onDelete, disabled }: { onDigit: (d: string) => void; onDelete: () => void; disabled?: boolean }) {
  const identDarkMode = useIdentificateurStore((s) => s.identDarkMode)
  return (
    <div className="grid grid-cols-3 gap-2 mt-4">
      {NUMPAD_KEYS.map((key) => {
        if (key === '') return <div key="empty" />
        if (key === 'del') {
          return (
            <button
              key="del"
              type="button"
              onClick={onDelete}
              disabled={disabled}
              className={cn(
                'h-14 rounded-xl font-medium text-lg active:scale-95 transition-transform disabled:opacity-40',
                identDarkMode ? 'bg-stone-800 text-stone-400 hover:bg-stone-700' : 'bg-[#F5F0EB] text-[#78716C] hover:bg-[#EDE5DC]',
              )}
            >
              <Delete className="mx-auto size-5" aria-hidden="true" />
            </button>
          )
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => onDigit(key)}
            disabled={disabled}
            className={cn(
              'h-14 rounded-xl border text-lg font-semibold active:scale-95 transition-transform disabled:opacity-40',
              identDarkMode ? 'border-stone-700 bg-stone-800 text-stone-100 hover:bg-stone-700' : 'border-[#E7E0D8] bg-white hover:bg-[#F5F0EB]',
            )}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}

// ─── FAQ Item (to avoid useState inside map) ───────────────────────────────────

export function FaqItem({ faq, textClass, soleilMode: sm }: { faq: { question: string; answer: string }; textClass: string; soleilMode: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-xl border border-border text-left hover:bg-muted/30 transition-colors">
        <span className={cn('text-sm font-medium pr-2', textClass, sm && 'text-base')}>{faq.question}</span>
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground shrink-0 transition-transform',
          open && 'rotate-180',
        )} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-1">
          <p className={cn('text-xs text-muted-foreground leading-relaxed', sm && 'text-sm')}>
            {faq.answer}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
