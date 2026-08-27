# Product Judgment

Framework for making product decisions in Jùlaba. Every material UI change
should be traceable to one of these principles or to an accepted exemplar.

## Core Product Principles

### 1. Marché-First, Not Tech-First

Every feature starts from a real market vendor behavior, not a technical capability.

- **Who:** A marchande selling tomates at Adjamé market, Abidjan.
- **Environment:** Noisy, sunny, hands busy, intermittent connectivity.
- **Tech literacy:** Smartphone-native but not computer-literate. Uses WhatsApp.
- **Money:** Cash-only, FCFA, needs exact change calculation.

A feature that works in a quiet office but fails at Adjamé is not shipped.

### 2. Voice as Primary Input, Not a Gimmick

Voice ("Tata Nanti Lou") is the primary interaction model for the marchand.

- Every transaction has a voice path.
- Voice feedback (`tataSpeak()`) accompanies every action for confirmation.
- Haptic feedback reinforces voice feedback.
- Voice intent parsing is offline — no API dependency.

**Decision:** We do not add voice to identificateur or backoffice. Field agents use
company devices with keyboards. Admins have full keyboards.

### 3. Offline-First Architecture

The app must function without any network connection.

- All state lives in Zustand stores persisted to `localStorage`.
- Voice STT/TTS use browser-native Web Speech APIs (no cloud dependency).
- Intent parsing is rule-based, not API-based.
- Network features (sync, API routes) are additive, not foundational.

**Implication for UI:** Never show a loading spinner that depends on a network
request without an offline fallback or cached data. Never make the primary task
impossible without connectivity.

### 4. Three Distinct Surfaces, One Codebase

| Surface        | Primary User         | Device     | Input Model     | Layout      |
| -------------- | -------------------- | ---------- | --------------- | ----------- |
| Marchand       | Market vendor        | Phone      | Voice + touch   | Mobile-first |
| Identificateur | Field agent          | Phone/tab  | Touch + keyboard| Mobile-first |
| Backoffice     | Admin                | Desktop    | Keyboard + mouse | Desktop-first|

Each surface has its own design language, color palette, and interaction
patterns. They share the same shadcn/ui component library and Zustand
architecture, but they do not share visual styles.

**Decision:** A component that looks correct on the backoffice dark theme will
look wrong on the marchand warm-orange theme. Always load the surface-specific
reference before styling.

### 5. Soleil Mode Is a Requirement, Not a Nice-to-Have

Market vendors work under direct sunlight. The "soleil" mode is not a theme
preference — it is an accessibility requirement for the primary use environment.

- Pure white background.
- All text forced to `font-weight: 600`.
- Text and icons scaled up 15-25%.

Every new marchand screen must be verified in soleil mode.

## Decision Modeling Template

For any material product change, document:

```
User:         (marchand / identificateur / backoffice admin)
Job:          What they are trying to accomplish
Current:      How they do it today (or: it doesn't exist yet)
Desired:      What should happen
Success:      How we know it worked
Non-goals:    What we are NOT solving
Object:       The data entity being acted on
Scope:        Which surface, which module
Action:       The mutation or navigation
Consequence:  What changes for the user
Reversibility: Can they undo it?
Permissions:  Any role-based restrictions
Open:         Unresolved questions
```

## Accepted Product Decisions

### PD-001: No Credit Transactions

- **Status:** accepted
- **Decision:** The voice system explicitly blocks "crédit" intents.
- **Rationale:** Cash-only market. Credit tracking would require debt management,
  legal compliance, and dispute resolution that are out of scope.
- **Evidence:** `localIntent.ts` returns a blocking message for credit intents.

### PD-002: 4-Digit PIN for Marchand, Not Password

- **Status:** accepted
- **Decision:** Marchand auth uses a 4-digit numeric PIN, not an alphanumeric password.
- **Rationale:** Market vendors find PINs faster and easier on a numeric keypad.
  Pattern lock and visual code grid are offered as alternatives.
- **Evidence:** `auth-screen.tsx` offers three auth methods, all numeric/gestural.

### PD-003: "Maman" Addressing on Home Screen

- **Status:** accepted
- **Decision:** The home screen greets the merchant as "Maman {Name}" (not "Bonjour" or "Bienvenue").
- **Rationale:** Culturally appropriate term of respect for older women market vendors
  in West Africa. Builds trust and product affinity.
- **Evidence:** `home-screen.tsx` uses `Maman ${userName}` in the greeting.

### PD-004: French-Only UI, No Nouchi

- **Status:** accepted
- **Decision:** All shipped UI text is in standard French. Internal voice parsing
  accepts nouchi/phonetic variants, but displayed text is always standard French.
- **Rationale:** Consistency, readability, and professionalism. Nouchi variants are
  handled at the intent-parsing layer only.
- **Evidence:** Worklog documents a deliberate correction phase from phonetic to standard French.

### PD-005: FCFA as Integer, No Subunits

- **Status:** accepted
- **Decision:** All money values are stored as integers (FCFA has no centime subunit).
- **Rationale:** CFA franc has no subunit. Using floats introduces rounding errors.
- **Evidence:** Prisma schema uses `Int` for all money fields. `formatFCFA()` in `utils.ts`.

### PD-006: Backoffice Auth Uses styled-jsx, Not Tailwind

- **Status:** accepted
- **Decision:** The `bo-auth-screen.tsx` and `orbit-otp.tsx` use styled-jsx for CSS.
- **Rationale:** The auth screen has a distinct dark visual language (#121319, gradient cards,
  orbit animations) that is intentionally separate from the Tailwind-based design system.
- **Evidence:** `bo-auth-screen.tsx` contains `<style jsx>` blocks. No Tailwind classes on that screen.

### PD-007: Identificateur Voice Tab Disabled

- **Status:** accepted
- **Decision:** The "Tata" (voice) tab in the identificateur bottom bar is present but disabled.
- **Rationale:** Field agents use company-issued devices and may be in formal settings.
  Voice input would be inappropriate.
- **Evidence:** `ident-bottom-bar.tsx` renders the tab with `opacity-50 pointer-events-none`.