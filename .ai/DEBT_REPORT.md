# DEBT_REPORT.md — Dette technique (AUDIT-001, 2026-09-19)

*Établi par AGENT AUDIT GLOBAL à HEAD `0f71025`. Chaque item : preuve, classification, effort (S/M/L/XL), priorité, impact si non corrigé.*

## CRITIQUE — aucune

## MAJEUR

| ID | Item | Preuve | Effort | Priorité | Impact si non corrigé |
|---|---|---|---|---|---|
| DET-001 | **12 fichiers > 500 l.** hors types générés : auth-screen 2177, ident-identification-screen 1710, backoffice-store 1605, profile-screen 1588, secondary-screens 1256, bo-academie 1145, bo-acteurs 1006, ident-profil 986, bo-auth 922, bo-enrolement 915, bo-missions 914, localIntent 905 | `wc -l` AUDIT-001 §2 | M/L par fichier | P3 | Difficulté de revue, risque de régression à chaque retouche, duplication entretenue |
| DET-002 | **`native-tts.ts` sans test dédié** — seul module voice non testé directement (mocké dans tata-tts.test.ts:48, stt-routing.test.ts:30) | AUDIT-001 §7 COH-008 | S | P3 | Le pont natif TTS peut casser sans garde (cf. AUDIT_VOCAL_VENTE_RAPIDE.md) |
| DET-003 | **BUG-002** : intent vocal `restock` = PATCH absolu (dérive balance ↔ stock_qty, pas de mouvement PURCHASE) — traité comme BUG, rappelé ici comme dette de conception | voice-modal.tsx:245, stock-store.ts:200 | M | **P2** | Divergence des vérités stock à chaque réappro vocal |

## MINEUR

| ID | Item | Preuve | Effort | Priorité | Impact |
|---|---|---|---|---|---|
| DET-004 | ~21 `: any` ciblés dans 8 fichiers API (keiwa BO ×5, tontines ×4, ventes BO ×4, sales ×3, marketplace ×2, document-ocr, admin.ts, products) | `rg -c ": any"` AUDIT-001 | S | P4 | Typage affaibli localement, erreurs runtime possibles |
| DET-005 | Code mort répertorié : `supabase/browser.ts`, `ident-top-bar.tsx`, `db/custom.db`, `examples/websocket`, dep `z-ai-web-dev-sdk`, `/api/v1/*` non câblée au front. **Task 90 : import mort `PROD_COLOR` (prod-stock-screen) et doublon `MARCHAND_COLOR` (home-screen) CORRIGÉS.** Classes `dark:` désormais orphelines dans marchand/producteur depuis le retrait du réglage sombre (DET-UI-015) | ARCHITECTURE.md §6.5 | S | P4 | Bruit de lecture, surface d'audit gonflée |
| DET-UI-015 | **Conversion mode sombre (UI-MP-015, Task 90)** : le réglage « sombre » a été RETIRÉ de l'UI (profile-screen) et la classe `dark` n'est plus appliquée (page.tsx) tant que la surface marchand/producteur n'est pas convertie aux jetons sémantiques (`bg-card`, `text-foreground`… sur ~13 fichiers). Le champ `darkMode` reste dans le store (persistance) | audit UI Task 90 | M/L | P3 | Le thème sombre est une feature future ; le mode Soleil couvre la lisibilité terrain |
| DET-006 | Squelettes d'écrans dupliqués assumés : voice-modal (516) vs prod-voice-modal (389), auth-screen (2177) vs prod-auth-screen (560) | ARCHITECTURE.md §6.2/6.3 | L | P4 | Double maintenance à chaque évolution auth/vocal |
| DET-007 | Doublon `'ident-dossier-detail'` dans `ScreenRoute` (app-store.ts:48,51) — union TS masquée par le type | ARCHITECTURE.md §3 | S | P4 | Confusion route, risque de régression navigation |
| DET-008 | `admin.ts` typé `any` volontairement (l.4,30) + absence de garde `server-only` | AUDIT sécurité OBS-4 | S | P3 | Import client possible par erreur (convention seule) |

