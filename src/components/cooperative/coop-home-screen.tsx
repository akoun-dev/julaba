'use client'

/**
 * MODE-921 — Accueil de l'espace COOPÉRATIVE (président).
 * KPIs réels du résumé serveur (membres actifs, trésorerie validée,
 * cotisations, pot commun) + bandeau d'adhésions en attente + actions
 * vers les 4 écrans métier. Aucune donnée de démonstration : un espace
 * vide affiche des états vides honnêtes.
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect } from 'react'
import { Users, Wallet, Package, ClipboardList, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function formaterFCFA(montant: number): string {
  return `${montant.toLocaleString('fr-FR')} FCFA`
}

export function CoopHomeScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)
  const { cooperative, resume, loading, loadError, chargerEspaceCooperateur } = useCooperativeStore()

  useEffect(() => {
    if (merchantId) void chargerEspaceCooperateur(merchantId)
  }, [merchantId, chargerEspaceCooperateur])

  const ecrans = [
    { id: 'coop-membres' as const, label: 'Membres', description: 'Adhésions, chefs de groupe, cotisations', icon: Users },
    { id: 'coop-tresorerie' as const, label: 'Trésorerie', description: 'Entrées, sorties, validation', icon: Wallet },
    { id: 'coop-stock' as const, label: 'Stock commun', description: 'Apports et distributions du pot commun', icon: Package },
    { id: 'coop-besoins' as const, label: 'Achats groupés', description: 'Besoins des membres, consolidation', icon: ClipboardList },
  ]

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] pb-24">
      {/* En-tête d'espace */}
      <header className="px-4 pt-6 pb-2">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: COOP_COLOR }}>
          Espace coopérative
        </p>
        <h1 className="text-2xl font-bold text-stone-900 mt-0.5">
          {cooperative ? cooperative.nom : 'Ma coopérative'}
        </h1>
        {cooperative?.commune && (
          <p className="text-sm text-stone-500">{cooperative.commune}</p>
        )}
      </header>

      {/* Bandeau adhésions en attente — action prioritaire réelle */}
      {resume && resume.adhesionsEnAttente > 0 && (
        <button
          onClick={() => navigate('coop-membres')}
          className="mx-4 mt-2 flex w-[calc(100%-2rem)] items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left min-h-[48px] hover:bg-amber-100 transition-colors"
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
          <Card>
            <CardContent className="p-6 text-center text-sm text-stone-500">
              Chargement de votre espace…
            </CardContent>
          </Card>
        ) : loadError ? (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <p className="text-sm text-red-700">{loadError}</p>
              <Button
                variant="outline"
                onClick={() => merchantId && void chargerEspaceCooperateur(merchantId)}
                className="min-h-[44px]"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Réessayer
              </Button>
            </CardContent>
          </Card>
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

      {/* Actions */}
      <nav className="px-4 mt-5 space-y-3" aria-label="Écrans de la coopérative">
        {ecrans.map((ecran) => (
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
    </div>
  )
}
