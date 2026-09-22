# Inventaire des fonctionnalités du module Coopérative — `SOMET1010/julaba-app`

> **Date** : 20 septembre 2026
> **Source** : analyse directe du dépôt https://github.com/SOMET1010/julaba-app (commit `e17992a`, 20/09/2026)
> **Objet** : inventaire exhaustif, factuel et documenté de tout ce que couvre le module coopératif, avec chemins de fichiers, endpoints, entités, écrans, tests et dette connue. Aucune modification de code source effectuée.

---

## 1. Synthèse

Le module coopérative de julaba-app est un **espace métier complet** porté par :

- un **rôle backend** `cooperateur` (normalisé `cooperative` côté UI) créé à l'inscription avec **auto-provisioning** de sa coopérative (`backend/src/auth/auth.service.ts`, l.149-165) ;
- un **module NestJS dédié** `backend/src/cooperatives-rest/` (11 fichiers, contrôleur de 953 lignes) exposant ~25 endpoints sous `api/v1/cooperatives` ;
- un **espace frontend** `/cooperative/*` (13 routes) + **2 écrans côté marchand** (`/marchand/cooperative`, `/marchand/cooperative/besoin`) ;
- **6 tables PostgreSQL** (`cooperatives`, `cooperative_membres`, `cooperative_stock`, `cooperative_stock_mouvements`, `cooperative_transactions`, `cooperative_besoins`) ;
- **6 invariants testés contre un PostgreSQL réel** (`backend/test/invariants/stock-commun-cooperative.spec.ts` et autres).

Fonctionnellement, la coopérative joue quatre rôles : **regroupement de marchands** (adhésion, membres, chefs de groupe), **trésorerie collective** (cotisations, entrées/sorties avec workflow de validation), **stock commun** (pot commun apporté/distribué, jamais négatif) et **plateforme d'achats/ventes groupées** (besoins consolidés, marché coopératif, commandes, négociation, clôture de paiement).

---

## 2. Modèle de données

### 2.1 Entités déclarées (`backend/src/cooperatives-rest/`)

| Entité / Table | Colonnes clés | Contraintes |
|---|---|---|
| `Cooperative` → `cooperatives` (`cooperative.entity.ts`) | `id` uuid PK, `nom`, `zone_id`, `responsable_id` **unique** (une coopérative par responsable), `actif` (déf. true), `created_at/updated_at`, `commune_id` (migration 1780900000000, lue en SQL brut) | unicité responsable |
| `CooperativeMembre` → `cooperative_membres` (`cooperative-membre.entity.ts`) | `cooperative_id`, `membre_id`, `statut` (`actif`/`suspendu`/`en_attente`/`exclu`), `role` (`membre`/`president`), `date_adhesion`, `cotisation_payee`, `actif` | index unique `(cooperative_id, membre_id)` ; index unique partiel `uniq_coop_membre_actif` (`(membre_id) WHERE actif = true`) → **invariant « une seule adhésion active »** |
| `CooperativeStock` → `cooperative_stock` (`cooperative-stock.entity.ts`) | `produit`, `categorie`, `quantite` decimal(15,2), `unite` — une ligne = total **courant** d'un produit | unique `ux_cooperative_stock_produit (cooperative_id, produit)` |
| `CooperativeStockMouvement` → `cooperative_stock_mouvements` (`cooperative-stock-mouvement.entity.ts`) | `type` CHECK `('apport','distribution')`, `quantite` CHECK `> 0`, `membre_id` (apporteur ou destinataire), `besoin_id` nullable, `note`, `created_at` | journal **append-only** ; 2 index (`cooperative_id,produit` ; `membre_id,type,created_at`) |
| `CooperativeTransaction` → `cooperative_transactions` (`cooperative-transaction.entity.ts`) | `type` CHECK `('entree','sortie')`, `categorie` (déf. `autre`), `montant` CHECK `>0`, `membre_id`, `description`, `statut` CHECK `('en_attente','validee','annulee')` | workflow de validation |

### 2.2 Tables/colonnes créées par migrations

