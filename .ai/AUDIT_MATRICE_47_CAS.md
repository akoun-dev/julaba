# AUDIT MATRICE 47 CAS — 2026-09-23 — Audit complet des 47 cas de test (BO / Marchand / Hors-ligne / Producteur / Coopérative / Identificateur / Institution / Transversal)

- **Auditeur** : agent opencode (session 2026-09-23), audit statique à la demande du porteur
- **Périmètre** : HEAD `main` (d983e3d) — 47 cas de test fournis couvrant Back-office (8), Marchand (11), Hors-ligne/Synchro (2), Producteur (6), Coopérative (6), Identificateur (5), Institution (5), Transversal (4)
- **Méthode** : audit **statique** — lecture des écrans, stores, routes API, RBAC, machinerie voix, navigation ; croisement avec les audits antérieurs `.ai/AUDIT_FREEBUFF.md` (33 cas, 2026-09-22) et `AUDITE_MATRICE_TEST_LUNA.md` ; reprise des preuves fichier:ligne. Les 14 cas non couverts par les audits antérieurs (Identificateur, Institution, Transversal) ont été audités intégralement aujourd'hui par relecture du code et de l'existant des tests.
- **Baseline exécutée (2026-09-23)** : vitest **2154/2154** (160 fichiers) · `bunx tsc --noEmit` 0 · `bunx eslint .` 0. Après intégration des 8 commits distants (MODE-987→994) + correctifs locaux caisse (MODE-996).
- **Re-audit 2026-09-23 (correction transversale répartie sur 4 agents, intégration consolidée)** : les écarts I-01→I-06, F-06 et F-07 sont **traités** (verdicts mis à jour ci-dessous). Gates post-correctifs : vitest **2215/2215** (166 fichiers) · `bunx tsc --noEmit` 0 · `bunx eslint .` 0.

**Clés de lecture** (alignées AUDIT-005/AUDIT_FREEBUFF) : **[FAIT]** = vérifié (fichier:ligne cité) · **[STATIC]** = vérifié par lecture de code, à confirmer en recette fonctionnelle · **[DEVICE]** = nécessite un appareil réel, hors périmètre sandbox · **[PORTOR]** = décision/action porteur · **[ECART]** = écart constaté (verdict KO ou dégradation du statut) · **[ABSENT]** = rien n'existe.

---

## 1. Verdict en une phrase

**41 des 47 fonctionnalités sont présentes dans le code** (dont 2 hors périmètre produit à trancher [PORTOR] : F-03 marchés BO, F-04 commandes coop) ; **aucun écart bloquant ne subsiste** : l'univers Institution est livré en tant qu'espace dédié (rôle lecture-seule, 4 écrans + connexion `ins-auth`), l'identificateur dispose de ses mutations (`ident-mutations`) et de ses statistiques/rapports (`ident-rapports`), l'instrumentation de latence d'action écrite existe (server-timing sur routes d'écriture + round-trip voix bout-en-bout), et un `ErrorBoundary` racine évite la page blanche. Les 33 cas anciennement audités restent conformes, dont les 2 correctifs P1 F-01/F-02 livrés en MODE-996 et l'harmonisation F-06/F-07 désormais traitée.

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
| 16 | MAR-DEP-001 | **[FAIT] OK — corrigé F-06** | Libellés harmonisés sans changer la formule VOCAL-609 : « Caisse totale (fond inclus) » sur la feuille de bilan (`home-screen.tsx`) et dans l'annonce balance ; « solde du jour » = ventes − dépenses avec phrase vocalisée par signe (`day-summary.ts` : positif « Votre solde du jour est de X francs. » / nul / négatif explicite). 3 phrases ajoutées, tests `day-summary` mis à jour. |
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
| 26 | PRO-MAR-001 | **[FAIT] OK (F-07 traité)** | `publierRecolte` → statut `publiee` + badge. Copy clarifiée : « Publier sur le marché » → **« Mettre en vente »** sur `prod-recoltes-screen.tsx` et `prod-home-screen.tsx` (annonce + actions) ; commentaires de statuts mis à jour sur `producteur-store.ts` (RecolteStatut `publiee` = « Mise en vente »). Sémantique « visible/disponible aux marchands » conservée — pas de marketplace inter-univers consommée (hors périmètre). |
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
| 37 | IDF-MUT-001 | **[FAIT] OK — corrigé I-02** | Écran `ident-mutations-screen.tsx` (liste filtrable badges en_attente/approuvée/refusée, Sheet de signalement from→to, états vide/erreur/Réessayer, skeletons) + route `POST/GET /api/identificateur/mutations` sous `requireDeviceOwner` (requête par `requested_by` = « nom (id) », validation from≠to, statut initial `en_attente`, journalise dans `legacy_bo_mutations`) + store non-persisté (`fetchMutationsFromServer`/`addMutation`). 9 tests route. accès : cartes Accueil + route `ident-mutations`. |
| 38 | IDF-RAP-001 | **[FAIT] OK — corrigé I-03** | Écran `ident-rapports-screen.tsx` (KPI 2×2 : enrôlements jour/mois, validés/rejetés/en attente, répartition par type, activité récente, période `MONTHS_FR`) + route `GET /api/identificateur/rapports` non-bloquante (stats agrégées) + pure `bilanEnrolement()` (identificateur-store.ts:514) testée. 5 tests route + 8 tests lib. |

