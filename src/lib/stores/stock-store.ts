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
  fetchProducts: (merchantId?: string) => Promise<void>
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>
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
      fetchProducts: async (merchantId = 'merchant-1') => {
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
      addProduct: async (product) => {
        set({ loading: true, error: null })
        const clientId = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const productWithClientId = { ...product, clientId }
        try {
          const res = await fetch('/api/marchand/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productWithClientId),
          })
          if (!res.ok) throw new Error(`Failed to add product: ${res.status}`)
          await get().fetchProducts()
        } catch {
          // Offline or the server is unreachable — queue it instead of
          // losing the product, and show it locally right away so the
          // merchant isn't blocked from adding stock without a connection.
          // The sync-handlers.ts 'product' handler flushes this once online.
          await queuePendingSync('product', productWithClientId)
          set((s) => ({
            products: [...s.products, { ...product, id: `pending-${Date.now()}` }],
            loading: false,
          }))
        }
      },
      updateProduct: async (id, updates) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`/api/marchand/products?id=${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          })
          if (!res.ok) throw new Error(`Failed to update product: ${res.status}`)
          const updated = await res.json()
          set((s) => ({
            products: s.products.map((p) => p.id === id ? { ...p, ...updated } : p),
            loading: false,
          }))
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
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
      partialize: (state) => ({ products: state.products }),
      onRehydrateStorage: () => (state) => {
        if (state) state.fetchProducts()
      },
    }
  )
)