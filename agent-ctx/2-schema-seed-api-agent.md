# Task 2 - Schema+Seed+API Agent

## Work Summary

### Step 1: Extended Prisma Schema
Added 14 new models to `prisma/schema.prisma` (all existing models preserved):
- BoEnrolment, BoAlert, BoInstitution, BoMutation, BoModerationReport
- BoContent, BoCommunication, BoApiKey, BoDelivery, BoCronJob
- BoCreditScore, BoKeiwaTransaction, BoKeiwaAccount, BoPlatformConfig

Note: Added `accountId` + `account` relation field on BoKeiwaTransaction to satisfy Prisma's one-to-many requirement (implicit from the user's `transactions BoKeiwaTransaction[]` on BoKeiwaAccount).

Schema pushed successfully with `bun run db:push`.

### Step 2: Created Seed Script
File: `prisma/seed.ts` (~290 lines)

Idempotent seed (delete-then-create pattern) that creates:
1. 7 BoUsers (admin@julaba.ci etc.)
2. 12 BoZones (Adjamé through Man)
3. 50 BoActors (realistic Ivorian names)
4. 30 BoEnrolments (various statuses)
5. 5 BoMissions
6. 15 AuditLog entries
7. 5 BoAlerts (4 unacknowledged)
8. 20 Products for merchant-1
9. 6 BoInstitutions (DGE, ANSUT, CNPS, CNAM, MINAGRI, BCEAO)
10. 5 BoMutations
11. 5 BoModerationReports
12. 8 BoContents (tutoriels, FAQ, articles)
13. 5 BoCommunications
14. 6 BoApiKeys
15. 12 BoDeliveries
16. 9 BoCronJobs
17. 12 BoCreditScores
18. 12 BoKeiwaTransactions (linked to accounts)
19. 10 BoKeiwaAccounts
20. 5 BoPlatformConfig entries

Added `"seed": "bun run prisma/seed.ts"` to package.json scripts.

### Step 3: Created 25 API Route Files

**Backoffice (22 routes):**
- `/api/backoffice` - Dashboard stats (aggregate data)
- `/api/backoffice/actors` - CRUD with search/filter/pagination
- `/api/backoffice/enrolments` - List + validate/reject
- `/api/backoffice/zones` - List with counts + create
- `/api/backoffice/missions` - CRUD
- `/api/backoffice/users` - CRUD
- `/api/backoffice/audit` - List with filters/pagination
- `/api/backoffice/alerts` - List + acknowledge
- `/api/backoffice/institutions` - Full CRUD
- `/api/backoffice/mutations` - List + approve/reject
- `/api/backoffice/moderation` - List + handle
- `/api/backoffice/contenus` - CRUD
- `/api/backoffice/communications` - List + create
- `/api/backoffice/scores` - List with filters
- `/api/backoffice/api-keys` - Full CRUD
- `/api/backoffice/keiwa` - Accounts + transactions + aggregate
- `/api/backoffice/deliveries` - List + update status
- `/api/backoffice/cron` - List + toggle status
- `/api/backoffice/config` - Get all + upsert by category
- `/api/backoffice/marketplace` - Products + categories
- `/api/backoffice/analytics` - DAU/MAU + feature usage + retention
- `/api/backoffice/monitoring` - System health + services

**Marchand (3 routes):**
- `/api/marchand/products` - Full CRUD
- `/api/marchand/sales` - List + create with items
- `/api/marchand/expenses` - List + create

All routes: French error messages, NextResponse.json(), try/catch, proper HTTP status codes.

### Issues Encountered
1. BoKeiwaAccount's `transactions BoKeiwaTransaction[]` needed a back-relation field on BoKeiwaTransaction (added `accountId` + `account`)
2. BoZone `include._count.actors` TS error (BoZone has no actors relation) - fixed by removing the include, using groupBy instead
3. Pre-existing lint warnings (emoji in JSX, set-state-in-effect) not from this task

### Files Created/Modified
- Modified: `prisma/schema.prisma`, `package.json`
- Created: `prisma/seed.ts`
- Created: 22 backoffice API route files, 3 marchand API route files
- Total: 25 new files, ~1900 lines of code