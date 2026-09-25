# AUDIT-012 — 2026-09-24 — Audit externe consolidé « Manus AI »

- **Auteur** : Manus AI (audit externe fourni par le porteur, collé dans le chat du 25/09)
- **Périmètre externe** : miroir `/home/ubuntu/julaba-audit`, HEAD inconnu ANTÉRIEUR à `c3378bc`
- **Comptage** : 0 P0 · 28 P1 · 19 P2 · 3 P3 (50 constats sources, 7 audits spécialisés)
- **Triage Super Z (Task 166/MODE-1004) contre `c3378bc`** : voir table MODE-1004 dans TASKS.md — plusieurs P1 déjà corrigés amont (sync/session d966215/d0d0a26/c3378bc) ou obsolètes (ESLint vert).
- **Triage P2/P3 Super Z (Task 167/MODE-1005) contre `929dc63`** : 5 chantiers P2 corrigés (zones `zone_key` générée + 4 routes + ventes, logAudit n'avale plus son erreur DB, XFF centralisé `normalizeIp`, file offline verrouillée inter-onglets Web Locks, scanner secrets CI) ; migration `20260925110000` APPLIQUÉE à l'hébergé + vérifiée in situ. Non applicables : a11y sync-flusher (headless by design, rationale TTS documentée), comptes démo (MODE-1003), packs SHA-256 (A11-F03), hiérarchie users (MODE-1004). Dettes chiffrées : Zod 59 routes, `noImplicitAny` 140 erreurs, states UI / IndexedDB / FK zone_id / SLO / E2E (30-90 j). Détail : table MODE-1005 dans TASKS.md.

## Verdict exécutif externe (verbatim)

Socle substantiel (Next.js App Router, clients Supabase séparés, migrations versionnées, RLS, RPC transactionnelles partielles, file offline, voix native partielle) ; typecheck OK, 170 fichiers / 2 378 tests vitest OK. **Mise en production générale non recommandée en l'état** — 0 P0 mais 28 P1 dont les blocages urgents :

1. marketplace vendeur : mauvais namespace de session + transitions non atomiques ;
2. paiements/idempotence/session appareil : écritures non transactionnelles ;
3. offline `localStorage` : pertes possibles + dépendances FIFO non protégées ;
4. couverture mobile/vocale inégale (iOS non branché, packs lourds, Baoulé incomplet) ;
5. comptes/mots de passe démo dans le dépôt et le provisionnement historique ;
6. chaîne qualité incomplète (ESLint, build CI, zéro E2E) ;
7. observabilité/probes/contrôles migrations insuffisants.

Sortie de crise possible : correctifs P1 + risques résiduels acceptés + recette préproduction.

## Groupes P1 externes (résumé fidèle)

1. `seller-orders/route.ts` : `requireDeviceOwner(request,'producteur',merchantId)` alors que `merchant_id` → `public.merchants` (session `merchant:<id>`) — parcours vendeur indisponible. Transitions lues/vérifiées en mémoire puis mises à jour par id seul, événement inséré séparément avec erreur ignorée.
2. Paiements : insert `marketplace_payments` + update commande + événement séparés → `pending` orphelin possible. Commande : `p_client_id` transmis seulement si `body.clientId` ; `23505` concurrent = erreur générique.
3. `claimDeviceSession` : (obsolète — corrigé amont `d966215`, vérifié : `error` vérifié sur update l.69 et insert l.79).
4. Offline : `localStorage`, plafond 500 + éviction, enfant avant parent, `operationIdFor` non injecté (partiellement traité amont : extraction clé locale `528fe94`, propagation `Idempotency-Key` `3cec254` — à vérifier à la lecture).
5. Reprise réseau : pas de background sync (30 j) ; 401/403 → conflits définitifs (corrigé amont : suspension `d0d0a26`, statut exposé `26ffea3`, annonce corrigée `c3378bc`) ; référentiels caisse non versionnés (30 j).
6. Capacités vocales hétérogènes : iOS non branché, Web `ready:false`, packs bci/dyu opt-in lourds, Baoulé « en préparation » → matrice de capacité + masquage des non-livrées.
7. Release Android : default `full` (décision porteur — l'APK full 1.2 a été livré volontairement avec modèles fr embarqués), `minifyEnabled` off, pas d'`abiFilters`, coque distante → AAB/splits = 30 j + décision.
8. Comptes démo / gouvernance : seed hashes déterministes, `admin123` (institution neutralisé `20260924110000` [18]) ; `test-auth-all-accounts.ts` réutilise le secret ; route users sans invariants hiérarchiques ; zones par libellé libre (Adjame/Adjamé).
9. Lockout BO **fail-open** (`lockout.ts:42-43` « fail-open » explicite) ; audit journal best-effort, `x-forwarded-for` sans chaîne de confiance.
10. CI : pas de `bun run build` ; ESLint 5 erreurs `bo-config-institution-screen.tsx` (OBSOLÈTE — rejoué vert sur c3378bc) ; test Android template `ExampleInstrumentedTest` ; pas de healthz/readyz ; pas de vérif migration/SBOM.
11. (groupement) Observabilité : logs structurés, métriques, alertes — plan 7-30 j.

## Plan externe 24 h / 7 j / 30 j / 90 j

- **24 h** : namespace vendeur ; quarantaine comptes démo + révocation sessions ; écritures session bloquantes ; alerte paiements orphelins ; ESLint ; build CI ; variante Android explicite ; masquer capacités non prouvées.
- **7 j** : RPC transactionnelles (transition vendeur, paiement, idempotence) + tests concurrence ; file : enfants bloqués + clé stable injectée ; états UI communs ; `role=alert`/`aria-live` ; `healthz`/`readyz` ; vérif migrations CI + scanner secrets ; test Android template remplacé.
- **30 j** : file IndexedDB/SQLite ; non-évictables + groupes de dépendance + export ; VoiceService iOS ou retrait ; packs tailles/SHA-256 ; release Android signée splits ; back-office hiérarchie/dernier super-admin/zone FK ; préproduction.
- **90 j** : E2E durable ; SLO p95/p99 ; corpus vocal (WER) ; offline-first assumé ; restauration/revue indépendante.

## Critères d'acceptation (externes, repris tels quels)

Marketplace vendeur : session `merchant:<id>` GET/PATCH OK + refus autre marchand + pas de double transition. Transitions : état + EXACTEMENT 1 événement dans la même transaction. Paiement : 2 concurrents + retry = 1 paiement, 0 orphelin. Commande : clé idempotence obligatoire liée à l'acheteur, réutilisation avec payload différent rejetée. Session appareil : erreur upsert = échec sans cookie. Offline : ventes/clôtures jamais évincées, parent/enfant ordonné, retry idempotent. 401/403 = suspension + reclaim + rejeu. UI : états complets + annonces. Voix : qualification Android/iOS. Langues : matrice publiée. Android : AAB signé par ABI, 0 test template. Sécurité : 0 secret démo actif hébergé, lockout fermé. Back-office : invariants hiérarchie/dernier super-admin/zone. CI : build + migration check + secret scan pinés. Exploitation : healthz/readyz/métriques/alertes.

## Inconnues (externes — recette/hébergement, hors code)

Migrations hébergées appliquées/drift ; `voice-models-v1` publié ; plugin iOS réel ; aucun device/E2E ; quotas WebView ; timeout-after-commit réel ; appelants `queuePendingSync` ; chiffrement local ; reverse proxy/XFF ; artefacts Android mesurés ; seuils produit non approuvés ; file multi-comptes non spécifiée.

## Annexe comptage

| Audit source | P0 | P1 | P2 | P3 |
|---|---:|---:|---:|---:|
| Architecture, API et données | 0 | 5 | 2 | 0 |
| Interfaces et acteurs | 0 | 2 | 3 | 1 |
| Offline et synchronisation | 0 | 4 | 3 | 1 |
| Voix Tata et langues | 0 | 3 | 2 | 1 |
| Back-office, RBAC et workflows | 0 | 4 | 3 | 0 |
| Android, Capacitor et taille APK | 0 | 6 | 3 | 0 |
| Tests, qualité et exploitation | 0 | 4 | 3 | 0 |
| **Total** | **0** | **28** | **19** | **3** |
