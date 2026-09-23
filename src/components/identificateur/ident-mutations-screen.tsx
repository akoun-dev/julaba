'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Clock,
  Loader2,
  MapPin,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, ZONES, type Mutation } from '@/lib/stores/identificateur-store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

const ACTOR_TYPE_LABELS: Record<string, string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

const STATUS_LABELS: Record<Mutation['status'], string> = {
  en_attente: 'En attente',
  approuvee: 'Approuvée',
  refusee: 'Refusée',
}

const STATUS_CLASSES: Record<Mutation['status'], string> = {
  en_attente: 'bg-amber-50 text-amber-700',
  approuvee: 'bg-emerald-50 text-emerald-700',
  refusee: 'bg-red-50 text-red-600',
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()} à ${hours}:${mins}`
}

export function IdentMutationsScreen() {
  const { goBack, soleilMode, merchantId, merchantName } = useAppStore()
  const {
    dossiers,
    agentZone,
    mutations,
    mutationsLoading,
    mutationsError,
    fetchMutationsFromServer,
    addMutation,
    identDarkMode,
  } = useIdentificateurStore()
  const { toast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [selectedDossierId, setSelectedDossierId] = useState('')
  const [fromZone, setFromZone] = useState('')
  const [toZone, setToZone] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const dossiersSoumis = useMemo(
    () => dossiers.filter((d) => d.status !== 'brouillon'),
    [dossiers]
  )

  // IDF-MUT-001 — liste rechargée à chaque visite (offline : échec silencieux).
  useEffect(() => {
    if (merchantId) fetchMutationsFromServer(merchantId)
  }, [merchantId, fetchMutationsFromServer])

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedTextClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'

  const openForm = () => {
    setFormError(null)
    setShowForm(true)
  }

  const selectDossier = (dossierId: string) => {
    setSelectedDossierId(dossierId)
    const dossier = dossiersSoumis.find((d) => d.id === dossierId)
    setFromZone(dossier?.zone || agentZone)
    setToZone('')
    setReason('')
    setFormError(null)
  }

  const retry = () => {
    if (merchantId) fetchMutationsFromServer(merchantId)
  }

  const handleSubmit = async () => {
    const dossier = dossiersSoumis.find((d) => d.id === selectedDossierId)
    if (!dossier) {
      setFormError('Sélectionnez le dossier concerné par la mutation.')
      return
    }
    if (!fromZone.trim()) {
      setFormError('Renseignez la zone actuelle de l\u2019acteur.')
      return
    }
    if (!toZone.trim()) {
      setFormError('Indiquez la nouvelle zone de rattachement.')
      return
    }
    if (fromZone.trim() === toZone.trim()) {
      setFormError('La nouvelle zone doit être différente de la zone actuelle.')
      return
    }
    if (!reason.trim()) {
      setFormError('Indiquez le motif de la mutation.')
      return
    }
    if (!merchantId) {
      setFormError('Votre session appareil est introuvable. Déconnectez-vous puis reconnectez-vous.')
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/identificateur/mutations?identificateurId=${encodeURIComponent(merchantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: dossier.dossierNumber || dossier.id,
          actorName: `${dossier.firstName} ${dossier.lastName}`.trim(),
          actorType: dossier.actorType,
          fromZone: fromZone.trim(),
          toZone: toZone.trim(),
          reason: reason.trim(),
          requestedBy: merchantName ? `${merchantName} (${merchantId})` : merchantId,
        }),
      })
      const data = await res.json().catch(() => null) as { mutation?: Mutation; erreur?: string } | null
      if (!res.ok) {
        setFormError(data?.erreur || 'La mutation n\u2019a pas pu être enregistrée. Réessayez.')
        return
      }
      if (data?.mutation) addMutation(data.mutation)
      setShowForm(false)
      setSelectedDossierId('')
      setToZone('')
      setReason('')
      toast({
        title: 'Mutation signalée !',
        description: `${dossier.firstName} ${dossier.lastName} sera déplacé·e vers ${toZone.trim()} après validation du back-office.`,
      })
    } catch {
      setFormError('Pas de connexion. Vérifiez votre réseau et réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  const suggestions = ZONES.filter((z) => z !== fromZone.trim())

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', identDarkMode && 'bg-stone-950 text-stone-100')}>
      {/* Header sticky type identificateur */}
      <header className="sticky top-0 z-30 border-b border-[#E7E0D8] bg-[#FAFAF7]/80 px-4 pb-4 pt-4 backdrop-blur-lg" style={identDarkMode ? { backgroundColor: 'rgba(28,25,23,0.8)', borderColor: 'rgb(68 64 60)' } : undefined}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={goBack} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F0EB]">
                <ArrowLeft className="h-4 w-4 text-[#57534E]" />
              </button>
              <h1 className={cn('text-lg font-bold', textClass)}>Mutations</h1>
            </div>
          </div>
          <span className="rounded-full bg-[#F5F0EB] px-3 py-1 text-[11px] font-semibold text-[#6B584C]">
            {mutations.length} signalée{mutations.length > 1 ? 's' : ''}
          </span>
        </div>
        <p className={cn('mt-1 flex items-center gap-1 text-xs', mutedTextClass)}>
          Signalées par vous
        </p>
      </header>

      <main className="flex flex-col gap-4 px-4 pb-4">
        {/* Action principale */}
        <Button
          type="button"
          onClick={openForm}
          className="h-12 w-full gap-2 rounded-xl bg-[#9F8170] text-sm font-semibold text-white transition-transform active:scale-[0.98] hover:bg-[#8A6E5E]"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Signaler une mutation
        </Button>

        {/* Bannière d'erreur : quoi + quoi faire */}
        {mutationsError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-red-700">{mutationsError}</p>
              <p className="mt-0.5 text-[11px] text-red-600">Les mutations déjà chargées restent affichées.</p>
              <button type="button" onClick={retry} className="mt-1.5 text-xs font-semibold text-red-700 underline underline-offset-2">
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* Chargement : squelettes */}
        {mutationsLoading && mutations.length === 0 && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn('rounded-2xl border p-4', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="mt-2 h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
                </div>
                <Skeleton className="mt-3 h-3 w-40" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
            ))}
          </div>
        )}

        {/* Vide */}
        {!mutationsLoading && mutations.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F0EB] text-[#9F8170]">
              <ArrowLeftRight className="h-6 w-6" />
            </span>
            <p className={cn('mt-3 text-sm font-semibold', textClass)}>Aucune mutation signalée.</p>
            <p className={cn('mt-1 text-xs', mutedTextClass)}>Signalez un changement de zone.</p>
            <Button
              type="button"
              onClick={openForm}
              className="mt-4 rounded-xl bg-[#9F8170] text-sm font-semibold text-white hover:bg-[#8A6E5E]"
            >
              Signaler une mutation
            </Button>
          </div>
        )}

        {/* Liste des mutations signalées */}
        {mutations.length > 0 && (
          <div className="space-y-2">
            {mutations.map((m) => (
              <div key={m.id} className={cn('rounded-2xl border p-4', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn('truncate text-sm font-bold', textClass)}>{m.actorName}</p>
                    <span className={cn('mt-1 inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#6B584C]')}>
                      {ACTOR_TYPE_LABELS[m.actorType] || m.actorType}
                    </span>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_CLASSES[m.status])}>
                    {STATUS_LABELS[m.status]}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-xs">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#9F8170]" />
                  <span className={cn('truncate', textClass)}>{m.fromZone}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-[#9F8170]" />
                  <span className={cn('truncate font-semibold', textClass)}>{m.toZone}</span>
                </div>

                <div className="mt-2 flex items-center gap-1 text-[11px]">
                  <Clock className="h-3 w-3 shrink-0 text-[#78716C]" />
                  <span className={mutedTextClass}>{formatDate(m.createdAt)}</span>
                </div>

                {m.reason && (
                  <p className={cn('mt-2 text-[11px] leading-relaxed', mutedTextClass)}>
                    Motif : {m.reason}
                  </p>
                )}

                {m.status === 'refusee' && m.rejectReason && (
                  <div className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-600">
                    <span className="font-semibold">Refus : </span>
                    {m.rejectReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Sheet bottom — création (pattern identificateur) */}
      <Sheet open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setFormError(null) }}>
        <SheetContent side="bottom" className={cn('max-h-[92dvh] overflow-y-auto rounded-t-2xl', identDarkMode && 'bg-stone-900')}>
          <SheetHeader className="pb-4">
            <SheetTitle className={cn('text-base', textClass)}>Signaler une mutation</SheetTitle>
            <SheetDescription className={cn('text-xs', mutedTextClass)}>
              Un acteur enquêté dépend d&apos;une mauvaise zone — demandez son déplacement au back-office.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 pb-[env(safe-area-inset-bottom)]">
            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-xs text-red-700">{formError}</p>
              </div>
            )}

            {dossiersSoumis.length === 0 ? (
              <div className="rounded-xl border border-[#E7E0D8] bg-[#F5F0EB] px-3 py-4 text-center">
                <p className={cn('text-sm font-semibold', textClass)}>Aucun dossier soumis</p>
                <p className={cn('mt-1 text-xs', mutedTextClass)}>
                  Soumettez d&apos;abord un dossier d&apos;enrôlement pour pouvoir signaler sa mutation de zone.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className={cn('mb-1.5 block text-xs font-semibold uppercase tracking-wide', mutedTextClass)}>Dossier concerné</label>
                  <Select value={selectedDossierId || undefined} onValueChange={selectDossier}>
                    <SelectTrigger className={cn('h-11 rounded-xl border-[#E7E0D8] bg-white text-sm', identDarkMode && 'border-stone-700 bg-stone-950 text-stone-100')}>
                      <SelectValue placeholder="Choisir le dossier" />
                    </SelectTrigger>
                    <SelectContent>
                      {dossiersSoumis.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.firstName} {d.lastName} · {d.dossierNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className={cn('mb-1.5 block text-xs font-semibold uppercase tracking-wide', mutedTextClass)}>Zone actuelle</label>
                  <Input
                    value={fromZone}
                    onChange={(e) => setFromZone(e.target.value)}
                    placeholder="Zone actuelle de l&apos;acteur"
                    className={cn('h-11 rounded-xl border-[#E7E0D8] bg-white text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-[#9F8170]/50', identDarkMode && 'border-stone-700 bg-stone-950 text-stone-100')}
                  />
                </div>

                <div>
                  <label className={cn('mb-1.5 block text-xs font-semibold uppercase tracking-wide', mutedTextClass)}>Nouvelle zone</label>
                  <Input
                    value={toZone}
                    onChange={(e) => setToZone(e.target.value)}
                    placeholder="Nouvelle zone de rattachement"
                    className={cn('h-11 rounded-xl border-[#E7E0D8] bg-white text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-[#9F8170]/50', identDarkMode && 'border-stone-700 bg-stone-950 text-stone-100')}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestions.map((zone) => (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => setToZone(zone)}
                        className="flex items-center gap-1 rounded-full border border-[#E7E0D8] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#57534E] transition-all duration-150 ease-out active:scale-[0.97]"
                      >
                        <MapPin className="h-3 w-3 text-[#9F8170]" />
                        {zone}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={cn('mb-1.5 block text-xs font-semibold uppercase tracking-wide', mutedTextClass)}>Motif</label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Pourquoi cet acteur dépend-il d&apos;une autre zone ?"
                    rows={3}
                    className={cn('rounded-xl border-[#E7E0D8] bg-white text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-[#9F8170]/50', identDarkMode && 'border-stone-700 bg-stone-950 text-stone-100')}
                  />
                </div>

                <div className="flex gap-3 border-t border-[#E7E0D8] pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setShowForm(false); setFormError(null) }}
                    className="flex-1 rounded-xl border-[#E7E0D8] text-sm font-semibold"
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 gap-2 rounded-xl bg-[#9F8170] text-sm font-semibold text-white hover:bg-[#8A6E5E]"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Envoyer la demande
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}