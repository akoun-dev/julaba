'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Search, ArrowLeft, Plus, Pencil, Trash2, PackagePlus,
  Check, X, Package
} from 'lucide-react'
import { ProductIcon } from '@/lib/product-icons'
import { useAppStore } from '@/lib/stores/app-store'
import { useStockStore, type Product } from '@/lib/stores/stock-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'

const CATEGORIES = [
  'Tous', 'légumes', 'fruits', 'tubercules', 'céréales', 'protéines', 'ingrédients', 'légumineuses', 'autre'
] as const

type CategoryFilter = (typeof CATEGORIES)[number]



export function StockScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const { products, addProduct, updateProduct, deleteProduct, fetchProducts } = useStockStore()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('Tous')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [restockId, setRestockId] = useState<string | null>(null)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('légumes')
  const [newPrice, setNewPrice] = useState('')
  const [newStock, setNewStock] = useState('')

  // Edit state
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('')

  // Restock state
  const [restockQty, setRestockQty] = useState('')

  const textClass = soleilMode ? 'text-black' : ''

  // Refreshes from the server on mount so a restock done on another device
  // (or synced later after being queued offline) shows up here — the store
  // only carried its persisted local snapshot otherwise.
  useEffect(() => {
    if (merchantId) fetchProducts(merchantId)
  }, [merchantId, fetchProducts])

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

  const lowStockCount = products.filter(p => p.stockQty < 10).length

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
    const stock = parseInt(editStock)
    if (isNaN(price) || isNaN(stock) || price < 0 || stock < 0) {
      tataSpeak('Valeurs invalides.')
      haptic('error')
      return
    }
    updateProduct(id, { priceUnit: price, stockQty: stock })
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

  const handleRestock = (id: string) => {
    const qty = parseInt(restockQty)
    if (isNaN(qty) || qty <= 0) {
      tataSpeak('Quantité invalide.')
      haptic('error')
      return
    }
    const product = products.find(p => p.id === id)
    if (product) {
      updateProduct(id, { stockQty: product.stockQty + qty })
      tataSpeak(`+${qty} ${product.name} ajoutés au stock.`)
      haptic('success')
    }
    setRestockId(null)
    setRestockQty('')
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
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Stock</h1>
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
              } ${soleilMode && activeCategory !== cat ? 'text-black bg-gray-200' : ''}`}
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
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className={`w-full h-10 rounded-md border border-input bg-background px-3 text-sm ${soleilMode ? 'text-base h-12' : ''}`}
                >
                  {CATEGORIES.filter(c => c !== 'Tous').map(cat => (
                    <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                  ))}
                </select>
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
          const isLow = product.stockQty < 10
          const isEditing = editingId === product.id
          const isDeleting = deleteConfirmId === product.id
          const isRestocking = restockId === product.id

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
                        {product.stockQty} en stock
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-[#C66A2C] fcfa">{formatFCFA(product.priceUnit)}</p>
                  </div>
                </div>

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

                {/* Restock form */}
                {isRestocking && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="Quantité"
                        value={restockQty}
                        onChange={e => setRestockQty(e.target.value)}
                        className={soleilMode ? 'text-base h-12' : ''}
                        autoFocus
                      />
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white shrink-0" onClick={() => handleRestock(product.id)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => { setRestockId(null); setRestockQty('') }} aria-label="Annuler le réapprovisionnement">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Edit form */}
                {isEditing && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="grid grid-cols-2 gap-2">
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
                      <div>
                        <label className={`text-[10px] text-muted-foreground mb-0.5 block ${soleilMode ? 'text-sm' : ''}`}>Stock</label>
                        <Input
                          type="number"
                          value={editStock}
                          onChange={e => setEditStock(e.target.value)}
                          className={soleilMode ? 'text-base h-12' : ''}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingId(null)}>Annuler</Button>
                      <Button size="sm" className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={() => saveEdit(product.id)}>Enregistrer</Button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {!isEditing && !isDeleting && !isRestocking && (
                  <div className="flex gap-1 mt-2 pt-2 border-t">
                    <Button variant="ghost" size="sm" className="text-xs min-h-11" onClick={() => startEdit(product)}>
                      <Pencil className="w-3 h-3 mr-1" /> Modifier
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs min-h-11" onClick={() => { setRestockId(product.id); haptic('light') }}>
                      <PackagePlus className="w-3 h-3 mr-1" /> Réappro
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
