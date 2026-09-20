# Surface: Marchand

Mobile-first POS for Ivorian market vendors. Voice-primary, offline-first, cash-only.

## Color System

| Token        | Value     | Usage                               |
| ------------ | --------- | ----------------------------------- |
| Primary      | `#C66A2C` | Buttons, active tabs, icon circles  |
| Primary light| `#E8944F` | Hover states, light accents         |
| Primary dark | `#9E5222` | Pressed states                     |
| Primary 50   | `#FDF3ED` | Subtle backgrounds                 |
| Primary 100  | `#FBE4D5` | Card backgrounds, active states     |
| Background   | `#FAFAF7` | Page background (warm off-white)    |

## Layout

- Single column, full width.
- `px-4` horizontal padding. `space-y-4` or `space-y-6` vertical rhythm.
- Sticky header with back button and screen title.
- Fixed bottom navigation bar (h-16, 64px).
- Central mic FAB: `bottom-20 right-1/2 translate-x-1/2`, elevated above nav bar.
- Screen root: `screen-enter pb-24`.

## Key Screens

### Auth
- Three methods: PIN (numpad), pattern lock, visual code grid.
- Registration flow: 5-step wizard with voice narration.
- Demo account: `0701020304` / `1234`.

### Home
- Greeting: "Maman {Name}" (PD-003).
- Today's stats: total ventes, dépenses, solde.
- 2×2 navigation grid: Caisse, Stock, Dépenses, Ventes.
- Soleil mode toggle in header.

### Caisse (Cash Register)
- Cart at bottom, product search/grid at top.
- Running total with FCFA formatting.
- Voice: "Tomates deux mille" adds to cart.
- Bill breakdown on payment: shows banknote denominations.

### Voice Modal
- Push-to-talk: hold to record, release to send.
- States: idle → listening → processing → confirm → success/error.
- Audio feedback beeps + haptic vibration — emitted AT THE VERDICT, never at
  intent receipt (UI-MP-007: success beep/vibration only in actually reached
  success branches; error signal on every failure; `haptic('medium')` for
  "queued, pending sync").
- Auto-close 2-3s after final state.
- **Dark surface assumée (décision UI-MP-008/009, 2026-09-20)** : les modales
  vocales (voice-modal, vente-rapide-modal, open-caisse-modal, prod-voice-modal)
  restent sombres (`bg-stone-900`) même en mode soleil — la voix est un canal
  d'attention distinct ; en soleil, le texte est agrandi, pas recoloré.
- L'état vocal est toujours annoncé au lecteur d'écran : conteneur d'état avec
  `role="status" aria-live="polite"` (UI-MP-019).

## Soleil Mode

Every new marchand screen MUST be checked in soleil mode:

| Property       | Normal        | Soleil          |
| -------------- | ------------- | --------------- |
| Background     | `#FAFAF7`    | `#FFFFFF`      |
| Text weight    | Normal        | `font-weight: 600` |
| Heading size   | `text-xl`    | `text-2xl`     |
| Body size      | `text-sm`    | `text-base`    |
| Icon size      | `w-5 h-5`    | `w-6 h-6`      |

Implementation: `soleilMode` from `useAppStore()`. Conditional classes via `soleilMode ? 'text-black' : ''` and `soleilMode ? 'text-xl' : 'text-lg'`.

## Interaction Patterns

### Voice Confirmation Loop
For sales and expenses, Tata reads back the intent and waits for confirmation:
1. User speaks intent → parsed
2. Tata: "Ajouter tomates, deux mille cinq cents francs ?"
3. User: "Oui" → execute / "Non" → cancel

### Swipe-to-Delete
- Available in cart items and some lists.
- Use Framer Motion `Reorder` or `useDragControls`.

### Pull Actions
- Not yet implemented. If adding, prefer inline action buttons over hidden swipe menus for discoverability.

## States to Cover

- **Loading:** Skeleton screens, not spinners, for content areas.
- **Empty:** Short message + actionable button (see `copy.md`).
- **Error:** Red-tinted banner with retry action. Voice says "Une erreur est survenue. Réessayez."
- **Offline:** App works fully offline. No offline-specific UI needed unless sync features are added.
- **Soleil:** Verified on every new screen.
- **Long content:** Product names up to 30 chars, prices up to 8 digits.
- **Constrained width:** Tested at 375px minimum.