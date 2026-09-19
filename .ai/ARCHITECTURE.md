# Architecture technique — Jùlaba

*Source : audit AGENT 1 du 2026-09-18, HEAD `ce8aa12` — resynchronisé AUDIT-001 du 2026-09-19, HEAD `0f71025`. ~91 050 lignes TS/TSX dans `src/`.*

## 1. Vue d'ensemble

```
┌─────────────── Capacitor 8 (ci.julaba.app) ────────────────┐
│  WebView → serveur Next.js distant (hybrid remote)          │
│  Plugins natifs : VoiceService / SherpaStt / TataTts /      │
│                   LiteRtModel (Java + miroirs Swift)        │
│  Modèles embarqués APK : sherpa zipformer FR int8 (~50 Mo), │
│  omnilingual-asr-300M-ctc-int8 bci (349 Mo)                 │
└─────────────────────────────────────────────────────────────┘
            ↓ HTTPS (preview sandbox ou prod)
┌─────────────── Next.js 16 standalone ──────────────────────┐
│  Route unique / (navigation client Zustand)                 │
│  85 routes API src/app/api/** (marchand/producteur/ident/BO)│
│  Files offline client → sync-handlers → Supabase            │
└─────────────────────────────────────────────────────────────┘
            ↓ service_role / anon + RLS
┌─────────────── Supabase hosted (PostgreSQL 17) ─────────────┐
│  136 migrations, ~99 tables, 2 tiers (scope RLS / legacy)   │
│  RPC transactionnelles (create_sale, keiwa ledger, …)       │
└─────────────────────────────────────────────────────────────┘
```

## 2. Pipeline voix (cœur de la roadmap multilingue)

### 2.1 ASR (entrées) — `src/lib/voice/stt-factory.ts`
- `createSmartSingleShotSTT(handler, options?)` : langue résolue = `options.lang` sinon store `voice-language-store` (`getSelectedVoiceLanguage()`).
- **`'bci'`** → route dédiée VoiceService natif (Omnilingual ASR CTC 300M int8, batch push-to-talk), **sans fallback** — erreur explicite `BAOULE_NOT_READY` / `BAOULE_CONTINUOUS_UNAVAILABLE_MESSAGE` (pas d'écoute continue bci : le CTC n'a pas de variante streaming).
- **`'fr'` natif** → VoiceService batch → Sherpa streaming (`SherpaSttPlugin`) → Web Speech. **`'fr'` web** → Web Speech seul.
- Plugin natif : `VoiceServicePlugin.java` (714 l.) — AudioRecord 16 kHz mono PCM16, buffer mémoire, auto-stop 30 s, verrou engineLock, métriques RTF.
- Définitions partagées : `src/plugins/voice-service/definitions.ts` — `VoiceLanguage = 'fr' | 'bci'`, `VOICE_ENGINES`, codes d'erreur typés.

### 2.2 NLU (compréhension)
- Niveau 1 : `localIntent.ts` (905 l., regex — ~30 produits, nombres français lettrés, nouchi, intentions vente/dépense/réappro/commande/navigation/auth + intents stock `voice-stock.ts` STK-807 : stock_check/stock_loss/stock_adjust/purchase, unités étendues). **Parser 100 % français — ne doit JAMAIS recevoir de texte bci brut** (garde à tester, cf. TEST_PLAN).
- Niveau 2 : `nlu-ml.ts` (zero-shot on-device, timeout 4 s, seuil 0,55) → `buildClarifyingIntent` (clarification).
- Navigation : Gemma 3 1B locale (`classifyNavigation`, JSON zod-validé, seuil 0,75) — **jamais d'action métier/financière**.
- Producteur : parseur dédié `prodIntent.ts` (volontairement séparé de localIntent).

### 2.3 TTS (sorties) — `tata-tts.ts` (chaîne 4 moteurs)
`TataTts natif (Android/iOS) → Kokoro-82M q8 (~86 Mo, voix ff_siwis, phonémisation espeak-ng WASM maison) → Piper (fr_FR-siwis-low, OPFS) → Web Speech`.
- Préférence moteur : `localStorage julaba-tts-engine` (hors Zustand — migration **ajournée avec justification** NORM-304 : singleton lu synchroniquement par `tataSpeak`, hydratation async sans bénéfice).
- **Aucune voix bci aujourd'hui** : `ttsLanguage:'bci'` est un réglage sans effet audible, narré en français + signal unique `notifyBciNarrationLimitOnce` (tata-tts.ts:30-40) → c'est l'objet de B3.
- Caches opt-in (Cache API) : `transformers-cache`, `kokoro-voices`, `julaba-espeak-wasm`. Téléchargements uniquement sur action utilisateur (garde `isKokoroVoiceReady()`).
- ⚠️ CSP : `'wasm-unsafe-eval'` est **vital** en production (fix `6c3f77d`) — toute nouvelle brique WASM (NLLB) en dépend.

