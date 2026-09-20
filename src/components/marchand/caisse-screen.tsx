'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
// UI-MP-003 — les modales cœur de métier (prix, panier, paiement, succès)
// passent par les primitives Radix : rôle dialog, aria-modal, piège de
// focus, Échap et restitution du focus sont fournis par la primitive.
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Search, Plus, Minus, Trash2, ShoppingBag,
  Mic, ArrowLeft, Check, CheckCircle2, X,
  Banknote, Calculator, Star, Grid3X3, List
} from 'lucide-react'
import { ProductIcon } from '@/lib/product-icons'
import { VoiceAmountInput } from '@/components/marchand/voice-amount-input'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore, type CartItem } from '@/lib/stores/caisse-store'
import { useStockStore, type Product } from '@/lib/stores/stock-store'
import { useCreditsStore } from '@/lib/market-mode/credits-store'
import { useSellingPointsStore } from '@/lib/market-mode/selling-points-store'
import { creditRecordedPhrase } from '@/lib/market-mode/credit-phrases'
import { formatFCFA } from '@/lib/utils'
import { formatStockRefusal, formatMontantParle } from '@/lib/voice/tata-phrases'
import { tataSpeak, playBeep, haptic } from '@/lib/voice/tata-tts'
import { queuePendingSync } from '@/lib/offline-db'
import { notify } from '@/lib/notifications/triggers'
import { saleCreatedInput, saleRejectedInput, caisseClosedInput } from '@/lib/notifications/events'
import { cn } from '@/lib/utils'

const BILLS = [500, 1000, 2000, 5000, 10000]

/** MODE-906 (§9/§21) — modes d'encaissement de la caisse ; 'credit' ouvre
 * la vente à crédit (nom du client requis, montant reçu masqué). */
type PaymentMode = 'especes' | 'mobile_money' | 'credit' | 'autre'

const PAYMENT_MODES: Array<{ id: PaymentMode; label: string }> = [
  { id: 'especes', label: 'Espèces' },
  { id: 'mobile_money', label: 'Mobile Money' },
  { id: 'credit', label: 'Crédit' },
  { id: 'autre', label: 'Autre' },
]

