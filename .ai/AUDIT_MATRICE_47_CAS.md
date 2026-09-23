# AUDIT MATRICE 47 CAS — 2026-09-23 — Audit complet des 47 cas de test (BO / Marchand / Hors-ligne / Producteur / Coopérative / Identificateur / Institution / Transversal)

- **Auditeur** : agent opencode (session 2026-09-23), audit statique à la demande du porteur
- **Périmètre** : HEAD `main` (d983e3d) — 47 cas de test fournis couvrant Back-office (8), Marchand (11), Hors-ligne/Synchro (2), Producteur (6), Coopérative (6), Identificateur (5), Institution (5), Transversal (4)
- **Méthode** : audit **statique** — lecture des écrans, stores, routes API, RBAC, machinerie voix, navigation ; croisement avec les audits antérieurs `.ai/AUDIT_FREEBUFF.md` (33 cas, 2026-09-22) et `AUDITE_MATRICE_TEST_LUNA.md` ; reprise des preuves fichier:ligne. Les 14 cas non couverts par les audits antérieurs (Identificateur, Institution, Transversal) ont été audités intégralement aujourd'hui par relecture du code et de l'existant des tests.
- **Baseline exécutée (2026-09-23)** : vitest **2154/2154** (160 fichiers) · `bunx tsc --noEmit` 0 · `bunx eslint .` 0. Après intégration des 8 commits distants (MODE-987→994) + correctifs locaux caisse (MODE-996).

**Clés de lecture** (alignées AUDIT-005/AUDIT_FREEBUFF) : **[FAIT]** = vérifié (fichier:ligne cité) · **[STATIC]** = vérifié par lecture de code, à confirmer en recette fonctionnelle · **[DEVICE]** = nécessite un appareil réel, hors périmètre sandbox · **[PORTOR]** = décision/action porteur · **[ECART]** = écart constaté (verdict KO ou dégradation du statut) · **[ABSENT]** = rien n'existe.

---

## 1. Verdict en une phrase

**41 des 47 fonctionnalités sont présentes dans le code** (dont 4 hors périmètre produit à trancher [PORTOR]) ; **3 écarts réels** bloquent la certification : l'univers Institution en tant qu'espace dédié **n'existe pas** (les capacités annoncées sont celles du Back-Office générique, sans rôle ni route institution), l'identificateur n'a **ni mutation ni statistiques/rapports dédiés** (mutations et rapports vivent au back-office), et **aucune instrumentation de latence d'action écrite** n'existe (TRV-PERF-001). La mesure voix (TRV-VOX-001) est partielle (dev-only, sans délai bout-en-bout). Les 33 cas anciennement audités restent conformes, dont les 2 correctifs P1 F-01/F-02 livrés en MODE-996 (verrou anti double-soumission + garde caisse clôturée client & serveur).

---

## 2. Verdicts ligne par ligne (47 cas)

### Back-office (1–8)

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 1 | BO-CON-001 | **[STATIC] OK code** | `/api/backoffice/login` scrypt timing-safe + verrous compte/IP (`record_backoffice_auth_failure`, migration 20260922110000, garde partagée `auth-lookup-guard.ts`), session httpOnly 12 h, rotation au login, `forcePasswordChange` intercepté (`bo-auth-screen.tsx:47-101`). Tests route (MODE-964/965). |
| 2 | BO-MAR-001 | **[ECART] hors périmètre (F-03)** | Aucun module « Marchés » dans `MODULE_LIST` (backoffice-permissions.ts:10-19). La gestion des lieux vit côté marchand (MODE-908, `points-vente-screen.tsx`, `merchant_market_sessions`). Décision [PORTOR] : retirer le cas OU créer le module. |
| 3 | BO-MAR-002 | **[ECART] hors périmètre (F-03)** | Idem BO-MAR-001. |
| 4 | BO-ACT-001 | **[STATIC] OK code** | `/api/backoffice/enrolments` POST → `merchants.insert` + `actors` (validation dossier agent WF5). Liaison « marché associé » : le marchand crée ses points de vente lui-même (MODE-908). |
| 5 | BO-ACT-002 | **[STATIC] OK code** | producers/coopératives (`/api/backoffice/cooperatives`)/institutions (`/api/backoffice/institutions`)/identificateurs (`/api/backoffice/identificateurs`) + `logAudit` systématique. |
| 6 | BO-MDP-001 | **[STATIC] OK code** | `users/route.ts` POST : tempPassword crypto (`crypto.getRandomValues`), hash scrypt, `force_password_change: true`, interception à la 1ʳᵉ connexion, affiché à l'admin (`bo-utilisateurs-screen.tsx:439`). |
| 7 | BO-AUD-001 | **[STATIC] OK code** | Module `audit` + `/api/backoffice/audit` GET + `logAudit` branché sur les mutations + recherche sanitizée (`sanitizeSearchTerm`). |
| 8 | BO-TDB-001 | **[STATIC] OK code** | `bo-dashboard-screen` + `fetchAllData` pré-gaté par rôle + `Promise.allSettled`, erreurs par domaine `BoErrorDomain` → `BoErrorBanner`. Cohérence chiffres à confirmer en recette. |

