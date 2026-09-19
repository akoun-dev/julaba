import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queuePendingSync } from '@/lib/offline-db'
import { notify } from '@/lib/notifications/triggers'
import { productAddedInput, stockLowInput, stockOutOfStockInput, restockRecordedInput } from '@/lib/notifications/events'
import type { ProductUnitConfig } from '@/lib/stock/units'

export interface Product {
  id: string
  name: string
  category: string
  priceUnit: number
  stockQty: number
  imageUrl?: string
  isActive: boolean
}

/** Seuil par défaut quand le marchand n'a rien configuré — le « < 10 »
 * historique devient UNE valeur de repli, plus une loi gravée dans le
 * code (STK-806 : seuils paramétrables par produit). */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10

/** Alerte de niveau de stock après une modification — best-effort, dédupliquée
 * par produit+jour (stockLowInput) : un marchand qui vend dix fois le même
 * article ne doit pas recevoir dix fois la même alerte. Un réapprovisionnement
 * (quantité en hausse) produit un succès, jamais un avertissement. Le seuil
 * est lu par produit (STK-806), plus jamais en dur. */
function notifyStockLevel(
  productId: string,
  oldQty: number | undefined,
  newQty: number | undefined,
  name: string | undefined,
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): void {
  if (newQty === undefined || newQty === null) return
  const productName = name ?? 'un produit'
  if (oldQty !== undefined && newQty > oldQty) {
    void notify(restockRecordedInput({ productId, productName, quantity: newQty - oldQty }))
    return
  }
  if (newQty <= 0) {
    void notify(stockOutOfStockInput({ productId, productName }))
  } else if (newQty < threshold) {
    void notify(stockLowInput({ productId, productName, quantity: newQty }))
  }
}

interface StockState {
  products: Product[]
  loading: boolean
  error: string | null
  /** Unités commerciales par productId (STK-806 — conversion « sac → kg »
   * par produit/marchand). Source : /api/marchand/stock/units. */
  unitsByProduct: Record<string, ProductUnitConfig>
  /** Seuil d'alerte par productId (STK-806) — sinon DEFAULT_LOW_STOCK_THRESHOLD. */
  thresholdsByProduct: Record<string, number>
  setProducts: (products: Product[]) => void
  fetchProducts: (merchantId: string) => Promise<void>
  /** Charge la configuration stock du marchand : unités commerciales
   * (conversions) + seuils d'alerte par produit. Best-effort : en cas
   * d'échec réseau on garde l'existant, jamais de crash UI. */
  loadStockConfig: (merchantId: string) => Promise<void>
  getUnitConfig: (productId: string) => ProductUnitConfig | null
  getLowStockThreshold: (productId: string) => number
  addProduct: (merchantId: string, product: Omit<Product, 'id'>) => Promise<void>
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>
  /** Projection locale pure (STK-804/805) : applique un delta de stock
   * SANS aucun appel réseau. Après bascule sur les RPC, le stock serveur
   * est décrémenté par PostgreSQL (double écriture D3) — écrire ici une
   * valeur absolue via updateProduct (PATCH) écraserait la vérité serveur
   * avec une valeur locale potentiellement périmée. Le delta local garde
   * l'UI à jour ; le prochain fetchProducts réaligne tout. */
  adjustLocalStock: (id: string, delta: number) => void
  deleteProduct: (id: string) => Promise<void>
  getProduct: (id: string) => Product | undefined
  getProductByName: (name: string) => Product | undefined
  getLowStockProducts: () => Product[]
  getTopSelling: () => Product[]
}

