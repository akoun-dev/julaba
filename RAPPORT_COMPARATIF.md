# Rapport comparatif — `SOMET1010/julaba-app` vs `akoun-dev/julaba`

> **Date** : 20 septembre 2026
> **Objet** : comparaison factuelle de deux implémentations indépendantes du produit Jùlaba (application marchande/productrice pour les marchés de subsistance en Côte d'Ivoire, avec intégration vocale en français, baoulé et dioula).
> **Méthode** : analyse directe du contenu réel des deux dépôts (structure, code, tests, CI/CD, documentation), avec compteurs mesurés (`git ls-files`, `wc -l`) et citations de fichiers précis. Aucune modification de code source.

---

## 1. Résumé exécutif

Les deux dépôts poursuivent le même objectif produit — digitaliser le commerce des marchands et producteurs, avec la **voix comme interface première** pour des utilisateurs peu lettrés — mais incarnent deux philosophies d'ingénierie radicalement différentes.

**`SOMET1010/julaba-app`** (ci-après « **julaba-app** ») est une **architecture d'entreprise éclatée** : monorepo npm workspaces séparant un backend **NestJS 11 + TypeORM + PostgreSQL** (60 modules, 54 contrôleurs) d'un frontend **React 18 + Vite 6** (156 routes déclarées), packagé en APK via **Capacitor 8 avec plugins natifs Kotlin** (sherpa-onnx pour la voix) et déployé via **Render + Azure DevOps**. Sa signature est une **discipline de gouvernance exceptionnelle** : `CONSTITUTION.md` (8 principes chiffrés avec mécanisme de tenue en CI), registre de dette technique en révision 20 avec contre-audits numérotés, 45 **invariants métier testés contre un PostgreSQL réel** (`backend/test/invariants/`), idempotence de l'argent garantie côté serveur. Points faibles : composants front monstres (6 649 lignes), absence de linter, harnais de tests maison non standard, double chaîne de déploiement jamais arbitrée, et une intégration vocale **moins aboutie multilinguistiquement** (baoulé en packs planifiés, dioula « en suspens », transcription Whisper retirée le 17/09).

**`akoun-dev/julaba`** (ci-après « **julaba** ») est un **monolithe Next.js 16 assumé** (React 19, runtime Bun, une seule page, navigation 100 % client via Zustand) adossé à **Supabase** (Postgres managé + 101 policies RLS) et packagé via Capacitor en mode « hybrid remote ». Sa signature est le **sous-système vocal offline le plus complet des deux** : ~8 400 lignes de code vocal, **trois langues actives** (français multi-moteur, baoulé via finetune ONNX `nllb-baoule-v1` de 893 Mo auto-hébergé, dioula via NLLB-200 de 872 Mo + TTS MMS), wake-word, NLU locale, 31 fichiers de tests vocaux. Points faibles : **un secret de production critique commis dans git** (`.env` tracké avec `SUPABASE_SERVICE_ROLE_KEY`), TypeScript/ESLint édulcorés, fonctionnalités producteur incomplètes côté serveur (stock/cycles/réputation seedés localement sans routes API dédiées), et un APK qui n'est qu'une coque de navigateur dépendant du réseau.

**Verdict synthétique** : julaba-app est **plus robuste sur l'argent et la gouvernance**, julaba est **plus abouti sur la voix multilingue et plus véloce en livraison**. Le choix dépend du contexte (§6) ; la combinaison des forces des deux est réaliste (§7).

---

## 2. Carte d'identité des deux dépôts

| Métrique | `SOMET1010/julaba-app` | `akoun-dev/julaba` |
|---|---|---|
| Dernier commit | `e17992a` — 20/09/2026 | `28bedb2` — 20/09/2026 |
| Historique | 276 commits, 48 PR mergées | 306 commits depuis le 24/08/2026 |
| Contributeurs | 1 humain (PATRICK, 15 commits) + Claude (261 commits) | Travail multi-agents documenté (AGENT1/AGENT2, MODE-9xx) |
| Volume de code TS | ≈ 203 700 lignes (867 fichiers .ts/.tsx + 71 .mts) | ≈ 104 200 lignes (451 fichiers dans `src/`) |
| Lignes de tests | 194 fichiers de test (backend 72, front 76, E2E/Playwright/Maestro) | 81 fichiers vitest ≈ 15 150 lignes (~1 222 tests) |
| Documentation | 94 fichiers markdown + `CONSTITUTION.md` | `.ai/` (registres), `docs/`, `AGENTS.md`, worklog 190 Ko |
| CI/CD | 9 workflows GitHub + Azure DevOps + Render blueprint + Sonar | 1 workflow (`ci.yml` : lint + typecheck + vitest) |
| Base de données | PostgreSQL auto-géré (Render `basic_256mb`), 27 migrations TypeORM actives | Supabase managé, 143 migrations SQL dont 102 activant RLS |
| Mobile | Capacitor 8 + plugins natifs Kotlin (sherpa-onnx STT/TTS) | Capacitor 8.5 « hybrid remote » (coque WebView vers Vercel) |

---

## 3. Comparaison des fonctionnalités

| Domaine | `SOMET1010/julaba-app` | `akoun-dev/julaba` | Avantage |
|---|---|---|---|
| **Caisse POS (vente)** | `frontend_src/src/components/marchand/POSCaisse.tsx` (1 346 l.), vente vocale + tactile, encaissement billets/pièces visuel (`src/assets/images/billet-*.png`), fermeture de caisse avec écart (`caisse-fond-declare`), chaîne d'encaissement verrouillée `services/machineEncaissement.ts` (une seule porte d'écriture d'argent) | `src/components/marchand/caisse-screen.tsx` (932 l.) + `caisse-store.ts` (399 l.), vente vocale + tactile, récapitulatif de journée (`day-summary.ts`) | **julaba-app** (verrouillage métier de l'argent) |
| **Stock** | `GestionStock.tsx`, mouvements d'inventaire, migration `StockOperationIdempotence`, invariants `i1-i3-atomicite-stock.spec.ts` | 9 routes API `api/marchand/stock*` (balance, mouvements, marge, prix, unités, transferts…), `stock-store.ts`, tests RLS `supabase/tests/stock.sql` | **Égalité** (approches différentes, couvertures similaires) |
| **Commandes** | `commandes-rest`, `CommandesProducteurPage.tsx` (2 434 l.) | `api/marchand/sales`, `supplier-orders`, `api/producteur/commandes`, écran `prod-commandes` | **Égalité** |
| **Ventes à crédit** | `CreditModal`, parcours vertical « vendre à crédit » dans la Constitution | `api/marchand/credit-ops` + remboursements (MODE-906, `.ai/TASKS.md:178`) | **Égalité** |
| **Tontines** | Backend `tontines/` + migration dédiée + invariant `tontine-cycle-complet.spec.ts`, écran + détail | Écran `secondary-screens.tsx` + `api/marchand/tontines` (+create) + rappels `syncTontineReminders` | **julaba-app** (invariant métier testé sur vraie base) |
| **Keiwa (wallet)** | `wallets/` + `bpay/` (mobile money), transferts idempotents (`WalletTransactionTransfertIdempotence`), invariants `keiwa-paiement-commande`, `blocage-wallet-admin` | `api/marchand/keiwa`, `api/backoffice/keiwa`, écrans marchand + backoffice | **julaba-app** (idempotence serveur de l'argent) |
| **Fidélité** | `fidelite-rest` + migration `FideliteEvenements` + `fidelite-cycle.spec` | Écran dans `secondary-screens.tsx`, routes `ScreenRoute` (app-store.ts:44-47) | **julaba-app** (profondeur backend) |
| **Protection sociale** | `protection-sociale/` + migration `CotisationsSociales` + invariant `protection-sociale-cotisations.spec.ts` | Écran dans `secondary-screens.tsx` (l.1176), pas de route API dédiée trouvée | **julaba-app** |
| **Espace producteur** | Production/plantations (`ProducteurProduction.tsx`), récoltes, publication marketplace (`PublierRecolte`), commandes, revenus — 3 modules backend (`producteur`, `producteur-rest`, `producteurs-rest` ⚠ duplication) | 9 écrans (`prod-home`, `prod-recoltes`, `prod-commandes`, `prod-stock`, `prod-cycles`, `prod-profil`, `prod-voice-modal`, `prod-bottom-bar`, `prod-auth`) mais **4 routes API seulement** (`commandes`, `journal`, `recoltes`, `login`) — stock/cycles/réputation locaux et seedés | **julaba-app** (bout-en-bout serveur) |
| **Coopérative** | Module complet (`cooperatives-rest`, écrans membres/finances/trésorerie/MarcheHub) | Absent | **julaba-app** |
| **Back-office** | ~30 écrans BO* (enrôlement, zones, acteurs, config institution, analytics, audit trail, keiwa admin) | ~25 écrans `bo-*-screen.tsx` + `backoffice-store.ts` (1 605 l.), 40 routes API `api/backoffice/*` | **Égalité** (julaba plus dense côté API, julaba-app côté écrans) |
| **Identification / enrôlement** | `FicheIdentificationDynamiqueBO.tsx` (6 649 l.) + version identificateur (5 753 l.) ⚠ duplication ~12 400 lignes | `ident-identification-screen.tsx` (1 710 l.) + identificateur store (437 l.) + missions terrain | **julaba** (plus compact, moins dupliqué) |
| **Intégrations étatiques** | `oneci`, `ansut`, RNPP verif.ci dans la CSP, POC Odoo (`odoo-gateway`, `infra/odoo-poc`) | Absentes | **julaba-app** |
| **Notifications push** | `web-push` backend + `usePushNotifications` | `api/push-tokens`, `api/notifications`, `notifications-store.ts` (289 l.) | **Égalité** |
| **Temps réel** | socket.io (`events/` gateway, `useRealtime`) | Non trouvé (Supabase realtime présent dans les deps mais usage non démontré) | **julaba-app** |
| **Academy (formation)** | Backend + spec `JULABA_ACADEMY_SPEC.md` + écrans | Écran marchand academy | **Égalité** |

### 3.1 La voix — le différenciateur central, deux stratégies opposées

| Aspect | `SOMET1010/julaba-app` | `akoun-dev/julaba` |
|---|---|---|
| **Volume de code** | Réparti (`voice/` backend, `useVoiceCore.ts` 1 035 l., ~60 services `.mts`) | `src/lib/voice/` : 8 415 lignes hors tests, ~60 fichiers, 31 fichiers de tests (7 799 lignes de tests) |
| **TTS** | **Piper backend offline-first** (`voice/piper.service.ts`, voix .onnx fine-tunée ivoirienne) → repli ElevenLabs/Azure (clés chiffrées AES-256-GCM en base) ; ~140 clips MP3 pré-enregistrés « Tata Nanti Lou » (`public/voix/tata/ui-*.mp3`, 7 Mo pré-cachés) | **Chaîne front multi-moteurs** `tata-tts.ts` (594 l.) : TTS système natif → Web Speech FR → opt-in Piper (`piper-tts.ts`), Kokoro (`kokoro-tts.ts` 555 l.), MMS ; aucun repli silencieux (narration d'erreur une fois par session) |
| **STT** | **sherpa-onnx natif Android** (`SherpaSttPlugin.kt`) ; **pas de STT offline web** (choix assumé dans `voice-offline/offlineStt.ts`) ; sherpa-onnx WASM abandonné (arbitrage 18/09) ; **Whisper retiré le 17/09** | **Multi-moteur web + natif** : `stt-factory.ts` (481 l.) route Web Speech / sherpa-onnx fr / plugin natif `voice-service` (Omnilingual ASR 300M bci) ; modèles embarqués dans l'APK (`android/app/src/main/assets/models/`) |
| **Langues** | `french \| dioula \| bambara` (`useLangPref.ts`) ; **dioula en suspens**, bambara pour les nombres avec le piège culturel dɔrɔmɛ=5 FCFA (`nombresBambara.ts`) ; **baoulé : packs de collecte planifiés** (`docs/PACKS_VOIX_COLLECTE.md`, `StudioVoixClonage.tsx`) | **fr \| bci \| dyu actifs** ; baoulé via finetune communautaire `GaindeNdiaye/nllb-baoule-v1` ONNX q8 ≈ 893 Mo servi par `/api/voix/nllb-baoule-v1` (chrF++ 18,2/10,4, « bêta assumée » `nllb-translation.ts:675 l.`) ; dioula via NLLB-200 ≈ 872 Mo + TTS `facebook/mms-tts-dyu` (`mms-tts.ts` 852 l.) |
| **NLU / intentions** | `grammaireEncaissement.ts` + `machineEncaissement.ts` (liste blanche fermée, relecture spontanée « Elle doit… Je valide ? ») | `localIntent.ts` (1 076 l.) parseur FR + `prodIntent.ts` (producteur) + garde B2-022 (jamais de baoulé brut dans le parseur) |
| **Wake word** | Non trouvé | `wake-word.ts` (304 l.) : mot « Julaba » + variantes, pause propre pendant les modales (audit VOCAL-604) |
| **Offline vocal** | `offlineCaisse.ts` (IndexedDB `caisse_outbox` + lettres mortes), `useOfflineVoiceQueue` (localStorage, `userId` propriétaire + `semanticsVersion` anti-rejeu sémantique) | File FIFO unifiée `offline-db.ts` (268 l.) + 23 handlers `sync-handlers.ts` + `SyncFlusher` |

**Lecture** : julaba-app a une stratégie « **serveur + natif Android** » (TTS Piper côté serveur, STT sherpa uniquement dans l'APK) ; julaba a une stratégie « **tout dans le client** » (modèles ONNX traduction chargés côté appareil, service de modèles auto-hébergé par proxy GitHub Release dans les routes Next). julaba couvre **aujourd'hui** le baoulé et le dioula en traduction effective ; julaba-app a une chaîne d'encaissement vocale **plus verrouillée métier** mais une couverture linguistique réelle moindre.

---

## 4. Comparaison de l'architecture, des technologies et des choix d'implémentation

### 4.1 Style d'architecture

| Dimension | julaba-app | julaba |
|---|---|---|
| **Forme** | Monorepo **front/back séparés** (npm workspaces `frontend_src` + `backend`) | **Monolithe Next.js** single-page, navigation client (Zustand `ScreenRoute`), 97 routes API dans `src/app/api/` |
| **API** | NestJS 11, 54 contrôleurs, DTO class-validator, Swagger, throttler, guards RBAC | Next.js Route Handlers, zod (présent mais peu diffusé — 12 fichiers), pas de couche Swagger |
| **Données** | TypeORM, 27 migrations actives + 31 archivées, baseline 1 154 lignes ; **DbInit idempotent = vrai mécanisme de schéma en prod** (`DB_MIGRATIONS_RUN=false` documenté dans `render.yaml`) ⚠ | Supabase : 143 migrations SQL, **101 policies RLS**, tests RLS (`supabase/tests/rls.sql`, script `test:rls`), ADR-001 « service-role-deny-all-rpc » |
| **État front** | 24 contexts React (`AppContext.tsx` 1 351 lignes = noyau) + ~30 hooks | 10 stores Zustand (4 907 lignes), TanStack Query, persist |
| **Routing** | react-router 7, **156 routes déclarées**, lazy-loading systématique, ErrorFallback par route | 1 page physique, ~60 écrans virtuels, chargement par défaut non paresseux ⚠ |
| **Mobile** | Capacitor 8 + **plugins Kotlin natifs** (sherpa STT/TTS), apk.yml en CI | Capacitor 8.5 « hybrid remote » : `capacitor.config.ts` charge `https://julaba.vercel.app/` — l'APK est une coque réseau, `capacitor-www` n'a qu'un fallback offline ⚠ |
| **PWA** | `public/sw.js` : pré-cache de tous les chunks de route + 7 Mo de voix, stratégies cache-first/network-first, `/api` jamais caché | Non trouvé de service worker (l'offline passe par la file FIFO applicative) |
| **Déploiement** | **Deux chaînes concurrentes** : Render blueprint (`render.yaml`, production V2 réelle) vs Docker/OVH (`docker-compose.prod.yml`, ACR Azure) ; `ci/README.md` avoue une cible prod « non vérifiée » ⚠ | Vercel (implicite via hybrid remote) + CI GitHub unique ; simple mais peu outillé |

### 4.2 Offline et idempotence — deux niveaux de maturité

**julaba-app** applique le principe constitutionnel n°7 (« l'argent et le hors-ligne sont sacrés ») jusqu'au serveur : idempotence **obligatoire côté API** (migrations `StockOperationIdempotence`, `WalletTransactionTransfertIdempotence`, invariants `i2-idempotence-vente.spec.ts`, `argent-4-encaissement-unique.spec.ts`), lettres mortes indexées avec atomicité transactionnelle (`offlineCaisse.ts`), quarantaine sémantique des intentions vocales (`semanticsVersion: 2` dans `useOfflineVoiceQueue`), et **test E2E mobile Maestro** (`maestro/05-hors-ligne.yaml` : « une vente hors ligne puis reconnexion ne crée pas deux ventes »).

**julaba** a une file FIFO unie et documentée (`offline-db.ts`, choix assumé du localStorage « écritures synchrones race-free » contre IndexedDB, cap 500 entrées, conflits cap 50 + miroir serveur `sync-conflicts/report`), 23 handlers de synchronisation, verrou anti-double-flush — mais **l'idempotence serveur est ponctuelle** (MODE-902 : `client_id` upsert sur `market-sessions` seulement, ADR-002 opération-id déterministe) et non systématisée par migration comme chez julaba-app.

### 4.3 Qualité de code et outillage

| Aspect | julaba-app | julaba |
|---|---|---|
| Linter | **Aucun ESLint/Prettier détecté** ⚠ | ESLint présent mais **~30 règles désactivées** (no-explicit-any, no-unused-vars, exhaustive-deps…) ⚠ |
| TypeScript | Gate tsc **à baseline cliquet** (`ci/check-tsc-baseline.mjs` + `tsc-baseline.txt`) | `strict: true` mais `noImplicitAny: false` (tsconfig.json:13) ⚠ |
| Tests backend | **45 invariants métier sur PostgreSQL réel** + 27 unitaires (Jest double config) | 5 fichiers de tests de routes API (vitest) |
| Tests front | 76 `.test.mts` via **harnais tsx maison** (pas de framework standard) ⚠ + 7 recettes E2E pilotées + Playwright | 81 fichiers vitest (~1 222 tests), dont 31 vocaux (`baoule-chain-e2e.test.ts`, `dioula-integration.test.ts`) |
| E2E mobile | **5 flux Maestro** (« Cinq sentinelles ») sur APK réel | Absent |
| Budget/perf | `check-bundle-budget.mjs` (565/800 Ko), scripts d'hygiène (`atteignabilite.mjs`, `mesure-ecrans.cjs`) | Non trouvé ; build NLLB OOM documenté en sandbox (latence à mesurer sur appareil réel) |
| Hygiène inline | 10 TODO/FIXME (dette pistée hors code dans le registre) | 0 TODO/FIXME (dette pistée dans `.ai/DEBT_REPORT.md`) |

### 4.4 Sécurité

**julaba-app** : JWT + refresh tokens persistés (max 5 sessions), bcrypt, **WebAuthn**, PIN 4 chiffres **chiffré AES-256-GCM** (`pin-crypto.service.ts`, format `v2:iv:tag:ct`, tests `pin-jamais-journalise.spec.ts`), RBAC fail-closed sur la chaîne de création de rôles (invariants `m6-m8-role-escalation.spec.ts`), `ClassSerializerInterceptor` global contre les fuites de `passwordHash`, throttling calibré, secrets fail-fast au boot. **Mais aucune RLS Postgres** — l'isolation est purement applicative (`institution-isolation.spec.ts`). Un incident documenté (mot de passe admin démo `123456` publié) a produit un garde-fou qui refuse l'ancienne valeur.

**julaba** : Supabase **RLS généralisée** (101 policies, tests SQL dédiés), auth multi-formes (BO email+MFA TOTP+api-keys+device-sessions, marchand/producteur téléphone+PIN jamais stocké côté serveur, biométrie + secure storage natif), CSP stricte (`next.config.ts`). **Mais 🚨 critique : `.env` est tracké dans git** (vérifié par `git ls-files`) et contient la clé `SUPABASE_SERVICE_ROLE_KEY` de production d'un projet Supabase réel ; le dépôt étant public, c'est une **fuite de secret à révocation immédiate**. À noter aussi : `COMPTES-TEST.md` expose des mots de passe de démo en clair (assumé démo), et zod reste peu diffusé dans les routes API.

---

## 5. Forces et faiblesses de chaque dépôt

### 5.1 `SOMET1010/julaba-app`

**Forces**
1. **Gouvernance exemplaire** : `CONSTITUTION.md` (8 principes avec mécanisme de tenue — la CI échoue sur tout doublon `…V2/…New`), registre de dette `docs/dette/REGISTRE-MAITRE.md` en révision 20 avec contre-audits numérotés (VOIX-01…03, UI-02…04, SEC-05…08…), 5 ADR, `docs/PASSATION.md` (instances de travail), chaîne de traçabilité décision→dette→preuve complète.
2. **Invariants métier exécutés contre une vraie base** : 45 specs sur PostgreSQL réel — l'argent (encaissement unique, atomicité stock, escalation de rôles, isolation institution) est prouvé, pas seulement espéré.
3. **Idempotence serveur systémique** de l'argent (migrations dédiées + invariants + E2E Maestro hors-ligne).
4. **Périmètre fonctionnel le plus large** : coopérative, intégrations oneci/ansut/RNPP, POC Odoo, notifications push, realtime, academy backend.
5. **Voix native Android de qualité** (sherpa-onnx Kotlin) + TTS Piper serveur avec replis et métriques (`voice-metrics.service.ts`).
6. **PWA sérieuse** (pré-cache des routes complet + voix) et stratégie de déploiement documentée (Render blueprint).

**Faiblesses**
1. **Composants monstres** : `FicheIdentificationDynamiqueBO.tsx` 6 649 lignes + sa jumelle 5 753 lignes (duplication ~12 400 lignes), `POSCaisse.tsx` 1 346, `AppContext.tsx` 1 351 (noyau d'état god-object), 30+ fichiers > 500 lignes.
2. **Aucun linter** et harnais de tests front maison (`tsx` ~50 scripts) non standard — fragile pour des contributeurs externes.
3. **Double chaîne de déploiement non arbitrée** (Render vs VPS julaba.online), CI ≠ CD, cible prod « non vérifiée » avouée par `ci/README.md`.
4. **Duplication structurelle backend** : 3 modules producteur (`producteur`, `producteur-rest`, `producteurs-rest`).
5. **Couverture linguistique vocale réelle moindre** : dioula « en suspens », baoulé en packs planifiés, Whisper retiré, STT web inexistant (l'expérience vocale complète n'existe que sur Android).
6. Licence voix **vits-mms-fra = CC-BY-NC** (non commerciale) découverte et bloquante pour un produit commercial (`coordination/JULABA-STATUS.md`) ; confusion V1/V2 entretenue par `JULABA_DECISIONS.md` qui décrit un autre dépôt/serveur.

### 5.2 `akoun-dev/julaba`

**Forces**
1. **Sous-système vocal multilingue le plus complet** : trois langues actives (fr/bci/dyu), modèles de traduction ONNX auto-hébergés (proxy `/api/voix/*`), TTS MMS dioula, wake-word, NLU locale, 31 fichiers de tests vocaux, honnêteté documentée sur la qualité baoulé (chrF++ affiché, « bêta assumée »).
2. **RLS Supabase généralisée et testée** (101 policies, `supabase/tests/rls.sql`) — la défense en profondeur au niveau données, que julaba-app n'a pas.
3. **Offline-first discipliné côté client** : file FIFO documentée avec conflits tracés et miroir serveur, 23 handlers, `SyncFlusher`, doctrine « jamais de repli silencieux » tenue (0 TODO, erreurs narrées).
4. **Simplicité opérationnelle** : un runtime (Bun), un framework (Next.js), un déploiement — surface cognitive minuscule, vélocité très élevée (306 commits en ~1 mois).
5. **Registres `.ai/` denses** : TASKS (69 tâches MODE-9xx avec commits de preuve), DEBT_REPORT, BUGS, REGRESSIONS, SECURITY_AUDIT, ADR, SPECS, HANDOFF — la dette est nommée, datée et suivie.
6. Écrans backoffice/identification plus compacts et moins dupliqués.

**Faiblesses**
1. **🚨 Secret de production commis** : `.env` tracké dans git avec `SUPABASE_SERVICE_ROLE_KEY` (vérifié) — à révoquer/purger d'urgence (l'historique contient la clé).
2. **Espace producteur incomplet côté serveur** : 4 routes API seulement ; `prod-stock`, `prod-cycles` et la réputation vivent dans `producteur-store.ts` avec **données seedées** (seeds r1/r2/r3, `producteur-store.ts:166-276`) et `loadFromServer()` partiel + catch silencieux (`:431-433`).
3. **APK hybride dépendant du réseau** : `capacitor.config.ts` charge l'URL Vercel — hors couverture réseau, l'app native n'a ni UI ni voix embarquées (seuls les modèles STT sont dans les assets) ; à l'inverse julaba-app embarque tout.
4. **Rigidité TypeScript/ESLint édulcorée** : `noImplicitAny: false`, ~30 règles eslint off — la qualité repose sur la discipline des agents, pas sur les garde-fous.
5. **Single-page + navigation Zustand** : pas de code-splitting par écran, pas d'URL partageables, `reactStrictMode: false`.
6. Fichiers géants côté marchand : `auth-screen.tsx` 2 169 lignes, `profile-screen.tsx` 1 565, `secondary-screens.tsx` 1 268 (5+ écrans dans un fichier), `voice-modal.tsx` 1 234, `backoffice-store.ts` 1 605.
7. CI minimale (pas de build, pas d'E2E) ; protection sociale et fidélité présentes en UI mais sans profondeur backend équivalente à julaba-app.

---

## 6. Problèmes potentiels, fonctionnalités manquantes et dette technique

### 6.1 Synthèse de la dette (par gravité)

| Gravité | julaba-app | julaba |
|---|---|---|
| **Bloquant** | Licence voix CC-BY-NC non commerciale (`vits-mms-fra`) ; prod double jamais arbitrée | **`.env` avec `SUPABASE_SERVICE_ROLE_KEY` en git public** ; APK inutilisable hors réseau |
| **Majeur** | Duplication fiche identification (~12 400 l.) ; 3 modules producteur ; `AppContext` god-object ; migrations désactivées en prod (`DB_MIGRATIONS_RUN=false`, DbInit à la place) | Espace producteur seedé sans routes serveur (stock/cycles/réputation) ; pas de code-splitting ; `noImplicitAny: false` ; eslint neutralisé |
| **Moyen** | Pas de linter ; harnais tests maison ; confusion V1/V2 (`JULABA_DECISIONS.md`) ; résidus assumés (`docs/RESIDUS.md`) | Fichiers > 2 000 lignes ; zod peu diffusé ; CI sans build/E2E ; localStorage vs IndexedDB (cap 500) |
| **Tracé** | Registre `docs/dette/REGISTRE-MAITRE.md` rev. 20 avec contre-audits | Registre `.ai/DEBT_REPORT.md` + audits `.ai/AUDITS/` |

### 6.2 Fonctionnalités manquantes croisées

- **julaba-app manque de** : traduction baoulé/dioula effective (sa priorité est ailleurs), STT web offline, wake-word, RLS base de données, linter standard.
- **julaba manque de** : coopérative, intégrations étatiques (oneci/ansut/RNPP), POC Odoo, realtime socket.io, PWA service worker, E2E mobile Maestro, encaissement billets visuel, academy backend, idempotence serveur généralisée, et de la **complétude serveur de l'espace producteur**.

---

## 7. Recommandations — choisir ou combiner

### 7.1 Quel dépôt selon le contexte

| Contexte | Recommandation | Justification |
|---|---|---|
| **MVP rapide, équipe réduite pilotée par IA, itération produit** | **julaba** | Surface technique minimale (Next.js+Bun+Supabase), vélocité démontrée, registres `.ai/` adaptés au travail agentique, RLS déjà en place |
| **Produit à l'échelle avec argent réel, équipe multiple, conformité** | **julaba-app** | Invariants métier sur vraie base, idempotence serveur, Constitution + registre de dette, périmètre métier plus large, outillage de preuve |
| **Cible mobile-first hors couverture réseau** | **julaba-app** | APK tout-embarrassé (voix native, PWA pré-cache complète) ; l'APK julaba est une coque réseau |
| **Priorité aux langues locales (baoulé, dioula) dès aujourd'hui** | **julaba** | Seul dépôt avec traduction bci/dyu effective et testée ; les packs baoulé de julaba-app sont encore planifiés |
| **Audit/conformité sécurité données** | **julaba** (après correction du `.env`) | RLS généralisée testée > isolation purement applicative |

### 7.2 Plan de combinaison recommandé (fusion des forces)

1. **Immédiat (les deux dépôts)** — rotater le secret `SUPABASE_SERVICE_ROLE_KEY` de julaba, purger `.env` de git (`git filter-repo`) et le retirer du suivi ; arbitrer la chaîne de déploiement unique de julaba-app (Render OU VPS, pas les deux).
2. **Transférer vers julaba** : le *pattern* d'**invariants métier serveur** de julaba-app (45 specs sur vraie base → reproduire les 5 critiques sur l'argent : encaissement unique, atomicité stock, tontines) ; la **PWA** (`sw.js` pré-cache) ; un flux **Maestro** « vente hors-ligne » ; le **cliquet tsc baseline** en CI.
3. **Transférer vers julaba-app** : les **modèles bci/dyu** et l'approche « modèle de traduction servi en proxy » (`/api/voix/*`) pour activer le baoulé réel ; le **wake-word** ; la doctrine « **aucun repli silencieux** » (narration d'erreur une fois par session) ; la simplicité Zustand pour alléger `AppContext.tsx`.
4. **Corriger les faiblesses structurelles** : julaba — ajouter les routes API `producteur/stock`, `producteur/cycles`, `producteur/reputation` et brancher `loadFromServer()` sur les 3 collections (les seeds disparaissent) ; julaba-app — scinder la fiche identification dupliquée (12 400 l. → 1 module partagé), fusionner les 3 modules producteur, introduire ESLint.
5. **Convergence outillage** : adopter un seul framework de test standard (vitest) dans julaba-app en remplacement du harnais maison ; activer un linter strict dans les deux (julaba : réactiver les 30 règles désactivées ; julaba-app : en introduire un).

---

## 8. Conclusion

Ces deux dépôts sont deux réponses crédibles — et remarquablement complémentaires — au même cahier des charges, à un jour d'écart en date de dernier commit (20/09/2026).

**`julaba-app` est le « système d'exploitation du commerce informel » que sa Constitution revendique** : architecture en couches éprouvée (NestJS/PostgreSQL), argent verrouillé par des invariants exécutés contre une vraie base, gouvernance documentaire inédite (registre de dette révision 20, ADR, passation par instances), périmètre fonctionnel le plus large (coopérative, wallet avec mobile money, intégrations étatiques). Son prix : une complexité structurelle réelle (composants de 6 649 lignes, double déploiement, pas de linter), une expérience vocale web incomplète, et des langues locales effectivement non couvertes à ce jour.

**`julaba` est la « vite bonne idée bien exécutée »** : un monolithe Next.js d'une grande clarté opérationnelle, le seul des deux à parler aujourd'hui baoulé et dioula via des modèles auto-hébergés, avec une défense en profondeur RLS que son homologue n'a pas et une doctrine d'anti-silence vocale tenue. Son prix : une fuite de secret critique à traiter sans délai, un espace producteur qui s'affiche plus qu'il ne sert (données seedées), un APK fictif hors réseau, et des garde-fous de typage/lint volontairement desserrés.

**Recommandation finale** : pour un lancement commercial rapide centré sur l'inclusion linguistique et un portage web-first, **julaba est l'ossature la plus avantageuse — à condition de corriger immédiatement le secret commis et de compléter le serveur producteur**. Pour une montée en charge avec des flux financiers réels, une équipe élargie et un ancrage Android tout-terrain, **julaba-app offre le socle de confiance le plus solide — à condition d'arbitrer son déploiement, de scinder ses monstres et de résoudre la licence vocale**. La trajectoire optimale est la **convergence** décrite en §7.2 : l'ossature et la RLS de julaba, l'hygiène d'argent et la gouvernance de julaba-app, et le socle vocal multilingue de julaba comme bien commun.
