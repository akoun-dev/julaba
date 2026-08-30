# Propositions d'Améliorations pour Jùlaba

Ce document présente une analyse des améliorations potentielles classées par catégorie et priorité.

## 🎯 Haute Priorité

### 1. Tests Unitaires - Couverture Étendue

**État Actuel :** Seuls les modules voice disposent de tests (`src/lib/voice/__tests__/`).

**Améliorations Proposées :**

#### a) Tests des Stores Zustand
```typescript
// src/lib/stores/__tests__/app-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../app-store'

describe('app-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAppStore.setState({
      hasCompletedOnboarding: false,
      isAuthenticated: false,
      currentScreen: 'auth',
      userRole: 'marchand',
    })
  })

  describe('onboarding', () => {
    it('devrait marquer onboarding comme complété', () => {
      useAppStore.getState().completeOnboarding()
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true)
    })
  })

  describe('navigation', () => {
    it('devrait naviguer vers un écran et garder le précédent', () => {
      const { navigate, currentScreen, previousScreen } = useAppStore.getState()
      navigate('home')
      expect(currentScreen).toBe('home')
      expect(previousScreen).toBe('auth')
    })

    it('devrait retourner à l\'écran précédent avec goBack', () => {
      const { navigate, goBack, currentScreen } = useAppStore.getState()
      navigate('caisse')
      goBack()
      expect(currentScreen).toBe('auth')
    })
  })

  describe('authentification', () => {
    it('devrait définir les données utilisateur lors de l\'auth', () => {
      const { setAuth, isAuthenticated, merchantId } = useAppStore.getState()
      setAuth('test-123', 'Moussa', '770000000')
      expect(isAuthenticated).toBe(true)
      expect(merchantId).toBe('test-123')
    })

    it('devrait rediriger vers home après authentification', () => {
      const { setAuth, currentScreen } = useAppStore.getState()
      setAuth('test-123', 'Moussa', '770000000')
      expect(currentScreen).toBe('home')
    })

    it('devrait réinitialiser l\'état lors du logout', () => {
      const { setAuth, logout, isAuthenticated } = useAppStore.getState()
      setAuth('test-123', 'Moussa', '770000000')
      logout()
      expect(isAuthenticated).toBe(false)
    })
  })

  describe('persistance', () => {
    it('devrait persister soleilMode', () => {
      const { toggleSoleil, soleilMode } = useAppStore.getState()
      toggleSoleil()
      expect(soleilMode).toBe(true)
    })
  })
})
```

#### b) Tests des Utilitaires
```typescript
// src/lib/__tests__/utils.test.ts
import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('utils', () => {
  describe('cn', () => {
    it('devrait fusionner les classes Tailwind correctement', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
      expect(cn('flex', 'hidden')).toBe('hidden')
    })

    it('devrait gérer les classes conditionnelles', () => {
      expect(cn('base', true && 'active', false && 'inactive')).toBe('base active')
    })

    it('devrait gérer les tableaux de classes', () => {
      expect(cn(['flex', 'items-center'], 'justify-center')).toBe('flex items-center justify-center')
    })
  })
})

// Ajouter formatFCFA si ce n'est pas déjà fait
```

#### c) Tests des Composants React
```typescript
// src/components/marchand/__tests__/pattern-lock.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PatternLock } from '../pattern-lock'

describe('PatternLock', () => {
  it('devrait afficher la grille de points', () => {
    const onPatternComplete = vi.fn()
    render(<PatternLock onPatternComplete={onPatternComplete} />)
    
    const points = screen.getAllByRole('button', { name: /point/i })
    expect(points).toHaveLength(9) // Grille 3x3
  })

  it('devrait appeler onPatternComplete après un pattern valide', async () => {
    const onPatternComplete = vi.fn()
    render(<PatternLock onPatternComplete={onPatternComplete} minLength={4} />)
    
    // Simuler un pattern (points 1-2-3-4)
    const points = screen.getAllByRole('button')
    fireEvent.mouseDown(points[0])
    fireEvent.mouseEnter(points[1])
    fireEvent.mouseEnter(points[2])
    fireEvent.mouseEnter(points[3])
    fireEvent.mouseUp(points[3])
    
    expect(onPatternComplete).toHaveBeenCalledWith(expect.any(String))
  })
})
```

