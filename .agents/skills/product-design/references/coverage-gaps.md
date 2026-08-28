# Coverage Gaps

Areas where we do not yet have a standard. These should be addressed before
they cause inconsistent shipped code.

## High Priority

### CG-001: Resilience Reference
- **Missing:** `references/resilience.md` — offline error handling, network retry,
  data conflict resolution, stale data detection.
- **Impact:** Every screen that interacts with the (future) API layer.
- **Blocker:** None yet (app is primarily offline/client-side).

### CG-002: Backoffice Form Standards
- **Missing:** Decision on form layout, validation timing, error display pattern,
  and progressive disclosure for the 24 backoffice modules.
- **Impact:** Each new BO module makes ad-hoc form decisions.
- **Current behavior:** Forms vary between Dialog-embedded and inline. No standard
  validation timing (blur vs. submit vs. live).

### CG-003: Empty State Illustrations
- **Missing:** Should empty states have illustrations/icons? What Lucide icon
  represents which empty state?
- **Impact:** Inconsistent empty-state visuals across surfaces.
- **Current behavior:** Text-only empty states with action buttons. No illustrations.

## Medium Priority

### CG-004: Notification/Toast Standards
- **Missing:** When to use toast vs. inline feedback vs. banner.
- **Impact:** Inconsistent feedback patterns.
- **Current behavior:** shadcn `Toast` is installed but usage varies.

### CG-005: Data Table Column Width Strategy
- **Missing:** Standard column widths and truncation rules for backoffice tables.
- **Impact:** Tables look different across modules.
- **Current behavior:** `min-w-[600px]` scroll, but column proportions vary.

### CG-006: Identificateur GPS Accuracy Threshold
- **Missing:** What GPS accuracy is acceptable before flagging a warning?
- **Impact:** Field agents may submit dossiers with poor GPS data.
- **Current behavior:** GPS captured but no accuracy threshold enforced.

### CG-007: Sync Conflict Resolution
- **Missing:** Strategy for when local state conflicts with server state after sync.
- **Impact:** Future API integration will need this.
- **Current behavior:** No sync exists yet. Pure client-side state.

## Low Priority

### CG-008: Dark Mode for Marchand/Identificateur
- **Missing:** The backoffice has dark mode. The marchand and identificateur surfaces do not.
- **Impact:** Minor — these surfaces are used outdoors where dark mode is less useful.
- **Current behavior:** Not implemented. Soleil mode serves the outdoor readability need.

### CG-009: Animation Easing Standards ~~(CLOSED)~~
- **Status:** Closed — resolved by `animation-standards.md`, `design-engineering.md`, `animation-review.md`.
- **Resolution:** Standard easing curves (`--ease-out`, `--ease-in-out`, `--ease-drawer`) defined. Duration budgets per element type. Per-surface personality guidance. Six new rules added to `rules.md`. Frequency table decides whether to animate at all.

### CG-010: Printer/Receipt Support
- **Missing:** Should the caisse module support receipt printing?
- **Impact:** Market vendors may want printed receipts.
- **Current behavior:** Not implemented.
