'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/lib/stores/app-store'
import { tataSpeakWeb, tataStop, tataIsSpeaking, playBeep, haptic, setTtsEngine, unlockTataAudio } from '@/lib/voice/tata-tts'
import { isPiperSupported, isPiperVoiceReady, downloadPiperVoice } from '@/lib/voice/piper-tts'
import { GemmaDownloadCard } from '@/components/marchand/gemma-download-card'
import {
  Mic,
  ShoppingCart,
  BarChart3,
  WifiOff,
  Sun,
  ChevronRight,
  Sparkles,
  Volume2,
  VolumeX,
  Download,
  Check,
} from 'lucide-react'

interface OnboardingStep {
  id: string
  title: string
  subtitle: string
  description: string
  icon: React.ReactNode
  gradient: string
  iconBg: string
  // Voice narration: detailed explanation read by Tata
  voiceNarration: string
}

const steps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenue sur Jùlaba !',
    subtitle: 'Votre assistant marché intelligent',
    description:
      'Jùlaba vous aide à gérer votre boutique, votre caisse et votre stock — tout ça à la voix, même sans internet.',
    icon: <Sparkles className="w-16 h-16" />,
    gradient: 'from-[#C66A2C] to-[#E8944F]',
    iconBg: 'bg-white/20',
    voiceNarration:
      'Ici c\'est Jùlaba ! L\'application qui va vous faciliter la vie au marché. '
      + 'Avec Jùlaba, vous pouvez gérer votre caisse, suivre votre stock, et noter vos dépenses, '
      + 'tout ça en parlant, sans même toucher votre téléphone. '
      + 'Je vais vous montrer comment ça marche. Glissez pour découvrir.',
  },
  {
    id: 'voice',
    title: 'Tout à la voix',
    subtitle: 'Parlez, Jùlaba comprend',
    description:
      'Dites « Tomates deux mille » et la vente est enregistrée. Plus besoin de taper. Tata Nanti Lou est là pour vous guider.',
    icon: <Mic className="w-16 h-16" />,
    gradient: 'from-[#E8944F] to-[#F0B87A]',
    iconBg: 'bg-white/20',
    voiceNarration:
      'Le plus fort avec Jùlaba, c\'est que tout se fait à la voix ! '
      + 'Imaginez : un client vous achète des tomates à deux mille francs. '
      + 'Vous appuyez sur le bouton micro, et vous dites simplement : « Tomates deux mille ». '
      + 'Et voilà ! La vente est enregistrée toute seule. '
      + 'Vous pouvez aussi dire « Dépense transport cinq cents » pour noter une dépense, '
      + 'ou « Réapprovisionnement oignon trois mille cinq cents » quand vous achetez du stock. '
      + 'Moi, Tata Nanti Lou, je vous guide à chaque étape.',
  },
  {
    id: 'gemma',
    title: 'Assistant hors ligne',
    subtitle: 'Jùlaba comprend encore mieux',
    description: 'Mieux comprendre vos commandes vocales, même sans internet.',
    icon: <Sparkles className="w-16 h-16" />,
    gradient: 'from-[#C66A2C] to-[#9E5222]',
    iconBg: 'bg-white/20',
    voiceNarration: 'Pour utiliser Jùlaba, téléchargeons maintenant l’assistant intelligent. Il comprend vos commandes vocales même sans internet. Le téléchargement fait environ cinq cent cinquante-huit mégaoctets et utilise votre connexion internet.',
  },
  {
    id: 'voix-hd',
    title: 'Voix haute qualité',
    subtitle: 'Une voix encore plus naturelle (en option)',
    description:
      'Vous pouvez télécharger une voix française plus naturelle pour Tata Nanti Lou, qui fonctionne aussi hors ligne. C\'est facultatif — vous pourrez toujours l\'activer plus tard dans Profil.',
    icon: <Download className="w-16 h-16" />,
    gradient: 'from-[#8B5CF6] to-[#A78BFA]',
    iconBg: 'bg-white/20',
    voiceNarration:
      'Une petite astuce avant de continuer. '
      + 'Si vous voulez, vous pouvez télécharger une voix encore plus naturelle pour moi, Tata Nanti Lou. '
      + 'C\'est un téléchargement d\'environ vingt-cinq mégaoctets, à faire une seule fois, '
      + 'et elle fonctionne ensuite même sans internet. '
      + 'Ce n\'est pas obligatoire — vous pouvez continuer sans, et l\'activer plus tard dans votre Profil, section Voix et Langue.',
  },
  {
    id: 'features',
    title: 'Caisse, Stock, Dépenses',
    subtitle: 'Tout dans votre poche',
    description:
      'Gérez vos ventes du jour, suivez votre stock, notez vos dépenses. Un tableau simple pour voir combien vous avez gagné.',
    icon: <ShoppingCart className="w-16 h-16" />,
    gradient: 'from-[#B55D25] to-[#C66A2C]',
    iconBg: 'bg-white/20',
    voiceNarration:
      'Jùlaba, c\'est trois outils en un. '
      + 'D\'abord, la Caisse : vous voyez toutes vos ventes du jour en temps réel, '
      + 'avec le total qui monte au fur et à mesure. '
      + 'Ensuite, le Stock : vous savez exactement ce qu\'il vous reste, '
      + 'et Jùlaba vous alerte quand un produit est bientôt fini. '
      + 'Et enfin, le Cahier de dépenses : vous notez vos achats, votre transport, vos taxes. '
      + 'Plus besoin de cahier en papier ! Tout est rangé dans votre téléphone.',
  },
  {
    id: 'stats',
    title: 'Vos chiffres, clairement',
    subtitle: 'Savoir combien on a gagné',
    description:
      'À la fin de la journée, Jùlaba vous dit combien vous avez vendu, dépensé et gagné. Simple et clair.',
    icon: <BarChart3 className="w-16 h-16" />,
    gradient: 'from-[#9E5222] to-[#B55D25]',
    iconBg: 'bg-white/20',
    voiceNarration:
      'Le soir, quand vous fermez votre boutique, Jùlaba vous donne le bilan complet de votre journée. '
      + 'Combien vous avez vendu en tout, combien vous avez dépensé, '
      + 'et surtout, combien vous avez vraiment gagné. '
      + 'Vous pouvez aussi voir vos ventes passées, pour comparer les bons jours et les mauvais jours. '
      + 'C\'est comme avoir un comptable dans votre poche !',
  },
  {
    id: 'offline',
    title: 'Marche sans internet',
    subtitle: 'Même au marché, ça marche',
    description:
      'Pas de réseau ? Pas de problème. Jùlaba fonctionne partout. Vos données sont synchronisées quand la connexion revient.',
    icon: <WifiOff className="w-16 h-16" />,
    gradient: 'from-[#78716C] to-[#A8A29E]',
    iconBg: 'bg-white/20',
    voiceNarration:
      'On sait que au marché, le réseau internet n\'est pas toujours là. '
      + 'Pas de souci ! Jùlaba fonctionne même sans internet. '
      + 'Vous pouvez enregistrer vos ventes, gérer votre stock, tout faire normalement. '
      + 'Quand la connexion revient, tout se synchronise automatiquement. '
      + 'Votre travail n\'est jamais perdu.',
  },
  {
    id: 'soleil',
    title: 'Mode Soleil',
    subtitle: 'Lisible en plein soleil',
    description:
      'Au marché sous le soleil ? Activez le Mode Soleil : texte plus grand, contraste plus fort. Vous verrez toujours clair.',
    icon: <Sun className="w-16 h-16" />,
    gradient: 'from-[#EAB308] to-[#FACC15]',
    iconBg: 'bg-white/30',
    voiceNarration:
      'Et une dernière chose ! Au marché, sous le soleil, c\'est parfois difficile de lire l\'écran. '
      + 'Jùlaba a un Mode Soleil : le texte devient plus grand, les couleurs plus contrastées. '
      + 'Vous activez un seul bouton, et vous voyez tout clairement, même en pleine lumière. '
      + 'Voilà, vous savez tout ! On est prêtes à commencer ?',
  },
]

