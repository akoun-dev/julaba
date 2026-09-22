'use client'

/**
 * MODE-975 (AUDIT-007 Phase 3) — Widgets du dashboard coopératif,
 * consommateurs de l'agrégat MODE-972 (GET /api/cooperatives/dashboard)
 * via `cooperative-store.dashboard`. Le GRAPHIQUE (recharts) vit dans un
 * fichier séparé (coop-tresorerie-chart.tsx) chargé en next/dynamic par
 * l'écran d'accueil — budget rendu mobile (garde-fou #5 de l'AUDIT-007) :
 * un onglet Accueil sans chart ne paie pas le bundle recharts.
 *
 * Garde-fous appliqués :
 *  - honnêteté des données (#1) : chaque chiffre vient de la réponse
 *    serveur ; le delta est affiché BRUT (valeur − précédent), le %
 *    serait une interprétation et n'est pas inventé ici ;
 *  - jetons COOP (#2072AF) uniquement, pas de hex BO ni de ternaires
 *    isDark (anti-patterns documentés, AUDIT-007 §2) ;
 *  - aucune donnée de démonstration : liste vide → état vide explicite.
 *
 * Les composants sont PURS (props entrantes, callbacks sortants) — le
 * store et la navigation restent dans l'écran d'accueil, la testabilité
 * node du projet n'est pas cassée.
 */

import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Package,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { COOP_COLOR } from '@/lib/design-tokens'
import { formatRelativeTime } from '@/lib/relative-time'
import type { DashboardCoop, PeriodeDashboard } from '@/lib/stores/cooperative-store'
import { CoopEmptyState } from './coop-ui'
import { cn } from '@/lib/utils'

export type FileActionsCoop = DashboardCoop['fileActions']

function formaterFCFA(montant: number): string {
  return `${montant.toLocaleString('fr-FR')} FCFA`
}

// ── Sélecteur de période (7 / 30 jours) ───────────────────────────────────

export function CoopPeriodeSwitch({
  value,
  onChange,
  disabled,
}: {
  value: PeriodeDashboard
  onChange: (periode: PeriodeDashboard) => void
  disabled?: boolean
}) {
  const options: Array<{ key: PeriodeDashboard; label: string }> = [
    { key: '7j', label: '7 jours' },
    { key: '30j', label: '30 jours' },
  ]
  return (
    <div
      role="group"
      aria-label="Période d'analyse"
      className="inline-flex rounded-xl border border-border bg-white p-1 shadow-sm"
    >
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.key)}
            aria-pressed={active}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors min-h-[32px] disabled:opacity-50',
              active ? 'text-white' : 'text-stone-600 hover:bg-stone-900/5'
            )}
            style={active ? { backgroundColor: COOP_COLOR } : undefined}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Héros « À traiter » (file d'actions réelle) ───────────────────────────

const ACTIONS_HEROS: Array<{
  cle: keyof FileActionsCoop
  /** Libellés singulier / pluriel — pas de magie de pluriel par regex :
  * « 3 demandes d'adhésion à traiter » doit rester du français correct. */
  labelUn: string
  labelPlusieurs: string
  ecran: 'coop-membres' | 'coop-tresorerie' | 'coop-besoins'
  icon: LucideIcon
}> = [
  {
    cle: 'adhesionsEnAttente',
    labelUn: 'demande d’adhésion à traiter',
    labelPlusieurs: 'demandes d’adhésion à traiter',
    ecran: 'coop-membres',
    icon: UserPlus,
  },
  { cle: 'ecrituresEnAttente', labelUn: 'écriture à valider', labelPlusieurs: 'écritures à valider', ecran: 'coop-tresorerie', icon: Wallet },
  { cle: 'besoinsADispatcher', labelUn: 'besoin à dispatcher', labelPlusieurs: 'besoins à dispatcher', ecran: 'coop-besoins', icon: ClipboardList },
]

export function CoopHeroActions({
  fileActions,
  onNavigate,
  fenetreJours,
}: {
  fileActions: FileActionsCoop
  onNavigate: (ecran: 'coop-membres' | 'coop-tresorerie' | 'coop-besoins') => void
  /** Fenêtre du sélecteur courant (7 ou 30) — les compteurs du serveur
  * couvrent CETTE fenêtre : le libellé doit le dire honnêtement. */
  fenetreJours: number
}) {
  const aTraiter = ACTIONS_HEROS.map((action) => ({ ...action, count: fileActions[action.cle] }))
  const total = aTraiter.reduce((somme, action) => somme + action.count, 0)

  if (total === 0) {
    return (
      <div
        className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3"
        role="status"
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        <p className="text-sm text-emerald-800 font-medium">
          Tout est traité — aucune action en attente sur les {fenetreJours} derniers jours.
        </p>
      </div>
    )
  }

  return (
    <section className="px-4 mt-3" aria-label="Actions en attente">
      <div className="rounded-2xl bg-white border border-border p-3 shadow-sm space-y-2">
        {aTraiter
          .filter((action) => action.count > 0)
          .map((action) => (
            <button
              key={action.cle}
              onClick={() => onNavigate(action.ecran)}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left min-h-[48px] hover:bg-stone-900/5 transition-colors"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${COOP_COLOR}15` }}
              >
                <action.icon className="w-4.5 h-4.5" style={{ color: COOP_COLOR }} />
              </div>
              <p className="flex-1 text-sm text-stone-800 leading-snug">
                <span className="font-bold">{action.count}</span>{' '}
                {action.count > 1 ? action.labelPlusieurs : action.labelUn}
              </p>
              <ArrowRight className="w-4 h-4 shrink-0" style={{ color: COOP_COLOR }} />
            </button>
          ))}
      </div>
    </section>
  )
}

// ── KPIs avec delta brut vs période précédente ────────────────────────────

function DeltaBrut({ delta, uniteFcfa }: { delta: number; uniteFcfa?: boolean }) {
  const abs = Math.abs(delta)
  const valeur = uniteFcfa ? formaterFCFA(abs) : String(abs)
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700">
        <ArrowUpRight className="w-3 h-3" />+{valeur} vs période précédente
      </span>
    )
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-red-700">
        <ArrowDownRight className="w-3 h-3" />−{valeur} vs période précédente
      </span>
    )
  }
  return <span className="text-[11px] text-stone-500">Stable vs période précédente</span>
}

