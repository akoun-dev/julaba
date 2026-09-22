# AUDIT #007 — 2026-09-22 — Shell de gestion coopératif : de « un vrai dashboard » à « une interface de gestion complète »

- **Auditeur** : Super Z (Task 127 / MODE-973), à la demande du porteur : « C'est pas que le dashboard mais l'interface, sidebar et autre aussi, ce qui manque en vrai pour une gestion complète »
- **Périmètre** : HEAD `d2a84a4` (MODE-972 livré, 3 commits locaux) — complément d'AUDIT-006. Là où AUDIT-006 comparait l'écran d'accueil coopératif au **dashboard** BO, le présent audit compare l'**architecture de navigation et le shell de gestion** : sidebar, header, router d'écrans, palette de commandes, permissions, badges, sous-écrans (drill-down), offline des décisions de gestion.
- **Méthode** : 2 agents d'exploration en parallèle (shell BO / espace coopérative intégrale) + relecture de l'auditeur, constats cités fichier:ligne
- **Objet** : mesurer l'écart entre la navigation coopérative actuelle (bottom bar 3 onglets) et une interface de gestion complète au sens du BO, et proposer le **plan révisé** qui étend AUDIT-006 (les phases 2-4 y sont reformulées et complétées par les phases 5-6)

**Clés de lecture** : **[FAIT]** = vérifié (fichier:ligne) · **[PLAN]** = proposition du présent audit · **[PORTOR]** = décision du porteur.

---

## 1. Verdict en une phrase

L'espace coopérative est une **suite d'écrans reliés par une barre basse de 3 onglets** — chaque écran est honnête, mais le **système de gestion** est absent : aucun accès direct aux 3 modules clés (2 taps), aucun badge de comptage, aucun sous-écran de détail (pas de fiche membre), aucune recherche transversale, aucun rechargement à l'entrée d'écran, et les décisions du président (valider, suspendre, dispatcher) sont les SEULES écritures hors file offline — tout ce que le BO structure via sa sidebar groupée, son router à garde, ses badges et son store de navigation dédié.

## 2. Le modèle BO — anatomie du shell de gestion [FAIT]

### 2.1 Navigation à deux niveaux
- **Niveau 1 (shell)** : `app-store.currentScreen` décide QUEL shell rendre (`ScreenRouter`, page.tsx:396-398) — pour le BO, `BoGate` → `BoLayout → BoScreenRouter` (page.tsx:147-168).
- **Niveau 2 (écran interne)** : `backoffice-store.boCurrentScreen` + `boNavigate` (backoffice-store.ts:264, 643) — navigation 100 % par état, zéro URL. Persistance partielle : `sidebarCollapsed`, `boCurrentScreen`, `boTheme` ; **jamais** `boUser`/`boUserRole` (revalidation serveur `checkBoSession` au réhydratage, backoffice-store.ts:1460-1483).

### 2.2 Sidebar et permissions
- `SIDEBAR_GROUPS` : 5 groupes / 29 items (pilotage, opérations, finance, contenus-com, administration) ; `SIDEBAR_ITEMS` dérivé par `flatMap` (backoffice-store.ts:1583-1643). `ADMINISTRATION_ITEMS` (10 items) séparée, exposée via le **hub** `bo-administration` (1 seul item sidebar, backoffice-store.ts:1563-1574, 1636-1640).
- Icône = **string** sérialisable + `IconProxy` (bo-icon-proxy.tsx:48-60). `SidebarItem { id, label, icon, badge? }` (backoffice-store.ts:1547-1552).
- **Matrice de permissions unique client+serveur** : `backoffice-permissions.ts` (MODULE_LIST 38 modules, MODULE_ACCESS par rôle, ROLE_HIERARCHY) importée à la fois par le store UI et le guard API (backoffice-permissions.ts:1-4, 131-133) — `hasSidebarItemAccess` (backoffice-store.ts:1576-1581) ; groupe invisible si aucun item accessible (bo-layout.tsx:333-335).
- Sidebar desktop 260/68 px réductible avec tooltips, drawer mobile `inert`/`aria-hidden`, indicateur d'actif animé, badges cap 99+ (bo-layout.tsx:330-430, 57-120).

