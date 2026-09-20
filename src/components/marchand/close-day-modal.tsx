'use client'

/**
 * Modale de clôture de journée (§8) — extraite de home-screen.tsx pour être
 * montée GLOBALEMENT (page.tsx, marchand) : « Fermer ma journée » doit
 * fonctionner depuis n'importe quel écran (accueil, Mode Marché) sans
 * duplication de la logique. Pilotée par le flag global `showCloseDay`.
 *
 * MODE-902 : la caisse réellement comptée (`fond`) est transmise à
 * `closeSession(fond)` — la session marché part avec une caisse finale
 * comptée, pas une estimation.
 *
 * UI-MP-017 : la modale utilise la primitive Radix `Dialog` (rôle dialog,
 * aria-modal, piège de focus, Échap, restitution du focus), expose une croix
 * « Fermer » explicitement étiquetée, et sort du vocabulaire non canonique :
 * « Confirmer » → « Compter ma caisse », « Valider » → « Enregistrer le fond
 * de caisse », « OK » → « Fermer » (references/copy.md, verbes canoniques).
 *
 * UI-MP-020a : la clôture met le mot de réveil en pause (comme la modale
 * vocale) — dire « Julaba » pendant le comptage n'ouvre plus la modale voix
 * PAR-DESSUS la clôture (jamais deux overlays empilés).
 */

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogClose, DialogContent, DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle2, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { notify } from '@/lib/notifications/triggers'
import { caisseClosedInput } from '@/lib/notifications/events'
import { formatFCFA } from '@/lib/utils'

export function CloseDayModal() {
  const { showCloseDay, closeCloseDay, soleilMode } = useAppStore()
  const { todaySales, todayExpenses, session, closeSession } = useCaisseStore()
  const [fond, setFond] = useState(0)
  const [step, setStep] = useState<'confirm' | 'fond' | 'done'>('confirm')
  const textClass = soleilMode ? 'text-black' : ''

  // UI-MP-020a — un seul overlay à la fois : pendant la clôture, le mot de
  // réveil ne doit pas ouvrir la modale voix au-dessus (z-[100] > z-50).
  useEffect(() => {
    if (showCloseDay) pauseWakeWord()
    else resumeWakeWord()
    return () => { if (showCloseDay) resumeWakeWord() }
  }, [showCloseDay])

  if (!showCloseDay) return null

  const handleConfirm = () => {
    if (fond <= 0) {
      tataSpeak('Entrez le montant réel de votre caisse.')
      haptic('error')
      return
    }
    closeSession(fond)
    setStep('done')
    tataSpeak(`Journée fermée. Votre caisse finale est de ${formatFCFA(fond)}. Bonne soirée !`)
    haptic('success')
    // Notification in-app : succès sans écart, avertissement si le compté
    // s'éloigne du net attendu (différence détectée lors de la clôture).
    const expected = todaySales - todayExpenses
    void notify(caisseClosedInput({ expected: Math.max(0, expected), counted: fond }))
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) closeCloseDay() }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-full max-w-sm rounded-2xl gap-0 [&>button:last-of-type]:hidden"
      >
        {/* UI-MP-017 — sortie toujours disponible, y compris au lecteur d'écran
            et au clavier (Échap est géré par la primitive). */}
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fermer"
            className="absolute top-3 right-3 min-h-11 min-w-11 text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </Button>
        </DialogClose>
        <Card className="border-0 shadow-none">
          <CardContent className="p-2">
            {step === 'confirm' && (
              <>
                <DialogTitle asChild>
                  <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Fermer la journée ?</h3>
                </DialogTitle>
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-sm"><span className={textClass}>Ventes</span><span className="font-semibold fcfa">{formatFCFA(todaySales)}</span></div>
                  <div className="flex justify-between text-sm"><span className={textClass}>Dépenses</span><span className="font-semibold fcfa">{formatFCFA(todayExpenses)}</span></div>
                  <div className="border-t pt-2 flex justify-between font-bold"><span className={textClass}>Net</span><span className="text-[#C66A2C] fcfa">{formatFCFA(todaySales - todayExpenses)}</span></div>
                </div>
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="flex-1">Annuler</Button>
                  </DialogClose>
                  <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={() => setStep('fond')}>Compter ma caisse</Button>
                </div>
              </>
            )}
            {step === 'fond' && (
              <>
                <DialogTitle asChild>
                  <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Fond de caisse réellement compté</h3>
                </DialogTitle>
                <Input
                  type="number"
                  placeholder="Montant en FCFA"
                  value={fond || ''}
                  onChange={e => setFond(parseInt(e.target.value) || 0)}
                  className={`text-xl text-center h-14 fcfa ${soleilMode ? 'text-2xl' : ''}`}
                  autoFocus
                  aria-label="Montant compté en FCFA"
                />
                <p className="text-xs text-muted-foreground text-center mt-2">Comptez votre argent et entrez le montant</p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setStep('confirm')}>Retour</Button>
                  <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={handleConfirm} disabled={!fond}>Enregistrer le fond de caisse</Button>
                </div>
              </>
            )}
            {step === 'done' && (
              <>
                <div className="text-center">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <DialogTitle asChild>
                    <h3 className={`text-lg font-bold ${textClass}`}>Journée fermée !</h3>
                  </DialogTitle>
                  <p className={`text-sm text-muted-foreground mt-2 ${soleilMode ? 'text-base' : ''}`}>Fond de caisse : {formatFCFA(fond)}</p>
                </div>
                <DialogClose asChild>
                  <Button className="w-full mt-6 bg-[#C66A2C] hover:bg-[#B55D25] text-white">Fermer</Button>
                </DialogClose>
              </>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
