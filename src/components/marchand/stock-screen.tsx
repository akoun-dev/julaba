'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search, ArrowLeft, Plus, Pencil, Trash2,
  Check, X, Package, History, ChevronDown, TrendingUp
} from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ProductIcon } from '@/lib/product-icons'
import { useAppStore } from '@/lib/stores/app-store'
import { useStockStore, type Product } from '@/lib/stores/stock-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { queuePendingSync } from '@/lib/offline-db'
import { fetchJsonWithTimeout } from '@/lib/voice/baoule-engine'
import { completeQuickSale } from '@/lib/quick-sale'
import {
  buildQuickMovementPayload,
  buildQuickCountPayload,
  formatHistoryLabel,
  formatReasonNote,
  type HistoryMovement,
  type QuickActionType,
} from '@/lib/stock/quick-actions'
import {
  formatStockDisplay,
  toBaseQuantity,
  getBaseUnit,
  unitLabel,
  type StockUnitConfig,
} from '@/lib/stock/units'

const CATEGORIES = [
  'Tous', 'légumes', 'fruits', 'tubercules', 'céréales', 'protéines', 'ingrédients', 'légumineuses', 'autre'
] as const

type CategoryFilter = (typeof CATEGORIES)[number]

/** Unités sélectionnables pour un produit (STK-811 — sélecteur honnête) :
 * uniquement les conversions CONFIGURÉES + l'unité de base. Si le produit
 * n'a aucune config : le stock reste dans son unité brute, jamais une
 * conversion inventée. */
export function selectableUnits(unitConfig: StockUnitConfig[] | null): StockUnitConfig[] {
  if (!unitConfig || unitConfig.length === 0) return []
  return unitConfig
}

/** HISTORIQUE produit (§43) — 15 derniers mouvements, libellés FR. */
const HISTORY_LIMIT = 15

