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