### Marchand (9–19)

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 9 | MAR-CON-001 | **[FAIT] OK** | WF2 complet, lookup sans PII, session appareil requise. |
| 10 | MAR-CAI-001 | **[FAIT] OK** (+ [DEVICE]) | `openSession` idempotent, unicité 23505 gérée, offline-safe. |
| 11 | MAR-STK-001 | **[FAIT] OK** | `addProduct` offline-first, jamais de produit fantôme. |
| 12 | MAR-STK-002 | **[FAIT] OK** | `updateProduct` optimiste + rollback + file `product-update`. |
| 13 | MAR-VTE-001 | **[FAIT] OK** | RPC `merchant_record_sale`, refus strict stock, delta local post-verdict. |
| 14 | MAR-VTE-002 | **[FAIT] OK** | `items[]` atomiques multi-articles (pgTAP). |
| 15 | MAR-VTE-003 | **[FAIT] OK — corrigé MODE-996** | Verrou module `src/lib/marchand/sale-lock.ts` (`sousVerrouVente`) + garde `isProcessingSale` + bouton Valider désactivé ; vente rapide et voix déjà protégées. 4 tests. Re-test recette requis. |
| 16 | MAR-DEP-001 | **[PARTIEL] (F-06)** | Deux « soldes » différents selon la surface (bouton balance = caisse complète fond inclus ; résumé vocal = ventes − dépenses). Harmoniser les libellés [PORTOR], sans changer la formule VOCAL-609. |
| 17 | MAR-HIS-001 | **[FAIT] OK** | Fetch borné (limite affichée), revenu hors annulées, données réelles. |
| 18 | MAR-CAI-002 | **[FAIT] OK — corrigé MODE-996** | Garde `session.isOpen` DÈS L'ENTRÉE de `completeQuickSale` (couvre stock + voix + vente rapide) + phrase imposée `formatCaisseClosedRefusal()` sur 4 surfaces + POST `/api/marchand/sales` refuse **409 CAISSE_CLOSED** (clôturée ou inconnue, après pré-check d'idempotence : replay offline préservé). 8 tests. Re-test recette requis. |
| 19 | MAR-CAI-003 | **[FAIT] OK** | Annulation append-only, double idempotence (operation_id + sale_client_id), bornée au jour (serveur verrou FOR UPDATE). |

### Hors-ligne / Synchronisation (20–21)

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 20 | OFF-VOX-001 | **[FAIT] code OK** (+ [DEVICE]) | STT natif Sherpa offline embarqué, vente vocale → file `sale` idempotente, erreurs explicites. Preuve réelle sur appareil (Tecno/Infinix) requise. |
| 21 | SYN-001 | **[FAIT] code OK** (+ [DEVICE]) | WF7 : `sync-flusher` FIFO 12+ handlers rejeu idempotent (`client_id`/`operation_id` déterministes), conflits → `/api/sync-conflicts/report` → écran BO. |

### Producteur (22–27)

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 22 | PRO-CON-001 | **[FAIT] OK** | Login unifié + session appareil `producteur:` requise. |
| 23 | PRO-REC-001 | **[FAIT] OK** | `addRecolte` syncOrQueue, refus sans session, annonce vocale WF4. |
| 24 | PRO-REC-002 | **[FAIT] OK** | Filtres + badges tous statuts + vide maîtrisé. |
| 25 | PRO-STK-001 | **[FAIT] OK** | Loading/erreur/Réessayer + héro total kg + détail. |
| 26 | PRO-MAR-001 | **[FAIT] OK** (+ nuance F-07) | `publierRecolte` → statut `publiee` + badge. Pas de marketplace inter-univers consommée par les marchands — sémantique « visible/publiée » seulement. À clarifier [PORTOR]. |
| 27 | PRO-CMD-001 | **[FAIT] OK** | Filtres, badges complets, transitions validées serveur (machine à états, 409 sur transition interdite). |

