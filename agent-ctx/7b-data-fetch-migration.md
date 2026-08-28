# Task 7b: Migrate 8 Backoffice Screens from Hardcoded to API Data

## Summary
Updated 8 backoffice screen components to fetch data from their corresponding API routes instead of using hardcoded mock data.

## Files Modified

1. **bo-institutions-screen.tsx** — Fetches from `/api/backoffice/institutions` → `{ institutions: [...] }`
2. **bo-mutations-screen.tsx** — Fetches from `/api/backoffice/mutations` → `{ mutations: [...] }`
3. **bo-moderation-screen.tsx** — Fetches from `/api/backoffice/moderation` → `{ reports: [...] }`
4. **bo-contenus-screen.tsx** — Fetches from `/api/backoffice/contenus` → `{ contents: [...] }`
5. **bo-communication-screen.tsx** — Fetches from `/api/backoffice/communications` → `{ communications: [...] }`
6. **bo-scores-screen.tsx** — Fetches from `/api/backoffice/scores` → `{ scores: [...], distribution: [...] }`
7. **bo-api-keys-screen.tsx** — Fetches from `/api/backoffice/api-keys` → `{ keys: [...] }`
8. **bo-keiwa-screen.tsx** — Fetches from `/api/backoffice/keiwa` → `{ accounts, transactions, totalBalance, todayCount, todayVolume, activeAccounts }`

## Changes Per File

### Pattern applied to every file:
1. **Removed** hardcoded `INITIAL_*` / `MOCK DATA` constants
2. **Added** `useEffect` + `useCallback` (`fetchData`) that calls `fetch('/api/backoffice/...')` on mount
3. **Added** `loading` state (boolean) and `error` state (string | null)
4. **Replaced** `useState<Type[]>(HARDCODED_ARRAY)` with `useState<Type[]>([])`
5. **Added** `Skeleton` components from `@/components/ui/skeleton` for all loading states (stat cards, list items, table rows)
6. **Added** error state UI with `AlertCircle` icon, error message, and "Réessayer" (retry) button
7. **Added** empty state conditions: show empty states only when `!loading && !error && data.length === 0`
8. **Added** imports: `useEffect`, `useCallback`, `Skeleton`, `AlertCircle`, `RefreshCw`, `Loader2` (where applicable)
9. **Preserved** all visual design, layout, client-side actions (CRUD, status toggles, etc.)

## Lint Results
- 0 errors in all 8 modified files
- All pre-existing errors are in other untouched files (bo-audit, bo-dashboard, bo-enrolement, bo-supervision, identificateur)