### 2.3 Router d'écrans à garde
- `bo-screen-router.tsx` : switch de 39 cas, **garde `isScreenAccessible`** → `AccessDeniedScreen` si le rôle ne couvre pas le module (l.55-86), transition animée par `key={boCurrentScreen}` (l.181-185). Icônes/lazy : 39 imports statiques (dette documentée).

### 2.4 Header, badges, recherche, statut
- Header : logo + **titre de l'écran courant** (bo-layout.tsx:167-169, 189), recherche ouvrant la palette (desktop : barre + `Ctrl K` ; mobile : bouton dédié, l.193-235), toggle thème avec `aria-pressed` (l.238-247), **cloche notifications** avec pastille des alertes non acquittées (l.250-284), menu utilisateur avec confirmation de déconnexion (l.287-324, 463-484).
- **Badges dynamiques calculés dans le layout** : `pendingEnrolments` → badge de l'item enrôlement (bo-layout.tsx:152, 162-165) ; `unacknowledgedAlerts` → cloche (l.153, 258-262).
- **Palette cmdk Ctrl+K** (bo-command-palette.tsx) : 5 sources (navigation, administration, acteurs, enrôlements en attente, zones) + action cross-écran `searchIn` qui pose la requête dans le store AVANT de naviguer (l.55-59).
- Footer statut (ticker, services) — **anti-pattern à ne pas répliquer** : ticker partiellement factice (`transactionsPerMin` codé 0, `uptime` cassé car l'API renvoie un tableau, backoffice-store.ts:1078-1080) et `SYSTEM_SERVICES` hardcodé (bo-layout.tsx:50-55).

### 2.5 Discipline de chargement
- Erreurs **par domaine** (`BoErrorDomain`, backoffice-store.ts:208, 271-277) rendues par `BoErrorBanner` dans **37 écrans** ; `fetchAllData` en `Promise.allSettled` **pré-gaté par rôle** (l.1093-1118) ; mutations optimistes avec rollback ; pagination serveur pour les gros volumes.

## 3. État actuel de la navigation coopérative [FAIT]

### 3.1 Carte actuelle
```
RÔLE cooperateur (président)
└─ login unifié (ou coop-auth repli/inscription)
   └─ coop-home (onglet 1)
      ├─ coop-membres  (onglet 2)
      ├─ coop-tresorerie ── 2 taps (via menu accueil)
      ├─ coop-stock       ── 2 taps
      ├─ coop-besoins     ── 2 taps
      └─ coop-profil      (onglet 3)
RÔLE marchand (membre) → 'ma-cooperative' (+ coop-stock via « Voir le stock commun »)
```
7 routes coop + `ma-cooperative` (app-store.ts:75-87) ; détection par préfixe `coop-` (page.tsx:119, 417-423) ; switch interne dans page.tsx (l.248-265). La barre basse s'affiche pour `userRole === 'cooperateur'` (page.tsx:521).

### 3.2 Les 16 écarts « gestion complète » (série G — croisés avec les 12 d'AUDIT-006)

| # | Écart | Preuve coop | Référence BO | Croisement A006 |
|---|---|---|---|---|
| G1 | **Navigation en 3 onglets seulement** — trésorerie/stock/besoins à 2 taps, invisibles dans la barre | `coop-bottom-bar.tsx:22-26` ; menu accueil `coop-home-screen.tsx:40-45,191-211` | 29 items groupés en sidebar | — |
| G2 | **Aucun badge de comptage** dans la navigation — le président doit ouvrir chaque écran pour savoir s'il y a du travail | bottom-bar sans badge (`coop-bottom-bar.tsx:22-26`) | badge enrôlement + cloche (bo-layout.tsx:162-165, 258-262) | #7 |
| G3 | **Aucun sous-écran de détail** : pas de fiche membre (cotisations individuelles, historique), pas de détail écriture/besoin/mouvement ; l'union ne contient que 7 routes de 1ᵉʳ niveau | app-store.ts:75-87 ; tout en cartes aplaties (`coop-membres-screen.tsx:334`) | drill-down par fiche, `openActorDetail` cross-écran | — |
| G4 | **Pas de recherche transversale** — recherche membre locale à un écran | `coop-membres-screen.tsx:59-73,242-253` | palette cmdk 5 sources + `searchIn` | — |
| G5 | **Pas de store de navigation dédié** : la coop emprunte `currentScreen` global (partagé avec toute l'app) ; pas de `previousScreen` coop ; `goBack` et `isAuthScreen` ignorent `coop-auth` | app-store.ts:135-137, 249-262, 443, 252 | `boCurrentScreen` + `boNavigate` dédiés | — |
| G6 | **Pas de garde de session à l'entrée UI** : un `isAuthenticated` persisté suffit à monter l'espace ; la session serveur n'est jamais revalidée au montage (le re-claim réseau renvoie `null` pour cooperateur) ; les 403 expirés rendent des écrans vides sans re-login guidé | page.tsx:417-423 ; capacitor-provider.tsx:56-60 | `BoGate` session confirmée (page.tsx:147-168) | — |
| G7 | **Rechargement incohérent** : membres et trésorerie n'ont AUCUN chargement au mount — ils dépendent de l'accueil ou du bouton refresh (données possiblement périmées en navigation directe) | grep useEffect : home:36, stock:52, besoins:45, marchand-coop:59 seulement | chaque widget/fetch orchestré par `fetchAllData` | #5 |
| G8 | **`sectionsEnErreur` sous-exploité** : rempli par le store mais consommé uniquement par l'accueil — sur membres/trésorerie/stock/besoins, l'erreur d'une section est silencieuse | `cooperative-store.ts:329-349` vs `coop-home-screen.tsx:90-98` seul consommateur | `BoErrorBanner` dans 37 écrans | — |
| G9 | **Offline asymétrique — les décisions de gestion sont hors file** : valider/annuler une écriture, suspendre/exclure/chef de groupe, dispatcher un besoin = PATCH/DELETE en fetch nu SANS `syncOrQueue` (impossible hors connexion, sans feedback) | `cooperative-store.ts:411-476, 494-517, 588-642` vs file only sur transaction/apport/besoin/adhésion/cotisation (483-487, 529-533, 569-573, 646-649, 661-665) | mutations optimistes + rollback (backoffice-store.ts:1215-1237…) | — |
| G10 | **Pas d'état de sélection persistant** (fiche/besoin ouverts en `useState` de modale → retour Android = perte de contexte, impossible de partager un lien de détail) | modales partout (ex. `coop-stock-screen.tsx:314-369`) | `openActorDetail` + `actorDetailRequestId` | — |
| G11 | **Habillage dupliqué 7×** (gradient + header + bouton refresh recopiés) | coop-home:48-72, membres:219-239, tresorerie:109-122, stock:166-192, besoins:161-174, profil:30-34, marchand-coop:207-227 | `BoPageHeader`/`bo-ui.tsx` | #12 |
| G12 | **Pas de thème sombre** pour la coop (`darkRole = false` forcé) ; gradient clair hardcodé ; le `dark:` de la barre basse est du CSS mort | page.tsx:353-377 ; `coop-bottom-bar.tsx:47` | `boTheme` + sync `<html>` (backoffice-store.ts:1434-1444) | — |
| G13 | **Listes non paginées ni virtualisées** : tous les membres rendus d'un coup ; journal « 100 dernières » silencieusement tronqué ; modal distribution liste tous les membres sans recherche (pénalisant > ~15 membres) | `coop-membres-screen.tsx:334` ; `coop-tresorerie-screen.tsx:163` ; `coop-stock-screen.tsx:327-354` | pagination serveur `fetchMore*` | #8 |
| G14 | **Modules de gestion inachevés** : trésorerie sans filtre type/catégorie/statut/période ni export ; besoins sans filtre statut ni détail (qui a demandé quoi) ; stock sans journal des mouvements (le dashboard serveur renvoie déjà `mouvementsRecents`, jamais affiché) ; score JULABA sans décomposition ni historique | `coop-tresorerie-screen.tsx:162-227` ; `coop-besoins-screen.tsx:274-314` ; `coop-stock-screen.tsx:231-256` | filtres `BoFilterBar`, classements datés | #8, #9, #11 |
| G15 | **Profil minimal** : aucune préférence (notifications partagées non montées), aucune gestion de la coopérative (renommage, second président), pas de sous-écran paramètres | `coop-profil-screen.tsx:88 l. total` | `ADMINISTRATION_ITEMS` + hub | — |
| G16 | **Endpoint dashboard déjà livré jamais consommé** + `enAttente` trésorerie toujours ignoré + `scoreJulaba` coop non persisté (anneau à 0 au redémarrage) | dashboard/route.ts:59-90 (tests only) ; `cooperative-store.ts:339-341, 678-690` | store alimente shell ET widgets | #7 |

## 4. Briques réutilisables [FAIT]

**À répliquer tel quel (la mécanique, pas les données)** :
1. **Matrice de permissions unique client+serveur** (backoffice-permissions.ts) — décliner en grille par rôle coop (président/trésorier/secrétaire si le métier le demande, sinon président seul = garde existante).
2. **Formes `SidebarItem`/`SidebarGroup` + icônes string + `IconProxy` + `SIDEBAR_ITEMS = GROUPS.flatMap()`** + **hub méta-écran** ( Administration → parfait pour un hub « Gestion » coop : stock, besoins, paramètres, journal).
3. **Persistance partielle + jamais d'identité persistée + revalidation au réhydratage** (`partialize` backoffice-store.ts:1460-1483) → `CoopGate` léger (non bloquant offline, cf. garde-fou #2).
4. **Router à garde + transition `key`** (bo-screen-router.tsx:55-86, 181-185) → `CoopScreenRouter` avec routes de détail.
5. **Palette cmdk + `searchIn` cross-écran** (bo-command-palette.tsx:55-59) — adaptée en bottom-sheet mobile.
6. **Sélecteurs atomiques** (217 usages, codemod S-14) + **erreurs par domaine** + `Promise.allSettled` pré-gaté.
7. **Primitives `bo-ui.tsx`** — déclinées en `Coop*` aux jetons COOP (#2072AF, design-tokens.ts:38) — déjà planifié AUDIT-006 Phase 2.

**À NE PAS répliquer** : ticker/services factices (§2.4), ternaires `isDark` hardcodés (passer par jetons), imports statiques de 39 écrans (utiliser `next/dynamic` dès le départ pour la coop), double navigation divergente app-store/bo-store (bo-layout.tsx:314 appelle `navigate` sans `boNavigate` — bug de cohérence à ne pas importer).

## 5. Plan révisé [PLAN] — remplace les phases 2-4 d'AUDIT-006

> Contraintes mobile-first (Capacitor) : cibles ≥ 44 px, `min-h-dvh pb-24`, safe-area, retour matériel Android, réseau coûteux (agrégat unique), recharts uniquement dans les écrans dashboard.

### Décision de navigation à trancher [PORTOR] — 3 options
- **Option A — « bottom bar 5 onglets »** : Accueil · Membres · Trésorerie · Gestion (hub stock+besoins+journaux) · Profil, avec badges. Simple, natif mobile, mais la Gestion devient un hub de plus.
- **Option B — « drawer hamburger »** : header avec bouton menu ouvrant un drawer groupé (comme la sidebar mobile du BO) au-dessus d'une bottom bar réduite à 3 onglets. Plus proche du BO, mais 2 mécaniques de navigation.
- **Option C — hybride adaptatif (recommandée)** : bottom bar 5 onglets avec badges sur mobile + **drawer « Menu »** reprenant l'anatomie de la sidebar BO (groupes, badges, hub Gestion) pour les sous-écrans et journaux ; sur écran large (lg+, ex. web/PWA), la sidebar permanente s'affiche comme au BO. Une seule source de vérité : `SIDEBAR_GROUPS`-like `COOP_NAV_GROUPS` consommée par les trois surfaces.

### Phase 2 révisée — Shell & fondations (M, P1)
1. **`CoopScreenShell`** + primitives `Coop*` aux jetons COOP (absorbe G11 / A006 #12) : header (titre dynamique, recherche, cloche notifications existante, menu utilisateur), conteneur, erreurs par section.
2. **Store de navigation coop** (`cooperative-store` ou `coop-nav` léger) : union `CoopScreenRoute` étendue (G3, G5) — `coop-membre-detail`, `coop-journal-tresorerie`, `coop-mouvements-stock`, `coop-parametres`, `coop-gestion` (hub) — + corrections `goBack`/`isAuthScreen` pour `coop-auth` + pile de retour Android.
3. **`CoopGate` léger** (G6) : revalidation session serveur au montage de l'espace (silencieuse, non bloquante hors ligne — en cas de 403 : déconnexion guidée vers coop-auth).
4. **Store : `fetchDashboard` + `periode '7j'|'30j'` + `badgeCounts`** dérivés de `fileActions` + mapping enfin de `enAttente` trésorerie + persistance de `scoreJulaba` (G16, G2).
5. **Chargement au mount systématique** de chaque écran + affichage de `sectionsEnErreur` par écran (G7, G8).

### Phase 3 — Dashboard (inchangée, AUDIT-006) + navigation (M, P1→P2)
1. Widgets recharts : héros « À traiter » (fileActions), KpiGrid tendances, AreaChart 7/30 j, top produits, accès rapides avec compteurs réels.
2. **Bottom bar élargie 5 onglets avec badges** + **drawer/sidebar adaptative** alimentées par `COOP_NAV_GROUPS` (selon option tranchée).

### Phase 4 — Écrans de gestion complète (M/L, P2)
1. **Fiche membre** (G3) : détail drill-down — identité, adhésion, cotisations individuelles, distributions reçues, score, sanctions ; actions contextuelles (chef/suspendre/exclure) ; état de sélection persistant (G10).
2. **Journal trésorerie** (G13, G14) : filtres type/catégorie/statut/période + pagination « charger plus » (extension endpoint ou paramètre `avant=`).
3. **Journal mouvements pot commun** (G14/A006 #9) : données `mouvementsRecents` + page dédiée.
4. **Besoins** : filtre statut, détail besoin (demandeurs), suppression de l'agrégat dupliqué (A006 #10).
5. **Paramètres coop** (G15) : préférences de notifications (composant shared existant), informations coopérative.

### Phase 5 — Robustesse (M, P2)
1. **Offline des décisions de gestion** (G9) : étendre `syncOrQueue`/idempotence `clientId` aux PATCH/DELETE (validation écriture, sanctions, dispatch) avec feedback file — les actions président sont critiques.
2. **Recherche transversale** (G4) : bottom-sheet cmdk (membres, besoins, produits, navigation) + `searchIn` coop.

### Phase 6 — Polish (S, P3)
1. Thème sombre coop aux jetons (G12) — optionnel, décision porteur ; voix Tata synthèse dashboard (A006 #11 hors périmètre, chantier score séparé).
2. `next/dynamic` pour les écrans recharts ; virtualisation des listes si le volume l'exige.

## 6. Garde-fous de la transformation [PLAN]

1. **Honnêteté des données** : les badges/journaux affichent des compteurs réels (`fileActions`, `enAttente`) — jamais de chiffre décoratif (leçon du ticker BO §2.4).
2. **Offline-first non régressif** : `CoopGate` non bloquant hors ligne ; l'élargissement de la file ne casse pas le contrat `synced|queued|lost` (cooperative-store.ts:15-18) ; bandeau `syncError` conservé.
3. **Garde serveur inchangée** : `requirePresident` reste la seule autorité ; les nouvelles routes (détail membre, journal paginé) passent par le résolveur, jamais d'id de coop accepté du client.
4. **Sanitisation** : les fiches membre enrichies restent hors tables de comptes (contrat figé par MODE-970).
5. **Budget de rendu mobile** : bottom bar ≤ 5 onglets, recharts importé uniquement dans le dashboard, pagination « charger plus » plutôt que tableaux.
6. **Une seule source de navigation** : `COOP_NAV_GROUPS` unique consommée par bottom bar, drawer et (futur) hub — la divergence app-store/bo-store du BO (§4 point 8) n'est pas importée.

## 7. Conclusion

L'écart « gestion complète » est structurel, pas cosmétique : il manque à la coopérative **le shell** (navigation riche, badges, garde, shell commun) et **les sous-écrans** (fiche membre, journaux, filtres, paramètres) — soit exactement les deux couches que le BO a construites et dont les patterns sont documentés ici avec leurs pièges. La Phase 1 données (MODE-972) est déjà en place ; l'exécution peut démarrer par la Phase 2 révisée dès que l'option de navigation (A/B/C) est tranchée.
