'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Edit3,
  Filter,
  ImageOff,
  Package,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Store,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { formatFCFA } from '@/lib/utils'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

type ProductStatus = 'en_stock' | 'rupture' | 'inactif'
type ListingStatus = 'draft' | 'pending_review' | 'published' | 'suspended' | 'archived'
type OrderStatus = 'en_attente' | 'confirmee' | 'livree' | 'annulee'

interface Product {
  id: string
  merchantId: string
  name: string
  price: number
  stock: number
  status: ProductStatus
  seller: string
  sellerPhone: string | null
  sellerCategory: string | null
  category: string
  imageUrl: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  listingStatus: ListingStatus
}

interface Order {
  id: string
  merchantId: string
  buyer: string
  buyerPhone: string | null
  supplier: string
  productName: string
  quantity: number
  unitPrice: number
  amount: number
  status: OrderStatus
  note: string | null
  createdAt: string
  updatedAt: string
}

interface Seller {
  id: string
  name: string
  phone: string | null
  zone: string
  category: string | null
  productsCount: number
  totalSales: number
  ordersCount: number
  status: 'actif' | 'inactif'
}

const PRODUCT_FILTERS = [
  ['all', 'Tous'],
  ['en_stock', 'En stock'],
  ['rupture', 'Rupture'],
  ['inactif', 'Inactif'],
  ['moderation', 'À modérer'],
] as const

const ORDER_FILTERS = [
  ['all', 'Tous'],
  ['en_attente', 'En attente'],
  ['confirmee', 'Confirmée'],
  ['livree', 'Livrée'],
  ['annulee', 'Annulée'],
] as const

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  en_attente: ['confirmee', 'annulee'],
  confirmee: ['livree', 'annulee'],
  livree: [],
  annulee: [],
}

const statusLabel: Record<string, string> = {
  en_stock: 'En stock',
  rupture: 'Rupture',
  inactif: 'Inactif',
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  livree: 'Livrée',
  annulee: 'Annulée',
  draft: 'Brouillon',
  pending_review: 'À modérer',
  published: 'Publié',
  suspended: 'Suspendu',
  archived: 'Archivé',
}

