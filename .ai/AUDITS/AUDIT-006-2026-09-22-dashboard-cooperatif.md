# AUDIT #006 — 2026-09-22 — Espace coopérative vs dashboard Back-Office (transformation « vrai dashboard »)

- **Auditeur** : Super Z (Task 125 / MODE-971), à la demande du porteur : « je veux que l'espace coopérative soit un vrai dashboard comme celui de BO, fais l'audit avant »
- **Périmètre** : HEAD `380ae5d` (MODE-970 restauré, origin/main = `ec565d9`) — audit UI/UX + données de l'espace coopérative côté client (`src/components/cooperative/`, `cooperative-store`, routes `GET /api/cooperatives/*`) et anatomie du dashboard BO de référence (`bo-dashboard-screen.tsx`, `backoffice-store`, `/api/backoffice/*`, `bo-layout.tsx`, `bo-ui.tsx`)
- **Méthode** : 2 agents d'exploration en parallèle (espace coopératif / dashboard BO) + relecture de l'auditeur, constats tous cités fichier:ligne
- **Objet** : produire l'écart mesuré entre l'état actuel de l'espace coopérative et un « vrai dashboard » au sens du BO, et le **plan de transformation par phases** qui suit (implémentation à venir : MODE-972+)

**Clés de lecture** : **[FAIT]** = vérifié (fichier:ligne) · **[PLAN]** = proposition du présent audit · **[PORTOR]** = action côté porteur.

---

## 1. Verdict en une phrase

L'espace coopérative est un **ensemble d'écrans de gestion honnêtes** (données 100 % réelles, états vides/erreurs traités, offline-first) mais **pas un dashboard** : 0 graphique, 0 série temporelle, 0 KPI à tendance, 0 skeleton, 0 rafraîchissement automatique, 0 file d'actions structurée — toutes capacités que le dashboard BO possède et dont les briques sont **déjà présentes dans le codebase** (recharts installée, patterns `bo-ui.tsx`, agrégats serveur).

## 2. État actuel de l'espace coopérative [FAIT]

### 2.1 Inventaire des écrans (9 fichiers, `src/components/cooperative/`)

| Fichier | Lignes | Rôle | Contenu actuel |
|---|---|---|---|
| `coop-home-screen.tsx` | 221 | **Accueil président** | Bandeau adhésions en attente (l.75-86) + **4 cartes KPI** (l.119-186) + 4 tuiles navigation (l.191-211) + NotificationsPanel |
| `coop-membres-screen.tsx` | 527 | Membres | Onglets Actifs/Demandes/Suspendus, filtre score, ScoreRing, actions (chef de groupe, suspendre, exclure, accepter/refuser), ajout par téléphone |
| `coop-tresorerie-screen.tsx` | 305 | Trésorerie | Carte héros solde + cotisations (l.125-138), journal des 100 dernières écritures (l.162-227), validation/annulation, modal nouvelle écriture |
| `coop-stock-screen.tsx` | 372 | Pot commun | Apport, liste produits, distribution multi-destinataires (l.314-369) |
| `coop-besoins-screen.tsx` | 413 | Achats groupés | Groupes agrégés, consolidation, dispatch, distribution liée au besoinId |
| `coop-profil-screen.tsx` | 88 | Profil président | Nom/téléphone + carte coopérative |
| `coop-auth-screen.tsx` | 514 | Auth + inscription président | Auto-provisioning compte + coopérative |
| `coop-bottom-bar.tsx` | 71 | Barre basse | 3 onglets + bandeau `syncError` |
| `marchand-coop-screen.tsx` | 626 | « Ma coopérative » côté marchand | 4 états d'adhésion, cotisation, pot commun, besoins, distributions reçues |

### 2.2 Données : réelles, agrégées serveur, mais « instantané » uniquement

- Flux : `useCooperativeStore` (zustand persisté, `cooperative-store.ts:288`) → 7 endpoints GET (`cooperative-store.ts:312-317,361,379`) — **zéro donnée mockée** (contrat « AUCUNE donnée de démonstration », `cooperative-store.ts:12-20`).
- Le `resume` de `GET /api/cooperatives` agrège déjà côté serveur : membres par statut, `soldeTresorerie`, `totalCotisations`, `produitsEnStock`, `articlesEnStock` (`route.ts:62-71`) ; le solde trésorerie est calculé serveur (Σ entrées validées − Σ sorties validées, `src/lib/cooperatives/tresorerie.ts:31-56`) ; les besoins arrivent déjà groupés (`besoins/route.ts:47-60`).
- **Mais tout est cumulatif/snapshot** : aucun endpoint `/api/cooperatives/*` ne renvoie de série temporelle, de delta de période, de top produits ou de répartition. Le compteur `enAttente` de `GET /tresorerie` (`tresorerie/route.ts:48`) n'est **jamais lu** par le front (`cooperative-store.ts:339-341`).