export function OnboardingScreen() {
  const { completeOnboarding, navigate, voiceEnabled, toggleVoice } = useAppStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [isAnimating, setIsAnimating] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Optional Piper HD voice download, offered on the 'voix-hd' step.
  const [piperReady, setPiperReady] = useState(false)
  const [piperDownloading, setPiperDownloading] = useState(false)
  const [piperProgress, setPiperProgress] = useState(0)
  useEffect(() => {
    isPiperVoiceReady().then(setPiperReady)
  }, [])

  const handleDownloadPiperVoice = async () => {
    setPiperDownloading(true)
    setPiperProgress(0)
    const ok = await downloadPiperVoice(setPiperProgress)
    setPiperDownloading(false)
    setPiperReady(ok)
    if (ok) {
      setTtsEngine('piper')
      haptic('success')
    } else {
      haptic('error')
    }
  }

  const step = steps[currentStep]
  const totalSteps = steps.length
  const isFirst = currentStep === 0
  const isLast = currentStep === totalSteps - 1
  const isCompactStep = step.id === 'gemma'

  // Autoplay policy : la narration de l'étape 0 part au mount SANS geste
  // utilisateur — Chrome/Safari la bloquent (error not-allowed) et la voix
  // reste muette jusqu'à la première interaction. On mémorise donc si la
  // narration courante a réellement été entendue, et au premier geste on
  // déverrouille l'audio puis on re-narrate l'étape en cours si besoin.
  const narrationHeard = useRef(false)
  const speakStepRef = useRef<(index: number) => void>(() => {})

  useEffect(() => {
    narrationHeard.current = false
    const onFirstPointer = () => {
      unlockTataAudio()
      if (!narrationHeard.current) {
        try { tataStop() } catch { /* safe */ }
        speakStepRef.current(currentStep)
      }
    }
    window.addEventListener('pointerdown', onFirstPointer, { once: true, capture: true })
    return () => window.removeEventListener('pointerdown', onFirstPointer, { capture: true } as EventListenerOptions)
    // currentStep volontairement figé : le listener est once et capture le
    // geste initial seulement (l'étape suivante est déclenchée par ce geste).
  }, [])

  // Onboarding narration uses the browser voice explicitly. It must not wait
  // for Piper's WASM model or fail when a step transition is not a gesture.
  const speakStep = useCallback(
    (index: number) => {
      if (!voiceEnabled) return
      const s = steps[index]
      if (!s) return
      setIsSpeaking(true)
      // Delegate to setTimeout so a blocking speechSynthesis.speak() can't
      // prevent the caller from completing.
      setTimeout(() => {
        tataSpeakWeb(s.voiceNarration, (state) => {
          if (state === 'done' || state === 'error') {
            setIsSpeaking(false)
            // 'error' couvre le blocage autoplay (not-allowed) ; la
            // re-narration du premier geste rattrape alors l'utilisateur.
            if (state === 'done') narrationHeard.current = true
          }
        })
      }, 0)
    },
    [voiceEnabled],
  )
  // Référence toujours à jour pour les handlers non-recréés (listener du
  // premier geste monté une seule fois au mount).
  useEffect(() => {
    speakStepRef.current = speakStep
  }, [speakStep])

  useEffect(() => {
    if (!voiceEnabled) return
    const timer = window.setTimeout(() => speakStep(currentStep), 120)
    return () => window.clearTimeout(timer)
  }, [currentStep, speakStep, voiceEnabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => { tataStop() }
  }, [])

  const goToStep = (index: number) => {
    if (isAnimating || index < 0 || index >= totalSteps) return
    setIsSpeaking(false)
    setDirection(index > currentStep ? 'forward' : 'backward')
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentStep(index)
      setIsAnimating(false)
    }, 250)
  }

  const handleNext = () => {
    if (isLast) {
      playBeep('success')
      haptic('success')
      completeOnboarding()
      navigate('auth')
    } else {
      playBeep('start')
      haptic('light')
      const nextIndex = currentStep + 1
      setDirection('forward')
      setIsAnimating(true)
      setIsSpeaking(false)
      setTimeout(() => {
        setCurrentStep(nextIndex)
        setIsAnimating(false)
      }, 250)
    }
  }

  const handleBack = () => {
    playBeep('stop')
    goToStep(currentStep - 1)
  }

  const handleSkip = () => {
    try { tataStop() } catch { /* safe */ }
    playBeep('stop')
    completeOnboarding()
    navigate('auth')
  }

  const handleDotClick = (index: number) => {
    playBeep('start')
    haptic('light')
    goToStep(index)
  }

  const handleReplay = () => {
    setIsSpeaking(false)
    speakStep(currentStep)
  }

  const handleToggleVoice = () => {
    setIsSpeaking(false)
    toggleVoice()
  }

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] relative">
      {/* Splash / Logo Area */}
      <div className={`flex-shrink-0 flex flex-col items-center ${isCompactStep ? 'pt-4 pb-2' : 'pt-10 pb-4'}`}>
        {/* App Icon */}
        <div className="relative mb-4">
          <div
            className={`${isCompactStep ? 'w-16 h-16 rounded-2xl' : 'w-24 h-24 rounded-3xl'} bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg transition-transform duration-500`}
          >
            <img
              src="/icon-only.png"
              alt="Jùlaba"
              className={`${isCompactStep ? 'w-14 h-14' : 'w-20 h-20'} object-contain`}
            />
          </div>
          {/* Decorative ring */}
          <div
            className={`absolute -inset-2 rounded-[1.6rem] border-2 border-dashed border-[#C66A2C]/20 animate-[spin_20s_linear_infinite]`}
          />
        </div>
        <h1 className="text-2xl font-bold text-[#C66A2C]">Jùlaba</h1>
      </div>

      {/* Main Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4">
        <div
          className={`w-full max-w-sm transition-[opacity,transform] duration-250 ${
            isAnimating
              ? direction === 'forward'
                ? 'opacity-0 translate-x-8'
                : 'opacity-0 -translate-x-8'
              : 'opacity-100 translate-x-0'
          }`}
        >
          {/* Icon Circle */}
          <div className="flex justify-center mb-6">
          <div
            className={`${isCompactStep ? 'w-20 h-20' : 'w-28 h-28'} rounded-full bg-gradient-to-br ${step.gradient} flex items-center justify-center text-white shadow-xl ${step.iconBg}`}
          >
            <span className={isCompactStep ? '[&>svg]:w-12 [&>svg]:h-12' : ''}>{step.icon}</span>
            </div>
          </div>

          {/* Text Content */}
          <div className={`text-center ${isCompactStep ? 'space-y-1' : 'space-y-3'}`}>
            <h2 className={`${isCompactStep ? 'text-xl' : 'text-2xl'} font-bold text-foreground leading-tight`}>
              {step.title}
            </h2>
            <p className="text-base font-semibold text-[#C66A2C]">
              {step.subtitle}
            </p>
            <p className={`${isCompactStep ? 'text-xs' : 'text-sm'} text-muted-foreground leading-relaxed`}>
              {step.description}
            </p>
          </div>

          {/* Optional Piper HD voice download */}
          {step.id === 'voix-hd' && isPiperSupported() && (
            <div className="mt-5 rounded-2xl border border-[#C66A2C]/15 bg-white/60 p-4 space-y-2.5">
              {piperReady ? (
                <p className="text-sm text-center font-medium text-[#16A34A] flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" />
                  Voix haute qualité téléchargée
                </p>
              ) : piperDownloading ? (
                <div className="space-y-1.5">
                  <Progress value={piperProgress} />
                  <p className="text-xs text-muted-foreground text-center">
                    Téléchargement... {piperProgress}%
                  </p>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full border-[#C66A2C]/30 text-[#C66A2C]"
                  onClick={handleDownloadPiperVoice}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger (~25 Mo)
                </Button>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Facultatif — activable plus tard dans Profil › Voix &amp; Langue.
              </p>
            </div>
          )}

          {step.id === 'gemma' && <GemmaDownloadCard onboarding />}

          {/* Speaking Indicator */}
          <div
            className={`mt-5 flex items-center justify-center gap-2 transition-opacity duration-300 ${
              isSpeaking ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-1.5 bg-[#C66A2C]/10 rounded-full px-4 py-2">
              <div className="relative">
                <Volume2 className="w-4 h-4 text-[#C66A2C]" />
                {/* Animated sound waves */}
                <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-[#C66A2C]/40 animate-ping" />
              </div>
              <span className="text-xs font-medium text-[#C66A2C]">
                Tata Nanti Lou parle...
              </span>
              {/* Voice wave bars */}
              <div className="flex items-end gap-0.5 h-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-[#C66A2C] rounded-full voice-wave-bar"
                    style={{ height: '8px' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className={`flex-shrink-0 px-6 ${isCompactStep ? 'pb-3' : 'pb-10'}`}>
        <div className={`w-full max-w-sm mx-auto ${isCompactStep ? 'space-y-3' : 'space-y-5'}`}>
          {/* Progress Dots */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((_, i) => (
              <button
                key={steps[i].id}
                onClick={() => handleDotClick(i)}
                className={`transition-all duration-300 rounded-full p-2 -m-2 ${
                  i === currentStep
                    ? 'w-8 h-2.5 bg-[#C66A2C]'
                    : 'w-2.5 h-2.5 bg-[#C66A2C]/25 hover:bg-[#C66A2C]/40'
                }`}
                aria-label={`Étape ${i + 1}`}
              />
            ))}
          </div>

          {/* Replay & Voice Toggle Row */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleReplay}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#C66A2C] transition-colors"
              aria-label="Réécouter"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Réécouter
            </button>
            <button
              onClick={handleToggleVoice}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#C66A2C] transition-colors"
              aria-label={voiceEnabled ? 'Couper la voix' : 'Activer la voix'}
            >
              {voiceEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              {voiceEnabled ? 'Son activé' : 'Son désactivé'}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {!isFirst && (
              <Button
                variant="ghost"
                className="text-muted-foreground flex-shrink-0"
                onClick={handleBack}
                disabled={isAnimating}>Retour
              </Button>
            )}

            <Button
              className={`flex-1 h-14 text-base font-semibold shadow-lg transition-opacity duration-300 ${
                isLast
                  ? 'bg-[#C66A2C] hover:bg-[#B55D25] text-white'
                  : 'bg-gradient-to-r from-[#C66A2C] to-[#E8944F] hover:from-[#B55D25] hover:to-[#D4863F] text-white'
              }`}
              onClick={handleNext}
              disabled={isAnimating}
            >
              {isLast ? (
                "C'est parti !"
              ) : (
                <span className="flex items-center gap-1">
                  Suivant
                  <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </div>

          {/* Skip Link */}
          {!isLast && (
            <button
              className="w-full text-center text-sm text-muted-foreground hover:text-[#C66A2C] transition-colors py-1"
              onClick={handleSkip}
            >
              Passer l'introduction
            </button>
          )}
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-muted-foreground/50 mt-4">
          {currentStep + 1} sur {totalSteps}
        </p>
      </div>
    </div>
  )
}
