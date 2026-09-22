'use client'

/**
 * MODE-974 (AUDIT-007 G1) — Hub « Gestion » de l'espace coopérative
 * (5ᵉ onglet de la barre basse, méta-écran sur le modèle du hub
 * Administration du BO — backoffice-store.ts:1636-1640) : regroupe les
 * écrans qui ne sont pas des onglets (stock commun, achats groupés) avec
 * leurs compteurs RÉELS. Le drawer/sidebar donnent déjà l'accès direct —
 * le hub est l'entrée « gestion » de la barre basse.
 *
 * Chargement sectionné (MODE-951) : uniquement resume + stock + besoins.
 */

import { useEffect } from 'react'
import { Package, ClipboardList, ChevronRight, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { CoopScreenShell } from './coop-shell'
import { CoopEmptyState } from './coop-ui'
import { COOP_COLOR } from '@/lib/design-tokens'

function formaterFCFA(montant: number): string {
  return `${montant.toLocaleString('fr-FR')} FCFA`
}

export function CoopGestionScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)
  const resume = useCooperativeStore((s) => s.resume)
  const besoinsEnAttente = useCooperativeStore((s) => s.besoins.filter((b) => b.statut === 'en_attente').length)
  const chargerEspaceCooperateur = useCooperativeStore((s) => s.chargerEspaceCooperateur)

  useEffect(() => {
    if (merchantId) void chargerEspaceCooperateur(merchantId, ['resume', 'stock', 'besoins'])
  }, [merchantId, chargerEspaceCooperateur])

  const tuiles = [
    {
      id: 'coop-stock' as const,
      label: 'Stock commun',
      description: 'Apports et distributions du pot commun',
      icon: Package,
      // Compteur réel du résumé serveur (0 si pas encore chargé — jamais inventé).
      detail: resume
        ? resume.produitsEnStock > 0
          ? `${resume.produitsEnStock} produit${resume.produitsEnStock > 1 ? 's' : ''} — ${resume.articlesEnStock.toLocaleString('fr-FR')} unités`
          : 'Pot commun vide'
        : 'Chargement…',
    },
    {
      id: 'coop-besoins' as const,
      label: 'Achats groupés',
      description: 'Besoins des membres, consolidation, dispatch',
      icon: ClipboardList,
      detail:
        besoinsEnAttente > 0
          ? `${besoinsEnAttente} besoin${besoinsEnAttente > 1 ? 's' : ''} en attente`
          : 'Aucun besoin en attente',
      alerte: besoinsEnAttente > 0,
    },
  ]

  return (
    <CoopScreenShell>
      {/* En-tête de section (le header global est porté par le shell) */}
      <header className="px-4 pt-5 pb-1 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Gestion</h2>
          <p className="text-sm text-muted-foreground">Le pot commun et les achats groupés</p>
        </div>
        <button
          onClick={() => merchantId && void chargerEspaceCooperateur(merchantId, ['resume', 'stock', 'besoins'])}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-card border border-border"
          aria-label="Rafraîchir la gestion"
        >
          <RefreshCw className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
      </header>

      <nav className="px-4 mt-4 space-y-3" aria-label="Écrans de gestion">
        {tuiles.map((tuile) => (
          <button
            key={tuile.id}
            onClick={() => navigate(tuile.id)}
            className="w-full rounded-2xl bg-card border border-border p-4 text-left shadow-sm hover:border-[#2072AF]/50 transition-colors min-h-[72px] flex items-center gap-3"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${COOP_COLOR}15` }}
            >
              <tuile.icon className="w-5 h-5" style={{ color: COOP_COLOR }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{tuile.label}</p>
              <p className="text-xs text-muted-foreground truncate">{tuile.detail}</p>
            </div>
            {tuile.alerte && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />}
            <ChevronRight className="w-5 h-5 text-muted-foreground/80 shrink-0" />
          </button>
        ))}
      </nav>

      {/* Repère honnête : le solde validé reste visible depuis le hub */}
      {resume && (
        <p className="px-4 mt-4 text-xs text-muted-foreground">
          Trésorerie validée : {formaterFCFA(resume.soldeTresorerie)} — consultez l&apos;onglet Trésorerie pour le journal.
        </p>
      )}

      {!resume && (
        <CoopEmptyState
          icon={Package}
          title="Espace en cours de chargement"
          description="Les compteurs du pot commun et des achats groupés arrivent du serveur."
          className="mx-4 mt-4"
        />
      )}
    </CoopScreenShell>
  )
}