### Coopérative (28–33)

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 28 | COO-CON-001 | **[FAIT] OK** | Login unifié + `coop-auth` repli + `CoopGate` léger non bloquant. |
| 29 | COO-MEM-001 | **[FAIT] OK** | `/api/cooperatives/membres` + recherche locale + vide maîtrisé. |
| 30 | COO-MEM-002 | **[FAIT] OK (contrat resserré)** | Ajout de marchand EXISTANT par numéro (`search-marchand`), contrat `synced\|queued\|lost`. Créer un membre de toutes pièces n'est pas le design actuel. |
| 31 | COO-FIN-001 | **[FAIT] OK** | Solde réel, écritures en attente explicites, rechargement à l'entrée. F-05 obsolète (MODE-977 traite les 7 décisions par `syncOrQueue`). |
| 32 | COO-STK-001 | **[FAIT] OK** (+ [STATIC]) | `/api/cooperatives/stock` + `mouvementsRecents`. Cohérence à confirmer en recette. |
| 33 | COO-CMD-001 | **[ECART] hors périmètre (F-04)** | Aucun écran « Commandes » côté coopérative (`coop-gestion` = stock/besoins/journaux). Commandes existent côté marchand et producteur. Décision [PORTOR]. |

### Identificateur (34–38) — audité 2026-09-23

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 34 | IDF-CON-001 | **[FAIT] OK** | `ident-auth-screen.tsx` (flux téléphone/code agent/PIN/liaison `claim-code`), `/api/identificateur/auth/lookup` (garde IP anti-énumération, réponse sans PII), `claim-device-session.ts` + file `device-claim`. 8 tests lookup + device-session + auth-lookup-guard. |
| 35 | IDF-ENR-001 | **[FAIT] OK** | Wizard 5 étapes (`ident-identification-screen.tsx` + `wizard/step-*`), logique pure `ident-enrolement.ts` (≈25 tests), soumission `submitDossierToServer` → POST `/api/backoffice/enrolments`, verdicts `synced\|queued\|lost`, file `ident-dossier`. |
| 36 | IDF-BRO-001 | **[FAIT] OK (persistance pure testée)** | Auto-save 800 ms/30 s + `handleSaveDraft` (`use-ident-submission.ts`), écran `ident-brouillons-screen.tsx` (Reprendre/Soumettre/Supprimer), reprise par `currentDraftId`, store persisté avec `brouillonsPersistables` (texte conservé, images retirées — testé). Pas de test des composants/flow complet. |
| 37 | IDF-MUT-001 | **[ECART]** | La mutation d'acteur n'existe **qu'au back-office** (`bo-mutations-screen.tsx`, `/api/backoffice/mutations`, `bo-mutations-slice.ts`, RBAC `'mutations'` sans rôle identificateur). Côté identificateur : aucun écran, route, ni suivi de mutation (union `ScreenRoute` sans `ident-mutations` ; `ident-suivi` = suivi des dossiers d'enrôlement, pas des mutations). |
| 38 | IDF-RAP-001 | **[ECART]** | Pas d'écran « Statistiques / Rapports » identificateur (`ident-stats`/`ident-rapports` absents de `AppScreenRoute` et du routeur). Compteurs d'accueil (`ident-home-screen.tsx`) et de missions (`ident-missions-screen.tsx`) seulement. Le module « Rapports » est back-office (`bo-rapports`, RBAC `['super_admin','admin_national']`). |

### Institution (39–43) — audité 2026-09-23

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 39 | INS-CON-001 | **[ECART]** | **Aucun univers institution dédié.** `BoRole` (backoffice-permissions.ts:6) = 5 rôles BO, sans `institution` ; `/api/auth/lookup` ne retourne que marchand/producteur/cooperateur ; aucun écran `ins-*-screen.tsx`, aucune route `/api/institution/*`, aucun rôle institution dans le RBAC. La connexion existante est celle du Back-Office générique (`bo-auth-screen.tsx`, `/api/backoffice/login`). Le module « Institutions » (`bo-institutions-screen.tsx`, `/api/backoffice/institutions`, RBAC) est un CRUD de gestion des institutions partenaires, PAS un espace de connexion. |
| 40 | INS-ANA-001 | **[STATIC]** | Dashboard (`bo-dashboard-screen.tsx`) + Analytics (`bo-analytics-screen.tsx`, `/api/backoffice/analytics`, RBAC `analytics`) existent dans le Back-Office générique. Aucune variante « institution », aucun test dédié. |
| 41 | INS-ACT-001 | **[FAIT]*** | `bo-acteurs-screen.tsx` + `/api/backoffice/actors` (GET/PATCH, garde `acteurs:read`, borne de zone) + tests route. *Registre Back-Office générique, pas segmenté institution. |
| 42 | INS-SUP-001 | **[STATIC]** | `bo-supervision-screen.tsx` (alertes, filtres, enrôlements en attente, activité récente) ; consomme `/api/backoffice/alerts`, `/api/backoffice/enrolments`, `/api/backoffice/audit`. Sans test dédié, sans vue institution. |
| 43 | INS-AUD-001 | **[FAIT]*** | `bo-audit-screen.tsx` (filtres dates/utilisateur/action/module/recherche, pagination, export CSV, empreinte SHA-256) + `/api/backoffice/audit` testée (5 tests, dont sécurité du filtre user). *Journal Back-Office générique. |

