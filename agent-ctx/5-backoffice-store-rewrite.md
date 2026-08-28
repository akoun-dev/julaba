---
Task ID: 5
Agent: Store Rewrite Agent
Task: Rewrite backoffice store to fetch ALL data from API routes instead of hardcoded mock data

Work Log:
- Read the existing backoffice-store.ts (549 lines) containing all types, constants, mock data, and Zustand store
- Read all 8 relevant API routes to understand their request/response shapes:
  - `GET /api/backoffice` (dashboard) → returns counts, region data, trends, system health
  - `GET /api/backoffice/actors?limit=999` → `{ actors, total, page, limit, totalPages }`
  - `GET /api/backoffice/enrolments?limit=999` → `{ enrolments, total, page, limit, totalPages }`
  - `GET /api/backoffice/users` → array of BoUser objects
  - `GET /api/backoffice/zones` → enriched zone array with actualActorCount, enrolmentCount
  - `GET /api/backoffice/missions` → array of mission objects
  - `GET /api/backoffice/audit?limit=999` → `{ logs, total, page, limit, totalPages }`
  - `GET /api/backoffice/alerts` → array of alert objects
- Read the Prisma schema (20 models) to understand field types and nullability
- Removed all mock data generation: MOCK_BO_USERS, FIRST_NAMES, LAST_NAMES, ZONES, IDENTIFICATEURS, generateMockActors, MOCK_ACTORS, generateMockEnrolments, MOCK_ENROLMENTS, MOCK_ZONES, MOCK_MISSIONS, MOCK_AUDIT, MOCK_ALERTS, randomPhone helper
- Added `DashboardData` interface with all required fields
- Added `loading`, `error`, `setLoading`, `setError` to store state
- Added 8 individual fetch functions (fetchUsers, fetchActors, fetchEnrolments, fetchZones, fetchMissions, fetchAuditLog, fetchAlerts, fetchDashboard) + fetchAllData using Promise.allSettled
- Created mapper functions for each entity type to convert Prisma/API responses to TypeScript types:
  - mapUserFromApi, mapActorFromApi, mapEnrolmentFromApi, mapZoneFromApi, mapMissionFromApi, mapAuditEntryFromApi, mapAlertFromApi, mapDashboardFromApi
- Updated mutation actions to call API + optimistic local state update with rollback on error:
  - updateActorStatus → PATCH /api/backoffice/actors
  - validateEnrolment → PATCH /api/backoffice/enrolments (action: 'valider')
  - rejectEnrolment → PATCH /api/backoffice/enrolments (action: 'rejeter')
  - acknowledgeAlert → PATCH /api/backoffice/alerts
  - updateUser → PATCH /api/backoffice/users
  - createUser → POST /api/backoffice/users
- All data arrays start empty, ticker starts with zeros
- Persist middleware unchanged (only persists boUserRole, sidebarCollapsed, boCurrentScreen, boTheme)
- Added onRehydrateStorage callback to auto-call fetchAllData() after persist loads
- Verified: 0 lint errors in the rewritten file, dev server compiles successfully

Stage Summary:
- Complete rewrite of backoffice-store.ts from 549 lines to ~490 lines
- All mock data removed, all data now fetched from API routes
- 8 entity mapper functions handle Prisma DateTime→string conversion and field mapping
- All 6 mutation actions are async with optimistic updates and rollback
- Auto-fetch on rehydration ensures fresh data on app load
- All exported types, constants, and the useBackofficeStore hook name preserved

Files modified: src/lib/stores/backoffice-store.ts
