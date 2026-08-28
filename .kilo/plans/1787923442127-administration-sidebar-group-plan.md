# Vue dédiée Administration

## Objectif

Remplacer la catégorie `Administration` de la sidebar par une véritable entrée de navigation `Administration`. Son clic ouvre une vue dédiée présentant les modules administratifs autorisés sous forme de cartes/liens. Les écrans existants restent accessibles via leurs routes actuelles, mais ne sont plus affichés comme entrées séparées dans la sidebar.

## Décision confirmée

`Administration` devient une page BO dédiée avec une vue de synthèse et les accès aux huit modules suivants :

- `Utilisateurs BO`
- `Institutions`
- `Config Institution`
- `Audit`
- `API Keys`
- `Monitoring IA`
- `Event Monitor`
- `Cron Dashboard`

Les libellés, icônes, fonctionnalités et droits existants sont conservés exactement. La nouvelle route est uniquement une route d’accueil/navigation pour ce regroupement.

## État vérifié

- `SIDEBAR_GROUPS` contient actuellement une catégorie `Administration` avec cinq enfants et une catégorie `Système` avec trois enfants.
- `SIDEBAR_ITEMS` est dérivé des groupes et alimente aussi le libellé courant du header.
- `BoScreenRouter` possède déjà les routes et écrans des huit modules.
- `MODULE_LIST` et `MODULE_ACCESS` portent les permissions par module; elles ne doivent pas être modifiées.
- La sidebar desktop est groupée, tandis que le menu mobile reproduit également les groupes; les deux rendus devront afficher une seule entrée `Administration`.

## Décisions d’implémentation

1. Ajouter `bo-administration` à `ScreenRoute` dans `src/lib/stores/app-store.ts` et à `BoScreenRoute` dans `src/lib/stores/backoffice-store.ts`.
2. Créer `src/components/backoffice/bo-administration-screen.tsx` comme vue dédiée.
3. Ajouter un cas `bo-administration` dans `bo-screen-router.tsx`.
4. Exporter une liste stable `ADMINISTRATION_ITEMS` contenant les huit objets d’entrée existants, sans changer leurs ids, labels ou icônes.
5. Remplacer les huit enfants de la sidebar par un seul item `{ id: 'bo-administration', label: 'Administration', icon: 'Settings' }`.
6. Supprimer les catégories `Administration` et `Système` en tant que groupes de sidebar; conserver leurs entrées dans `ADMINISTRATION_ITEMS` pour la vue dédiée.
7. La visibilité de l’entrée `Administration` dépend de `ADMINISTRATION_ITEMS.some(item => hasModuleAccess(role, module))`; aucun nouveau rôle ou droit n’est créé.
8. La vue dédiée filtre ses cartes avec `hasModuleAccess`, de sorte qu’un rôle ne voit que les modules auxquels il a déjà accès.
9. Une carte de la vue dédiée appelle `boNavigate(item.id)` et conserve donc chaque route existante.
10. Les écrans enfants restent dans `BoScreenRouter` et dans les unions de routes pour préserver navigation directe, persistance et états actifs.
11. Le libellé du header doit résoudre correctement `Administration` et chacun des huit écrans enfants, même si les enfants ne sont plus des items de sidebar. Utiliser la liste dédiée et la route Administration comme source de libellés.
12. Le menu desktop réduit et le menu mobile affichent uniquement l’entrée `Administration` avec son état actif; aucune liste d’enfants ne doit apparaître dans la sidebar.

## Vue Administration

Structure attendue :

```text
Administration
Gérez les paramètres, les accès et les outils système de la plateforme.

┌ Utilisateurs BO ┐ ┌ Institutions ┐ ┌ Config Institution ┐
├ Audit           ┤ ├ API Keys     ┤ ├ Monitoring IA      ┤
├ Event Monitor   ┤ ├ Cron Dashboard ┤
```

- Utiliser le style visuel BO existant, le thème clair/sombre piloté par `boTheme` et les icônes Lucide.
- Utiliser des cartes accessibles comme boutons ou liens d’action, avec `aria-label` si nécessaire.
- Afficher un état vide/permission si aucun module n’est autorisé, sans exposer d’actions interdites.
- Ajouter `screen-enter` au conteneur de l’écran.
- Ne pas créer de nouvelle API ni de nouvelle persistance.

## Fichiers concernés

### `src/lib/stores/app-store.ts`

- Ajouter uniquement `bo-administration` à `ScreenRoute`.
- Ne pas modifier les routes existantes ni les règles de réhydratation hors ajout de la nouvelle route protégée.

