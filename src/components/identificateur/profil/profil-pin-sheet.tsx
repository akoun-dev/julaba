/**
 * MODE-998 (DET-001 tranche 10) — Sheet « Changer mon code PIN » de
 * ident-profil-screen.tsx, déplacée VERBATIM (DOM inchangé, props de
 * mêmes noms).
 */
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PinDots, PinNumpad, IDENT_COLOR } from './profil-parts'
import type { PinStep } from '@/lib/ident-profil-logic'

interface ProfilPinSheetProps {
  showPinSheet: boolean
  resetPinState: () => void
  setShowPinSheet: (open: boolean) => void
  pinStep: PinStep
  pinStepTitle: string
  currentPinLen: number
  pinError: string
  pinProcessing: boolean
  handlePinDigit: (digit: string) => void
  handlePinDelete: () => void
  textClass: string
}

export function ProfilPinSheet({ showPinSheet, resetPinState, setShowPinSheet, pinStep, pinStepTitle, currentPinLen, pinError, pinProcessing, handlePinDigit, handlePinDelete, textClass }: ProfilPinSheetProps) {
  return (
    <>
      {/* ─── 1. Sheet: Changer mon code PIN ───────────────────────────────── */}
      <Sheet open={showPinSheet} onOpenChange={(open) => { if (!open) { resetPinState(); setShowPinSheet(false) } }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-center items-center">
            <SheetTitle className={cn(textClass)}>{pinStepTitle}</SheetTitle>
            <SheetDescription>
              {pinStep === 'current' && 'Saisissez votre code PIN actuel à 4 chiffres'}
              {pinStep === 'new' && 'Choisissez un nouveau code à 4 chiffres'}
              {pinStep === 'confirm' && 'Ressaisissez le nouveau code pour confirmer'}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-4">
              {(['current', 'new', 'confirm'] as const).map((step, idx) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                      pinStep === step
                        ? 'text-white'
                        : idx < ['current', 'new', 'confirm'].indexOf(pinStep)
                          ? 'bg-green-100 text-green-700'
                          : 'bg-muted text-muted-foreground',
                    )}
                    style={pinStep === step ? { backgroundColor: IDENT_COLOR } : undefined}
                  >
                    {idx < ['current', 'new', 'confirm'].indexOf(pinStep) ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  {idx < 2 && (
                    <div className={cn(
                      'w-8 h-0.5',
                      idx < ['current', 'new', 'confirm'].indexOf(pinStep) ? 'bg-green-300' : 'bg-muted',
                    )} />
                  )}
                </div>
              ))}
            </div>

            <PinDots length={currentPinLen} />

            {pinError && (
              <p className="text-red-500 text-xs text-center mb-2 flex items-center justify-center gap-1">
                <Info className="w-3 h-3" /> {pinError}
              </p>
            )}

            {pinProcessing && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="w-5 h-5 border-2 border-[#9F8170] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Enregistrement...</span>
              </div>
            )}

            <PinNumpad onDigit={handlePinDigit} onDelete={handlePinDelete} disabled={pinProcessing} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
