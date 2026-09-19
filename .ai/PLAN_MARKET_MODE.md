# PLAN_MARKET_MODE.md — Cahier des charges « Mode Marché Jùlaba » (48 sections)

_Task 71 · 2026-09-19 · Suite directe du chantier stock (STK-801..815, Task 62) — même cahier des charges, volets restants._

> **FUSION UNION (INCIDENT-006)** : le commit utilisateur `0b209d4` (implémentation parallèle) est arrivé pendant l'incrément — son écran/store/langue/sync sont CONSERVÉS ; mes fondations §7-8 (session marché, route, migration, branchement caisse, geo jamais-throw, CloseDayModal globale) complètent les manques. Le tableau §3 reflète l'état FUSIONNÉ (détail : `.ai/INCIDENTS.md`).

## 0. Méthode imposée (§2, §47)

Audit → plan → implémentation. Aucune duplication des fonctionnalités existantes ;
réutilisation systématique (modales globales app-store, offline-db, network-store,
StockService, day-summary). Chaque tâche : spec courte → tests d'abord → code →
gates (vitest · tsc 0 · eslint 0) → registres → commit atomique → push.

## 1. PHASE 1 — AUDIT (réalisé, preuves fichier:ligne)

### 1.1 Ce qui EXISTE déjà (à réutiliser — ne jamais dupliquer)

| Domaine | Preuve |
|---|---|
| File offline localStorage + FIFO 500 + conflits 50 + flush verrouillé | `src/lib/offline-db.ts:32-268` |
| 18 handlers de sync (vente, dépense, produits, stock ×6, transferts, réception…) | `src/lib/sync-handlers.ts:58-148` |
| Déclencheurs sync (montage, retour réseau, focus, visibility) | `src/components/shared/sync-flusher.tsx:60-99` |
| Source de vérité réseau unique (@capacitor/network, optimiste) | `src/lib/stores/network-store.ts:21-104` |
| Bandeau global « Hors ligne » + badges écrans Marché/Tontines/Keiwa | `capacitor-provider.tsx:89-97`, `secondary-screens.tsx:159-169` |
| Session de caisse locale persistée (fond, isOpen, openedAt) + 3 chemins d'ouverture + clôture avec écart attendu/compté | `src/lib/stores/caisse-store.ts:13-79`, `home-screen.tsx:444-519` |
| Résumé du jour dicté (serveur + file offline + repli agrégats) | `src/lib/voice/day-summary.ts:222-444` |
| Modales globales pilotées par app-store : OpenCaisseModal, VenteRapideModal, VoiceModal, résumé (`showDaySummary`), clôture (`showCloseDay`/`openCloseDay`) | `app-store.ts:127-165`, `page.tsx:425-430` |
| Stock complet offline-first (mouvements append-only, refus strict, RPC idempotentes) | STK-801..815 (`CHECKLIST_STK.md` 25/25) |
| Geolocation plugin installé + pattern capture (natif → repli web, jamais throw) | `package.json:36`, `ident-identification-screen.tsx:437-490`, `biometric-auth.ts:5-32` |
| Notifications locales + préférences par catégorie (on/important/off) | `src/lib/notifications/*`, `notification-preferences-screen.tsx` |
| Conventions Zustand : `persist` + `name: 'julaba-…'` + `partialize` (+ `onRehydrateStorage`), jamais `version/migrate` | `caisse-store.ts:158-187`, `app-store.ts:342-391` |
| Routes API marchand : `requireDeviceOwner` + zod (`validation/marchand.ts`) + Supabase admin | `purchases/route.ts:1-60` |

### 1.2 Ce qui MANQUE (volets « Mode Marché » proprement dit)

