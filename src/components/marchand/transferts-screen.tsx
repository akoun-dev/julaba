'use client'

/**
 * TRANSFERTS inter-marchands (STK-815, §2.9/§28).
 *
 * Écran dédié aux profils semi-grossiste / grossiste : envoyer du stock à
 * un confrère, recevoir ce qu'il envoie, annuler un envoi non reçu.
 * Tout passe par le backend livré en STK-809 (RPC merchant_transfer_out/
 * receive/cancel via /api/marchand/stock/transfers) — le serveur est
 * l'autorité, la marchande ne fait que choisir.
 *
 * Offline (STK-808) : échec réseau → file locale (entités stock-transfer /
 * stock-transfer-action déjà enregistrées dans sync-handlers) + message
 * « en attente de synchronisation » ; refus métier (422/400) → parlé,
 * JAMAIS mis en file (conflit définitif).
 *
 * Pré-vérification locale du stock = pure UX (phrase imposée
 * formatStockRefusal, STK-805) : le refus 422 du serveur reste la vérité.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, Plus, Trash2, Send, X,
} from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/lib/stores/app-store'
import { AppEmpty } from '@/components/shared/app-states'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useStockStore } from '@/lib/stores/stock-store'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { queuePendingSync } from '@/lib/offline-db'
import { fetchJsonWithTimeout } from '@/lib/voice/baoule-engine'
import { formatStockRefusal } from '@/lib/voice/tata-phrases'
import { formatHistoryDate } from '@/lib/stock/quick-actions'
import { selectableUnits } from '@/components/marchand/stock-screen'
import { getBaseUnit, toBaseQuantity, unitLabel, type StockUnitConfig } from '@/lib/stock/units'
import {
  buildTransferPayload,
  buildTransferActionPayload,
  canReceive,
  canCancel,
  formatTransferItemsLabel,
  formatReceptionGap,
  TRANSFER_STATUS_LABELS_FR,
  TRANSFER_STATUS_BADGE_CLASS,
  type TransferDoc,
  type TransferStatus,
} from '@/lib/stock/transfer-ui'

/** Entrée de l'annuaire des destinataires (route transfers/merchants). */
interface DirectoryMerchant {
  id: string
  firstName: string
  lastName: string | null
  phone: string
  categorie: string | null
}

interface CreateLine {
  productId: string
  qty: string
  unitCode: string
}

function partnerName(m: DirectoryMerchant | null | undefined, id: string): string {
  if (m) {
    const full = `${m.firstName} ${m.lastName ?? ''}`.trim()
    if (full) return full
  }
  return `Marchand ${id.slice(0, 8)}`
}

