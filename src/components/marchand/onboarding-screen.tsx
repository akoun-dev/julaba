'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/stores/app-store'
import { tataSpeak, playBeep } from '@/lib/voice/tata-tts'
import {
  Mic,
  ShoppingCart,
  BarChart3,
  WifiOff,
  Sun,
  ChevronRight,
  Sparkles,
} from 'lucide-react'

interface OnboardingStep {
  id: string
  title: string
  subtitle: string
  description: string
  icon: React.ReactNode
  gradient: string
  iconBg: string
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
  },
  {
    id: 'features',
    title: 'Caisse, Stock, Dépenses',
    subtitle: 'Tout dans votre poche',
    description:
      'Gérez vos ventes du jour, suivez votre stock, notez vos dépenses. Un tableau de bord simple pour voir combien vous avez gagné.',
    icon: <ShoppingCart className="w-16 h-16" />,
    gradient: 'from-[#B55D25] to-[#C66A2C]',
    iconBg: 'bg-white/20',
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
  },
]

export function OnboardingScreen() {
  const { completeOnboarding, navigate, voiceEnabled } = useAppStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [isAnimating, setIsAnimating] = useState(false)

  const step = steps[currentStep]
  const totalSteps = steps.length
  const isFirst = currentStep === 0
  const isLast = currentStep === totalSteps - 1

  // Welcome voice greeting
  useEffect(() => {
    if (voiceEnabled) {
      const timer = setTimeout(() => {
        tataSpeak('Bienvenue sur Jùlaba ! Votre assistant marché.')
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const goToStep = (index: number) => {
    if (isAnimating || index < 0 || index >= totalSteps) return
    setDirection(index > currentStep ? 'forward' : 'backward')
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentStep(index)
      setIsAnimating(false)
    }, 200)
  }

  const handleNext = () => {
    if (isLast) {
      playBeep('success')
      completeOnboarding()
      navigate('auth')
      if (voiceEnabled) {
        tataSpeak('C\'est parti ! Créez votre compte maintenant.')
      }
    } else {
      playBeep('start')
      goToStep(currentStep + 1)
      // Voice narration for each step
      if (voiceEnabled) {
        const nextStep = steps[currentStep + 1]
        const narrations: Record<string, string> = {
          voice: 'Tout se fait à la voix. Parlez, et Jùlaba comprend.',
          features: 'Caisse, stock, dépenses. Tout est dans l\'application.',
          stats: 'Vos chiffres du jour, clairement affichés.',
          offline: 'Ça marche même sans internet, au marché.',
          soleil: 'Le mode soleil pour mieux voir en plein jour.',
        }
        if (narrations[nextStep.id]) {
          setTimeout(() => tataSpeak(narrations[nextStep.id]), 400)
        }
      }
    }
  }

  const handleSkip = () => {
    playBeep('stop')
    completeOnboarding()
    navigate('auth')
  }

  const handleDotClick = (index: number) => {
    playBeep('start')
    goToStep(index)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5]">
      {/* Splash / Logo Area */}
      <div className="flex-shrink-0 pt-10 pb-4 flex flex-col items-center">
        {/* App Icon */}
        <div className="relative mb-4">
          <div
            className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg transition-all duration-500`}
          >
            <img
              src="/icon-only.png"
              alt="Jùlaba"
              className="w-20 h-20 object-contain"
            />
          </div>
          {/* Decorative ring */}
          <div
            className={`absolute -inset-2 rounded-[1.6rem] border-2 border-dashed border-[#C66A2C]/20 animate-[spin_20s_linear_infinite]`}
          />
        </div>
        <h1 className="text-2xl font-bold text-[#C66A2C]">Jùlaba</h1>
        <p className="text-sm text-[#9E5222]/60 mt-0.5">v2.0 · Assistant marché</p>
      </div>

      {/* Main Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4">
        <div
          className={`w-full max-w-sm transition-all duration-300 ${
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
              className={`w-28 h-28 rounded-full bg-gradient-to-br ${step.gradient} flex items-center justify-center text-white shadow-xl ${step.iconBg}`}
            >
              {step.icon}
            </div>
          </div>

          {/* Text Content */}
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold text-foreground leading-tight">
              {step.title}
            </h2>
            <p className="text-base font-semibold text-[#C66A2C]">
              {step.subtitle}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex-shrink-0 pb-10 px-6">
        <div className="w-full max-w-sm mx-auto space-y-5">
          {/* Progress Dots */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((_, i) => (
              <button
                key={steps[i].id}
                onClick={() => handleDotClick(i)}
                className={`transition-all duration-300 rounded-full ${
                  i === currentStep
                    ? 'w-8 h-2.5 bg-[#C66A2C]'
                    : 'w-2.5 h-2.5 bg-[#C66A2C]/25 hover:bg-[#C66A2C]/40'
                }`}
                aria-label={`Étape ${i + 1}`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {!isFirst && (
              <Button
                variant="ghost"
                className="text-muted-foreground flex-shrink-0"
                onClick={() => goToStep(currentStep - 1)}
                disabled={isAnimating}
              >
                Retour
              </Button>
            )}

            <Button
              className={`flex-1 h-14 text-base font-semibold shadow-lg transition-all duration-300 ${
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
