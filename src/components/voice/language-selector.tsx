'use client'

import { useVoiceLanguageStore } from '@/lib/stores/voice-language-store'
import { cn } from '@/lib/utils'

/**
 * Sélecteur de langue de reconnaissance vocale (Task 32) — contrôle
 * segmenté compact, stylé pour les modales vocales sombres (backdrop
 * noir/blur, texte blanc). Écrit dans voice-language-store (persisté) ;
 * stt-factory le lit à chaque création de session :
 *   Français → VoiceService natif (sherpa-onnx batch offline)
 *   Baoulé β → slot Omnilingual ASR — erreur explicite tant que le
 *              benchmark du POC n'est pas validé (mission §18)
 */
export function VoiceLanguageSelector({ className }: { className?: string }) {
  const sttLanguage = useVoiceLanguageStore((s) => s.sttLanguage)
  const setSTTLanguage = useVoiceLanguageStore((s) => s.setSTTLanguage)

  const options = [
    { value: 'fr' as const, label: 'Français' },
    { value: 'bci' as const, label: 'Baoulé', beta: true },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Langue de reconnaissance vocale"
      className={cn('flex items-center gap-1 rounded-full bg-white/10 p-1 backdrop-blur-sm', className)}
    >
      {options.map((opt) => {
        const active = sttLanguage === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSTTLanguage(opt.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              active ? 'bg-white text-[#121319]' : 'text-white/60 hover:text-white'
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
