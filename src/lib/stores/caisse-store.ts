import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  id: string
  productId?: string
  name: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface CaisseSession {
  id: string
  fondDeCaisse: number
  isOpen: boolean
  openedAt: string
  closedAt?: string
}

interface CaisseState {
  // Session
  session: CaisseSession | null
  openSession: (fond: number) => void
  closeSession: () => void

  // Cart
  cart: CartItem[]
  addToCart: (item: Omit<CartItem, 'id' | 'subtotal'>) => void
  removeFromCart: (id: string) => void
  updateCartItemQty: (id: string, qty: number) => void
  updateCartItemPrice: (id: string, price: number) => void
  clearCart: () => void
  getCartTotal: () => number

  // Payment
  amountReceived: number
  setAmountReceived: (amount: number) => void
  addBillReceived: (amount: number) => void
  getChange: () => number
  getBillBreakdown: () => { amount: number; count: number }[]

  // Today stats
  todaySales: number
  todayExpenses: number
  todaySalesCount: number
  todayDate: string  // ISO date string to track day changes
  setTodaySales: (amount: number) => void
  setTodayExpenses: (amount: number) => void
  setTodaySalesCount: (count: number) => void

  // Cart active flag
  hasActiveCart: boolean
  setHasActiveCart: (v: boolean) => void
}

export const useCaisseStore = create<CaisseState>()(
  persist(
    (set, get) => ({
      // Session
      session: null,
      openSession: (fond) =>
        set({
          session: {
            id: crypto.randomUUID(),
            fondDeCaisse: fond,
            isOpen: true,
            openedAt: new Date().toISOString(),
          },
        }),
      closeSession: () =>
        set((s) => ({
          session: s.session
            ? { ...s.session, isOpen: false, closedAt: new Date().toISOString() }
            : null,
          cart: [],
          amountReceived: 0,
        })),

      // Cart
      cart: [],
      addToCart: (item) => {
        const subtotal = item.quantity * item.unitPrice
        set((s) => ({
          cart: [
            ...s.cart,
            { ...item, id: crypto.randomUUID(), subtotal },
          ],
        }))
      },
      removeFromCart: (id) =>
        set((s) => ({ cart: s.cart.filter((c) => c.id !== id) })),
      updateCartItemQty: (id, qty) =>
        set((s) => ({
          cart: s.cart.map((c) =>
            c.id === id ? { ...c, quantity: qty, subtotal: qty * c.unitPrice } : c
          ),
        })),
      updateCartItemPrice: (id, price) =>
        set((s) => ({
          cart: s.cart.map((c) =>
            c.id === id ? { ...c, unitPrice: price, subtotal: c.quantity * price } : c
          ),
        })),
      clearCart: () => set({ cart: [], amountReceived: 0 }),
      getCartTotal: () => get().cart.reduce((sum, c) => sum + c.subtotal, 0),

      // Payment
      amountReceived: 0,
      setAmountReceived: (amount) => set({ amountReceived: amount }),
      addBillReceived: (amount) =>
        set({ amountReceived: get().amountReceived + amount }),
      getChange: () => {
        const total = get().getCartTotal()
        return Math.max(get().amountReceived - total, 0)
      },
      getBillBreakdown: () => {
        const change = get().getChange()
        if (change === 0) return []
        const bills = [10000, 5000, 2000, 1000, 500]
        const result: { amount: number; count: number }[] = []
        let remaining = change
        for (const bill of bills) {
          const count = Math.floor(remaining / bill)
          if (count > 0) {
            result.push({ amount: bill, count })
            remaining -= bill * count
          }
        }
        if (remaining > 0) result.push({ amount: remaining, count: 1 })
        return result
      },

      // Today stats
      todaySales: 0,
      todayExpenses: 0,
      todaySalesCount: 0,
      todayDate: new Date().toISOString().split('T')[0],
      setTodaySales: (amount) => set({ todaySales: amount }),
      setTodayExpenses: (amount) => set({ todayExpenses: amount }),
      setTodaySalesCount: (count) => set({ todaySalesCount: count }),

      // Cart active flag
      hasActiveCart: false,
      setHasActiveCart: (v) => set({ hasActiveCart: v }),
    }),
    {
      name: 'julaba-caisse-store',
      partialize: (state) => ({
        session: state.session,
        cart: state.cart,
        amountReceived: state.amountReceived,
        todaySales: state.todaySales,
        todayExpenses: state.todayExpenses,
        todaySalesCount: state.todaySalesCount,
        todayDate: state.todayDate,
        hasActiveCart: state.hasActiveCart,
      }),
      // Reset daily stats when a new day is detected
      onRehydrateStorage: () => (state) => {
        if (state) {
          const today = new Date().toISOString().split('T')[0]
          if (state.todayDate !== today) {
            state.todaySales = 0
            state.todayExpenses = 0
            state.todaySalesCount = 0
            state.todayDate = today
          }
          // If cart was persisted but session is closed, clear it
          if (state.session && !state.session.isOpen && state.cart.length > 0) {
            state.cart = []
            state.amountReceived = 0
            state.hasActiveCart = false
          }
        }
      },
    }
  )
)
