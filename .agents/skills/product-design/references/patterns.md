# Component & Styling Patterns

Canonical component usage and styling conventions.

## Component Library

- **shadcn/ui** (new-york style) — the single source of UI primitives.
- **Lucide React** — the single source of icons.
- **Framer Motion** — for complex animations.
- **Recharts** — for backoffice charts only.

## When to Use shadcn vs. Custom

| Need                          | Use                              |
| ----------------------------- | -------------------------------- |
| Button, input, select         | shadcn `Button`, `Input`, `Select` |
| Modal, dialog, sheet          | shadcn `Dialog`, `Sheet`, `AlertDialog` |
| Dropdown menu                 | shadcn `DropdownMenu`            |
| Toast notifications           | shadcn `Toast` via `use-toast`   |
| Data table                    | shadcn `Table`                    |
| Tabs, accordion, collapsible  | shadcn primitives                 |
| OTP input (backoffice auth)   | Custom `OrbitOtp` (styled-jsx)    |
| Voice waveform                | Custom CSS animation              |
| Pattern lock grid             | Custom component                  |
| Visual code grid              | Custom component                  |

## Screen Component Pattern

Every screen component follows this structure:

```tsx
'use client'
import { useAppStore } from '@/lib/stores/app-store'

export function XxxScreen() {
  const { soleilMode, navigate, goBack } = useAppStore()

  return (
    <div className="screen-enter pb-24">
      {/* Sticky header with goBack */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg px-4 pt-4 pb-3">
        <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft size={18} />
          <span>Retour</span>
        </button>
        <h1 className="text-xl font-bold mt-2">Title</h1>
      </header>

      {/* Content */}
      <div className="px-4 pt-4 space-y-4">
        {/* ... */}
      </div>
    </div>
  )
}
```

Key conventions:
- `'use client'` at the top.
- `screen-enter` class on root div for fade-in animation.
- `pb-24` to clear the fixed bottom navigation bar.
- Sticky header with back button.

## Bottom Navigation Pattern

- **Marchand:** 5 tabs. Central mic button is an elevated FAB. Active color: `#C66A2C`.
- **Identificateur:** 5 tabs. Voice tab disabled (`opacity-50 pointer-events-none`). Active color: `#9F8170`.
- **Backoffice:** No bottom bar. Uses sidebar (260px/68px) + top header + status bar.

## Card Patterns

### Marchand Home Tiles

```tsx
<div className="grid grid-cols-2 gap-4">
  {items.map(item => (
    <button key={item.id} onClick={() => navigate(item.route)}
      className="bg-white rounded-2xl p-5 shadow-sm active:scale-[0.98] transition-transform">
      <div className="w-12 h-12 rounded-xl bg-[#C66A2C]/10 flex items-center justify-center">
        <Icon className="text-[#C66A2C]" size={24} />
      </div>
      <p className="text-sm font-semibold mt-3">{item.label}</p>
    </button>
  ))}
</div>
```

### Backoffice KPI Cards

```tsx
<div className="grid grid-cols-4 gap-4">
  {kpis.map(kpi => (
    <div key={kpi.label}
      className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
      <p className="text-2xl font-bold mt-1">{kpi.value}</p>
      <p className="text-xs text-emerald-500 mt-1">{kpi.change}</p>
    </div>
  ))}
</div>
```

## Backoffice Theme Pattern

Every backoffice screen (except `bo-auth-screen.tsx`) uses the `isDark` pattern:

```tsx
const { boTheme } = useBackofficeStore()
const isDark = boTheme === 'dark'

// Then conditional classes:
className={isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}
```

**Do not** use `dark:` Tailwind variant on backoffice screens. The backoffice manages
its own theme through the store, not through `next-themes`.

## State Management Patterns

### Reading state
```tsx
const { value, action } = useAppStore()
```

### Computed values inside stores
```tsx
// Inside store creator, use get() to read current state:
getCartTotal: () => {
  const { cart } = get()
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0)
}
```

### Store persistence
```tsx
persist(
  (set, get) => ({ /* ... */ }),
  { name: 'julaba-{domain}-store', partialize: (state) => ({ /* only persist what matters */ }) }
)
```

## Styling Conventions

### CN utility

Always use `cn()` for conditional classes:
```tsx
import { cn } from '@/lib/utils'
className={cn('base-class', isActive && 'active-class')}
```

### Inline styles

Use inline styles only for:
- Backoffice color constants (`style={{ color: BO_COLOR_PRIMARY }}`) — but prefer Tailwind conditional classes when possible.
- Dynamic values that cannot be expressed in Tailwind (e.g., computed widths, SVG transforms).

### Custom animations

Define in `globals.css` under `@layer utilities` or `@layer base`.
Name animations descriptively: `screen-enter`, `stepIn`, `shake`.

## Voice Integration Pattern (Marchand Only)

Every action that changes data should include voice feedback:

```tsx
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'

const handleAction = () => {
  // ... perform action ...
  tataSpeak('Vente enregistrée !')
  haptic('success')
}
```

Voice-only on marchand surface. See PD-002 and PD-007.