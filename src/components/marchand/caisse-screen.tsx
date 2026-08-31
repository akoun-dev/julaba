'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Search, Plus, Minus, Trash2, ShoppingBag,
  Mic, ArrowLeft, Check, CheckCircle2, X,
  Banknote, Calculator, Star, Grid3X3, List
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore, type CartItem } from '@/lib/stores/caisse-store'
import { useStockStore, type Product } from '@/lib/stores/stock-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { tataSpeak, playBeep, haptic } from '@/lib/voice/tata-tts'
import { queuePendingSync } from '@/lib/offline-db'
import { cn } from '@/lib/utils'

const BILLS = [500, 1000, 2000, 5000, 10000]

export function CaisseScreen() {
  const { soleilMode, openVoiceModal, navigate, goBack, merchantId } = useAppStore()
  const {
    session, openSession, cart, addToCart, removeFromCart,
    updateCartItemQty, updateCartItemPrice, clearCart, getCartTotal,
    amountReceived, addBillReceived, setAmountReceived, getChange, getBillBreakdown,
    setTodaySales, setTodaySalesCount, setHasActiveCart,
    todaySales, todaySalesCount
  } = useCaisseStore()
  const { products, updateProduct, getTopSelling } = useStockStore()
  const [search, setSearch] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [saleError, setSaleError] = useState<string | null>(null)
  const [showOpenSession, setShowOpenSession] = useState(false)
  const [fondInput, setFondInput] = useState('')
  const [lastSaleTotal, setLastSaleTotal] = useState(0)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const cartTotal = getCartTotal()
  const change = getChange()
  const isCompteJust = change === 0 && amountReceived > 0
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
    tataSpeak(`Caisse ouverte avec ${formatFCFA(fond)} FCFA. Bonne journée !`)
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
    if (amountReceived < cartTotal) {
      tataSpeak('Le montant reçu est insuffisant.')
      playBeep('error')
      return
    }
    if (!merchantId) {
      tataSpeak('Compte non identifié.')
      playBeep('error')
      return
    }
    // Update stock
    for (const item of cart) {
      if (item.productId) {
        const product = products.find(p => p.id === item.productId)
        if (product) {
          updateProduct(product.id, { stockQty: Math.max(0, product.stockQty - item.quantity) })
        }
      }
    }

    // Persist the sale server-side; if that fails (offline, flaky network,
    // server error), queue it locally instead of losing the transaction —
    // the merchant must be able to keep selling without a connection.
    const clientId = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const salePayload = {
      merchantId,
      clientId,
      items: cart.map((item) => ({
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        productId: item.productId,
      })),
      totalAmount: cartTotal,
      amountReceived,
    }
    let syncedNow = false
    try {
      const res = await fetch('/api/marchand/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salePayload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      syncedNow = true
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
        return
      }
    }

    setTodaySales(todaySales + cartTotal)
    setTodaySalesCount(todaySalesCount + 1)
    setLastSaleTotal(cartTotal)
    setHasActiveCart(false)
    clearCart()
    setShowPayment(false)
    setSaleError(null)
    setShowSuccess(true)
    playBeep('success')
    haptic('success')
    tataSpeak(syncedNow ? 'Vente enregistrée !' : 'Vente enregistrée, en attente de synchronisation.')
  }

  // No session open
  if (!session?.isOpen) {
    return (
      <div className="screen-enter pb-24">
        <div className="p-4">
          <button onClick={goBack} className="flex items-center gap-1 text-muted-foreground mb-4 touch-target">
            <ArrowLeft className="w-5 h-5" /><span>Retou</span>
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
                <Input
                  type="number"
                  placeholder="Ex: 50000"
                  value={fondInput}
                  onChange={e => setFondInput(e.target.value)}
                  className={`text-xl h-14 fcfa text-center ${soleilMode ? 'text-2xl' : ''}`}
                  autoFocus
                />
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
    <div className="screen-enter pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
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
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => setViewMode('grid')} aria-label="Affichage en grille">
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => setViewMode('list')} aria-label="Affichage en liste">
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map(p => (
              <ProductCardGrid key={p.id} product={p} onAdd={handleAddProduct} soleilMode={soleilMode} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProducts.map(p => (
              <ProductCardList key={p.id} product={p} onAdd={handleAddProduct} soleilMode={soleilMode} />
            ))}
          </div>
        )}
      </div>

      {/* Cart Sidebar */}
      {showCart && <CartSidebar onClose={() => setShowCart(false)} onPayment={() => { setShowCart(false); setShowPayment(true) }} soleilMode={soleilMode} />}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          onClose={() => { setShowPayment(false); setSaleError(null) }}
          onSuccess={handleCompleteSale}
          soleilMode={soleilMode}
          error={saleError}
        />
      )}

      {/* Success Modal */}
      {showSuccess && <SuccessModal total={lastSaleTotal} onClose={() => setShowSuccess(false)} soleilMode={soleilMode} />}
    </div>
  )
}

