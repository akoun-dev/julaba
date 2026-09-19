# Contexte projet — Jùlaba

*Établi par l'Orchestrateur le 2026-09-18 après analyse complète (AGENT 1 audit technique + AGENT 2 inventaire fonctionnel). Baseline git : `main` = `ce8aa12`. **Resynchronisé AUDIT-001 du 2026-09-19, HEAD `0f71025`**.*

## 1. But du projet

**Jùlaba** est une application de marketplace/vente avec **assistants vocaux IA** destinée aux acteurs économiques informels de Côte d'Ivoire (marchands, producteurs agricoles). L'assistante vocale s'appelle **« Tata Nanti Lou »**. La contrainte absolue de mission est le **fonctionnement 100 % hors-ligne sur mobile natif** (Android via Capacitor 8, coquille « hybrid remote » : WebView chargeant le serveur Next.js déployé).

## 2. Utilisateurs et rôles

| Rôle | Usage | Authentification | Création de compte |
|------|-------|------------------|--------------------|
| `marchand` | Caisse, ventes vocales, stock, dépenses, tontines, Keiwa | PIN / schéma / code visuel / biométrie, multi-comptes par téléphone | Auto-inscription |
| `producteur` | Récoltes, commandes marchands, cycles, carnet de champ | PIN / schéma (partage `auth-multi.ts` avec marchand) | Détecté par `/api/auth/lookup` (même écran de connexion) |
| `identificateur` | Agent terrain d'enrôlement (dossiers acteurs, wizard 5 étapes) | PIN seul, login par téléphone ou code agent `JID-XXXX` | Créé UNIQUEMENT par le backoffice |
| `backoffice` | Administration RBAC (24+ modules, 5–8 rôles) | Email + mot de passe + MFA TOTP | Créé par Super Admin |

Sécurité transverse : liaison session↔appareil (`device-session.ts` + `requireDeviceOwner`), PIN jamais envoyé au serveur (haché, Keystore/Keychain), RBAC source unique `src/lib/backoffice-permissions.ts`.

## 3. Stack technique (déduite des fichiers réels — jamais supposée)

- **Front** : Next.js 16.1.1 App Router (une seule route `/`, navigation client Zustand), React 19, Tailwind 4, shadcn/ui (~50 composants), framer-motion 12
- **État** : 10 stores Zustand persistés (app, backoffice, caisse, stock, producteur, identificateur, notifications, network, gemma-model, voice-language)
- **Back** : 85 routes API Next (`src/app/api/**`), Supabase hosted (PostgreSQL 17, 136 migrations, ~99 tables en 2 tiers : moderne RLS « scope » / legacy service_role), client admin `src/lib/supabase/admin.ts`
- **Offline** : file FIFO localStorage (cap 500, `offline-db.ts`), **18 handlers** de rejeu idempotents (`sync-handlers.ts` — dont 6 entités stock STK-808/809 avec `operation_id` UUID déterministe), idempotence DB via `client_id` / `operation_id`
- **Voix** : plugins natifs Capacitor maison (VoiceService, SherpaStt, TataTts, LiteRtModel) + WASM (Piper, Kokoro 82M, espeak-ng, transformers.js, onnxruntime-web)
- **IA locale** : Gemma 3 1B-IT via LiteRT-LM natif (558 Mo, téléchargement checksummé) — classification d'intention de navigation uniquement ; NLU métier = regex (`localIntent.ts`, ~30 produits, nouchi) + fallback ML zero-shot (`nlu-ml.ts`)
- **Mobile** : Capacitor 8 (`ci.julaba.app`), models embarqués APK : Sherpa zipformer FR int8 + Omnilingual ASR CTC 300M int8 bci (349 Mo) via `scripts/fetch-android-deps.sh`
- **Tests** : vitest 4 (**55 fichiers, 879 tests**), pgTAP RLS/stock (`supabase/tests/`, 108 assertions), CI GitHub Actions (**Bun** : lint+typecheck+tests, COR-001)
- **Runtime** : Bun (install, serve standalone), PM2 (preview sandbox)

## 4. Contraintes de mission (non négociables)

1. **100 % offline sur natif** — les modèles ASR/TTS/IA doivent être embarqués ou téléchargeables opt-in, jamais servis par le cloud à l'usage.
2. **Erreurs explicites, jamais de fallback silencieux** — ex. : la route ASR bci renvoie `BAOULE_NOT_READY` plutôt que de replier vers le français.
3. **Pas de fine-tuning de modèles**, pas d'autres langues ivoiriennes que le baoulé (pilote).
4. **FCFA entiers** (jamais de float), texte UI en français standard.
5. Chaque changement : validation complète (tests + tsc + eslint) → worklog → commit/push (fetch préalable — d'autres sessions poussent sur le même remote).

## 5. État courant (2026-09-19, AUDIT-001)

- **Fonctionnel** : auth multi-comptes, caisse/ventes/dépenses, **système de stock complet** (RPC `merchant_*` ×8, unités locales CI, prix multi-niveaux, transferts inter-marchands STK-801..812+815), refus strict stock insuffisant, vente vocale avec confirmation, **intents stock vocaux** (STK-807), synchro offline idempotente, backoffice RBAC complet, enrôlement + codes JID, notifications, vision/OCR CNI, pipeline voix FR complet, NLLB baoulé livré (B2).
- **Baseline validation** (re-mesurée AUDIT-001, 2026-09-19) : **879/879 tests verts (55 fichiers)**, `tsc --noEmit` 0 erreur, `bunx eslint .` 0 erreur, build prod OK. Sécurité DB vérifiée **live en prod** : 8/8 RPC `merchant_*` — anon/authenticated/PUBLIC sans EXECUTE, service_role seul (SEC-813/814 validées).
- **Restes** : validations appareil (B1-010, B3-032, B5-052 + smoke stock/transferts), NORM-305 types DB (Docker requis), INF-401 déploiement Vercel/APK, BUG-002 réappro vocal à router sur la RPC achat, SEC-OBS-2/3/4 mineurs.
- **Environnement sandbox** : réinitialisé le 2026-09-18 (repo re-cloné, dépendances réinstallées). `node_modules` présent, `next build` non encore rejoué dans cette session.

## 6. Risques connus (détail dans BUGS.md / REGRESSIONS.md)

Premier lancement hybrid-remote sans réseau = app inaccessible ; APK 294–557 Mo au-dessus des limites Play Store (AAB requis) ; PAT GitHub exposé à révoquer ; Piper/Kokoro à revalider sur appareil réel ; latence NLLB (872 Mo) non mesurée à ce jour (RAM sandbox insuffisante — voir CHANGELOG Task 43).