export function CaisseScreen() {
  const { soleilMode, openVoiceModal, navigate, goBack, merchantId, merchantSexe } = useAppStore()
  const openCaissePrompt =
    merchantSexe === 'feminin' ? 'Tu commences avec combien, ma chérie ?'
    : merchantSexe === 'masculin' ? 'Tu commences avec combien, mon chéri ?'
    : 'Tu as combien pour ta caisse ?'
  const {
    session, openSession, cart, addToCart, removeFromCart,
    updateCartItemQty, updateCartItemPrice, clearCart, getCartTotal,
    amountReceived, addBillReceived, setAmountReceived, getChange, getBillBreakdown,
    addTodaySale, incrementTodaySalesCount, setHasActiveCart,
  } = useCaisseStore()
  const { products, adjustLocalStock, getTopSelling } = useStockStore()
  const [search, setSearch] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [saleError, setSaleError] = useState<string | null>(null)
  const [showOpenSession, setShowOpenSession] = useState(false)
  const [fondInput, setFondInput] = useState('')
  const [lastSaleTotal, setLastSaleTotal] = useState(0)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [priceProduct, setPriceProduct] = useState<Product | null>(null)
  // MODE-906 — mode d'encaissement (Espèces présélectionné) + client nommé
  // pour la vente à crédit (montant reçu masqué dans ce mode).
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('especes')
  const [creditClientName, setCreditClientName] = useState('')

  const cartTotal = getCartTotal()
  const change = getChange()
  const topSelling = getTopSelling()
  const textClass = soleilMode ? 'text-black' : ''

  const filteredProducts = useMemo(() => {
    if (!search) return products.filter(p => p.isActive)
    const lower = search.toLowerCase()
    return products.filter(p =>
      p.isActive && (p.name.toLowerCase().includes(lower) || p.category.toLowerCase().includes(lower))
    )
  }, [products, search])

  const handleOpenSession = () => {
    const fond = parseInt(fondInput) || 0
    openSession(fond)
    setShowOpenSession(false)
    tataSpeak(`Caisse ouverte avec ${formatMontantParle(fond)} francs. Bonne journée !`)
    haptic('success')
  }

  const handleAddProduct = (product: Product) => {
    const existing = cart.find(c => c.productId === product.id)
    if (existing) {
      updateCartItemQty(existing.id, existing.quantity + 1)
    } else {
      addToCart({
        name: product.name,
        quantity: 1,
        unitPrice: product.priceUnit,
        productId: product.id,
      })
    }
    setHasActiveCart(true)
    haptic('light')
    tataSpeak(`${product.name} ajouté.`)
  }

  // Graphical sale flow: tap a product (its picture or the button) to select
  // it, enter/say the price it's actually sold for this time, then confirm.
  const handleSelectProduct = (product: Product) => {
    haptic('light')
    setPriceProduct(product)
  }

  const handleConfirmProductPrice = (price: number) => {
    if (!priceProduct) return
    const existing = cart.find(c => c.productId === priceProduct.id)
    if (existing) {
      updateCartItemQty(existing.id, existing.quantity + 1)
      updateCartItemPrice(existing.id, price)
    } else {
      addToCart({
        name: priceProduct.name,
        quantity: 1,
        unitPrice: price,
        productId: priceProduct.id,
      })
    }
    setHasActiveCart(true)
    haptic('success')
    tataSpeak(`${priceProduct.name}, ${formatFCFA(price)} francs, ajouté.`)
    setPriceProduct(null)
  }

  const handleAddOther = () => {
    addToCart({
      name: 'Autre article',
      quantity: 1,
      unitPrice: 0,
    })
    setHasActiveCart(true)
    setShowCart(true)
  }

  const handleCompleteSale = async () => {
    const isCreditSale = paymentMode === 'credit'
    if (isCreditSale) {
      // MODE-906 (§21) — une vente à crédit est liée à un client nommé :
      // sans nom, pas de dette traçable. Le montant reçu est masqué (0).
      if (creditClientName.trim().length < 2) {
        tataSpeak('Le nom du client est obligatoire pour vendre à crédit.')
        playBeep('error')
        return
      }
    } else if (amountReceived < cartTotal) {
      tataSpeak('Le montant reçu est insuffisant.')
      playBeep('error')
      return
    }
    if (!merchantId) {
      tataSpeak('Compte non identifié.')
      playBeep('error')
      return
    }
    // STK-805 — « IMPOSSIBLE DE VENDRE SANS STOCK » (§3, NON NÉGOCIABLE) :
    // pré-vérification du panier AVANT tout enregistrement. Un article au
    //-delà du stock local REFUSE la vente entière (Tata nomme le produit,
    // le stock restant et la quantité demandée) — jamais d'écrêtage
    // silencieux à 0. La vérification serveur reste l'autorité.
    for (const item of cart) {
      if (!item.productId) continue
      const product = products.find((p) => p.id === item.productId)
      if (product && product.stockQty < item.quantity) {
        const refusalText = formatStockRefusal({
          product: product.name,
          available: product.stockQty,
          requested: item.quantity,
        })
        setSaleError(refusalText)
        playBeep('error')
        haptic('error')
        tataSpeak(refusalText)
        return
      }
    }

    // Persist the sale server-side; if that fails (offline, flaky network,
    // server error), queue it locally instead of losing the transaction —
    // the merchant must be able to keep selling without a connection.
    const clientId = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    // MODE-908 (§18) — chaque vente est étiquetée par le point de vente
    // actif (« Boutique » est créé au premier usage). Le point est lu ici
    // et transmis PAR PAYLOAD — sens unique : le store n'importe jamais la
    // caisse.
    const sellingPoint = useSellingPointsStore.getState().activePoint()
    const salePayload: Record<string, unknown> = {
      merchantId,
      clientId,
      items: cart.map((item) => ({
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        productId: item.productId,
      })),
      totalAmount: cartTotal,
      // Vente à crédit : rien n'est encaissé (l'op de crédit porte la dette).
      amountReceived: isCreditSale ? 0 : amountReceived,
    }
    salePayload.sellingPointClientId = sellingPoint.clientId
    salePayload.sellingPointName = sellingPoint.name
    if (paymentMode !== 'especes') {
      // MODE-906 — compatible avant/après migration : la colonne
      // payment_method n'est envoyée que si elle diffère du défaut.
      salePayload.paymentMethod = paymentMode
    }
    let syncedNow = false
    let saleRecorded = false
    try {
      const res = await fetch('/api/marchand/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salePayload),
      })
      if (res.ok) {
        syncedNow = true
        saleRecorded = true
      } else {
        // STK-804/805 — le serveur est l'autorité : un refus
        // INSUFFICIENT_STOCK (stock local périmé, ex. second appareil) est
        // DÉFINITIF — pas de file (rejouer ne réussira jamais), pas de
        // décrément, la vérité du stock est annoncée telle quelle.
        let refusal: { product?: string; available: number; requested: number; unit?: string } | null = null
        if (res.status === 422) {
          try {
            const body = (await res.json()) as { code?: string; available?: number; requested?: number; unit?: string; product?: string }
            if (body.code === 'INSUFFICIENT_STOCK') {
              refusal = {
                product: body.product,
                available: body.available ?? 0,
                requested: body.requested ?? 0,
                unit: body.unit,
              }
            }
          } catch {
            // corps illisible : refus générique ci-dessous
          }
        }
        if (refusal) {
          const refusalText = formatStockRefusal({
            product: refusal.product,
            available: refusal.available,
            requested: refusal.requested,
            unit: refusal.unit,
          })
          setSaleError(refusalText)
          playBeep('error')
          haptic('error')
          tataSpeak(refusalText)
          return
        }
        // Transitoire (408/429/5xx) → file offline ; refus définitif autre
        // (4xx) → la vente n'est pas enregistrée, réessayer ne peut pas
        // réussir : on l'annonce sans la mettre en file.
        if (res.status === 408 || res.status === 429 || res.status >= 500) {
          throw new Error(`Erreur ${res.status}`)
        }
        const failText = 'Vente non enregistrée. Réessayez.'
        setSaleError(failText)
        playBeep('error')
        haptic('error')
        tataSpeak(failText)
        void notify(saleRejectedInput(`refus serveur ${res.status}`))
        return
      }
    } catch {
      const queued = await queuePendingSync('sale', salePayload)
      if (!queued.ok) {
        // Neither the live request nor the local offline queue worked — the
        // sale genuinely was not recorded anywhere. Leave the cart and
        // payment screen intact (nothing was cleared) so the merchant can
        // retry instead of being told a false success.
        setSaleError('Impossible d\'enregistrer la vente. Réessayez.')
        playBeep('error')
        haptic('error')
        tataSpeak('Vente non enregistrée. Réessayez.')
        void notify(saleRejectedInput('problème de connexion et stockage plein'))
        return
      }
    }

    // Stock : projection locale en delta APRÈS verdict favorable (STK-804) —
    // le serveur (RPC merchant_record_sale) a déjà décrémenté la vérité, on
    // ne re-PATCH plus une valeur absolue calculée côté client.
    if (saleRecorded) {
      for (const item of cart) {
        if (item.productId) {
          const known = products.some((p) => p.id === item.productId)
          if (known) adjustLocalStock(item.productId, -item.quantity)
        }
      }
    }

    // Notification in-app : succès (en ligne) ou avertissement (en attente
    // de synchronisation). Best-effort — jamais bloquante pour la vente.
    void notify(saleCreatedInput({ saleId: null, amount: cartTotal, synced: syncedNow }))

    addTodaySale(cartTotal, { clientId: sellingPoint.clientId, name: sellingPoint.name })
    incrementTodaySalesCount()
    // MODE-909 (§28) — journal des ventes du jour (annulation possible) :
    // journalisé APRÈS le verdict favorable, comme addTodaySale.
    useCaisseStore.getState().journalTodaySale({
      saleClientId: clientId,
      amountCfa: cartTotal,
      items: cart.map((item) => ({
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.productId ? { productId: item.productId } : {}),
      })),
      point: { clientId: sellingPoint.clientId, name: sellingPoint.name },
    })
    setLastSaleTotal(cartTotal)
    setHasActiveCart(false)
    clearCart()
    setShowPayment(false)
    setSaleError(null)
    setShowSuccess(true)
    playBeep('success')
    haptic('success')
    if (isCreditSale) {
      // MODE-906 (§21) — la vente est enregistrée ; l'op de crédit part
      // dans le grand livre local + file offline (offline-first, jamais de
      // réseau bloquant ici). La phrase annonce la dette cumulée.
      const creditResult = useCreditsStore.getState().recordCredit({
        partnerName: creditClientName.trim(),
        amountCfa: cartTotal,
        saleClientId: clientId,
        note: 'Vente à crédit (caisse)',
      })
      if (creditResult.ok) {
        tataSpeak(creditRecordedPhrase(creditResult.partner.name, cartTotal, creditResult.partner.balanceCfa))
      } else {
        tataSpeak(syncedNow ? 'Vente enregistrée !' : 'Vente enregistrée, en attente de synchronisation.')
      }
    } else {
      tataSpeak(syncedNow ? 'Vente enregistrée !' : 'Vente enregistrée, en attente de synchronisation.')
    }
    // MODE-906 — remise à zéro du mode d'encaissement pour la vente suivante.
    setPaymentMode('especes')
    setCreditClientName('')
  }

  // No session open
  if (!session?.isOpen) {
    return (
      <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="p-4">
          <button onClick={goBack} className="flex items-center gap-1 text-muted-foreground mb-4 touch-target">
            <ArrowLeft className="w-5 h-5" /><span>Retour</span>
          </button>
        </div>
        <div className="flex flex-col items-center justify-center px-8 pt-12">
          <div className="w-24 h-24 rounded-full bg-[#C66A2C]/10 flex items-center justify-center mb-6">
            <ShoppingBag className="w-12 h-12 text-[#C66A2C]" />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${textClass}`}>Ouvrir la caisse</h2>
          <p className={`text-muted-foreground text-center mb-8 ${soleilMode ? 'text-base' : ''}`}>
            Entrez le fond de caisse pour commencer votre journée
          </p>
          <Card className="w-full max-w-sm">
            <CardContent className="p-6 space-y-4">
              <div>
                <label className={`text-sm font-medium mb-2 block ${textClass}`}>Fond de caisse (FCFA)</label>
                <VoiceAmountInput
                  value={fondInput}
                  onChange={setFondInput}
                  placeholder="Ex: 50000"
                  soleilMode={soleilMode}
                  autoFocus
                  autoPrompt={openCaissePrompt}
                />
                <p className="text-xs text-muted-foreground text-center mt-2">Saisissez au clavier ou dites le montant</p>
              </div>
              <Button
                className="w-full h-14 text-base bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                onClick={handleOpenSession}
                disabled={!fondInput || parseInt(fondInput) < 0}
              >
                Ouvrir la journée
              </Button>
            </CardContent>
          </Card>
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
            <h1 className={`font-bold text-lg ${textClass}`}>Caisse</h1>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
              Ouverte
            </Badge>
            <Button variant="ghost" size="icon" onClick={openVoiceModal} aria-label="Assistant vocal">
              <Mic className="w-5 h-5 text-[#C66A2C]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowCart(true)}
              className="relative"
              aria-label="Voir le panier"
            >
              <ShoppingBag className="w-5 h-5" />
              {cart.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-[#C66A2C] text-white border-0">
                  {cart.length}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un produit..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`pl-10 ${soleilMode ? 'text-base h-12' : ''}`}
          />
        </div>
      </div>

      {/* Quick sell - top products */}
      {!search && (
        <div className="px-4 mt-4">
          <h3 className={`text-sm font-semibold text-muted-foreground mb-2 ${soleilMode ? 'text-base' : ''}`}>Vente rapide</h3>
          <div className="flex gap-2">
            {topSelling.map(p => (
              <Card key={p.id} className="flex-1 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]" onClick={() => handleAddProduct(p)}>
                <CardContent className="p-3 text-center">
                  <div className="w-10 h-10 rounded-lg bg-[#FDF3ED] flex items-center justify-center mx-auto mb-1">
                    <Star className="w-5 h-5 text-[#C66A2C]" />
                  </div>
                  <p className={`text-xs font-medium truncate ${textClass}`}>{p.name}</p>
                  <p className="text-[10px] text-muted-foreground fcfa">{formatFCFA(p.priceUnit)}</p>
                </CardContent>
              </Card>
            ))}
            <Card className="flex-1 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]" onClick={handleAddOther}>
              <CardContent className="p-3 text-center">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-1">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className={`text-xs font-medium ${textClass}`}>Autre</p>
                <p className="text-[10px] text-muted-foreground">Montant libre</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Product Grid / List */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className={cn('text-sm font-semibold text-muted-foreground mb-3', soleilMode && 'text-base')}>
            {search ? 'Résultats' : 'Tous les produits'}
          </h3>
          <div className="flex gap-1">
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11" onClick={() => setViewMode('grid')} aria-label="Affichage en grille">
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11" onClick={() => setViewMode('list')} aria-label="Affichage en liste">
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map(p => (
              <ProductCardGrid key={p.id} product={p} onSelect={handleSelectProduct} soleilMode={soleilMode} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProducts.map(p => (
              <ProductCardList key={p.id} product={p} onSelect={handleSelectProduct} soleilMode={soleilMode} />
            ))}
          </div>
        )}
      </div>

      {/* Cart Sidebar */}
      {showCart && <CartSidebar onClose={() => setShowCart(false)} onPayment={() => { setShowCart(false); setShowPayment(true) }} soleilMode={soleilMode} />}

      {/* Product Price Modal (select article → enter/say price → confirm) */}
      {priceProduct && (
        <ProductPriceModal
          product={priceProduct}
          onClose={() => setPriceProduct(null)}
          onConfirm={handleConfirmProductPrice}
          soleilMode={soleilMode}
        />
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          onClose={() => { setShowPayment(false); setSaleError(null) }}
          onSuccess={handleCompleteSale}
          soleilMode={soleilMode}
          error={saleError}
          paymentMode={paymentMode}
          onPaymentModeChange={setPaymentMode}
          creditClientName={creditClientName}
          onCreditClientChange={setCreditClientName}
        />
      )}

      {/* Success Modal */}
      {showSuccess && <SuccessModal total={lastSaleTotal} onClose={() => setShowSuccess(false)} soleilMode={soleilMode} />}
    </div>
  )
}

function ProductCardGrid({ product, onSelect, soleilMode }: { product: Product; onSelect: (p: Product) => void; soleilMode: boolean }) {
  // Seuil paramétrable par produit (STK-806) — plus de « < 10 » gravé.
  const threshold = useStockStore((s) => s.getLowStockThreshold(product.id))
  const isLow = product.stockQty < threshold
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98] relative overflow-hidden"
      onClick={() => onSelect(product)}
    >
      <CardContent className="p-3">
        {isLow && <Badge variant="destructive" className="absolute top-2 right-2 text-[9px] px-1.5 py-0">Stock bas</Badge>}
        <div className="w-full h-16 rounded-lg bg-gradient-to-br from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center mb-2">
          <ProductIcon name={product.name} className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className={`text-sm font-medium truncate ${soleilMode ? 'text-black text-base' : ''}`}>{product.name}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-[#C66A2C] font-semibold fcfa">{formatFCFA(product.priceUnit)}</span>
          <span className="text-[10px] text-muted-foreground">{product.stockQty}</span>
        </div>
        <Button
          size="sm"
          className="w-full mt-2 h-8 text-xs bg-[#C66A2C] hover:bg-[#B55D25] text-white"
          onClick={e => { e.stopPropagation(); onSelect(product) }}
        >
          + Ajouter
        </Button>
      </CardContent>
    </Card>
  )
}

function ProductCardList({ product, onSelect, soleilMode }: { product: Product; onSelect: (p: Product) => void; soleilMode: boolean }) {
  // Seuil paramétrable par produit (STK-806) — plus de « < 10 » gravé.
  const threshold = useStockStore((s) => s.getLowStockThreshold(product.id))
  const isLow = product.stockQty < threshold
  return (
    <Card className="cursor-pointer hover:shadow-sm transition-shadow active:scale-[0.99]" onClick={() => onSelect(product)}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center shrink-0">
          <ProductIcon name={product.name} className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium truncate ${soleilMode ? 'text-black text-base' : ''}`}>{product.name}</p>
            {isLow && <Badge variant="destructive" className="text-[9px] px-1 py-0 shrink-0">Bas</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{product.category} · {product.stockQty} en stock</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-[#C66A2C] fcfa">{formatFCFA(product.priceUnit)}</p>
          <Button size="sm" className="min-h-11 min-w-11 text-[10px] bg-[#C66A2C] hover:bg-[#B55D25] text-white mt-1" onClick={e => { e.stopPropagation(); onSelect(product) }} aria-label={`Sélectionner ${product.name}`}>+</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ProductPriceModal({ product, onClose, onConfirm, soleilMode }: { product: Product; onClose: () => void; onConfirm: (price: number) => void; soleilMode: boolean }) {
  const [priceInput, setPriceInput] = useState(product.priceUnit ? String(product.priceUnit) : '')
  const textClass = soleilMode ? 'text-black' : ''
  const price = parseInt(priceInput) || 0

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-0 gap-0 [&>button:last-of-type]:hidden"
      >
        <div className="p-6 pb-10">
          <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
          <div className="flex flex-col items-center mb-5">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center mb-2">
              <ProductIcon name={product.name} className="w-8 h-8 text-muted-foreground" />
            </div>
            <SheetTitle asChild>
              <h3 className={`text-lg font-bold ${textClass}`}>{product.name}</h3>
            </SheetTitle>
          </div>
          <label className={`text-sm font-medium mb-2 block text-center ${textClass}`}>Prix (FCFA)</label>
          <VoiceAmountInput
            value={priceInput}
            onChange={setPriceInput}
            placeholder="Ex: 500"
            soleilMode={soleilMode}
            autoFocus
          />
          <p className="text-xs text-muted-foreground text-center mt-2">Saisissez au clavier ou dites le prix</p>
          <div className="flex gap-2 mt-6">
            <SheetClose asChild>
              <Button variant="outline" className="flex-1 h-12">Annuler</Button>
            </SheetClose>
            <Button
              className="flex-1 h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
              onClick={() => onConfirm(price)}
              disabled={price <= 0}
            >
              Ajouter
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CartSidebar({ onClose, onPayment, soleilMode }: { onClose: () => void; onPayment: () => void; soleilMode: boolean }) {
  const { cart, removeFromCart, updateCartItemQty, updateCartItemPrice, getCartTotal, clearCart } = useCaisseStore()
  const total = getCartTotal()
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="w-full max-w-sm p-0 gap-0 [&>button:last-of-type]:hidden"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <SheetTitle asChild>
            <h2 className={`font-bold text-lg ${textClass}`}>Panier ({cart.length})</h2>
          </SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Fermer le panier"><X className="w-5 h-5" /></Button>
          </SheetClose>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 julaba-scroll">
          {cart.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Panier vide</p>
            </div>
          )}
          {cart.map(item => (
            <Card key={item.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <p className={`text-sm font-medium ${textClass}`}>{item.name}</p>
                  <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => removeFromCart(item.id)} aria-label={`Retirer ${item.name} du panier`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => item.quantity > 1 && updateCartItemQty(item.id, item.quantity - 1)} aria-label="Diminuer la quantité">
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className={`w-8 text-center font-semibold ${textClass}`}>{item.quantity}</span>
                  <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => updateCartItemQty(item.id, item.quantity + 1)} aria-label="Augmenter la quantité">
                    <Plus className="w-3 h-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">× {formatFCFA(item.unitPrice)}</span>
                  <span className={`text-sm font-semibold w-20 text-right fcfa ${textClass}`}>{formatFCFA(item.subtotal)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Prix Unit."
                    value={item.unitPrice || ''}
                    onChange={e => updateCartItemPrice(item.id, parseInt(e.target.value) || 0)}
                    className="h-11 text-xs"
                    aria-label={`Prix unitaire de ${item.name}`}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Panier : footer au-dessus de l'indicateur home iOS (safe-area). */}
        <div className="border-t p-4 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-between items-center">
            <span className={`font-semibold ${textClass}`}>Total</span>
            <span className="text-xl font-bold text-[#C66A2C] fcfa">{formatFCFA(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={clearCart}>Vider</Button>
            <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={onPayment} disabled={cart.length === 0}>
              Encaisser
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PaymentModal({ onClose, onSuccess, soleilMode, error, paymentMode, onPaymentModeChange, creditClientName, onCreditClientChange }: {
  onClose: () => void
  onSuccess: () => void
  soleilMode: boolean
  error: string | null
  paymentMode: PaymentMode
  onPaymentModeChange: (mode: PaymentMode) => void
  creditClientName: string
  onCreditClientChange: (name: string) => void
}) {
  const { getCartTotal, amountReceived, addBillReceived, setAmountReceived, getChange, getBillBreakdown } = useCaisseStore()
  const partners = useCreditsStore((s) => s.partners)
  const partnerByName = useCreditsStore((s) => s.partnerByName)
  const isCredit = paymentMode === 'credit'
  const total = getCartTotal()
  const change = getChange()
  const bills = getBillBreakdown()
  const isExact = amountReceived === total && amountReceived > 0
  const textClass = soleilMode ? 'text-black' : ''

  // MODE-906 — suggestions de clients connus pendant la saisie du nom
  // (recherche insensible casse/accents, même normalisation que le store).
  const clientSuggestions = (() => {
    const needle = creditClientName.trim().toLowerCase()
    if (needle.length < 2) return []
    return Object.values(partners)
      .filter((p) => p.kind === 'client' && p.name.toLowerCase().includes(needle))
      .slice(0, 4)
  })()
  const knownClient = creditClientName.trim().length >= 2 ? partnerByName(creditClientName) : null

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-0 gap-0 [&>button:last-of-type]:hidden"
      >
        <div className="p-6 pb-10">
          <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
          <SheetTitle asChild>
            <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Paiement</h3>
          </SheetTitle>
          <div className="text-center mb-4">
            <p className={`text-sm text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>Total à payer</p>
            <p className={`text-3xl font-bold text-[#C66A2C] fcfa ${soleilMode ? 'text-4xl' : ''}`}>{formatFCFA(total)}</p>
          </div>

          {/* MODE-906 (§9) — sélecteur de mode de paiement (Espèces présélectionné). */}
          <div className="mb-4 grid grid-cols-4 gap-1.5" role="group" aria-label="Mode de paiement">
            {PAYMENT_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onPaymentModeChange(mode.id)}
                aria-pressed={paymentMode === mode.id}
                className={`min-h-11 rounded-xl border px-1 text-[11px] font-semibold leading-tight ${paymentMode === mode.id ? 'border-[#C66A2C] bg-[#C66A2C] text-white' : 'border-border bg-background text-muted-foreground'}`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {isCredit ? (
            <>
              <label className={`mb-1 block text-sm font-medium ${textClass}`}>Nom du client</label>
              <Input
                value={creditClientName}
                onChange={e => onCreditClientChange(e.target.value)}
                placeholder="Ex : Adjoua Koné"
                aria-label="Nom du client pour la vente à crédit"
                className="h-14 text-xl"
                autoFocus
              />
              {clientSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {clientSuggestions.map((p) => (
                    <button
                      key={p.clientId}
                      type="button"
                      className="rounded-full border border-[#C66A2C]/40 bg-[#FDF3ED] px-3 py-1 text-xs text-[#C66A2C]"
                      onClick={() => onCreditClientChange(p.name)}
                    >
                      {p.name}{p.balanceCfa > 0 ? ` · doit ${formatFCFA(p.balanceCfa)}` : ''}
                    </button>
                  ))}
                </div>
              )}
              {knownClient && (
                <div className="mt-2 flex items-center justify-center gap-2 p-3 bg-[#FDF3ED] rounded-xl">
                  <span className={`text-sm ${textClass}`}>Dette actuelle :</span>
                  <span className="font-bold text-[#C66A2C] fcfa">{formatFCFA(knownClient.balanceCfa)}</span>
                </div>
              )}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                La dette sera notée au nom du client (montant reçu masqué).
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Input
                  type="number"
                  placeholder="Montant reçu"
                  value={amountReceived || ''}
                  onChange={e => setAmountReceived(parseInt(e.target.value) || 0)}
                  className={`text-xl h-14 fcfa text-center ${soleilMode ? 'text-2xl' : ''}`}
                  autoFocus
                />
              </div>
              <div className="mb-4">
                <p className={`text-xs text-muted-foreground mb-2 ${soleilMode ? 'text-sm font-semibold' : ''}`}>Ajouter des billets</p>
                <div className="grid grid-cols-3 gap-2">
                  {BILLS.map(bill => (
                    <Button
                      key={bill}
                      variant="outline"
                      className={`h-12 ${soleilMode ? 'text-base font-semibold' : ''}`}
                      onClick={() => addBillReceived(bill)}
                    >
                      <Banknote className="w-4 h-4 mr-1" />{formatFCFA(bill)}
                    </Button>
                  ))}
                </div>
              </div>
              {amountReceived > 0 && (
                <div className="space-y-2">
                  {isExact && (
                    <div className="flex items-center justify-center gap-2 p-3 bg-green-50 rounded-xl">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-700">Compte juste !</span>
                    </div>
                  )}
                  {change > 0 && (
                    <>
                      <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                        <span className={textClass}>Monnaie à rendre</span>
                        <span className="font-bold text-blue-700 fcfa">{formatFCFA(change)}</span>
                      </div>
                      {bills.length > 0 && (
                        <div className="flex flex-wrap gap-2 justify-center">
                          {bills.map(b => (
                            <Badge key={b.amount} variant="secondary" className="text-sm py-1 px-3">
                              {formatFCFA(b.amount)} × {b.count}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {error && (
            <div className="mt-4 p-3 bg-red-50 rounded-xl text-sm text-red-700 text-center" role="alert">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-6">
            <SheetClose asChild>
              <Button variant="outline" className="flex-1 h-12">Annuler</Button>
            </SheetClose>
            <Button
              className="flex-1 h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
              onClick={onSuccess}
              disabled={isCredit ? creditClientName.trim().length < 2 : amountReceived < total}
            >
              <span className="inline-flex items-center gap-1.5">
                {error ? 'Réessayer' : isCredit ? 'Valider le crédit' : 'Valider'}{' '}
                {(isCredit ? creditClientName.trim().length >= 2 : amountReceived >= total) && <Check className="w-4 h-4" />}
              </span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SuccessModal({ total, onClose, soleilMode }: { total: number; onClose: () => void; soleilMode: boolean }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-full max-w-sm rounded-2xl gap-0 [&>button:last-of-type]:hidden"
      >
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <DialogTitle asChild>
            <h3 className={`text-xl font-bold mb-2 ${soleilMode ? 'text-2xl' : ''}`}>Vente enregistrée !</h3>
          </DialogTitle>
          <p className={`text-3xl font-bold text-[#C66A2C] fcfa mb-6 ${soleilMode ? 'text-4xl' : ''}`}>{formatFCFA(total)}</p>
          <Button className="w-full h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={onClose}>Continuer</Button>
        </CardContent>
      </DialogContent>
    </Dialog>
  )
}