## Dettes de tests / doc / deps

- **Tests** : aucun module stock non couvert (5/5 modules, 7 fichiers) ; voice 19/22 modules avec test homonyme ; 0 `.skip/.only/.todo` sur toute la suite
- **Doc** : fonctions publiques de stock/voice non JSDocisées en masse — compensé par les registres `.ai/` et les docs spécialisés ; à renforcer à l'occasion (P4)
- **Deps** : rien de critique détecté à ce jour (verrou bun.lock, `--frozen-lockfile` en CI désormais) ; scan CVE à mettre en place avec l'audit perf (P4)

## Priorisation recommandée

1. DET-003 (= BUG-002) — seul item à effet métier direct
2. DET-002 + DET-008 (garde-fous sécurité/voix, petits efforts)
3. DET-001 par tranches UX (auth-screen d'abord) — opportuniste, une tranche par Task
4. DET-004..008 — nettoyage opportuniste lors des retouches

## COOPÉRATIVE — dette documentée MODE-922 (audit vs inventaire julaba-app)

| ID | Item | Preuve | Effort | Priorité | Impact si non corrigé |
|---|---|---|---|---|---|
| DET-COOP-001 | **Session appareil liée sans preuve de secret** : `/api/session/claim` accepte `subjectType: 'cooperateur'` (et identificateur) avec `requireExisting=false, allowTakeover=true`, et `/api/auth/lookup` expose l'id de tout rôle par numéro de téléphone → connaître un numéro suffit à forger une session (le PIN n'est pas vérifié sur cette voie). Le contrat device-session est un choix documenté (« same trust level ») qui vaut AUSSI pour les autres rôles (claim `requireExisting` sans preuve non plus). Fix de fond proposé : token de claim à usage unique émis par les routes de login, consommé par /session/claim | src/app/api/session/claim/route.ts l.42-46 ; src/app/api/auth/lookup/route.ts l.36-105 | M | **P1** | Prise de contrôle de session coopérateur (ou autre rôle) par simple connaissance d'un numéro — inacceptable pour la trésorerie coopérative |
| DET-COOP-002 | **Marché coopératif hors périmètre v1** (parité MarcheHub julaba-app : publications coopératives, cascade de visibilité grossiste→demi-grossiste via publications.type_marche, commandes coop, négociation, clôture de paiement « attestation espèces », Academy, Keiwa du rôle coop) — julaba n'a ni type_marche ni cascade ni commandes coop ; la spec julaba-app elle-même garde les commandes groupées neutralisées côté API (§9 inventaire). Chantier dédié MODE-923 | FONCTIONNALITES_COOPERATIVE.md §4.1/§9 ; .ai/TASKS.md MODE-923 | XL | P2 | L'écart fonctionnel le plus visible avec julaba-app reste le marché coopératif |
| DET-COOP-003 | **Trésorerie déclarative sans lien wallet** (identique aux deux repos) : cotisation et clôtures enregistrées sans mouvement Keiwa/Bpay | FONCTIONNALITES_COOPERATIVE.md §9.6 ; /cotisation | L | P3 | Écart livre/compte possible tant qu'aucun lien wallet n'existe |
| DET-COOP-004 | Idempotence RPC via `note LIKE 'client:…'` (colonne note détournée, sans index dédié) — julaba-app utilise une colonne `operation_id` propre | supabase/migrations/20260920100100 l.53,130 | S | P4 | Perf dégradée sur volumes élevés, sémantique implicite |
| DET-COOP-005 | `agregation.ts` : `nbMembres` compte les besoins et non les marchands distincts (docstring écartée) | src/lib/cooperatives/agregation.ts l.71 | S | P4 | Libellé « besoin(s) » honnête côté écran ; à corriger si le libellé affiche « membre(s) » |

## COOPÉRATIVE + PRODUCTEUR — dette documentée MODE-931 (audits 97-C1/C2/B1, Task 98)

Écarts identifiés par les audits de complétude (backend/frontend coopérative + producteur) et NON traités en Task 98 — hors MODE-923 (marché coopératif) et DET-COOP-001..005 déjà enregistrées.

