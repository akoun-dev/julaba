# Task 7c: Migrate 7 More Backoffice Screens from Hardcoded to API Data

## Summary
Updated 7 additional backoffice screen components to fetch data from their corresponding API routes instead of using hardcoded mock data. One screen (events) had no DB-backed API yet, so a TODO comment was added.

## Files Modified

1. **bo-livraison-screen.tsx** — Fetches from `/api/backoffice/deliveries` → `{ deliveries: [...] }`
2. **bo-cron-screen.tsx** — Fetches from `/api/backoffice/cron` → `{ jobs: [...] }`
3. **bo-config-institution-screen.tsx** — Fetches from `/api/backoffice/config` → `{ configs: [...] }`
4. **bo-marketplace-screen.tsx** — Fetches from `/api/backoffice/marketplace` → `{ products: [...], orders: [...] }`
5. **bo-analytics-screen.tsx** — Fetches from `/api/backoffice/analytics` → `{ dau, mau, avgSession, adoptionRate, featureUsage, topFeatures, retentionFunnel }`
6. **bo-monitoring-ia-screen.tsx** — Fetches from `/api/backoffice/monitoring` → `{ dailyRequests, modelErrors, modelVersion, systemMetrics, accuracy, responseTime, dailyRequestCount, errorRate }`
7. **bo-events-screen.tsx** — No API yet. Added TODO comment about replacing mock event stream with real event source (WebSocket/SSE/polling).

## Changes Per File

### Pattern applied to files 1-6 (same as 7b):
1. **Removed** hardcoded mock data constants
2. **Added** `useEffect` + `useCallback` (`fetchData`) that calls `fetch('/api/backoffice/...')` on mount
3. **Added** `loading` state (boolean) and `error` state (string | null)
4. **Replaced** `useState<Type[]>(HARDCODED_ARRAY)` with `useState<Type[]>([])`
5. **Added** `Skeleton` components from `@/components/ui/skeleton` for all loading states (stat cards, list items, table rows, chart sections)
6. **Added** error state UI with `AlertCircle` icon, error message, and "Réessayer" (retry) button
7. **Added** empty state conditions: show empty states only when `!loading && !error && data.length === 0`
8. **Preserved** all visual design, layout, client-side actions (CRUD, status toggles, filters, etc.)

### Special handling:
- **bo-config-institution-screen.tsx**: Config data is a flat key-value array. A helper approach maps config keys to form state on fetch. Full-page skeleton + error state replaces the normal UI during load/error.
- **bo-analytics-screen.tsx**: DAU chart data generated client-side (30 days). KPIs, featureUsage, topFeatures, retentionFunnel all come from API.
- **bo-marketplace-screen.tsx**: Sellers tab derives sellers from unique product.seller values. Stats cards compute from fetched data (products count, rupture count, orders count, total volume).
- **bo-events-screen.tsx**: Only added a TODO comment. Mock event stream preserved as-is.

## Lint Results
- 0 errors in all 7 modified files
- All pre-existing errors are in other untouched files (bo-audit, bo-dashboard, bo-enrolement, bo-supervision, identificateur, page.tsx, orbit-otp)