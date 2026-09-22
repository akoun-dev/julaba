'use client'

/**
 * MODE-921 — Accueil de l'espace COOPÉRATIVE (président).
 * MODE-974 (AUDIT-007 G11) — l'habillage (gradient, header, cloche,
 * notifications, erreurs par section) est PORTÉ PAR CoopScreenShell :
 * l'écran ne contient plus que son contenu.
 * MODE-975 (AUDIT-007 Phase 3) — l'accueil devient le DASHBOARD réel
 * promis par l'AUDIT-006 : consommateur unique de l'agrégat MODE-972
 * (GET /api/cooperatives/dashboard) chargé au montage :
 *  - héros « À traiter » : la file d'actions réelle (adhésions, écritures,
 *    besoins — fallback honnête sur les compteurs locaux hors ligne) ;
 *  - sélecteur de période 7/30 j + KPIs avec delta brut vs période
 *    précédente (jamais de % inventé) ;
 *  - courbe de trésorerie validée (recharts, next/dynamic — budget
 *    rendu mobile, garde-fou #5) ;
 *  - top produits du pot commun + journal des mouvements (G14 : les
 *    mouvementsRecents livrés par le MODE-972 sont ENFIN affichés).
 * KPIs réels uniquement — aucune donnée de démonstration : un espace
 * vide affiche des états vides honnêtes.
 */

import dynamic from 'next/dynamic'
import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect } from 'react'
import { Users, Wallet, Package, ClipboardList, ChevronRight, Target, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import type { PeriodeDashboard } from '@/lib/stores/cooperative-store'
import { ScoreRing } from '@/components/ui/score-ring'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatAbsoluteShort } from '@/lib/relative-time'
import { CoopSkeleton, CoopStatCard } from './coop-ui'
import { CoopScreenShell } from './coop-shell'
import { CoopHeroActions, CoopKpiGrid, CoopMouvementsRecents, CoopPeriodeSwitch, CoopTopProduits } from './coop-dashboard'

// Budget rendu mobile (garde-fou #5, AUDIT-007) : le bundle recharts
// n'est téléchargé que si le graphique est réellement rendu.
const CoopTresorerieChart = dynamic(
  () => import('./coop-tresorerie-chart').then((m) => m.CoopTresorerieChart),
  { ssr: false, loading: () => <CoopSkeleton lignes={2} /> }
)

function formaterFCFA(montant: number): string {
  return `${montant.toLocaleString('fr-FR')} FCFA`
}