### Institution (39–43) — audité 2026-09-23

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 39 | INS-CON-001 | **[FAIT] OK — corrigé I-01** | Univers institution livré : `BoRole` + `role='institution'` (hiérarchie 0, **lecture seule stricte** via `canPerformAction`), route `ins-auth` + écran `ins-auth-screen.tsx` connecté à `POST /api/backoffice/login` (session cookie httpOnly) avec tentative restreinte aux comptes `role='institution'` + comptes démo, `GET /api/backoffice/session` comme autorité de reprise, store `institution-store.ts` non-persisté (check serveur à chaque rechargement). Compte démo seedé par `20260923120000_create_institution_demo_account.sql`. |
| 40 | INS-ANA-001 | **[FAIT] OK** | Tableau de bord institution dédié : `ins-dashboard-screen.tsx` (KPI + activité) consommant `GET /api/backoffice` (module `dashboard` accordé à institution) + `InsLayout` (`ins-layout.tsx`) avec navigation Tableau de bord / Acteurs / Supervision / Audit. Cohérence des chiffres à confirmer en recette ([STATIC]). |
| 41 | INS-ACT-001 | **[FAIT] OK** | `ins-acteurs-screen.tsx` consommant `GET /api/backoffice/actors` (module `acteurs:read` accordé à institution). Registre réel, lecture seule — l'écriture reste réservée aux rôles BO via `canPerformAction`. |
| 42 | INS-SUP-001 | **[FAIT] OK** | `ins-supervision-screen.tsx` consommant `GET /api/backoffice/alerts` (module `supervision` accordé à institution). Alertes/seuils réels en lecture seule ; rendu à confirmer en recette ([STATIC]). |
| 43 | INS-AUD-001 | **[FAIT] OK** | `ins-audit-screen.tsx` consommant `GET /api/backoffice/audit` (module `audit` accordé à institution) — journal réel, lecture seule, mêmes garanties serveur. |

