# Rules Index

Stable rule IDs, scope, rationale, and examples.

---

## rule/no-emoji-in-ui

- **Scope:** All surfaces, all files
- **Rule:** Do not use emoji characters in JSX text content. Use Lucide React icons instead.
- **Why:** Emojis render inconsistently across platforms, are inaccessible to screen readers, and break the visual consistency of the product. The project migrated 27 emoji instances to Lucide icons; this rule prevents regression.
- **Source:** Worklog (emoji→icon migration). `copy.md` (tone standards). `interface-quality.md` (Icons section).
- **Lint:** Yes — see `tooling/lint-rules/no-emoji-in-jsx.js`.
- **Exceptions:** Emoji in `localIntent.ts` voice vocabulary (not rendered in UI). Emoji in test fixtures.
- **Bad:** `<span>\u2705 Validé</span>`
- **Good:** `<CheckCircle2 size={14} className="text-emerald-500" /> Validé`

---

## rule/destructive-verb-noun

- **Scope:** All surfaces
- **Rule:** Destructive action buttons follow **Verb + Object** format. Never use "Confirmer", "OK", or a bare verb alone.
- **Why:** The user must know exactly what will be destroyed before clicking. A bare "Confirmer" on a destructive dialog is ambiguous.
- **Source:** `copy.md` > Destructive Action Copy.
- **Lint:** No — requires product context to identify which buttons are destructive.
- **Exceptions:** None.
- **Bad:** `<button>OK</button>` on a delete confirmation dialog
- **Good:** `<button>Supprimer le produit</button>`

---

## rule/fcfa-format

- **Scope:** All surfaces
- **Rule:** All displayed money amounts must use `formatFCFA()` and apply the `.fcfa` CSS class.
- **Why:** Consistent formatting (thin-space thousands separator, "FCFA" suffix) and tabular number alignment. Raw integers are not readable for money values.
- **Source:** PD-005. `interface-quality.md` > Typography.
- **Lint:** No — requires understanding which numbers represent money.
- **Exceptions:** Internal calculations, form input values (before formatting on blur/submit).
- **Bad:** `<span>{price}</span>`
- **Good:** `<span className="fcfa">{formatFCFA(price)}</span>`

---

## rule/backoffice-isdark-pattern

- **Scope:** Backoffice screens (except auth)
- **Rule:** Use `const isDark = boTheme === 'dark'` with ternary classes. Do NOT use Tailwind's `dark:` variant.
- **Why:** The backoffice manages its own theme through the Zustand store, independently of `next-themes`. Using `dark:` would couple BO theming to the global theme provider.
- **Source:** PD-006. `patterns.md` > Backoffice Theme Pattern.
- **Lint:** No — requires understanding which files are backoffice screens.
- **Exceptions:** `bo-auth-screen.tsx` and `orbit-otp.tsx` use styled-jsx (PD-006).
- **Bad:** `className="dark:bg-slate-800 bg-white"`
- **Good:** `className={isDark ? 'bg-slate-800' : 'bg-white'}`

---

## rule/screen-enter-class

- **Scope:** All surface screen components
- **Rule:** The root div of every screen must include the `screen-enter` class.
- **Why:** Consistent fade-in animation for all screen transitions. Without it, screens appear abruptly.
- **Source:** `interface-quality.md` > Transitions. `patterns.md` > Screen Component Pattern.
- **Lint:** No — requires understanding which components are screen roots.
- **Exceptions:** `bo-auth-screen.tsx` (has its own entry animation). Modal/overlay content.
- **Bad:** `<div className="pb-24">`
- **Good:** `<div className="screen-enter pb-24">`

---

## rule/error-message-what-plus-what-to-do

- **Scope:** All surfaces
- **Rule:** Error messages must state what happened AND what the user should do. Never show a bare error label.
- **Why:** A message like "Erreur" gives the user no information and no path forward.
- **Source:** `copy.md` > Error Messages.
- **Lint:** No — requires semantic understanding of error context.
- **Exceptions:** System-level crashes that show a generic error boundary.
- **Bad:** `<p className="text-red-500">Erreur</p>`
- **Good:** `<p className="text-red-500">Pas de connexion. Vérifiez votre réseau.</p>`

---

## rule/voice-feedback-marchand

- **Scope:** Marchand surface only
- **Rule:** Every data-mutating action must call `tataSpeak()` and `haptic()` for user feedback.
- **Why:** Voice is the primary interaction model for marchands (PD-002). Silent actions break the voice-first contract.
- **Source:** PD-002. `product-judgment.md`. `patterns.md` > Voice Integration Pattern.
- **Lint:** No — requires understanding which functions mutate data.
- **Exceptions:** Navigation-only actions. Settings toggles that don't affect data.
- **Bad:** `const handleSale = () => { addToCart(item) }`
- **Good:** `const handleSale = () => { addToCart(item); tataSpeak('Vente enregistrée !'); haptic('success') }`

---

## rule/bottom-bar-clearance

