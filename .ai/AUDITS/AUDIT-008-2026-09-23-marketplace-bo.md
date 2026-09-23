# AUDIT-008 — Marketplace Back-Office Jùlaba

Date: 2026-09-23
Scope: BO marketplace UI/API, RBAC, catalogue, supplier orders, stock integration, navigation and marketplace data model.
Method: static audit of current main branch. Production/runtime behavior is not claimed as verified.

## Executive summary

The BO surface is now interactive: product cards, order rows and merchant rows are clickable; product create/edit/activation, order status transitions and merchant activation are server-wired; orders are returned by the API; audit logging is present.

The major architectural finding is that this is NOT yet a complete end-to-end marketplace administration system. The current module combines:
- merchant catalogue (legacy_products);
- merchant supplier procurement (legacy_supplier_orders);
- general merchant sales (legacy_sales).

There is no dedicated marketplace transaction model connecting buyer, seller, listing, line items, payment and delivery.

## Findings

| ID | Severity | Finding | Impact |
|---|---|---|---|
| MKT-001 | P0 | No dedicated marketplace order/listing domain | The BO cannot manage a true buyer-to-seller marketplace transaction lifecycle. |
| MKT-002 | P1 | Seller sales metric is general legacy_sales, not marketplace sales | A seller KPI can be interpreted incorrectly. |
| MKT-003 | P1 | Seller order count comes from supplier orders placed by the merchant | It is not the number of marketplace orders received by that seller. |
| MKT-004 | P1 | is_active is a catalogue activation flag, not a marketplace publication lifecycle | No draft/review/published/suspended/archived moderation workflow. |
| MKT-005 | P1 | Product media accepts only an external image URL | BO users cannot upload/manage product media directly. |
| MKT-006 | P1 | No pagination | The UI loads up to 500 products/orders into the browser. |
| MKT-007 | P2 | Seller directory is derived from products/orders | Merchants without activity are absent from the seller list. |
| MKT-008 | P2 | Seller status is coupled to legacy_bo_actors | Marketplace onboarding/status is not an independent domain concept. |
| MKT-009 | P2 | Supplier order detail lacks payment/delivery marketplace fields | Current orders cannot represent marketplace fulfilment. |
| MKT-010 | P2 | No order event timeline in UI | Operators see current status but not a complete operational history. |
| MKT-011 | P2 | Deactivation/cancellation has no confirmation dialog | Destructive actions are too easy to trigger. |
| MKT-012 | P2 | No dedicated marketplace tests found | Critical workflows lack regression coverage. |

## What is already correct

### RBAC
The marketplace module is present in the shared permission matrix and restricted to super_admin and admin_general. Server routes use requireBackofficePermission. Write actions are checked separately from read access.

### Product operations
The BO can create, edit, activate and deactivate products. Product activation is persisted server-side.

### Order operations
The API now returns supplier orders. Valid transitions are enforced server-side:
- en_attente → confirmee
- en_attente → annulee
- confirmee → livree
- confirmee → annulee

Reception calls the central stock purchase RPC before marking the supplier order as delivered.

### Stock integrity
The BO does not directly decrement/increment stock when receiving an order. It delegates to the existing transaction-safe stock service/RPC. This preserves the stock architecture and server-side stock invariants.

### UX
Clickable cards/rows, keyboard activation, detail dialogs, loading skeletons, empty/error states, search, filters, responsive layout and dark-mode treatment are present.

## Important semantic correction

The UI has been corrected so it no longer presents supplier procurement/general merchant sales as marketplace seller metrics.

The data currently means:
- Product = merchant catalogue entry.
- Commande = merchant supplier order.
- Merchant sales = general merchant sales.
- Merchant list = merchants with referenced catalogue/order activity.

Calling these marketplace GMV, marketplace orders received or published listings would be inaccurate.

## Architecture recommendation

Do not extend legacy_supplier_orders to simulate marketplace orders.

Introduce a dedicated marketplace domain:
- marketplace_seller_profiles
- marketplace_listings
- marketplace_listing_images
- marketplace_orders
- marketplace_order_items
- marketplace_order_events
- marketplace_payments
- marketplace_deliveries

Recommended listing lifecycle:
draft → pending_review → published → suspended → archived

Recommended order lifecycle should separately model payment and fulfilment rather than encoding everything in one status.

## Recommended implementation sequence

### P1 — BO hardening
1. Pagination.
2. Confirmation dialogs.
3. Success/error toast feedback.
4. Image upload via Supabase Storage.
5. Stock-history shortcut.
6. Marketplace route/component tests.

### P0 — Marketplace domain
1. Seller profile/onboarding.
2. Listing/publication model.
3. Buyer/seller order model.
4. Order items.
5. Payment state.
6. Delivery state.
7. Immutable order event history.

### P1 — BO marketplace
1. Listings/moderation.
2. Marketplace orders.
3. Sellers.
4. Payments.
5. Deliveries.
6. Moderation queue.
7. Marketplace-specific analytics.

## Runtime validation still required

This audit is static. Before production release, execute:
- bun run lint
- bun run typecheck
- bun run test
- bun run build
- bun run test:rls

Then test with real BO roles: super_admin, admin_general, a read-only role, and unauthenticated request.

Also test concurrent order reception and stock consistency against the target Supabase environment.

## Final assessment

Current state: functional BO catalogue + supplier-order administration.

Not yet complete: true end-to-end marketplace management.

The main missing capability is architectural, not cosmetic: listing → seller → buyer → order → payment → delivery → settlement must become a coherent marketplace domain before the module can honestly be considered complete.