### Transversal (44–47) — audité 2026-09-23

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 44 | TRV-PERF-001 | **[FAIT] OK — corrigé I-04** | Instrumentation de latence d'action écrite : `src/lib/server-perf.ts` (`startServerTiming` + `attachServerTiming` = header `Server-Timing` cumulatif sur les mutations) branché sur les routes d'écriture clés — sales POST, caisse-session POST/PATCH, expenses POST, sale-reversals POST, stock/movements POST (+ test vitest de l'API d'accumulation). Côté voix, `voice-perf.ts` enrichi (voir TRV-VOX-001). |
| 45 | TRV-VOX-001 | **[FAIT] OK — corrigé I-05** | Round-trip bout-en-bout mesuré : `beginVoiceRoundtrip(source)`/`endVoiceRoundtrip(source, startedAt)` dans `voice-perf.ts` (métrique `roundtrip_ms`, type `RoundtripSource`) avec points **T0** émis à l'entrée vocale (`voice-modal`, `prod-voice-modal`, `vente-rapide-modal` après son entrée) et **T1** à la sortie de narration (`tata-tts` via 4 ancres dans `conversation.ts`) — le délai parole→parole que l'utilisateur ressent est donc mesuré. Export via le même canal que `voicePerfDebug` (métrique précédente conservée). Diagnostics hors-production sous contrôle ([PORTOR] pour activation prod). |
| 46 | TRV-SEC-001 | **[FAIT] OK** | Champs secrets tous masqués : `type="password"` (`bo-auth-screen.tsx:273,354,365,376`, `coop-auth-screen.tsx:337`, `bo-config-institution-screen.tsx:699,728,757`), PIN en pastilles `•` (ident/prod), `step-autorisation.tsx:153,169` `type={pinVisible ? 'text' : 'password'}` masqué par défaut. Toggles de révélation opt-in uniquement. Aucun `console.log` de secret. (`orbit-otp.tsx` / MFA retiré — MODE-961.) |
| 47 | TRV-NAV-001 | **[FAIT] OK — corrigé I-06** | `ErrorBoundary` racine ajouté (`src/components/shared/error-boundary.tsx`, monté dans `page.tsx` autour de tout le contenu avec `resetKey={currentScreen}` et bouton « Réessayer ») — plus aucun crash de rendu ne laisse une page blanche. Fallbacks par rôle, `AccessDeniedScreen` + `BoGate` inchangés. |

---

## 3. Synthèse des écarts

