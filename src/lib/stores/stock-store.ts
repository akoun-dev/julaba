import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queuePendingSync } from '@/lib/offline-db'

export interface Product {
  id: string
  name: string
  category: string
  priceUnit: number
  stockQty: number
  imageUrl?: string
  isActive: boolean
}

interface StockState {
  products: Product[]
  loading: boolean
  error: string | null
  setProducts: (products: Product[]) => void
  fetchProducts: (merchantId: string) => Promise<void>
  addProduct: (merchantId: string, product: Omit<Product, 'id'>) => Promise<void>
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>
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
      setProducts: (products) => set({ products }),
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
      getLowStockProducts: () => get().products.filter((p) => p.stockQty < 10),
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