export function CoopHomeScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)
  const resume = useCooperativeStore((s) => s.resume)
  const loading = useCooperativeStore((s) => s.loading)
  const chargerEspaceCooperateur = useCooperativeStore((s) => s.chargerEspaceCooperateur)
  const scoreJulaba = useCooperativeStore((s) => s.scoreJulaba)
  // MODE-975 — agrégat dashboard (MODE-972)
  const dashboard = useCooperativeStore((s) => s.dashboard)
  const periodeDashboard = useCooperativeStore((s) => s.periodeDashboard)
  const dashboardChargement = useCooperativeStore((s) => s.dashboardChargement)
  const dashboardEnErreur = useCooperativeStore((s) => s.dashboardEnErreur)
  const chargerDashboard = useCooperativeStore((s) => s.chargerDashboard)
  const ecrituresEnAttente = useCooperativeStore((s) => s.ecrituresEnAttente)
  const besoinsEnAttente = useCooperativeStore((s) => s.besoins.filter((b) => b.statut === 'en_attente').length)

  useEffect(() => {
    if (merchantId) {
      void chargerEspaceCooperateur(merchantId)
      void chargerDashboard(merchantId)
    }
  }, [merchantId, chargerEspaceCooperateur, chargerDashboard])

  // MODE-974 — membres et trésorerie sont des onglets (G1) : les accès
  // rapides de l'accueil ne gardent que le couple géré par le hub.
  const accesRapides = [
    { id: 'coop-stock' as const, label: 'Stock commun', description: 'Apports et distributions du pot commun', icon: Package },
    { id: 'coop-besoins' as const, label: 'Achats groupés', description: 'Besoins des membres, consolidation', icon: ClipboardList },
  ]

  const fenetreJours = dashboard?.periode.jours ?? (periodeDashboard === '7j' ? 7 : 30)

  // File d'actions : l'agrégat serveur fait autorité ; hors ligne (dashboard
  // jamais chargé), fallback sur les compteurs locaux réels — jamais de
  // zéros décoratifs.
  const fileActions = dashboard
    ? dashboard.fileActions
    : {
        adhesionsEnAttente: resume?.adhesionsEnAttente ?? 0,
        ecrituresEnAttente,
        besoinsADispatcher: besoinsEnAttente,
      }

  return (
    <CoopScreenShell>
      {/* Héros « À traiter » — la file d'actions réelle (dashboard, fallback local) */}
      <CoopHeroActions
        fileActions={fileActions}
        fenetreJours={fenetreJours}
        onNavigate={(ecran) => navigate(ecran)}
      />

      {/* MODE-975 — Tendance : période + KPIs + courbe (agrégat MODE-972) */}
      <section className="px-4 mt-5" aria-label="Tendance de la période">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-bold text-stone-900">Tendance</h2>
          <CoopPeriodeSwitch
            value={periodeDashboard}
            disabled={dashboardChargement}
            onChange={(periode: PeriodeDashboard) => merchantId && void chargerDashboard(merchantId, periode)}
          />
        </div>

        {dashboard ? (
          <>
            {dashboardEnErreur && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                Synthèse du {formatAbsoluteShort(new Date(dashboard.genereLe).getTime())} — la mise à jour a échoué.
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-amber-800 hover:bg-amber-100"
                  onClick={() => merchantId && void chargerDashboard(merchantId)}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Réessayer
                </Button>
              </div>
            )}
            <div className="mt-3">
              <CoopKpiGrid kpis={dashboard.kpis} />
            </div>
            <div className="mt-3 rounded-2xl bg-white border border-border p-3 shadow-sm">
              <p className="text-xs font-semibold text-stone-700 mb-1">Trésorerie validée par jour</p>
              <CoopTresorerieChart serie={dashboard.series.tresorerie} />
            </div>
          </>
        ) : dashboardChargement ? (
          <div className="mt-3">
            <CoopSkeleton lignes={4} />
          </div>
        ) : (
          <div className="mt-3 rounded-2xl bg-white/70 border border-dashed border-stone-300 p-5 text-center">
            <p className="text-sm text-stone-600 leading-snug">
              {dashboardEnErreur
                ? 'Synthèse indisponible pour le moment — elle s\'affichera dès qu\'une connexion sera disponible.'
                : 'La synthèse de la période s\'affiche ici dès le premier chargement en ligne.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 min-h-[40px]"
              onClick={() => merchantId && void chargerDashboard(merchantId)}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Réessayer
            </Button>
          </div>
        )}
      </section>

      {/* KPIs réels du résumé (toujours utiles : états de la coopérative) */}
      <section className="px-4 mt-5" aria-label="Indicateurs de la coopérative">
        {loading && !resume ? (
          // MODE-974 (G4 / AUDIT-006 #4) — skeletons au lieu du texte brut.
          <CoopSkeleton lignes={4} />
        ) : resume ? (
          <div className="grid grid-cols-2 gap-3">
            <CoopStatCard
              icon={Users}
              label="Membres actifs"
              value={resume.membresActifs}
              hint={resume.membresSuspendus > 0 ? <span className="text-amber-700">{resume.membresSuspendus} suspendu(s)</span> : undefined}
            />
            <CoopStatCard
              icon={Wallet}
              label="Trésorerie validée"
              value={formaterFCFA(resume.soldeTresorerie)}
              hint={<span>Cotisations : {formaterFCFA(resume.totalCotisations)}</span>}
            />
            <Card className="col-span-2">
              <CardContent className="p-4">
                {/* MODE-946 (AUDIT-003 D-2, F-14) — le score JULABA de la
                    COOPÉRATIVE (calculé serveur depuis MODE-932) est enfin
                    affiché au président : même source unique /scores/me que
                    les membres. null = pas encore calculé, jamais inventé. */}
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4" style={{ color: COOP_COLOR }} />
                  <p className="text-xs text-stone-500">Score JULABA de la coopérative</p>
                </div>
                <div className="flex items-center gap-4">
                  <ScoreRing score={scoreJulaba?.score ?? 0} taille={56} epaisseur={5} />
                  <p className="text-xs text-stone-500 leading-snug">
                    {scoreJulaba ? (
                      <>Performance {scoreJulaba.niveau === 'haut' ? 'haute' : scoreJulaba.niveau === 'moyen' ? 'moyenne' : 'basse'} — cotisations, apports au pot commun et ventes des membres font monter ce score.
                      </>
                    ) : (
                      'Score en cours de calcul — il reflète la vie réelle de la coopérative (cotisations, apports, ventes).'
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4" style={{ color: COOP_COLOR }} />
                  <p className="text-xs text-stone-500">Pot commun</p>
                </div>
                {resume.produitsEnStock > 0 ? (
                  <p className="text-sm font-semibold text-stone-900">
                    {resume.produitsEnStock} produit{resume.produitsEnStock > 1 ? 's' : ''} —{' '}
                    {resume.articlesEnStock.toLocaleString('fr-FR')} unités au total
                  </p>
                ) : (
                  <p className="text-sm text-stone-500">
                    Aucun produit dans le stock commun. Les membres apportent depuis l&apos;écran « Ma coopérative ».
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>

      {/* Accès rapides (les écrans non onglets) */}
      <nav className="px-4 mt-5 space-y-3" aria-label="Accès rapides">
        {accesRapides.map((ecran) => (
          <button
            key={ecran.id}
            onClick={() => navigate(ecran.id)}
            className="w-full rounded-2xl bg-white border border-border p-4 text-left shadow-sm hover:border-[#2072AF]/50 transition-colors min-h-[72px] flex items-center gap-3"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${COOP_COLOR}15` }}
            >
              <ecran.icon className="w-5 h-5" style={{ color: COOP_COLOR }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-stone-900">{ecran.label}</p>
              <p className="text-xs text-stone-500 truncate">{ecran.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-stone-400 shrink-0" />
          </button>
        ))}
      </nav>

      {/* MODE-975 (G14) — journal du pot commun : les mouvementsRecents
          livrés par l'agrégat MODE-972 depuis la Task 126 sont ENFIN visibles. */}
      {dashboard && (
        <section className="px-4 mt-5" aria-label="Derniers mouvements du pot commun">
          <h2 className="text-base font-bold text-stone-900">Derniers mouvements du pot commun</h2>
          <div className="mt-2 rounded-2xl bg-white border border-border p-3 shadow-sm">
            <CoopMouvementsRecents mouvements={dashboard.mouvementsRecents} />
          </div>
        </section>
      )}
    </CoopScreenShell>
  )
}