export function CoopKpiGrid({ kpis }: { kpis: DashboardCoop['kpis'] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-2xl bg-white border border-border p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus className="w-4 h-4" style={{ color: COOP_COLOR }} />
          <p className="text-xs text-stone-500">Nouveaux membres</p>
        </div>
        <p className="text-2xl font-bold text-stone-900">{kpis.membresGagnes.valeur}</p>
        <DeltaBrut delta={kpis.membresGagnes.delta} />
      </div>
      <div className="rounded-2xl bg-white border border-border p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4" style={{ color: COOP_COLOR }} />
          <p className="text-xs text-stone-500">Trésorerie nette</p>
        </div>
        <p className="text-lg font-bold text-stone-900">{formaterFCFA(kpis.tresorerieNette.valeur)}</p>
        <DeltaBrut delta={kpis.tresorerieNette.delta} uniteFcfa />
      </div>
      <div className="rounded-2xl bg-white border border-border p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Package className="w-4 h-4" style={{ color: COOP_COLOR }} />
          <p className="text-xs text-stone-500">Cotisations</p>
        </div>
        <p className="text-lg font-bold text-stone-900">{formaterFCFA(kpis.cotisations.valeur)}</p>
        <DeltaBrut delta={kpis.cotisations.delta} uniteFcfa />
      </div>
    </div>
  )
}

// ── Top produits du pot commun (barres honnêtes, sans recharts) ───────────

export function CoopTopProduits({ produits }: { produits: DashboardCoop['topProduits'] }) {
  if (produits.length === 0) {
    return (
      <CoopEmptyState
        icon={Package}
        title="Pot commun vide"
        description="Les apports des membres apparaîtront ici, du plus fourni au plus récent."
        className="bg-white/80"
      />
    )
  }
  const max = Math.max(...produits.map((p) => p.quantite), 1)
  return (
    <ul className="space-y-2.5">
      {produits.map((produit) => (
        <li key={`${produit.produit}-${produit.unite}`}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-stone-800 truncate">
              {produit.produit}
              {produit.categorie && <span className="ml-1.5 text-[11px] text-stone-400">{produit.categorie}</span>}
            </p>
            <p className="text-sm font-semibold text-stone-900 shrink-0">
              {produit.quantite.toLocaleString('fr-FR')} {produit.unite}
            </p>
          </div>
          <div className="mt-1 h-2 rounded-full bg-stone-100 overflow-hidden" aria-hidden="true">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(Math.round((produit.quantite / max) * 100), 3)}%`,
                backgroundColor: COOP_COLOR,
                opacity: 0.85,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Journal du pot commun (10 derniers mouvements — G14) ──────────────────

export function CoopMouvementsRecents({ mouvements, now }: { mouvements: DashboardCoop['mouvementsRecents']; now?: number }) {
  if (mouvements.length === 0) {
    return (
      <CoopEmptyState
        icon={Package}
        title="Aucun mouvement"
        description="Apports et distributions du pot commun s'afficheront ici dès le premier mouvement."
        className="bg-white/80"
      />
    )
  }
  return (
    <ul className="divide-y divide-stone-100">
      {mouvements.map((mouvement) => {
        const apport = mouvement.type !== 'distribution'
        return (
          <li key={mouvement.id} className="flex items-center gap-3 py-2.5">
            <span
              className={cn(
                'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-xs font-bold shrink-0',
                apport ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              )}
            >
              {apport ? '+' : '−'}
              {mouvement.quantite.toLocaleString('fr-FR')} {mouvement.unite}
            </span>
            <p className="flex-1 text-sm text-stone-800 truncate">{mouvement.produit}</p>
            <p className="text-[11px] text-stone-400 shrink-0">
              {formatRelativeTime(new Date(mouvement.date).getTime(), now)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
