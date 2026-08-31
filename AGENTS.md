# Jùlaba — Agent Instructions

## Product Design Skill

When shaping, editing, or reviewing user-facing UI, load `.agents/skills/product-design/SKILL.md`.

**Applies to:**
- user-facing pages and components in `src/components/marchand/`, `src/components/identificateur/`, `src/components/backoffice/`, `src/components/producteur/`
- copy, interaction, accessibility, responsive behavior, and states
- animation, motion, easing, transitions, and any visual change over time
- new screen creation, flow design, component choice
- UI review, audit, polish passes, and animation/motion reviews

**Skip:**
- backend-only work with no user-visible effect
- API routes with no UI component changes
- telemetry, generated files, documentation, and marketing
- tests with no shipped UI impact

After loading the skill, report which surfaces and references you loaded, and cite canonical sources for each material decision.

## Architecture Quick Reference

- **Framework:** Next.js 16 (App Router, single-page app at `/`)
- **Styling:** Tailwind CSS 4 + shadcn/ui (new-york) + Lucide React icons
- **State:** Zustand with `persist` middleware (7 stores: app, backoffice, caisse, identificateur, notifications, producteur, stock)
- **DB:** Prisma + SQLite (server-side), accessed through server-only API routes in `src/app/api/`
- **Fonts:** Geist Sans + Geist Mono
- **Charts:** Recharts (backoffice only)
- **Voice:** Web Speech API (STT/TTS) + Web Audio API (beeps)
- **Deployment:** Bun runtime, standalone output, Caddy reverse proxy

## File Organization

```
src/
├── app/
│   └── api/              # Server-side API routes (Prisma access lives only here)
├── components/
│   ├── ui/               # shadcn/ui primitives (do not modify)
│   ├── marchand/         # Merchant screens (xxx-screen.tsx)
│   ├── identificateur/   # Field agent screens (ident-xxx-screen.tsx)
│   ├── backoffice/       # Admin screens (bo-xxx-screen.tsx)
│   └── producteur/       # Producer screens (prod-xxx-screen.tsx)
├── lib/
│   ├── stores/           # Zustand stores (xxx-store.ts), one per domain
│   ├── voice/            # Voice subsystem (stt, tts, intent, wake-word); formatFCFA() lives in voice/localIntent.ts
│   ├── validation/       # Zod schemas for API request bodies
│   ├── product-icons.tsx # Lucide icon lookup for product names (no emoji in UI)
│   ├── db.ts             # Prisma client singleton
│   └── utils.ts          # cn()
└── hooks/                # Custom React hooks
```

## Key Constraints

- Single route only: `/` in `src/app/page.tsx`. All navigation is client-side via Zustand.
- All user-facing text in standard French, addressing the user as "vous" (vouvoiement) — including Tata's voice prompts, never "tu".
- Lucide React icons only — no emojis in UI.
- FCFA amounts as integers, displayed via `formatFCFA()`.
- Backoffice theme uses `isDark` ternary, NOT Tailwind `dark:` variant.
- Auth screens (`bo-auth-screen.tsx`, `orbit-otp.tsx`) use styled-jsx, NOT Tailwind.