### 2.3 Les 12 écarts mesurés vs « vrai dashboard »

| # | Écart | Preuve coop | Référence BO |
|---|---|---|---|
| 1 | **Aucun graphique** (grep recharts/Chart/sparkline/Progress → 0 dans `cooperative/`) | `src/components/cooperative/` entier | `bo-dashboard-screen.tsx:5-15` (recharts déjà dans package.json:98) |
| 2 | **Aucune série temporelle / évolution** | solde = point unique (`tresorerie/route.ts:50-53`) | `AreaChart` 7 jours (`bo-dashboard-screen.tsx:329-397`, serveur `route.ts:47-66`) |
| 3 | **Aucun KPI « du jour / de la période » ni tendance** (delta, flèches) | `resume` cumulatif (`route.ts:62-71`) | `KpiCard` avec `ArrowUpRight`/`ArrowDownRight` (`bo-dashboard-screen.tsx:128-143`) |
| 4 | **Pas de skeletons** (textes « Chargement… » bruts) | `coop-home-screen.tsx:99-104` | `Skeleton` shadcn par widget (`bo-dashboard-screen.tsx:107-120`) |
| 5 | **Pas de rafraîchissement auto** (boutons manuels seulement) | `coop-tresorerie-screen.tsx:115-121` etc. | chargement orchestré `fetchAllData` (`backoffice-store.ts:1093-1118`) |
| 6 | **Pas de hiérarchie de dashboard** (grille uniforme 2 col., pas de zone héros ni widgets différenciés) | `coop-home-screen.tsx:120-186` | `KpiGrid` + rangées graphes + rangée 3 cartes (`bo-dashboard-screen.tsx:836-855`) |
| 7 | **Données calculées perdues** : `enAttente` trésorerie jamais affiché | `cooperative-store.ts:339-341` | file « À traiter maintenant » avec compteurs (`bo-dashboard-screen.tsx:770-831`) |
| 8 | **Journal trésorerie non filtrable** (ni catégorie/type/période, ni pagination) | `coop-tresorerie-screen.tsx:162-227` | `BoFilterBar` (`bo-ui.tsx:60-71`) |
| 9 | **Pas de journal des mouvements du pot commun** pour le président (apports/distributions historiques invisibles) | `coop-stock-screen.tsx:231-256` ; table `cooperative_stock_mouvements` lue seulement pour le marchand (`ma-cooperative/route.ts:55`) | top/classements datés (`bo-dashboard-screen.tsx:399-462`) |
| 10 | **Agrégation dupliquée client+serveur** (besoins recalculés localement en plus de l'agrégat serveur) | `coop-besoins-screen.tsx:52` vs `besoins/route.ts:47-60` | mapping défensif unique (`backoffice-store.ts:555-601`) |
| 11 | **Score JULABA sans décomposition ni historique** (anneau seul, `{score, niveau}`) | `coop-home-screen.tsx:155-165` ; `api/scores/me/route.ts:37,58` | anneaux qualité avec seuils et verdict (`bo-dashboard-screen.tsx:464-528`) |
| 12 | **Pas de layout/en-tête commun** (habillage gradient + header recopiés dans 6 écrans) | `coop-home-screen.tsx:48-72`, `coop-membres-screen.tsx:219-239`, etc. | `BoPageHeader`/`BoErrorBanner`/`BoEmptyState`/`BoStatCard` (`bo-ui.tsx:19-181`) |

## 3. Anatomie du modèle BO — ce qui en fait un « vrai dashboard » [FAIT]

`bo-dashboard-screen.tsx` (859 l.), de haut en bas :

1. **En-tête + bannière d'erreur réessayable** (`BoPageHeader` l.760-763, `BoErrorBanner` l.766).
2. **File d'actions « À traiter maintenant »** (l.770-831) : devoirs réels (dossiers en attente, alertes non acquittées) avec CTA de résolution — le dashboard est un **plan de travail**, pas juste des stats.
3. **Grille de 4 cartes KPI** avec tendance (l.836, `KpiCard` l.103-151 : valeur, flèche vert/rouge, icône colorée, sous-ligne contextuelle).
4. **Rangée de 2 graphiques recharts** (l.839-842) : `BarChart` horizontal régions (l.258-327) + `AreaChart` tendance 7 jours (l.329-397).
5. **Rangée de 3 cartes** (l.845-849) : objectif vs réalisé (Progress animé), santé système, qualité des données (3 anneaux SVG).
6. **Dernière rangée** : top 5 classé (médailles, l.399-462) + accès rapides drill-down (`boNavigate`, l.622-677).
7. **États** : skeletons par widget, loader pleine page, états vides par carte, **erreurs par domaine indépendantes** (`fetchAllData` en `Promise.allSettled`, `backoffice-store.ts:1093-1118`).
8. **Serveur** : un endpoint dédié (`/api/backoffice/route.ts`, 155 l.) avec garde RBAC, 4 lectures parallèles, agrégats calculés côté Node, série 7 jours en bornes ISO jour par jour (l.47-66), top 5 group-by JS, qualité en %, santé/cible lues en config DB.

**Anti-patterns du BO à NE PAS répliquer** (limites documentées §6 de l'anatomie) : ticker « temps réel » dérivé du snapshot (pas un vrai flux, `backoffice-store.ts:1077-1082`) ; `SYSTEM_SERVICES` codé en dur (`bo-layout.tsx:50-55`) ; **couleurs hardcodées + ternaires `isDark`** au lieu des jetons sémantiques (l.87, 109, 123…) ; pas de sélecteur de période propagé à l'API (7 jours fixés, `route.ts:50`) ; pas de cache ni refresh auto.

## 4. Réutilisabilité mesurée [FAIT]

**Directement réutilisable** :
- `recharts` ^2.15.4 déjà installée (package.json:98) et éprouvée dans 6 écrans BO.
- Les patterns de `bo-ui.tsx` : `BoPageHeader`, `BoErrorBanner`, `BoEmptyState`, `BoStatCard`, `BoFilterBar` (l.19-181) — à **décliner en primitives `Coop*`** aux jetons design coop (`COOP_COLOR` #2072AF, `design-tokens.ts:38`), pas à importer tel quel (couleurs BO hardcodées).
- Le pattern d'orchestration déjà porté côté coop : `sectionsEnErreur` + chargement par sections (`cooperative-store.ts:180-182,299-347`) — équivalent fonctionnel des erreurs par domaine BO.
- Les widgets BO **extraits et paramétrés par props** : `KpiCard`/`KpiGrid` (l.103-201), `RegionChart`/`EnrolmentTrendChart` (l.258-397), anneaux (l.464-528), classement (l.399-462), tuiles d'accès rapide (l.622-677).
- L'endpoint modèle : `/api/backoffice/route.ts` (garde → lectures parallèles → agrégat unique) ; et `/api/backoffice/cooperatives/stats/route.ts:21-75` qui calcule déjà des agrégats coopératifs (coops actives, membres actifs, trésorerie Σ, besoins par statut) — base de travail directe.
- Sémantique métier partagée : `src/lib/cooperatives/tresorerie.ts` (solde), `agregation.ts` (groupes de besoins), `regles.ts`.

**Couplé au BO, à ne pas réutiliser** : auth/RBAC BO (`requireBackofficePermission`, `BoGate`), tables `legacy_bo_*`, `BoCommandPalette`/`SIDEBAR_GROUPS`, thème à ternaires `isDark`.

## 5. Plan de transformation par phases [PLAN]

> Objectif : transformer `coop-home` en **vrai dashboard** au sens BO, sans rien casser du contrat actuel (données 100 % réelles, offline-first, gardes serveur). Chaque phase est un Task/MODE committable indépendamment avec gates verts.

### Phase 1 — Fondation données : endpoint d'agrégation dashboard (effort M, P1)

- **Nouveau `GET /api/cooperatives/dashboard?cooperateurId=`** (garde `requirePresident` existante, `resolver.ts:82`) — UN aller-retour, calqué sur le pattern MODE-935 (agrégat unique) :
  - `resume` actuel (membres par statut, solde, cotisations, pot commun) ;
  - **séries temporelles 7/30 jours** : entrées/sorties/cotisations par jour depuis `cooperative_transactions` (bornes ISO jour par jour, comme `route.ts:47-66` BO) ;
  - **KPI de période avec delta** vs période précédente (membres gagnés, trésorerie nette, cotisations) ;
  - **top produits du pot commun** (par quantité) + **mouvements récents** (10 derniers apports/distributions — résout l'écart #9) ;
  - **file d'actions** : adhésions en attente, écritures en attente (le compteur existant, écart #7), besoins `en_attente` à dispatcher.
- Test harnais complet (pattern MODE-970 : garde, filtres, agrégats, sanitisation, 500 uniforme).

### Phase 2 — Fondations UI : layout + primitives coop (effort M, P2)

- **`CoopScreenShell`** (layout commun : gradient, header, cloche, erreurs par section) éliminant la duplication des 6 écrans (écart #12).
- Primitives `src/components/ui/coop/` : `CoopPageHeader`, `CoopErrorBanner`, `CoopEmptyState`, `CoopStatCard`, `CoopSkeleton` — déclinées de `bo-ui.tsx` mais **aux jetons design coop** (pas de ternaires `isDark`, pas de hex BO).
- Store : extension `cooperative-store` (`fetchDashboard`, erreurs par domaine, période `7j|30j`, `derniereMiseAJour`).

### Phase 3 — Widgets du dashboard (effort M/L, P2)

Réécriture de `coop-home-screen.tsx` en grille hiérarchisée (écart #1-#3, #6) :
1. Zone héros : salutation + **file « À traiter »** (CTA drill-down vers membres/trésorerie/besoins — écart #7) ;
2. **KpiGrid** 4 cartes avec tendance fléchée (membres actifs ±N, trésorerie nette période, cotisations période, pot commun) ;
3. **Rangée graphes recharts** : `AreaChart` trésorerie 7/30 j (palette COOP) + `BarChart` horizontal top produits du pot commun ;
4. Rangée : objectif de cotisations (cible configurable — lire en config coop si disponible, sinon constante `regles.ts` affichée honnêtement) + ScoreRing coop conservé avec sous-lignes contextuelles ;
5. Accès rapides avec compteurs réels (4 tuiles actuelles transformées en drill-down).

### Phase 4 — Polish & garde-fous (effort S, P3)

- Bouton refresh global + « mise à jour il y a X min » ; les écrans internes (membres/trésorerie/stock/besoins) héritent de `CoopScreenShell` + skeletons (écart #4, #5).
- Filtres du journal trésorerie (catégorie/type/période — écart #8) ; suppression de l'agrégation dupliquée des besoins (écart #10).
- Voix Tata : phrase de synthèse dashboard dans `COOP_SCREEN_VOICE` (absorbe l'item voix de DET-COOP-011).
- Tests : harnais route dashboard + tests widgets + `tsc/eslint/build`.

**Effet attendu** : l'écart #11 (décomposition du score) reste hors périmètre immédiat (chantier score séparé) ; les items écran-par-écran de DET-COOP-011 sont partiellement absorbés (KPI, voix, filtres) — croiser à l'implémentation.

## 6. Risques & garde-fous de la transformation [PLAN]

1. **Honnêteté des données** : le contrat « AUCUNE donnée de démonstration » (`cooperative-store.ts:12-20`) s'applique aux widgets — zéro valeur inventée, états vides explicites (le BO affiche parfois des configs par défaut, on ne les réplique pas).
2. **Offline-first** : le dashboard est une vue agrégée online ; hors connexion, conserver les données persistées du store + bandeau `syncError` existant (`coop-bottom-bar.tsx:34-46`), jamais d'écran bloquant.
3. **Garde serveur** : l'endpoint dashboard passe par `requirePresident` (session appareil + responsabilité coop) — jamais d'id de coopérative accepté du client (invariant figé par MODE-970).
4. **Sanitisation** : l'agrégat ne doit embarquer aucune donnée marchand sensible (contrat anti-hash figé par le harnais membres).
5. **Budget de rendu** : mobile d'abord (bottom bar, écrans 2 col.) — les grilles BO xl:4/xl:2 se déclinent en `grid-cols-2` compact + charts hauteur réduite ; recharts est lourde : ne l'importer QUE dans les écrans dashboard (les écrans gestion restent légers).
6. **Performance données** : les séries 7/30 jours se calculent sur `cooperative_transactions` indexée par `cooperative_id` — borner les lectures (compteurs head-count comme au BO) et documenter le coût ; pas de N+1 (pattern batché MODE-932).

## 7. Conclusion

Le gap est réel mais **entièrement comblable avec les briques existantes** : recharts installée, patterns `bo-ui.tsx` à décliner, orchestration par sections déjà en place, agrégats serveur partiellement présents. La pièce manquante décisive est la **Phase 1 serveur** (endpoint d'agrégation avec séries et deltas) : sans elle, aucun widget de tendance ne peut être honnête. L'ordre des phases ci-dessus est donc contraignant : 1 → 2 → 3 → 4, chaque phase committable et testable indépendamment.
