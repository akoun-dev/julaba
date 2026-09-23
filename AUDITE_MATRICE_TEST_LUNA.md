# Audit complet de la matrice de tests

Date : 2026-09-22
Périmètre : matrice de recette Web/Mobile, saisie/voix, Back-office, Marchand, Producteur, Coopérative et synchronisation offline.
Méthode : inspection du dépôt, des tests, des routes, des stores et des références `.ai/`. Aucun fichier source applicatif n'a été modifié pendant l'audit.

## 1. Référentiel appliqué

Références consultées :

- `.ai/README.md`
- `.ai/TEST_PLAN.md`
- `.ai/SYSTEM_COMPLIANCE.md`
- `.ai/ARCHITECTURE.md`
- `.ai/PROJECT_CONTEXT.md`
- `.ai/REQUIREMENTS.md`
- `.ai/WORKFLOWS.md`
- `docs/OFFLINE.md`
- `docs/VOICE_SERVICE.md`
- `.github/workflows/ci.yml`

Règle principale : un test ne peut être déclaré validé que si le code, un test reproductible et le comportement réel sont corroborés. Les valeurs `OK`, `KO` et `PARTIEL` de la matrice source sont donc considérées comme des résultats déclarés, mais non auditables sans date, commit, plateforme, données de test et preuve d'exécution.

## 2. Gates exécutées

Commandes exécutées :

```bash
bun run test
bunx tsc --noEmit
bunx eslint .
```

Résultats :

| Gate | Résultat |
|---|---:|
| Vitest | 142 fichiers, 1868 tests réussis |
| TypeScript | Réussi |
| ESLint | Réussi |
| Build production | Non exécuté pendant cet audit |
| pgTAP/RLS | Non exécuté pendant cet audit |
| Test Web réel | Non exécuté |
| Test Mobile réel | Non exécuté |
| Test Android Capacitor | Non exécuté |

Les tests unitaires verts ne valident donc pas les parcours UI Web/Mobile de la matrice.

## 3. Constats globaux

### P0 - Aucune validation Mobile

Les 33 lignes ont les colonnes Mobile Saisie et Mobile Voix à `NON TESTÉ`.

Cela bloque toute déclaration de conformité à `REQ-T1` : fonctionnement 100 % offline sur natif après installation des modèles. Les permissions micro, clavier virtuel, WebView, synchronisation, reprise après redémarrage et modèles vocaux ne sont pas prouvés.

### P1 - Absence de preuves reproductibles

La matrice ne contient pas :

- commit testé ;
- date et heure ;
- navigateur et version ;
- modèle et version du téléphone ;
- version Android ;
- état réseau ;
- compte ou fixture ;
- log, capture ou vidéo ;
- résultat API ;
- identifiant de bug ;
- validateur.

Les résultats actuels ne peuvent pas être rejoués ni reliés à une version du code.

### P1 - Mélange entre échec et non-applicabilité

Les colonnes Voix existent pour tous les univers alors que les normes du projet distinguent les capacités :

- Back-office : pas de parcours vocal prévu ; `N/A` est attendu.
- Marchand : voix primaire pour les ventes et certaines actions de caisse.
- Producteur : voix pour récoltes et navigation, pas pour toutes les mutations.
- Coopérative : navigation vocale limitée ; commandes vocales métier non implémentées.

Une capacité non prévue doit être `N/A`, pas `KO`.

### P2 - Données de recette non définies

Les comptes, marchés, profils, produits, stocks, ventes, dépenses, commandes et membres nécessaires ne sont pas décrits dans la matrice. Un jeu de données de recette versionné et réinitialisable est nécessaire.

### P2 - Dérive des registres `.ai/`

Les compteurs de tests divergent entre `.ai/TEST_PLAN.md`, `.ai/PROJECT_CONTEXT.md` et l'exécution actuelle. Le dépôt annonce respectivement 480+, 1224 et 1868 tests. Les documents doivent être resynchronisés.

## 4. Audit Back-office

| ID | Verdict | Éléments observés | Validation manquante |
|---|---|---|---|
| `BO-CON-001` | Partiel | `bo-auth-screen.tsx`, `/api/backoffice/login`, lockout et session présents ; tests de route disponibles | Login réel, MFA conforme au code actuel, cookie, logout, reload, session live |
| `BO-MAR-001` | Non validé | Surface marketplace et routes présentes | Création, persistance, droits et affichage réel |
| `BO-MAR-002` | Non validé | Surface marketplace présente | Modification, conservation des champs et rafraîchissement |
| `BO-ACT-001` | Non validé | Écrans acteurs et routes utilisateurs présents | Création marchand et association marché |
| `BO-ACT-002` | Non validé | Routes producteurs, coopératives, identificateurs et institutions présentes | Quatre créations distinctes avec permissions |
| `BO-MDP-001` | Partiel | `/api/backoffice/users/change-password` présent | Politique, expiration, refus et parcours navigateur |
| `BO-AUD-001` | Partiel | `bo-audit-screen.tsx` et `/api/backoffice/audit` présents | RBAC, pagination, filtres, export et données réelles |
| `BO-TDB-001` | Partiel | Dashboard, états loading/error et API présents | Agrégats, données vides, valeurs par défaut, charts, responsive et contrôles « Plus d'options » |

