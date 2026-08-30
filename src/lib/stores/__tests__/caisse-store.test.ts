import { describe, it, expect, beforeEach } from 'vitest'
import { useCaisseStore } from '../caisse-store'

describe('caisse-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useCaisseStore.setState({
      session: null,
      cart: [],
      amountReceived: 0,
      todaySales: 0,
      todayExpenses: 0,
      todaySalesCount: 0,
      todayDate: new Date().toISOString().split('T')[0],
      hasActiveCart: false,
    })
  })

  describe('session management', () => {
    it('devrait initialiser sans session', () => {
      const { session } = useCaisseStore.getState()
      expect(session).toBe(null)
    })

    it('devrait ouvrir une session avec fond de caisse', () => {
      const { openSession, session } = useCaisseStore.getState()
      openSession(50000)
      
      expect(session).not.toBeNull()
      expect(session?.fondDeCaisse).toBe(50000)
      expect(session?.isOpen).toBe(true)
      expect(session?.id).toBeDefined()
      expect(session?.openedAt).toBeDefined()
    })

    it('devrait fermer une session', () => {
      const { openSession, closeSession, session } = useCaisseStore.getState()
      openSession(50000)
      closeSession()
      
      const closedSession = useCaisseStore.getState().session
      expect(closedSession?.isOpen).toBe(false)
      expect(closedSession?.closedAt).toBeDefined()
    })

    it('devrait vider le panier lors de la fermeture de session', () => {
      const { openSession, addToCart, closeSession, cart } = useCaisseStore.getState()
      openSession(50000)
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      closeSession()
      
      expect(useCaisseStore.getState().cart).toHaveLength(0)
    })
  })

  describe('cart operations', () => {
    it('devrait initialiser avec un panier vide', () => {
      const { cart } = useCaisseStore.getState()
      expect(cart).toHaveLength(0)
    })

    it('devrait ajouter un item au panier', () => {
      const { addToCart, cart } = useCaisseStore.getState()
      addToCart({
        id: 'prod-1',
        productId: 'prod-1',
        name: 'Riz',
        quantity: 2,
        unitPrice: 500,
      })
      
      expect(cart).toHaveLength(1)
      expect(cart[0].name).toBe('Riz')
      expect(cart[0].quantity).toBe(2)
      expect(cart[0].unitPrice).toBe(500)
      expect(cart[0].subtotal).toBe(1000)
    })

    it('devrait mettre à jour la quantité d\'un item existant', () => {
      const { addToCart, updateCartItemQty, cart } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      updateCartItemQty('prod-1', 5)
      
      expect(cart[0].quantity).toBe(5)
      expect(cart[0].subtotal).toBe(2500)
    })

    it('devrait mettre à jour le prix d\'un item existant', () => {
      const { addToCart, updateCartItemPrice, cart } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      updateCartItemPrice('prod-1', 750)
      
      expect(cart[0].unitPrice).toBe(750)
      expect(cart[0].subtotal).toBe(1500)
    })

    it('devrait supprimer un item du panier', () => {
      const { addToCart, removeFromCart, cart } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      addToCart({ id: 'prod-2', productId: 'prod-2', name: 'Huile', quantity: 1, unitPrice: 1000 })
      
      removeFromCart('prod-1')
      
      expect(cart).toHaveLength(1)
      expect(cart[0].name).toBe('Huile')
    })

    it('devrait vider complètement le panier', () => {
      const { addToCart, clearCart, cart } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      addToCart({ id: 'prod-2', productId: 'prod-2', name: 'Huile', quantity: 1, unitPrice: 1000 })
      
      clearCart()
      
      expect(cart).toHaveLength(0)
    })

    it('devrait calculer le total du panier', () => {
      const { addToCart, getCartTotal } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      addToCart({ id: 'prod-2', productId: 'prod-2', name: 'Huile', quantity: 1, unitPrice: 1000 })
      
      expect(getCartTotal()).toBe(2000)
    })

    it('devrait retourner 0 pour un panier vide', () => {
      const { getCartTotal } = useCaisseStore.getState()
      expect(getCartTotal()).toBe(0)
    })
  })

  describe('payment', () => {
    it('devrait initialiser amountReceived à 0', () => {
      const { amountReceived } = useCaisseStore.getState()
      expect(amountReceived).toBe(0)
    })

    it('devrait définir le montant reçu', () => {
      const { setAmountReceived, amountReceived } = useCaisseStore.getState()
      setAmountReceived(10000)
      expect(amountReceived).toBe(10000)
    })

    it('devrait ajouter un billet au montant reçu', () => {
      const { addBillReceived, amountReceived } = useCaisseStore.getState()
      addBillReceived(5000)
      addBillReceived(2000)
      addBillReceived(500)
      
      expect(amountReceived).toBe(7500)
    })

    it('devrait calculer la monnaie correctement', () => {
      const { addToCart, setAmountReceived, getChange } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      setAmountReceived(2000)
      
      expect(getChange()).toBe(1000)
    })

    it('devrait retourner une monnaie négative si insuffisant', () => {
      const { addToCart, setAmountReceived, getChange } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      setAmountReceived(500)
      
      expect(getChange()).toBe(-500)
    })

    it('devrait calculer le décompte des billets', () => {
      const { addBillReceived, getBillBreakdown } = useCaisseStore.getState()
      addBillReceived(10000)
      addBillReceived(5000)
      addBillReceived(5000)
      addBillReceived(1000)
      
      const breakdown = getBillBreakdown()
      
      expect(breakdown).toContainEqual({ amount: 10000, count: 1 })
      expect(breakdown).toContainEqual({ amount: 5000, count: 2 })
      expect(breakdown).toContainEqual({ amount: 1000, count: 1 })
    })
  })

  describe('today stats', () => {
    it('devrait initialiser les statistiques à 0', () => {
      const { todaySales, todayExpenses, todaySalesCount } = useCaisseStore.getState()
      expect(todaySales).toBe(0)
      expect(todayExpenses).toBe(0)
      expect(todaySalesCount).toBe(0)
    })

    it('devrait définir les ventes du jour', () => {
      const { setTodaySales, todaySales } = useCaisseStore.getState()
      setTodaySales(50000)
      expect(todaySales).toBe(50000)
    })

    it('devrait définir les dépenses du jour', () => {
      const { setTodayExpenses, todayExpenses } = useCaisseStore.getState()
      setTodayExpenses(15000)
      expect(todayExpenses).toBe(15000)
    })

    it('devrait définir le nombre de ventes du jour', () => {
      const { setTodaySalesCount, todaySalesCount } = useCaisseStore.getState()
      setTodaySalesCount(12)
      expect(todaySalesCount).toBe(12)
    })

    it('devrait suivre la date du jour', () => {
      const { todayDate } = useCaisseStore.getState()
      const expectedDate = new Date().toISOString().split('T')[0]
      expect(todayDate).toBe(expectedDate)
    })
  })

  describe('hasActiveCart flag', () => {
    it('devrait initialiser hasActiveCart à false', () => {
      const { hasActiveCart } = useCaisseStore.getState()
      expect(hasActiveCart).toBe(false)
    })

    it('devrait définir hasActiveCart à true', () => {
      const { setHasActiveCart, hasActiveCart } = useCaisseStore.getState()
      setHasActiveCart(true)
      expect(hasActiveCart).toBe(true)
    })

    it('devrait définir hasActiveCart à false', () => {
      const { setHasActiveCart, hasActiveCart } = useCaisseStore.getState()
      setHasActiveCart(true)
      setHasActiveCart(false)
      expect(hasActiveCart).toBe(false)
    })
  })

  describe('persistance', () => {
    it('devrait avoir le bon nom de storage', () => {
      const store = useCaisseStore.persist
      expect(store.getOptions().name).toBe('julaba-caisse-store')
    })

    it('devrait partializer les bons états pour persistance', () => {
      const state = useCaisseStore.getState()
      const partialized = useCaisseStore.persist.getOptions().partialize?.(state)
      
      expect(partialized).toHaveProperty('session')
      expect(partialized).toHaveProperty('cart')
      expect(partialized).toHaveProperty('amountReceived')
      expect(partialized).toHaveProperty('todaySales')
      expect(partialized).toHaveProperty('todayExpenses')
      expect(partialized).toHaveProperty('todaySalesCount')
      expect(partialized).toHaveProperty('todayDate')
      expect(partialized).toHaveProperty('hasActiveCart')
    })
  })

  describe('edge cases', () => {
    it('devrait gérer la mise à jour de quantité d\'un item inexistant', () => {
      const { updateCartItemQty, cart } = useCaisseStore.getState()
      // Ne devrait pas lever d'erreur
      expect(() => updateCartItemQty('non-existent', 5)).not.toThrow()
      expect(cart).toHaveLength(0)
    })

    it('devrait gérer la suppression d\'un item inexistant', () => {
      const { removeFromCart, cart } = useCaisseStore.getState()
      // Ne devrait pas lever d'erreur
      expect(() => removeFromCart('non-existent')).not.toThrow()
      expect(cart).toHaveLength(0)
    })

    it('devrait gérer quantité négative', () => {
      const { addToCart, updateCartItemQty, cart } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      updateCartItemQty('prod-1', -1)
      
      expect(cart[0].quantity).toBe(-1)
      expect(cart[0].subtotal).toBe(-500)
    })

    it('devrait gérer prix négatif', () => {
      const { addToCart, updateCartItemPrice, cart } = useCaisseStore.getState()
      addToCart({ id: 'prod-1', productId: 'prod-1', name: 'Riz', quantity: 2, unitPrice: 500 })
      updateCartItemPrice('prod-1', -100)
      
      expect(cart[0].unitPrice).toBe(-100)
      expect(cart[0].subtotal).toBe(-200)
    })
  })
})
