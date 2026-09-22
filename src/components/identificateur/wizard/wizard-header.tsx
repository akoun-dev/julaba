"use client"

// MODE-989 (DET-001 tranche 3) — bloc déplacé VERBATIM de
// ident-identification-screen.tsx (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// En-tête du wizard : barre haute (retour / titre / enregistrer) +
// indicateur d'étapes numéroté 1→5.
import React from 'react'
import {
  ArrowLeft,
  Save,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  IDENT_COLOR,
  TOTAL_STEPS,
  STEPS_META,
} from './parts'
import type { Dispatch, SetStateAction } from 'react'

interface WizardHeaderProps {
  currentStep: number
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  identDarkMode: boolean
  soleilMode: boolean
  goBack: () => void
  goPrev: () => void
  handleSaveDraft: () => void
}

export function WizardHeader({ currentStep, setCurrentStep, saveStatus, identDarkMode, soleilMode, goBack, goPrev, handleSaveDraft }: WizardHeaderProps) {
  return (
      <header className={`sticky top-0 z-30 border-b ${identDarkMode ? 'bg-stone-900 border-stone-700' : 'bg-[#FAFAF7] border-[#E7E0D8]'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={currentStep === 1 ? goBack : goPrev}
            className={`p-2 rounded-full transition-colors ${identDarkMode ? 'hover:bg-stone-800' : 'hover:bg-[#F5F0EB]'}`}
            aria-label={currentStep === 1 ? 'Retour' : 'Étape précédente'}
          >
            <ArrowLeft className="size-5" style={{ color: IDENT_COLOR, opacity: 0.7 }} />
          </button>
          <div className="flex min-w-0 flex-col items-center">
            <h1 className={`${soleilMode ? 'text-lg' : 'text-base'} font-bold tracking-tight`} style={{ color: IDENT_COLOR }}>NOUVEAU DOSSIER</h1>
            <span aria-live="polite" className={`text-[10px] ${saveStatus === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
              {saveStatus === 'saving' ? 'Enregistrement...' : saveStatus === 'saved' ? 'Brouillon enregistré' : saveStatus === 'error' ? 'Enregistrement impossible' : ' '}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSaveDraft} className="gap-1 min-h-9" style={{ color: IDENT_COLOR }}>
            <Save className="size-4" /> Enregistrer
          </Button>
        </div>

        {/* Step indicator — cercles numérotés 1→5 reliés par des connecteurs
            qui se remplissent au fil de la progression. */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1">
            {STEPS_META.map((step, i) => {
              const stepNum = i + 1
              const isActive = currentStep === stepNum
              const isDone = currentStep > stepNum
              return (
                <React.Fragment key={stepNum}>
                  {i > 0 && (
                    <div
                      className={`h-0.5 flex-1 rounded-full transition-[background-color] duration-500 ${
                        stepNum <= currentStep ? 'bg-[#9F8170]' : identDarkMode ? 'bg-stone-800' : 'bg-[#E7E0D8]'
                      }`}
                    />
                  )}
                  <button
                    onClick={() => stepNum < currentStep && setCurrentStep(stepNum)}
                    disabled={stepNum > currentStep}
                    aria-label={`Étape ${stepNum} : ${step.label}${isDone ? ' (terminée)' : ''}`}
                    className={`flex shrink-0 items-center justify-center transition-all duration-300 ${
                      stepNum <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed'
                    }`}
                  >
                    <div
                      className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                        isActive
                          ? 'scale-110 text-white shadow-md ring-4 ring-[#9F817025]'
                          : isDone
                          ? 'text-white'
                          : identDarkMode ? 'bg-stone-800 text-stone-400' : 'bg-[#F5F0EB] text-[#78716C]'
                      }`}
                      style={isActive || isDone ? { backgroundColor: IDENT_COLOR } : undefined}
                    >
                      {isDone ? <Check className="size-4" /> : stepNum}
                    </div>
                  </button>
                </React.Fragment>
              )
            })}
          </div>
          {/* Légende de l'étape courante — toujours lisible, même sur petit écran */}
          <p aria-live="polite" className="mt-1.5 text-center text-[11px] font-medium text-muted-foreground">
            <span style={{ color: IDENT_COLOR }} className="font-bold">
              Étape {currentStep} sur {TOTAL_STEPS}
            </span>{' '}
            · {STEPS_META[currentStep - 1].label}
          </p>
        </div>
      </header>
  )
}
