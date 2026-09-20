'use client'

/**
 * Bandeau d'aide contextuelle littératie (MODE-930 suite) — espace PRODUCTEUR.
 *
 * Affiché UNIQUEMENT quand le niveau de littératie recueilli À LA VOIX
 * pendant l'onboarding vaut « non » ou « un peu » : rappel discret, à
 * hauteur de lecture, que tout peut se faire au micro — l'utilisateur qui
 * a déclaré savoir lire (« oui ») ne voit RIEN (ne pas narguer les
 * lecteurs), et le niveau inconnu (null — onboarding antérieur à
 * MODE-930) ne déclenche rien non plus.
 *
 * Fermeture locale (session) : le bandeau revient au prochain montage
 * d'écran, ne s'impose pas en continu. Aucune donnée ne quitte l'appareil.
 */

import { useState } from 'react'
import { Mic, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { aideVocaleLitteratie } from '@/lib/litteratie'

export function ProdAideLitteratie() {
  const litteratieNiveau = useAppStore((s) => s.litteratieNiveau)
  const [ferme, setFerme] = useState(false)

  const message = aideVocaleLitteratie(litteratieNiveau)
  if (!message || ferme) return null

  return (
    <div
      className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-[#D2622A]/25 bg-[#D2622A]/10 p-3"
      role="note"
      aria-label="Aide vocale"
    >
      <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#D2622A]">
        <Mic className="h-5 w-5 text-white" aria-hidden="true" />
      </div>
      <p className="flex-1 text-sm leading-snug text-[#8A4517]">{message}</p>
      <button
        type="button"
        onClick={() => setFerme(true)}
        className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[#8A4517]/70 transition-colors hover:bg-[#D2622A]/15 hover:text-[#8A4517]"
        aria-label="Masquer l'aide vocale"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}
