'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
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
import { formatFCFA } from '@/lib/utils'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

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

  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/marketplace')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setProducts(data.products ?? [])
      setOrders(data.orders ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.seller.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = productStatusFilter === 'all' || p.status === productStatusFilter
      return matchSearch && matchStatus
    })
  }, [products, searchQuery, productStatusFilter])

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch = !searchQuery ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.buyer.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter
      return matchSearch && matchStatus
    })
  }, [orders, searchQuery, orderStatusFilter])


  const formatDateTime = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Header */}
      <BoPageHeader
        title="Marketplace"
        description="Gestion du marché virtuel Jùlaba : produits, commandes et vendeurs"
      />

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-7 w-16 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-3 w-32 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Package className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Produits</p>
                </div>
                <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{products.length.toLocaleString('fr-FR')}</p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{products.filter(p => p.status === 'rupture').length} en rupture de stock</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-7 w-10 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-3 w-28 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Store className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vendeurs actifs</p>
                </div>
                <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{new Set(products.map(p => p.seller)).size}</p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Ce mois</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-7 w-10 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-3 w-36 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Commandes</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{orders.length}</p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{orders.filter(o => o.status === 'en_attente').length} en attente de traitement</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-7 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-3 w-32 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Volume total</p>
                </div>
                <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatFCFA(orders.reduce((s, o) => s + o.amount, 0))}</p>
                <p className="text-xs text-emerald-500 mt-0.5 font-medium">Total commandes</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error State */}
      {error && <BoErrorBanner message={error} onRetry={fetchData} />}

      {/* Tabs + Search + Filters */}
      {!error && (
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
      )}

      {/* Products Tab */}
      {!error && activeTab === 'produits' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'}`}>
              <CardContent className="p-4">
                <Skeleton className={`w-full h-28 rounded-lg mb-3 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-4 w-32 mb-1 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-3 w-24 mb-2 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-4 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </CardContent>
            </Card>
          ))}
          {!loading && filteredProducts.map((prod) => {
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
                      <p className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatFCFA(prod.price)}</p>
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
          {!loading && filteredProducts.length === 0 && (
            <div className={`col-span-full text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucun produit trouvé</p>
            </div>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {!error && activeTab === 'commandes' && (
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
                  {loading && Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-32 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-8 ml-auto ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-20 ml-auto ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-5 w-16 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                    </TableRow>
                  ))}
                  {!loading && filteredOrders.map((order) => {
                    const osc = orderStatusConfig[order.status]
                    return (
                      <TableRow key={order.id}>
                        <TableCell className={`text-xs py-3 font-mono font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{order.id}</TableCell>
                        <TableCell className="text-xs py-3 font-medium">{order.buyer}</TableCell>
                        <TableCell className={`text-xs py-3 text-right ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{order.items}</TableCell>
                        <TableCell className={`text-xs py-3 text-right font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatFCFA(order.amount)}</TableCell>
                        <TableCell className="py-3">
                          <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${osc.color}`}>{osc.label}</Badge>
                        </TableCell>
                        <TableCell className={`text-xs py-3 whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{formatDateTime(order.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {!loading && filteredOrders.length === 0 && (
                <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Aucune commande trouvée</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sellers Tab */}
      {!error && activeTab === 'vendeurs' && (
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
                  {loading && Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-32 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-8 ml-auto ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-24 ml-auto ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-12 ml-auto ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-5 w-14 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                    </TableRow>
                  ))}
                  {!loading && (() => {
                    const sellerMap = new Map<string, { name: string; zone: string; productsCount: number; totalSales: number; rating: number; status: 'actif' | 'inactif' }>()
                    products.forEach(p => {
                      const existing = sellerMap.get(p.seller) || { name: p.seller, zone: '', productsCount: 0, totalSales: 0, rating: 0, status: 'actif' as const }
                      existing.productsCount++
                      sellerMap.set(p.seller, existing)
                    })
                    const sellers = Array.from(sellerMap.values())
                    const filteredSellers = sellers.filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    return filteredSellers.map((seller, idx) => (
                      <TableRow key={seller.name}>
                        <TableCell className={`text-xs py-3 font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{seller.name}</TableCell>
                        <TableCell className={`text-xs py-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{seller.zone}</TableCell>
                        <TableCell className="text-xs py-3 text-right tabular-nums">{seller.productsCount}</TableCell>
                        <TableCell className={`text-xs py-3 text-right font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatFCFA(seller.totalSales)}</TableCell>
                        <TableCell className="text-xs py-3 text-right">
                          <span className="text-amber-600 font-semibold inline-flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />{seller.rating || '—'}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${seller.status === 'actif' ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : (isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600')}`}>
                            {seller.status === 'actif' ? 'Actif' : 'Inactif'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  })()}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}