function statusClass(status: string, dark: boolean) {
  const light: Record<string, string> = {
    en_stock: 'bg-emerald-100 text-emerald-700',
    rupture: 'bg-red-100 text-red-700',
    inactif: 'bg-gray-100 text-gray-600',
    en_attente: 'bg-amber-100 text-amber-700',
    confirmee: 'bg-blue-100 text-blue-700',
    livree: 'bg-emerald-100 text-emerald-700',
    annulee: 'bg-red-100 text-red-700',
    draft: 'bg-slate-700 text-slate-300', pending_review: 'bg-amber-500/15 text-amber-400', published: 'bg-emerald-500/15 text-emerald-400', suspended: 'bg-red-500/15 text-red-400', archived: 'bg-slate-700 text-slate-400',
  }
  const darkMap: Record<string, string> = {
    en_stock: 'bg-emerald-500/15 text-emerald-400',
    rupture: 'bg-red-500/15 text-red-400',
    inactif: 'bg-slate-700 text-slate-300',
    en_attente: 'bg-amber-500/15 text-amber-400',
    confirmee: 'bg-blue-500/15 text-blue-400',
    livree: 'bg-emerald-500/15 text-emerald-400',
    annulee: 'bg-red-500/15 text-red-400',
    draft: 'bg-slate-100 text-slate-600', pending_review: 'bg-amber-100 text-amber-700', published: 'bg-emerald-100 text-emerald-700', suspended: 'bg-red-100 text-red-700', archived: 'bg-slate-100 text-slate-500',
  }
  return (dark ? darkMap : light)[status] ?? (dark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600')
}

export function BoMarketplaceScreen() {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [stats, setStats] = useState({ totalProducts: 0, activeProducts: 0, outOfStock: 0, sellers: 0, orders: 0, pendingOrders: 0, totalVolume: 0 })
  const [categories, setCategories] = useState<string[]>([])
  const [merchantOptions, setMerchantOptions] = useState<{ id: string; name: string; phone: string | null; category: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('produits')
  const [productFilter, setProductFilter] = useState('all')
  const [orderFilter, setOrderFilter] = useState('all')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  const [productEditor, setProductEditor] = useState<Product | null | 'new'>(null)
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/marketplace-engine?limit=500', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.erreur ?? `Erreur ${res.status}`)
      setProducts(data.products ?? [])
      setOrders(data.orders ?? [])
      setSellers(data.sellers ?? [])
      setStats(data.stats ?? { totalProducts: 0, activeProducts: 0, outOfStock: 0, sellers: 0, orders: 0, pendingOrders: 0, totalVolume: 0 })
      setCategories(data.categories ?? [])
      setMerchantOptions(data.merchantOptions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredProducts = useMemo(() => products.filter((p) => {
    const q = search.trim().toLowerCase()
    return (!q || [p.name, p.seller, p.category].some((v) => v.toLowerCase().includes(q)))
      && (productFilter === 'all' || productFilter === 'moderation' ? (productFilter === 'moderation' ? p.listingStatus === 'pending_review' : true) : p.status === productFilter)
  }), [products, search, productFilter])

  const filteredOrders = useMemo(() => orders.filter((o) => {
    const q = search.trim().toLowerCase()
    return (!q || [o.id, o.buyer, o.supplier, o.productName].some((v) => v.toLowerCase().includes(q)))
      && (orderFilter === 'all' || o.status === orderFilter)
  }), [orders, search, orderFilter])

  const filteredSellers = useMemo(() => sellers.filter((s) => {
    const q = search.trim().toLowerCase()
    return !q || [s.name, s.phone ?? '', s.zone, s.category ?? ''].some((v) => v.toLowerCase().includes(q))
  }), [sellers, search])

  async function mutate(body: Record<string, unknown>) {
    setSaving(true)
    setMutationError(null)
    try {
      const res = await fetch('/api/backoffice/marketplace-engine', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.erreur ?? `Erreur ${res.status}`)
      await fetchData()
      return data
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Opération impossible')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function toggleProduct(product: Product) {
    const result = await mutate({ action: 'product', id: product.id, isActive: !product.isActive })
    if (result) setSelectedProduct(null)
  }

  async function changeOrderStatus(order: Order, nextStatus: OrderStatus) {
    const result = await mutate({ action: 'order', id: order.id, status: nextStatus })
    if (result) setSelectedOrder(null)
  }

  async function toggleSeller(seller: Seller) {
    const result = await mutate({ action: 'seller', id: seller.id, status: seller.status === 'actif' ? 'inactif' : 'actif' })
    if (result) setSelectedSeller(null)
  }

  async function saveProduct(form: { merchantId: string; name: string; category: string; priceUnit: number; imageUrl: string | null }) {
    setSaving(true)
    setMutationError(null)
    try {
      const isNew = productEditor === 'new'
      const res = await fetch('/api/backoffice/marketplace-engine', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : { action: 'product', id: (productEditor as Product).id, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.erreur ?? `Erreur ${res.status}`)
      setProductEditor(null)
      await fetchData()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Impossible d’enregistrer le produit')
    } finally {
      setSaving(false)
    }
  }

  const cardClass = isDark ? 'bg-slate-800 border border-slate-700' : 'shadow-sm'
  const textClass = isDark ? 'text-slate-100' : 'text-slate-900'
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500'

  return (
    <div className={`p-6 space-y-6 min-h-full ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      <BoPageHeader title="Marketplace" description="Produits, commandes fournisseurs et vendeurs Jùlaba" />
      <Separator />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Produits', stats.totalProducts, `${stats.outOfStock} en rupture`, Package],
          ['Vendeurs', stats.sellers, 'avec des produits référencés', Store],
          ['Commandes', stats.orders, `${stats.pendingOrders} en attente`, ShoppingCart],
          ['Volume commandes', formatFCFA(stats.totalVolume), 'commandes fournisseurs', Receipt],
        ].map(([label, value, sub, Icon]) => (
          <Card key={String(label)} className={`border-0 ${cardClass}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${mutedClass}`} />
                <p className={`text-xs uppercase tracking-wide ${mutedClass}`}>{label}</p>
              </div>
              {loading ? <Skeleton className="h-7 w-20" /> : <p className={`text-2xl font-bold ${textClass}`}>{value}</p>}
              <p className={`text-xs mt-1 ${mutedClass}`}>{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {error && <BoErrorBanner message={error} onRetry={fetchData} />}

      {!error && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <Tabs value={tab} onValueChange={(v) => { setTab(v); setSearch('') }}>
              <TabsList>
                <TabsTrigger value="produits"><Package className="h-3.5 w-3.5 mr-1.5" />Produits</TabsTrigger>
                <TabsTrigger value="commandes"><Receipt className="h-3.5 w-3.5 mr-1.5" />Commandes</TabsTrigger>
                <TabsTrigger value="vendeurs"><Store className="h-3.5 w-3.5 mr-1.5" />Vendeurs</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex gap-2 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-80">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${mutedClass}`} />
                <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={tab === 'produits' ? 'Produit, vendeur, catégorie…' : tab === 'commandes' ? 'Commande, acheteur, fournisseur…' : 'Vendeur, téléphone, zone…'} />
              </div>
              {tab === 'produits' && (
                <Button onClick={() => { setMutationError(null); setProductEditor('new') }} className="shrink-0">
                  <Plus className="h-4 w-4 mr-1.5" />Nouveau produit
                </Button>
              )}
            </div>
          </div>

          {tab === 'produits' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Filter className={`h-3.5 w-3.5 ${mutedClass}`} />
                {PRODUCT_FILTERS.map(([value, label]) => (
                  <Button key={value} size="sm" variant={productFilter === value ? 'default' : 'outline'} onClick={() => setProductFilter(value)} className="h-8 text-xs">
                    {label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {loading && Array.from({ length: 8 }).map((_, i) => <Card key={i} className={cardClass}><CardContent className="p-4"><Skeleton className="h-32 w-full rounded-lg" /><Skeleton className="h-4 w-32 mt-3" /><Skeleton className="h-3 w-24 mt-2" /></CardContent></Card>)}
                {!loading && filteredProducts.map((p) => (
                  <Card key={p.id} role="button" tabIndex={0} onClick={() => setSelectedProduct(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProduct(p) } }}
                    className={`${cardClass} cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C66A2C]`}>
                    <CardContent className="p-4">
                      <div className="relative h-32 rounded-lg mb-3 overflow-hidden bg-muted">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full flex items-center justify-center"><ImageOff className="h-8 w-8 opacity-30" /></div>}
                        <Badge className={`absolute top-2 right-2 text-[10px] ${statusClass(p.status, isDark)}`}>{statusLabel[p.status]}</Badge>
                      </div>
                      <p className={`font-semibold text-sm truncate ${textClass}`}>{p.name}</p>
                      <p className={`text-xs mt-1 truncate ${mutedClass}`}>{p.category} · {p.seller}</p>
                      <div className="flex items-center justify-between mt-3">
                        <span className={`font-bold text-sm ${textClass}`}>{formatFCFA(p.price)}</span>
                        <span className={`text-xs ${p.stock === 0 ? 'text-red-500 font-semibold' : mutedClass}`}>Stock {p.stock}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <span className={`text-[11px] ${mutedClass}`}>Ouvrir la fiche</span>
                        <ChevronRight className="h-4 w-4 opacity-50" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {!loading && !filteredProducts.length && <Empty icon={Package} text="Aucun produit trouvé" />}
              </div>
            </>
          )}

          {tab === 'commandes' && (
            <Card className={`border-0 ${cardClass}`}>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Commande</TableHead><TableHead>Marchand</TableHead><TableHead>Produit</TableHead><TableHead className="text-right">Qté</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Statut</TableHead><TableHead>Date</TableHead><TableHead /></TableRow></TableHeader>
                    <TableBody>
                      {loading && Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)}
                      {!loading && filteredOrders.map((o) => (
                        <TableRow key={o.id} role="button" tabIndex={0} className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedOrder(o)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedOrder(o) } }}>
                          <TableCell className="font-mono text-xs">{o.id.slice(0, 12)}</TableCell>
                          <TableCell className="text-xs font-medium">{o.buyer}</TableCell>
                          <TableCell className="text-xs">{o.quantity} × {o.productName}</TableCell>
                          <TableCell className="text-right text-xs">{o.quantity}</TableCell>
                          <TableCell className="text-right text-xs font-semibold">{formatFCFA(o.amount)}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${statusClass(o.status, isDark)}`}>{statusLabel[o.status]}</Badge></TableCell>
                          <TableCell className={`text-xs whitespace-nowrap ${mutedClass}`}>{formatDate(o.createdAt)}</TableCell>
                          <TableCell><ChevronRight className="h-4 w-4 opacity-40" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!loading && !filteredOrders.length && <Empty icon={Receipt} text="Aucune commande trouvée" />}
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'vendeurs' && (
            <Card className={`border-0 ${cardClass}`}>
              <CardHeader><CardTitle className={`text-base ${textClass}`}>Marchands ayant des produits référencés</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Marchand</TableHead><TableHead>Zone</TableHead><TableHead>Catégorie</TableHead><TableHead className="text-right">Produits</TableHead><TableHead className="text-right">Ventes</TableHead><TableHead className="text-right">Commandes</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
                    <TableBody>
                      {loading && Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)}
                      {!loading && filteredSellers.map((s) => (
                        <TableRow key={s.id} role="button" tabIndex={0} className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedSeller(s)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSeller(s) } }}>
                          <TableCell className="font-semibold text-xs">{s.name}</TableCell>
                          <TableCell className="text-xs">{s.zone || '—'}</TableCell>
                          <TableCell className="text-xs">{s.category || '—'}</TableCell>
                          <TableCell className="text-right text-xs">{s.productsCount}</TableCell>
                          <TableCell className="text-right text-xs font-semibold">{formatFCFA(s.totalSales)}</TableCell>
                          <TableCell className="text-right text-xs">{s.ordersCount}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${statusClass(s.status === 'actif' ? 'en_stock' : 'inactif', isDark)}`}>{s.status}</Badge></TableCell>
                          <TableCell><ChevronRight className="h-4 w-4 opacity-40" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!loading && !filteredSellers.length && <Empty icon={Store} text="Aucun vendeur trouvé" />}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ProductDialog product={selectedProduct} saving={saving} error={mutationError}
        onClose={() => { setSelectedProduct(null); setMutationError(null) }}
        onEdit={(p) => { setSelectedProduct(null); setMutationError(null); setProductEditor(p) }}
        onToggle={toggleProduct} onModerate={moderateListing} />

      <OrderDialog order={selectedOrder} saving={saving} error={mutationError}
        onClose={() => { setSelectedOrder(null); setMutationError(null) }}
        onStatus={changeOrderStatus} />

      <SellerDialog seller={selectedSeller} saving={saving} error={mutationError}
        products={products.filter((p) => p.merchantId === selectedSeller?.id)}
        onClose={() => { setSelectedSeller(null); setMutationError(null) }}
        onToggle={toggleSeller} />

      <ProductEditorDialog editor={productEditor} sellers={merchantOptions} categories={categories} saving={saving} error={mutationError}
        onClose={() => { setProductEditor(null); setMutationError(null) }}
        onSave={saveProduct} />
    </div>
  )
}

function Empty({ icon: Icon, text }: { icon: typeof Package; text: string }) {
  return <div className="col-span-full py-14 text-center text-muted-foreground"><Icon className="h-10 w-10 mx-auto mb-2 opacity-40" /><p className="text-sm">{text}</p></div>
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ProductDialog({ product, saving, error, onClose, onEdit, onToggle }: {
  product: Product | null
  saving: boolean
  error: string | null
  onClose: () => void
  onEdit: (p: Product) => void
  onToggle: (p: Product) => void
  onModerate: (p: Product, status: ListingStatus) => void
}) {
  return <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg">
      {product && <>
        <DialogHeader>
          <DialogTitle>Fiche produit</DialogTitle>
          <DialogDescription>{product.name} · {product.category}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="h-48 rounded-lg overflow-hidden bg-muted">
            {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full flex items-center justify-center"><ImageOff className="h-12 w-12 opacity-25" /></div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Info label="Prix unitaire" value={formatFCFA(product.price)} />
            <Info label="Stock" value={String(product.stock)} />
            <Info label="Vendeur" value={product.seller} />
            <Info label="Téléphone" value={product.sellerPhone || '—'} />
            <Info label="Catégorie vendeur" value={product.sellerCategory || '—'} />
            <Info label="Statut catalogue" value={statusLabel[product.status]} />
            <Info label="Modération" value={statusLabel[product.listingStatus] ?? product.listingStatus} />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
          {product.listingStatus === 'pending_review' && <Button onClick={() => onModerate(product, 'published')} disabled={saving}><Check className="h-4 w-4 mr-1.5" />Publier</Button>}
          {product.listingStatus === 'published' && <Button variant="outline" onClick={() => onModerate(product, 'suspended')} disabled={saving}>Suspendre</Button>}
          {(product.listingStatus === 'suspended' || product.listingStatus === 'draft') && <Button variant="outline" onClick={() => onModerate(product, 'pending_review')} disabled={saving}>Envoyer en modération</Button>}
          <Button variant="outline" onClick={() => onToggle(product)} disabled={saving}>
            {product.isActive ? <><X className="h-4 w-4 mr-1.5" />Désactiver</> : <><Check className="h-4 w-4 mr-1.5" />Activer</>}
          </Button>
          <div className="flex gap-2"><Button variant="outline" onClick={() => onClose()}>Fermer</Button><Button onClick={() => onEdit(product)} disabled={saving}><Edit3 className="h-4 w-4 mr-1.5" />Modifier</Button></div>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>
}

function OrderDialog({ order, saving, error, onClose, onStatus }: {
  order: Order | null
  saving: boolean
  error: string | null
  onClose: () => void
  onStatus: (order: Order, status: OrderStatus) => void
}) {
  return <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg">
      {order && <>
        <DialogHeader><DialogTitle>Commande {order.id.slice(0, 12)}</DialogTitle><DialogDescription>Détail et traitement de la commande fournisseur</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Marchand" value={order.buyer} />
            <Info label="Téléphone" value={order.buyerPhone || '—'} />
            <Info label="Fournisseur" value={order.supplier} />
            <Info label="Produit" value={order.productName} />
            <Info label="Quantité" value={String(order.quantity)} />
            <Info label="Prix unitaire" value={formatFCFA(order.unitPrice)} />
            <Info label="Montant" value={formatFCFA(order.amount)} />
            <Info label="Statut" value={statusLabel[order.status]} />
          </div>
          {order.note && <div className="rounded-lg bg-muted p-3 text-sm"><span className="font-semibold">Note : </span>{order.note}</div>}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {ORDER_TRANSITIONS[order.status].map((next) => (
              <Button key={next} variant={next === 'annulee' ? 'outline' : 'default'} onClick={() => onStatus(order, next)} disabled={saving}>
                {next === 'livree' ? <Check className="h-4 w-4 mr-1.5" /> : next === 'annulee' ? <X className="h-4 w-4 mr-1.5" /> : <ShoppingCart className="h-4 w-4 mr-1.5" />}
                {next === 'confirmee' ? 'Confirmer' : next === 'livree' ? 'Réceptionner' : 'Annuler'}
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>
}

function SellerDialog({ seller, products, saving, error, onClose, onToggle }: {
  seller: Seller | null
  products: Product[]
  saving: boolean
  error: string | null
  onClose: () => void
  onToggle: (s: Seller) => void
}) {
  return <Dialog open={!!seller} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-xl">
      {seller && <>
        <DialogHeader><DialogTitle>Fiche vendeur</DialogTitle><DialogDescription>{seller.name}{seller.zone ? ` · ${seller.zone}` : ''}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Info label="Produits" value={String(seller.productsCount)} />
            <Info label="Ventes" value={formatFCFA(seller.totalSales)} />
            <Info label="Commandes" value={String(seller.ordersCount)} />
            <Info label="Téléphone" value={seller.phone || '—'} />
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Produits du vendeur</p>
            <div className="space-y-2 max-h-56 overflow-auto">
              {products.length ? products.map((p) => <div key={p.id} className="flex items-center justify-between rounded-lg border p-2.5"><span className="text-sm truncate">{p.name}</span><span className="text-xs font-semibold">{formatFCFA(p.price)}</span></div>) : <p className="text-sm text-muted-foreground">Aucun produit.</p>}
            </div>
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
          <Button variant="outline" onClick={() => onToggle(seller)} disabled={saving}>{seller.status === 'actif' ? 'Désactiver le vendeur' : 'Activer le vendeur'}</Button>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>
}

function ProductEditorDialog({ editor, sellers, categories, saving, error, onClose, onSave }: {
  editor: Product | null | 'new'
  sellers: { id: string; name: string; phone: string | null; category: string | null }[]
  categories: string[]
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (form: { merchantId: string; name: string; category: string; priceUnit: number; imageUrl: string | null }) => void
}) {
  const [merchantId, setMerchantId] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    if (!editor) return
    if (editor === 'new') {
      setMerchantId(sellers[0]?.id ?? '')
      setName('')
      setCategory(categories[0] ?? 'autre')
      setPrice('')
      setImageUrl('')
    } else {
      setMerchantId(editor.merchantId)
      setName(editor.name)
      setCategory(editor.category)
      setPrice(String(editor.price))
      setImageUrl(editor.imageUrl ?? '')
    }
  }, [editor, sellers, categories])

  return <Dialog open={editor !== null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{editor === 'new' ? 'Nouveau produit' : 'Modifier le produit'}</DialogTitle><DialogDescription>Les données sont enregistrées côté serveur.</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <label className="text-sm font-medium">Vendeur<select className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} disabled={editor !== 'new'}><option value="">Sélectionner</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="text-sm font-medium">Nom<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Tomates" /></label>
        <label className="text-sm font-medium">Catégorie<select className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}><option value="autre">autre</option>{categories.filter((c) => c !== 'autre').map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="text-sm font-medium">Prix unitaire (FCFA)<Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="text-sm font-medium">URL image (facultatif)<Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></label>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button><Button disabled={saving || !merchantId || !name.trim() || !Number.isFinite(Number(price))} onClick={() => onSave({ merchantId, name: name.trim(), category: category || 'autre', priceUnit: Math.round(Number(price)), imageUrl: imageUrl.trim() || null })}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-sm font-semibold mt-0.5 break-words">{value}</p></div>
}
