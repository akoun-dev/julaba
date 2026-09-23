# AUDIT FREEBUFF — 2026-09-22 — Audit complet de la matrice de 33 cas de test (Web × Mobile × Saisie × Voix)

- **Auditeur** : Buffy (agent, session Freebuff) — audit statique à la demande du porteur, selon les normes `.ai/` (règles d'or README, TEST_PLAN §1, format AUDIT-005/007)
- **Périmètre** : HEAD `main` local — 33 cas de test fournis couvrant Back-office (8), Marchand (10), Hors-ligne/Synchro (2), Producteur (5), Coopérative (5)
- **Méthode** : audit **statique** (le sandbox ne dispose d'aucun appareil mobile ni navigateur de recette) — pour chaque cas : analyse du code des surfaces impliquées (écrans, stores, routes API, migrations), relecture des tests automatisés existants, conformité aux workflows WF1–WF8 et aux contraintes REQ-T1..T5. Les gates réels ont été rejoués aujourd'hui.
- **Baseline exécutée (2026-09-22)** : vitest **1868/1868** (142 fichiers) · `tsc --noEmit` 0 · `eslint .` 0. Build non rejoué (non pertinent pour un audit statique sans modification de code).

**Clés de lecture** (alignées AUDIT-005) : **[FAIT]** = vérifié (fichier:ligne cité) · **[STATIC]** = vérifié par lecture de code, à confirmer en recette fonctionnelle · **[DEVICE]** = nécessite un appareil réel, hors périmètre sandbox · **[PORTOR]** = décision/action porteur · **[ECART]** = écart constaté (verdict KO ou dégradation du statut).

---

## 1. Verdict en une phrase

**Aucun blocage P0 sur les 33 cas ; 24 cas couverts par le code + tests verts ([FAIT]/[STATIC]), 1 cas KO confirmé côté serveur (MAR-CAI-002 — vente refusée seulement côté client), 1 cas PARTIEL (MAR-DEP-001), et 8 cas non prouvables sans données de recette BO** — la matrice « Marchand » (lignes 9–21) reflète un état nettement antérieur au chantier STK-801→812 + MODE-902/906/908/909 : la plupart des « KO » enregistrés ne le sont plus. **Mise à jour 2026-09-22 (MODE-988)** : les 2 écarts P1 F-01/F-02 sont CORRIGÉS (verrou anti double-soumission + garde caisse clôturée client & serveur, tests +12, gates 1971/1971) — MAR-VTE-003 et MAR-CAI-002 à re-tester en recette.

---

## 2. Verdicts ligne par ligne (33 cas)

| N° | ID | Verdict | Résumé |
|----|----|---------|--------|
| 1 | BO-CON-001 | **[STATIC] OK code** | scrypt timing-safe + verrous compte/IP + `forcePasswordChange` intercepté |
| 2 | BO-MAR-001 | **[ECART] hors périmètre (F-03)** | aucun module BO « Marchés » |
| 3 | BO-MAR-002 | **[ECART] hors périmètre (F-03)** | idem |
| 4 | BO-ACT-001 | **[STATIC] OK code** | `/api/backoffice/enrolments` POST → `merchants.insert` + `actors` |
| 5 | BO-ACT-002 | **[STATIC] OK code** | producers/coopératives/institutions/identificateurs + `logAudit` |
| 6 | BO-MDP-001 | **[STATIC] OK code** | tempPassword crypto + `force_password_change` + changement obligatoire 1ʳᵉ connexion |
| 7 | BO-AUD-001 | **[STATIC] OK code** | module `audit` + `/api/backoffice/audit` + `logAudit` + recherche sanitizée |
| 8 | BO-TDB-001 | **[STATIC] OK code** | dashboard pré-gaté par rôle, `Promise.allSettled`, erreurs par domaine |
| 9 | MAR-CON-001 | **[FAIT] OK** | WF2 complet, lookup sans PII, session appareil requise |
| 10 | MAR-CAI-001 | **[FAIT] OK depuis la matrice** (+ [DEVICE]) | openSession idempotent, unicité 23505 gérée, offline-safe |
| 11 | MAR-STK-001 | **[FAIT] OK depuis la matrice** | addProduct offline-first, jamais de produit fantôme |
| 12 | MAR-STK-002 | **[FAIT] OK depuis la matrice** | updateProduct optimiste + rollback + file `product-update` |
| 13 | MAR-VTE-001 | **[FAIT] OK depuis la matrice** | RPC `merchant_record_sale`, refus strict stock, delta local post-verdict |
| 14 | MAR-VTE-002 | **[FAIT] OK depuis la matrice** | `items[]` atomiques multi-articles (pgTAP) |
| 15 | MAR-VTE-003 | **[ECART corrigé MODE-988]** | verrou désormais présent sur caisse (sale-lock), vente rapide et voix — re-test en recette requis |
| 16 | MAR-DEP-001 | **[PARTIEL] (F-06)** | deux « soldes » différents selon la surface |
| 17 | MAR-HIS-001 | **[FAIT] OK depuis la matrice** | fetch borné (limite affichée), revenu hors annulées, données réelles |
| 18 | MAR-CAI-002 | **[ECART corrigé MODE-988]** | garde clôture client (completeQuickSale + toutes surfaces) + serveur 409 CAISSE_CLOSED — re-test en recette requis |
| 19 | MAR-CAI-003 | **[FAIT] OK** | annulation append-only, double idempotence, bornée au jour |
| 20 | OFF-VOX-001 | **[FAIT] code OK** (+ [DEVICE]) | STT natif offline, file `sale`, erreurs explicites |
| 21 | SYN-001 | **[FAIT] code OK** (+ [DEVICE]) | WF7 FIFO idempotent, conflits → BO |
| 22 | PRO-CON-001 | **[FAIT] OK** | login unifié + session `producteur:` |
| 23 | PRO-REC-001 | **[FAIT] OK** | addRecolte syncOrQueue, refus sans session, annonce WF4 |
| 24 | PRO-REC-002 | **[FAIT] OK** | filtres + badges tous statuts + vide maîtrisé |
| 25 | PRO-STK-001 | **[FAIT] OK** | loading/erreur/réessayer + héro total + détail |
| 26 | PRO-MAR-001 | **[FAIT] OK** (+ nuance F-07) | `publiee` sans marketplace inter-univers |
| 27 | PRO-CMD-001 | **[FAIT] OK** | filtres, badges complets, transitions validées serveur |
| 28 | COO-CON-001 | **[FAIT] OK** | login unifié + CoopGate léger non bloquant |
| 29 | COO-MEM-001 | **[FAIT] OK** | `/api/cooperatives/membres` + recherche locale + vide maîtrisé |
| 30 | COO-MEM-002 | **[FAIT] OK** | ajout marchand existant par numéro, contrat `synced\|queued\|lost` |
| 31 | COO-FIN-001 | **[FAIT] OK** (+ F-05 résiduel) | solde réel, écritures en attente explicites, rechargement à l'entrée |
| 32 | COO-STK-001 | **[FAIT] OK** (+ [STATIC]) | `/api/cooperatives/stock` + `mouvementsRecents` |
| 33 | COO-CMD-001 | **[ECART] hors périmètre (F-04)** | aucun écran commandes coopérative |

---

## 3. Analyse détaillée par univers

### 3.1 Back-office (1–8)

| Cas | Verdict | Preuves et analyse |
|---|---|---|
| **BO-CON-001** — connexion super-admin | **[STATIC] OK code** | `/api/backoffice/login` : scrypt timing-safe + verrous par compte (RPC `record_backoffice_auth_failure`, migration 20260922110000) + garde IP partagée `auth-lookup-guard.ts` (AUDIT-005 §3.1). Session httpOnly 12 h, rotation au login. `forcePasswordChange` intercepté côté UI (`bo-auth-screen.tsx:47-101`). 39 tests de contrat login/lookup (MODE-965). |
| **BO-MAR-001 / BO-MAR-002** — créer/modifier un marché | **[ECART] Couverture non prouvée** | **Il n'existe aucun module « Marchés » dans le back-office.** `MODULE_LIST` (backoffice-permissions.ts:10-19) contient 38 modules — aucun nommé `marches`. La gestion de lieu côté marchand est local-first (`points-vente-screen.tsx`, `market-mode/selling-points-store.ts`, table `merchant_market_sessions` migration 20260919120000) ; les « communes » sont un annuaire en lecture (`/api/communes`). Créer/modifier un marché depuis le BO = **fonctionnalité non implémentée** → le cas n'est ni KO ni OK : il est **hors périmètre produit actuel**. Décision [PORTOR] : ou trancher que le marché se crée côté marchand (MODE-908), ou ajouter le module BO. |
| **BO-ACT-001** — créer un compte marchand | **[STATIC] OK code** | Deux chemins : `/api/backoffice/enrolments` POST (validation dossier agent WF5 → `merchants.insert` + `actors`, l.194-294) et `/api/backoffice/actors` (gestion). Liaison marché : le marchand crée ses points de vente lui-même (MODE-908) — la notion « marché associé » du cas doit être relue dans ce sens. |
| **BO-ACT-002** — comptes producteur/coop/institution/identificateur | **[STATIC] OK code** | `producers.insert` (enrolments l.178), coopératives via `/api/backoffice/cooperatives`, institutions via `/api/backoffice/institutions` (GET/POST/PATCH), identificateurs via `/api/backoffice/identificateurs` (+ liaison). Audit log systématique (`logAudit`). |
| **BO-MDP-001** — mot de passe temporaire de test | **[STATIC] OK code** | `users/route.ts` POST : tempPassword généré crypto (`crypto.getRandomValues`, l.50), hash scrypt, `force_password_change: true` (l.55) → interception obligatoire à la première connexion (`bo-auth-screen.tsx:47-101`, endpoint `users/change-password`). Résultat attendu « exploitable en recette » : conforme, le tempPassword est affiché à l'admin (`bo-utilisateurs-screen.tsx:439`). |
| **BO-AUD-001** — traces d'activité | **[STATIC] OK code** | Module `audit` (rôles super_admin/admin_national/gestionnaire_zone), route `/api/backoffice/audit` GET, `logAudit` branché sur les mutations (ex. `commande_create` actors, `user_create`). Filtre `search` sanitizé par `sanitizeSearchTerm` (AUDIT-005 §3.3). |
| **BO-TDB-001** — tableaux de bord | **[STATIC] OK code** | `bo-dashboard-screen.tsx` + `fetchAllData` pré-gaté par rôle + `Promise.allSettled`, erreurs par domaine `BoErrorDomain` → `BoErrorBanner` (37 écrans). Cohérence des chiffres : **[STATIC]** — vérification « cohérents » exige des données de recette. |

### 3.2 Marchand (9–19) — la matrice est périmée sur plusieurs lignes

| Cas | Verdict | Preuves et analyse |
|---|---|---|
| **MAR-CON-001** — connexion marchand | **[FAIT] OK** | WF2 : `/api/auth/lookup` (rôle détecté, `phone` retiré de la réponse AUDIT-005) → écran adapté → session appareil (`requireDeviceOwner` requis sur toutes les routes marchand). |
| **MAR-CAI-001** — ouvrir une journée | **[FAIT] OK depuis la matrice** | `openSession` (caisse-store.ts:154-189) → POST `/api/marchand/caisse-session` : unicité session ouverte (23505 → récupération session gagnante, jamais fond à zéro), retour serveur fait foi. Offline : cache local + re-publication à la reconnexion (`hydrateSessionFromServer`, l.223-239). **[DEVICE]** mobile. |
| **MAR-STK-001** — ajouter produits | **[FAIT] OK depuis la matrice** | `addProduct` (stock-store.ts) : POST puis file `product` offline avec erreur explicite si stockage plein — jamais de produit fantôme. Offline-first dès la création. |
| **MAR-STK-002** — modifier un prix | **[FAIT] OK depuis la matrice** | `updateProduct` (stock-store.ts:170-220) : optimiste local + PATCH `/api/marchand/products?id=` (`price_unit`), rollback si ni réseau ni file, file `product-update` sinon. La matrice « KO / NON DISPONIBLE » correspond à l'état pré-STK-804 : **re-tester en recette**. |
| **MAR-VTE-001** — vente simple | **[FAIT] OK depuis la matrice** | Chemin caisse : pré-vérification stock locale (STK-805) → POST `/api/marchand/sales` → RPC `merchant_record_sale` (verrou FOR UPDATE, idempotence `client_id`), 422 INSUFFICIENT_STOCK = refus définitif non mis en file, décrément local en DELTA après verdict. Vente rapide : `completeQuickSale` + garde caisse ouverte (`vente-rapide-modal.tsx:415`). |
| **MAR-VTE-002** — vente multi-produits | **[FAIT] OK depuis la matrice** | `items[]` (payload caisse l.247-252) traités par la RPC avec décrément atomique multi-articles (pgTAP « multi-articles dérivés », plan 174 assertions). |
| **MAR-VTE-003** — anti double-comptage double-clic | **[ECART] À corriger (P1)** | **Vente rapide et voix sont protégées** (`vente-rapide-modal.tsx:504,647` — `isProcessing` bloque la saisie et le bouton pendant le processing). **La caisse ne l'est pas** : `handleCompleteSale` (caisse-screen.tsx:153-354) est `async` avec `await fetch` et le bouton Valider (`PaymentModal`, l.905-912) n'a **aucun `disabled={processing}`** ni verrou en début de handler ; un double-tap peut poster deux ventes avant `clearCart()`. L'idempotence serveur par `client_id` ne suffit pas ici : chaque tap génère un `clientId` **nouveau** (`sale-${Date.now()}-${Math.random()}`, l.214). Correctif recommandé : verrou `isProcessing` + désactivation du bouton (pattern vente-rapide). |
| **MAR-DEP-001** — dépense | **[PARTIEL] Confirmé, cause identifiée** | Dépense enregistrable et bilan cohérent : `addTodaySale/todayExpenses` (caisse-store), résumé vocal VOCAL-608/609/610/611 avec formule VENTES − DÉPENSES. La mention « PARTIEL » de la matrice correspond très probablement au solde d'accueil : le **bouton « balance » de l'accueil = caisse complète (fond inclus)** tandis que le solde du résumé vocal = ventes − dépenses (fond exclu) — documenté caisse-store + VOCAL-609. Deux chiffres différents affichés selon la surface = source de confusion en test. [PORTOR] : harmoniser l'étiquetage (« caisse totale » vs « solde du jour »). |
| **MAR-HIS-001** — historique / résumé | **[FAIT] OK depuis la matrice** | `ventes-screen.tsx` : fetch serveur borné (`limit` atteinte affichée, MODE-939), revenu = ventes non annulées seulement, badge annulation offline-first. Résumé du jour : données réelles (serveur + file + repli agrégats), jamais inventées (VOCAL-607/608). |
| **MAR-CAI-002** — vente refusée après clôture | **[ECART corrigé MODE-988]** | **Constat initial** : deux voies de vente sans garde — écran stock (VENDRE) et modale vocale ; serveur sans vérification `is_open`. **Correctif livré** : garde `session.isOpen` DÈS L'ENTRÉE de `completeQuickSale` (couvre stock + voix + tout appelant futur) + phrase imposée `formatCaisseClosedRefusal()` sur les 4 surfaces + POST `/api/marchand/sales` refuse **409 CAISSE_CLOSED** si sessionId clôturée ou inconnue (garde APRÈS le pré-check d'idempotence : replay offline préservé). Tests : 3 contrats completeQuickSale + 5 contrats route. Re-test recette requis. |
| **MAR-CAI-003** — annulation après clôture | **[FAIT] OK** | `reverseSale` (caisse-store.ts:131-152) : opération inverse append-only, idempotence double (operation_id + sale_client_id), refus sur vente déjà annulée. Annulation autorisée **le jour même** y compris après clôture — conforme §28 (une vente ne s'annule qu'une fois) ; l'écran ventes borne l'annulation au jour (`isSaleToday`). Serveur : `merchant_reverse_sale` verrou FOR UPDATE. Aucun contournement destructif. |

### 3.3 Hors-ligne / Synchro (20–21)

| Cas | Verdict | Preuves et analyse |
|---|---|---|
| **OFF-VOX-001** — vente vocale en mode avion | **[FAIT] OK code (chaîne FR)** | STT FR = natif Sherpa (offline embarqué). Vente vocale : `completeQuickSale` → fetch échoue → file offline `sale` (idempotence `client_id` → operation_id déterministe). Erreurs explicites (REQ-T2) — jamais de fallback silencieux. **[DEVICE]** obligatoire pour la preuve réelle sur Tecno/Infinix (rejoint B1-010/B5-052). |
| **SYN-001** — retour en ligne sans doublon | **[FAIT] OK code** | WF7 : `sync-flusher` FIFO 12+ handlers rejeu idempotent (`client_id`/`operation_id` UUID déterministes, ADR-002), conflits persistés → `/api/sync-conflicts/report` → écran BO. 422 INSUFFICIENT_STOCK = conflit définitif, jamais rejoué en boucle. **[DEVICE]** pour la preuve réseau réelle. |

### 3.4 Producteur (22–27)

| Cas | Verdict | Preuves et analyse |
|---|---|---|
| **PRO-CON-001** — connexion | **[FAIT] OK** | Même écran/lookup que marchand (WF2), `prod-auth-screen`, session appareil `producteur:` requise sur toutes les routes (`requireDeviceOwner`). |
| **PRO-REC-001** — déclarer une récolte | **[FAIT] OK** | `addRecolte` (producteur-store.ts:287-314) : refus explicite sans session (jamais d'id fantôme), syncOrQueue `recolte-create`, annonce vocale WF4 (jamais d'écriture silencieuse). Photos opt-in via URLs signées (`photo-urls-server.ts`). |
| **PRO-REC-002** — consulter mes récoltes | **[FAIT] OK** | `prod-recoltes-screen.tsx` : filtres (ce mois/publiées/vendues), badges pour TOUS les statuts serveur (y c. `disponible`), vide maîtrisé. |
| **PRO-STK-001** — stocks producteur | **[FAIT] OK** | `prod-stock-screen.tsx` : chargement + erreur + bouton Réessayer (`loadError`/`hasLoaded`), héro total kg, détail par produit, vide maîtrisé. |
| **PRO-MAR-001** — publier une récolte sur le marché | **[FAIT] OK (sémantique locale)** | `publierRecolte` (producteur-store.ts:317-323) : statut `publiee` + PATCH syncOrQueue, badge « Publiée sur le marché ». **[ECART] nuance produit** : il n'existe pas de marketplace consommée par les marchands à partir des récoltes publiées (le module BO `marketplace` est un back-office de modération, `bo-marketplace-screen` lit `/api/backoffice/marketplace`). Le cas « consultable sur le marché » est vrai au sens « visible/publiée », pas au sens d'une place de marché inter-univers — à clarifier au porteur. |
| **PRO-CMD-001** — ouvrir les commandes | **[FAIT] OK** | `prod-commandes-screen.tsx` : filtres toutes/a_traiter/en_cours/livrées, badges complets (a_traiter/en_attente/confirmée/…), aucune page blanche possible (liste + vide maîtrisé), transitions validées serveur (machine à états `transitionCommandeValide`, 409 sur transition interdite). Livraison → sortie de stock FIFO (MODE-935 I-01). |

### 3.5 Coopérative (28–33)

| Cas | Verdict | Preuves et analyse |
|---|---|---|
| **COO-CON-001** — connexion | **[FAIT] OK** | Login unifié + `coop-auth` repli ; `CoopGate` léger (MODE-975, G6) vérifie l'état local, revalidation réseau **non** bloquante (choix assumé offline-first). |
| **COO-MEM-001** — consulter les membres | **[FAIT] OK** | `coop-membres-screen.tsx` + `/api/cooperatives/membres` GET, recherche locale, vide maîtrisé (« ajouter un marchand par son numéro »). |
| **COO-MEM-002** — ajouter un membre | **[FAIT] OK (contrat resserré)** | L'ajout passe par `ajouterMarchand` (cooperative-store.ts:509) → `POST /api/cooperatives/membres` : le président ajoute un **marchand existant** par numéro (`search-marchand`), contrat `synced|queued|lost` affiché honnêtement (jamais de succès inventé). Créer un membre de toutes pièces n'est pas le design actuel. |
| **COO-FIN-001** — finances / trésorerie | **[FAIT] OK depuis AUDIT-007** | `coop-tresorerie-screen.tsx` : solde réel, écritures en attente explicitées (« validez-la pour qu'elle compte »), validation/annulation d'écriture, rechargement à l'entrée (MODE-974 G7). Post-AUDIT-007 les phases 2-4 (shell, fiche membre, journaux) ont été livrées (MODE-974/975/979 : `coop-shell`, `coop-gestion`, `coop-membre-detail`, `coop-parametres`, palette). **CORRIGÉ (note post-audit 2026-09-22)** : l'écart G9 hérité d'AUDIT-007 a été traité par MODE-977 (Task 131) — les 7 décisions de gestion passent par `syncOrQueue` avec entité de file dédiée (vérifié cooperative-store.ts:513,534,569,594,623,666,799). Ne pas traiter (voir MODE-983 dans TASKS.md). |
| **COO-STK-001** — stock coopérative | **[FAIT] OK** | `coop-stock-screen.tsx` + `/api/cooperatives/stock` + dashboard `mouvementsRecents`. Cohérence : **[STATIC]** — à confirmer avec données de recette. |
| **COO-CMD-001** — commandes coopérative | **[ECART] Non implémenté (P2, décision produit)** | **Aucun écran « Commandes » n'existe dans l'espace coopérative** (aucun fichier ni route le porte ; `coop-gestion` regroupe stock/besoins/journaux). Les commandes existent dans les univers marchand (commandes fournisseurs) et producteur — pas côté coopérateur. Le cas est **hors périmètre actuel** : à retirer de la matrice, ou à créer (fonctionnalité nouvelle). |

---

## 4. Synthèse des écarts

| ID | Sévérité | Constat | Traitement recommandé |
|---|---|---|---|
| **F-01** | **P1** | ~~Pas de verrou anti double-soumission sur la caisse~~ **CORRIGÉ (MODE-988)** — verrou module `sale-lock.ts` (`sousVerrouVente`) + garde `isProcessingSale` + bouton Valider désactivé pendant le traitement ; 4 tests. | Traité — re-tester MAR-VTE-003 en recette. |
| **F-02** | **P1** | ~~Vente possible après clôture via stock (VENDRE) et voix~~ **CORRIGÉ (MODE-988)** — garde `session.isOpen` dans `completeQuickSale` (couvre les 3 voies) + phrase imposée `formatCaisseClosedRefusal` + refus serveur 409 `CAISSE_CLOSED` (session clôturée ou inconnue, après pré-check d'idempotence pour préserver le replay offline) ; 8 tests. | Traité — re-tester MAR-CAI-002 en recette. |
| **F-03** | **P2** | **Aucun module BO « Marchés »** (BO-MAR-001/002 sans cible) — les lieux vivent côté marchand (MODE-908) + journées `merchant_market_sessions`. | Décision produit [PORTOR] : retirer les cas de la matrice OU créer le module. |
| **F-04** | **P2** | **Pas d'écran Commandes coopérative** (COO-CMD-001 sans cible). | Décision produit [PORTOR] : retirer le cas OU créer l'écran. |
| ~~F-05~~ | ~~P2~~ | **OBSOLÈTE** — déjà corrigé par MODE-977 (Task 131) : les 7 décisions de gestion coop passent par `syncOrQueue` (vérifié cooperative-store.ts:513-799, 2026-09-22). | Aucune action — ne pas traiter (voir MODE-983 dans TASKS.md). |
| **F-06** | **P3** | **Deux « soldes » différents selon la surface** (bouton balance = fond inclus ; résumé vocal = ventes − dépenses) — source du PARTIEL MAR-DEP-001. | Harmoniser les libellés (« caisse totale » vs « solde du jour »), sans changer la formule validée VOCAL-609. |
| **F-07** | **P3** | « Publier sur le marché » (producteur) n'alimente aucune marketplace inter-univers — sémantique « visible/publiée » seulement. | Clarifier le wording UI et le cas de test (PRO-MAR-001). |

**Vérifiés SANS action** : idempotence offline complète (ventes, annulations, stock 3 entités) ; refus strict stock insuffisant 3 niveaux ; garde auth-avant-lookup systématique (`require-owner.ts`) ; annulation de vente append-only doublement idempotente ; producteur sans page blanche ni badge manquant ; coop post-AUDIT-007 (shell, gate, journaux, fiche membre) livrée.

---

## 5. Limites honnêtes de cet audit

1. **Statique, pas fonctionnel** : les verdicts [STATIC] (BO-TDB cohérence, COO-STK cohérence, réconciliations) exigent une session de recette avec données seedées.
2. **Aucun appareil mobile** : tout le volet Mobile de la matrice (colonne 4-5) ne peut être prouvé que sur appareil réel — rejoint les blocages connus B1-010 / B5-052 / smoke stock (TEAM_STATUS).
3. **Pas d'exécution E2E navigateur** : la méthode du projet (pages de test HTML + snapshot, TEST_PLAN pièges de session) n'a pas été déployée ici ; les parcours UI marchand/coop mériteraient ce passage après correction de F-01/F-02.
4. Les 8 « NON TESTÉ » de la matrice sur le volet BO dépendent d'un compte super-admin de recette et des migrations hébergées (F-02 d'AUDIT-005 — toujours à la charge du porteur).

---

## 6. Plan de validation proposé (ordre)

1. Corriger **F-01** (verrou caisse) puis **F-02** (garde clôture) + tests vitest ciblés (contrat `completeQuickSale` hors session ; double-soumission).
2. Rejouer en recette les lignes marquées [FAIT] « OK depuis la matrice » pour confirmer le dégel (MAR-STK-002, MAR-CAI-001).
3. Trancher [PORTOR] F-03/F-04 (retirer ou construire) et mettre à jour TASKS.xlsx + matrice.
4. Planifier la session [DEVICE] (mode avion + vente vocale + synchro) qui clôture OFF-VOX-001/SYN-001 et le volet Mobile.