| ID | Item | Preuve | Effort | Priorité | Impact si non corrigé |
|---|---|---|---|---|---|
| DET-COOP-006 (TRAITÉ Task 99 / MODE-932) | ~~scoreJulaba absent du module coopérative~~ Score JULABA livré : module pur + service source unique + /api/scores/me + membres enrichis + ScoreRing + filtre performance (chchantier transverse « score acteur ») : GET /api/cooperatives/membres ne renvoie pas de score, pas de ScoreRing ni de seuils 71/41, pas de filtre performance — julaba n'a AUCUN module de score acteur (bo-scores = credit scores legacy) | src/lib/scores/ ; src/app/api/scores/me/route.ts | — | ~~P1~~ | Fermé — voir MODE-932 (Task 99) |
| DET-COOP-007 | Enrôlement → adhésion coopérative automatique absent : submit_enrolment ignore estMembreCooperative/cooperativeId (julaba-app §7 identifications.controller l.395-418) | src/app/api/v1/enrolments/route.ts l.10-30 | M | P2 | L'adhésion via identification reste manuelle |
| DET-COOP-008 | commune coopérative en TEXTE LIBRE (pas commune_id + GPS 41 communes) et récoltes producteur non triables Haversine depuis la coop (julaba-app §2.2/§4.3) | supabase/migrations/20260920100000 l.48 ; src/app/api/producteur/recoltes/route.ts | M | P2 | Pas de proximité géographique réelle (RecettesPrevues Haversine) |
| DET-COOP-009 | Pas de harnais HTTP des invariants applicatifs §8 (notifications post-commit, 403 sans coop, sanisation membres, 409 doublon) — pgTAP couvre le SQL, vitest les libs ; aucun test n'exerce les ROUTES | supabase/tests/cooperative.sql (périmètre SQL) | M | P2 | Les invariants API ne sont pas prouvés par test (seuls les libs/SQL le sont) |
| DET-COOP-010 | Aucune stat coopérative au backoffice (total_cooperatives §6) ; GET /api/cooperatives/[id] absente (couverte fonctionnellement par GET / + ma-cooperative) | src/app/api/backoffice (aucun match cooperativ) | S | P3 | Le backoffice ne voit pas le foisonnement du module |
| DET-COOP-011 | Enrichissements membres/accueil/trésorerie/stock (julaba-app §4) : filtres région/commune + pagination 20/page + drawer 3 onglets, KPI « Volume groupé » + 6 modals accueil + voix « La coopérative X compte N membres actifs », filtres période 7j/30j/3 mois + catégorie cotisation du modal trésorerie, compteur/recherche/filtre catégorie stock, action « Notifier un membre » (bouton + route), date d'adhésion non affichée côté marchand, profil coop minimal | audit 97-C2 (P1#2 + P2#4..7,9,10) | M cumulés | P2/P3 | Écarts d'expérience vs julaba-app, sans blocage métier |
| DET-PROD-001 | « Ma réputation » producteur sans source (note/avis jamais alimentés — aucune table/API avis) : affiché honnêtement « Pas encore évalué » ; API réputation à créer ou carte à masquer selon décision produit | src/components/producteur/prod-profil-screen.tsx l.41,116-241 ; producteur-store l.209-217 | M | P2 | Carte figée tant que le chantier avis n'existe pas |
| DET-PROD-002 | Purge des lignes PRODUCTEUR de supabase/seed.sql (comptes/récoltes/commandes/journal/cycle fictifs, seed l.38-40,384-400) — les affordances d'écran sont déjà retirées (prod-auth) ; la purge SQL attend la vérification des tests pgTAP qui s'y réfèrent | supabase/seed.sql ; supabase/tests/*.sql | S | P2 | Le seed ne doit JAMAIS toucher la prod (tables vides confirmées en remote) — dette d'hygiène |
| DET-PROD-003 | PRIX_MARCHE_REFERENCE reste un constant local (étiqueté « prix indicatifs » à l'écran depuis Task 98) — la source serveur (cotations réelles) est un chantier séparé | producteur-store l.404-409 | M | P3 | Prix non live, mais étiquetés honnêtement |

## AUDIT-003 — Anomalies des cinq espaces (2026-09-21, MODE-933/934)

Registre unifié S-xx (sécurité) / I-xx (intégrité) / F-xx (fonctionnel) / PF-xx (performance) du rapport `AUDITS/AUDIT-003-2026-09-21-espaces.md` — preuves fichier:ligne dans le rapport.

| ID | Résumé | Sév. | Statut |
|---|---|---|---|
| S-01 | Régression SEC-813 : 3 RPC SECURITY DEFINER sans revoke anon/authenticated | P0 | **TRAITÉ MODE-934** (20260921100000 + tests/acl.sql) |
| S-02 | MFA back-office sans canal de livraison (connexion impossible en prod) | P0 | **TRAITÉ MODE-934** (TOTP RFC-6238, 20260921110000) |
| S-03 | PIN hashé djb2 32 bits stocké tel quel, sans lockout (×3 royaumes) | P0 | OUVERT — Sprint B (P1-7, bcrypt/argon2 + lockout) |
| S-04 | Lookup identificateur pré-auth expose l'id (aggrave DET-COOP-001) | P1 | OUVERT — Sprint B (P1-8, jeton de claim one-shot) |
| S-05 | GET /api/merchant + GET /api/producteur sans garde (énumération, morts) | P1 | **TRAITÉ MODE-934** (supprimés, consommateur migré) |
| S-06 | pgTAP stock cassé (`legacy_merchants`) + pgTAP hors CI | P1 | **TRAITÉ MODE-934** (corrigé + job CI pgtap) |
| S-07 | GRANT authenticated trompeur sur RPC coop (deny-all ⇒ 42501) | P2 | OUVERT — Sprint C (P2-11) |
| S-08 | Frontières de zone absentes (identificateurs/objectifs/missions) | P2 | OUVERT — Sprint C (P2-5) |
| S-09 | RBAC alertes incohérent (403 après bouton « Acquitter ») | P2 | OUVERT — Sprint C (P2-5) |
| S-10 | force_password_change jamais appliqué, pas de changement de mot de passe BO | P2 | OUVERT — Sprint C (P2-5) |
| S-11 | Cookie device TTL 365 j sans révocation applicative | P2 | OUVERT (à planifier) |
| S-12 | Rate-limit IP en mémoire (multi-instances) | P3 | OUVERT |
| S-13 | 404-avant-403 sur PATCH producteur (sonde d'ids) | P3 | **TRAITÉ MODE-935** (requireDeviceSubjectType : session+royaume vérifiés AVANT lookup sur PATCH récoltes/commandes/cycles) |
| I-01 | Stock producteur à zéro (statuts disponible/vendue sans writer applicatif) | P1 | **TRAITÉ MODE-935** (ADR : mise en stock explicite brouillon|publiee → disponible + sortie FIFO 'vendue' à la livraison, module pur livraison-stock.ts, bouton écran + CHECK SQL) |
| I-02 | cycle-create en file sans handler de rejeu (perte offline) | P1 | **TRAITÉ MODE-935** (handler verbatim + tests rejeu/conflit 409) |
| I-03 | Cycles inclosables (PATCH manquant, multi en_cours possibles) | P1 | **TRAITÉ MODE-935** (PATCH cycles clôture + garde 409 un-seul-en-cours + écran « Terminer le cycle » + handler cycle-update) |
| I-04 | Double solde trésorerie coop (limit 100 vs total) | P1 | **TRAITÉ MODE-935** (module partagé agregerTresorerieValidee sur TOUTES les validées ; view SQL écartée — GRANT par défaut = classe SEC-813) |
| I-05 | Mélange d'unités pot commun (clé sans unité) | P1 | **TRAITÉ MODE-935** (RPC : UNITE_DIFFERENTE refusé à l'apport ET à la distribution + unité verrouillée à l'écran d'apport + 409 lisible) |
| I-06 | Distribution→besoin non atomique | P2 | OUVERT — Sprint C (P2-10) |
| I-07 | TOCTOU idempotence coop (note like, pas de UNIQUE) | P2 | **TRAITÉ MODE-935** (test d'idempotence déplacé APRÈS le verrou FOR UPDATE dans les 2 RPC — rejeus concurrents séquentialisés ; ferme l'essentiel du constat) |
| I-08 | Rejeu offline trésorerie/besoins non idempotent | P2 | **TRAITÉ MODE-935** (client_id + UNIQUE partiel sur transactions/besoins, routes reconnaissent le rejeu 200, cotisation incluse) |
| I-09 | actor_id aléatoire → collisions sur UNIQUE (~120 attendues à 10k) | P2 | OUVERT — Sprint C (P2-6) |
| I-10 | POST journal : cycle_id sans vérification d'appartenance | P2 | **TRAITÉ MODE-935** (le cycle doit exister ET appartenir au producteur authentifié, 404 sinon) |
| I-11 | Cotisation 25 000 non contrainte serveur + idempotence cross-coop | P2 | **TRAITÉ MODE-935** (COTISATION_ANNUELLE_FCFA partagée imposée serveur, test annuel filtré par coopérative, index membre_id) |
| I-12 | Statuts PATCH récoltes/commandes non validés (API + SQL) | P3 | **TRAITÉ MODE-935** (machine à états pure + CHECK SQL + transitions validées avec idempotence de rejeu) |
| I-13 | Échecs partiels avalés au chargement président coop | P3 | OUVERT |
| F-08 | 4 écrans marchand sans accès tactile (tontines/keiwa/fidélité/protection) | P2 | OUVERT — Sprint C (P2-1) |
| F-09 | Fidélité morte (score jamais écrit, récompenses MOCK) | P2 | OUVERT — décision produit |
| F-10 | sessionId jamais passé à POST sales (clôture non réconciliable) | P2 | OUVERT — Sprint C (P2-2) |
| F-11 | 6 endpoints marchand morts (crédits serveur jamais relus) | P2 | OUVERT — Sprint C (P2-3) |
| F-12 | Éviction silencieuse de la file offline au-delà de 500 | P2 | OUVERT — Sprint C (P2-4) |
| F-13 | Course inscription coopérative → 500 générique | P2 | OUVERT |
| F-14 | Score président jamais affiché + 3 zones mortes API coop | P3 | OUVERT — Sprint D (D-2) |
| F-15 | Regex téléphone morte coop-auth | P3 | OUVERT |
| F-16 | Brouillons ident volatils + UI factice (mission/cible hard-codées) | P3 | OUVERT — Sprint C (P2-9) |
| F-17 | Comptes marchands/producteurs utilisables AVANT validation BO | P2 | OUVERT — décision produit requise |
| F-18 | Roster ident auto-provisionné + préfixe acteur erroné coopératif | P3 | OUVERT — Sprint C (P2-6) |
| F-19 | Dossiers ident : échec réseau = lost sans file | P2 | OUVERT — Sprint C (P2-9) |
| F-20 | fetchAllData 10 fetches + scan JID O(n) | P3 | OUVERT |
| F-21 | Marché sans acheteur (récoltes publiee sans consommateur) | P2 | OUVERT — convergent DET-COOP-002 |
| F-22 | Littératie non déployée sur les écrans à formulaire producteur | P3 | OUVERT (opportunité) |
| F-23 | Incohérence genre market-mode + totalAmount ignoré serveur | P3 | OUVERT |
| PF-01..03 | Index manquants (devices, sync_conflicts, legacy_sales+created_at, sale_items, besoin_id, membre_id) | P2 | OUVERT — Sprint C (P2-7) |
| PF-04 | Photos C-récoltes en DataURL base64 (upload signé disponible) | P2 | OUVERT — Sprint C (P2-8) |
| PF-05 | 5 requêtes coop pour 1 onglet + agrégation limitée à 200 | P3 | OUVERT |
