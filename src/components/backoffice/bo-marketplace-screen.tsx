'use client'

import { useState, useMemo } from 'react'
import {
  Search,
  ShoppingCart,
  Package,
  Store,
  Receipt,
  ImageOff,
  Filter,
  Star,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type ProductStatus = 'en_stock' | 'rupture' | 'inactif'
type OrderStatus = 'en_attente' | 'confirmee' | 'expediee' | 'livree' | 'annulee'

interface Product {
  id: string
  name: string
  price: number
  stock: number
  status: ProductStatus
  seller: string
  category: string
  color: string
  createdAt: string
}

interface Order {
  id: string
  buyer: string
  items: number
  amount: number
  status: OrderStatus
  createdAt: string
}

interface Seller {
  id: string
  name: string
  zone: string
  productsCount: number
  totalSales: number
  rating: number
  status: 'actif' | 'inactif'
}

// ============== MOCK DATA ==============

const PRODUCTS: Product[] = [
  { id: 'prod-1', name: 'Riz 25kg local', price: 12500, stock: 45, status: 'en_stock', seller: 'Awa KOUASSI', category: 'Céréales', color: '#D97706', createdAt: '2026-08-20T10:00:00Z' },
  { id: 'prod-2', name: 'Huile de palme 5L', price: 4500, stock: 120, status: 'en_stock', seller: 'Ibrahim DIABY', category: 'Huiles', color: '#059669', createdAt: '2026-08-18T14:00:00Z' },
  { id: 'prod-3', name: 'Poisson fumé 1kg', price: 3500, stock: 0, status: 'rupture', seller: 'Paul BAMBA', category: 'Poissons', color: '#DC2626', createdAt: '2026-08-15T08:00:00Z' },
  { id: 'prod-4', name: 'Igname 10kg', price: 6000, stock: 30, status: 'en_stock', seller: 'Coopérative Akwaba', category: 'Tubercules', color: '#16A34A', createdAt: '2026-08-22T11:00:00Z' },
  { id: 'prod-5', name: 'Café moulu 500g', price: 2800, stock: 67, status: 'en_stock', seller: 'Traoré Moussa', category: 'Boissons', color: '#92400E', createdAt: '2026-08-10T09:00:00Z' },
  { id: 'prod-6', name: 'Attieké 2kg', price: 2000, stock: 0, status: 'inactif', seller: 'Fatoumata TRAORÉ', category: 'Céréales', color: '#6B7280', createdAt: '2026-07-01T10:00:00Z' },
  { id: 'prod-7', name: 'Pâte d\'arachide 500g', price: 1800, stock: 85, status: 'en_stock', seller: 'Awa KOUASSI', category: 'Condiments', color: '#D97706', createdAt: '2026-08-25T08:00:00Z' },
  { id: 'prod-8', name: 'Banane plantain 5kg', price: 3200, stock: 20, status: 'en_stock', seller: 'Koné Aminata', category: 'Fruits', color: '#16A34A', createdAt: '2026-08-24T16:00:00Z' },
  { id: 'prod-9', name: 'Sel gemme 1kg', price: 800, stock: 200, status: 'en_stock', seller: 'Ibrahim DIABY', category: 'Condiments', color: '#6B7280', createdAt: '2026-08-12T10:00:00Z' },
  { id: 'prod-10', name: 'Poulet entier (gros)', price: 5500, stock: 12, status: 'en_stock', seller: 'Soro Marie', category: 'Viandes', color: '#DC2626', createdAt: '2026-08-26T09:00:00Z' },
  { id: 'prod-11', name: 'Maïs moulu 2kg', price: 1500, stock: 0, status: 'rupture', seller: 'Traoré Moussa', category: 'Céréales', color: '#D97706', createdAt: '2026-08-19T14:00:00Z' },
  { id: 'prod-12', name: 'Savon artisanal x3', price: 2200, stock: 55, status: 'en_stock', seller: 'Coopérative Kwa', category: 'Hygiène', color: '#059669', createdAt: '2026-08-23T11:00:00Z' },
]

const ORDERS: Order[] = [
  { id: 'ORD-2026082701', buyer: 'Kouadio Jean', items: 3, amount: 23500, status: 'en_attente', createdAt: '2026-08-27T14:00:00Z' },
  { id: 'ORD-2026082702', buyer: 'Fatou SORO', items: 1, amount: 12500, status: 'confirmee', createdAt: '2026-08-27T13:30:00Z' },
  { id: 'ORD-2026082703', buyer: 'Diaby Ibrahim', items: 2, amount: 9500, status: 'expediee', createdAt: '2026-08-27T12:00:00Z' },
  { id: 'ORD-2026082704', buyer: 'Bamba Fatou', items: 5, amount: 41200, status: 'livree', createdAt: '2026-08-27T10:00:00Z' },
  { id: 'ORD-2026082601', buyer: 'Jean KOUADIO', items: 1, amount: 3500, status: 'annulee', createdAt: '2026-08-26T16:00:00Z' },
  { id: 'ORD-2026082602', buyer: 'Mariam CAMARA', items: 4, amount: 18700, status: 'livree', createdAt: '2026-08-26T14:30:00Z' },
  { id: 'ORD-2026082603', buyer: 'Awa DIALLO', items: 2, amount: 8900, status: 'expediee', createdAt: '2026-08-26T11:00:00Z' },
  { id: 'ORD-2026082501', buyer: 'Yao KONAN', items: 6, amount: 55000, status: 'livree', createdAt: '2026-08-25T15:00:00Z' },
  { id: 'ORD-2026082502', buyer: 'Affi COULIBALY', items: 1, amount: 2800, status: 'confirmee', createdAt: '2026-08-25T09:00:00Z' },
]

const SELLERS: Seller[] = [
  { id: 'sel-1', name: 'Awa KOUASSI', zone: 'Adjamé', productsCount: 18, totalSales: 4250000, rating: 4.7, status: 'actif' },
  { id: 'sel-2', name: 'Ibrahim DIABY', zone: 'Bouaké', productsCount: 12, totalSales: 2890000, rating: 4.5, status: 'actif' },
  { id: 'sel-3', name: 'Paul BAMBA', zone: 'Yopougon', productsCount: 24, totalSales: 6340000, rating: 4.9, status: 'actif' },
  { id: 'sel-4', name: 'Coopérative Akwaba', zone: 'Kong', productsCount: 8, totalSales: 1456000, rating: 4.2, status: 'actif' },
  { id: 'sel-5', name: 'Koné Aminata', zone: 'Cocody', productsCount: 6, totalSales: 980000, rating: 4.8, status: 'actif' },
  { id: 'sel-6', name: 'Soro Marie', zone: 'Plateau', productsCount: 10, totalSales: 1670000, rating: 4.3, status: 'actif' },
  { id: 'sel-7', name: 'Traoré Moussa', zone: 'Daloa', productsCount: 7, totalSales: 1230000, rating: 4.0, status: 'inactif' },
]

const PRODUCT_STATUSES: { value: string; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'en_stock', label: 'En stock' },
  { value: 'rupture', label: 'Rupture' },
  { value: 'inactif', label: 'Inactif' },
]