export function StockScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const { products, addProduct, updateProduct, deleteProduct, fetchProducts, loadStockConfig, getLowStockThreshold, getUnitConfig, adjustLocalStock } = useStockStore()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('Tous')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  // STK-811 — action rapide ouverte (remplace l'ancien « Réappro » absolu)
  const [quickAction, setQuickAction] = useState<{ productId: string; action: QuickActionType } | null>(null)
  const [quickQty, setQuickQty] = useState('')
  const [quickUnitCode, setQuickUnitCode] = useState<string>('')
  // HISTORIQUE produit (§43)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [historyByProduct, setHistoryByProduct] = useState<Record<string, HistoryMovement[]>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  // Marge discrète (§29-§30, STK-810) — chargée avec l'historique
  const [marginByProduct, setMarginByProduct] = useState<Record<string, { marginCfa: number; marginPct: number; isLoss: boolean } | null>>({})

  // Add form state
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('légumes')
  const [newPrice, setNewPrice] = useState('')
  const [newStock, setNewStock] = useState('')

  // Edit state
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('')

  const textClass = soleilMode ? 'text-black' : ''

  // Refreshes from the server on mount so a restock done on another device
  // (or synced later after being queued offline) shows up here — the store
  // only carried its persisted local snapshot otherwise.
  // STK-806 : charge aussi la configuration stock (unités commerciales +
  // seuils d'alerte par produit) qui alimente l'affichage converti.
  useEffect(() => {
    if (!merchantId) return
    fetchProducts(merchantId)
    void loadStockConfig(merchantId)
  }, [merchantId, fetchProducts, loadStockConfig])

  const filteredProducts = useMemo(() => {
    let list = products
    if (activeCategory !== 'Tous') {
      list = list.filter(p => p.category === activeCategory)
    }
    if (search) {
      const lower = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(lower))
    }
    return list
  }, [products, activeCategory, search])

  // Seuil paramétrable par produit (STK-806) — plus de « < 10 » gravé.
  const lowStockCount = products.filter(p => p.stockQty < getLowStockThreshold(p.id)).length

  const loadHistory = useCallback(async (productId: string) => {
    if (!merchantId) return
    setHistoryLoading(true)
    try {
      const res = await fetchJsonWithTimeout(
        `/api/marchand/stock/movements?merchantId=${merchantId}&productId=${productId}&limit=${HISTORY_LIMIT}`,
        { method: 'GET' },
      )
      if (res.ok) {
        const data = await res.json()
        setHistoryByProduct(prev => ({ ...prev, [productId]: data.movements ?? [] }))
        // Marge discrète : même aller-retour que l'historique (1 requête de
        // plus max, l'écran reste fluide ; échec = pas de marge affichée).
        try {
          const margeRes = await fetchJsonWithTimeout(
            `/api/marchand/stock/marge?merchantId=${merchantId}&productId=${productId}`,
            { method: 'GET' },
          )
          if (margeRes.ok) {
            const data = await margeRes.json()
            setMarginByProduct(prev => ({ ...prev, [productId]: data.margin ?? null }))
          }
        } catch { /* marge indisponible : rien affiché, jamais inventée */ }
      }
    } catch { /* réseau mort : l'historique reste vide, l'UI l'affiche */ }
    finally { setHistoryLoading(false) }
  }, [merchantId])

  const toggleHistory = (productId: string) => {
    if (historyFor === productId) {
      setHistoryFor(null)
      return
    }
    setHistoryFor(productId)
    if (!historyByProduct[productId]) void loadHistory(productId)
  }

  const handleAddProduct = async () => {
    if (!newName.trim() || !newPrice || !newStock || !merchantId) {
      tataSpeak('Remplissez tous les champs.')
      haptic('error')
      return
    }
    const price = parseInt(newPrice)
    const stock = parseInt(newStock)
    if (isNaN(price) || isNaN(stock) || price < 0 || stock < 0) {
      tataSpeak('Montants invalides.')
      haptic('error')
      return
    }
    // addProduct (useStockStore) already POSTs to /api/marchand/products and
    // refetches on success — it owns the offline fallback too (see
    // stock-store.ts), so this screen only needs to call it once.
    await addProduct(merchantId, {
      name: newName.trim(),
      category: newCategory,
      priceUnit: price,
      stockQty: stock,
      isActive: true,
    })

    tataSpeak(`${newName} ajouté au stock.`)
    haptic('success')
    setShowAddForm(false)
    setNewName('')
    setNewCategory('légumes')
    setNewPrice('')
    setNewStock('')
  }

  const startEdit = (product: Product) => {
    setEditingId(product.id)
    setEditPrice(String(product.priceUnit))
    setEditStock(String(product.stockQty))
  }

  const saveEdit = (id: string) => {
    const price = parseInt(editPrice)
    if (isNaN(price) || price < 0) {
      tataSpeak('Valeur invalide.')
      haptic('error')
      return
    }
    // Le stock vit désormais dans la balance RPC (mouvements) — l'édition
    // ne touche QUE le prix : le stock se corrige par COMPTER (§22) ou
    // AJOUTER, jamais par une écriture absolue qui écraserait le serveur.
    updateProduct(id, { priceUnit: price })
    tataSpeak('Produit modifié.')
    haptic('success')
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    const product = products.find(p => p.id === id)
    deleteProduct(id)
    tataSpeak(`${product?.name || 'Produit'} supprimé.`)
    haptic('medium')
    setDeleteConfirmId(null)
  }

  /** Conversion qty saisi × unité choisie → base (sélecteur honnête :
   * uniquement les unités configurées ; sans config, la quantité brute
   * EST la base). */
  const resolveQuickQuantityBase = (product: Product): number | null => {
    const qty = parseFloat(quickQty.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return null
    const unitConfig = getUnitConfig(product.id)
    const units = selectableUnits(unitConfig)
    const chosen = units.find(u => u.unitCode === quickUnitCode)
    if (chosen) return toBaseQuantity(qty, chosen)
    return qty // pas de config : le nombre saisi est en unité de base
  }

  const submitQuickAction = async (product: Product) => {
    if (!merchantId) return
    const quantityBase = resolveQuickQuantityBase(product)
    if (quantityBase === null) {
      tataSpeak('Quantité invalide.')
      haptic('error')
      return
    }
    const action = quickAction!.action

    // VENDRE passe par le chemin de vente RPC (refus strict stock, delta
    // local post-verdict) — jamais un mouvement écrit à la main.
    if (action === 'VENDRE') {
      const result = await completeQuickSale({
        name: product.name,
        quantity: quantityBase,
        unitPrice: product.priceUnit,
        productId: product.id,
      })
      if (!result.ok) {
        tataSpeak(
          result.refusal
            ? `Tu as seulement ${result.refusal.available} ${product.name}. Je ne peux pas enregistrer une vente de ${result.refusal.requested}.`
            : 'Vente non enregistrée. Réessayez.',
        )
        haptic('error')
        return
      }
      tataSpeak(`Vente enregistrée : ${quantityBase} ${product.name}.`)
      haptic('success')
      setQuickAction(null)
      setQuickQty('')
      return
    }

    // AJOUTER / PERTE → mouvement RPC ; COMPTER → ajustement au comptage.
    const payload = action === 'COMPTER'
      ? buildQuickCountPayload({ merchantId, productId: product.id, countedQuantityBase: quantityBase })
      : buildQuickMovementPayload(action, {
          merchantId,
          productId: product.id,
          quantityBase,
          unitCode: quickUnitCode || undefined,
        })

    const endpoint = action === 'COMPTER' ? '/api/marchand/stock/count' : '/api/marchand/stock/movements'
    let done = false
    try {
      const res = await fetchJsonWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) done = true
      else if (res.status === 422) {
        const body = await res.json().catch(() => ({}))
        tataSpeak(body.erreur ?? 'Opération refusée : compte le stock d\'abord.')
        haptic('error')
        return
      }
    } catch { /* réseau mort → file offline ci-dessous */ }

    if (!done) {
      const entity = action === 'COMPTER' ? 'stock-count' : 'stock-movement'
      const queued = await queuePendingSync(entity, payload)
      if (!queued.ok) {
        tataSpeak('Non enregistré. Réessayez.')
        haptic('error')
        return
      }
      tataSpeak('Noté, en attente de synchronisation.')
      haptic('medium')
    } else {
      // Delta local post-verdict (la vérité arrive au prochain refresh).
      const isCount = action === 'COMPTER'
      const delta = action === 'PERTE' ? -quantityBase : isCount ? 0 : quantityBase
      if (delta !== 0) adjustLocalStock(product.id, delta)
      const spoken = action === 'COMPTER'
        ? `Stock compté : ${quantityBase} ${product.name}.`
        : action === 'PERTE'
          ? `Perte enregistrée : ${quantityBase} ${product.name}.`
          : `+${quantityBase} ${product.name} ajoutés.`
      tataSpeak(spoken)
      haptic('success')
    }
    setQuickAction(null)
    setQuickQty('')
  }

  /** Affichage converti du stock (« Oignons — 2 sacs + 8 kilos », §2.9). */
  const displayStock = (product: Product): string => {
    const unitConfig = getUnitConfig(product.id)
    if (!unitConfig || unitConfig.length === 0) return `${product.stockQty} en stock`
    const base = getBaseUnit(unitConfig)
    const baseLabel = base ? unitLabel(base.unitCode, product.stockQty) : ''
    return `${formatStockDisplay(product.stockQty, unitConfig, base?.unitCode)} ${baseLabel ? `(${baseLabel})` : ''}`.trim()
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>MES PRODUITS</h1>
          </div>
          <div className="flex items-center gap-2">
            {lowStockCount > 0 && (
              <Badge variant="destructive" className="text-xs">{lowStockCount} stock bas</Badge>
            )}
            <Button
              size="sm"
              className="bg-[#C66A2C] hover:bg-[#B55D25] text-white"
              onClick={() => {
                setShowAddForm(true)
                haptic('light')
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un produit..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={soleilMode ? 'pl-10 text-base h-12' : 'pl-10'}
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); haptic('light') }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-[#C66A2C] text-white'
                  : 'bg-muted text-muted-foreground'
              } ${soleilMode && activeCategory !== cat ? 'text-black bg-gray-200 dark:text-stone-100 dark:bg-stone-700' : ''}`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Add Product Form */}
      {showAddForm && (
        <div className="px-4 mt-4">
          <Card className="border-[#C66A2C]/30">
            <CardContent className="p-4 space-y-3">
              <h3 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Nouveau produit</h3>
              <div>
                <label className={`text-sm font-medium mb-1 block ${soleilMode ? 'text-black text-base' : ''}`}>Nom du produit</label>
                <Input
                  placeholder="Ex: Tomates"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className={soleilMode ? 'text-base h-12' : ''}
                  autoFocus
                />
              </div>
              <div>
                <label className={`text-sm font-medium mb-1 block ${soleilMode ? 'text-black text-base' : ''}`}>Catégorie</label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className={soleilMode ? 'text-base h-12' : ''}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter(c => c !== 'Tous').map(cat => (
                      <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-sm font-medium mb-1 block ${soleilMode ? 'text-black text-base' : ''}`}>Prix unitaire (FCFA)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    className={soleilMode ? 'text-base h-12' : ''}
                  />
                </div>
                <div>
                  <label className={`text-sm font-medium mb-1 block ${soleilMode ? 'text-black text-base' : ''}`}>Stock initial</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newStock}
                    onChange={e => setNewStock(e.target.value)}
                    className={soleilMode ? 'text-base h-12' : ''}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddForm(false)}>
                  Annuler
                </Button>
                <Button
                  className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                  onClick={handleAddProduct}
                >
                  Enregistrer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Product List */}
      <div className="px-4 mt-4 space-y-2">
        {filteredProducts.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className={soleilMode ? 'text-base' : ''}>Aucun produit trouvé</p>
          </div>
        )}
        {filteredProducts.map(product => {
          const isLow = product.stockQty < getLowStockThreshold(product.id)
          const isEditing = editingId === product.id
          const isDeleting = deleteConfirmId === product.id
          const activeQuick = quickAction?.productId === product.id ? quickAction.action : null
          const isHistoryOpen = historyFor === product.id
          const unitConfig = getUnitConfig(product.id)
          const units = selectableUnits(unitConfig)
          const movements = historyByProduct[product.id]
          const margin = marginByProduct[product.id]

          return (
            <Card key={product.id} className={isLow ? 'border-red-200' : ''}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center shrink-0">
                    <ProductIcon name={product.name} className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${soleilMode ? 'text-black text-base' : ''}`}>{product.name}</p>
                      {isLow && <Badge variant="destructive" className="text-[9px] px-1.5 py-0 shrink-0">Stock bas</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {product.category}
                      </Badge>
                      <span className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>
                        {displayStock(product)}
                      </span>
                    </div>
                    {/* Marge discrète (STK-810) : une info, pas une fanfare —
                        perte négative affichée, coût inconnu = rien. */}
                    {margin && !margin.isLoss && margin.marginCfa > 0 && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-green-700 dark:text-green-400">
                        <TrendingUp className="w-3 h-3" />
                        Marge +{margin.marginCfa} FCFA ({String(margin.marginPct).replace('.', ',')} %)
                      </span>
                    )}
                    {margin?.isLoss && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-red-600">
                        <TrendingUp className="w-3 h-3 rotate-180" />
                        Perte {margin.marginCfa} FCFA — vérifie ton prix d'achat
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <p className="text-sm font-semibold text-[#C66A2C] fcfa">{formatFCFA(product.priceUnit)}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px] text-muted-foreground"
                      onClick={() => toggleHistory(product.id)}
                    >
                      <History className="w-3 h-3 mr-1" />
                      Historique
                      <ChevronDown className={`w-3 h-3 ml-0.5 transition-transform ${isHistoryOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>
                </div>

                {/* HISTORIQUE produit (§43) — 15 derniers mouvements, FR */}
                {isHistoryOpen && (
                  <div className="mt-3 pt-3 border-t">
                    <p className={`text-xs font-medium mb-2 ${soleilMode ? 'text-black text-base' : ''}`}>
                      Historique (15 derniers mouvements)
                    </p>
                    {historyLoading && <p className="text-xs text-muted-foreground">Chargement…</p>}
                    {!historyLoading && (!movements || movements.length === 0) && (
                      <p className="text-xs text-muted-foreground">
                        Aucun mouvement enregistré — les ventes et achats apparaîtront ici.
                      </p>
                    )}
                    {!historyLoading && movements && movements.length > 0 && (
                      <ul className="space-y-1">
                        {movements.map(m => {
                          const base = getBaseUnit(unitConfig)
                          const note = formatReasonNote(m as HistoryMovement)
                          return (
                            <li key={m.id} className="text-xs flex items-center justify-between gap-2">
                              <span className={soleilMode ? 'text-black text-sm' : ''}>
                                {formatHistoryLabel(m as HistoryMovement, base?.unitCode ?? null)}
                                {note && <span className="text-muted-foreground"> ({note})</span>}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Delete confirmation */}
                {isDeleting && (
                  <div className="mt-3 pt-3 border-t">
                    <p className={`text-sm mb-2 ${soleilMode ? 'text-black text-base' : ''}`}>Supprimer {product.name} ?</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setDeleteConfirmId(null)}>Non</Button>
                      <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDelete(product.id)}>Oui, supprimer</Button>
                    </div>
                  </div>
                )}

                {/* Quick action form — qty + sélecteur d'unité honnête */}
                {activeQuick && (
                  <div className="mt-3 pt-3 border-t">
                    <p className={`text-xs font-medium mb-2 ${soleilMode ? 'text-black text-base' : ''}`}>
                      {activeQuick === 'VENDRE' && `Vendre — ${product.name}`}
                      {activeQuick === 'AJOUTER' && `Ajouter au stock — ${product.name}`}
                      {activeQuick === 'PERTE' && `Déclarer une perte — ${product.name}`}
                      {activeQuick === 'COMPTER' && `Compter le stock réel — ${product.name}`}
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Quantité"
                        value={quickQty}
                        onChange={e => setQuickQty(e.target.value)}
                        className={soleilMode ? 'text-base h-12' : ''}
                        autoFocus
                      />
                      {units.length > 0 && (
                        <Select
                          value={quickUnitCode || getBaseUnit(unitConfig)?.unitCode || ''}
                          onValueChange={setQuickUnitCode}
                        >
                          <SelectTrigger className="w-[110px] shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map(u => (
                              <SelectItem key={u.unitCode} value={u.unitCode}>
                                {unitLabel(u.unitCode, 1)}{u.conversionToBase !== 1 && u.conversionToBase > 0 ? ` (${u.conversionToBase})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button size="sm" className={`shrink-0 text-white ${activeQuick === 'PERTE' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#C66A2C] hover:bg-[#B55D25]'}`} onClick={() => submitQuickAction(product)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => { setQuickAction(null); setQuickQty('') }} aria-label="Annuler l'action">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {units.length > 0 && activeQuick !== 'COMPTER' && (() => {
                      const baseCode = getBaseUnit(unitConfig)?.unitCode
                      return (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          La conversion vers l'unité de base suit TA configuration ({units.map(u => `1 ${unitLabel(u.unitCode, 1)} = ${u.conversionToBase} ${baseCode ? unitLabel(baseCode, 1) : ''}`).filter((s, i, a) => a.indexOf(s) === i).join(', ')}).
                        </p>
                      )
                    })()}
                  </div>
                )}

                {/* Edit form — prix uniquement (le stock se corrige par
                    COMPTER/AJOUTER, jamais une écriture absolue §D3) */}
                {isEditing && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div>
                      <label className={`text-[10px] text-muted-foreground mb-0.5 block ${soleilMode ? 'text-sm' : ''}`}>Prix (FCFA)</label>
                      <Input
                        type="number"
                        value={editPrice}
                        onChange={e => setEditPrice(e.target.value)}
                        className={soleilMode ? 'text-base h-12' : ''}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingId(null)}>Annuler</Button>
                      <Button size="sm" className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={() => saveEdit(product.id)}>Enregistrer</Button>
                    </div>
                  </div>
                )}

                {/* Action buttons — STK-811 quick actions */}
                {!isEditing && !isDeleting && !activeQuick && (
                  <div className="flex gap-1 mt-2 pt-2 border-t flex-wrap">
                    <Button variant="ghost" size="sm" className="text-xs min-h-11" onClick={() => { setQuickAction({ productId: product.id, action: 'VENDRE' }); setQuickUnitCode(getBaseUnit(unitConfig)?.unitCode ?? ''); haptic('light') }}>
                      Vendre
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs min-h-11" onClick={() => { setQuickAction({ productId: product.id, action: 'AJOUTER' }); setQuickUnitCode(units.find(u => !u.isBase)?.unitCode ?? getBaseUnit(unitConfig)?.unitCode ?? ''); haptic('light') }}>
                      <Plus className="w-3 h-3 mr-1" /> Ajouter
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs min-h-11 text-red-600" onClick={() => { setQuickAction({ productId: product.id, action: 'PERTE' }); setQuickUnitCode(getBaseUnit(unitConfig)?.unitCode ?? ''); haptic('light') }}>
                      Perte
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs min-h-11" onClick={() => { setQuickAction({ productId: product.id, action: 'COMPTER' }); setQuickUnitCode(getBaseUnit(unitConfig)?.unitCode ?? ''); haptic('light') }}>
                      Compter
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs min-h-11" onClick={() => startEdit(product)}>
                      <Pencil className="w-3 h-3" aria-label="Modifier" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs min-h-11 min-w-11 text-destructive ml-auto" onClick={() => setDeleteConfirmId(product.id)} aria-label={`Supprimer ${product.name}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// unitLabel import utilisé par l'historique (pluriel honnête) — garde le
// tree-shaking honnête si l'UI évolue.
void unitLabel
