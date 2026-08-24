import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  setProducts: (products: Product[]) => void
  addProduct: (product: Omit<Product, 'id'>) => void
  updateProduct: (id: string, updates: Partial<Product>) => void
  deleteProduct: (id: string) => void
  getProduct: (id: string) => Product | undefined
  getProductByName: (name: string) => Product | undefined
  getLowStockProducts: () => Product[]
  getTopSelling: () => Product[]
}

const DEFAULT_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Tomates', category: 'légumes', priceUnit: 100, stockQty: 200, isActive: true },
  { id: 'p2', name: 'Oignons', category: 'légumes', priceUnit: 150, stockQty: 150, isActive: true },
  { id: 'p3', name: 'Piments', category: 'légumes', priceUnit: 50, stockQty: 300, isActive: true },
  { id: 'p4', name: 'Aubergines', category: 'légumes', priceUnit: 100, stockQty: 80, isActive: true },
  { id: 'p5', name: 'Gombos', category: 'légumes', priceUnit: 75, stockQty: 120, isActive: true },
  { id: 'p6', name: 'Bananes', category: 'fruits', priceUnit: 100, stockQty: 50, isActive: true },
  { id: 'p7', name: 'Ignames', category: 'tubercules', priceUnit: 200, stockQty: 40, isActive: true },
  { id: 'p8', name: 'Riz', category: 'céréales', priceUnit: 500, stockQty: 30, isActive: true },
  { id: 'p9', name: 'Huile de palme', category: 'ingrédients', priceUnit: 1500, stockQty: 15, isActive: true },
  { id: 'p10', name: 'Poisson fumé', category: 'protéines', priceUnit: 500, stockQty: 20, isActive: true },
  { id: 'p11', name: 'Poulet', category: 'protéines', priceUnit: 2500, stockQty: 8, isActive: true },
  { id: 'p12', name: 'Œufs', category: 'protéines', priceUnit: 100, stockQty: 100, isActive: true },
  { id: 'p13', name: 'Avocats', category: 'fruits', priceUnit: 200, stockQty: 30, isActive: true },
  { id: 'p14', name: 'Carottes', category: 'légumes', priceUnit: 75, stockQty: 90, isActive: true },
  { id: 'p15', name: 'Ail', category: 'ingrédients', priceUnit: 50, stockQty: 200, isActive: true },
  { id: 'p16', name: 'Sel', category: 'ingrédients', priceUnit: 50, stockQty: 100, isActive: true },
  { id: 'p17', name: 'Mangues', category: 'fruits', priceUnit: 150, stockQty: 5, isActive: true },
  { id: 'p18', name: 'Arachides', category: 'légumineuses', priceUnit: 200, stockQty: 60, isActive: true },
  { id: 'p19', name: 'Manioc', category: 'tubercules', priceUnit: 300, stockQty: 25, isActive: true },
  { id: 'p20', name: 'Pommes de terre', category: 'tubercules', priceUnit: 250, stockQty: 35, isActive: true },
]

export const useStockStore = create<StockState>()(
  persist(
    (set, get) => ({
      products: DEFAULT_PRODUCTS,
      setProducts: (products) => set({ products }),
      addProduct: (product) =>
        set((s) => ({
          products: [...s.products, { ...product, id: crypto.randomUUID() }],
        })),
      updateProduct: (id, updates) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
      deleteProduct: (id) =>
        set((s) => ({ products: s.products.filter((p) => p.id !== id) })),
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
    }
  )
)