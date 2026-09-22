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
import {
  Dialog, DialogClose, DialogContent, DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle2, Download, Info, ShoppingCart, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore, type CloseSessionResult } from '@/lib/stores/caisse-store'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { notify } from '@/lib/notifications/triggers'
import { caisseClosedInput } from '@/lib/notifications/events'
import {
  buildCaisseReportCsv,
  resumerRapport,
  type RapportSessionServeur,
} from '@/lib/marchand/caisse-report'
import { formatFCFA } from '@/lib/utils'
import { VoiceAmountInput } from '@/components/marchand/voice-amount-input'

export function CloseDayModal() {
  const { showCloseDay, closeCloseDay, soleilMode, merchantId, merchantSexe } = useAppStore()
  const { todaySales, todayExpenses, session, closeSession, cart, getCartTotal } = useCaisseStore()
  const [fond, setFond] = useState('')
  const [step, setStep] = useState<'confirm' | 'panier' | 'fond' | 'done'>('confirm')
  // MODE-984 (AUDIT-008) — l'abandon du panier est une décision EXPLICITE
  // (étape dédiée) : le garde du store refuse la clôture sans elle.
  const [panierAbandonne, setPanierAbandonne] = useState(false)
  const [resultatCloture, setResultatCloture] = useState<CloseSessionResult | null>(null)
  const textClass = soleilMode ? 'text-black' : ''
  const fondMontant = parseInt(fond, 10) || 0
  const closeDayPrompt =
    merchantSexe === 'feminin' ? 'Combien as-tu dans ta caisse maintenant, madame ?'
    : merchantSexe === 'masculin' ? 'Combien as-tu dans ta caisse maintenant, monsieur ?'
    : 'Combien as-tu dans ta caisse maintenant ?'

  // MODE-945 (AUDIT-003 D-1) — rapport de session serveur, lu à la clôture.
  // La réponse est le GRAND LIVRE (faits serveur) ; l'écart avec l'appareil
  // (ventes offline pas encore parties) est affiché et parlé, jamais recalculé.
  const [rapport, setRapport] = useState<RapportSessionServeur | null>(null)
  const [rapportEtat, setRapportEtat] = useState<'chargement' | 'ok' | 'indisponible'>('chargement')

  // MODE-984 — état propre à CHAQUE ouverture (la modale reste montée dans
  // page.tsx : sans reset, une réouverture retombait sur l'étape 'done').
  useEffect(() => {
    if (!showCloseDay) return
    setFond('')
    setStep('confirm')
    setPanierAbandonne(false)
    setResultatCloture(null)
    setRapport(null)
    setRapportEtat('chargement')
  }, [showCloseDay])

  useEffect(() => {
    if (step !== 'done' || resultatCloture?.statut !== 'closed' || !session?.id || !merchantId) return
    let annule = false
    setRapport(null)
    setRapportEtat('chargement')
    const url = `/api/marchand/caisse-report?merchantId=${encodeURIComponent(merchantId)}&sessionId=${encodeURIComponent(session.id)}`
    fetch(url)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: RapportSessionServeur) => {
        if (annule) return
        setRapport(data)
        setRapportEtat('ok')
        const resume = resumerRapport(data, { ventesAppareil: todaySales })
        tataSpeak(resume.phrase)
      })
      .catch(() => {
        if (annule) return
        setRapportEtat('indisponible')
        tataSpeak('Rapport serveur indisponible. Il sera disponible quand la connexion reviendra.')
      })
    return () => { annule = true }
  }, [step, resultatCloture, session?.id, merchantId, todaySales])

  // Export CSV : source = réponse serveur (+ totaux appareil étiquetés).
  // Natif : écriture cache + feuille de partage Capacitor. Web : téléchargement.
  const handleCsv = async () => {
    if (!rapport) return
    const csv = buildCaisseReportCsv(rapport, {
      genereLe: new Date().toLocaleString('fr-FR'),
      caisseComptee: fondMontant > 0 ? fondMontant : undefined,
      ventesAppareil: todaySales,
      depensesAppareil: todayExpenses,
    })
    const nom = `rapport-caisse-${rapport.sessionId.slice(0, 8)}.csv`
    try {
      if (Capacitor.isNativePlatform()) {
        const ecrit = await Filesystem.writeFile({
          path: nom,
          data: csv,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
        await Share.share({ title: nom, url: ecrit.uri, dialogTitle: 'Partager le rapport de caisse' })
      } else {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url2 = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url2
        a.download = nom
        a.click()
        URL.revokeObjectURL(url2)
      }
    } catch {
      tataSpeak('Le rapport n\'a pas pu être partagé sur cet appareil.')
      haptic('error')
    }
  }

  // UI-MP-020a — un seul overlay à la fois : pendant la clôture, le mot de
  // réveil ne doit pas ouvrir la modale voix au-dessus (z-[100] > z-50).
  useEffect(() => {
    if (showCloseDay) pauseWakeWord()
    else resumeWakeWord()
    return () => { if (showCloseDay) resumeWakeWord() }
  }, [showCloseDay])

  if (!showCloseDay) return null

  const handleConfirm = () => {
    if (fondMontant <= 0) {
      tataSpeak('Entrez le montant réel de votre caisse.')
      haptic('error')
      return
    }
    // MODE-984 (AUDIT-008) — le verdict vient du store TYPÉ : le succès
    // (voix, haptique, notification, rapport) n'existe QUE sur 'closed'.
    const resultat = closeSession(fondMontant, { abandonPanierConfirme: panierAbandonne })
    if (resultat.statut === 'refuse_panier') {
      // Défensif : l'étape 'panier' précède normalement le comptage.
      setPanierAbandonne(false)
      setStep('panier')
      haptic('error')
      return
    }
    setResultatCloture(resultat)
    setStep('done')
    if (resultat.statut !== 'closed') return
    tataSpeak(`Journée fermée. Votre caisse finale est de ${formatFCFA(fondMontant)}. Bonne soirée !`)
    haptic('success')
    // Notification in-app : succès sans écart, avertissement si le compté
    // s'éloigne du net attendu (différence détectée lors de la clôture).
    const expected = todaySales - todayExpenses
    void notify(caisseClosedInput({ expected: Math.max(0, expected), counted: fondMontant }))
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
                  {/* MODE-984 (AUDIT-008) — un panier non encaissé passe par la
                      confirmation destructive ('panier') avant le comptage. */}
                  <Button
                    className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                    onClick={() => (cart.length > 0 ? setStep('panier') : setStep('fond'))}
                  >
                    Compter ma caisse
                  </Button>
                </div>
              </>
            )}
            {step === 'panier' && (
              <>
                <DialogTitle asChild>
                  <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Panier non encaissé</h3>
                </DialogTitle>
                <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-center">
                  <ShoppingCart className="w-8 h-8 text-amber-600 mx-auto mb-2" aria-hidden="true" />
                  <p className={textClass}>
                    Votre panier contient <strong>{cart.length}</strong> article{cart.length > 1 ? 's' : ''} pour{' '}
                    <strong className="fcfa">{formatFCFA(getCartTotal())}</strong>.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fermer la journée abandonnera ce panier : il ne sera ni encaissé ni sauvegardé.
                  </p>
                </div>
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="flex-1">Revenir à la vente</Button>
                  </DialogClose>
                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => { setPanierAbandonne(true); setStep('fond') }}
                  >
                    Abandonner et continuer
                  </Button>
                </div>
              </>
            )}
            {step === 'fond' && (
              <>
                <DialogTitle asChild>
                  <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Fond de caisse réellement compté</h3>
                </DialogTitle>
                <VoiceAmountInput
                  value={fond}
                  onChange={setFond}
                  placeholder="Montant en FCFA"
                  soleilMode={soleilMode}
                  autoFocus
                  autoPrompt={closeDayPrompt}
                />
                <p className="text-xs text-muted-foreground text-center mt-2">Comptez votre argent, dites le montant ou saisissez-le au clavier</p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => { setPanierAbandonne(false); setStep('confirm') }}>Retour</Button>
                  <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={handleConfirm} disabled={!fondMontant}>Enregistrer le fond de caisse</Button>
                </div>
              </>
            )}
            {step === 'done' && resultatCloture?.statut !== 'closed' && (
              /* MODE-984 (AUDIT-008) — refus honnête : PAS de succès générique.
                  'already_closed' / 'no_session' : rien n'a été modifié (le
                  panier, s'il en reste un, est intact) ; aucun rapport,
                  aucune notification, aucune parole de succès. */
              <>
                <div className="text-center">
                  <Info className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <DialogTitle asChild>
                    <h3 className={`text-lg font-bold ${textClass}`}>
                      {resultatCloture?.statut === 'no_session' ? 'Aucune caisse ouverte' : 'Journée déjà fermée'}
                    </h3>
                  </DialogTitle>
                  <p className={`text-sm text-muted-foreground mt-2 ${soleilMode ? 'text-base' : ''}`}>
                    {resultatCloture?.statut === 'no_session'
                      ? "Il n'y a pas de session de caisse à fermer. Rien n'a été modifié."
                      : "La journée avait déjà été fermée. Rien n'a été modifié."}
                  </p>
                </div>
                <DialogClose asChild>
                  <Button className="w-full mt-6 bg-[#C66A2C] hover:bg-[#B55D25] text-white">Fermer</Button>
                </DialogClose>
              </>
            )}
            {step === 'done' && resultatCloture?.statut === 'closed' && (
              <>
                <div className="text-center">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <DialogTitle asChild>
                    <h3 className={`text-lg font-bold ${textClass}`}>Journée fermée !</h3>
                  </DialogTitle>
                  <p className={`text-sm text-muted-foreground mt-2 ${soleilMode ? 'text-base' : ''}`}>Fond de caisse : {formatFCFA(fondMontant)}</p>
                </div>
                {/* MODE-945 (D-1) — rapport serveur réconciliable + écart honnête. */}
                {rapportEtat === 'ok' && rapport && (
                  <div className="mt-4 rounded-lg bg-muted p-3 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className={textClass}>Serveur</span>
                      <span className="font-semibold fcfa">{rapport.totaux.ventes} ventes · {formatFCFA(rapport.totaux.totalMontant)}</span>
                    </div>
                    {(() => {
                      const resume = resumerRapport(rapport, { ventesAppareil: todaySales })
                      if (resume.ecartServeurManque > 0) {
                        return (
                          <p className="text-xs text-amber-600">
                            {resume.ecartServeurManque} vente{resume.ecartServeurManque > 1 ? 's' : ''} attendent d&apos;être envoyées au serveur — le rapport les inclura à la synchronisation.
                          </p>
                        )
                      }
                      if (resume.ecartServeurPlus > 0) {
                        return (
                          <p className="text-xs text-amber-600">
                            Le serveur connaît {resume.ecartServeurPlus} vente{resume.ecartServeurPlus > 1 ? 's' : ''} de plus que cet appareil.
                          </p>
                        )
                      }
                      return null
                    })()}
                    <Button variant="outline" size="sm" className="w-full" onClick={handleCsv}>
                      <Download className="w-4 h-4 mr-2" aria-hidden="true" />
                      Télécharger le rapport (CSV)
                    </Button>
                  </div>
                )}
                {rapportEtat === 'chargement' && (
                  <p className="text-xs text-muted-foreground text-center mt-3">Rapport serveur en cours de lecture…</p>
                )}
                {rapportEtat === 'indisponible' && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Rapport serveur indisponible (hors ligne ?) — il sera disponible à la synchronisation.
                  </p>
                )}
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
