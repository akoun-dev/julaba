'use client'

import { useVoiceLanguageStore } from '@/lib/stores/voice-language-store'
import { cn } from '@/lib/utils'
import { voicePerfDebug } from '@/lib/voice/voice-perf'

/**
 * Sélecteur de langue de la voix (Task 32, Baoulé intégré Task 35,
 * réglage par défaut Task 40) — contrôle segmenté, deux variantes :
 *  - 'dark'  : modales vocales (backdrop noir/blur, texte blanc)
 *  - 'light' : écrans de réglages (fond clair, bordures discrètes)
 *
 * Écrit dans voice-language-store via setVoiceLanguage : la langue choisie
 * devient la langue par défaut de TOUTE la voix — dictée (stt-factory lit
 * sttLanguage à chaque session) et narrations Tata (tata-tts lit
 * ttsLanguage).
 *
 * RÈGLE ABSOLUE (MODE-962) : changer de langue ≠ charger les modèles. Le
 * clic ne fait QUE changer l'état — aucun warm-up, aucun chargement NLLB,
 * MMS ni Omnilingual. Les modèles lourds se chargent paresseusement au
 * premier usage réel : micro → ASR (voice-service), traduction → NLLB
 * (nllb-translation), narration locale → MMS (mms-tts). L'ancien
 * préchauffage multilingue (NLLB ~900 Mo + MMS ~114 Mo en RAM au simple
 * clic, Promise.all) gelait le WebView Android — il a été retiré.
 *   Français  → VoiceService natif (sherpa-onnx batch offline)
 *   Baoulé β  → VoiceService natif (Omnilingual ASR CTC 300M offline,
 *               bci_Latn) — erreur explicite si le modèle n'est pas embarqué
 *               dans le build ; β = moteur expérimental, benchmark qualité
 *               recommandé avant usage terrain intensif. Pas de synthèse
 *               vocale baoulé dans la pile : Tata continue de narrer en
 *               français (signalé explicitement, jamais un échec muet).
 *   Dioula β  → MÊME moteur omnilingual (dyu_Latn — 1 600 langues) + NLLB
 *               dyu↔fra (même traducteur) ; narration française tant que
 *               la voix dioula n'existe pas (signalée explicitement).
 */
export function VoiceLanguageSelector({
  className,
  variant = 'dark',
}: {
  className?: string
  variant?: 'dark' | 'light'
}) {
  const sttLanguage = useVoiceLanguageStore((s) => s.sttLanguage)
  const setVoiceLanguage = useVoiceLanguageStore((s) => s.setVoiceLanguage)

  const options = [
    { value: 'fr' as const, label: 'Français' },
    { value: 'bci' as const, label: 'Baoulé', beta: true },
    { value: 'dyu' as const, label: 'Dioula', beta: true },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Langue de la voix"
      className={cn(
        'flex items-center gap-1 rounded-full p-1',
        variant === 'dark' ? 'bg-white/10 backdrop-blur-sm' : 'border bg-muted/60',
        className
      )}
    >
      {options.map((opt) => {
        const active = sttLanguage === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
             onClick={() => {
               // MODE-962 — pur changement d'état : immédiat, aucun modèle
               // lourd. Mesure dev-only pour en prouver la légèreté.
               const startedAt = performance.now()
               setVoiceLanguage(opt.value)
               voicePerfDebug('language_switch_ms', performance.now() - startedAt, {
                 from: sttLanguage,
                 to: opt.value,
               })
             }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              variant === 'dark'
                ? active
                  ? 'bg-white text-[#121319]'
                  : 'text-white/60 hover:text-white'
                : active
                  ? 'border border-border bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
            {opt.beta && <span className="ml-1 opacity-60">β</span>}
          </button>
        )
      })}
    </div>
  )
}
