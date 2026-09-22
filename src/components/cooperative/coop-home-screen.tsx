'use client'

/**
 * MODE-921 — Accueil de l'espace COOPÉRATIVE (président).
 * MODE-974 (AUDIT-007 G11) — l'habillage (gradient, header, cloche,
 * notifications, erreurs par section) est PORTÉ PAR CoopScreenShell :
 * l'écran ne contient plus que son contenu (bandeau d'action prioritaire,
 * KPIs réels, accès rapides). Membres et Trésorerie étant devenus des
 * onglets de la barre basse (G1), les accès rapides ne gardent que les
 * deux écrans non onglets (stock commun, achats groupés).
 * KPIs réels du résumé serveur — aucune donnée de démonstration : un
 * espace vide affiche des états vides honnêtes.
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect } from 'react'
import { Users, Wallet, Package, ClipboardList, ChevronRight, AlertTriangle, Target } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { ScoreRing } from '@/components/ui/score-ring'
import { Card, CardContent } from '@/components/ui/card'
import { CoopSkeleton } from './coop-ui'
import { CoopScreenShell } from './coop-shell'

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

  useEffect(() => {
    if (merchantId) void chargerEspaceCooperateur(merchantId)
  }, [merchantId, chargerEspaceCooperateur])

  // MODE-974 — membres et trésorerie sont des onglets (G1) : les accès
  // rapides de l'accueil ne gardent que le couple géré par le hub.
  const accesRapides = [
    { id: 'coop-stock' as const, label: 'Stock commun', description: 'Apports et distributions du pot commun', icon: Package },
    { id: 'coop-besoins' as const, label: 'Achats groupés', description: 'Besoins des membres, consolidation', icon: ClipboardList },
  ]

  return (
    <CoopScreenShell>
      {/* Bandeau adhésions en attente — action prioritaire réelle */}
      {resume && resume.adhesionsEnAttente > 0 && (
        <button
          onClick={() => navigate('coop-membres')}
          className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left min-h-[48px] hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 font-medium flex-1">
            {resume.adhesionsEnAttente} demande{resume.adhesionsEnAttente > 1 ? 's' : ''} d&apos;adhésion en attente
          </span>
          <ChevronRight className="w-4 h-4 text-amber-600" />
        </button>
      )}

      {/* KPIs réels */}
      <section className="px-4 mt-4" aria-label="Indicateurs de la coopérative">
        {loading && !resume ? (
          // MODE-974 (G4 / AUDIT-006 #4) — skeletons au lieu du texte brut.
          <CoopSkeleton lignes={4} />
        ) : resume ? (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4" style={{ color: COOP_COLOR }} />
                  <p className="text-xs text-stone-500">Membres actifs</p>
                </div>
                <p className="text-2xl font-bold text-stone-900">{resume.membresActifs}</p>
                {resume.membresSuspendus > 0 && (
                  <p className="text-[11px] text-amber-700">{resume.membresSuspendus} suspendu(s)</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="w-4 h-4" style={{ color: COOP_COLOR }} />
                  <p className="text-xs text-stone-500">Trésorerie validée</p>
                </div>
                <p className="text-lg font-bold text-stone-900">{formaterFCFA(resume.soldeTresorerie)}</p>
                <p className="text-[11px] text-stone-500">
                  Cotisations : {formaterFCFA(resume.totalCotisations)}
                </p>
              </CardContent>
            </Card>
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
    </CoopScreenShell>
  )
}