| Migration | Contenu |
|---|---|
| `1780200000000-BaselineSchema.ts` | crée `cooperatives`, `cooperative_membres`, `cooperative_besoins`, enum `publications_type_marche_enum ('producteur','cooperative')` + `publications.cooperative_id`, colonnes users `cooperative_name` et `est_membre_cooperative` |
| `1780300000000-FixSchemaDrifts.ts` | `cooperative_membres.cooperative_id/membre_id` varchar → **uuid** + FK CASCADE |
| `1780900000000-AddCoordsToCommunesAndCommuneIdToCooperatives.ts` | `cooperatives.commune_id` + FK + GPS des 41 communes (utilisé par le tri Haversine des récoltes prévues) |
| `1781100000000-CooperativeStockCommun.ts` | `cooperative_stock` + `cooperative_stock_mouvements` (CHECK, FK CASCADE, index) — répare un stub documenté dans `docs/RESIDUS.md` |
| `1781300000000-CooperativeTransactions.ts` | `cooperative_transactions` — répare le 500 « relation does not exist » de la trésorerie |
| `1781300000000-CooperativeStockMouvementsMembreIndex.ts` | index `(membre_id, type, created_at DESC)` pour `mes-distributions` |
| Archivée `1779100000000-AddCooperativeAndTypeMarcheToPublications.ts` | publications.cooperative_id/type_marche + index unique partiel d'adhésion |

La table **`cooperative_besoins`** (sans entité TypeORM) est garantie au boot par `ensureCooperativeBesoinsTable()` (contrôleur, l.34-56) : `cooperative_id, marchand_id, produit, categorie, quantite, unite, prix_max, priorite (normale/urgente), statut (en_attente/consolide/…), notes, date_besoin, prix_achat, prix_dispatch, quantite_attribuee`.

### 2.3 Résolveur unique

`cooperative-resolver.service.ts` expose `getActiveCooperativeId()` — **source de vérité unique** de la coopérative active d'un compte (`cooperative_membres … actif = true LIMIT 1`). Utilisé par le contrôleur et par `publications-rest.controller.ts` pour la republication vers la coopérative.

Helper `resolveUserCooperative(userId)` (contrôleur, l.58-71) : rôle **`president`** si `cooperatives.responsable_id = user.id`, sinon **`membre`** via adhésion.

---

## 3. API — endpoints HTTP (préfixe `api/v1`, gardes `JwtAuthGuard` + `RolesGuard` sur tout le contrôleur)

### 3.1 Cycle de vie de la coopérative

| Endpoint | Description | Accès |
|---|---|---|
| `POST /cooperatives` | Création — 409 propre si le responsable a déjà une coopérative (check + filet anti-course sur erreur 23505) | `super_admin`, `admin_general`, `cooperateur` |
| `GET /cooperatives` | La coopérative dont je suis responsable | authentifié |
| `GET /cooperatives/:id` | Détail | authentifié |
| `PATCH /cooperatives/:id` | Mise à jour (owner ou admin) | `super_admin`, `admin_general`, `cooperateur` |
| `GET /cooperatives/liste` | **Annuaire public** des coopératives actives (nom, commune jointe, `responsable_nom`) — alimente le menu « Rejoindre » | authentifié |

### 3.2 Membres

| Endpoint | Description | Accès |
|---|---|---|
| `GET /cooperatives/membres` | Membres enrichis (User sanitisé via `stripSensitiveUserFields`) + `scoreJulaba` réel batché (ScoresService, sans N+1) | authentifié |
| `POST /cooperatives/membres` | Ajout d'un marchand (`marchand_id`, `role_membre`, `date_adhesion`) + pose `estMembreCooperative=true` | **président** |
| `GET /cooperatives/search-marchand?phone=` | Recherche de marchand par téléphone | **président** |
| `PATCH /cooperatives/membres/:id/statut` | `actif \| suspendu \| en_attente \| exclu` | président de la coop du membre |
| `PATCH /cooperatives/membres/:id/role` | Promotion/rétrogradation chef de groupe (`membre \| president`) | président |
| `DELETE /cooperatives/membres/:id` | Exclusion (suppression de ligne) | président |
| `POST /cooperatives/rejoindre/:id` | **Demande d'adhésion** (`statut='en_attente'`) + aligne `estMembreCooperative=true` | marchand |
| `GET /cooperatives/ma-cooperative` | Adhésion courante + coop + `responsable_nom` + commune (jointure SQL) | authentifié |