function ProductCardGrid({ product, onAdd, soleilMode }: { product: Product; onAdd: (p: Product) => void; soleilMode: boolean }) {
  const isLow = product.stockQty < 10
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98] relative overflow-hidden">
      <CardContent className="p-3">
        {isLow && <Badge variant="destructive" className="absolute top-2 right-2 text-[9px] px-1.5 py-0">Stock bas</Badge>}
        <div className="w-full h-16 rounded-lg bg-gradient-to-br from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center mb-2">
          <span className="text-3xl">{getProductEmoji(product.name)}</span>
        </div>
        <p className={`text-sm font-medium truncate ${soleilMode ? 'text-black text-base' : ''}`}>{product.name}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-[#C66A2C] font-semibold fcfa">{formatFCFA(product.priceUnit)}</span>
          <span className="text-[10px] text-muted-foreground">{product.stockQty}</span>
        </div>
        <Button
          size="sm"
          className="w-full mt-2 h-8 text-xs bg-[#C66A2C] hover:bg-[#B55D25] text-white"
          onClick={e => { e.stopPropagation(); onAdd(product) }}
        >
          + Ajouter
        </Button>
      </CardContent>
    </Card>
  )
}

function ProductCardList({ product, onAdd, soleilMode }: { product: Product; onAdd: (p: Product) => void; soleilMode: boolean }) {
  const isLow = product.stockQty < 10
  return (
    <Card className="cursor-pointer hover:shadow-sm transition-shadow active:scale-[0.99]">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center shrink-0">
          <span className="text-2xl">{getProductEmoji(product.name)}</span>
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
          <Button size="sm" className="h-7 text-[10px] bg-[#C66A2C] hover:bg-[#B55D25] text-white mt-1" onClick={e => { e.stopPropagation(); onAdd(product) }}>+</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CartSidebar({ onClose, onPayment, soleilMode }: { onClose: () => void; onPayment: () => void; soleilMode: boolean }) {
  const { cart, removeFromCart, updateCartItemQty, updateCartItemPrice, getCartTotal, clearCart } = useCaisseStore()
  const total = getCartTotal()
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-full max-w-sm bg-background border-l flex flex-col animate-in slide-in-from-right">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className={`font-bold text-lg ${textClass}`}>Panier ({cart.length})</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer le panier"><X className="w-5 h-5" /></Button>
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
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFromCart(item.id)} aria-label={`Retirer ${item.name} du panier`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => item.quantity > 1 && updateCartItemQty(item.id, item.quantity - 1)} aria-label="Diminuer la quantité">
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className={`w-8 text-center font-semibold ${textClass}`}>{item.quantity}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateCartItemQty(item.id, item.quantity + 1)} aria-label="Augmenter la quantité">
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
                    className="h-8 text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="border-t p-4 space-y-3">
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
      </div>
    </div>
  )
}

function PaymentModal({ onClose, onSuccess, soleilMode, error }: { onClose: () => void; onSuccess: () => void; soleilMode: boolean; error: string | null }) {
  const { getCartTotal, amountReceived, addBillReceived, setAmountReceived, getChange, getBillBreakdown } = useCaisseStore()
  const total = getCartTotal()
  const change = getChange()
  const bills = getBillBreakdown()
  const isExact = amountReceived === total && amountReceived > 0
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <Card className="w-full max-w-lg rounded-t-3xl rounded-b-none" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-10">
          <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
          <h3 className={`text-lg font-bold text-center mb-4 ${textClass}`}>Paiement</h3>
          <div className="text-center mb-6">
            <p className={`text-sm text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>Total à payer</p>
            <p className={`text-3xl font-bold text-[#C66A2C] fcfa ${soleilMode ? 'text-4xl' : ''}`}>{formatFCFA(total)}</p>
          </div>
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
                  <span className="font-semibold text-green-700">Kont jus !</span>
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
          {error && (
            <div className="mt-4 p-3 bg-red-50 rounded-xl text-sm text-red-700 text-center" role="alert">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-6">
            <Button variant="outline" className="flex-1 h-12" onClick={onClose}>Annuler</Button>
            <Button
              className="flex-1 h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
              onClick={onSuccess}
              disabled={amountReceived < total}
            >
              <span className="inline-flex items-center gap-1.5">
                {error ? 'Réessayer' : 'Valider'} {amountReceived >= total && <Check className="w-4 h-4" />}
              </span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function SuccessModal({ total, onClose, soleilMode }: { total: number; onClose: () => void; soleilMode: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <h3 className={`text-xl font-bold mb-2 ${soleilMode ? 'text-2xl' : ''}`}>Vente enregistrée !</h3>
          <p className={`text-3xl font-bold text-[#C66A2C] fcfa mb-6 ${soleilMode ? 'text-4xl' : ''}`}>{formatFCFA(total)}</p>
          <Button className="w-full h-12 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={onClose}>OK</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function getProductEmoji(name: string): string {
  const emojis: Record<string, string> = {
    'Tomates': '🍅', 'Oignons': '🧅', 'Piments': '🌶️', 'Aubergines': '🍆', 'Gombos': '🥘',
    'Bananes': '🍌', 'Ignames': '🥔', 'Riz': '🍚', 'Huile de palme': '🫒', 'Poisson fumé': '🐟',
    'Poulet': '🍗', 'Œufs': '🥚', 'Avocats': '🥑', 'Oranges': '🍊', 'Mangues': '🥭',
    'Ananas': '🍍', 'Carottes': '🥕', 'Concombres': '🥒', 'Salade': '🥬', 'Ail': '🧄',
    'Sel': '🧂', 'Arachides': '🥜', 'Manioc': '🫚', 'Pommes de terre': '🥔',
  }
  return emojis[name] || '📦'
}