### `src/lib/stores/backoffice-store.ts`

- Ajouter uniquement `bo-administration` à `BoScreenRoute`.
- Extraire/exporter `ADMINISTRATION_ITEMS` avec les huit entrées existantes.
- Remplacer les deux groupes actuels par l’item sidebar `Administration`.
- Ajouter un helper d’accès dédié si nécessaire, basé exclusivement sur `hasModuleAccess` des huit modules.
- Ne modifier ni `MODULE_LIST`, ni `MODULE_ACCESS`, ni les actions de données.

### `src/components/backoffice/bo-administration-screen.tsx`

- Créer la vue de synthèse avec les cartes filtrées par rôle.
- Naviguer vers les routes enfants existantes via `boNavigate`.
- Couvrir thème clair/sombre, responsive, état vide et focus clavier.

### `src/components/backoffice/bo-screen-router.tsx`

- Importer et rendre `BoAdministrationScreen` pour `bo-administration`.
- Ne supprimer aucun cas de route existant.

### `src/components/backoffice/bo-layout.tsx`

- Rendre le nouvel item Administration dans les versions desktop et mobile.
- Conserver `boCurrentScreen` pour l’état actif.
- Corriger la résolution du titre courant pour les pages enfants retirées de la sidebar.
- Conserver la fermeture du menu mobile après navigation.

## Cas de vérification

- `super_admin` voit une seule entrée `Administration` dans la sidebar et les huit cartes dans la vue.
- Les autres rôles voient une seule entrée `Administration` si au moins un des huit modules leur est accessible.
- Chaque rôle ne voit dans la vue que ses cartes autorisées.
- Aucun libellé `Système` ne reste dans la sidebar.
- Les huit libellés restent inchangés : `Utilisateurs BO`, `Institutions`, `Config Institution`, `Audit`, `API Keys`, `Monitoring IA`, `Event Monitor`, `Cron Dashboard`.
- Un clic sur chaque carte ouvre le même écran et la même route qu’avant.
- Les routes directes existantes restent valides.
- L’état actif est correct sur `bo-administration` et sur chacune des huit routes enfants.
- Le header affiche le bon titre sur la vue Administration et sur les écrans enfants.
- La sidebar réduite affiche l’icône Administration sans enfants.
- Le menu mobile affiche la même entrée unique et les mêmes droits que le desktop.
- Les thèmes clair et sombre restent cohérents.

## Validation technique

- Exécuter `git diff --check`.
- Exécuter `npm run lint`; si le blocage préexistant sur `tooling/lint-rules/no-emoji-in-jsx.mjs` persiste, le signaler sans modifier ce périmètre.
- Exécuter `npx tsc --noEmit --pretty false` et vérifier les fichiers modifiés.
- Tester au minimum les rôles `super_admin`, `admin_general` et `operateur_terrain`.
- Tester les huit navigations depuis la vue Administration et le retour au dashboard.

## Extension demandée : retour vers Administration

### Objectif

Ajouter une action visible `Retour à Administration` sur les huit vues ouvertes depuis la vue Administration, sans modifier leurs routes métier ni le bouton de retour global éventuel.

### Décisions

1. Étendre `BoPageHeader` avec une prop optionnelle de navigation, par exemple `backAction?: { label: string; onClick: () => void }`, plutôt que dupliquer un bouton dans huit composants.
2. Utiliser `ArrowLeft` de Lucide et le libellé exact `Retour à Administration`.
3. Afficher l’action uniquement lorsque la prop est fournie, afin de ne pas changer les autres vues BO.
4. Dans chacune des huit vues administratives, récupérer `boNavigate` depuis `useBackofficeStore` et fournir `onClick: () => boNavigate('bo-administration')` à `BoPageHeader`.
5. Conserver les actions existantes dans `BoPageHeader.actions`; l’action de retour doit rester distincte et utilisable au clavier.
6. Conserver le thème clair/sombre existant de l’en-tête et une cible interactive confortable.
7. Ne pas utiliser `goBack()` : le retour doit être déterministe vers la vue Administration, même si l’utilisateur est arrivé depuis la recherche globale, une notification ou une route persistée.

### Fichiers concernés

- `src/components/backoffice/bo-ui.tsx` : ajouter la prop et le bouton de retour partagé.
- `src/components/backoffice/bo-utilisateurs-screen.tsx`
- `src/components/backoffice/bo-institutions-screen.tsx`
- `src/components/backoffice/bo-config-institution-screen.tsx`
- `src/components/backoffice/bo-audit-screen.tsx`
- `src/components/backoffice/bo-api-keys-screen.tsx`
- `src/components/backoffice/bo-monitoring-ia-screen.tsx`
- `src/components/backoffice/bo-events-screen.tsx`
- `src/components/backoffice/bo-cron-screen.tsx`

