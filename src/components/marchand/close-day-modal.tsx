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
 */

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { notify } from '@/lib/notifications/triggers'
import { caisseClosedInput } from '@/lib/notifications/events'
import { formatFCFA } from '@/lib/utils'

export function CloseDayModal() {
  const { showCloseDay, closeCloseDay, soleilMode } = useAppStore()
  const { todaySales, todayExpenses, session, closeSession } = useCaisseStore()
  const [fond, setFond] = useState(0)
  const [step, setStep] = useState<'confirm' | 'fond' | 'done'>('confirm')
  const textClass = soleilMode ? 'text-black' : ''

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeCloseDay}>
      <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <CardContent className="p-6">
          {step === 'confirm' && (
            <>
              <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Fermer la journée ?</h3>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm"><span className={textClass}>Ventes</span><span className="font-semibold fcfa">{formatFCFA(todaySales)}</span></div>
                <div className="flex justify-between text-sm"><span className={textClass}>Dépenses</span><span className="font-semibold fcfa">{formatFCFA(todayExpenses)}</span></div>
                <div className="border-t pt-2 flex justify-between font-bold"><span className={textClass}>Net</span><span className="text-[#C66A2C] fcfa">{formatFCFA(todaySales - todayExpenses)}</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeCloseDay}>Annuler</Button>
                <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={() => setStep('fond')}>Confirmer</Button>
              </div>
            </>
          )}
          {step === 'fond' && (
            <>
              <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Fond de caisse réellement compté</h3>
              <Input
                type="number"
                placeholder="Montant en FCFA"
                value={fond || ''}
                onChange={e => setFond(parseInt(e.target.value) || 0)}
                className={`text-xl text-center h-14 fcfa ${soleilMode ? 'text-2xl' : ''}`}
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-center mt-2">Comptez votre argent et entrez le montant</p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setStep('confirm')}>Retour</Button>
                <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={handleConfirm} disabled={!fond}>Valider</Button>
              </div>
            </>
          )}
          {step === 'done' && (
            <>
              <div className="text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className={`text-lg font-bold ${textClass}`}>Journée fermée !</h3>
                <p className={`text-sm text-muted-foreground mt-2 ${soleilMode ? 'text-base' : ''}`}>Fond de caisse : {formatFCFA(fond)}</p>
              </div>
              <Button className="w-full mt-6 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={closeCloseDay}>OK</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