Les colonnes Voix Back-office doivent être `N/A`, conformément au périmètre produit.

## 5. Audit Marchand

| ID | Résultat déclaré | Verdict audit | Constats principaux |
|---|---|---|---|
| `MAR-CON-001` | Saisie OK, Voix KO | Partiel | Lookup, auth serveur et session appareil présents ; E2E complet absent. La voix d'authentification doit probablement être `N/A`. |
| `MAR-CAI-001` | Saisie KO, Voix KO | Bloquant | Ouverture présente mais montant, double ouverture, persistance, voix et fallback doivent être reproduits séparément. |
| `MAR-STK-001` | Saisie OK, Voix KO | Partiel | Création produits présente ; la voix doit être `N/A` si aucune intention de création n'est prévue. |
| `MAR-STK-002` | Saisie KO, Voix N/A | Bloquant | Vérifier modification, route API et persistance après rafraîchissement. |
| `MAR-VTE-001` | Saisie OK, Voix KO | Partiel | Vente simple, stock et refus serveur couverts par la logique ; parcours UI et vocal non prouvés. |
| `MAR-VTE-002` | Saisie OK, Voix N/A | Partiel | Tester lignes, total, mouvements et idempotence multi-produits. |
| `MAR-VTE-003` | Saisie OK, Voix N/A | À confirmer | L'idempotence est conçue côté API, mais le chemin principal de vente manque de test direct complet. |
| `MAR-DEP-001` | Saisie PARTIEL, Voix N/A | Risque financier | Tester dépense, net, persistance, offline et périmètre session/journée. |
| `MAR-HIS-001` | Saisie PARTIEL, Voix N/A | Risque cohérence | Comparer historiques et agrégats aux données serveur après synchronisation. |
| `MAR-CAI-002` | Saisie KO, Voix N/A | Bloquant métier | Après clôture, une vente doit être refusée côté interface et API. |
| `MAR-CAI-003` | Saisie KO, Voix N/A | Bloquant métier | Annulation après clôture à encadrer côté serveur, pas uniquement dans l'UI. |

Risques spécifiques de la clôture :

- panier actif potentiellement supprimé par `closeSession()` ;
- divergence entre clôture locale et serveur ;
- double clôture possible ;
- rapport serveur bloqué hors ligne ;
- calcul d'écart pouvant omettre le fond initial ;
- absence de test composant/E2E du parcours de fermeture.

## 6. Audit Offline et Synchronisation

### `OFF-VOX-001`

Verdict : implémentation de routage présente, validation appareil manquante.

Les tests unitaires couvrent les routes françaises, Baoulé, les erreurs explicites et l'absence de fallback silencieux. Ils ne prouvent pas :

- capture micro Android réelle ;
- absence de requête réseau ;
- auto-stop à 30 secondes ;
- modèle complet et modèle lite ;
- pack absent, partiel ou corrompu ;
- redémarrage après installation ;
- TTS natif réel ;
- permissions et interruptions système.

### `SYN-001`

Verdict : architecture présente, synchronisation bout en bout non validée.

Il manque les tests de replay FIFO, conservation des erreurs transitoires, conflits définitifs, flush concurrent, crash/relaunch, perte de réponse après commit et idempotence directe du POST de vente.

### Risque P1 de propriété de file

`SyncFlusher` utilise principalement `merchantId` comme propriétaire actif (`src/components/shared/sync-flusher.tsx:78-85`), alors que les entrées producteur et identificateur peuvent porter un autre propriétaire. `offline-db.ts:275-289` peut alors classer ces entrées comme orphelines ou étrangères et les supprimer comme conflits.

Ce point bloque la validation de `SYN-001` jusqu'à l'ajout de tests marchand, producteur et identificateur.

## 7. Audit Producteur

| ID | Verdict | Éléments observés | Validation manquante |
|---|---|---|---|
| `PRO-CON-001` | Partiel | `prod-commandes-screen.tsx`, `producteur-store.ts` et route commandes présents | Connexion, liste, acceptation, refus, livraison et synchronisation |
| `PRO-REC-001` | Non validé | Écrans récoltes, `prodIntent.ts` et routes présents | Saisie, voix, confirmation obligatoire et offline |
| `PRO-REC-002` | Non validé | Liste récoltes et état vide présents | Données, liste vide, erreur et pagination |
| `PRO-STK-001` | Non validé | Store et écrans stocks présents | Cohérence mouvements et autorisation producteur |
| `PRO-MAR-001` | Non validé | Routes et écrans de publication présents | Publication, statut et visibilité marchand |
| `PRO-CMD-001` | Partiel | Actions commande présentes, navigation vocale présente | Tests directs des mutations et E2E Web/Mobile |

La voix producteur couvre la navigation et certaines récoltes, pas toutes les mutations de commande. Les cas non prévus doivent être `N/A`.

## 8. Audit Coopérative

