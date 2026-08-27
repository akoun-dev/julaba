# Surface: Backoffice

Desktop-first admin panel with RBAC, 24 modules, dark/light theme.

## Color System

### Light Theme (default)
| Token    | Value     | Usage                                  |
| -------- | --------- | -------------------------------------- |
| Primary  | `#3B82F6` | Active states, links, accents          |
| Text     | `#0F172A` | Headings, primary text                 |
| Text light| `#64748B` | Descriptions, secondary text           |
| BG       | `#F8FAFC` | Page background                        |
| Border   | `#E2E8F0` | Cards, dividers, input borders          |
| Card BG  | `#FFFFFF` | Card backgrounds                       |

### Dark Theme
| Token    | Value     | Usage                                  |
| -------- | --------- | -------------------------------------- |
| Primary  | `#3B82F6` | Same                                  |
| Text     | `#F1F5F9` | Headings, primary text                 |
| Text light| `#94A3B8` | Descriptions, secondary text           |
| BG       | `#0F172A` | Page background                        |
| Border   | `#1E293B` | Cards, dividers, input borders          |
| Card BG  | `#1E293B` | Card backgrounds                       |

### Auth Screen (always dark)
| Token    | Value     | Usage                                  |
| -------- | --------- | -------------------------------------- |
| BG       | `#121319` | Full-page background                   |
| Left panel| `#0B0C10` | Branding panel                         |
| Card     | Gradient  | `rgba(30,32,42,0.95)` → `rgba(18,19,25,0.98)` |
| Accent   | `#3B82F6` | Glow, focus rings, progress bars       |

## Layout

### Structure
```
┌──────────────┬────────────────────────────────────┐
│              │  Header (search, notifications, user)│
│  Sidebar     ├────────────────────────────────────┤
│  (260/68px)  │                                    │
│              │  Main content area                 │
│              │  (p-6, space-y-6)                  │
│              │                                    │
│              ├────────────────────────────────────┤
│              │  Status bar (API, BDD, STT, SMS)    │
└──────────────┴────────────────────────────────────┘
```

- Sidebar: `w-[260px]` expanded, `w-[68px]` collapsed. Fixed position.
- Header: `h-16`, sticky top, full width minus sidebar.
- Status bar: `h-8`, fixed bottom, full width.
- Main content: `p-6 space-y-6`.

### Responsive
- Below 1024px: sidebar hidden, accessible via hamburger menu.
- Data tables: `min-w-[600px]` with horizontal scroll container.
- Cards: grid cols adapt (4 → 2 → 1).

## RBAC

5-tier hierarchy: `super_admin(5) > admin_general(4) > admin_national(3) > gestionnaire_zone(2) > operateur_terrain(1)`.

```tsx
import { hasModuleAccess } from '@/lib/stores/backoffice-store'
const canAccess = hasModuleAccess(userRole, 'utilisateurs')
```

Sidebar items are hidden if the user lacks access. Do not render a disabled menu item — hide it entirely.

## Theme Pattern

```tsx
const { boTheme } = useBackofficeStore()
const isDark = boTheme === 'dark'

// Use ternary classes:
className={isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
```

**Do NOT** use Tailwind's `dark:` variant on backoffice screens. The backoffice uses its own theme managed through the Zustand store, not `next-themes`.

## Auth Screen (Exception)

The auth screen (`bo-auth-screen.tsx`) and OTP component (`orbit-otp.tsx`) use **styled-jsx**, not Tailwind. This is intentional (PD-006).

- 3-step flow: credentials → MFA OTP → success.
- Split layout: left branding panel (desktop) / form card (right).
- Mobile: left panel hidden, mobile logo shown.
- OrbitOtp component: 51×51px boxes, SVG orbit animation on verification.

## Key Screens

### Dashboard
- Ticker bar: real-time metrics (tr/min, uptime).
- 4 KPI cards in grid.
- Region chart (horizontal BarChart), enrolment trend (AreaChart).
- System health (2×2 grid), data quality (SVG gauges).
- Top identificateurs (ranked list), quick access links.

### Actors
- Data table with search, type filter, status filter.
- Actions: view, suspend (with reason), delete.

### Enrolment
- Queue of pending dossiers.
- Actions: validate, reject (with reason textarea), request info.

### Users
- Super admin only.
- CRUD for BO user accounts.

## States to Cover

- **Loading:** Skeleton cards, skeleton table rows.
- **Empty:** "Aucun acteur trouvé" with filter reset link.
- **Sparse:** < 5 items in a list — avoid empty-feeling layouts.
- **Error:** Red banner with message and retry. `isDark`-aware styling.
- **Permission denied:** Hidden sidebar items. If navigated directly, show access denied message.
- **Long content:** Truncate table cells, show full content in Dialog/Sheet.
- **Wide data:** Horizontal scroll on tables. No text wrapping in numeric columns.
