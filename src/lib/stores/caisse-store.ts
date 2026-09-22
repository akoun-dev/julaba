import { create } from 'zustand'
import { persist } from 'zustand/middleware'
// MODE-902 (§7-8) — lien Mode Marché (sens UNIQUE caisse → market-mode :
// aucun des modules importés ici n'importe caisse-store — zéro cycle).
import { handleCaisseSessionClosed, handleCaisseSessionOpened } from '@/lib/market-mode/caisse-link'
// MODE-909 (§28) — l'annulation remet le stock local en DELTA (via
// adjustLocalStock existant — jamais une valeur absolue, piège D3) et met
// l'opération inverse en file offline. stock-store n'importe jamais la
// caisse (ses imports : offline-db/notifications/units uniquement).
import { useStockStore } from '@/lib/stores/stock-store'
import { useAppStore } from '@/lib/stores/app-store'
import { queuePendingSync } from '@/lib/offline-db'

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
  /** true lorsque l’identifiant et l’ouverture ont été confirmés serveur. */
  serverSynced?: boolean
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

/** MODE-909 (§28) — une vente du jour, telle qu'enregistrée localement.
 * Journal APPEND-ONLY : une vente annulée est MARQUÉE (annulee + raison),
 * jamais retirée ni réécrite autrement — l'historique reste intact, comme
 * côté serveur (merchant_sale_reversals, aucune retouche de legacy_sales). */
export interface CaisseJournalSale {
  /** client_id de la vente (idempotence serveur, cible de l'annulation). */
  saleClientId: string
  amountCfa: number
  /** Articles vendus (pour remettre le stock à l'annulation). */
  items: Array<{ productName: string; quantity: number; unitPrice: number; productId?: string }>
  /** MODE-908 — snapshot du point de vente actif au moment de la vente. */
  point?: { clientId: string; name: string }
  createdAt: number
  /** MODE-909 — annulation (opération inverse) : la vente RESTE, marquée. */
  annulee: boolean
  reason?: string
  annuleeAt?: number
}

/** Résultat d'une annulation : ok avec l'entrée marquée, ou refus honnête
 * (déjà annulée, vente introuvable, raison invalide). */
export type ReversalResult =
  | { ok: true; entry: CaisseJournalSale }
  | { ok: false; error: string }

/** MODE-984 (AUDIT-008) — résultat TYPÉ d'une clôture de session : jamais
 * de succès générique. 'closed' = la session était réellement ouverte et
 * vient d'être fermée ; 'already_closed' = elle l'était déjà (aucune
 * mutation, aucune suppression de panier) ; 'no_session' = rien à fermer ;
 * 'refuse_panier' = session ouverte MAIS panier non encaissé sans
 * confirmation destructive explicite — RIEN n'est muté (ni session ni
 * panier) : une vente non encaissée n'est jamais perdue en silence. */
export type CloseSessionResult =
  | { statut: 'closed' }
  | { statut: 'already_closed' }
  | { statut: 'no_session' }
  | { statut: 'refuse_panier'; articles: number; totalCfa: number }

/**
 * Dernière vente locale NON annulée (voix « annule la dernière vente »,
 * §28) : la plus récente par createdAt dont annulee = false. Journal vide
 * ou tout annulé → null (Tata dit qu'elle ne trouve rien — jamais de
 * vente devinée).
 */
export function lastCancellableSale(journal: CaisseJournalSale[]): CaisseJournalSale | null {
  for (let i = journal.length - 1; i >= 0; i--) {
    if (!journal[i].annulee) return journal[i]
  }
  return null
}

interface CaisseState {
  // Session
  session: CaisseSession | null
  openSession: (fond: number) => void
  /** Recharge la session ouverte du marchand depuis le serveur, sans
   * effacer le cache local si l’appareil est hors ligne. */
  hydrateSessionFromServer: (merchantId: string) => Promise<void>
  /** countedCash (MODE-902 §8) : caisse réellement comptée — sinon estimation.
   * MODE-984 (AUDIT-008) : résultat TYPÉ (jamais de faux succès) et garde
   * panier — le vidage du panier n'arrive QUE sur une clôture réelle
   * ('closed'), et seulement si l'UI a explicitement confirmé l'abandon
   * (abandonPanierConfirme) lorsque le panier contenait des articles. */
  closeSession: (countedCash?: number, options?: { abandonPanierConfirme?: boolean }) => CloseSessionResult

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

