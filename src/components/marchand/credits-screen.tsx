'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  HandCoins,
  History,
  Plus,
  User,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/stores/app-store'
import {
  useCreditsStore,
  type CreditOp,
  type CreditOpServeur,
  type CreditPartner,
} from '@/lib/market-mode/credits-store'
import {
  creditRecordedPhrase,
  debtTotalPhrase,
  repaymentExceedsDebtPhrase,
  repaymentRecordedPhrase,
} from '@/lib/market-mode/credit-phrases'
import { formatFCFA } from '@/lib/utils'
import { tataSpeak, playBeep, haptic } from '@/lib/voice/tata-tts'
import { AppEmpty } from '@/components/shared/app-states'

// MODE-906 (§21-22/§27-28) — écran « Mes crédits » : total dû, clients avec
// dette, notation d'un paiement, nouveau crédit, historique récent. Tout est
// lu depuis le journal local (credits-store) — offline-first : l'écran ne
// dépend JAMAIS du réseau. Zéro emoji, formulations tata (tutoiement).

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function CreditsScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const { partners, ops, totalOutstandingCfa, clientsWithDebt, recordCredit, recordRepayment } = useCreditsStore()
  const textClass = soleilMode ? 'text-black' : ''

  // MODE-940 (AUDIT-003 F-11) — resynchronisation multi-appareils au
  // montage : le grand livre serveur (soldes + op des autres appareils)
  // est relu et fusionné. Best-effort et silencieux : hors ligne, rien
  // ne change (l'affichage reste local, jamais une erreur bloquante).
  useEffect(() => {
    if (!merchantId) return
    void useCreditsStore.getState().resyncFromServer(merchantId)
  }, [merchantId])

  const [showNewCredit, setShowNewCredit] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newNote, setNewNote] = useState('')
  const [repayFor, setRepayFor] = useState<CreditPartner | null>(null)
  const [repayAmount, setRepayAmount] = useState('')
  const [creditError, setCreditError] = useState<string | null>(null)

  const totalDue = totalOutstandingCfa()
  const debtClients = clientsWithDebt()
  const recentOps = ops.slice(0, 20)
  const isEmpty = Object.keys(partners).length === 0 && ops.length === 0

  // Suggestions de clients connus (recherche insensible casse/accents).
  const suggestions = useMemo(() => {
    const needle = normalize(newName)
    if (needle.length < 2) return []
    return Object.values(partners)
      .filter((p) => normalize(p.name).includes(needle))
      .slice(0, 4)
  }, [partners, newName])

  const openRepayment = (partner: CreditPartner) => {
    haptic('light')
    setCreditError(null)
    setRepayFor(partner)
    setRepayAmount(String(partner.balanceCfa))
  }

  const closeRepayment = () => {
    setRepayFor(null)
    setRepayAmount('')
    setCreditError(null)
  }

  const handleSubmitRepayment = () => {
    if (!repayFor) return
    const amount = parseInt(repayAmount, 10)
    if (!Number.isInteger(amount) || amount <= 0) {
      setCreditError('Saisis un montant en francs entiers.')
      return
    }
    const result = recordRepayment({
      partnerClientId: repayFor.clientId,
      partnerName: repayFor.name,
      amountCfa: amount,
    })
    if (!result.ok) {
      if ('refusal' in result) {
        const phrase = repaymentExceedsDebtPhrase(repayFor.name, result.refusal.balanceCfa, amount)
        setCreditError(phrase)
        playBeep('error')
        haptic('error')
        tataSpeak(phrase)
        return
      }
      setCreditError(result.error)
      return
    }
    // Solde avant = après + remboursement (projection locale).
    const before = result.op.balanceAfterCfa + result.op.amountCfa
    playBeep('success')
    haptic('success')
    tataSpeak(repaymentRecordedPhrase(result.partner.name, before, result.partner.balanceCfa))
    closeRepayment()
  }

  const handleSubmitNewCredit = () => {
    const name = newName.trim()
    const amount = parseInt(newAmount, 10)
    if (name.length < 2) {
      setCreditError('Saisis le nom du client.')
      return
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      setCreditError('Saisis un montant en francs entiers.')
      return
    }
    const result = recordCredit({
      partnerName: name,
      amountCfa: amount,
      note: newNote.trim() || undefined,
    })
    if (!result.ok) {
      setCreditError('error' in result ? result.error : 'Crédit non enregistré.')
      return
    }
    playBeep('success')
    haptic('success')
    tataSpeak(creditRecordedPhrase(result.partner.name, amount, result.partner.balanceCfa))
    setShowNewCredit(false)
    setNewName('')
    setNewAmount('')
    setNewNote('')
    setCreditError(null)
  }

  return (
    <div className="screen-enter min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-40 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C66A2C]">Cahier de crédit</p>
            <h1 className={`truncate text-xl font-bold ${textClass}`}>Mes crédits</h1>
          </div>
          <BookOpen className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" />
        </div>
      </header>

      <main className="space-y-5 px-4 py-5">
        {/* Total dû */}
        <Card className="border-[#E8944F]/30 bg-[#FDF3ED]">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HandCoins className="h-4 w-4 text-[#C66A2C]" />
              <span className="text-xs font-semibold uppercase tracking-wide">Total dû</span>
            </div>
            <p className={`mt-2 text-3xl font-bold text-[#C66A2C] fcfa ${soleilMode ? 'text-4xl' : ''}`}>
              {formatFCFA(totalDue)}
            </p>
            <p className={`mt-1 text-sm text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>
              {debtTotalPhrase(totalDue, debtClients.length)}
            </p>
          </CardContent>
        </Card>

        <Button
          className="h-14 w-full bg-[#C66A2C] text-base text-white hover:bg-[#9E5222]"
          onClick={() => {
            haptic('light')
            setCreditError(null)
            setShowNewCredit(true)
          }}
        >
          <Plus className="mr-2 h-5 w-5" /> Nouveau crédit
        </Button>

        {/* Clients avec dette */}
        <section>
          <h2 className={`mb-3 text-lg font-bold ${textClass}`}>Clients avec dette</h2>
          {debtClients.length === 0 ? (
            // MODE-1008 : AppEmpty (miroir BoEmptyState), textes inchangés,
            // chrome Card conservé (miroir fournisseurs-screen).
            <Card>
              <CardContent className="p-0">
                {isEmpty ? (
                  <AppEmpty
                    title="Aucun crédit pour le moment."
                    description="Vendez à crédit depuis la caisse, ou dites : « Adjoua me doit 5 000 francs »."
                    soleilMode={soleilMode}
                    className="py-6"
                  />
                ) : (
                  <AppEmpty
                    title="Tous tes clients ont payé. C'est une bonne journée."
                    soleilMode={soleilMode}
                    className="py-6"
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {debtClients.map((partner) => (
                <Card key={partner.clientId}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF3ED]">
                        <User className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate font-semibold ${textClass}`}>{partner.name}</p>
                        <p className="text-sm text-[#C66A2C] fcfa">doit {formatFCFA(partner.balanceCfa)}</p>
                      </div>
                    </div>
                    <Button
                      className="min-h-11 shrink-0 bg-[#C66A2C] px-3 text-white hover:bg-[#B55D25]"
                      onClick={() => openRepayment(partner)}
                    >
                      <HandCoins className="mr-1 h-4 w-4" /> Noter un paiement
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Historique récent */}
        {recentOps.length > 0 && (
          <section>
            <h2 className={`mb-3 flex items-center gap-2 text-lg font-bold ${textClass}`}>
              <History className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" /> Historique récent
            </h2>
            <div className="julaba-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
              {recentOps.map((op) => (
                <OpRow key={op.clientId} op={op} textClass={textClass} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Modale : nouveau crédit — Sheet Radix (UI-MP-003 : rôle dialog,
          aria-modal, piège de focus, Échap). */}
      {showNewCredit && (
        <Sheet open onOpenChange={(o) => { if (!o) setShowNewCredit(false) }}>
          <SheetContent side="bottom" aria-describedby={undefined} className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-0 gap-0 border-0 [&>button:last-of-type]:hidden">
            <div className="p-6 pb-10">
              <div className="mb-4 flex items-center justify-between">
                <SheetTitle asChild>
                  <h3 className={`text-lg font-bold ${textClass}`}>Nouveau crédit</h3>
                </SheetTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowNewCredit(false)} aria-label="Fermer">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <label className={`mb-1 block text-sm font-medium ${textClass}`}>Nom du client</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex : Adjoua Koné"
                aria-label="Nom du client"
                autoFocus
              />
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((p) => (
                    <button
                      key={p.clientId}
                      type="button"
                      className="rounded-full border border-[#C66A2C]/40 bg-[#FDF3ED] px-3 py-1 text-xs text-[#C66A2C]"
                      onClick={() => setNewName(p.name)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <label className={`mb-1 mt-4 block text-sm font-medium ${textClass}`}>Montant (FCFA)</label>
              <Input
                type="number"
                inputMode="numeric"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="Ex : 5000"
                aria-label="Montant du crédit en francs"
                min={1}
              />
              <label className={`mb-1 mt-4 block text-sm font-medium ${textClass}`}>Note (facultatif)</label>
              <Input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ex : 3 kilos de riz"
                aria-label="Note du crédit"
                maxLength={200}
              />
              {creditError && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700" role="alert">
                  {creditError}
                </div>
              )}
              <Button
                className="mt-6 h-12 w-full bg-[#C66A2C] text-white hover:bg-[#B55D25]"
                onClick={handleSubmitNewCredit}
                disabled={newName.trim().length < 2 || !newAmount}
              >
                Enregistrer le crédit
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Modale : noter un paiement — Sheet Radix (UI-MP-003). */}
      {repayFor && (
        <Sheet open onOpenChange={(o) => { if (!o) closeRepayment() }}>
          <SheetContent side="bottom" aria-describedby={undefined} className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-0 gap-0 border-0 [&>button:last-of-type]:hidden">
            <div className="p-6 pb-10">
              <div className="mb-4 flex items-center justify-between">
                <SheetTitle asChild>
                  <h3 className={`text-lg font-bold ${textClass}`}>Paiement de {repayFor.name}</h3>
                </SheetTitle>
                <Button variant="ghost" size="icon" onClick={closeRepayment} aria-label="Fermer">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <p className={`mb-4 text-sm text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>
                Dette actuelle : <span className="font-semibold text-[#C66A2C] fcfa">{formatFCFA(repayFor.balanceCfa)}</span>
              </p>
              <label className={`mb-1 block text-sm font-medium ${textClass}`}>Montant reçu (FCFA)</label>
              <Input
                type="number"
                inputMode="numeric"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                aria-label="Montant du paiement en francs"
                min={1}
                autoFocus
              />
              {creditError && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700" role="alert">
                  {creditError}
                </div>
              )}
              <div className="mt-6 flex gap-2">
                <Button variant="outline" className="h-12 flex-1" onClick={closeRepayment}>
                  Annuler
                </Button>
                <Button
                  className="h-12 flex-1 bg-[#C66A2C] text-white hover:bg-[#B55D25]"
                  onClick={handleSubmitRepayment}
                  disabled={!repayAmount || parseInt(repayAmount, 10) <= 0}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

function OpRow({ op, textClass }: { op: CreditOpServeur; textClass: string }) {
  const isCredit = op.kind === 'credit'
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge
              className={
                isCredit
                  ? 'border-0 bg-[#FDF3ED] text-[#C66A2C]'
                  : 'border-0 bg-emerald-50 text-emerald-700'
              }
            >
              {isCredit ? 'Crédit' : 'Paiement'}
            </Badge>
            <p className={`truncate text-sm font-medium ${textClass}`}>{op.partnerName}</p>
          </div>
          {op.note && <p className="truncate text-xs text-muted-foreground">{op.note}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-semibold fcfa ${isCredit ? 'text-[#C66A2C]' : 'text-emerald-700'}`}>
            {isCredit ? '+' : '-'}{formatFCFA(op.amountCfa)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(op.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
