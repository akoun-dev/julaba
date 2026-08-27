# Interface Quality

Visual, interaction, and accessibility standards for Jùlaba.

## Visual Hierarchy

### Typography
- **Font family:** Geist Sans (variable weight) for all UI. Geist Mono for code/technical values.
- **FCFA amounts:** Apply the `.fcfa` class for `font-variant-numeric: tabular-nums; letter-spacing: 0.02em`.
- **Soleil mode:** All text gets `font-weight: 600`. Headings bump one size up (e.g. `text-lg` → `text-xl`).

### Color
- **Marchand:** Primary `#C66A2C` (terracotta). Background `#FAFAF7` (warm off-white). Light variant `#E8944F`.
- **Identificateur:** Primary `#9F8170` (muted brown). Same warm background.
- **Backoffice:** Primary `#3B82F6` (blue). Light: bg `#F8FAFC`. Dark: bg `#121319` (auth), `#0F172A` (layout).
- **NO indigo or blue** on marchand/identificateur surfaces unless explicitly requested.
- **Semantic colors:** Use Tailwind's built-in semantic tokens (`text-destructive`, `bg-emerald-*`) rather than raw hex.

### Spacing
- Use the 4px grid. Prefer Tailwind's spacing scale (`p-4`, `gap-6`, `space-y-3`).
- Consistent padding: `p-4` or `p-6` for card content. `gap-4` or `gap-6` between cards.
- Bottom bar height: 64px (h-16). Screens use `pb-24` to account for it.

### Cards
- Marchand/identificateur: rounded-xl or rounded-2xl, warm shadows.
- Backoffice: rounded-2xl, `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` in light, `border border-slate-700/50` in dark.
- All cards have consistent internal padding (p-4 minimum).

## Interaction

### Touch Targets
- Minimum 44×44px for all interactive elements on mobile (marchand, identificateur).
- Use the `touch-target` animation class for visual feedback on tap.

### Transitions
- Default: `transition-all duration-200 ease` or Tailwind's `transition-*` utilities.
- Screen transitions: `screen-enter` class (fade-in-up, 250ms) on every screen root.
- Wizard steps: `stepIn` class (slide from right).

### Modals & Overlays
- **Marchand:** Custom fixed overlays with `animate-in slide-in-from-bottom` (sheet-like).
- **Identificateur:** shadcn `Sheet` (bottom drawer) for editing, `AlertDialog` for confirmations.
- **Backoffice:** shadcn `Dialog` for forms, `DropdownMenu` for actions.
- Never nest modals. One overlay at a time.

### Loading States
- Show spinners/skeletons during async operations.
- Keep control labels stable (don't swap "Submit" for "Loading…" in a way that shifts layout).
- Use the component's built-in loading/busy affordance when available.

### Pull-to-Refresh & Infinite Scroll
- Not currently implemented. If adding, prefer pull-to-refresh over explicit refresh buttons on mobile.

## Accessibility

### Semantic HTML
- Use `main`, `header`, `nav`, `section`, `article`, `footer`.
- Use `role` and `aria-label` for non-semantic interactive elements.
- Use `sr-only` class for screen-reader-only content.

### Keyboard
- All interactive elements must be keyboard accessible.
- Maintain logical tab order.
- Visible focus rings: use Tailwind's `focus-visible:ring-*` utilities.
- Do not override shadcn's focus ring with custom implementations.

### Alt Text
- All images must have descriptive `alt` attributes.
- Decorative images use `alt=""`.

### Color Contrast
- Minimum WCAG AA (4.5:1 for normal text, 3:1 for large text).
- Soleil mode exists specifically to meet this requirement outdoors.

### Icons
- **Lucide React exclusively.** No emoji characters in shipped UI code (see `rules.md` > rule/no-emoji-in-ui).
- Icon buttons must have accessible names (`aria-label`).

## Responsive Design

### Marchand & Identificateur (Mobile-First)
- Design for 375px first. Enhance for wider phones (414px).
- No tablet-specific layouts needed — mobile layout scales up.
- Test in both portrait and landscape.

### Backoffice (Desktop-First)
- Design for 1280px first.
- Sidebar: 260px expanded, 68px collapsed. Responsive: full sidebar on desktop, hidden on mobile.
- Min-width for data tables: `min-w-[600px]` with horizontal scroll.
- Data lists: `max-h-96 overflow-y-auto` with custom scrollbar.

## Animations

Use Framer Motion for complex transitions (splash screen, route changes).
Use CSS animations for simple loops and micro-interactions:

- `screen-enter`: fade-in-up for screen entry
- `stepIn`: slide from right for wizard steps
- `shake`: error/wrong-input feedback
- `pulse-ring`: PTT button recording indicator
- `voice-wave-bar`: voice waveform bars
- `haptic`: subtle horizontal shake for haptic simulation

**Rule:** Animations should clarify state, not decorate. If an animation doesn't
communicate a state change, interaction, or brand moment, remove it.