### 2.4 IA conversationnelle
- Gemma 3 1B-IT (LiteRT natif, 558 Mo, plugin `LiteRtModelPlugin.java`, checksum SHA-256, store `gemma-model-store`).
- **Traduction : ABSENTE** (0 occurrence NLLB/traduction dans le code — confirmé par grep des deux agents).

## 3. Données

- Clients Supabase : `server.ts` (cookies, routes `/api/v1/*`), `admin.ts` (service_role, typé `any` volontairement — dette), `browser.ts` (**code mort**, jamais importé). `src/lib/db.ts` = re-export trompeur (nom hérité Prisma).
- **Aucun composant client n'appelle Supabase** (conforme). Pas de couche repository : les 60 appels `supabase.from(...)` sont répartis dans 30 fichiers serveur (dette de centralisation serveur, non bloquante).
- Pattern offline : `fetch POST` → si échec `queuePendingSync(entity, payload)` → rejeu idempotent (`sync-handlers.ts`, **18 handlers** dont 6 entités stock STK-808/809 avec `operation_id` UUID déterministe et conflit 422 INSUFFICIENT_STOCK) → conflits → `/api/sync-conflicts/report` + écran BO.
- Stock : RPC transactionnelles `merchant_*` (8, SECURITY DEFINER, service_role seul — ACL prod vérifiées AUDIT-001 : anon/authenticated/PUBLIC = false ×8) + tables `merchant_stock_*` deny-all RLS.
- 10 stores Zustand (détail PROJECT_CONTEXT). ⚠️ doublon `'ident-dossier-detail'` dans `ScreenRoute` (app-store.ts:48,51).

## 4. Auth & sécurité

`auth-multi.ts` (cache `julaba-account-<tel>`), `device-session.ts` (cookie `julaba_device` SHA-256 TTL 365 j — rotation à étudier, SEC-OBS-2), `require-owner.ts`, `backoffice-auth/` (hash, sessions, MFA, lockout 5/15 min, audit SHA-256), `backoffice-permissions.ts` (8 rôles, 30 modules, 75 droits). Sécurité stock : SEC-813 (revoke RPC) + SEC-814 (lock `device_push_tokens`) **appliquées en prod et vérifiées live** (AUDIT-001).

## 5. Build & déploiement

- `next.config.ts` : `output: standalone`, CSP stricte (⚠️ `wasm-unsafe-eval`), alias webpack+turbopack `fs`/`path` → `empty-module.js` (glue Emscripten piper).
- `capacitor.config.ts` : `server.url = CAPACITOR_SERVER_URL ?? https://julaba.vercel.app/` (prod Vercel en retard — l'APK de test pointe sur la preview sandbox).
- CI : `.github/workflows/ci.yml` — **Bun** (`oven-sh/setup-bun` + `bun install --frozen-lockfile`) → lint → typecheck → vitest (basculé COR-001 AUDIT-001 : `npm ci` cassait depuis la sortie du lockfile NORM-303).
- Scripts : `bun run build` (FOREGROUND + `NODE_OPTIONS=--max-old-space-size=2000` en sandbox), `bun x pm2 restart ecosystem.config.cjs --update-env` après tout ajout à `public/`.

## 6. Duplication identifiée (audit AGENT 1 — état AUDIT-001)

1. ~~**Voix & Langue** : extraction `VoixSettings` partagé~~ — **RÉSOLU (NORM-301)** : `src/components/shared/voix-settings.tsx`, −356 lignes.
2. `voice-modal.tsx` (516 l.) vs `prod-voice-modal.tsx` (389 l.) — squelette dupliqué, parseurs volontairement distincts.
3. `auth-screen.tsx` (2177 l.) vs `prod-auth-screen.tsx` (560 l.) — squelette PIN/numpad.
4. ~~`PROD_COLOR` redéfini ≥4 fichiers ; `formatFCFA` en double ; double lockfile~~ — **RÉSOLU (NORM-303/304)** : `src/lib/design-tokens.ts`, source unique `utils.ts` (ré-export `localIntent.ts:883`), `bun.lock` seul.
5. Code mort : `supabase/browser.ts`, `ident-top-bar.tsx`, `db/custom.db` (vestige Prisma), `examples/websocket`, dep `z-ai-web-dev-sdk` inutilisée, `/api/v1/*` non câblée au front.
6. **Nouveau (AUDIT-001)** : 12 fichiers > 500 l. hors types générés (pire : `auth-screen.tsx` 2177 l.) ; ~21 `: any` ciblés dans 8 fichiers API (détail `DEBT_REPORT.md`).
