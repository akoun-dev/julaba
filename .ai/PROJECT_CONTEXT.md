# Contexte projet — Jùlaba

*Établi par l'Orchestrateur le 2026-09-18 après analyse complète (AGENT 1 audit technique + AGENT 2 inventaire fonctionnel). Baseline git : `main` = `ce8aa12`.*

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
- **Back** : 75 routes API Next (`src/app/api/**`), Supabase hosted (PostgreSQL 17, ~90 tables en 2 tiers : moderne RLS « scope » / legacy service_role), client admin `src/lib/supabase/admin.ts`
- **Offline** : file FIFO localStorage (cap 500, `offline-db.ts`), 12 handlers de rejeu idempotents (`sync-handlers.ts`), idempotence DB via `client_id`
- **Voix** : plugins natifs Capacitor maison (VoiceService, SherpaStt, TataTts, LiteRtModel) + WASM (Piper, Kokoro 82M, espeak-ng, transformers.js, onnxruntime-web)
- **IA locale** : Gemma 3 1B-IT via LiteRT-LM natif (558 Mo, téléchargement checksummé) — classification d'intention de navigation uniquement ; NLU métier = regex (`localIntent.ts`, ~30 produits, nouchi) + fallback ML zero-shot (`nlu-ml.ts`)
- **Mobile** : Capacitor 8 (`ci.julaba.app`), models embarqués APK : Sherpa zipformer FR int8 + Omnilingual ASR CTC 300M int8 bci (349 Mo) via `scripts/fetch-android-deps.sh`
- **Tests** : vitest 4 (33 fichiers, 480 tests), pgTAP RLS (`supabase/tests/rls.sql`), CI GitHub Actions (lint+typecheck+tests, Node 22)
- **Runtime** : Bun (install, serve standalone), PM2 (preview sandbox)

## 4. Contraintes de mission (non négociables)

1. **100 % offline sur natif** — les modèles ASR/TTS/IA doivent être embarqués ou téléchargeables opt-in, jamais servis par le cloud à l'usage.
2. **Erreurs explicites, jamais de fallback silencieux** — ex. : la route ASR bci renvoie `BAOULE_NOT_READY` plutôt que de replier vers le français.
3. **Pas de fine-tuning de modèles**, pas d'autres langues ivoiriennes que le baoulé (pilote).
4. **FCFA entiers** (jamais de float), texte UI en français standard.
5. Chaque changement : validation complète (tests + tsc + eslint) → worklog → commit/push (fetch préalable — d'autres sessions poussent sur le même remote).

## 5. État courant (2026-09-18)

- **Fonctionnel** : auth multi-comptes, caisse/ventes/stock/dépenses, vente vocale avec confirmation (quick-sale), synchro offline complète, backoffice RBAC complet, enrôlement + codes JID, notifications, vision/OCR CNI, pipeline voix FR complet, sélecteur langue fr/baoulé dans réglages (commit `bfec4f8`), enregistrement ventes vocales + synchro (commit `ce8aa12`).
- **Baseline validation** : 480/480 tests verts, `tsc --noEmit` 0 erreur, eslint **2 erreurs** `react-hooks/immutability` dans `vente-rapide-modal.tsx` (introduites par `ce8aa12`) → BUG-001.
- **Roadmap multilingue Baoulé** : B1 ✅ embarqué (validation terrain pendante), B2/B3/B4/B5 ❌ à construire (voir `REQUIREMENTS.md` et `TASKS.xlsx`).
- **Environnement sandbox** : réinitialisé le 2026-09-18 (repo re-cloné, dépendances réinstallées). `node_modules` présent, `next build` non encore rejoué dans cette session.

## 6. Risques connus (détail dans BUGS.md / REGRESSIONS.md)

Premier lancement hybrid-remote sans réseau = app inaccessible ; APK 294–557 Mo au-dessus des limites Play Store (AAB requis) ; PAT GitHub exposé à révoquer ; Piper/Kokoro à revalider sur appareil réel ; modèle NLLB inexistant à ce jour (B2).