### 3.3 Trésorerie

| Endpoint | Description | Accès |
|---|---|---|
| `GET /cooperatives/tresorerie` | `solde = Σ entrées validées − Σ sorties validées` + liste des transactions | authentifié |
| `POST /cooperatives/tresorerie` | Création de transaction (`entree`/`sortie`) en `en_attente` | **président** |
| `PATCH /cooperatives/tresorerie/:id` | **Validation ou annulation** (`statut: validee \| annulee`) | président |

### 3.4 Besoins (achats groupés)

| Endpoint | Description | Accès |
|---|---|---|
| `GET /cooperatives/besoins` | Besoins + **agrégation par produit::unité** (quantité totale, nb de membres, priorité max) + rôle de l'appelant | authentifié |
| `POST /cooperatives/besoins` | Dépôt d'un besoin — coopérative résolue **côté serveur**, jamais par le client | membre |
| `PATCH /cooperatives/besoins/:id` | statut / notes / `quantite_attribuee` / `prix_achat` / `prix_dispatch` | authentifié |
| `POST /cooperatives/besoins/consolider` | Passe les besoins `en_attente` → `consolide` (par produit+unité ou global) | authentifié |

### 3.5 Stock commun (pot commun)

| Endpoint | Description | Accès |
|---|---|---|
| `GET /cooperatives/stock` | Stock commun (tous membres) | membre |
| `POST /cooperatives/stock/apport` | Apport au pot commun : **transaction SQL + verrou pessimiste**, upsert de la ligne courante + mouvement `apport` ; 403 si hors coopérative | membre |
| `POST /cooperatives/distribution` | Distribution **multi-membres** ; refus intégral si demande > disponible (**jamais de stock négatif**) ; un mouvement `distribution` par destinataire ; notifications `stock_commun_recu` émises **après commit** | membre |
| `GET /cooperatives/mes-distributions` | Historique des distributions reçues (30 dernières, jointure unité) | authentifié |

### 3.6 Commandes et cotisation

| Endpoint | Description | Accès |
|---|---|---|
| `POST /cooperatives/commandes/:id/cloture` | Clôture de paiement d'une commande **livrée** dont je suis l'acheteur → `statut_paiement='paye'` (attestation espèces, zéro mouvement wallet) | acheteur |
| `POST /cooperatives/cotisation` | Cotisation membre : entrée `cotisation` **déjà validée** + `cotisation_payee=true` | membre |

### 3.7 Endpoints neutralisés (feature morte assumée)