| ID | Sévérité | Constat | Traitement |
|---|---|---|---|
| **F-03** | P2 | Aucun module BO « Marchés » (BO-MAR-001/002 sans cible). | Décision [PORTOR] : retirer les cas OU créer le module. **Reste ouvert.** |
| **F-04** | P2 | Pas d'écran Commandes coopérative (COO-CMD-001 sans cible). | Décision [PORTOR] : retirer le cas OU créer l'écran. **Reste ouvert.** |
| **I-01** | P1 | Univers Institution inexistant (pas de rôle, pas d'espace dédié). | **TRAITÉ** : rôle `institution` (lecture seule), `ins-auth` + 4 écrans (`ins-dashboard`/`ins-acteurs`/`ins-supervision`/`ins-audit`), store non-persisté, compte démo seedé. Verdicts INS-CON-001→INS-AUD-001 → [FAIT]. |
| **I-02** | P2 | IDF-MUT-001 : mutation d'acteur absente de l'univers identificateur. | **TRAITÉ** : écran `ident-mutations` + route inbox/outbox `requireDeviceOwner`, journal `legacy_bo_mutations`. Verdict → [FAIT]. |
| **I-03** | P2 | IDF-RAP-001 : pas d'écran statistiques/rapports identificateur. | **TRAITÉ** : écran `ident-rapports` + route stats non-bloquante + pure `bilanEnrolement()` testée. Verdict → [FAIT]. |
| **I-04** | P3 | TRV-PERF-001 : aucune instrumentation de latence d'action écrite. | **TRAITÉ** : `server-perf.ts` + header `Server-Timing` sur 5 routes d'écriture + test. Verdict → [FAIT]. |
| **I-05** | P3 | TRV-VOX-001 : instrumentation voix dev-only et partielle. | **TRAITÉ** : round-trip parole→parole T0/T1 sur 3 modales + 4 ancres `conversation.ts`. Verdict → [FAIT] (export prod à activer ad hoc [PORTOR]). |
| **I-06** | P3 | TRV-NAV-001 : aucun `ErrorBoundary`. | **TRAITÉ** : `ErrorBoundary` racine monté dans `page.tsx` (resetKey par écran, bouton Réessayer). Verdict → [FAIT]. |
| **F-06** | P3 | Deux « soldes » selon la surface. | **TRAITÉ** : « solde du jour » = ventes − dépenses ; « Caisse totale (fond inclus) » = référence caisse. Formula VOCAL-609 inchangée, 3 phrases par signe. Verdict MAR-DEP-001 → [FAIT]. |
| **F-07** | P3 | « Publier sur le marché » n'alimente aucune marketplace. | **TRAITÉ** : copy « Mettre en vente » / « Déclarer et mettre en vente » sur producteur. Sémantique visible/publiée conservée, pas de marketplace inter-univers (hors périmètre). Verdict PRO-MAR-001 → [FAIT]. |

**Vérifiés SANS action** : F-01/F-02 corrigés (MODE-996, 12 tests, re-test recette requis) ; idempotence offline complète (ventes, annulations, stock 3 entités) ; refus strict stock insuffisant 3 niveaux ; garde auth-avant-lookup systématique (`require-owner.ts`) ; annulation append-only doublement idempotente ; producteur sans page blanche ni badge manquant ; coop post-AUDIT-007 livrée ; secret jamais en clair (TRV-SEC-001) ; fallbacks de navigation par rôle (TRV-NAV-001).

---

## 4. Couverture des tests automatisés (gates 2026-09-23)

- **vitest** : 2215/2215 (166 fichiers) — progression sur 2154 (audit initial, 160 fichiers) : +61 tests apportés par la correction transversale (server-perf, mutations ident route, rapports ident route + lib, institution-store). Passages partiels : route sales + server-perf 47, voix 757, day-summary mis à jour (F-06).
- **tsc --noEmit** : 0 erreur.
- **eslint .** : 0 erreur.
- Tests dédiés par univers confirmés : marchand (sale-lock, quick-sale, route sales dont CAISSE_CLOSED, stx), identificateur (lookup, ident-enrolement, ident-sync, device-session, **mutations/rapports routes**), back-office (login, actors, audit, audit-garde), voix (intent-modules MODE-994, **day-summary F-06**, perf-server), auth (auth-*-flows MODE-987/988), **institution-store**. Recette : [FAIT] des univers Institution/Mutations/Rapports à confirmer fonctionnellement (données seedées + cookie session).

---

## 5. Limites honnêtes de cet audit

1. **Statique, pas fonctionnel** : les verdicts [STATIC] (BO-TDB cohérence, COO-STK cohérence, INS-ANA/SUP rendu, TRV-NAV sans crash) exigent une session de recette avec données seedées. Les verdicts [FAIT] issus de la correction transversale (Institution, Mutations/Rapports ident) sont vérifiés en code + unitaires, à confirmer fonctionnellement (recette).
2. **Aucun appareil mobile** : volet Mobile des cas à Ventilation (colonnes Saisie/Voix) non prouvable sans appareil réel — rejoint les blocages connus B1-010 / B5-052 / smoke stock.
3. **Pas d'exécution E2E navigateur** : les parcours UI méritent le passage pages de test HTML + snapshot prévu par TEST_PLAN.
4. **Les verdicts [FAIT]** des cas audités par lecture + tests verts restent à confirmer en recette fonctionnelle (le vert unitaire ne prouve pas le parcours complet).
5. Source de l'existant : audits `AUDIT_FREEBUFF.md` (2026-09-22) et `AUDITE_MATRICE_TEST_LUNA.md` (2026-09-22), re-validés sur HEAD d983e3d après intégration des 8 commits + correctifs MODE-996.

---

## 6. Plan de validation proposé (ordre)

1. **Trancher [PORTOR]** les 2 cas restants (F-03 : marchés BO, F-04 : commandes coop) — les écarts I-01→I-06, F-06, F-07 sont **traités en code** (verdicts section 2).
2. **Recette fonctionnelle des univers livrés** : connexion institution (compte démo seedé, `role='institution'`), mutations/rapports identificateur avec données réelles, cohérence chiffres dashboard institution ([STATIC]), round-trip voix mesuré sur appareil.
3. Rejouer en recette les lignes marquées [FAIT] « OK » et les correctifs MODE-996 (MAR-VTE-003, MAR-CAI-002).
4. Planifier la session [DEVICE] (mode avion + vente vocale + synchro) pour OFF-VOX-001/SYN-001.
5. **Migration à appliquer** : `20260923120000_create_institution_demo_account.sql` (compte `institution@julaba.ci`) avant recette institution.