#### d) Tests des Hooks Personnalisés
```typescript
// src/hooks/__tests__/use-cart.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCartStore } from '@/lib/stores/caisse-store'

describe('useCartStore', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], sessionId: null })
  })

  it('devrait ajouter un item au panier', () => {
    const { result } = renderHook(() => useCartStore())
    
    act(() => {
      result.current.addToCart({
        productId: 'prod-1',
        name: 'Riz',
        price: 500,
        quantity: 2,
      })
    })
    
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].name).toBe('Riz')
  })

  it('devrait mettre à jour la quantité si l\'item existe déjà', () => {
    const { result } = renderHook(() => useCartStore())
    
    act(() => {
      result.current.addToCart({ productId: 'prod-1', name: 'Riz', price: 500, quantity: 1 })
      result.current.addToCart({ productId: 'prod-1', name: 'Riz', price: 500, quantity: 2 })
    })
    
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(3)
  })

  it('devrait supprimer un item du panier', () => {
    const { result } = renderHook(() => useCartStore())
    
    act(() => {
      result.current.addToCart({ productId: 'prod-1', name: 'Riz', price: 500, quantity: 1 })
      result.current.removeFromCart('prod-1')
    })
    
    expect(result.current.items).toHaveLength(0)
  })

  it('devrait calculer le total correctement', () => {
    const { result } = renderHook(() => useCartStore())
    
    act(() => {
      result.current.addToCart({ productId: 'prod-1', name: 'Riz', price: 500, quantity: 2 })
      result.current.addToCart({ productId: 'prod-2', name: 'Huile', price: 1000, quantity: 1 })
    })
    
    expect(result.current.getTotal()).toBe(2000) // (500*2) + (1000*1)
  })
})
```

### 2. Accessibilité (a11y)

**Améliorations :**
- Ajouter des attributs `aria-label` sur tous les boutons icones
- Implémenter la navigation au clavier complète
- Ajouter des `role="alert"` pour les notifications
- Vérifier les contrastes de couleurs (WCAG AA minimum)
- Tester avec des lecteurs d'écran (NVDA, VoiceOver)

**Exemple :**
```tsx
// Avant
<button onClick={handleDelete}>
  <TrashIcon />
</button>

// Après
<button 
  onClick={handleDelete}
  aria-label="Supprimer cet élément"
  className="..."
>
  <TrashIcon aria-hidden="true" />
</button>
```

### 3. Performance

**Optimisations Proposées :**

#### a) Code Splitting
```tsx
// Charger les écrans secondaire en lazy
const MarcheScreen = lazy(() => import('@/components/marchand/secondary-screens'))
const TontinesScreen = lazy(() => import('@/components/marchand/secondary-screens'))
```

#### b) Memoization
```tsx
// Éviter les re-renders inutiles
const ProductCard = memo(({ product, onAddToCart }: ProductCardProps) => {
  // composant
})
```

#### c) Virtualisation des Listes
```tsx
// Pour les longues listes (ventes, produits)
import { useVirtualizer } from '@tanstack/react-virtual'

<VirtualList
  count={items.length}
  getItemKey={(index) => items[index].id}
>
  {virtualizer.getVirtualItems().map((virtualRow) => (
    <div key={virtualRow.key}>{/* item */}</div>
  ))}
</VirtualList>
```

### 4. Gestion d'Erreurs

**Améliorations :**
```typescript
// Error Boundary global
class ErrorBoundary extends React.Component {
  state = { hasError: false }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true }
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Logger l'erreur pour le debugging
    console.error('Erreur non gérée:', error, errorInfo)
  }
  
  render() {
    if (this.state.hasError) {
      return <FallbackUI />
    }
    return this.props.children
  }
}
```

## 📊 Moyenne Priorité

### 5. Internationalisation (i18n)

Bien que l'application soit en français, préparer l'i18n :

```typescript
// Utiliser next-intl (déjà installé)
// messages/fr.json
{
  "Home": {
    "title": "Accueil",
    "greeting": "Bonjour {name}"
  },
  "Common": {
    "save": "Enregistrer",
    "cancel": "Annuler",
    "delete": "Supprimer"
  }
}

// Components
import { useTranslations } from 'next-intl'

export function HomeScreen() {
  const t = useTranslations('Home')
  return <h1>{t('title')}</h1>
}
```

### 6. Monitoring & Analytics

