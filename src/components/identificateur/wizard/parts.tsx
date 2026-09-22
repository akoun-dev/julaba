"use client"

// MODE-989 (DET-001 tranche 3) — bloc déplacé VERBATIM de
// ident-identification-screen.tsx (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// Constantes du wizard + sous-composants de rendu partagés
// (StepHero, CniSlot, SectionTitle, ReviewRow, MultiSelectField).
import React from 'react'
import {
  Camera,
  Trash2,
  MapPin,
  FileText,
  RotateCcw,
  Check,
  Lock,
  AlertTriangle,
  UserRound,
  CreditCard,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  useIdentificateurStore,
} from '@/lib/stores/identificateur-store'

export const IDENT_COLOR = '#9F8170'
export const TOTAL_STEPS = 5

// L'enrôlement démarre par la CNI : une seule action (scanner la carte)
// qui pré-remplit toute l'identité par OCR — l'étape la plus utile pour
// l'agent, et celle qui réduit le plus la saisie manuelle ensuite.
export const STEPS_META = [
  { label: 'CNI', icon: CreditCard },
  { label: 'Photo & Identité', icon: UserRound },
  { label: 'Détails', icon: FileText },
  { label: 'Localisation', icon: MapPin },
  { label: 'Autorisation', icon: Lock },
]

export function StepHero({ step, icon, title, description }: {
  step: number
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{ borderColor: `${IDENT_COLOR}45`, backgroundColor: `${IDENT_COLOR}0a` }}
    >
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${IDENT_COLOR}1a` }}
      >
        <span style={{ color: IDENT_COLOR }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: IDENT_COLOR }}>
          Étape {step} sur 5
        </p>
        <h2 className="text-base font-bold leading-snug" style={{ color: IDENT_COLOR }}>
          {title}
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// Emplacement de capture d'une face de la CNI (recto ou verso). Ratio
// 1.586 = format réel d'une carte ID-1 (85,6 × 54 mm).

export function CniSlot({ label, image, onCapture, onRemove }: {
  label: string
  image?: string
  onCapture: () => void
  onRemove: () => void
}) {
  if (image) {
    return (
      <div className="relative overflow-hidden rounded-xl border-2" style={{ borderColor: IDENT_COLOR }}>
        <img src={image} alt={`CNI — ${label}`} className="aspect-[1.586] w-full object-cover" />
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: IDENT_COLOR }}
        >
          {label}
        </span>
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button
            onClick={onCapture}
            className="rounded-full border bg-white/95 p-2 shadow-md transition-colors hover:bg-[#F5F0EB]"
            style={{ borderColor: IDENT_COLOR }}
            aria-label={`Reprendre le ${label}`}
          >
            <RotateCcw className="size-3.5" style={{ color: IDENT_COLOR }} />
          </button>
          <button
            onClick={onRemove}
            className="rounded-full border border-red-200 bg-white/95 p-2 text-red-500 shadow-md transition-colors hover:bg-red-50"
            aria-label={`Supprimer le ${label}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onCapture}
      className="flex aspect-[1.586] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-colors hover:bg-[#F5F0EB]"
      style={{ borderColor: `${IDENT_COLOR}80` }}
    >
      <CreditCard className="size-8" style={{ color: IDENT_COLOR, opacity: 0.65 }} />
      <span className="text-xs font-semibold" style={{ color: IDENT_COLOR }}>
        Scanner le {label.toLowerCase()}
      </span>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Camera className="size-3" aria-hidden /> Photo ou galerie
      </span>
    </button>
  )
}

export function SectionTitle({ icon, title, required }: { icon: React.ReactNode; title: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: IDENT_COLOR }}>
      <span style={{ color: IDENT_COLOR }}>{icon}</span>
      <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: IDENT_COLOR }}>
        {title} {required && <span className="text-red-500">*</span>}
      </h2>
    </div>
  )
}

export function ReviewRow({
  label,
  complete,
  required,
  detail,
  onEdit,
}: {
  label: string
  complete: boolean
  required?: boolean
  detail?: string
  onEdit: () => void
}) {
  const identDarkMode = useIdentificateurStore((s) => s.identDarkMode)
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${identDarkMode ? 'bg-stone-800/70' : 'bg-white/70'}`}>
      {complete ? <Check className="size-4 shrink-0 text-green-600" /> : <AlertTriangle className="size-4 shrink-0 text-amber-600" />}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}{required && <span className="text-red-500"> *</span>}</span>
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
      <button type="button" onClick={onEdit} className="shrink-0 text-xs font-medium underline" style={{ color: IDENT_COLOR }}>Modifier</button>
    </div>
  )
}

export function MultiSelectField({ label, max, items, selected, onToggle, txtClass }: {
  label: string
  max: number
  items: string[]
  selected: string[]
  onToggle: (item: string) => void
  txtClass: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className={`text-sm font-medium`}>
        {label} <span className="text-muted-foreground font-normal">(max {max})</span>
      </Label>
      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-md border p-2">
        {items.map((p) => {
          const checked = selected.includes(p)
          return (
            <label key={p} className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(p)}
                className="data-[state=checked]:bg-[#9F8170] data-[state=checked]:border-[#9F8170]"
              />
              <span className={txtClass}>{p}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
