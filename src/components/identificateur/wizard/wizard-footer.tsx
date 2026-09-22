"use client"

// MODE-989 (DET-001 tranche 3) — bloc déplacé VERBATIM de
// ident-identification-screen.tsx (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// Pied du wizard : barre d'actions fixe (progression + CTA) et dialog
// one-shot du code de liaison (MODE-937) — rendus ensemble comme dans
// l'original (fragment : aucun nœud DOM ajouté).
import React from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Upload,
  Loader2,
} from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  type Dossier,
} from '@/lib/stores/identificateur-store'
import {
  IDENT_COLOR,
  TOTAL_STEPS,
} from './parts'
import type { ScreenRoute } from '@/lib/stores/app-store'

interface WizardFooterProps {
  currentStep: number
  submitting: boolean
  identDarkMode: boolean
  soleilMode: boolean
  goNext: () => void
  goPrev: () => void
  handleSaveDraft: () => void
  handleSubmit: () => void
  issuedLiaisonCode: string | null
  setIssuedLiaisonCode: React.Dispatch<React.SetStateAction<string | null>>
  navigate: (screen: ScreenRoute) => void
}

export function WizardFooter({ currentStep, submitting, identDarkMode, soleilMode, goNext, goPrev, handleSaveDraft, handleSubmit, issuedLiaisonCode, setIssuedLiaisonCode, navigate }: WizardFooterProps) {
  const txt = soleilMode ? 'text-base' : 'text-sm'
  return (
    <>
      {/* ======================== BOTTOM ACTION BAR ======================== */}
      {/* pb safe-area : les CTA métier restent au-dessus de l'indicateur home
          iOS (34px) qui recouvre le viewport quand viewport-fit=cover. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {/* Progression fine X/5 au-dessus des CTA */}
        <div className={`h-1 w-full ${identDarkMode ? 'bg-stone-800' : 'bg-[#E7E0D8]'}`} role="presentation">
          <div
            className="h-full transition-[width] duration-500"
            style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%`, backgroundColor: IDENT_COLOR }}
          />
        </div>
        <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex gap-3">
          {currentStep === 1 && (
            <Button
              type="button"
              variant="outline"
              className={`flex-1 gap-2 ${txt}`}
              style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }}
              onClick={handleSaveDraft}
            >
              <Save className="size-4" /> Enregistrer
            </Button>
          )}
          {currentStep > 1 && currentStep < TOTAL_STEPS && (
            <Button
              type="button"
              variant="outline"
              className={`flex-1 gap-2 ${txt}`}
              style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }}
              onClick={goPrev}
            >
              <ArrowLeft className="size-4" /> Précédent
            </Button>
          )}
          {currentStep < TOTAL_STEPS && (
            <Button
              type="button"
              className={`flex-1 gap-2 text-white ${txt}`}
              style={{ backgroundColor: IDENT_COLOR }}
              onClick={goNext}
            >
              Suivant <ArrowRight className="size-4" />
            </Button>
          )}
          {currentStep === TOTAL_STEPS && (
            <Button
              type="button"
              className={`flex-1 gap-2 text-white ${txt}`}
              style={{ backgroundColor: IDENT_COLOR }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
               {submitting ? 'Envoi en cours...' : 'Envoyer le dossier'}
            </Button>
          )}
        </div>
        </div>
      </div>

      {/* MODE-937 (S-04) — code de liaison de l'acteur enrôlé : affichage
          one-shot, à communiquer verbalement (le serveur ne pourra jamais
          le ré-afficher ; la copie est volontairement proposée pour un
          envoi SMS direct). */}
      <AlertDialog open={issuedLiaisonCode !== null} onOpenChange={(v) => { if (!v) { setIssuedLiaisonCode(null); navigate('ident-suivi') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dossier soumis — code de liaison</AlertDialogTitle>
            <AlertDialogDescription>
              Communiquez ce code à l'acteur enrôlé : il le saisira sur son
              téléphone pour lier son appareil à son compte. Usage UNIQUE —
              valable 30 jours, une seule fois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border-2 border-dashed p-4 text-center" style={{ borderColor: `${IDENT_COLOR}80` }}>
            <p className="font-mono text-3xl font-bold tracking-widest">{issuedLiaisonCode}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction
              style={{ backgroundColor: IDENT_COLOR, color: 'white' }}
              onClick={() => { setIssuedLiaisonCode(null); navigate('ident-suivi') }}
            >
              Terminer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