**Implémentation :**
```typescript
// Hook personnalisé pour le tracking
export function useAnalytics() {
  const trackEvent = useCallback((eventName: string, properties?: Record<string, any>) => {
    // Envoyer à l'API d'analytics
    fetch('/api/analytics/track', {
      method: 'POST',
      body: JSON.stringify({ eventName, properties, timestamp: Date.now() }),
    })
  }, [])
  
  return { trackEvent }
}

// Usage dans les composants
const { trackEvent } = useAnalytics()
trackEvent('vente_completee', { montant: 5000, items: 3 })
```

### 7. Documentation API

**Créer un fichier `docs/API.md` :**
```markdown
# API Routes

## POST /api/session/claim
Claim device session pour un acteur.

### Request
```json
{
  "subjectType": "merchant",
  "id": "cmr_123"
}
```

### Response
```json
{
  "success": true,
  "token": "..."
}
```
```

### 8. Validation des Données

**Renforcer les schémas Zod :**
```typescript
// schemas/merchant.schema.ts
import { z } from 'zod'

export const MerchantSchema = z.object({
  firstName: z.string().min(2, 'Prénom trop court'),
  lastName: z.string().optional(),
  phone: z.string().regex(/^(\+221|00221)?[0-9]{9}$/, 'Numéro invalide'),
  authMethod: z.enum(['pin', 'pattern', 'visual']),
  pinHash: z.string().min(64).optional(),
})

export type MerchantInput = z.infer<typeof MerchantSchema>
```

## 🔽 Basse Priorité

### 9. Animations Avancées

**Utiliser Framer Motion pour des transitions fluides :**
```tsx
import { motion, AnimatePresence } from 'framer-motion'

<AnimatePresence>
  {showModal && (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      {/* Modal content */}
    </motion.div>
  )}
</AnimatePresence>
```

### 10. PWA Features

**Améliorer le support offline :**
```typescript
// next.config.ts
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  // Configurer Service Worker
}
```

### 11. Dark Mode Natif

**Actuellement géré manuellement, passer au système Tailwind :**
```tsx
// tailwind.config.ts
module.exports = {
  darkMode: 'class',
  // ...
}

// Dans le root layout
<html className={theme === 'dark' ? 'dark' : ''}>
```

### 12. Seed Data Plus Riche

**Améliorer `prisma/seed.ts` :**
```typescript
// Créer des données de démo réalistes
const merchants = [
  { firstName: 'Fatou', lastName: 'Diop', phone: '770000001', products: [...] },
  { firstName: 'Mamadou', lastName: 'Sow', phone: '770000002', products: [...] },
]

// Ajouter des ventes historiques pour les charts
for (let i = 0; i < 30; i++) {
  await prisma.sale.create({ /* ... */ })
}
```

## 🧹 Nettoyage Code

### 13. TypeScript Strict Mode

**Vérifier `tsconfig.json` :**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 14. ESLint Rules

**Renforcer la config ESLint :**
```javascript
// eslint.config.mjs
export default [
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': 'error',
      'react-hooks/exhaustive-deps': 'error',
    }
  }
]
```

### 15. Git Hooks

**Ajouter Husky pour les pre-commit hooks :**
```bash
bun add -d husky
bunx husky init
```

```bash
# .husky/pre-commit
bun run lint
bun run test
```

## 📈 Métriques de Qualité

### Objectifs Recommandés

| Métrique | Actuel | Cible |
|----------|--------|-------|
| Couverture de tests | ~10% | 80%+ |
| Lighthouse Performance | ? | 90+ |
| Lighthouse Accessibility | ? | 90+ |
| Lighthouse Best Practices | ? | 90+ |
| Lighthouse SEO | ? | 90+ |
| Temps de chargement initial | ? | < 3s |
| Bundle size | ? | < 500KB |

## 🚀 Roadmap Suggérée

### Sprint 1 (Semaines 1-2)
- [ ] Tests stores Zustand
- [ ] Tests utilitaires
- [ ] Corrections accessibilité basiques

### Sprint 2 (Semaines 3-4)
- [ ] Tests composants critiques
- [ ] Error boundaries
- [ ] Monitoring analytics

### Sprint 3 (Semaines 5-6)
- [ ] Optimisations performance
- [ ] Validation Zod renforcée
- [ ] Documentation API

### Sprint 4 (Semaines 7-8)
- [ ] Internationalisation
- [ ] Dark mode natif
- [ ] CI/CD avec tests automatisés

---

**Note :** Ces recommandations sont basées sur une analyse statique du code. Une revue plus approfondie avec profiling runtime pourrait révéler d'autres opportunités d'optimisation.
