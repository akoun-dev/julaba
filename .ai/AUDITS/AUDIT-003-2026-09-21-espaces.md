# AUDIT GLOBAL #003 — 2026-09-21 — Les cinq espaces (marchand · coopérative · producteur · back-office · identificateur)

- **Auditeur** : AGENT AUDIT GLOBAL (sous l'orchestrateur, Task 100 / MODE-933)
- **Déclenchement** : demande directe du porteur du projet — « Réalise un audit complet des espaces marchand, coopérative, producteur, back-office et identificateur » (relations, flux, rapports partagés, schéma Supabase, incohérences, sécurité, performance)
- **Périmètre** : HEAD `5b8b2c4` (origin/main) — 5 espaces fonctionnels (écrans, stores, routes API), Supabase complet (149 migrations, 111 tables, RLS, RPC, pgTAP, types générés), file offline, notifications
- **Méthode** : 5 sous-audits spécialisés en parallèle (marchand / coopérative / producteur / back-office+identificateur / schéma Supabase) puis **contre-vérification ligne à ligne des constats critiques par l'auditeur principal** ; lecture seule sur le code applicatif (protocole `HANDOFF/TEAM_TO_AUDIT.md`)
- **Baseline revalidée ce jour** : vitest **1318/1318** (88 fichiers) · `tsc --noEmit` 0 · `eslint .` 0

**Clés de lecture** : chaque constat est étiqueté **[FAIT]** (vérifié dans le code/SQL, fichier:ligne cité) ou **[HYPOTHÈSE]** (plausible, à instrumenter) ; les remèdes sont des **[PROPOSITION]**. Chaque anomalie est **NOUVEAU** (non répertoriée) ou **CONNU** (déjà au registre `DEBT_REPORT.md` / `BUGS.md` — rappelé ici pour la vue d'ensemble).

---

## 1. VUE D'ENSEMBLE DE L'ARCHITECTURE

### 1.1 Le contrat architectural observé

```
Écrans React (client) ──▶ Zustand stores ──▶ fetch /api/* (cookie julaba_device | bo_session)
                                        └─▶ File offline FIFO (offline-db, cap 500) ──▶ sync-handlers (28) ──▶ rejeu idempotent
Routes API Next ──▶ garde (requireDeviceOwner | requireBackofficePermission | requirePresident)
              └─▶ client SUPABASE SERVICE_ROLE (admin.ts) ──▶ PostgreSQL 17
                          │ tables legacy/merchant_/cooperatives : RLS actif, 0 policy → deny-all, service_role seul
                          └─▶ RPC SECURITY DEFINER (merchant_* ×10) ou INVOKER (coop_*, modern /api/v1)
```

**[FAIT]** La règle « CRUD centralisé » (README .ai §règle 3) est respectée : aucune table n'est lue/écrite par le client Supabase navigateur ; 103 fichiers de routes passent par le client admin. Le tier « moderne » `/api/v1/*` est le seul à utiliser Supabase Auth + RLS invoker — et il est **sans consommateur front** (monde parallèle, cf. §5).

### 1.2 Les cinq espaces (inventaire mesuré)

| Espace | Écrans | Store | API dédiée | Persistance locale | Entrée |
|---|---|---|---|---|---|
| **Marchand** | 28 fichiers / 15 084 l. — 19 écrans navigables + 4 modales globales (`caisse` 932 l., `voice-modal` 1 234 l., `auth-screen` 2 182 l.) | `caisse-store` (399), `stock-store` (273, `partialize {}`), `credits-store`, `selling-points-store`, `market-mode-store` | 47 endpoints (43 `/api/marchand/**` + 3 `/api/merchant*` + `/api/scores/me`) | session caisse + journal du jour ; crédits/points 100 % local ; stock = vérité serveur | PIN/pattern/visuel/biométrie, `/api/auth/lookup` unifié |
| **Coopérative** | 9 fichiers / 3 083 l. — 7 écrans président + 1 marchand (`marchand-coop-screen` 623 l.) + barre | `cooperative-store` (633, persist sélectif) | 25 handlers `/api/cooperatives/**` + `/api/scores/me` | données purgeables, erreurs non persistées ; file : 5 entités | lookup unifié (rôle `cooperateur`) ou inscription auto-provisioning |
| **Producteur** | 10 fichiers — auth 552 l., wizard récoltes 422 l., cycles 309 l., Tata dédié 417 l. | `producteur-store` (576, **`partialize {}`** assumé) | 7 routes `/api/producteur/**` (+1 lecture backoffice) | rien hors file offline (`recolte-create/update`, `commande-update`, `journal`, `cycle-create`) | lookup unifié ; création de compte réservée aux identificateurs |
| **Back-office** | 45 fichiers — 35 modules RBAC (`MODULE_LIST`), dashboard 849 l., acteurs 1 006 l. | `backoffice-store` (1 605, persist = UI seule) | 40 fichiers route = **73 opérations HTTP**, 68/73 gardées `bo_session` (TTL 12 h) | UI seule ; session re-dérivée serveur au rehydrate | email + mot de passe + OTP (TTL 5 min) ; lockout IP |
| **Identificateur** | 9 fichiers / 8 écrans — wizard 5 étapes 1 710 l., OCR CNI on-device | `identificateur-store` (437, persist = préférences, dossiers exclus) | 3 routes (lookup pré-auth rate-limité, mission, dossiers) + POST `/api/backoffice/enrolments` | préférences ; dossiers sensibles **non persistés** | téléphone **ou** code `JID-XXXX` ; PIN **local uniquement** |

**[FAIT]** Transverse partagé : `app-store` (453 l. — rôle, session, soleil, littératie), voix (`tata-tts`, `stt-factory`, `localIntent` ~905 l. regex nouchi + Gemma 1B navigation), notifications (`legacy_notifications`), file offline unique, `SyncFlusher`/`WakeWordManager`/`NotificationsWatcher` montés par espace dans `page.tsx`.

### 1.3 Scores par dimension (grille AUDIT-001)

| Dimension | Score | Justification synthétique |
|---|---:|---|
| Cohérence architecturale | 78 | Couches propres et garde uniforme (requireDeviceOwner sur 43/43 marchand, 68/73 BO) ; −12 : routes mortes et mondes parallèles (`/api/v1` sans consommateur, 6 endpoints marchand morts, 4 zones mortes coop) ; −10 : fichiers > 1 000 l. (auth-screen 2 182, ident-identification 1 710) |
| Qualité du code | 76 | 0 TODO/console.log/skip, dérivations pures testées (deriveCycleCulture, agregerBesoins, score-julaba) ; −14 : `simpleHash` djb2 dupliqué ×8, statistiques fantômes (Fidélité, réputation) ; −10 : mocks hard-codés résiduels (MOCK_REWARDS, UI factice ident) |
| Couverture de tests | 72 | 1318 verts, pgTAP 342 assertions (176+108+58) ; −15 : **pgTAP stock cassé et indétecté** (§5 S-06), pgTAP hors CI ; −7 : RBAC (`canPerformAction`) sans test unitaire, rejeu `cycle-create` non couvert |
| Documentation | 70 | Registres .ai tenus, DEBT_REPORT honnête ; −12 : README ident annonce des mutations inexistantes, badge « MFA TOTP » mensonger, doc MFA « code envoyé par email » non implémenté |
| **Sécurité** | **58** | Fondations fortes (deny-all 69 tables, service_role seul, scrypt+rehash BO, MFA hashé TTL 5 min) ; **−25 : régression SEC-813 — 2 RPC SECURITY DEFINER appelables par l'anon key** (§5 S-01, contre-vérifiées) ; −9 : MFA sans canal de livraison (BO inutilisable en prod hors mode test) ; −8 : PIN djb2 32 bits stocké tel quel, sans lockout, ×3 espaces |
| Accessibilité | 60 | 44 px + aria-pressed/aria-live généralisés, Mode Soleil, littératie vocale (onboarding + producteur) ; −15 : 4 écrans marchand **sans aucun accès tactile** (tontines, keiwa, fidélité, protection-sociale) ; −10 : littératie non déployée sur les écrans à formulaire producteur |
| Performance | 62 | Pas de N+1 détecté (membres/scores/liste batchés), items batchés `.in()` ; −14 : index manquants ciblés (§5 PF-01..03) ; −12 : photos C-récoltes en DataURL base64 relues à chaque sync ; −8 : GET sales non borné, 5–10 fetches parallèles à chaque rechargement |
| Conformité aux règles | 82 | Gates verts, registres à jour, aucune déclaration mensongère de TERMINÉ vérifiée ; −10 : dettes 20260921010000/20260921020000 annoncées « à déployer » — état live à confirmer ; −8 : seed producteur toujours présent (DET-PROD-002) |
| Dette technique | 74 | Classée et priorisée (DET-001..008, DET-COOP-001..011, DET-PROD-001..003) ; détectée jusqu'ici honnêtement ; cette audit y ajoute 40+ items (§5) |
| **SCORE GLOBAL** | **67 / 100** | Livraison PROD non bloquée au seuil 60, **MAIS 3 P0 sécurité (S-01, S-02, S-03) à traiter avant tout élargissement du module coopératif / des RPC en production** |

---

## 2. CARTOGRAPHIE DES RELATIONS ENTRE ESPACES ET ENTITÉS

### 2.1 Flux inter-espaces réellement observés

| # | Flux | Sens | Mécanique (preuve) | État |
|---|---|---|---|---|
| FL-01 | Vente → stock | marchand interne | `POST /api/marchand/sales` → RPC `merchant_record_sale` (FOR UPDATE, refus strict) → delta local post-verdict, réalign au flush (`sync-flusher.tsx:27-36`) | ✅ solide |
| FL-02 | Transferts inter-marchands | marchand ↔ marchand | RPC `merchant_transfer_out/receive/cancel`, annuaire `/stock/transfers/merchants` | ✅ |
| FL-03 | Adhésion marchand → coopérative | marchand → président | POST `rejoindre` (en_attente) → notif président → PATCH accepte/refuse → notif marchand (`rejoindre/route.ts:85-91`, `membres/[id]:98-113`) | ✅ invariant 409 + index unique partiel + trigger `actif` |
| FL-04 | Besoins marchands → achats groupés | marchand → président | POST `besoins` → agrégation pure `agregerBesoins` → POST `consolider` → dispatch → distribution `besoinId` | ✅ mais non atomique en fin de chaîne (§5 I-06) |
| FL-05 | Apports/distributions pot commun | marchand-membre ou président → coopérative | RPC `coop_apporter_stock`/`coop_distribuer_stock` (FOR UPDATE, idempotence `clientId`, refus intégral) | ✅ SQL, ⚠ TOCTOU (§5 I-07) |
| FL-06 | Score JULABA | transverse marchand/coop | `src/lib/scores/` dérivé de signaux réels, `/api/scores/me`, batch anti-N+1 | ✅ mais score président jamais affiché (§5 F-14) |
| FL-07 | Commandes backoffice → producteur | **BO → producteur** | POST `/api/producteur/commandes` garde `requireBackofficePermission` + notif `commande_recue` ; producteur accepte/refuse/livre | ✅ mais **seul** flux d'entrée de commandes |
| FL-08 | Enrôlement identificateur → dossiers | ident → BO | POST `/api/backoffice/enrolments` (garde device-owner) → `legacy_bo_enrolments` + miroir canonique `enrolments` + upsert roster | ✅ mais statut `lost` assumé sans file (§5 F-19) |
| FL-09 | Validation BO → comptes actifs | BO → marchand/producteur | PATCH `action=valider` → upsert `legacy_bo_actors` + création user Supabase Auth + notif `dossier_valide` (`enrolments/route.ts:316-417`) | ⚠ cf. FL-10 |
| FL-10 | Dossier → compte utilisable | ident → marchand/producteur | **[FAIT]** `provisionAccount` crée/met à jour `merchants`/`producers` **dès la soumission** du dossier, avec le hash PIN/schéma collecté au wizard (`enrolments/route.ts:115-177`, appelé :227) — l'acteur peut se connecter **avant** validation BO | ⚠ NOUVEAU — decision produit à trancher (§5 F-17) |
| FL-11 | Premier login → registre acteurs | marchand/producteur → BO | `claimDeviceSession` puis POST `/api/session/link-actor` backfill `legacy_bo_actors` (`link-actor/route.ts:39-91`) | ⚠ `actor_id` aléatoire à collisions (§5 I-09) |
| FL-12 | Objectifs BO → mission ident | BO → ident | upsert `legacy_bo_objectifs` → GET `/api/identificateur/mission` (résolution individuel→zone) → écrasement local si mois courant | ✅ |

**Flux attendus mais INEXISTANTS [FAIT]** (les hypothèses de mission « publications.cooperative_id », « users.est_membre_cooperative », « orders » sont **infirmées** — ces tables/colonnes n'existent ni en schéma ni en code) :

- **FL-X1 · Producteur → marché marchand** : « publier une récolte » pose `statut='publiee'` (`producteur-store.ts:270`) mais **aucun écran marchand ne lit les récoltes publiées** (MarcheScreen = commandes fournisseurs, `secondary-screens.tsx:58-145`). Flux à sens unique vers le backoffice seul.
- **FL-X2 · Producteur → coopérative** : les gardes coop n'acceptent que `merchant`/`cooperateur` (`cooperatives/stock/route.ts:77-81`) ; aucun appel `/api/cooperatives` dans l'espace producteur.
- **FL-X3 · Marchand → producteur direct** : le fournisseur est un champ libre ; les commandes producteur ne naissent que du backoffice (FL-07).
- **FL-X4 · Coopérative → backoffice** : aucune stat coopérative au BO (CONNU — DET-COOP-010).

### 2.2 Les royaumes d'authentification (5 piliers désunis)

**[FAIT]** Cinq univers de session cohabitent, avec des garanties hétérogènes :

| Royaume | Identité | Secret vérifié serveur | Session | Risque spécifique |
|---|---|---|---|---|
| `merchants` | id texte | hash PIN djb2 32 bits (`login/route.ts:15-17,44-46`) | cookie device 365 j, claim takeover autorisé | hash réversible par force brute (10⁴), pas de lockout |
| `producers` | id texte | idem `producteur/login/route.ts:15-56` | idem | idem |
| `cooperateurs` | id texte | hash local 32 bits (`coop-auth-screen.tsx:33-41`) | idem | idem + inscription auto sans garde (§5 F-13) |
| `bo_users` | email | scrypt + rehash transparent + lockout + OTP hashé TTL 5 min | `bo_sessions` 12 h révocables | **OTP jamais délivré** (§5 S-02) |
| identificateur | id ou JID | **aucun** (PIN local-only, `session/claim/route.ts:29-32`) | claim sans preuve + takeover (CONNU — DET-COOP-001) | lookup pré-auth renvoie l'id (§5 S-04) |

**[PROPOSITION]** Unifier progressivement vers un secret serveur unique par rôle (bcrypt/argon2 + lockout) et un jeton de claim à usage unique — le fix de fond déjà proposé par DET-COOP-001, étendu aux 5 royaumes.

### 2.3 Données partagées entre espaces (ponts réels)

- `legacy_bo_actors.merchant_id/producteur_id` (texte, UNIQUE, **sans FK**) — pont BO↔appareils, établi au premier login (FL-11).
- `legacy_notifications` — canal partagé : coop→marchand (`dossier_valide`, `stock_commun_recu`, `cooperative_info`), BO→ident (`commande_recue`…), login marchand (bienvenue).
- `device_sessions` — un seul cookie `julaba_device` mutualisé par appareil pour les 4 rôles terrain (subject `role:<id>`).
- `legacy_products.client_id` — référentiel produits marchand réutilisé par les mouvements/transferts.
- **Aucun pont** merchants↔producers↔cooperateurs vers `profiles` (Supabase Auth) : les comptes Auth créés à la validation BO (FL-09) sont orphelins des royaumes terrain [FAIT].

---

## 3. INVENTAIRE ET ANALYSE DES TABLES SUPABASE

### 3.1 Inventaire par tier (111 tables, 149 migrations)

| Tier | Tables | RLS | Accès réel | Observations [FAIT] |
|---|---:|---|---|---|
| **Moderne « scope »** (orgs) | 42 (organizations, zones, organization_members, profiles, actors, enrolments, harvests, producer_orders/journals, products, sales, sale_items, stock_movements, expenses, cash_sessions, tontines×3, notifications, audit_events, alerts, institutions, roles×3, keiwa×2, …) | 99 policies « scope » (`is_org_member`/`has_org_role`/ownership `auth.uid()`) | client invoker `/api/v1/*` + RPC INVOKER | **Sans consommateur front legacy** — monde parallèle ; `audit_events` INSERT sans policy (écriture via `write_audit_event` DEFINER uniquement) |
| **Merchant (STK)** | 13 + `legacy_products` | deny-all | service_role via routes + 10 RPC DEFINER | append-only réellement garanti (`forbid_merchant_stock_movements_rewrite`, triggers UPDATE/DELETE refusés) ; UNIQUE `(merchant_id, operation_id)` sur 5 tables |
| **Coopérative (MODE-921/922/931/932)** | 7 (cooperateurs, cooperatives, cooperative_membres, cooperative_transactions, cooperative_stock, cooperative_stock_mouvements, cooperative_besoins) | deny-all | service_role via routes + 2 RPC INVOKER | invariant « 1 adhésion active/marchand » = trigger `actif` + index unique partiel `uniq_coop_membre_actif` + filet 23505 ; `membre_id` polymorphe **sans FK** depuis MODE-931 (documenté par `comment on column`) |
| **Legacy auth/app** | 42 `legacy_*` + 3 `bo_*` + `merchants`, `producers`, `device_sessions`, `device_push_tokens` | deny-all (RLS actif, 0 policy) | service_role | double écriture « D3 » : les RPC merchant_* alimentent `legacy_sales`/`legacy_sale_items` (compat historique) |

### 3.2 Matrice RLS — mesures

- **111/111 tables** ont `enable row level security` [FAIT — vérifié table par table].
- **99 policies** tables + 2 storage : select 42 / insert 30 / update 60 / delete 4.
- **69 tables deny-all** (0 policy) = tout le tier terrain ; **0 table sans RLS** [FAIT].
- `device_push_tokens` : corrigé SEC-814 (`20260919100100`) — le pattern à conserver.

### 3.3 Inventaire RPC et gardes EXECUTE (12 RPC métier + helpers)

| RPC | Sécurité | Idempotence | Garde EXECUTE (migrations) | Verdict |
|---|---|---|---|---|
| `merchant_record_sale/purchase/movement/adjust_to_count/backfill_opening_balances` | DEFINER | UNIQUE `(merchant_id, operation_id)` | revoke anon+authenticated+public, grant service_role (SEC-813 `20260919100000`) | ✅ conforme |
| `merchant_transfer_out/receive/cancel` | DEFINER | client_id UNIQUE + 23505 | revoke anon+authenticated (`20260919110200:159`, …) | ✅ conforme |
| **`merchant_record_credit_op`** | **DEFINER** | UNIQUE (merchant_id, operation_id) | **revoke public seul + grant service_role** (`20260919130100:126-127`) | ❌ **P0 — S-01** |
| **`merchant_reverse_sale`** | **DEFINER** | double clé op + sale_client_id | **revoke public seul** (`20260919150100:168-169`) | ❌ **P0 — S-01** |
| **`purge_expired_notifications`** | **DEFINER** | n/a (rétention paramétrable) | **ni revoke ni grant** (`20260917160000:69-88`) | ❌ **P0 — S-01** |
| `coop_apporter_stock / coop_distribuer_stock` | **INVOKER** | `note like 'client:'‖client_id` (NULL-safe `is not distinct from`) | **grant authenticated + service_role** (`20260920100100:203-204`) | ⚠ trompeur — tables deny-all ⇒ 42501 hors route (S-07) ; ⚠ TOCTOU I-07 |
| `create_sale/open_cash_session/close_cash_session/record_tontine_contribution/submit_enrolment/validate_enrolment` | INVOKER | UNIQUE org-scopés | revoke public + grant authenticated | ✅ (tier moderne) |
| `write_audit_event/write_system_notification/write_system_event` | **DEFINER** + garde org | — | grant authenticated | ✅ |
| `legacy_keiwa_apply_operation`, `legacy_bo_content_increment_views` | INVOKER | — | **aucun revoke** (tables deny-all ⇒ RLS protège) | info |

**Le précédent qui condamne S-01** : la migration SEC-813 (`20260919100000_revoke_merchant_rpc_anon.sql:4-6`) documente noir sur blanc que « Supabase accorde EXECUTE explicitement à anon + authenticated à la création, même après un “revoke ... from public” ». `merchant_record_credit_op` et `merchant_reverse_sale` ont été **créées APRÈS** SEC-813 en répétant exactement le pattern insuffisant [FAIT — contre-vérifié]. **[HYPOTHÈSE]** sur la base live (non vérifiable depuis la sandbox) : ces 2 RPC sont exécutables avec l'anon key, donc mutation du cahier de crédit et des annulations de vente de n'importe quel marchand sans session. Correction = 2 lignes SQL + test pgTAP `has_function_privilege`.

### 3.4 Relations et contraintes inter-tables

**FK présentes** : cooperative_membres/transactions/besoins → merchants ; cooperative_stock_mouvements.besoin_id → besoins (SET NULL, `20260921000000:67-70`) ; merchant_product_units/prices/balances/movements/purchase_items/transfer_items → legacy_products ; purchases/credit_ops → business_partners ; sale_items → sales ; tontine_* → tontines ; bo_sessions/mfa → bo_users.

**Relations manquantes / non contraintes [FAIT]** :

| R-xx | Relation | Preuve | Impact |
|---|---|---|---|
| R-01 | `merchant_id` **sans FK sur 24 tables** (11 merchant-tier + 13 legacy) | `20260919090100:6`, `20260101010100:6`, `20260101010200:6`, … | intégrité marchand 100 % applicative ; orphelins possibles |
| R-02 | `legacy_producteur_journals.cycle_id` → `legacy_producteur_cycles.id` absente (et ownership non vérifié applicativement, §5 I-10) | `20260101013000:7` vs `20260921020000` | pollution inter-producteurs possible |
| R-03 | `cooperative_stock_mouvements.membre_id` polymorphe sans CHECK discriminant (marchand \| cooperateur \| NULL) | `20260921010000:25-29` | movéments non joignables proprement |
| R-04 | `legacy_sales.selling_point_client_id`, `legacy_sales.session_id`, `merchant_purchases.session_id` sans cible FK | `20260919140100:5-7` | réconciliation caisse/point de vente non garantie |
| R-05 | `merchants`/`producers`/`cooperateurs` ↔ `profiles` (Supabase Auth) : **aucun lien** | — | deux réalités d'identité |

### 3.5 Couverture pgTAP et CI

| Fichier | plan | Couvre | Ne couvre pas |
|---|---:|---|---|
| `tests/rls.sql` | 176 | 35+ tables modernes policies exhaustives, storage, deny-all ×20, seed rôles | ACL des RPC récentes |
| `tests/stock.sql` | 108 | 9 tables stock, CHECK, append-only, idempotence, INSUFFICIENT_STOCK, transferts, SEC-813/814 | **§14-15 cassés** (S-06) ; credit_op & reverse_sale non testés |
| `tests/cooperative.sql` | 58 | 7 tables, trigger `actif`, uniq_coop_membre_actif, pot commun, FK besoin_id | course d'inscription, ACL coop RPC |

**[FAIT]** CI (`.github/workflows/ci.yml:11,30`) : lint + typecheck + vitest uniquement — **pgTAP hors CI** ; c'est pourquoi S-06 (transaction pgTAP abortée par une table inexistante `legacy_merchants`, `tests/stock.sql:147`) passe inaperçu. La migration `20260921000000` a d'ailleurs produit une erreur 42703 réelle en prod avant correction (drift documenté) — même cause : aucun verrouillage schéma en CI.

### 3.6 Types TypeScript générés

**[FAIT]** `src/lib/supabase/database.types.ts` (3 226 l.) : **49/111 tables seulement**, 62 absentes dont `merchants`, `producers`, les 13 merchant_*, les 7 coop_* et 12 RPC ; contamination par schémas systèmes (`buckets`, `objects`…). Mitigation connue : `admin.ts:5-24` typé `any` (NORM-305, BLOQUÉ — Docker requis pour `supabase gen types`). **CONNU** mais la dette typage se creuse à chaque module (coop, merchant tiers).

---

## 4. RAPPORTS EXISTANTS ET CEUX À CRÉER

### 4.1 Inventaire des rapports/tableaux de bord existants [FAIT]

| Espace | Rapport/écran | Source de données | Qualité |
|---|---|---|---|
| Marchand | Résumé du jour « Ma caisse » + dicté vocal (`day-summary.ts:184,237`) | GET sales + expenses réels | ✅ parlé, réel |
| Marchand | Ventes : filtre semaine/mois, CA hors annulées, mini-graphe journalier (`ventes-screen.tsx:213-223`) | GET `/api/marchand/sales` | ✅ mais non borné (PF-04) |
| Marchand | Marge et alertes stock bas (`stock/marge`, seuil STK-806) | RPC + balances | ✅ |
| Marchand | **Fidélité / profile.score** | **aucune** — `profile.score` jamais écrit (`profile-screen.tsx:101`), récompenses `MOCK_REWARDS` (`secondary-screens.tsx:1132`) | ❌ décor (F-09) |
| Coopérative | Accueil président : membres actifs, trésorerie validée, cotisations, pot commun (`coop-home-screen.tsx`) | GET `/api/cooperatives` réel | ✅ |
| Coopérative | Membres : filtre performance score 71/41 + ScoreRing (`coop-membres-screen.tsx`) | GET membres enrichi scoreJulaba (batch 4 requêtes) | ✅ MODE-932 |
| Coopérative | Trésorerie : solde validé + journal 100 écritures | GET tresorerie | ⚠ solde ≠ accueil au-delà de 100 lignes (I-04) |
| Producteur | KPI héros stock + « vendu » + alertes + prix du marché (`prod-home-screen.tsx:90-287`) | GET stock dérivé + constantes locales | ❌ KPI à 0 pour 100 % des producteurs réels (I-01) ; prix = constantes (CONNU DET-PROD-003) |
| Producteur | Réputation (note/avis/classement) | **aucune** — jamais alimentée | ❌ décor (CONNU DET-PROD-001) |
| Back-office | Dashboard (`bo-dashboard-screen.tsx` 849 l.), rapports acteurs/enrôlement/audit + print/CSV (`bo-rapports-screen.tsx:39-45`), analytics, scores (credit_scores legacy), monitoring IA | 73 opérations BO | ✅ le seul espace avec exports (CSV/print) |
| Transverse | **Aucun** rapport marchand↔producteur↔coopérative croisé | — | ❌ cf. 4.2 |

### 4.2 Rapports à créer (sources réelles déjà en base) [PROPOSITION]

| Priorité | Rapport | Source (existe déjà) | Consommateur |
|---|---|---|---|
| P1 | **Rapport de session de marché** (CA, ventes, annulations, points de vente, marge) exportable CSV/print côté marchand | `legacy_sales` (+payment_method, +selling_point_client_id), `merchant_selling_points`, `merchant_stock_movements` — tout est écrit, rien n'est agrégé | marchand (imprimable pour sa comptabilité) |
| P1 | **Bilan de clôture de caisse réconciliable serveur** | `merchant_market_sessions` ↔ `legacy_sales.session_id` — la colonne existe, la route ventes ne la remplit jamais (F-10) | marchand + BO ventes |
| P2 | **Tableau coopératif BO** (total coopératives, membres, trésorerie agrégée) | 7 tables coop — DET-COOP-010 | back-office |
| P2 | **Rapport producteur** (récoltes par cycle, volumes par culture, taux de livraison des commandes) | `legacy_producteur_recoltes/commandes/cycles` (+ PATCH clôture à créer, I-03) | BO + producteur |
| P2 | **Score JULABA président** affiché + historique | `scoreCooperateur` existe (`scores-service.ts:170-207`), jamais affiché (F-14) | coopérateur |
| P3 | **Activité d'enrôlement par identificateur** (taux vs objectif mensuel réel) | `legacy_bo_enrolments` + `legacy_bo_objectifs` (la cible quotidienne `dailyTarget = 4` est hard-codée, F-20) | BO + ident |
| P3 | **Suivi des conflits de synchronisation** (déjà rapportés serveur) | `legacy_sync_conflict_reports` (écran BO 87 l. minimal) | BO |

---

## 5. ANOMALIES ET RISQUES IDENTIFIÉS

> Registre unifié. Sévérité : **P0** (sécurité/argent, à corriger avant tout déploiement élargi) · **P1** (perte de données ou fonctionnalité cassée réelle) · **P2** (risque limité/dette à planifier) · **P3** (hygiène). Statut : NOUVEAU / CONNU (référence registre).

### 5.1 Sécurité

| ID | Sév. | Espace | Anomalie | Preuve | Statut |
|---|---|---|---|---|---|
| **S-01** | **P0** | DB | **Régression SEC-813 : 2 RPC SECURITY DEFINER + 1 purge DEFINER sans revoke anon/authenticated** → exécution possible avec l'anon key : mutation du cahier de crédit (`merchant_record_credit_op`) et des annulations de vente (`merchant_reverse_sale`) de tout marchand, purge paramétrable de l'archivage notifications | `20260919130100:126-127` ; `20260919150100:168-169` ; `20260917160000:69-88` ; précédent documenté `20260919100000:4-6` — **contre-vérifié par l'auditeur** | **NOUVEAU P0** |
| **S-02** | **P0** | Back-office | **MFA sans canal de livraison** : le challenge OTP est hashé et stocké mais rien ne l'envoie (aucun mailer/SMS dans `src/`) ; l'UI promet « Code envoyé à {email} » ; en prod, connexion BO impossible hors `BACKOFFICE_MFA_TEST_MODE` | `mfa.ts:24-39` ; `bo-auth-screen.tsx:228` — contre-vérifié | **NOUVEAU P0** |
| **S-03** | **P0** | Transverse | **PIN hashé djb2 32 bits, stocké tel quel, sans lockout** sur marchand, producteur, coopérateur (10⁴ combinaisons ; le hash EST le secret transmis ; aucun rate-limit contrairement au BO) | `auth-screen.tsx:86-94` ; `merchant/login/route.ts:15-17,44-46` ; `ident-auth-screen.tsx:46-54` ; `coop-auth-screen.tsx:33-41` ; dupliqué ×8 fichiers | **NOUVEAU P0** |
| S-04 | P1 | Ident. | Énumération pré-auth : lookup renvoie id/nom/zone sans secret ; combiné au claim sans preuve (DET-COOP-001), connaître un téléphone ou JID suffit à lire les dossiers | `identificateur/auth/lookup/route.ts:86-95` ; `session/claim/route.ts:42-46` | NOUVEAU (dépendance de DET-COOP-001) |
| S-05 | P1 | March. | `GET /api/merchant?phone=` et miroir `GET /api/producteur?phone=` **sans aucune garde** : id, prénom, sexe, authMethods — endpoint mort de surcroît (remplacé par `/api/auth/lookup`) | `api/merchant/route.ts:81-117` (contre-vérifié) ; `api/producteur/route.ts:7-37` | NOUVEAU |
| S-06 | P1 | DB/tests | **pgTAP stock cassé** : `tests/stock.sql:147` insère dans `legacy_merchants` (table inexistante) → transaction abortée, assertions §14-15 + `finish()` en échec à chaque run, indétecté car pgTAP hors CI | `tests/stock.sql:147` — contre-vérifié | NOUVEAU |
| S-07 | P2 | Coop | GRANT `authenticated` sur les RPC coop (deny-all ⇒ 42501 garanti hors route) : surface confuse, à réduire à service_role | `20260920100100:203-204` | NOUVEAU |
| S-08 | P2 | BO | Frontières de zone absentes : `gestionnaire_zone` peut créer/affecter identificateurs, objectifs, missions **hors sa zone** (`canAccessZone` non appliqué) | `identificateurs/route.ts:52,98` ; `objectifs/route.ts:87-159` ; `missions/route.ts:104-119` | NOUVEAU |
| S-09 | P2 | BO | Incohérence RBAC alertes : PATCH `/alerts` exige `supervision:update`, or `admin_general`/`operateur_terrain` voient le bouton « Acquitter » et reçoivent 403 | `alerts/route.ts:31` ; `backoffice-permissions.ts:46,133` ; `bo-supervision-screen.tsx:287` | NOUVEAU |
| S-10 | P2 | BO | `force_password_change` posé à la création mais vérifié nulle part ; aucun endpoint de changement de mot de passe BO ; seed en clair `admin123` (rehash 1er login seulement) | `users/route.ts:59` ; `login/route.ts:65-76` ; `seed.sql:12-20` | NOUVEAU |
| S-11 | P2 | Transverse | Cookie device TTL 365 j sans révocation applicative (`device_sessions` sans `revoked_at`) vs BO 12 h révocable | `device-session.ts:6` | NOUVEAU |
| S-12 | P3 | BO/Ident | Rate-limit IP en mémoire (Map module) : inefficace multi-instances, perdu au restart | `lockout.ts:41-51` ; `auth/lookup/route.ts:21` | NOUVEAU [HYPOTHÈSE d'impact mono-instance] |
| S-13 | P3 | March. | 404-avant-403 sur PATCH récoltes/commandes producteur (sonde d'ids) ; POST récoltes fait l'inverse | `producteur/recoltes/route.ts:118-128` ; `commandes/route.ts:147-157` | NOUVEAU |

### 5.2 Intégrité des données

| ID | Sév. | Espace | Anomalie | Preuve | Statut |
|---|---|---|---|---|---|
| **I-01** | **P1** | Producteur | **Stock/KPI structurellement à zéro** : `/api/producteur/stock` n'agrège que `statut='disponible'` et `vendue`, posés **uniquement par le seed** — aucun writer applicatif n'existe (cycle de vie `brouillon→publiee` sans suite) ; KPI héros, « vendu » et écran stock = 0 pour tout producteur réel | `stock/route.ts:39` ; `producteur-store.ts:270,300,79-80` ; seed `seed.sql:386-387` — contre-vérifié | **NOUVEAU P1** |
| **I-02** | **P1** | Producteur | **`cycle-create` mis en file sans handler de rejeu** → au flush : « Aucun gestionnaire de synchronisation » → conflit droppé ; le cycle créé hors ligne disparaît au loadFromServer suivant | `producteur-store.ts:378,357-358` ; `sync-handlers.ts` (28 handlers, pas de `cycle-create` — contre-vérifié) ; `offline-db.ts:257-272` | **NOUVEAU P1** |
| **I-03** | **P1** | Producteur | **Cycles inclosables** : pas de PATCH `/api/producteur/cycles`, aucun writer de `statut='termine'`/`quantite_recoltee_kg` ; rien n'empêche N cycles `en_cours` simultanés (UI n'en montre qu'un → invisibles) | `cycles/route.ts` (GET/POST seulement) ; `20260921020000:19-22` ; `producteur-store.ts:500` | NOUVEAU P1 |
| **I-04** | **P1** | Coop | **Solde de trésorerie double** : GET tresorerie calcule le solde sur les 100 dernières lignes, GET cooperatives (accueil) sur toutes → deux soldes différents au-delà de 100 écritures | `tresorerie/route.ts:34,38-46` ; `cooperatives/route.ts:28-60` | NOUVEAU P1 |
| **I-05** | **P1** | Coop | **Mélange d'unités dans le pot commun** : ligne unique par `(cooperative_id, produit)` sans unité ; un apport réécrit `unite` et additionne → 5 kg + 3 sacs = « 8 sacs » | `20260920100000:144` ; `20260920100100:73-78` ; `stock/route.ts:91` | NOUVEAU P1 |
| **I-06** | **P2** | Coop | Distribution→besoin non atomique : RPC réussie puis PATCH `statut:'livre'` ; si le PATCH échoue, le stock est parti et le besoin reste re-distribuable | `coop-besoins-screen.tsx:138-146` | NOUVEAU |
| **I-07** | **P2** | Coop | TOCTOU idempotence coop : test `note like 'client:'‖…` AVANT le FOR UPDATE, `client_id` sans UNIQUE en base → rejeus concurrents double-comptables (le tier merchant a le filet UNIQUE ; pas la coop) | `20260921010000:55-80,135-176` | NOUVEAU (cousin de DET-COOP-004) |
| **I-08** | **P2** | Coop | Rejeu offline non idempotent pour trésorerie et besoins (pas de clientId) : crash entre commit serveur et dequeue = écriture dupliquée (flush at-least-once) | `tresorerie/route.ts:108-123` ; `besoins/route.ts:101-119` ; `cooperative-store.ts:440-443` | NOUVEAU |
| **I-09** | **P2** | BO | `actor_id` aléatoire `#M-`/`#P-`+random(4 chiffres) sur colonne UNIQUE sans réessai → ~120 collisions attendues à 10 000 acteurs, validation de dossier peut 500 ; le pipeline JID gère bien ce cas, lui | `enrolments/route.ts:352` ; `link-actor/route.ts:55,81` ; `20260101011000:6` | NOUVEAU |
| **I-10** | **P2** | Producteur | POST journal : `cycle_id` du body sans vérification d'appartenance au producteur (pas de FK, cf. R-02) | `journal/route.ts:63-72` | NOUVEAU |
| **I-11** | **P2** | Coop | Cotisation 25 000 FCFA non contrainte serveur (montant > 0 suffit, constante côté client) + idempotence annuelle sans filtre coopérative (marchand exclu d'une coop A ne peut pas cotiser dans B la même année) + requête sans index `membre_id` | `cotisation/route.ts:24-30,37-44` ; `marchand-coop-screen.tsx:31` ; `20260920100000:125-126` | NOUVEAU |
| **I-12** | **P3** | Producteur | Statuts PATCH récoltes/commandes non validés (aucune union imposée, pas de CHECK SQL) → statuts hors UI posables | `recoltes/route.ts:138` ; `commandes/route.ts:160` ; `20260101012800:14` | NOUVEAU |
| **I-13** | **P3** | Coop | Échecs partiels avalés au chargement président (membres/trésorerie/stock/besoins → listes vides silencieuses) ; compteurs `adhesionsEnAttente` partiellement stale | `cooperative-store.ts:293-296,380-436` | NOUVEAU |

### 5.3 Fonctionnel / zones mortes

| ID | Sév. | Espace | Anomalie | Preuve | Statut |
|---|---|---|---|---|---|
| F-08 | P2 | March. | **4 écrans sans aucun accès tactile** (tontines, keiwa, fidélité, protection-sociale) : atteignables seulement à la voix ou par notification — contradiction avec l'objectif faiblement-lettrés | `bottom-bar.tsx:11-13` ; `home-screen.tsx:160-175` ; `localIntent.ts:162-228,873-882` | NOUVEAU |
| F-09 | P2 | March. | Fidélité morte : `profile.score` jamais écrit, récompenses MOCK, règle « 10 FCFA = 1 point » calculée nulle part | `profile-screen.tsx:101,1416` ; `secondary-screens.tsx:1090-1132` | NOUVEAU |
| F-10 | P2 | March. | `sessionId` jamais passé à `POST /sales` (zod l'accepte, les achats le passent) → bilan de clôture non réconciliable serveur | `stock-service.ts:183,235` ; `validation/marchand.ts:196` ; `purchases/route.ts:234` vs `sales/route.ts:172-180` | NOUVEAU |
| F-11 | P2 | March. | 6 endpoints morts (GET market-sessions, GET+POST stock/prices, POST stock/backfill, GET partners, GET credit-ops) ; le grand livre de crédit serveur n'est jamais relu (dérive multi-appareils possible) | grep exhaustif agents + `credits-screen.tsx:49`, `points-vente-screen.tsx:41-62` | NOUVEAU |
| F-12 | P2 | March. | Éviction silencieuse de la file offline au-delà de 500 entrées (ventes non envoyées perdues sans trace en longue panne) | `offline-db.ts:67,154-158` | NOUVEAU |
| F-13 | P2 | Coop | Inscription coopérateur auto-provisioning : course sur `responsable_id` UNIQUE → 500 générique (compte supprimé puis relancé) au lieu du 409 annoncé par le commentaire | `cooperateurs/route.ts:16-17,143-148,155-158` | NOUVEAU |
| F-14 | P3 | Coop | Zones mortes : score président calculé jamais affiché ; `PATCH /api/cooperatives` et `GET mes-distributions` sans appelant ; statut besoin `approuve` jamais posé ; `nbMembres` agrégation = DET-COOP-005 (CONNU) | `scores/me/route.ts:22-38` ; `cooperatives/route.ts:90-132` ; `mes-distributions/route.ts` ; `besoins/[id]/route.ts:11` | NOUVEAU |
| F-15 | P3 | Coop | Regex téléphone morte dans coop-auth (« +225 » déjà supprimé quand le retrait s'applique) → formats hétérogènes vs `search-marchand` | `coop-auth-screen.tsx:43-44` vs `search-marchand/route.ts:22` | NOUVEAU [HYPOTHÈSE doublons de comptes] |
| F-16 | P3 | Ident. | Brouillons non soumis perdus au redémarrage (dossiers exclus du persist, aucune file) malgré l'écran Brouillons ; mission fallback hard-codée (mois 7/2026, 300) ; « Synchronisé il y a 2 min » factice ; README annonce des mutations inexistantes | `identificateur-store.ts:359-371,300` ; `ident-missions-screen.tsx:55,78,98` ; `README.md:41` | NOUVEAU |
| F-17 | P2 | Ident. | **Compte marchand/producteur utilisable dès la soumission du dossier** (avant validation BO) — à trancher produit (FL-10) | `enrolments/route.ts:115-177,227` | NOUVEAU |
| F-18 | P3 | BO | Roster identificateurs auto-provisionné par l'app (upsert au POST enrolments) contredit la règle « création BO uniquement » ; préfixe acteur erroné pour les coopératives (`cooperatif` → `#M-`) | `enrolments/route.ts:273-280,330` vs `identificateurs/route.ts:6-9` | NOUVEAU |
| F-19 | P2 | Ident. | Dossiers : échec réseau = `lost` assumé, jamais de file (le seul espace sans rejeu) | `identificateur-sync.ts:119-133` | NOUVEAU |
| F-20 | P3 | BO | `fetchAllData` = 10 fetches parallèles quel que soit le rôle (moitié en 403 pour operateur_terrain) ; génération JID re-scanne toute la table à chaque création | `backoffice-store.ts:1067-1083` ; `identificateurs/route.ts:84-87` | NOUVEAU |
| F-21 | P2 | Producteur | Marché sans acheteur : récoltes `publiee` sans surface de consommation (FL-X1) — lié à DET-COOP-002 (marché coopératif) mais distinct (marchand↔producteur) | `producteur-store.ts:270` ; `secondary-screens.tsx:58-145` | NOUVEAU (convergent DET-COOP-002) |
| F-22 | P3 | Producteur | Littératie branchée mais partielle : `ProdAideLitteratie` sur 2 écrans seulement (accueil, stock) — pas sur récoltes/commandes/cycles qui sont des formulaires ; `rateLitteratie` effective sur toutes les annonces métier | `prod-home-screen.tsx:62` ; `prod-stock-screen.tsx:34` ; `producteur-actions.ts:26-27` | NOUVEAU (opportunité) |
| F-23 | P3 | Transverse | Incohérence d'inférence de genre (« Papa/Maman » déduit du sexe en market-mode, jamais ailleurs — règle « never infer » home) ; doublon `'ident-dossier-detail'` (CONNU DET-007) ; `totalAmount` client ignoré serveur | `market-mode-screen.tsx:44` vs `home-screen.tsx:44` ; `app-store.ts:62,65` | NOUVEAU |

### 5.4 Performance

| ID | Sév. | Espace | Anomalie | Preuve | Statut |
|---|---|---|---|---|---|
| PF-01 | P2 | DB | Index manquants sur colonnes de policy : `devices.user_id` (aucun index), `sync_conflict_reports` (aucun index du tout) | `20260908000500:4,11` ; `20260908001200` | NOUVEAU |
| PF-02 | P2 | DB | FK sans index : `legacy_sale_items.product_id` (seq scan analytics), `cooperative_stock_mouvements.besoin_id`, `cooperative_transactions.membre_id`, `merchant_product_prices.unit_id`, `legacy_bo_keiwa_transactions.account_id`, `sale_items.product_id` | migrations citées §3.4/F | NOUVEAU |
| PF-03 | P2 | DB/March. | `legacy_sales` sans index `(merchant_id, created_at desc)` alors que GET sales filtre par dates + trie desc (et charge TOUTES les reversals du marchand sans limite) | `sales/route.ts:55-101` ; `20260101010200` | NOUVEAU |
| PF-04 | P2 | Producteur | Photos récoltes/journal en **DataURL base64 dans des colonnes text** (jusqu'à 6/récolte), rechargées à chaque sync, alors qu'un upload signé existe (`/api/v1/storage/sign-upload`) | `recoltes/route.ts:89` ; `journal/route.ts:71` ; `prod-recoltes-screen.tsx:190-221` | NOUVEAU |
| PF-05 | P3 | Coop | `chargerEspaceCooperateur` = 5 requêtes parallèles pour rafraîchir un seul onglet ; agrégation besoins limitée aux 200 derniers | `cooperative-store.ts:279-285` ; `besoins/route.ts:28` | NOUVEAU |
| PF-06 | P3 | DB | Types générés 49/111 tables (CONNU — NORM-305 BLOQUÉ) ; contamination par schémas systèmes | `database.types.ts` ; `admin.ts:5-24` | CONNU |

### 5.5 Points forts vérifiés (anti-anomalies)

1. **RLS 111/111** — zéro table sans RLS ; 69 deny-all cohérents avec l'accès service_role unique (contre-vérifié table par table).
2. **SEC-813/814** correctement appliquées sur les 8 RPC stock historiques + `device_push_tokens` (preuves pgTAP `stock.sql` §SEC-813).
3. **Garde uniforme** : `requireDeviceOwner` sur 43/43 endpoints marchand + 6/7 producteur ; 68/73 opérations BO gardées `bo_session` ; `requirePresident` résout la coopérative serveur par `responsable_id` (jamais acceptée du client).
4. **Invariants coopératifs SQL** réels : trigger `actif` + index unique partiel + filet 23505, refus intégral pot commun, 58 assertions pgTAP.
5. **Pas de N+1** détecté sur les routes échantillonnées (membres = 4 requêtes batchées, scores = 4 constantes, items `.in()`).
6. **Anti-course adhésion** et verrou `FOR UPDATE` pot commun testés pgTAP.
7. Hygiène : 0 TODO/console.log/skip, OCR CNI 100 % on-device (images jamais envoyées), scrypt+rehash BO, session BO révocable, audit logging systématique.

---

## 6. RECOMMANDATIONS CONCRÈTES ET PRIORISÉES

### P0 — sécurité et bloquants prod (cette semaine)

| # | Recommandation | Anomalies visées | Effort |
|---|---|---|---|
| P0-1 | **Migration SQL unique** : `revoke execute … from anon, authenticated` sur `merchant_record_credit_op`, `merchant_reverse_sale`, `purge_expired_notifications` (+ grant service_role explicite) — répliquer exactement le pattern SEC-813 (`20260919100000`) | S-01 | S |
| P0-2 | **Tests pgTAP ACL** : `has_function_privilege('anon', …)=false` pour les 3 RPC ; réparer `tests/stock.sql:147` (`legacy_merchants` → `merchants(id, first_name, phone)` et adapter les colonnes) | S-01, S-06 | S |
| P0-3 | **Brancher pgTAP sur la CI** (service postgres + supabase cli ou job séparé) — sans ce verrou, S-06 se reproduira (precedent 20260921000000 = 42703 en prod) | S-06 | M |
| P0-4 | **Décision MFA** : soit brancher un vrai canal (email transactionnel/SMS), soit basculer sur **TOTP RFC-6238** (officielle, offline, sans dépendance réseau) + corriger le badge UI et la doc | S-02 | M |
| P0-5 | **Supprimer** `GET /api/merchant` et `GET /api/producteur` (morts et énumérantes) — remplacement déjà en place : `/api/auth/lookup` | S-05 | S |

### P1 — intégrité et pertes de données (sprint suivant)

| # | Recommandation | Anomalies | Effort |
|---|---|---|---|
| P1-1 | **Writer serveur du stock producteur** : définir la transition « récolte → mise en stock disponible » (ex. action « déposer au stock » sur `publiee` ou dérivation du stock depuis `publiee`) + PATCH commandes posant `vendue` à la livraison ; décision produit à documenter | I-01 | M |
| P1-2 | **Handler `cycle-create`** dans `sync-handlers.ts` (miroir `recolte-create`) + test du rejeu ; 1 ligne + test | I-02 | S |
| P1-3 | **PATCH `/api/producteur/cycles`** (clôture : `statut='termine'`, `quantite_recoltee_kg` ≥ 0) + garde « un seul cycle `en_cours` » (POST refus si existant, ou clôture automatique) | I-03 | S/M |
| P1-4 | **Unifier le solde de trésorerie** : agrégat SQL sans `limit(100)` (view ou requête sum) partagé par GET tresorerie et GET cooperatives | I-04 | S |
| P1-5 | **Unité dans la clé du pot commun** : UNIQUE `(cooperative_id, produit, unite)` + refus d'apport d'unité différente (409 lisible) — migration + RPC à aligner | I-05 | M |
| P1-6 | **Idempotence trésorerie/besoins/cotisation** : `clientId` côté store + UNIQUE partiel en base (même contrat que l'apport) ; filtre coopérative sur l'idempotence cotisation + index `membre_id` | I-07, I-08, I-11 | M |
| P1-7 | **PIN serveur** : basculer les 3 royaumes terrain vers bcrypt/argon2 (migration `pin_hash` → re-hash au premier login réussi, comme le fait déjà le BO avec scrypt) + lockout serveur ; en attendant, lockout IP sur les routes login | S-03 | L |
| P1-8 | **Cesser d'exposer l'id** dans le lookup identificateur + exiger une preuve de possession à la claim (jeton one-shot émis par login — fix de fond DET-COOP-001, à étendre) | S-04 | M |

### P2 — fonctionnel et risques limités

| # | Recommandation | Anomalies | Effort |
|---|---|---|---|
| P2-1 | **Accessibilité tactile** : ajouter tontines/keiwa/fidélité/protection-sociale aux tuiles d'accueil ou à la barre ; relier `profile.score` à `/api/scores/me` ou masquer Fidélité (décision produit) | F-08, F-09 | M |
| P2-2 | **Réconcilier caisse** : passer `sessionId` à POST sales (déjà accepté par zod), bornes de pagination sur GET sales | F-10, PF-03 | S |
| P2-3 | **Brancher ou supprimer** les 6 endpoints morts marchand (recommandé : brancher les lectures crédits/partenaires/points de vente pour la resynchronisation multi-appareils) | F-11 | M |
| P2-4 | **File offline** : journaliser l'éviction (conflit `sync_conflict_reports` avant slice) + alerter l'utilisateur ; augmenter le cap seulement après mesure localStorage | F-12 | S |
| P2-5 | **RBAC BO** : appliquer `canAccessZone` sur identificateurs/objectifs/missions ; réaligner la garde PATCH `/alerts` ; implémenter `force_password_change` (interception post-login + endpoint changement de mot de passe) ; supprimer les comptes seed en clair | S-08, S-09, S-10 | M |
| P2-6 | **actor_id séquentiel** (ou séquence avec réessai, à l'image du pipeline JID) ; fixer le préfixe coopératif ; lier `merchant_id/producteur_id` à la validation BO | I-09, F-18 | S |
| P2-7 | **Index** : `devices(user_id)`, `sync_conflict_reports(user_id, organization_id)`, `legacy_sales(merchant_id, created_at desc)`, `legacy_sale_items(product_id)`, `cooperative_stock_mouvements(besoin_id)`, `cooperative_transactions(membre_id)` | PF-01, PF-02, PF-03 | S |
| P2-8 | **Photos vers storage signé** (upload `/api/v1/storage/sign-upload` existant), colonnes gardées pour l'historique | PF-04 | M |
| P2-9 | **Brouillons identificateur persistés** (chiffrés, ou file offline dédiée) + décisions dossiers (`lost` → file) | F-16, F-19 | M |
| P2-10 | **Atomicité distribution→besoin** : marquer `livre` AVANT la distribution (compensation si échec) ou endpoint dédié qui fait les deux côté serveur | I-06 | S |
| P2-11 | Réduire le GRANT des RPC coop à service_role (S-07) ; UNIQUE sur la clé d'idempotence coop (I-07) ; FK/CHECK `membre_id` polymorphe (R-03) | S-07, I-07, R-03 | S |

### P3 — hygiène (opportuniste)

Doublon `'ident-dossier-detail'` (DET-007) · statuts PATCH validés + CHECK SQL (I-12) · 404-avant-403 (S-13) · regex téléphone coop (F-15) · `nbMembres` (DET-COOP-005) · UI factice ident (F-16) · fetchAllData par rôle + scan JID (F-20) · 5 requêtes coop (PF-05) · README ident (F-16) · purge seed producteur (CONNU DET-PROD-002) · régénérer `database.types.ts` quand Docker disponible (CONNU NORM-305).

---

## 7. PLAN D'ACTION TECHNIQUE DÉTAILLÉ

> Ordre de tir recommandé ; chaque chantier suit le protocole du dépôt : MODE-9xx dans `.ai/TASKS.md` → implémentation → **gates (vitest/tsc/eslint)** → registres → commit FR → push PAT one-shot. Les migrations SQL se valident avec `bun run test:rls` (pgTAP, Supabase local) — donc **d'abord P0-3 (CI pgTAP)** pour verrouiller le harnais.

### Sprint A — « Verrouiller » (P0, ~1 session)

1. **A-1 (P0-1/P0-2)** : migration `20260921xxxxxx_revoke_rpc_post_audit.sql` — 3 revoke + tests pgTAP `has_function_privilege` ; corriger `tests/stock.sql:147` ; passer les 342+ assertions en local (`supabase db reset && supabase test db`).
2. **A-2 (P0-3)** : job CI `pgtap` (service postgres 17 + supabase CLI ou dump-restore) — échouer la CI sur toute assertion pgTAP.
3. **A-3 (P0-5)** : suppression des GET marchand/producteur sans garde (+ leurs tests morts le cas échéant) ; grep de non-régression sur les consommateurs (déjà zéro).
4. **A-4 (P0-4)** : MFA — recommandation technique : **TOTP** (lib `otpauth` ou implémentation HMAC-SHA1 maison testée), provisioning QR, fallback codes de récupération ; sinon intégration Resend/Postmark derrière variable d'env. Corriger `bo-auth-screen.tsx:228` et `COMPTES-TEST.md`.
5. **A-5** : gates + registres + commit « fix(securite): MODE-934 — clôture de la régression SEC-813 + ACL RPC post-audit 003 ».

### Sprint B — « Intégrité producteur/coop » (P1, 2-3 sessions)

1. **B-1 (P1-2)** : handler `cycle-create` + test vitest du rejeu (offline → flush → POST cycles rejoué).
2. **B-2 (P1-3)** : PATCH cycles (clôture + quantité), garde un-seul-en-cours, écran « Terminer le cycle » (formulaire quantité récoltée), test `deriveCycleCulture` sur clôture.
3. **B-3 (P1-1)** : décision produit documentée (ADR) : writer « mise en stock » (PATCH récoltes `statut='disponible'` avec garde serveur) OU dérivation stock depuis `publiee` — implémentation + tests pgTAP CHECK statuts (I-12 au passage).
4. **B-4 (P1-4/P1-6)** : agrégat solde unique (view `v_coop_tresorerie_solde`), clientId + UNIQUE partiels sur tresorerie/besoins/cotisation, index `cooperative_transactions(membre_id)`, filtre coop sur l'idempotence cotisation.
5. **B-5 (P1-5)** : migration UNIQUE `(cooperative_id, produit, unite)` + RPC alignée + écran d'apport avec unité verrouillée + pgTAP (mélange d'unités refusé).
6. **B-6 (P1-7/P1-8)** : chantier PIN (migration bcrypt/argon2 + re-hash transparent au login + lockout) et jeton de claim one-shot — découper en 2 MODE ; effort L, planifier par rôle (marchand d'abord, producteur, coopérateur, identificateur).
7. **B-7 (S-13, I-10)** : ordre auth-avant-lookup sur PATCH producteur ; vérification d'appartenance `cycle_id` au POST journal.

### Sprint C — « Rendre visible » (P2, 2-3 sessions)

1. **C-1 (P2-1)** : accessibilité tactile des 4 écrans orphelins + décision Fidélité (brancher `/api/scores/me` ou retirer) — public faiblement lettré = priorité UX réelle.
2. **C-2 (P2-2/P2-4)** : `sessionId` dans POST sales, pagination GET sales, journalisation d'éviction de la file.
3. **C-3 (P2-3)** : branchement des lectures crédits/partenaires/points de vente (resynchronisation multi-appareils) ou retrait assumé et documenté.
4. **C-4 (P2-5/P2-6)** : RBAC BO (zones, alertes, force_password_change) + actor_id séquentiel + préfixe coopératif + lien acteurs↔comptes à la validation.
5. **C-5 (P2-7)** : migration index (6 index, cf. P2-7) + `EXPLAIN ANALYZE` avant/après sur GET sales.
6. **C-6 (P2-8/P2-9/P2-10/P2-11)** : photos → storage signé ; brouillons persistés chiffrés ; distribution→besoin atomique (endpoint serveur dédié) ; GRANT/UNIQUE/FK coop.

### Sprint D — « Rapports » (§4.2, 2 sessions)

1. **D-1** : Rapport de session de marché marchand (CSV/print) — agrégation `legacy_sales` par `session_id`/`selling_point_client_id` (préalable C-2).
2. **D-2** : Tableau coopératif BO (DET-COOP-010) + score président affiché (F-14).
3. **D-3** : Rapport producteur cycles/récoltes (préalable B-2/B-3).
4. **D-4** : Suivi enrôlement vs objectifs réels (remplacer les constantes hard-codées F-20/F-16).

### Critères de sortie de l'audit

- [ ] S-01, S-02 (décision), S-05, S-06 corrigés + pgTAP en CI vert.
- [ ] I-01, I-02, I-03 corrigés (producteur « réel » : stock, cycles, rejeu).
- [ ] Zéro RPC SECURITY DEFINER avec EXECUTE anon/authenticated (test pgTAP systématique ajouté au harnais).
- [ ] Registres mis à jour : S-xx/I-xx/F-xx/PF-xx de cet audit vers `DEBT_REPORT.md`/`BUGS.md` à la prise en charge.
- [ ] Re-audit ciblé après Sprint B (seuil : 5+ features ou 1 P0 ouvert).

---

## SIGNATURE

- Rapport généré par AGENT AUDIT GLOBAL — 5 sous-audits parallèles + contre-vérification des 6 constats critiques (S-01, S-02, S-03, S-05, S-06, I-01, I-02, I-11) par l'auditeur principal, lecture seule.
- **40 anomalies nouvelles** identifiées (3 P0, 8 P1, 15 P2, 14 P3) + 6 rappels CONNUS (DET-007, DET-COOP-001/004/005, DET-PROD-001/002, NORM-305).
- Prochaines étapes : arbitrage du porteur sur les décisions produit (F-09 Fidélité, F-17 compte avant validation, P0-4 canal MFA, P1-1 writer stock producteur), puis Sprint A.
