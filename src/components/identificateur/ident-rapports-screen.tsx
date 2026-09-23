'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MONTHS_FR } from '@/lib/objectifs'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Droplets,
  FileBarChart2,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, bilanEnrolement } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

const ACTOR_TYPE_LABELS: Record<string, string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

export function IdentRapportsScreen() {
  const { goBack, navigate, soleilMode, merchantId } = useAppStore()
  const { dossiers, identDarkMode, setCurrentDraftId, syncDossiersFromServer } = useIdentificateurStore()

  const [loading, setLoading] = useState(true)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const maintenant = new Date()
  const mois = maintenant.getMonth()
  const annee = maintenant.getFullYear()
  const moisLabel = MONTHS_FR[mois].charAt(0).toUpperCase() + MONTHS_FR[mois].slice(1)

  const bilan = useMemo(() => bilanEnrolement(dossiers, maintenant), [dossiers])

  // La route serveur n'est PAS bloquante : l'écran est 100 % local
  // (offline-first). On ne l'interroge que pour lever le squelette initial
  // et signaler — sans jamais masquer les chiffres locaux.
  useEffect(() => {
    let annule = false
    const charge = async () => {
      setLoading(true)
      if (merchantId) {
        try {
          const res = await fetch(`/api/identificateur/rapports?identificateurId=${encodeURIComponent(merchantId)}`)
          if (annule) return
          setRefreshError(res.ok
            ? null
            : 'Impossible de contacter le serveur. Les chiffres affichés viennent de votre appareil.')
        } catch {
          if (!annule) setRefreshError('Pas de connexion. Vérifiez votre réseau.')
        }
      }
      if (!annule) setLoading(false)
    }
    charge()
    return () => { annule = true }
  }, [merchantId])

  // The report is derived from local dossiers, so reconcile verdicts first;
  // otherwise a back-office validation only appears in the notification feed.
  useEffect(() => {
    if (merchantId) syncDossiersFromServer(merchantId)
  }, [merchantId, syncDossiersFromServer])

  const retry = () => {
    setRefreshError(null)
    setLoading(true)
    if (!merchantId) {
      setLoading(false)
      return
    }
    fetch(`/api/identificateur/rapports?identificateurId=${encodeURIComponent(merchantId)}`)
      .then((res) => {
        setRefreshError(res.ok
          ? null
          : 'Impossible de contacter le serveur. Les chiffres affichés viennent de votre appareil.')
      })
      .catch(() => setRefreshError('Pas de connexion. Vérifiez votre réseau.'))
      .finally(() => setLoading(false))
  }

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedTextClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'
  const cardClass = identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'

  const kpis: { label: string; sublabel: string; value: string; icon: typeof CheckCircle2; tone: string; iconBg: string }[] = [
    { label: 'Dossiers soumis', sublabel: moisLabel, value: String(bilan.soumisMois), icon: FileBarChart2, tone: 'text-[#9F8170]', iconBg: 'bg-[#FDF3ED]' },
    { label: 'Validés', sublabel: 'ce mois', value: String(bilan.validesMois), icon: CheckCircle2, tone: 'text-green-600', iconBg: 'bg-green-50' },
    { label: 'Rejetés', sublabel: 'ce mois', value: String(bilan.rejetesMois), icon: XCircle, tone: 'text-red-500', iconBg: 'bg-red-50' },
    { label: "Taux d'acceptation", sublabel: 'ce mois', value: `${bilan.tauxAcceptation}%`, icon: UserRoundCheck, tone: 'text-[#9F8170]', iconBg: 'bg-[#FDF3ED]' },
  ]

  const statutRows = [
    { label: 'Brouillons', count: bilan.parStatut.brouillon, bar: 'bg-stone-400' },
    { label: 'En attente', count: bilan.parStatut.en_attente, bar: 'bg-amber-400' },
    { label: 'Validés', count: bilan.parStatut.valide, bar: 'bg-emerald-500' },
    { label: 'Rejetés', count: bilan.parStatut.rejete, bar: 'bg-red-500' },
  ]
  const maxStatut = Math.max(1, ...statutRows.map((r) => r.count))

  const typeRows = [
    { label: 'Marchands', count: bilan.parType.marchand, icon: Building2 },
    { label: 'Producteurs', count: bilan.parType.producteur, icon: Droplets },
    { label: 'Coopératives', count: bilan.parType.cooperative, icon: UsersRound },
  ]

  const dernier = bilan.dernierSoumis

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
              <h1 className={cn('text-lg font-bold', textClass)}>Statistiques</h1>
            </div>
          </div>
          <span className="rounded-full bg-[#F5F0EB] px-3 py-1 text-[11px] font-semibold text-[#6B584C]">
            {moisLabel} {annee}
          </span>
        </div>
        <p className={cn('mt-1 flex items-center gap-1 text-xs', mutedTextClass)}>
          Rapport d&apos;enrôlement du mois courant
        </p>
      </header>

      <main className="flex flex-col gap-4 px-4 pb-4">
        {/* Bannière d'erreur : quoi + quoi faire, jamais bloquante */}
        {refreshError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-red-700">{refreshError}</p>
              <button type="button" onClick={retry} className="mt-1.5 text-xs font-semibold text-red-700 underline underline-offset-2">
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* Chargement : squelettes (première ouverture sans données locales) */}
        {loading && dossiers.length === 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn('rounded-2xl border p-4', cardClass)}>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-7 w-12" />
                  <Skeleton className="mt-2 h-3 w-14" />
                </div>
              ))}
            </div>
            <div className={cn('rounded-2xl border p-4', cardClass)}>
              <Skeleton className="h-4 w-32" />
              <div className="mt-4 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </>
        )}

        {/* Vide */}
        {!loading && dossiers.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F0EB] text-[#9F8170]">
              <BarChart3 className="h-6 w-6" />
            </span>
            <p className={cn('mt-3 text-sm font-semibold', textClass)}>Aucun dossier enregistré</p>
            <p className={cn('mt-1 text-xs', mutedTextClass)}>
              Les statistiques apparaîtront après vos premiers envois de dossiers.
            </p>
            <Button
              type="button"
              onClick={() => navigate('ident-identification')}
              className="mt-4 rounded-xl bg-[#9F8170] text-sm font-semibold text-white hover:bg-[#8A6E5E]"
            >
              + Nouveau dossier
            </Button>
          </div>
        )}

        {/* Contenu local — offline-first */}
        {dossiers.length > 0 && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3">
              {kpis.map((kpi) => {
                const Icon = kpi.icon
                return (
                  <div key={kpi.label} className={cn('rounded-2xl border p-4', cardClass)}>
                    <div className="flex items-start justify-between">
                      <p className={cn('text-xs font-medium leading-tight', mutedTextClass)}>{kpi.label}</p>
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', kpi.iconBg)}>
                        <Icon className={cn('h-3.5 w-3.5', kpi.tone)} />
                      </span>
                    </div>
                    <p className={cn('mt-2 text-2xl font-bold', textClass)}>{kpi.value}</p>
                    <p className={cn('mt-0.5 text-[11px]', mutedTextClass)}>{kpi.sublabel}</p>
                  </div>
                )
              })}
            </div>

            {/* Bilan par statut (mini barres) */}
            <div className={cn('rounded-2xl border p-4', cardClass)}>
              <h2 className={cn('text-sm font-bold', textClass)}>Bilan par statut</h2>
              <p className={cn('mt-0.5 text-xs', mutedTextClass)}>Tous vos dossiers, toutes périodes</p>
              <div className="mt-4 space-y-3">
                {statutRows.map((row) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={textClass}>{row.label}</span>
                      <span className={cn('font-bold', textClass)}>{row.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E7E0D8]">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', row.bar)}
                        style={{ width: `${Math.round((row.count / maxStatut) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Répartition par type d'acteur */}
            <div className={cn('rounded-2xl border p-4', cardClass)}>
              <h2 className={cn('text-sm font-bold', textClass)}>Répartition par type d&apos;acteur</h2>
              <div className="mt-3 flex flex-col gap-2">
                {typeRows.map((row) => {
                  const Icon = row.icon
                  const pct = dossiers.length > 0 ? Math.round((row.count / dossiers.length) * 100) : 0
                  return (
                    <div key={row.label} className="flex items-center gap-3 rounded-xl bg-[#F5F0EB] px-3 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#9F8170]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-xs font-semibold', textClass)}>{row.label}</p>
                        <p className="text-[10px] text-[#78716C]">{pct} %</p>
                      </div>
                      <span className={cn('text-sm font-bold', textClass)}>{row.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Dernier dossier soumis */}
            <div className={cn('rounded-2xl border p-4', cardClass)}>
              <div className="flex items-center justify-between">
                <h2 className={cn('text-sm font-bold', textClass)}>Dernier dossier soumis</h2>
                <span className="flex items-center gap-1 text-[10px] text-[#78716C]">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  En ligne
                </span>
              </div>
              {dernier ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { setCurrentDraftId(dernier.id); navigate('ident-dossier-detail') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCurrentDraftId(dernier.id); navigate('ident-dossier-detail') } }}
                  className={cn('mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border transition-all duration-150 ease-out active:scale-[0.98]', identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white')}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#9F8170] text-sm font-bold text-white">
                    {`${dernier.firstName.charAt(0)}${dernier.lastName.charAt(0)}`.trim() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-bold', textClass)}>{dernier.firstName} {dernier.lastName}</p>
                    <p className={cn('mt-0.5 truncate text-xs', mutedTextClass)}>
                      {ACTOR_TYPE_LABELS[dernier.actorType] || dernier.actorType} · {dernier.dossierNumber}
                    </p>
                    <p className={cn('mt-0.5 flex items-center gap-1 text-[11px]', mutedTextClass)}>
                      <Clock className="h-3 w-3" />
                      {formatDate(dernier.submittedAt ?? dernier.updatedAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className={cn('mt-3 text-xs', mutedTextClass)}>Aucun dossier soumis pour le moment.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