### Transversal (44–47) — audité 2026-09-23

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 44 | TRV-PERF-001 | **[ABSENT]** | Aucune instrumentation de latence d'action écrite : aucun `performance.now` autour des mutations (vente, dépense, sauvegarde, synchro), aucun header/`Server-Timing` côté API, aucun log temporel sur les routes d'écriture, aucun test de performance. Seule mesure : latence DB d'un `count` sur `bo_users` (`/api/backoffice/monitoring`, route.ts:59-61) — santé serveur, pas une latence ressentie. |
| 45 | TRV-VOX-001 | **[ECART] (partiel, dev-only)** | `src/lib/voice/voice-perf.ts` : `voicePerfDebug(metric, durationMs)` — **no-op en production** (retour immédiat si `NODE_ENV==='production'`), log `console.debug` en dev seulement. 6 métriques instrumentées : `asr_load_ms` (voice-service.ts:160), `tts_load_ms`/`tts_generation_ms` (mms-tts.ts:662,796), `nllb_load_ms`/`nllb_inference_ms` (nllb-translation.ts:388,598), `language_switch_ms` (language-selector.tsx:73). **Aucun chronométrage du délai global parole→réponse** (STT→synthèse) là où l'utilisateur le ressent (voix-modal, chaîne baoulé) ; `tata-tts`, `stt-factory`, `voice-modal`, `baoule-engine` non instrumentés. Aucun test perf. |
| 46 | TRV-SEC-001 | **[FAIT] OK** | Champs secrets tous masqués : `type="password"` (`bo-auth-screen.tsx:273,354,365,376`, `coop-auth-screen.tsx:337`, `bo-config-institution-screen.tsx:699,728,757`), PIN en pastilles `•` (ident/prod), `step-autorisation.tsx:153,169` `type={pinVisible ? 'text' : 'password'}` masqué par défaut. Toggles de révélation opt-in uniquement. Aucun `console.log` de secret. (`orbit-otp.tsx` / MFA retiré — MODE-961.) |
| 47 | TRV-NAV-001 | **[STATIC]** | Navigation client-side route unique `/` avec fallback par défaut systématique par rôle (page.tsx, bo-screen-router.tsx:168 + `AccessDeniedScreen` + `BoGate`) ; états erreur/Réessayer présents dans les 5 univers (marchand, producteur, coopérative, back-office, identificateur). **Réserves** : aucun `ErrorBoundary` dans tout `src/` (un crash de rendu = page blanche non capturée) ; accueil identificateur sans état loadError (alimenté directement par le store). |

---

## 3. Synthèse des écarts