export const useStockStore = create<StockState>()(
  persist(
    (set, get) => ({
      products: [],
      loading: false,
      error: null,
      unitsByProduct: {},
      thresholdsByProduct: {},
      setProducts: (products) => set({ products }),
      loadStockConfig: async (merchantId) => {
        try {
          const [unitsRes, balanceRes] = await Promise.all([
            fetch(`/api/marchand/stock/units?merchantId=${merchantId}`),
            fetch(`/api/marchand/stock/balance?merchantId=${merchantId}`),
          ])
          const unitsByProduct: Record<string, ProductUnitConfig> = {}
          if (unitsRes.ok) {
            const data = await unitsRes.json()
            for (const [productId, list] of Object.entries(data.byProduct ?? {})) {
              unitsByProduct[productId] = list as ProductUnitConfig
            }
          }
          const thresholdsByProduct: Record<string, number> = {}
          if (balanceRes.ok) {
            const data = await balanceRes.json()
            for (const b of (data.balances ?? []) as Array<{ productId: string; lowStockThreshold: number | null }>) {
              if (b.lowStockThreshold != null) thresholdsByProduct[b.productId] = b.lowStockThreshold
            }
          }
          set({ unitsByProduct, thresholdsByProduct })
        } catch {
          // Réseau indisponible : la config précédente reste en place.
        }
      },
      getUnitConfig: (productId) => get().unitsByProduct[productId] ?? null,
      getLowStockThreshold: (productId) =>
        get().thresholdsByProduct[productId] ?? DEFAULT_LOW_STOCK_THRESHOLD,
      fetchProducts: async (merchantId) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`/api/marchand/products?merchantId=${merchantId}`)
          if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`)
          const data = await res.json()
          const products: Product[] = (data.products ?? data).map((p: Record<string, unknown>) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            priceUnit: p.priceUnit,
            stockQty: p.stockQty,
            imageUrl: p.imageUrl,
            isActive: p.isActive ?? true,
          }))
          set({ products, loading: false })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },
      addProduct: async (merchantId, product) => {
        set({ loading: true, error: null })
        const clientId = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const productWithClientId = { ...product, merchantId, clientId }
        try {
          const res = await fetch('/api/marchand/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productWithClientId),
          })
          if (!res.ok) throw new Error(`Failed to add product: ${res.status}`)
          await get().fetchProducts(merchantId)
          // Notification in-app : produit ajouté (best-effort).
          void notify(productAddedInput(product.name))
        } catch {
          // Offline or the server is unreachable — queue it instead of
          // losing the product, and show it locally right away so the
          // merchant isn't blocked from adding stock without a connection.
          const queued = await queuePendingSync('product', productWithClientId)
          if (!queued.ok) {
            // Neither the live request nor the offline queue worked — the
            // product genuinely doesn't exist anywhere. Don't show it
            // locally as if it did.
            set({ error: 'Produit non enregistré. Réessayez.', loading: false })
            return
          }
          set((s) => ({
            products: [...s.products, { ...product, id: `pending-${Date.now()}` }],
            loading: false,
          }))
        }
      },
      updateProduct: async (id, updates) => {
        set({ loading: true, error: null })
        const previous = get().products.find((p) => p.id === id)
        // Apply locally first (covers restock and price/stock edits — both
        // reachable without a connection) so the merchant sees the change
        // immediately regardless of network state.
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }))
        try {
          const res = await fetch(`/api/marchand/products?id=${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          })
          if (!res.ok) throw new Error(`Failed to update product: ${res.status}`)
          const updated = await res.json()
          set((s) => ({
            products: s.products.map((p) => (p.id === id ? { ...p, ...updated } : p)),
            loading: false,
          }))
          notifyStockLevel(id, previous?.stockQty, updated?.stockQty, updated?.name ?? previous?.name)
        } catch {
          // A pending-* product (created offline, never actually reached the
          // server) has no real id to PATCH — nothing to queue, the create
          // itself is still queued and will carry the final values.
          if (id.startsWith('pending-')) {
            set({ loading: false })
            return
          }
          const queued = await queuePendingSync('product-update', { id, updates })
          if (!queued.ok) {
            // Neither the live request nor the offline queue worked — roll
            // back the optimistic local update instead of leaving the
            // merchant looking at a stock/price value nothing recorded.
            set((s) => ({
              products: previous ? s.products.map((p) => (p.id === id ? previous : p)) : s.products,
              error: 'Modification non enregistrée. Réessayez.',
              loading: false,
            }))
            return
          }
          set({ loading: false })
        }
        // Hors ligne : la valeur locale fait foi pour l'alerte de stock
        // (le marchand voit son niveau réel, pas celui du serveur).
        notifyStockLevel(id, previous?.stockQty, updates.stockQty, previous?.name)
      },
      adjustLocalStock: (id, delta) => {
        const previous = get().products.find((p) => p.id === id)
        if (!previous) return
        const newQty = Math.max(0, previous.stockQty + delta)
        if (newQty === previous.stockQty) return
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, stockQty: newQty } : p)),
        }))
        // Alerte best-effort sur la projection locale (le marchand voit
        // son niveau réel, pas celui du serveur) — dédupliquée par
        // produit+jour dans notify(). Seuil paramétrable (STK-806).
        notifyStockLevel(id, previous.stockQty, newQty, previous.name, get().getLowStockThreshold(id))
      },
      deleteProduct: async (id) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`/api/marchand/products?id=${id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error(`Failed to delete product: ${res.status}`)
          set((s) => ({
            products: s.products.filter((p) => p.id !== id),
            loading: false,
          }))
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },
      getProduct: (id) => get().products.find((p) => p.id === id),
      getProductByName: (name) => {
        const lower = name.toLowerCase()
        return get().products.find(
          (p) => p.name.toLowerCase() === lower || p.name.toLowerCase().includes(lower)
        )
      },
      getLowStockProducts: () => {
        const { products, thresholdsByProduct } = get()
        return products.filter((p) => p.stockQty < (thresholdsByProduct[p.id] ?? DEFAULT_LOW_STOCK_THRESHOLD))
      },
      getTopSelling: () => {
        const sorted = [...get().products]
          .filter((p) => p.isActive)
          .sort((a, b) => b.stockQty - a.stockQty)
        return sorted.slice(0, 2)
      },
    }),
    {
      name: 'julaba-stock-store',
       // Products are always read from the Supabase-backed API.
       partialize: () => ({}),
      // No onRehydrateStorage fetch here on purpose: this store doesn't know
      // the signed-in merchantId (that lives in app-store), and calling
      // fetchProducts without it used to silently default to the seeded
      // demo account ('merchant-1') for every real user. The mount effect in
      // stock-screen.tsx does the real fetch once it has the actual id.
    }
  )
)