### Vérifications supplémentaires

- Chaque action revient bien à `bo-administration` sans modifier l’état `boCurrentScreen` autrement.
- Les actions propres à chaque page restent présentes et fonctionnelles.
- Les écrans avec plusieurs rendus de chargement/erreur affichent également le retour.
- Le bouton est visible en thème clair et sombre, possède un nom accessible et fonctionne au clavier.
- Les autres pages utilisant `BoPageHeader` ne changent pas visuellement.
- Les huit cartes Administration continuent d’ouvrir leurs routes d’origine.

## Extension demandée : nouvelle vue Supervision

### Objectif

Réorganiser `BoSupervisionScreen` autour de la question opérationnelle prioritaire : « Que dois-je traiter maintenant ? » La vue doit rendre les alertes non acquittées immédiatement visibles, tout en conservant les métriques globales, la santé système, l’activité récente et l’action d’acquittement existante.

### Décisions confirmées

1. Les alertes sont la priorité principale de la page.
2. La liste d’alertes est une file unique filtrable, pas un kanban.
3. Filtres rapides : `Toutes`, `Non acquittées`, `Critiques`, `Santé système`.
4. Le tri de la file est déterministe : alertes non acquittées d’abord, puis gravité (`critique`, `haute`, `moyenne`, `basse`), puis ancienneté décroissante.
5. L’action existante `Acquitter` est conservée; aucune nouvelle mutation métier n’est ajoutée.
6. Les quatre métriques globales restent présentes sous forme de barre compacte sous l’en-tête.
7. La santé système devient un panneau latéral à droite de la file d’alertes sur desktop et passe sous la file sur mobile.
8. L’activité récente reste une section secondaire sous le bloc principal.
9. Aucun changement de modèle Prisma, d’API, de store ou de permission n’est nécessaire.

### Structure cible

```text
Supervision                                      [Actualiser]
Surveillance en temps réel de la plateforme

[Utilisateurs actifs] [Transactions/min] [Enrôlements] [Disponibilité]

┌──────────────────────────────────┬──────────────────────┐
│ Alertes à traiter                │ Santé système        │
│ [Toutes] [Non acquittées]        │ API         OK       │
│ [Critiques] [Santé système]      │ BDD         OK       │
│                                  │ SMS         Lent     │
│ Critique · titre                 │ Keiwa       OK       │
│ message                          │ Latence              │
│ [Acquitter]                      │                      │
│                                  │                      │
│ Haute · titre                    │                      │
└──────────────────────────────────┴──────────────────────┘

Activité récente
```

### Données et état local

- Conserver `alerts`, `acknowledgeAlert`, `ticker`, `enrolments`, `auditLog`, `dashboard`, `loading` et `fetchAllData`.
- Supprimer les sélections devenues inutiles, notamment `actors` si elle n’est plus utilisée.
- Ajouter un état local `alertFilter` avec les quatre filtres définis.
- Dériver `filteredAlerts` avec `useMemo`.
- Afficher l’âge relatif comme information principale et garder la date complète dans un `title` ou un libellé accessible.
- Afficher `Aucune alerte à traiter` pour le filtre `Non acquittées` lorsqu’il est vide, et un état global distinct si aucune alerte n’existe.
- Les comptages de gravité doivent rester calculés à partir de toutes les alertes; les compteurs des filtres doivent refléter les données disponibles.

### Hiérarchie visuelle et mise en page

- Remplacer les quatre cartes hautes par une barre compacte responsive : grille 2 colonnes sur petit écran, 4 colonnes à partir de `lg`.
- Remplacer le bloc `Résumé des alertes` séparé par des filtres avec compteurs intégrés dans l’en-tête de la file.
- Donner à la file d’alertes la largeur principale (`lg:col-span-2`) et au panneau santé une largeur secondaire.
- Donner aux alertes non acquittées un fond et une bordure de gravité; réduire visuellement les alertes acquittées sans masquer leur contenu.
- Afficher l’action `Acquitter` de façon stable à droite sur desktop et en pleine largeur ou alignée sous le contenu sur mobile.
- Utiliser `rounded-2xl`, `p-4`/`p-5`, `gap-4` et les tokens de couleur BO existants.
- Corriger les classes de `SEVERITY_CONFIG` pour que les fonds, bordures, badges et icônes soient lisibles en thème clair et sombre, sans changer les niveaux ou leurs libellés.
- Ajouter `screen-enter` au conteneur racine si absent.
- Respecter les conventions d’icônes Lucide et les cibles clavier visibles.