export default function TransfertsScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const merchantCategorie = useAppStore((s) => s.merchantCategorie)
  const goBack = useAppStore((s) => s.goBack)
  // UI-MP-009 — le mode soleil était totalement absent de cet écran de
  // terrain : motif canonique des autres écrans marchands.
  const soleilMode = useAppStore((s) => s.soleilMode)
  const textClass = soleilMode ? 'text-black' : ''
  const products = useStockStore((s) => s.products)
  const fetchProducts = useStockStore((s) => s.fetchProducts)
  const getUnitConfig = useStockStore((s) => s.getUnitConfig)
  const adjustLocalStock = useStockStore((s) => s.adjustLocalStock)

  // Garde de visibilité (§2.9 : briques communes, transferts visibles
  // semi-grossiste/grossiste) — défense en profondeur derrière le CTA.
  const allowed = merchantCategorie === 'semi_grossiste' || merchantCategorie === 'grossiste'

  const [tab, setTab] = useState<'in' | 'out'>('in')
  const [transfers, setTransfers] = useState<TransferDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [directory, setDirectory] = useState<DirectoryMerchant[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  // Modale création
  const [showCreate, setShowCreate] = useState(false)
  const [toMerchantId, setToMerchantId] = useState<string>('')
  const [lines, setLines] = useState<CreateLine[]>([{ productId: '', qty: '', unitCode: '' }])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Modale annulation (raison obligatoire)
  const [cancelling, setCancelling] = useState<TransferDoc | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [submittingCancel, setSubmittingCancel] = useState(false)

  const directoryById = useMemo(() => {
    const map = new Map<string, DirectoryMerchant>()
    for (const m of directory) map.set(m.id, m)
    return map
  }, [directory])

  const loadTransfers = useCallback(async (id: string) => {
    try {
      const res = await fetchJsonWithTimeout(`/api/marchand/stock/transfers?merchantId=${encodeURIComponent(id)}`)
      if (!res.ok) return
      const body = await res.json().catch(() => ({}))
      setTransfers(Array.isArray(body.transfers) ? body.transfers : [])
    } catch { /* réseau mort : la liste reste vide, offline assumé */ }
  }, [])

  const loadDirectory = useCallback(async (id: string) => {
    try {
      const res = await fetchJsonWithTimeout(`/api/marchand/stock/transfers/merchants?merchantId=${encodeURIComponent(id)}`)
      if (!res.ok) return
      const body = await res.json().catch(() => ({}))
      setDirectory(Array.isArray(body.merchants) ? body.merchants : [])
    } catch { /* annuaire indisponible : la saisie manuelle est impossible, on réessaie au prochain montage */ }
  }, [])

  useEffect(() => {
    if (!merchantId || !allowed) return
    if (products.length === 0) void fetchProducts(merchantId)
    void loadDirectory(merchantId)
    void loadTransfers(merchantId).then(() => setLoading(false))
  }, [merchantId, allowed, products.length, fetchProducts, loadDirectory, loadTransfers])

  const incoming = useMemo(() => transfers.filter((t) => t.direction === 'in'), [transfers])
  const outgoing = useMemo(() => transfers.filter((t) => t.direction === 'out'), [transfers])
  const visible = tab === 'in' ? incoming : outgoing

  // ── Envoi d'un transfert ────────────────────────────────────────────────

  const submitCreate = async () => {
    if (!merchantId || submitting) return
    let payload
    try {
      payload = buildTransferPayload({
        merchantId,
        toMerchantId,
        note: note || undefined,
        items: lines.map((l) => {
          const product = products.find((p) => p.id === l.productId)
          if (!product) throw new Error('Choisis un produit dans la liste.')
          const qty = parseFloat(l.qty.replace(',', '.'))
          if (!Number.isFinite(qty) || qty <= 0) {
            throw new Error(`Dis la quantité de ${product.name} à envoyer.`)
          }
          const config = getUnitConfig(l.productId)
          const base = getBaseUnit(config)
          const unit = l.unitCode ? config?.find((u) => u.unitCode === l.unitCode) : undefined
          const chosen = unit ?? base
          if (!chosen) throw new Error(`Choisis l'unité pour ${product.name}.`)
          const quantityBase = toBaseQuantity(qty, chosen)
          if (!Number.isFinite(quantityBase) || quantityBase <= 0) {
            throw new Error(`La quantité de ${product.name} n'est pas valide.`)
          }
          return {
            productId: l.productId,
            quantityBase,
            unitCode: l.unitCode || chosen.unitCode,
          }
        }),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Le transfert n\'est pas complet.'
      tataSpeak(message)
      haptic('error')
      return
    }

    // Pré-vérification locale (pure UX — le serveur reste l'autorité) :
    // chaque ligne est comparée au stock local, en unité de base.
    for (const item of payload.items) {
      const product = products.find((p) => p.id === item.productId)
      if (!product) continue
      const config = getUnitConfig(item.productId)
      const base = getBaseUnit(config)
      if (product.stockQty < item.quantityBase) {
        tataSpeak(formatStockRefusal({
          product: product.name,
          available: product.stockQty,
          requested: item.quantityBase,
          unit: item.unitCode ?? base?.unitCode,
        }))
        haptic('error')
        return
      }
    }

    setSubmitting(true)
    let done = false
    try {
      const res = await fetchJsonWithTimeout('/api/marchand/stock/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        done = true
        const partner = directoryById.get(toMerchantId)
        tataSpeak(`Transfert envoyé à ${partnerName(partner, toMerchantId)}. Je retire le stock de tes produits.`)
        haptic('success')
        for (const item of payload.items) adjustLocalStock(item.productId, -item.quantityBase)
      } else if (res.status === 408 || res.status === 429 || res.status >= 500) {
        // Transitoire (408/429/5xx) → rejouable plus tard, file offline ci-dessous.
        throw new Error(`Erreur ${res.status}`)
      } else {
        // Refus métier définitif (400/403/422…) : rejouer ne peut pas réussir.
        // On le parle SANS le mettre en file (conflit de stock interdit, STK-808).
        const body = await res.json().catch(() => ({}))
        tataSpeak(body.erreur ?? 'Le transfert a été refusé.')
        haptic('error')
        setSubmitting(false)
        return
      }
    } catch { /* réseau mort ou transitoire → file offline */ }

    if (!done) {
      const queued = await queuePendingSync('stock-transfer', payload)
      if (!queued.ok) {
        tataSpeak('Non enregistré. Réessayez.')
        haptic('error')
        setSubmitting(false)
        return
      }
      tataSpeak('Transfert noté, en attente de synchronisation.')
      haptic('medium')
    }

    setSubmitting(false)
    setShowCreate(false)
    setToMerchantId('')
    setLines([{ productId: '', qty: '', unitCode: '' }])
    setNote('')
    void loadTransfers(merchantId)
  }

  // ── Réception (destinataire) ────────────────────────────────────────────

  const receiveTransfer = async (t: TransferDoc) => {
    if (!merchantId || busyId) return
    setBusyId(t.id)
    let done = false
    try {
      const res = await fetchJsonWithTimeout('/api/marchand/stock/transfers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildTransferActionPayload({
          merchantId, transferId: t.id, action: 'recevoir',
        })),
      })
      if (res.ok) {
        done = true
        tataSpeak('Transfert reçu. Les produits sont ajoutés à ton stock.')
        haptic('success')
        // La réception peut créer le produit chez le destinataire
        // (la RPC le résout par nom) : on repart des données serveur.
        void fetchProducts(merchantId)
      } else if (res.status === 408 || res.status === 429 || res.status >= 500) {
        // Transitoire (408/429/5xx) → rejouable plus tard, file offline ci-dessous.
        throw new Error(`Erreur ${res.status}`)
      } else {
        // Refus métier définitif : parlé, JAMAIS mis en file (STK-808).
        const body = await res.json().catch(() => ({}))
        tataSpeak(body.erreur ?? 'Impossible de recevoir ce transfert.')
        haptic('error')
        setBusyId(null)
        void loadTransfers(merchantId)
        return
      }
    } catch { /* réseau mort ou transitoire → file offline */ }

    if (!done) {
      const queued = await queuePendingSync('stock-transfer-action', buildTransferActionPayload({
        merchantId, transferId: t.id, action: 'recevoir',
      }))
      if (!queued.ok) {
        tataSpeak('Non enregistré. Réessayez.')
        haptic('error')
        setBusyId(null)
        return
      }
      tataSpeak('Réception notée, en attente de synchronisation.')
      haptic('medium')
    }

    setBusyId(null)
    void loadTransfers(merchantId)
  }

  // ── Annulation (expéditeur, raison obligatoire) ─────────────────────────

  const confirmCancel = async () => {
    if (!merchantId || !cancelling || submittingCancel) return
    let payload
    try {
      payload = buildTransferActionPayload({
        merchantId, transferId: cancelling.id, action: 'annuler', reason: cancelReason,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Une raison est obligatoire pour annuler un transfert.'
      tataSpeak(message)
      haptic('error')
      return
    }

    setSubmittingCancel(true)
    let done = false
    try {
      const res = await fetchJsonWithTimeout('/api/marchand/stock/transfers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        done = true
        tataSpeak('Transfert annulé. Le stock est revenu dans tes produits.')
        haptic('success')
        for (const item of cancelling.items) adjustLocalStock(item.productId, item.quantityBase)
      } else if (res.status === 408 || res.status === 429 || res.status >= 500) {
        // Transitoire (408/429/5xx) → rejouable plus tard, file offline ci-dessous.
        throw new Error(`Erreur ${res.status}`)
      } else {
        // Refus métier définitif : parlé, JAMAIS mis en file (STK-808).
        const body = await res.json().catch(() => ({}))
        tataSpeak(body.erreur ?? 'Impossible d\'annuler ce transfert.')
        haptic('error')
        setSubmittingCancel(false)
        return
      }
    } catch { /* réseau mort ou transitoire → file offline */ }

    if (!done) {
      const queued = await queuePendingSync('stock-transfer-action', payload)
      if (!queued.ok) {
        tataSpeak('Non enregistré. Réessayez.')
        haptic('error')
        setSubmittingCancel(false)
        return
      }
      tataSpeak('Annulation notée, en attente de synchronisation.')
      haptic('medium')
    }

    setSubmittingCancel(false)
    setCancelling(null)
    setCancelReason('')
    void loadTransfers(merchantId)
  }

  // ── Rendu ───────────────────────────────────────────────────────────────

  if (!allowed) {
    return (
      <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={`text-lg font-bold ${textClass} ${soleilMode ? 'text-xl' : ''}`}>Transferts</h1>
        </div>
        <div className="px-4 mt-10 text-center">
          <p className="text-sm text-muted-foreground">
            Les transferts entre marchands sont réservés aux semi-grossistes et grossistes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={`text-lg font-bold ${textClass} ${soleilMode ? 'text-xl' : ''}`}>Transferts</h1>
          </div>
          <Button
            size="sm"
            className="bg-[#C66A2C] hover:bg-[#B55D25] text-white"
            onClick={() => {
              if (directory.length === 0) {
                tataSpeak('Aucun autre marchand n\'est disponible pour l\'instant. Réessaie plus tard.')
                haptic('error')
                return
              }
              setShowCreate(true)
              haptic('light')
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Envoyer
          </Button>
        </div>

        {/* Onglets À recevoir / Envoyés */}
        <div className="flex gap-2 -mx-4 px-4 pb-1">
          {([
            { key: 'in' as const, label: 'À recevoir', count: incoming.filter((t) => t.status === 'sent').length },
            { key: 'out' as const, label: 'Envoyés', count: 0 },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => { setTab(key); haptic('light') }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-[#C66A2C] text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {label}
              {key === 'in' && count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-white/25 px-1.5 text-[10px] font-bold">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="px-4 mt-4 space-y-3">
        {/* UI-MP-030 — squelettes, pas de texte de chargement (surfaces-marchand.md §Loading). */}
        {loading && (
          <div className="space-y-3">
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
        {!loading && visible.length === 0 && (
          // MODE-1008 : AppEmpty (miroir BoEmptyState), textes inchangés.
          <AppEmpty
            icon={Send}
            title={tab === 'in'
              ? 'Aucun transfert à recevoir. Quand un confrère t\'envoie du stock, il apparaîtra ici.'
              : 'Aucun transfert envoyé. Touche « Envoyer » pour donner du stock à un confrère.'}
            soleilMode={soleilMode}
            className="mt-12 px-6"
          />
        )}
        {!loading && visible.map((t) => {
          const partnerId = t.direction === 'out' ? t.toMerchantId : t.merchantId
          const status = (t.status as TransferStatus) ?? 'sent'
          const canBeReceived = canReceive(t)
          const canBeCancelled = canCancel(t)
          return (
            <Card key={t.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {t.direction === 'in' ? (
                      <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <p className={`text-sm font-semibold truncate ${textClass}`}>
                      {t.direction === 'out' ? 'Vers ' : 'De '}
                      {partnerName(directoryById.get(partnerId), partnerId)}
                    </p>
                  </div>
                  <Badge className={`text-xs ${TRANSFER_STATUS_BADGE_CLASS[status]}`}>
                    {TRANSFER_STATUS_LABELS_FR[status] ?? status}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground mt-1">
                  {formatHistoryDate(t.sentAt ?? t.createdAt ?? new Date().toISOString())}
                </p>

                <ul className="mt-2 space-y-1">
                  {t.items.map((item) => (
                    <li key={item.productId} className="text-xs flex items-center justify-between gap-2">
                      <span>{formatTransferItemsLabel([item])}</span>
                    </li>
                  ))}
                </ul>
                {t.items.map((item) => {
                  const gap = formatReceptionGap(item)
                  return gap ? (
                    <p key={`gap-${item.productId}`} className="text-xs text-amber-700 mt-1">{gap}</p>
                  ) : null
                })}

                {(t.cancelReason || (t.direction === 'out' && t.status === 'cancelled' && t.note)) && (
                  <p className="text-xs italic text-muted-foreground mt-1">
                    Raison : {t.cancelReason ?? t.note}
                  </p>
                )}

                {(canBeReceived || canBeCancelled) && (
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    {canBeReceived && (
                      <Button
                        size="sm"
                        disabled={busyId === t.id}
                        className="flex-1 min-h-11 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        onClick={() => void receiveTransfer(t)}
                      >
                        <ArrowDownLeft className="w-4 h-4 mr-1" />
                        Recevoir
                      </Button>
                    )}
                    {canBeCancelled && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === t.id}
                        className="flex-1 min-h-11 text-red-600 border-red-200 hover:bg-red-50 text-xs"
                        onClick={() => { setCancelling(t); setCancelReason(''); haptic('light') }}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Annuler
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Modale création — bottom-sheet — Sheet Radix (UI-MP-003 : rôle dialog,
          aria-modal, piège de focus, Échap). */}
      {showCreate && (
        <Sheet open onOpenChange={(o) => { if (!o) setShowCreate(false) }}>
          <SheetContent side="bottom" aria-describedby={undefined} className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-0 gap-0 border-0 [&>button:last-of-type]:hidden">
            <CardContent className="p-6 pb-10 max-h-[85dvh] overflow-y-auto">
              <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
              <SheetTitle asChild>
                <h3 className="text-lg font-bold text-center mb-1">Nouveau transfert</h3>
              </SheetTitle>
              <p className="text-xs text-muted-foreground text-center mb-4">
                Envoie du stock à un confrère — il recevra une demande, le stock part quand il accepte.
              </p>

              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Envoyer à</label>
                <Select value={toMerchantId} onValueChange={setToMerchantId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir le marchand" />
                  </SelectTrigger>
                  <SelectContent>
                    {directory.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {partnerName(m, m.id)}{m.phone ? ` — ${m.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="text-xs font-medium text-muted-foreground mb-1 block">Produits à envoyer</label>
              <div className="space-y-3">
                {lines.map((line, idx) => {
                  const config = getUnitConfig(line.productId)
                  const units: StockUnitConfig[] = selectableUnits(config)
                  const base = getBaseUnit(config)
                  const product = products.find((p) => p.id === line.productId)
                  const qty = parseFloat(line.qty.replace(',', '.'))
                  const chosen = line.unitCode ? units.find((u) => u.unitCode === line.unitCode) : base
                  const equivalent = product && chosen && Number.isFinite(qty) && qty > 0
                    ? toBaseQuantity(qty, chosen)
                    : null
                  return (
                    <div key={idx} className="rounded-lg border p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Select
                          value={line.productId}
                          onValueChange={(v) => {
                            const next = [...lines]
                            next[idx] = { ...next[idx], productId: v, unitCode: '' }
                            setLines(next)
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Produit" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {lines.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 text-red-600"
                            aria-label="Retirer ce produit"
                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          inputMode="decimal"
                          placeholder="Quantité"
                          value={line.qty}
                          onChange={(e) => {
                            const next = [...lines]
                            next[idx] = { ...next[idx], qty: e.target.value }
                            setLines(next)
                          }}
                          className="flex-1"
                        />
                        {units.length > 0 && (
                          <Select
                            value={line.unitCode || base?.unitCode || ''}
                            onValueChange={(v) => {
                              const next = [...lines]
                              next[idx] = { ...next[idx], unitCode: v }
                              setLines(next)
                            }}
                          >
                            <SelectTrigger className="w-[120px] shrink-0"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {units.map((u) => (
                                <SelectItem key={u.unitCode} value={u.unitCode}>
                                  {unitLabel(u.unitCode, 1)}{u.conversionToBase !== 1 && u.conversionToBase > 0 ? ` (${u.conversionToBase})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      {equivalent != null && base && (
                        <p className="text-xs text-muted-foreground">
                          = {equivalent.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} {unitLabel(base.unitCode, equivalent)} en stock
                          {product ? ` (dispo : ${product.stockQty.toLocaleString('fr-FR', { maximumFractionDigits: 3 })})` : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {lines.length < products.length && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => { setLines([...lines, { productId: '', qty: '', unitCode: '' }]); haptic('light') }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter un produit
                </Button>
              )}

              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (facultatif)</label>
                <Input
                  placeholder="Ex : pour la boutique du marché"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                />
              </div>

              <div className="flex gap-2 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Annuler</Button>
                <Button
                  className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                  disabled={submitting}
                  onClick={() => void submitCreate()}
                >
                  <Send className="w-4 h-4 mr-1" />
                  Envoyer
                </Button>
              </div>
            </CardContent>
          </SheetContent>
        </Sheet>
      )}

      {/* Modale annulation — raison obligatoire — Dialog Radix (UI-MP-003). */}
      {cancelling && (
        <Dialog open onOpenChange={(o) => { if (!o) setCancelling(null) }}>
          <DialogContent aria-describedby={undefined} className="w-full max-w-sm rounded-2xl p-6 gap-0 [&>button:last-of-type]:hidden">
              <DialogTitle asChild>
                <h3 className="text-lg font-bold text-center mb-1">Annuler le transfert</h3>
              </DialogTitle>
              <p className="text-sm text-muted-foreground text-center mb-4">
                Le stock rentrera dans tes produits. Dis pourquoi tu annules.
              </p>
              <Input
                placeholder="Ex : erreur de produit"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={200}
              />
              <div className="flex gap-2 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setCancelling(null)}>Retour</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={submittingCancel}
                  onClick={() => void confirmCancel()}
                >
                  Confirmer
                </Button>
              </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