| § cahier | Manque | Preuve |
|---|---|---|
| §4-5 | Aucune activation/configuration « Mode Marché » (entrée, modale, marché/position) | grep marketId/market_id → 0 |
| §6 | Aucune géolocalisation marchand (le plugin n'est câblé que pour l'enrôlement identificateur) | `ident-identification-screen.tsx` seul consommateur |
| §7-8 | `market_session` inexistante : la session de caisse ne porte ni marché ni position, clôture purement locale sans trace serveur | `caisse-store.ts:13-19` ; `cash_sessions` non câblée (auth Supabase Auth, pas device-session) |
| §9/§21 | Modes de paiement ABSENTS (vente = espèces implicite, `amountReceived = total`) ; crédit explicitement BLOQUÉ à la voix (`credit_block`) | `validation/marchand.ts:18-26`, `localIntent.ts:646-653` |
| §21-22 | Aucune dette client, aucun remboursement ; `business_partners.balance_cfa` jamais lu/écrit | grep → 0 |
| §15 | Fournisseurs : table + FK prêtes mais zéro API CRUD, zéro UI, `supplierId` jamais envoyé par le client | `purchases/route.ts:124` seul usage |
| §18 | Pas de point de vente (le seul « marché » = marketplace virtuel `MarcheScreen` — piège de nommage, route `'marche'` déjà prise) | `secondary-screens.tsx:57-197` |
| §26 | Pas d'alerte crédit/dette | `notifications/events.ts` (12 types, aucun crédit) |
| §27-28 | Intents manquants : crédit (« me doit »), remboursement (« m'a payé »), annulation dernière vente, commencer/fermer ma journée (action réelle) | `localIntent.ts:8-29` (20 intents, aucun de ces cas) |
| §34 | Pas d'indicateur discret « n opérations en attente » à l'écran (seules notifications) ; état « Synchronisation… » non observable | `offline-db.ts` n'expose pas d'état de flush |
| §40 | Pas d'écran principal Mode Marché | `ScreenRoute` n'a pas la route |
| §46 | `docs/MARKET_MODE.md` absent | docs/ |
| §44 | Test Android réel : blocage appareil (comme B5-052) | — |

### 1.3 Pièges identifiés

1. **Cycle de dépendance** : caisse-store ne doit PAS être importé par market-mode-store (le lien se fait par arguments passés depuis caisse-store → market-mode-store, sens unique).
2. **`openSession` a 3 appelants, `closeSession` 1** : le branchement se fait DANS les actions du store (point unique), jamais dans les écrans.
3. **Résumé du jour** : la modale `showDaySummary` est rendue DANS HomeScreen — `toggleDaySummary()` depuis un autre écran n'affiche rien. L'écran Mode Marché fait parler Tata directement (fonctions pures réutilisées).
4. **Nommage** : route `'marche'` = marketplace virtuel. La nouvelle route s'appelle `'mode-marche'`.
5. **Marchés** : aucune table `markets` en base → liste provisoire assumée + « Autre » libre (remplaçable dès qu'une table/API marché existera — consigné).
6. **Emoji** : règle no-emoji du dépôt → icônes lucide (Basket, WifiOff…).
7. **Idempotence** : `client_id` unique sur la session marché ; rejeu offline = même payload → upsert serveur par `client_id`.

## 2. PHASE 2 — PLAN (tâches MODE-9xx)

| ID | Contenu | Prio | Statut |
|---|---|---|---|
| MODE-901 | Fondation : `market-mode-store` (activation, marché, mode de position, session courante) + modale d'activation (§4) + configuration (§5) + entrée accueil | P1 | **livré Task 71** |
| MODE-902 | Journée marché : entité `market-session` (migration + route upsert idempotente + handler sync + branchement caisse-store) — §7-8 | P1 | **livré Task 71** |
| MODE-903 | Géolocalisation au moment utile (§6) : `geo.ts` (natif → repli web, jamais throw), capture à l'activation et à l'ouverture, refus NON bloquant | P1 | **livré Task 71** |
| MODE-904 | Indicateur connectivité discret (§34) : état de flush exposé par offline-db + builder pur 4 états + bandeau écran | P2 | **livré Task 71** |
| MODE-905 | Écran principal Mode Marché (§40) : actions essentielles via modales existantes, carte journée, accès secondaires, narration vocale | P1 | **livré Task 71** |
| MODE-906 | Crédits clients + remboursements (§9/§21-22) : `payment_method` sur ventes, clients nommés, dettes (`business_partners` kind client), intents vocaux crédit/paiement, alertes crédit | P1 (grand chantier) | **livré Task 74-b** (grand livre `merchant_credit_ops` + RPC idempotente + routes partners/credit-ops + handlers offline + écran Mes crédits + caisse Crédit + voix — tests d'abord, 956/956) |
| MODE-907 | Fournisseurs (§15) : API CRUD `business_partners`, rattachement aux achats (client + vocal), annuaire UI | P2 | **livré Task 74-c** (supplierClientId résolu en route + création à la volée, capture vocale « chez X », écran Mes fournisseurs, crédit fournisseur en AFFICHAGE SEUL — tests d'abord, 992/992) |
| MODE-908 | Points de vente multiples (§18) : entité point de vente, point actif visible, vente étiquetée | P2 | **livré Task 74-d** (table `merchant_selling_points` + route upsert idempotent + handler offline 'selling-point' + store 'julaba-selling-points' avec « Boutique » auto-créée + étiquette des ventes résolue en insert legacy + écran Mes points de vente, carte journée cliquable — tests d'abord, 1031/1031) |
| MODE-909 | Annulation/correction de vente (§28) : opération inverse append-only, historique conservé, intent vocal | P2 | **livré Task 74-e** (table `merchant_sale_reversals` + RPC `merchant_reverse_sale` verrou vente/idempotence double + mouvements CUSTOMER_RETURN via merchant_record_movement (operation_id dérivé par produit) + route sale-reversals (PGRST202 → repli honnête, 42P01 → 503, 422 vente introuvable, 23505 → relecture) + handler offline 'sale-reversal' + GET sales `annulee`/`cancelledCount` + journal caisse du jour + reverseSale (stock DELTA, refus double) + écran Ventes badge ambre/modale raison + intent vocal `annule_vente` avec confirmation orale + résumé du jour « N vente(s) annulée(s) non comptée(s). » — tests d'abord, 1096/1096) |
| MODE-910 | Résumé enrichi (stock faible §23) + tableau de bord stats (§25) + préférences d'alertes (§26) | P2 | A_FAIRE |
| MODE-911 | `docs/MARKET_MODE.md` (§46) | P1 | **livré Task 71** |
| MODE-912 | Tests transverses (§43) + checklist §45 + smoke Android réel (§44 — BLOQUÉ appareil, rejoint B5-052) | P1 | partiel (local) — A_FAIRE (appareil) |

### 2.1 Décisions d'architecture (D1-D8, alignées sur PLAN_STOCK D1-D7)

- **D1** — Le Mode Marché est un ÉTAT LOCAL (zustand persisté), pas un compte ni un rôle : l'offline-first est déjà la nature de l'app, l'activation module l'affichage et le contexte, jamais les droits.
- **D2** — `market-session` = un enregistrement RÉSUMÉ de journée (upsert idempotent par `client_id`) rattaché à la session de caisse existante. La caisse reste la source de vérité des montants ; la session marché porte le CONTEXTE (marché, position, caisse de départ, clôture).
- **D3** — Zéro duplication UI : l'écran Mode Marché pilote les modales globales existantes (`openVenteRapideModal`, `openOpenCaisseModal`, `openCloseDay`, `openVoiceModal`) et les fonctions pures existantes (`collectTodaySales`, `buildDaySummarySpeech`).
- **D4** — Géolocalisation : pattern `biometric-auth` (jamais throw, repli web, états explicites captured/refused/unavailable) ; capture à l'activation ET à l'ouverture de journée (fire-and-forget, jamais bloquante) ; refus = continuation normale (§6).
- **D5** — Marchés : liste provisoire `markets.ts` + « Autre » libre ; remplacée dès qu'une table/API marché existe (limitation consignée dans la doc).
- **D6** — Indicateur connectivité : l'offline n'est JAMAIS une erreur (§34) — ton neutre/ambre, jamais rouge ; l'état « Synchronisation… » s'appuie sur un compteur de flush exposé par offline-db (incrémenté/décrémenté dans `finally`).
- **D7** — Hors périmètre de la présente livraison (tâches dédiées) : modes de paiement/crédits (MODE-906), fournisseurs (907), points de vente multiples (908), annulation (909) — chaque tâche avec sa propre spec/tests.
- **D8** — Clé de store `julaba-market-mode-store` ; `partialize` minimal (activation, config marché, position, dernière session) ; convention sans `version/migrate`.

## 3. PHASE 3 — Livraison Task 71 (MODE-901..905 + 911 + 912 partiel)

Fichiers nouveaux : `src/lib/market-mode/{markets,geo,market-session,connectivity,market-mode-store}.ts`,
`src/components/marchand/{market-mode-screen,market-mode-activation-modal}.tsx`,
`src/app/api/marchand/market-sessions/route.ts`, migration `merchant_market_sessions`,
`docs/MARKET_MODE.md`, tests `src/lib/market-mode/__tests__/*`.
Fichiers modifiés : `offline-db.ts` (compteur de flush), `sync-handlers.ts` (+1 entité),
`caisse-store.ts` (branchement session, signature `closeSession` étendue compat),
`app-store.ts` (+route), `page.tsx` (+case +narration), `home-screen.tsx` (+tuile),
`validation/marchand.ts` (+schémas).

Critères d'acceptation locaux (§45 vérifiables hors appareil) : activation/config fonctionnent,
session marché enregistrée offline → queue → upsert idempotent, GPS refusé ≠ blocage,
indicateur 4 états, écran opérationnel, tests verts, zéro régression (901/901 baseline).
