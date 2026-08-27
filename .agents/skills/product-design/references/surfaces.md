# Surface Routing

Jùlaba has three distinct user surfaces. Each has its own design language,
color system, interaction patterns, and reference file.

## Routing Table

| Surface        | Trigger condition                           | Reference file               |
| -------------- | ------------------------------------------- | ---------------------------- |
| Marchand       | File in `src/components/marchand/`          | `surfaces-marchand.md`       |
| Identificateur | File in `src/components/identificateur/`    | `surfaces-identificateur.md` |
| Backoffice     | File in `src/components/backoffice/`        | `surfaces-backoffice.md`     |

## Cross-Surface Rules

These apply to ALL surfaces:

- All text in standard French (PD-004).
- Lucide React icons only, no emojis (rule/no-emoji-in-ui).
- `screen-enter` class on screen root.
- `pb-24` on screens with bottom bar.
- shadcn/ui components as first choice.
- `cn()` utility for conditional classes.
- `formatFCFA()` for all displayed money amounts.

## Surface-Specific Rules

### Marchand-only
- Voice feedback (`tataSpeak()` + `haptic()`) on every data-mutating action.
- Soleil mode must be verified for every new screen.
- Bottom bar with elevated central FAB mic button.
- `#C66A2C` primary color.

### Identificateur-only
- No voice input (PD-007). Voice tab disabled in bottom bar.
- `#9F8170` primary color.
- Sheet for editing, AlertDialog for confirmations.
- FAB for "Nouveau dossier" on home screen.

### Backoffice-only
- Desktop-first layout (sidebar + header + status bar).
- `#3B82F6` primary, `#0F172A` text, `#F8FAFC` light bg, `#121319` dark bg.
- RBAC: check `hasModuleAccess(role, module)` before rendering.
- `isDark` ternary pattern for theme (NOT Tailwind `dark:` variant).
- Auth screen uses `styled-jsx` (PD-006). All other BO screens use Tailwind.