  // MODE-909 (§28) — journal des ventes du jour + annulation (opération inverse)
  todaySalesJournal: CaisseJournalSale[]
  /** Journalise une vente ENREGISTRÉE (appelé par les émetteurs après un
   * verdict favorable — jamais avant). Local : aucune file ici. */
  journalTodaySale: (entry: {
    saleClientId: string
    amountCfa: number
    items: CaisseJournalSale['items']
    point?: { clientId: string; name: string }
  }) => void
  /** Annule une vente : MARQUE l'entrée (append-only), met l'opération
   * inverse en file ('sale-reversal'), remet le stock local en DELTA et
   * décrémente les agrégats du jour (jamais sous 0). REFUS sur une vente
   * déjà annulée (une vente ne s'annule qu'UNE fois, §28). */
  reverseSale: (saleClientId: string, reason: string) => ReversalResult

  // Cart active flag
  hasActiveCart: boolean
  setHasActiveCart: (v: boolean) => void
}

/**
 * client_id d'idempotence d'une ANNULATION de vente (MODE-909, §28) —
 * UUID (crypto.randomUUID) : le rejeu offline rejoue le MÊME id et la RPC
 * merchant_reverse_sale reconnaît l'opération (§31-32). Repli lisible si
 * crypto.randomUUID n'existe pas (jamais court — min 8 côté schéma).
 */
function newReversalClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `reversal-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
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
          serverSynced: false,
        }
        set({ session })
        // MODE-902 — contexte de journée marché (no-op si mode inactif,
        // jamais bloquant, position ponctuelle §6 à l'ouverture).
        handleCaisseSessionOpened(session)
        const merchantId = useAppStore.getState().merchantId
        if (merchantId) {
          void fetch('/api/marchand/caisse-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchantId, fondDeCaisse: fond }),
          }).then(async (response) => {
            if (!response.ok) return null
            const payload = await response.json() as { session?: CaisseSession }
            return payload.session ?? null
          }).then((serverSession) => {
            if (serverSession) set({ session: serverSession })
          }).catch(() => {
            // Le cache local reste utilisable hors ligne ; la synchronisation
            // sera retentée à la prochaine connexion/appareil.
          })
        }
      },
      closeSession: (countedCash, options) => {
        // MODE-984 (AUDIT-008) — garde d'état AVANT toute mutation : sans
        // session ouverte, un appel ne produit NI succès ni suppression de
        // panier (fin des faux succès session absente/déjà fermée).
        const session = get().session
        if (!session) return { statut: 'no_session' }
        if (!session.isOpen) return { statut: 'already_closed' }
        // Garde panier (AUDIT-008 P0) : un panier non encaissé n'est jamais
        // supprimé silencieusement — l'UI doit présenter la confirmation
        // destructive et rappeler avec abandonPanierConfirme.
        const panier = get().cart
        if (panier.length > 0 && options?.abandonPanierConfirme !== true) {
          return { statut: 'refuse_panier', articles: panier.length, totalCfa: get().getCartTotal() }
        }
        const previous = session
        const merchantId = useAppStore.getState().merchantId
        const closedAt = new Date().toISOString()
        set({
          session: { ...previous, isOpen: false, closedAt },
          cart: [],
          amountReceived: 0,
          hasActiveCart: false,
        })
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
        if (merchantId && previous.id) {
          void fetch('/api/marchand/caisse-session', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchantId, sessionId: previous.id, countedCash }),
          }).catch(() => {})
        }
        return { statut: 'closed' }
      },

      hydrateSessionFromServer: async (merchantId) => {
        try {
          const response = await fetch(`/api/marchand/caisse-session?merchantId=${encodeURIComponent(merchantId)}`)
          if (!response.ok) return
          const payload = await response.json() as { session?: CaisseSession | null }
          // Une réponse serveur valide sans session signifie normalement que
          // la caisse a été clôturée sur un autre appareil. Exception : une
          // ouverture locale peut avoir précédé la fin de claim de l’appareil
          // ou avoir été faite hors ligne ; on la publie une fois reconnecté.
          if (payload.session) {
            set({ session: payload.session })
          } else {
            const local = get().session
            if (local?.isOpen && local.serverSynced !== true) {
              const opened = await fetch('/api/marchand/caisse-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ merchantId, fondDeCaisse: local.fondDeCaisse }),
              })
              if (opened.ok) {
                const created = await opened.json() as { session?: CaisseSession }
                if (created.session) set({ session: created.session })
              }
            } else {
              set({ session: null })
            }
          }
        } catch {
          // Hors ligne : conserver la dernière session locale connue.
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

      // ── MODE-909 (§28) — journal des ventes du jour + annulation ──────
      todaySalesJournal: [],
      journalTodaySale: (entry) =>
        set((s) => ({
          // Append-only : l'entrée est ajoutée, jamais réécrite ici.
          todaySalesJournal: [
            ...s.todaySalesJournal,
            { ...entry, annulee: false, createdAt: Date.now() },
          ],
        })),
      reverseSale: (saleClientId, reason) => {
        const trimmed = reason.trim()
        if (trimmed.length < 3 || trimmed.length > 200) {
          // Même règle que le zod (route) et le CHECK en base — le refus
          // est local, honnête : rien n'est muté, rien n'est mis en file.
          return { ok: false, error: 'La raison doit contenir entre 3 et 200 caractères' }
        }
        const entry = get().todaySalesJournal.find((e) => e.saleClientId === saleClientId)
        if (!entry) {
          return { ok: false, error: 'Vente introuvable dans le journal du jour' }
        }
        if (entry.annulee) {
          // REFUS (§28) : une vente ne s'annule qu'UNE fois — aucune
          // seconde remise de stock, aucune seconde entrée en file.
          return { ok: false, error: 'Cette vente est déjà annulée' }
        }

        const now = Date.now()
        const marked: CaisseJournalSale = {
          ...entry,
          annulee: true,
          reason: trimmed,
          annuleeAt: now,
        }
        set((s) => ({
          // L'entrée RESTE dans le journal (append-only), marquée.
          todaySalesJournal: s.todaySalesJournal.map((e) =>
            e.saleClientId === saleClientId ? marked : e,
          ),
          // Les agrégats du jour suivent l'opération inverse — jamais sous 0
          // (le dicté et le bilan de clôture restent honnêtes).
          todaySales: Math.max(0, s.todaySales - entry.amountCfa),
          todaySalesCount: Math.max(0, s.todaySalesCount - 1),
          todayPoints: entry.point
            ? s.todayPoints.map((p) =>
                p.clientId === entry.point!.clientId
                  ? { ...p, amountCfa: Math.max(0, p.amountCfa - entry.amountCfa), count: Math.max(0, p.count - 1) }
                  : p,
              )
            : s.todayPoints,
        }))

        // Stock : remise en DELTA (+qty par article suivi — JAMAIS une
        // valeur absolue recalculée, piège D3). Les items sans produit et
        // les produits inconnus du stock local sont ignorés (aucun suivi).
        for (const item of entry.items) {
          if (item.productId) {
            useStockStore.getState().adjustLocalStock(item.productId, item.quantity)
          }
        }

        // File offline ('sale-reversal') : APRÈS la vente qu'elle annule
        // (FIFO) — au rejeu, la vente est créée PUIS annulée. Le rejeu
        // rejoue le MÊME clientId (idempotence operation_id, §31-32).
        const merchantId = useAppStore.getState().merchantId
        if (merchantId) {
          void queuePendingSync('sale-reversal', {
            merchantId,
            clientId: newReversalClientId(),
            saleClientId,
            reason: trimmed,
          })
        }
        // Sans marchand identifié : mutation locale OK, pas de file
        // (l'offline n'est jamais une erreur — convention des stores).
        return { ok: true, entry: marked }
      },

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
        // MODE-909 — le journal des ventes du jour suit le cycle du jour
        // (persisté pour l'annulation après rechargement, remis à zéro
        // chaque jour avec les autres stats).
        todaySalesJournal: state.todaySalesJournal,
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
            // MODE-909 — le journal des ventes suit le cycle du jour (les
            // annulations visent les ventes du jour ; les ventes des jours
            // passés restent dans l'historique serveur).
            state.todaySalesJournal = []
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
