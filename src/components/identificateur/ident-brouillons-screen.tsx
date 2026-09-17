'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Search, ArrowUpDown, FileEdit, Upload, Trash2 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, generateDossierNumber, type Dossier } from '@/lib/stores/identificateur-store'
import { submitDossierToServer } from '@/lib/identificateur-sync'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

const ACTOR_TYPE_LABELS: Record<string, string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

// Required fields for submission validation
const REQUIRED_FIELDS: (keyof Dossier)[] = [
  'firstName',
  'lastName',
  'phone',
  'photoBase64',
  'zone',
  'actorType',
  'activite',
]

const REQUIRED_FIELD_LABELS: Partial<Record<keyof Dossier, string>> = {
  firstName: 'le prénom',
  lastName: 'le nom',
  phone: 'le téléphone',
  photoBase64: 'la photo',
  zone: 'la zone',
  actorType: "l'identité de l'acteur",
  activite: "l'activité",
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month} à ${hours}:${mins}`
}

function getCompletionCount(dossier: Dossier): { filled: number; total: number } {
  let filled = 0
  for (const field of REQUIRED_FIELDS) {
    const val = dossier[field]
    if (typeof val === 'string' && val.trim() !== '') filled++
  }
  return { filled, total: REQUIRED_FIELDS.length }
}

export function IdentBrouillonsScreen() {
  const { goBack, navigate, soleilMode } = useAppStore()
  const { dossiers, setCurrentDraftId, deleteDossier, updateDossier, identDarkMode } = useIdentificateurStore()
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [sortRecent, setSortRecent] = useState(true) // true = plus récents

  const textClass = soleilMode ? 'text-black' : ''
  const smallTextClass = soleilMode ? 'text-sm' : 'text-xs'
  // Palette identificateur — identique aux vues du menu (missions, suivi) :
  // cartes blanches bordées #E7E0D8 sur fond beige, stone en mode sombre.
  const dark = identDarkMode && !soleilMode
  const cardClass = dark ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]'

  // Filter & sort drafts
  const sortedDrafts = useMemo(() => {
    let result = dossiers.filter((d) => d.status === 'brouillon')

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((d) =>
        (d.firstName + ' ' + d.lastName).toLowerCase().includes(q) ||
        d.phone.toLowerCase().includes(q) ||
        d.dossierNumber.toLowerCase().includes(q)
      )
    }

    result.sort((a, b) =>
      sortRecent ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt
    )

    return result
  }, [dossiers, searchQuery, sortRecent])

  const handleReprendre = (dossier: Dossier) => {
    setCurrentDraftId(dossier.id)
    navigate('ident-identification')
  }

  const handleSoumettre = async (dossier: Dossier) => {
    const { filled, total } = getCompletionCount(dossier)
    const hasAuth = Boolean(dossier.pinHash || dossier.patternHash || dossier.visualCodeHash)
    if (filled < total || !hasAuth) {
      const missing = REQUIRED_FIELDS
        .filter((field) => {
          const value = dossier[field]
          return typeof value !== 'string' || value.trim() === ''
        })
        .map((field) => REQUIRED_FIELD_LABELS[field] ?? field)
      if (!hasAuth) missing.push('un code PIN, un schéma ou un code visuel')
      toast({
        title: 'Champs manquants',
        description: `Ajoutez ${missing.join(', ')} avant d'envoyer le dossier. (${filled}/${total})`,
      })
      return
    }

    const currentDossiers = useIdentificateurStore.getState().dossiers
    const dossierToSubmit = dossier.dossierNumber
      ? dossier
      : { ...dossier, dossierNumber: generateDossierNumber(currentDossiers) }
    if (!dossier.dossierNumber) {
      updateDossier(dossier.id, { dossierNumber: dossierToSubmit.dossierNumber })
    }
    const result = await submitDossierToServer(dossierToSubmit)

    if (result.status === 'lost') {
      // Neither the live request nor the offline queue worked — leave the
      // draft as a draft (status unchanged) and say so, instead of marking
      // it submitted when nothing was actually recorded.
      toast({
        title: 'Dossier non envoyé',
        description: result.reason || `${dossier.firstName} ${dossier.lastName} n'a pas pu être enregistré. Réessayez.`,
      })
      return
    }

    updateDossier(dossier.id, {
      status: 'en_attente',
      submittedAt: Date.now(),
    })
    toast({
      title: 'Dossier soumis !',
      description: result.status === 'synced'
        ? `${dossier.firstName} ${dossier.lastName} est en attente de validation.`
        : `${dossier.firstName} ${dossier.lastName} enregistré, en attente de synchronisation.`,
    })
  }

  const handleSupprimer = (dossier: Dossier) => {
    deleteDossier(dossier.id)
    toast({
      title: 'Brouillon supprimé',
      description: `Le brouillon de ${dossier.firstName || 'Sans nom'} a été supprimé.`,
    })
  }

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', dark && 'bg-stone-950 text-stone-100')}>
      {/* Top bar — même bannière brune que l'écran Suivi */}
      <div
        className="flex items-center gap-2.5 rounded-b-[20px] px-4 py-3.5 text-white"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="text-white/80 hover:text-white hover:bg-white/10 h-9 w-9"
          onClick={goBack}
          aria-label="Retour"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-[15px] font-bold">
          Mes brouillons
        </span>
      </div>

      {/* Search bar */}
      <div className="px-4 mt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716C]" />
          <Input
            placeholder="Rechercher par nom ou téléphone..."
            className="pl-9 h-11 rounded-xl bg-[#F5F0EB] border-0 text-sm focus-visible:ring-1 focus-visible:ring-[#9F8170]/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Sort toggle */}
      <div className="px-4 mt-3 flex items-center justify-between">
        <p className={cn('text-xs text-[#78716C]', dark && 'text-stone-400', soleilMode && 'text-sm')}>
          {sortedDrafts.length} brouillon{sortedDrafts.length > 1 ? 's' : ''}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => setSortRecent(!sortRecent)}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sortRecent ? 'Plus récents' : 'Plus anciens'}
        </Button>
      </div>

      {/* Drafts list or empty state */}
      {sortedDrafts.length === 0 ? (
        <div className={cn('flex flex-col items-center justify-center py-20 text-center px-6')}>
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: dark ? '#3A322C' : '#F5F0EB' }}
          >
            <FileEdit className="size-8" style={{ color: IDENT_COLOR }} />
          </div>
          <p className={cn('font-semibold text-base', textClass)}>
            Aucun brouillon
          </p>
          <p className={cn('text-sm text-[#78716C] mt-1', dark && 'text-stone-400', soleilMode && 'text-base')}>
            Vos brouillons de dossiers apparaîtront ici.
          </p>
          <Button
            className="mt-4"
            style={{ backgroundColor: IDENT_COLOR, color: 'white' }}
            onClick={() => navigate('ident-identification')}
          >
            + Nouveau dossier
          </Button>
        </div>
      ) : (
        <div className="px-4 mt-3 space-y-2">
          {sortedDrafts.map((dossier) => {
            const { filled, total } = getCompletionCount(dossier)
            const actorName = (dossier.firstName + ' ' + dossier.lastName).trim() || 'Sans nom'
            const completionPct = Math.round((filled / total) * 100)

            return (
              <Card key={dossier.id} className={cn('rounded-xl transition-shadow hover:shadow-md', cardClass)}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
                      style={{ backgroundColor: dark ? '#3A322C' : '#F5F0EB' }}
                    >
                      <FileEdit className="size-5" style={{ color: IDENT_COLOR }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + type */}
                      <div className="flex items-center gap-2">
                        <p className={cn('font-semibold text-sm truncate', textClass, soleilMode && 'text-base')}>
                          {actorName}
                        </p>
                        <span className={cn('shrink-0 rounded-full bg-[#F5F0EB] px-2 py-0.5 text-[10px] font-semibold text-[#6B584C]', dark && 'bg-stone-800 text-stone-300')}>
                          {ACTOR_TYPE_LABELS[dossier.actorType] || dossier.actorType}
                        </span>
                      </div>

                      {/* Updated date */}
                      <p className={cn('text-[11px] text-[#78716C] mt-0.5', dark && 'text-stone-400', soleilMode && 'text-xs')}>
                        Modifié le {formatDate(dossier.updatedAt)}
                      </p>

                      {/* Completion indicator */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className={cn('flex-1 h-2 rounded-full overflow-hidden', dark ? 'bg-stone-800' : 'bg-[#E7E0D8]')}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${completionPct}%`,
                              backgroundColor:
                                completionPct === 100
                                  ? '#22c55e'
                                  : completionPct >= 60
                                    ? '#eab308'
                                    : IDENT_COLOR,
                            }}
                          />
                        </div>
                        <span className={cn('text-[10px] text-[#78716C] shrink-0', dark && 'text-stone-400', soleilMode && 'text-xs')}>
                          {filled}/{total} champs requis
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 mt-2.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 flex-1"
                          style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }}
                          onClick={() => handleReprendre(dossier)}
                        >
                          <><FileEdit className="size-3.5" /> Reprendre</>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 flex-1 text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => handleSoumettre(dossier)}
                        >
                          <><Upload className="size-3.5" /> Soumettre</>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-red-500 border-red-200 hover:bg-red-50 shrink-0"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Supprimer ce brouillon ?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Le brouillon de <strong>{actorName}</strong> sera définitivement supprimé. Cette action est irréversible.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-500 hover:bg-red-600 text-white"
                                onClick={() => handleSupprimer(dossier)}
                              >
                                Supprimer
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
