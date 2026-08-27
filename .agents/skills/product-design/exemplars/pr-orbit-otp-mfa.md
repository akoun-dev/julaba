# Exemplar: OrbitOtp MFA Auth Screen

**Decision ID:** PD-006, rule/backoffice-isdark-pattern
**Status:** accepted
**Date:** 2026-08-28
**Files:** `src/components/backoffice/bo-auth-screen.tsx`, `src/components/backoffice/orbit-otp.tsx`

## Problem

The backoffice auth screen needed a distinct visual identity separate from the Tailwind-based admin interface. The existing shadcn `InputOTP` component did not provide the branded verification animation the product required. The auth screen also needed to work in dark-only mode (independent of the backoffice theme toggle).

## Decision

1. **Auth screen uses styled-jsx, not Tailwind.** This isolates the auth screen's dark visual language (#121319, gradient cards, orbit animations) from the Tailwind-based design system used in the rest of the backoffice.
2. **Custom OrbitOtp component** replaces shadcn `InputOTP` for the MFA step. It provides a branded orbit verification animation where digits circle around an SVG ring with a dashed spinning stroke.
3. **3-step flow:** credentials → MFA OTP (auto-submit 300ms after completion) → success (green checkmark + progress bar, auto-redirect 600ms).
4. **Split layout:** Left branding panel (TLS 1.3, MFA TOTP, AES-256 badges) / right form card. Left panel hidden on mobile.

## Rationale

- **styled-jsx isolation:** The auth screen has fundamentally different design tokens (dark bg #121319, gradient cards, 20px border-radius) than the admin interface. Mixing these into Tailwind would pollute the design system with one-off utilities.
- **OrbitOtp as reusable component:** The OTP input is a generic UI primitive that could be reused in other contexts (e.g., identificateur PIN reset, payment confirmation). Making it a standalone component with `styled-jsx` keeps it self-contained.
- **Auto-submit after OTP completion:** Reduces friction. The 300ms delay gives the user a moment to see all digits are entered before the orbit animation begins.
- **Security badges on left panel:** Reinforces trust at the exact moment (login) where security matters most.

## What Shipped

- `orbit-otp.tsx`: 250 lines. Props: `length`, `onComplete`, `onChange`, `onResend`, `resendDelay`, `error`, `verifying`, `resetKey`. Uses `styled-jsx` for all CSS. Hidden `sr-only` input for accessibility.
- `bo-auth-screen.tsx`: 350 lines. Dark-only (#121319). 3-step state machine. 5 demo quick-login accounts. All CSS via `styled-jsx`.

## Mistakes Made

1. **Initial JSX comment syntax error:** `{/* Hidden accessible input` (missing `*/`). This caused a parsing error caught by `bun run lint`. Lesson: always run lint after writing styled-jsx — the template literal can mask JSX syntax errors that Tailwind files don't have.
2. **OrbitOtp `useEffect` dependency:** `[countdown > 0]` creates a new boolean on each render. While functionally correct (it only toggles between true/false), it would be cleaner to depend on `countdown` and check the condition inside the effect.

## What We'd Do Differently

- Add `eval` fixtures for the auth flow: a before/after for each step state (credentials, MFA empty, MFA filled, verifying, success).
- Document the orbit animation timing (300ms verify + 600ms success) as a design token so it can be adjusted without reading component code.