| Endpoint | État |
|---|---|
| `GET /cooperatives/commandes-groupees` | ⚠️ Neutralisé : table jamais créée, renvoie `{commandes: []}` (commentaire contrôleur l.548-555, réactivation documentée comme « migration #133 ») |
| `POST /cooperatives/commandes-groupees` | ⚠️ Neutralisé : répond `{persisted:false}` honnêtement (l.557-565) |

---

## 4. Écrans frontend

### 4.1 Espace coopérative — routes `frontend_src/src/app/routes.tsx` (l.109-127)

Routes : `/cooperative` (accueil), `membres`, `finances`, `profil`, `stock`, `tresorerie`, `marche`, `commandes`, `academy`, `keiwa` (+ transfert/paiements/banque/carte/historique), `parametres`, `support`.

| Écran (`components/cooperative/`) | Lignes | Fonctionnalités |
|---|---|---|
| **`CooperativeHome.tsx`** | 193 | Accueil avec `RoleDashboard` (couleur `#2072AF`, voix Tata « La coopérative X compte N membres actifs… »), KPIs **Volume groupé** / **Trésorerie** / **Total cotisations**, 3 cartes d'action (Finances, Membres, Ajouter membre → `/cooperative/membres?openAdd=1`), bandeau orange « N adhésions en attente », **6 modals** (`CooperativeModals.tsx` : Volume, Transactions, Score, Résumé, Achats groupés, Ventes groupées), cloche notifications |
| **`Membres.tsx`** | 1 790 | Gestion des membres : 2 onglets (Actifs / En attente), recherche, filtres région/commune (`REGIONS_CI` complète), filtre performance sur `scoreJulaba` (seuils 71/41 → haut/moyen/bas), pagination 20/page, **anneau de score** (`ScoreRing`) par membre, drawer membre 3 onglets (Performances / Transactions / Infos). Actions : **suspendre** (motif obligatoire), **réactiver**, **exclure**, **promouvoir/rétrograder chef de groupe**, **accepter/refuser** une demande d'adhésion, **notifier un membre** (`POST /notifications/notify-member`), **ajouter un marchand** par recherche téléphone |
| **`FinancesCooperative.tsx`** | 591 | KPIs solde/cotisations/ventes, transactions par catégorie (`cotisation`, `vente_groupee`, `achat_groupe`, `commission`, `frais`, `subvention`), modal « Nouvelle transaction » (entrée/sortie + catégorie + montant + description), filtres période |
| **`TresorerieCooperative.tsx`** | 651 | Solde héros, **validation/annulation** des transactions en attente, détail modal, filtres période (7j/30j/3 mois) + catégorie |
| **`Stock.tsx`** | 668 | **Stock commun** : compteur de produits, cartes produits avec images, recherche + catégorie ; bouton **« Apporter du stock »** (produit/quantité/unité/catégorie) et **« Distribuer »** (modal multi-destinataires avec contrôle client du disponible ; échec si `persisted !== true`) ; recherche vocale (`useVoiceCore`) |
| **`MarcheHub.tsx`** | 2 493 | **Marché coopératif**, 3 vues (Achats / Ventes / Historique). *Achats* : marketplace producteurs (`GET /publications/marche`), commande avec modal livraison (nom, téléphone validé regex CI `^(01|05|07|25|27)\d{8}$`, localité, date, mode livraison/enlèvement, livraison à un tiers), mes achats, onglet achat groupé. *Ventes* : « ma marketplace », **publication d'un produit sur la marketplace coopérative** (prix coop), **annonce indépendante**, retrait de produit, **commandes reçues** avec **accepter/refuser**, **négocier** (`en_negociation` + message/prix négocié), **clôturer le paiement**. Historique, KPIs, `ScoreRing` vendeur |
| **`Commandes.tsx`** | 1 369 | 2 onglets. **« Commandes »** : workflow `brouillon→envoyee→confirmee→en_livraison→livree`, création de commande groupée en 3 étapes (dont nombre de membres), réception, **paiement collectif** (clôture coop). **« Besoins membres »** : liste filtrée par rôle (président = tout, membre = les siens), **modal dispatch** (statut en_attente/en_cours/approuve/livre, quantité attribuée, prix achat/dispatch) puis **distribution liée au `besoinId`** avec exigence `persisted === true` — jamais de succès mensonger |
| **`CooperativeProfil.tsx` / `CooperativeParametres.tsx`** | — | Wrappers `UniversalProfil` / `UniversalParametres` pour le rôle `cooperative` |
| Academy | — | Parcours `cooperative` (module « leader ») via `academyConfig.ts` |

### 4.2 Écrans côté marchand

| Écran | Lignes | Fonctionnalités |
|---|---|---|
| **`MaCooperative.tsx`** (route `/marchand/cooperative`) | 297 | Carte « ma coopérative » (nom, marché/commune, responsable, badge statut actif/en attente/suspendu, date d'adhésion) ; **paiement de cotisation 25 000 FCFA** (`POST /cooperatives/cotisation`) ; liens « Mes commandes » et « Soumettre un besoin » (si actif) ; **historique « Distributions reçues »** du stock commun ; si non-membre : sélecteur dans l'annuaire (`useCooperativesListe`) + bouton « Rejoindre cette coopérative » |
| **`BesoinMarchand.tsx`** (route `/marchand/cooperative/besoin`) | 196 | Formulaire de besoin : produit avec autocomplétion `CATALOGUE_PRODUITS` (catégorie/unité auto-remplies), quantité + unité (`UNITES_COURANTES`), prix max optionnel, priorité **normale/urgente**, notes → `POST /cooperatives/besoins` + retour vocal |

### 4.3 Écrans connexes influencés par la coopérative

- **`marchand/RecoltesPrevues.tsx`** — vue grossiste : bandeau « Ta coopérative de référence » + récoltes producteurs triées par **distance Haversine depuis la commune de la coopérative**.
- **`marchand/MarcheVirtuel.tsx`** — vue demi-grossiste : marché coopératif scopé à sa coop.
- **`marketplace/Marketplace.tsx`** — `SellerType.COOPERATIVE`, onglet dédié aux coopératives.
- **`roleConfig.ts`** — bottom bar coopérative (Accueil / Marché / Membres / Moi), actions « Achats groupés » / « Ventes groupées ».

---

## 5. Contexte React, hooks et clients API

| Élément | Fichier | Contenu |
|---|---|---|
| **`CooperativeContext`** | `frontend_src/src/app/contexts/CooperativeContext.tsx` (348 l.) | Monté dans `App.tsx` si le rôle est coopératif. **État** : `cooperative` (id/nom/presidentId/soldeTresorerie), `membres`, `tresorerie`, `soldeActuel` (API), `stats` (volumeGroupe, trésorerie, totalMembres, membresActifs, totalCotisations, totalVentes), `loading`. **Actions** : `addMembre/ajouterMembre`, `supprimerMembre`, `addTransaction/ajouterTransaction`, `validerTransaction`/`annulerTransaction` (PATCH avec **rollback optimiste**), `modifierMembre` (local, marqué « FUTURE: sync »), getters (`getMembresActifs`, `getRecentTransactions`, `getTotalCotisations`, `getTotalVentesGroupees`, `getCommandesEnCours`), `refreshCooperative/Membres/Tresorerie`. Résilient à `NOT_AUTHENTICATED` |
| **`useCooperativesListe`** | `frontend_src/src/app/hooks/useCooperativesListe.ts` | Fetch `GET /cooperatives/liste` (credentials include, AbortController) pour le menu « Rejoindre » |
| **`useScoreJULABA`** | `frontend_src/src/app/hooks/useScoreJULABA.ts` | Actions de score du rôle `cooperative` : `daily_opening`, `academy_training`, `complete_profile`, `add_members`, `first_collection`, `daily_collections` (⚠️ référence `/cooperative/achats`, route inexistante — voir §9) |
| **Client API dédié** | `frontend_src/src/app/services/api/cooperatives-api.ts` (192 l.) | `fetchCooperative`, `fetchCooperativeMembres`, `fetchCooperativeTresorerie`, `addTresorerieTransaction`, `addCooperativeMembre`, `fetchBesoins`, `createBesoin`, `fetchStockCommun`, `apporterStockCommun`, `distribuerStockCommun`, `fetchMesDistributions` + types (`Cooperative`, `CooperativeMembre`, `TresorerieTransaction`, `Besoin`, `CooperativeStockItem`, `DistributionRecue`…) |
| **Garde de route croisée** | `types/constants.ts` → `checkRouteAccess` + `CROSS_ROLE_ROUTES` | Un **marchand membre** peut accéder à `/cooperative/stock` (stock commun) ; sinon refus avec `deniedForMissingCooperative: true`. Appliqué par `components/layout/AppLayout.tsx` (l.28-40) |

---

## 6. Rôles et permissions

- **Rôle backend** : `UserRole.COOPERATEUR = 'cooperateur'` (`users/entities/user.entity.ts`, l.22) ; alias UI `cooperative` (`types/constants.ts`, mapping DB → UI).
- **Auto-provisioning** : tout signup `role='cooperateur'` crée automatiquement sa coopérative (`cooperativeName` ou « Coopérative de {Prénom Nom} », `responsable_id = user.id`) — `backend/src/auth/auth.service.ts` l.149-165.
- **RBAC endpoints** : `@Roles('super_admin','admin_general','cooperateur')` uniquement sur `POST /cooperatives` et `PATCH /cooperatives/:id` ; le reste est gardé par `JwtAuthGuard` + logique métier interne.
- **Rôles d'adhésion** (`cooperative_membres.role`) : `president` (l'utilisateur `responsable_id`) et `membre` (chef de groupe possible).
  - **Président seul** : ajouter un membre, chercher un marchand, créer/valider/annuler les transactions de trésorerie, changer statut/rôle, exclure un membre.
  - **Membre** : apporter du stock, distribuer du stock, déposer un besoin, payer sa cotisation, consulter le stock commun et ses distributions.
- **Marchand membre** : accès croisé au stock commun (garde `CROSS_ROLE_ROUTES`), soumission de besoins, cotisation, réception de distributions.
- **Back-office** : `total_cooperatives` au dashboard BO ; les 3 rôles terrain (`marchand/producteur/cooperateur`) sont exclus des stats admin (`admin.service.ts`).

---

## 7. Intégrations croisées avec les autres modules

| Module | Intégration |
|---|---|
| **Marchands** | Adhésion via `rejoindre/:id`, fiche d'identification, ou ajout par le président ; besoins d'achat groupés ; cotisation ; distributions reçues ; flag `estMembreCooperative` (users.entity.ts l.149) pilotant la garde front |
| **Producteurs** | La coopérative **achète** aux producteurs (MarcheHub → `POST /commandes`, négociation, réservation de stock via `stock-reservation.service`) ; `GET /producteurs/recoltes-prevues` calcule la distance Haversine **depuis la commune de la coopérative** du grossiste |
| **Cascade de visibilité marché** (`publications-rest.controller.ts`) | Le **grossiste** republie son offre vers sa coopérative (`POST /publications/republier`, coopérative résolue par `CooperativeResolverService`, notifications `republication_cooperative` aux demi-grossistes) ; le **demi-grossiste** ne voit que `type_marche='cooperative' AND cooperative_id = <coop active>` ; le **coopérateur** voit le marché `u.role IN ('producteur','cooperateur')` (l.69-71). Garde `ROLES_PUBLICATION_MARCHE_PRODUCTEUR` : publier une offre marché producteur est réservé à `producteur`/`cooperateur` |
| **Identification/enrôlement** | `identifications.controller.ts` l.395-418 : si `formData.estMembreCooperative` + `cooperativeId`, crée l'adhésion (`actif=true, role='membre'`) dès l'enrôlement |
| **Scores JULABA** | `scores.service.ts` `batchCooperateur` — score alimenté par `membres_count` et `besoins_traites` ; même source pour `GET /cooperatives/membres` et `GET /scores/me` (testé anti-N+1) |
| **Notifications** | `notifyDistributionStockCommun` (type `stock_commun_recu`, priorité high, catégorie stock) ; `sendToUserIds` (republication) ; `POST /notifications/notify-member` (écran Membres) |
| **Institution** | Même pattern d'auto-provisioning (`institutions.responsable_id`) ; le dashboard institution compte les « Coopératives » |
| **Academy** | Parcours dédié au rôle `cooperative` (module « leader ») |
| **Stock personnel vs commun** | `stocks-rest.controller.ts` traite le `cooperateur` comme un producteur (table `stocks` par `proprietaire_id`) — **deux stockages distincts** (`stocks` personnel / `cooperative_stock` partagé), dette nommée dans `alertes.service.ts` l.60-80 |

---

## 8. Tests et invariants (ce qui est prouvé)

Tous dans `backend/test/invariants/` (harnais PostgreSQL réel + HTTP réel), sauf mention contraire :

| Spec | Invariants couverts |
|---|---|
| **`stock-commun-cooperative.spec.ts`** (389 l.) | ① l'apport incrémente réellement le stock (upsert, pas de doublon) ; ② la distribution décrémente + crée **un mouvement par destinataire** ; ③ tout dépassement (≥ 400) est **refusé sans rien modifier** (jamais de stock négatif) ; ④ **isolation stricte entre 2 coopératives** ; ⑤ chaque destinataire reçoit la **notification `stock_commun_recu`** + une entrée dans `mes-distributions` (pas de fuite inter-membres) ; ⑥ 403 pour un membre sans coopérative |
| **`cooperatives-liste-colonnes.spec.ts`** (158 l.) | `liste` et `ma-cooperative` ne lisent que des colonnes existantes (les 5 colonnes fantômes `marche/responsable_nom/fonction/contact` causaient un 500 bloquant toute adhésion) |
| **`score-membres-cooperative.spec.ts`** (135 l.) | Le `scoreJulaba` de `GET /cooperatives/membres` = celui de `/scores/me` (source unique, sans N+1) |
| **`tresorerie-stock-lecture.spec.ts`** (161 l.) | `GET /cooperatives/tresorerie` et `GET /stocks` ne rendent jamais 500 ; cycle écriture→lecture trésorerie réel |
| **`fuite-champs-sensibles-membres.spec.ts`** (371 l.) | `GET /cooperatives/membres` ne renvoie jamais `passwordHash/pinCodeHash/pinCodeEncryptedIdentificateur/webauthnCredentials/webauthnChallenge` ; `POST /cooperatives` renvoie un 409 propre en cas de doublon |
| **`backend/test/unit/cooperatives-colonnes-reelles.spec.ts`** (110 l.) | Garde-fou unitaire : le SQL émis ne référence aucune colonne fantôme |

⚠️ Homonymie à ne pas confondre : `protection-sociale-cotisations.spec.ts` concerne les cotisations **sociales** (CNPS/CNAM, module protection-sociale), **pas** la cotisation coopérative.

---

## 9. Dette technique et points d'attention du module

1. **Commandes groupées = feature morte** : `GET/POST /cooperatives/commandes-groupees` sont neutralisés (table jamais créée, aucune migration) — réactivation documentée comme « migration #133 ». L'écran `Commandes.tsx` offre pourtant un workflow de commande groupée en 3 étapes côté UI.
2. **`boGetCooperatives` (back-office) appelle `/institutions`** au lieu de `/cooperatives` — héritage à réconcilier (`services/backoffice-api.ts`).
3. **`useScoreJULABA`** référence l'action `daily_collections` vers `/cooperative/achats`, **route inexistante** dans `routes.tsx`.
4. **`ma-cooperative`** lit la dernière adhésion **sans filtre `actif=true`** (dette documentée dans `JULABA_DECISIONS.md`, lot Marche B1) — divergence possible avec le résolveur canonique `cooperative-resolver.service.ts`.
5. **Champs fantômes par contrat** : `marche`/`fonction`/`contact` renvoyés à `NULL` pour préserver le contrat front (aucune source en base) — garde-fou testé (`cooperatives-liste-colonnes.spec.ts`).
6. **Trésorerie déclarative** : la cotisation est enregistrée **sans débit wallet** (aucun lien Keiwa/Bpay) ; la clôture de commande est une « attestation espèces » (`statut_paiement='paye'` sans mouvement wallet), distincte du paiement Keiwa transactionnel de `commandes-rest.controller.ts` (l.190+).
7. **`CooperativeContext.modifierMembre`** modifie l'état local sans synchronisation serveur (marqué « FUTURE: sync »).
8. **Deux stockages de stock** pour le coopérateur (`stocks` personnel + `cooperative_stock` commun) — dette nommée dans `alertes.service.ts` l.60-80.

---

## 10. Documentation interne dédiée

- `docs/PARCOURS.md` §4 « Parcours COOPÉRATIVE » — fil narratif et liste des écrans.
- `docs/RESIDUS.md` §« Distribution stock coopérative » — réparation du stub (tables réelles, `persisted` vérifié, invariants).
- `JULABA_DECISIONS.md` — lot Marche B1 (résolveur unique, garde `ROLES_PUBLICATION_MARCHE_PRODUCTEUR`, audit GPS `cooperatives.commune_id`).
- `docs/INVENTAIRE_RECETTES_V1.md` — module n°6 « Cooperatives : membres, tresorerie, besoins ».
- `docs/adr/ADR-0002-convergence-schema-migrations.md` + `docs/etape4/*` — bascule migrations (mention `cooperative_membres`).
- `docs/dette/REGISTRE-MAITRE.md` — district du test `cooperatives-liste-colonnes`.

---

## 11. Conclusion

Le module coopérative de julaba-app est **fonctionnellement complet et profondément intégré** : gestion d'adhésion avec workflow d'approbation, hiérarchie président/chefs de groupe, trésorerie à double validation, pot commun de stock rigoureux (verrou pessimiste, jamais négatif, notifications post-commit), chaîne besoins→consolidation→dispatch→distribution, marché coopératif avec négociation et cascade de visibilité grossiste→demi-grossiste, et scoring collectif. Sa solidité repose sur **6 invariants exécutés contre un PostgreSQL réel** et un résolveur d'adhésion unique. Ses limites connues et documentées : les commandes groupées neutralisées côté API, la trésorerie déclarative sans lien wallet, et quelques divergences d'héritage back-office — autant d'éléments à connaître avant toute reprise ou réimplémentation du module dans une autre base de code.
