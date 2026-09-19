import { create } from 'zustand'
import { persist } from 'zustand/middleware'
// MODE-902 (§7-8) — lien Mode Marché (sens UNIQUE caisse → market-mode :
// aucun des modules importés ici n'importe caisse-store — zéro cycle).
import { handleCaisseSessionClosed, handleCaisseSessionOpened } from '@/lib/market-mode/caisse-link'

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

/** MODE-908 (§18) — journal local du jour par point de vente : agrégat
 * (montant + nombre de ventes) portant le SNAPSHOT du nom du point, pour
 * les stats offline. Remis à zéro chaque jour avec les autres stats. */
export interface TodayPointSale {
  /** client_id du point de vente (étiquette d'idempotence). */
  clientId: string
  /** Snapshot du nom du point AU MOMENT de la vente. */
  name: string
  amountCfa: number
  count: number
}

interface CaisseState {
  // Session
  session: CaisseSession | null
  openSession: (fond: number) => void
  /** countedCash (MODE-902 §8) : caisse réellement comptée — sinon estimation. */
  closeSession: (countedCash?: number) => void

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
  /** MODE-908 — ventes du jour agrégées par point de vente (snapshot nom). */
  todayPoints: TodayPointSale[]
  addTodaySale: (amount: number, point?: { clientId: string; name: string }) => void
  addTodayExpense: (amount: number) => void
  incrementTodaySalesCount: () => void

  // Cart active flag
  hasActiveCart: boolean
  setHasActiveCart: (v: boolean) => void
}

export const useCaisseStore = create<CaisseState>()(
  persist(
    (set, get) => ({
      // Session
      session: null,
      openSession: (fond) => {
        const session: CaisseSession = {
          id: crypto.randomUUID(),
          fondDeCaisse: fond,
          isOpen: true,
          openedAt: new Date().toISOString(),
        }
        set({ session })
        // MODE-902 — contexte de journée marché (no-op si mode inactif,
        // jamais bloquant, position ponctuelle §6 à l'ouverture).
        handleCaisseSessionOpened(session)
      },
      closeSession: (countedCash) => {
        const closedAt = new Date().toISOString()
        set((s) => ({
          session: s.session
            ? { ...s.session, isOpen: false, closedAt }
            : null,
          cart: [],
          amountReceived: 0,
          hasActiveCart: false,
        }))
        // MODE-902 — bilan de clôture marché (avant/après le set : les
        // stats du jour ne sont pas modifiées par cette action).
        const closed = get().session
        if (closed) {
          handleCaisseSessionClosed(
            { ...closed, closedAt },
            countedCash ?? null,
            { todaySales: get().todaySales, todayExpenses: get().todayExpenses },
          )
        }
      },

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
        set((s) => {
          if (qty <= 0) {
            // Remove item if quantity is 0 or negative
            const newCart = s.cart.filter((c) => c.id !== id)
            return {
              cart: newCart,
              hasActiveCart: newCart.length > 0,
            }
          }
          return {
            cart: s.cart.map((c) =>
              c.id === id ? { ...c, quantity: qty, subtotal: qty * c.unitPrice } : c
            ),
          }
        }),
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
      todayPoints: [],
      addTodaySale: (amount, point) => set((s) => {
        // MODE-908 — sans point fourni (appelants historiques), le journal
        // par point n'est pas touché : comportement inchangé.
        if (!point) return { todaySales: s.todaySales + amount }
        const existing = s.todayPoints.find((p) => p.clientId === point.clientId)
        const todayPoints = existing
          ? s.todayPoints.map((p) =>
              p.clientId === point.clientId
                ? { ...p, name: point.name, amountCfa: p.amountCfa + amount, count: p.count + 1 }
                : p,
            )
          : [...s.todayPoints, { clientId: point.clientId, name: point.name, amountCfa: amount, count: 1 }]
        return { todaySales: s.todaySales + amount, todayPoints }
      }),
      addTodayExpense: (amount) => set((s) => ({ todayExpenses: s.todayExpenses + amount })),
      incrementTodaySalesCount: () => set((s) => ({ todaySalesCount: s.todaySalesCount + 1 })),

      // Cart active flag
      hasActiveCart: false,
      setHasActiveCart: (v) => set({ hasActiveCart: v }),
    }),
    {
      name: 'julaba-caisse-store',
      // Keep the active session across a page reload so the opening float is
      // not replaced by zero. Cart and payment data remain transient.
      partialize: (state) => ({
        session: state.session,
        todaySales: state.todaySales,
        todayExpenses: state.todayExpenses,
        todaySalesCount: state.todaySalesCount,
        todayDate: state.todayDate,
        todayPoints: state.todayPoints,
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
            // MODE-908 — le journal par point suit le cycle du jour.
            state.todayPoints = []
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