### Santé système

- Utiliser `dashboard.systemHealth` comme source actuelle.
- Afficher pour chaque service : nom, statut, indicateur couleur et latence lorsque disponible.
- Prévoir l’état vide lorsque `systemHealth` est absent.
- Conserver les statuts existants `OK`/`operationnel` et les valeurs non-OK sans les normaliser silencieusement.
- Ne pas inventer de lien vers un autre module tant qu’aucune correspondance route/service fiable n’existe; le panneau reste informatif dans cette passe.

### Activité récente

- Conserver les dix entrées actuelles issues de `auditLog`.
- La placer sous le bloc alertes/santé avec une carte moins dominante.
- Garder l’action, le module, l’utilisateur et le temps relatif.
- Prévoir un état vide discret si aucun audit n’est disponible.

### Fichier concerné

- `src/components/backoffice/bo-supervision-screen.tsx` : réorganisation complète de la composition et ajout du filtrage local; aucune modification du store ou des APIs.

### États à vérifier

- Chargement initial sans dashboard.
- Données chargées avec alertes critiques et alertes acquittées.
- Aucune alerte.
- Aucune alerte correspondant au filtre actif.
- Toutes les alertes acquittées.
- Santé système vide ou partielle.
- Audit vide ou partiel.
- Erreur de chargement avec action `Réessayer` si elle existe déjà dans le flux.
- Thème clair et thème sombre.
- Largeur desktop 1280 px et largeur mobile; boutons d’acquittement accessibles au clavier.
- Acquittement optimiste conservé avec rollback via `acknowledgeAlert`.

### Validation supplémentaire

- Vérifier que les alertes critiques non acquittées apparaissent au-dessus des autres.
- Vérifier que chaque filtre conserve ses résultats et ses compteurs après acquittement.
- Vérifier que la hauteur de la file reste bornée avec scroll interne et que la page ne devient pas excessivement longue.
- Exécuter `git diff --check`.
- Exécuter `npx tsc --noEmit --pretty false` et vérifier l’absence de nouvelle erreur dans `bo-supervision-screen.tsx`.
- Exécuter `npm run lint`; signaler le blocage préexistant du fichier `tooling/lint-rules/no-emoji-in-jsx.mjs` s’il persiste.

## Extension demandée : parcours de création de dossier Identificateur

### Objectif

Simplifier la création d’un dossier terrain sans perdre les exigences métier. Conserver les cinq étapes actuelles, mais réduire le nombre de blocages, rendre les exigences visibles avant l’action et permettre à l’agent d’enregistrer/reprendre son travail à tout moment.

### Décisions confirmées

1. Conserver cinq étapes progressives : Photo, Identité essentielle, Activité et détails, Localisation et pièces jointes, Vérification et autorisation.
2. La photo est demandée en premier mais peut être reportée; elle bloque uniquement la soumission finale.
3. La sauvegarde automatique est transparente et immédiate après modification avec debounce; l’indicateur affiche `Brouillon enregistré`.
4. En cas de sortie après sauvegarde réussie, quitter sans confirmation; afficher une confirmation uniquement si la sauvegarde échoue.
5. Le GPS ne bloque pas la soumission. Si la permission est refusée ou la position indisponible, le dossier porte l’état `Localisation à compléter` et le motif est conservé.
6. L’autorisation de l’acteur est différable. Le PIN est la méthode recommandée; schéma et code visuel sont des options avancées.
7. Les champs spécifiques, détails, notes et pièces jointes sont progressifs et facultatifs à la création.
8. Ajouter une revue finale `Vérifier le dossier` avant l’envoi, avec résumé par section et liens `Modifier`.
9. La soumission est bloquée uniquement si manquent : photo, type d’acteur, prénom, nom, téléphone, activité ou zone.

### Parcours cible

#### Étape 1 — Photo

- CTA principal `Prendre une photo`, action secondaire `Choisir une photo`.
- Action `Continuer sans photo` avec le message : `Vous pourrez l’ajouter plus tard. Elle sera nécessaire pour envoyer le dossier.`
- Après capture : aperçu, `Reprendre la photo`, état `Vérification en cours`, puis avertissements non bloquants.
- Messages : `Photo enregistrée.`, `Photo floue, reprenez si possible.`, `La caméra n’est pas disponible. Vous pouvez choisir une image.`

