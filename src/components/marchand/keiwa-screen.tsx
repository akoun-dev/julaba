'use client'

/**
 * Keiwa — the marchand wallet (replaces the "Bientôt disponible" stub).
 *
 * Product decisions (per .agents/skills/product-design):
 * - Primary job: fund the wallet (depot), then retrait/transfert. The
 *   balance card is the anchor; the three actions sit right under it.
 * - Deliberately ONLINE-ONLY: the balance is authoritative server-side and
 *   a local optimistic balance could drift from reality (money). Sales,
 *   expenses and supplier orders queue offline; wallet operations do not —
 *   the screen says so honestly instead of pretending.
 * - Amount entry: quick chips (common cash amounts) + free numeric input,
 *   min 44px touch targets, FCFA integers only.
 * - Voice: Tata announces the result of every operation (haptic + speech),
 *   per the marchand surface standard.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  ArrowUpRight,
  CreditCard,
  WifiOff,
  Wallet,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { AppEmpty, AppError } from '@/components/shared/app-states'
import { formatFCFA } from '@/lib/utils'
import { tataSpeak, haptic, playBeep } from '@/lib/voice/tata-tts'
// UI-MP-022 — appels réseau bornés : le portefeuille mobile est utilisé sur
// réseau dégradé, un serveur injoignable ne doit jamais laisser l'écran en
// « Chargement… » indéfiniment (patron transferts-screen).
import { fetchJsonWithTimeout } from '@/lib/voice/baoule-engine'

interface KeiwaTransaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  recipientName: string | null
  createdAt: string
}

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000]

type OperationType = 'depot' | 'retrait' | 'transfert'

const OPERATION_LABEL: Record<OperationType, string> = {
  depot: 'Dépôt',
  retrait: 'Retrait',
  transfert: 'Transfert',
}

function typeLabel(type: string): string {
  if (type === 'depot') return 'Dépôt'
  if (type === 'retrait') return 'Retrait'
  if (type === 'transfert') return 'Transfert'
  return 'Paiement'
}

export function KeiwaScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const online = useNetworkStatus()

  const [balance, setBalance] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<KeiwaTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [operation, setOperation] = useState<OperationType>('depot')
  const [amount, setAmount] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadWallet = useCallback(async () => {
    if (!merchantId) return
    setLoadError(false)
    try {
      const res = await fetchJsonWithTimeout(`/api/marchand/keiwa?merchantId=${merchantId}`, { method: 'GET' })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setBalance(data.wallet?.balance ?? 0)
      setTransactions(data.transactions ?? [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    loadWallet()
  }, [loadWallet])

  const openDialog = (type: OperationType) => {
    setOperation(type)
    setAmount('')
    setRecipientName('')
    setRecipientPhone('')
    setFormError(null)
    setDialogOpen(true)
  }

  const amountValue = Number.parseInt(amount, 10)
  const amountValid = Number.isFinite(amountValue) && amountValue > 0
  const transfertValid = operation !== 'transfert' || (recipientName.trim().length > 0 && recipientPhone.trim().length > 0)
  // Insufficient balance is a client-side pre-check for immediate feedback;
  // the server enforces it authoritatively inside the SQL function anyway.
  const balanceKnown = balance !== null
  const insufficient = balanceKnown && operation !== 'depot' && amountValid && amountValue > balance
  const canSubmit = amountValid && transfertValid && !insufficient && online && !submitting

  const handleOperation = async () => {
    if (!merchantId || !canSubmit) return
    setSubmitting(true)
    setFormError(null)
    const payload = {
      merchantId,
      type: operation,
      amount: amountValue,
      recipientName: operation === 'transfert' ? recipientName.trim() : undefined,
      recipientPhone: operation === 'transfert' ? recipientPhone.trim() : undefined,
      clientId: `keiwa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
    try {
      const res = await fetchJsonWithTimeout('/api/marchand/keiwa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFormError(data?.erreur ?? 'Transaction refusée. Réessayez.')
        playBeep('error')
        haptic('error')
        return
      }
      const newBalance = data.wallet?.balance
      if (typeof newBalance === 'number') setBalance(newBalance)
      if (data.transaction) {
        setTransactions((list) => [data.transaction, ...list].slice(0, 30))
      }
      setDialogOpen(false)
      playBeep('success')
      haptic('success')
      tataSpeak(
        operation === 'transfert'
          ? `${OPERATION_LABEL[operation]} de ${formatFCFA(amountValue)} vers ${recipientName.trim()} effectué.`
          : `${OPERATION_LABEL[operation]} de ${formatFCFA(amountValue)} effectué.`
      )
    } catch {
      setFormError('Impossible de joindre le serveur. Vérifiez votre connexion.')
      playBeep('error')
      haptic('error')
    } finally {
      setSubmitting(false)
    }
  }

  const labelClass = soleilMode ? 'text-black text-base' : ''
  const mutedClass = soleilMode ? 'text-base' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Keiwa</h1>
            <Badge variant="secondary" className="text-[10px]">Portefeuille</Badge>
          </div>
          {!online && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-0">
              <WifiOff className="w-3 h-3 mr-1" />
              Hors ligne
            </Badge>
          )}
        </div>
      </div>

      {/* Balance card */}
      <div className="px-4 mt-4">
        <Card className="bg-gradient-to-br from-[#C66A2C] to-[#A85520] text-white border-0">
          <CardContent className="p-6">
            {loading ? (
              <div className="space-y-3">
                <div className="h-3 w-24 rounded bg-white/20 animate-pulse" />
                <div className="h-9 w-40 rounded bg-white/20 animate-pulse" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm opacity-90">Solde Keiwa</p>
                  <Wallet className="w-8 h-8 opacity-25" />
                </div>
                <p className={`font-bold fcfa mt-1 ${soleilMode ? 'text-4xl' : 'text-3xl'}`}>
                  {balance === null ? '—' : formatFCFA(balance)}
                </p>
                <p className="text-xs opacity-75 mt-1">Portefeuille Jùlaba</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="px-4 mt-4 grid grid-cols-3 gap-2">
        <Button
          className="h-16 flex-col gap-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
          onClick={() => openDialog('depot')}
          disabled={!online}
        >
          <ArrowDownToLine className={soleilMode ? 'w-6 h-6' : 'w-5 h-5'} />
          <span className="text-xs">Dépôt</span>
        </Button>
        <Button
          variant="outline"
          className="h-16 flex-col gap-1 border-[#C66A2C]/40 text-[#C66A2C] hover:bg-[#FDF3ED] hover:text-[#B55D25]"
          onClick={() => openDialog('retrait')}
          disabled={!online}
        >
          <ArrowUpFromLine className={soleilMode ? 'w-6 h-6' : 'w-5 h-5'} />
          <span className="text-xs">Retrait</span>
        </Button>
        <Button
          variant="outline"
          className="h-16 flex-col gap-1 border-[#C66A2C]/40 text-[#C66A2C] hover:bg-[#FDF3ED] hover:text-[#B55D25]"
          onClick={() => openDialog('transfert')}
          disabled={!online}
        >
          <ArrowUpRight className={soleilMode ? 'w-6 h-6' : 'w-5 h-5'} />
          <span className="text-xs">Transfert</span>
        </Button>
      </div>

      {!online && (
        <div className="px-4 mt-3">
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800/70 dark:bg-amber-950/40">
            <CardContent className="p-3 flex items-start gap-2">
              <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-300 mt-0.5 shrink-0" />
              <p className={`text-xs text-amber-700 dark:text-amber-300 ${soleilMode ? 'text-base text-black' : ''}`}>
                Les opérations Keiwa nécessitent une connexion. Vos ventes et dépenses restent enregistrées hors ligne.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History */}
      <div className="px-4 mt-6">
        <h2 className={`text-sm font-semibold text-muted-foreground mb-2 ${soleilMode ? 'text-base text-black' : ''}`}>
          Dernières transactions
        </h2>
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-muted rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {/* MODE-1008 : AppError (miroir BoErrorBanner) — la bannière du kit
            reprend le chrome rouge (border-red-200/bg-red-50) de l'ancienne
            Card ; handler de rechargement inchangé. */}
        {!loading && loadError && (
          <AppError
            message="Impossible de charger le portefeuille"
            onRetry={loadWallet}
            soleilMode={soleilMode}
          />
        )}
        {/* MODE-1008 : AppEmpty (miroir BoEmptyState), textes inchangés. */}
        {!loading && !loadError && transactions.length === 0 && (
          <AppEmpty
            icon={CreditCard}
            title="Aucune transaction pour le moment"
            description="Faites un dépôt pour commencer"
            soleilMode={soleilMode}
            className="py-10"
          />
        )}
        {!loading && !loadError && transactions.length > 0 && (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const isCredit = tx.type === 'depot'
              return (
                <Card key={tx.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isCredit ? 'bg-green-100' : 'bg-[#FBE4D5]'}`}>
                      {isCredit ? (
                        <ArrowDownToLine className="w-4 h-4 text-green-600" />
                      ) : (
                        <ArrowUpFromLine className="w-4 h-4 text-[#C66A2C]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${labelClass}`}>
                        {typeLabel(tx.type)}
                        {tx.type === 'transfert' && tx.recipientName ? ` — ${tx.recipientName}` : ''}
                      </p>
                      <p className={`text-xs text-muted-foreground ${mutedClass}`}>
                        {new Date(tx.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <p className={`text-sm font-bold shrink-0 fcfa ${isCredit ? 'text-green-600' : 'text-foreground'} ${soleilMode ? 'text-base text-black' : ''}`}>
                      {isCredit ? '+' : '−'}{formatFCFA(tx.amount)}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Operation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={soleilMode ? 'text-black' : ''}>
              {OPERATION_LABEL[operation]}
            </DialogTitle>
            <DialogDescription className={soleilMode ? 'text-black' : ''}>
              {operation === 'depot' && 'Ajoutez de l\u2019argent dans votre portefeuille.'}
              {operation === 'retrait' && 'Retirez de l\u2019argent de votre portefeuille.'}
              {operation === 'transfert' && 'Envoyez de l\u2019argent à un proche ou un fournisseur.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {operation === 'transfert' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="keiwa-recipient-name" className={labelClass}>Nom du destinataire</Label>
                  <Input
                    id="keiwa-recipient-name"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Ex. Ferme Awa"
                    className="min-h-11"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="keiwa-recipient-phone" className={labelClass}>Téléphone</Label>
                  <Input
                    id="keiwa-recipient-phone"
                    type="tel"
                    inputMode="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="07 00 00 00 00"
                    className="min-h-11"
                    autoComplete="off"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="keiwa-amount" className={labelClass}>Montant (FCFA)</Label>
              <Input
                id="keiwa-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="min-h-11 fcfa"
              />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_AMOUNTS.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  className="min-h-11 text-xs"
                  onClick={() => setAmount(String(value))}
                >
                  {value >= 1000 ? `${value / 1000}k` : value}
                </Button>
              ))}
            </div>

            {insufficient && (
              <p className="text-xs text-red-600" role="alert">
                Solde insuffisant. Solde actuel : {balanceKnown ? formatFCFA(balance ?? 0) : ''}
              </p>
            )}
            {formError && (
              <p className="text-xs text-red-600" role="alert">{formError}</p>
            )}

            <Button
              className="w-full min-h-11 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
              onClick={handleOperation}
              disabled={!canSubmit || submitting}
              aria-busy={submitting}
            >
              {/* UI-MP-031 — libellé stable pendant l'action ; l'attente est
                  portée par aria-busy + disabled, pas par un changement de
                  libellé ni un spinner (interdit sur cette surface). */}
              {`${OPERATION_LABEL[operation]} ${amountValid ? formatFCFA(amountValue) : ''}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