- **Scope:** Marchand and identificateur screens
- **Rule:** Screen root must include `pb-24` (96px) to clear the fixed bottom navigation bar.
- **Why:** Without bottom padding, the last content elements are hidden behind the nav bar.
- **Source:** `interface-quality.md` > Spacing. `patterns.md` > Screen Component Pattern.
- **Lint:** No — requires understanding which screens have bottom bars.
- **Exceptions:** Full-screen overlays, modals, auth screens.
- **Bad:** `<div className="screen-enter">`
- **Good:** `<div className="screen-enter pb-24">`

---

## rule/no-transition-all

- **Scope:** All surfaces, all files
- **Rule:** Do not use `transition-all` or `transition: all`. Specify the exact properties being animated.
- **Why:** `transition-all` animates unintended properties (background-color, padding, etc.) that may trigger expensive layout/paint. It also makes the animation's intent unclear.
- **Source:** `animation-standards.md` > Performance. `animation-review.md` > Escalation Triggers. Emil Kowalski design engineering.
- **Lint:** Yes — `tooling/lint-rules/no-transition-all.mjs`.
- **Exceptions:** Rapid prototyping (not shipped code).
- **Bad:** `className="transition-all duration-200"`
- **Good:** `className="transition-transform duration-150 ease-out"` or `className="transition-opacity duration-200 ease-out"`

---

## rule/no-scale-zero

- **Scope:** All surfaces, all files
- **Rule:** Never animate elements from `scale(0)`. Start from `scale(0.95)` or higher, combined with `opacity: 0`.
- **Why:** Nothing in the real world appears from nothing. Elements entering from `scale(0)` look like they come out of nowhere.
- **Source:** `animation-standards.md` > Physicality. `design-engineering.md` > Component Building Principles. `animation-review.md` > Standard 5.
- **Lint:** No — requires understanding animation context.
- **Exceptions:** Decorative particles/dots that represent abstract concepts (not UI elements).
- **Bad:** `style={{ transform: 'scale(0)' }}` as initial animation state
- **Good:** `className="scale-95 opacity-0"` → `className="scale-100 opacity-100 transition-all duration-200 ease-out"`

---

## rule/no-ease-in-ui

- **Scope:** All surfaces, all files
- **Rule:** Never use `ease-in` on UI element animations. Entering/exiting elements must use `ease-out` or the custom `--ease-out` curve.
- **Why:** `ease-in` starts slow, delaying the exact moment the user is watching most closely. It makes the interface feel sluggish and unresponsive.
- **Source:** `animation-standards.md` > Easing Curves. `animation-review.md` > Standard 3. Emil Kowalski design engineering.
- **Lint:** Yes — `tooling/lint-rules/no-ease-in-ui.mjs`.
- **Exceptions:** `@keyframes` that specifically need slow-start (rare, requires documented justification).
- **Bad:** `animation: slideIn 300ms ease-in`
- **Good:** `animation: slideIn 200ms ease-out` or `transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1)`

---

## rule/sub-300ms-ui

- **Scope:** All surfaces, all UI element animations
- **Rule:** UI element animations must complete in under 300ms. Longer durations require explicit justification.
- **Why:** A 180ms dropdown feels more responsive than a 400ms one. Users perceive faster animations as a faster app.
- **Source:** `animation-standards.md` > Duration Budgets. `animation-review.md` > Standard 4.
- **Lint:** No — requires understanding which values are animation durations.
- **Exceptions:** OTP orbit (~800ms, state indication, rare/first-time), splash screen (brand moment, once per session), onboarding steps (delight, seen once), success celebrations (rare).
- **Bad:** `transition: opacity 400ms ease` on a dropdown
- **Good:** `transition: opacity 200ms ease-out` on a dropdown

---

## rule/gpu-only-animate

- **Scope:** All surfaces, all files
- **Rule:** Only animate `transform` and `opacity` properties. Never animate `width`, `height`, `margin`, `padding`, `top`, or `left`.
- **Why:** `transform` and `opacity` skip layout and paint, running on the GPU. Layout properties trigger all three rendering steps and cause jank.
- **Source:** `animation-standards.md` > Performance. `animation-review.md` > Standard 7.
- **Lint:** No — requires understanding animation context vs. layout changes.
- **Exceptions:** When there is no other way to achieve the effect and the animation is occasional (not high-frequency).
- **Bad:** `transition: height 300ms ease` for an accordion
- **Good:** Use `grid-template-rows: 0fr` → `1fr` pattern, or `max-height` with `overflow: hidden`, or `clip-path: inset()`.

---

## rule/framer-motion-transform-string

- **Scope:** All surfaces using Framer Motion
- **Rule:** When using Framer Motion for animations that run while the page is busy (page loads, data fetching), use full `transform` strings instead of shorthand `x`/`y`/`scale` props.
- **Why:** Framer Motion's shorthand props (`x`, `y`, `scale`) run via `requestAnimationFrame` on the main thread and are NOT hardware-accelerated. They drop frames under load. Full `transform` strings use the GPU.
- **Source:** `animation-standards.md` > Performance. `design-engineering.md` > Performance Rules.
- **Lint:** No — requires understanding when the animation runs.
- **Exceptions:** Animations that only run when the page is idle (hover effects on desktop).
- **Bad:** `<motion.div animate={{ x: 100, scale: 1.1 }} />`
- **Good:** `<motion.div animate={{ transform: "translateX(100px) scale(1.1)" }} />`