#### Étape 2 — Identité essentielle

- Choix du type : Marchand, Producteur, Coopérative.
- Champs : prénom, nom, téléphone `+225`, activité et zone/marché.
- Aide téléphone : `Utilisé pour retrouver le dossier et contacter l’acteur.`
- Afficher les erreurs sous le champ concerné : `Indiquez le prénom.`, `Indiquez un numéro ivoirien valide.`, `Choisissez une activité.`, `Choisissez une zone ou un marché.`

#### Étape 3 — Activité et détails

- Afficher uniquement les champs correspondant au type choisi.
- Séparer `Essentiel` et `Informations complémentaires` repliable.
- Marchand : commerce, type, produits, horaires, emplacement, photo de l’étal.
- Producteur : production, superficie, cultures, cycles, mode d’exploitation, irrigation.
- Coopérative : nom, numéro, membres, siège, responsable, domaines.
- Afficher les limites des multi-sélections, par exemple `3 sur 5 sélectionnés`.
- Autoriser `Passer cette étape` avec sauvegarde des données déjà saisies.

#### Étape 4 — Localisation et pièces jointes

- CTA `Capturer ma position`, puis précision, date et statut `Position capturée`.
- En cas d’échec : `La position n’a pas pu être capturée. Vous pouvez continuer et compléter la localisation plus tard.`
- Conserver le motif d’indisponibilité dans le dossier.
- Pièces jointes facultatives avec formats, taille et nombre maximal visibles.
- OCR présenté comme aide facultative, jamais comme validation obligatoire.

#### Étape 5 — Vérification et autorisation

- Checklist : Photo, Identité, Zone et activité, Localisation, Pièces jointes, Autorisation.
- Chaque ligne possède un statut et un lien `Modifier` vers l’étape correspondante.
- Résumé : nom, téléphone, type, activité, zone, photo et GPS.
- Autorisation : PIN mis en avant; schéma et code visuel dans `Options avancées`.
- Si l’acteur est absent : `Configurer plus tard`, avec statut `Autorisation à configurer`.
- CTA `Envoyer le dossier` si le minimum est complet, sinon `Compléter les éléments obligatoires`.

### Modèle de données et états

- Ajouter au `Dossier` un état explicite, par exemple `gpsStatus?: 'captured' | 'refused' | 'unavailable' | 'pending'` et `gpsUnavailableReason?: string`.
- Dériver la complétude avec un helper unique.
- Ajouter un état de sauvegarde local : `idle`, `saving`, `saved`, `error`.
- Auto-sauvegarder après modification, changement d’étape, sortie et périodiquement en filet de sécurité.
- Éviter les toasts à chaque auto-save; utiliser un indicateur discret dans le header.

### Ergonomie et accessibilité

- Remplacer les emojis des étapes et types par des icônes Lucide.
- Afficher `Étape 2 sur 5` en plus de l’indicateur visuel.
- Garder les actions fixes en bas : `Retour` et action principale, avec safe-area.
- Afficher les erreurs près du champ concerné.
- Associer tous les labels aux champs avec `htmlFor`/`id`.
- Utiliser `aria-current="step"`, `aria-live` pour sauvegarde/GPS/OCR et focus sur le titre à chaque changement d’étape.
- Respecter `prefers-reduced-motion`.

### Périmètre

- `src/components/identificateur/ident-identification-screen.tsx` : restructurer les étapes, validations, checklist et footer.
- `src/lib/stores/identificateur-store.ts` : ajouter l’état GPS et conserver la persistance des brouillons.
- Ne pas modifier les routes `ident-identification`, `ident-brouillons` et `ident-suivi`.
- Réutiliser caméra, GPS, OCR, PatternLock et VisualCodeGrid; leurs erreurs restent non bloquantes sauf exigences minimales.

### Validation

- Tester nouveau dossier vide, brouillon repris et dossier rejeté à corriger.
- Vérifier qu’un brouillon peut être enregistré sans photo, GPS, documents ni autorisation.
- Vérifier que la soumission bloque exactement les exigences minimales.
- Vérifier photo refusée, GPS refusé, OCR échoué et caméra indisponible.
- Vérifier la persistance de `Localisation à compléter` et du motif.
- Vérifier que le PIN différé ne bloque pas l’envoi.
- Vérifier sortie, auto-save et reprise sans perte de saisie.
- Tester 375 px, 414 px, mode Soleil, clavier virtuel, clavier physique et lecteur d’écran.
- Exécuter `npx tsc --noEmit --pretty false`, `git diff --check` et le lint ciblé.