| ID | Verdict | Éléments observés | Validation manquante |
|---|---|---|---|
| `COO-CON-001` | Non validé | `coop-gate.tsx`, écrans d'authentification et routes présents | Session, rôle, identité et refus serveur |
| `COO-MEM-001` | Non validé | Store et écran membres présents | Liste, vide, erreur, pagination et droits |
| `COO-MEM-002` | Non validé | Routes membres et store présents | Ajout, doublon, adhésion et persistance |
| `COO-FIN-001` | Non validé | Surface finances/trésorerie présente | Soldes, absence de données, erreur et permissions |
| `COO-STK-001` | Non validé | Stock coopératif présent | Cohérence avec distribution et droits |
| `COO-CMD-001` | Ambigu/partiel | Le code expose plutôt besoins, consolidation, dispatch et distribution | Découper le cas en mutations métier indépendantes |

Le parcours réel semble être :

```text
Besoin -> Consolidation -> Dispatch -> Distribution -> Livraison
```

Il est recommandé de créer `COO-BES-001`, `COO-BES-002`, `COO-STK-003`, `COO-DIS-001` et `COO-DIS-002`. Les mutations vocales coopératives ne sont pas implémentées ; elles doivent être `N/A`.

## 9. Matrice de couverture actuelle

| Zone | Situation déclarée |
|---|---:|
| Cas total | 33 |
| Cas Web entièrement non testés | 22 |
| Cas Mobile entièrement non testés | 33 |
| Cas Web Marchand déclarés OK en saisie | 5 |
| Cas Web Marchand déclarés KO en saisie | 4 |
| Cas Web Marchand déclarés PARTIEL | 2 |
| Cas Voix Marchand déclarés KO | 4 |
| Cas Voix déclarés NON DISPONIBLE | 6 |
| Cas Voix déclarés N/A | 1 |

Selon les normes `.ai/`, aucun cas ne peut néanmoins être déclaré totalement validé sur la matrice seule.

## 10. Priorités d'action

### P0

1. Créer un jeu de données de recette versionné et réinitialisable.
2. Ajouter les tests Mobile pour les parcours critiques.
3. Bloquer la clôture lorsqu'un panier actif risque d'être supprimé.
4. Vérifier la propriété de file offline pour les trois profils.

### P1

1. Ajouter un E2E Back-office login, session, logout et reload.
2. Ajouter un E2E Marchand : ouverture, vente, dépense, clôture.
3. Ajouter le test direct d'idempotence de `POST /api/marchand/sales`.
4. Reproduire et corriger `MAR-STK-002`.
5. Tester les ventes après clôture et les annulations.
6. Ajouter le flush offline intégré et le test crash/relaunch.
7. Tester les modèles vocaux sur Android réel.
8. Séparer `COO-CMD-001` en besoins, dispatch et distribution.

### P2

1. Ajouter les tests de composants React des écrans critiques.
2. Ajouter un smoke E2E Web à 320, 375, 430 et 1280 px.
3. Ajouter un smoke Capacitor Android.
4. Tester les états chargement, vide, erreur, timeout et retry.
5. Ajouter les tests accessibilité et responsive.
6. Resynchroniser les compteurs des documents `.ai/`.
7. Remplacer `NON DISPONIBLE` par `N/A` lorsque la voix n'est pas prévue.
8. Ajouter navigateur, appareil, commit, fixture et preuve à chaque résultat.

## 11. Format recommandé pour chaque résultat

| Champ | Exemple |
|---|---|
| ID | `MAR-VTE-001` |
| Commit testé | `abc1234` |
| Date/heure | `2026-09-22 19:30 UTC` |
| Navigateur/appareil | `Chrome 140 / Android 14 / Tecno...` |
| Réseau | `Online`, `Offline`, `Reconnect` |
| Fixture | `merchant-demo-01` |
| Saisie | `PASS`, `FAIL`, `BLOCKED`, `N/A` |
| Voix | `PASS`, `FAIL`, `BLOCKED`, `N/A` |
| Preuve | log, capture, vidéo ou résultat API |
| Défaut | `BUG-XXX` ou `REG-XXX` |
| Reproductibilité | étapes minimales |
| Validateur | agent ou personne |

Les valeurs `OK`, `KO`, `PARTIEL` et `NON TESTÉ` sont trop ambiguës pour un registre final de recette.

## 12. Verdict final

Verdict global : **matrice non validable pour une recette de release**.

Les gates statiques sont vertes : `1868/1868` tests, TypeScript valide et ESLint valide. La validation produit reste toutefois insuffisante : Web E2E non couvert, Mobile totalement non couvert, voix terrain non validée, synchronisation multi-profils non sécurisée par test, vente principale non testée en idempotence complète, plusieurs cas vocaux mal classés et parcours coopératif ambigu.

Niveau de confiance :

| Domaine | Niveau |
|---|---|
| Code et tests unitaires | Élevé |
| API et stores | Moyen à élevé |
| Parcours Web réel | Faible |
| Parcours Mobile réel | Nul |
| Voix sur appareil | Faible |
| Offline bout en bout | Faible |
| Certification release | Bloquée |

Aucune fonctionnalité ne doit être déclarée `TERMINÉE` dans `TASKS.xlsx` sur la seule base de cette matrice.