| ID | Sévérité | Constat | Traitement recommandé |
|---|---|---|---|
| **F-03** | P2 | Aucun module BO « Marchés » (BO-MAR-001/002 sans cible). | Décision [PORTOR] : retirer les cas OU créer le module. |
| **F-04** | P2 | Pas d'écran Commandes coopérative (COO-CMD-001 sans cible). | Décision [PORTOR] : retirer le cas OU créer l'écran. |
| **I-01** (nouveau) | P1 | **Univers Institution inexistant** : pas de rôle `institution`, pas de route `/api/institution/*`, pas d'écran `ins-*`. Les 5 cas INS pointent sur des capacités Back-Office génériques, dont la connexion ne peut PAS être « compte institution » (INS-CON-001 = écart irréductible). | Décision produit : créer l'univers institution (rôle + lookup + écrans dédiés) OU reformuler les 5 cas comme « Back-office » (`BO-*`). |
| **I-02** (nouveau) | P2 | **IDF-MUT-001** : mutation d'acteur absente de l'univers identificateur (100 % back-office). | Décision produit : écran de mutation identificateur (création + suivi) OU reformuler le cas. |
| **I-03** (nouveau) | P2 | **IDF-RAP-001** : pas d'écran statistiques/rapports identificateur (compteurs d'accueil seulement). | Créer un écran stats/rapports agent OU reformuler le cas. |
| **I-04** (nouveau) | P3 | **TRV-PERF-001** : aucune instrumentation de latence d'action écrite. | Ajouter timing autour des mutations clés (vente, clôture, synchro) + header/`Server-Timing` sur les routes d'écriture + test. |
| **I-05** (nouveau) | P3 | **TRV-VOX-001** : instrumentation voix dev-only et partielle (pas de délai parole→réponse bout-en-bout). | Chronométrer le round-trip STT→réponse dans la modale vocale + chaîne baoulé, exporter la métrique (endpoint ou log structuré), garder le no-op prod ou le rendre actif en prod sous contrôle. |
| **I-06** (nouveau) | P3 | **TRV-NAV-001** : aucun `ErrorBoundary` ; accueil identificateur sans état loadError. | Ajouter un ErrorBoundaire racine + état erreur/retry sur `ident-home-screen`. |
| **F-06** | P3 | Deux « soldes » selon la surface (source du PARTIEL MAR-DEP-001). | Harmoniser les libellés (« caisse totale » vs « solde du jour »), sans changer la formule VOCAL-609. |
| **F-07** | P3 | « Publier sur le marché » n'alimente aucune marketplace inter-univers. | Clarifier le wording UI et le cas PRO-MAR-001. |

**Vérifiés SANS action** : F-01/F-02 corrigés (MODE-996, 12 tests, re-test recette requis) ; idempotence offline complète (ventes, annulations, stock 3 entités) ; refus strict stock insuffisant 3 niveaux ; garde auth-avant-lookup systématique (`require-owner.ts`) ; annulation append-only doublement idempotente ; producteur sans page blanche ni badge manquant ; coop post-AUDIT-007 livrée ; secret jamais en clair (TRV-SEC-001) ; fallbacks de navigation par rôle (TRV-NAV-001).

---

## 4. Couverture des tests automatisés (gates 2026-09-23)

- **vitest** : 2154/2154 (160 fichiers) — en progression par rapport à 1868 (2026-09-22) et 1971 (après MODE-996, 151 fichiers) : +183 tests apportés par les 8 commits distants MODE-987→994.
- **tsc --noEmit** : 0 erreur.
- **eslint .** : 0 erreur.
- Tests dédiés par univers confirmés : marchand (sale-lock, quick-sale, route sales dont CAISSE_CLOSED, stx), identificateur (lookup, ident-enrolement, ident-sync, device-session), back-office (login, actors, audit, audit-garde), voix (intent-modules MODE-994), auth (auth-*-flows MODE-987/988).

---

## 5. Limites honnêtes de cet audit

1. **Statique, pas fonctionnel** : les verdicts [STATIC] (BO-TDB cohérence, COO-STK cohérence, INS-ANA/SUP rendu, TRV-NAV sans crash) exigent une session de recette avec données seedées.
2. **Aucun appareil mobile** : volet Mobile des cas à Ventilation (colonnes Saisie/Voix) non prouvable sans appareil réel — rejoint les blocages connus B1-010 / B5-052 / smoke stock.
3. **Pas d'exécution E2E navigateur** : les parcours UI méritent le passage pages de test HTML + snapshot prévu par TEST_PLAN.
4. **Les verdicts [FAIT]** des cas audités par lecture + tests verts restent à confirmer en recette fonctionnelle (le vert unitaire ne prouve pas le parcours complet).
5. Source de l'existant : audits `AUDIT_FREEBUFF.md` (2026-09-22) et `AUDITE_MATRICE_TEST_LUNA.md` (2026-09-22), re-validés sur HEAD d983e3d après intégration des 8 commits + correctifs MODE-996.

---

## 6. Plan de validation proposé (ordre)

1. **Trancher [PORTOR]** le sort de l'univers Institution (I-01 : créer OU reformuler les 5 cas INS → BO), des cas F-03/F-04 (BO-MAR-001/002, COO-CMD-001) et de I-02/I-03 (mutation + stats identificateur).
2. Corriger **I-04/I-05/I-06** (TRV-PERF, TRV-VOX bout-en-bout, ErrorBoundary) si ces cas sont conservés dans la matrice.
3. Rejouer en recette les lignes marquées [FAIT] « OK » et les correctifs MODE-996 (MAR-VTE-003, MAR-CAI-002).
4. Planifier la session [DEVICE] (mode avion + vente vocale + synchro) pour OFF-VOX-001/SYN-001.
5. Mettre à jour la matrice source et `TASKS.md` en fonction des décisions [PORTOR].