'use client'

/**
 * MODE-975 (AUDIT-007 G6) — Garde de session LÉGÈRE de l'espace
 * coopérative président (l'équivalent frugal de BoGate pour le rôle
 * coopérateur).
 *
 * Ce que le garde fait :
 *  - vérifie l'état LOCAL (rôle coopérateur + identité de session) via la
 *    fonction pure `accesCoopAutorise` (coop-access.ts) ;
 *  - si l'identité est manifestement absente (session perdue, re-claim
 *    Capacitor renvoyant null — cas documenté G6), installe le président
 *    dans un écran vide sans données → écran « Connexion requise » avec
 *    un seul chemin : coop-auth.
 *
 * Ce que le garde NE fait PAS (non bloquant offline — garde-fou #2) :
 *  - AUCUNE revalidation réseau au montage : une session locale valide
 *    laisse passer, même hors ligne — les données persistées restent
 *    consultables et les bannières d'erreur du shell annoncent l'état
 *    réel des chargements ;
 *  - AUCUNE décision d'autorisation métier : requirePresident (serveur)
 *    reste la seule autorité, comme pour le BO.
 */

import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/stores/app-store'
import { COOP_COLOR } from '@/lib/design-tokens'
import { accesCoopAutorise } from '@/lib/cooperatives/coop-access'
import { UserRoundCog } from 'lucide-react'
import type { ReactNode } from 'react'

export function CoopGate({ children }: { children: ReactNode }) {
  const userRole = useAppStore((s) => s.userRole)
  const identite = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)

  if (accesCoopAutorise({ userRole, identite })) {
    return <>{children}</>
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-border p-6 text-center shadow-sm">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: `${COOP_COLOR}15` }}
        >
          <UserRoundCog className="w-7 h-7" style={{ color: COOP_COLOR }} />
        </div>
        <h1 className="mt-4 text-lg font-bold text-stone-900">Connexion requise</h1>
        <p className="mt-2 text-sm text-stone-500 leading-relaxed">
          Votre session de président n&apos;est plus active sur cet appareil.
          Reconnectez-vous pour retrouver la gestion de votre coopérative —
          vos données déjà enregistrées resteront disponibles.
        </p>
        <Button
          onClick={() => navigate('coop-auth')}
          className="mt-5 w-full min-h-[48px] text-white"
          style={{ backgroundColor: COOP_COLOR }}
        >
          Se connecter
        </Button>
      </div>
    </div>
  )
}