const ORDER_STATUSES: { value: string; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'confirmee', label: 'Confirmée' },
  { value: 'expediee', label: 'Expédiée' },
  { value: 'livree', label: 'Livrée' },
  { value: 'annulee', label: 'Annulée' },
]

// ============== MAIN COMPONENT ==============

export function BoMarketplaceScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const productStatusConfig: Record<ProductStatus, { label: string; color: string }> = {
    en_stock: { label: 'En stock', color: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700' },
    rupture: { label: 'Rupture', color: isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700' },
    inactif: { label: 'Inactif', color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600' },
  }

  const orderStatusConfig: Record<OrderStatus, { label: string; color: string }> = {
    en_attente: { label: 'En attente', color: isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700' },
    confirmee: { label: 'Confirmée', color: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700' },
    expediee: { label: 'Expédiée', color: isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-700' },
    livree: { label: 'Livrée', color: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700' },
    annulee: { label: 'Annulée', color: isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700' },
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('produits')
  const [productStatusFilter, setProductStatusFilter] = useState('all')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')

  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter((p) => {
      const matchSearch = !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.seller.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = productStatusFilter === 'all' || p.status === productStatusFilter
      return matchSearch && matchStatus
    })
  }, [searchQuery, productStatusFilter])

  const filteredOrders = useMemo(() => {
    return ORDERS.filter((o) => {
      const matchSearch = !searchQuery ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.buyer.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter
      return matchSearch && matchStatus
    })
  }, [searchQuery, orderStatusFilter])

  const formatPrice = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`
  const formatDateTime = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
          <span className="inline-flex items-center gap-2"><ShoppingCart className="h-6 w-6" />MARKETPLACE</span>
        </h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Gestion du marché virtuel Jùlaba : produits, commandes et vendeurs
        </p>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Produits</p>
            </div>
            <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>1 240</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>12 en rupture de stock</p>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Store className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vendeurs actifs</p>
            </div>
            <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>85</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>3 nouveaux ce mois</p>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Commandes</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">67</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>8 en attente de traitement</p>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Volume total</p>
            </div>
            <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>2.8M FCFA</p>
            <p className="text-xs text-emerald-500 mt-0.5 font-medium">+12% vs mois dernier</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Search + Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearchQuery('') }}>
            <TabsList>
              <TabsTrigger value="produits" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Produits</TabsTrigger>
              <TabsTrigger value="commandes" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> Commandes</TabsTrigger>
              <TabsTrigger value="vendeurs" className="gap-1.5"><Store className="h-3.5 w-3.5" /> Vendeurs</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:max-w-xs">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            <Input
              placeholder={activeTab === 'produits' ? 'Rechercher produit, vendeur...' : activeTab === 'commandes' ? 'Rechercher ID, acheteur...' : 'Rechercher vendeur...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-2">
          <Filter className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          {activeTab === 'produits' && (
            <div className="flex flex-wrap gap-1.5">
              {PRODUCT_STATUSES.map((s) => (
                <Button
                  key={s.value}
                  variant={productStatusFilter === s.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setProductStatusFilter(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          )}
          {activeTab === 'commandes' && (
            <div className="flex flex-wrap gap-1.5">
              {ORDER_STATUSES.map((s) => (
                <Button
                  key={s.value}
                  variant={orderStatusFilter === s.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setOrderStatusFilter(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          )}
          {activeTab === 'vendeurs' && (
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Utilisez la recherche pour filtrer</span>
          )}
        </div>
      </div>

      {/* Products Tab */}
      {activeTab === 'produits' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((prod) => {
            const sc = productStatusConfig[prod.status]
            return (
              <Card key={prod.id} className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border hover:shadow-none' : 'shadow-sm hover:shadow-md'} transition-shadow`}>
                <CardContent className="p-4">
                  {/* Image placeholder */}
                  <div className="w-full h-28 rounded-lg mb-3 flex items-center justify-center" style={{ backgroundColor: prod.color + '15' }}>
                    <ImageOff className="h-8 w-8" style={{ color: prod.color, opacity: 0.4 }} />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{prod.name}</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{prod.category} · {prod.seller}</p>
                    <div className="flex items-center justify-between mt-2.5">
                      <p className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatPrice(prod.price)}</p>
                      <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${sc.color}`}>{sc.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Stock : <span className={prod.stock === 0 ? 'text-red-500 font-semibold' : `${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{prod.stock}</span> unités</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {filteredProducts.length === 0 && (
            <div className={`col-span-full text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucun produit trouvé</p>
            </div>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === 'commandes' && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">ID Commande</TableHead>
                    <TableHead className="text-xs">Acheteur</TableHead>
                    <TableHead className="text-xs text-right">Articles</TableHead>
                    <TableHead className="text-xs text-right">Montant</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const osc = orderStatusConfig[order.status]
                    return (
                      <TableRow key={order.id}>
                        <TableCell className={`text-xs py-3 font-mono font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{order.id}</TableCell>
                        <TableCell className="text-xs py-3 font-medium">{order.buyer}</TableCell>
                        <TableCell className={`text-xs py-3 text-right ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{order.items}</TableCell>
                        <TableCell className={`text-xs py-3 text-right font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatPrice(order.amount)}</TableCell>
                        <TableCell className="py-3">
                          <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${osc.color}`}>{osc.label}</Badge>
                        </TableCell>
                        <TableCell className={`text-xs py-3 whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{formatDateTime(order.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {filteredOrders.length === 0 && (
              <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucune commande trouvée</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sellers Tab */}
      {activeTab === 'vendeurs' && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Vendeur</TableHead>
                    <TableHead className="text-xs">Zone</TableHead>
                    <TableHead className="text-xs text-right">Produits</TableHead>
                    <TableHead className="text-xs text-right">Ventes totales</TableHead>
                    <TableHead className="text-xs text-right">Note</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SELLERS.filter((s) => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell className={`text-xs py-3 font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{seller.name}</TableCell>
                      <TableCell className={`text-xs py-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{seller.zone}</TableCell>
                      <TableCell className="text-xs py-3 text-right tabular-nums">{seller.productsCount}</TableCell>
                      <TableCell className={`text-xs py-3 text-right font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatPrice(seller.totalSales)}</TableCell>
                      <TableCell className="text-xs py-3 text-right">
                        <span className="text-amber-600 font-semibold inline-flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />{seller.rating}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${seller.status === 'actif' ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : (isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600')}`}>
                          {seller.status === 'actif' ? 'Actif' : 'Inactif'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}