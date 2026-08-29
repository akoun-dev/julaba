# Jùlaba — Fonctionnement hors ligne

Ce document décrit ce qui fonctionne sans connexion pour les trois profils
mobiles (marchand, identificateur, producteur), comment les données se
synchronisent au retour du réseau, comment les conflits sont gérés, et les
scénarios de test qui vérifient tout ça. Le backoffice n'est pas concerné :
c'est une console d'administration qui suppose une connexion permanente.

## Architecture

Chaque écran garde son propre état local (Zustand + `persist`, donc survit
à la fermeture de l'app) comme source de vérité pour l'affichage — l'app
reste utilisable et réactive qu'il y ait une connexion ou non. Les actions
qui doivent atteindre le serveur (créer une vente, un dossier, une récolte…)
suivent toutes le même schéma en deux temps :

1. **Écriture locale immédiate** : l'état Zustand est mis à jour tout de
   suite, l'utilisateur voit le résultat sans attendre le réseau.
2. **Tentative d'envoi immédiate**, puis :
   - **succès** → terminé, rien de plus à faire ;
   - **échec** (hors ligne, réseau instable, serveur indisponible) →
     l'action est mise en file d'attente locale (`pending_sync`, une table
     SQLite gérée par `src/lib/offline-db.ts`) pour être renvoyée
     automatiquement plus tard.

La file d'attente est vidée (`flushAllPendingSync()`) à chaque retour de
connexion détecté (`Network.addListener('networkStatusChange')`, plugin
Capacitor) et au démarrage de l'app si elle est déjà en ligne — donc aussi
bien "j'étais hors ligne puis je retrouve le réseau" que "j'ai fermé l'app
hors ligne et je la rouvre en ligne". Un bandeau ambre "Hors ligne —
certaines actions seront synchronisées au retour du réseau"
(`CapacitorProvider.tsx`) s'affiche en permanence tant que l'appareil n'a
pas de réseau, sur les 3 profils.

**Limite connue et documentée séparément** (voir `CAPACITOR.md`) : l'app est
chargée en mode Capacitor "hybride distant" — la coquille native va
chercher le bundle Next.js sur le serveur à chaque démarrage à froid. Sans
réseau au tout premier lancement (ou après un redémarrage complet de
l'app), l'app ne s'ouvre pas du tout. Une fois chargée, la navigation entre
écrans ne dépend plus du réseau. C'est un chantier d'architecture à part,
non couvert par ce document.

## Fonctionnalités disponibles hors connexion, par profil

### Marchand

| Action | Hors ligne | Synchronisée au retour du réseau |
|---|---|---|
| Enregistrer une vente (caisse) | ✅ | ✅ |
| Ajouter une dépense | ✅ | ✅ |
| Ajouter un produit au stock | ✅ | ✅ |
| Modifier prix/stock d'un produit (y compris réappro) | ✅ | ✅ |
| Supprimer un produit | ✅ (localement) | ❌ — nécessite une connexion pour être définitive |
| Inscription du compte (première connexion) | ✅ | ✅ |
| Consulter l'historique (ventes, dépenses, stock) | ✅ (dernière version connue en local) | — (lecture seule) |
| Assistant vocal (mot d'appel "Julaba", saisie vocale) | ✅ (reconnaissance vocale embarquée) | — |

La suppression de produit n'a délibérément pas de file d'attente : une
suppression appliquée hors ligne puis rejouée à l'aveugle au retour du
réseau est plus risquée (elle peut entrer en conflit avec une vente
enregistrée entre-temps sur ce même produit) qu'une simple attente de
connexion pour cette action précise, plus rare que les ventes/dépenses/ajouts.

### Identificateur

| Action | Hors ligne | Synchronisée au retour du réseau |
|---|---|---|
| Créer/modifier un dossier (brouillon) | ✅ | — (le brouillon reste local jusqu'à soumission) |
| Soumettre un dossier pour validation | ✅ | ✅ |
| Photo, position GPS, documents (dossier) | ✅ (capturés et attachés localement) | ✅ (envoyés avec le dossier) |
| Consulter ses dossiers (brouillons, en attente, validés) | ✅ (dernière version connue en local) | — (lecture seule) |
| Assistant vocal (navigation) | ✅ | — |

Un dossier peut être créé, rempli, corrigé et sauvegardé en brouillon
entièrement hors ligne — le réseau n'est requis qu'au moment de la
soumission finale (bouton "Soumettre", que ce soit depuis l'assistant de
saisie ou depuis la liste des brouillons — les deux passent par le même
mécanisme, voir `identificateur-sync.ts`).

### Producteur

| Action | Hors ligne | Synchronisée au retour du réseau |
|---|---|---|
| Déclarer une récolte | ✅ | ✅ |
| Publier une récolte sur le marché | ✅ | ✅ |
| Répondre à une commande (accepter/refuser) | ✅ | ✅ |
| Confirmer une livraison | ✅ | ✅ |
| Ajouter une entrée au carnet de champ (cycle en cours) | ✅ | ✅ |
| Consulter récoltes/commandes/stock/prix du marché | ✅ (dernière version connue en local) | — (lecture seule) |
| Assistant vocal (mot d'appel "Julaba", navigation) | ✅ | — |

Les commandes et récoltes de démonstration préchargées dans l'app
(`producteur-store.ts`, ids `r1`/`r2`/`r3`/`c1`/`c2`/`c3`) n'existent pas
côté serveur — elles ne représentent aucune donnée réelle. Y répondre reste
utilisable pour la démo (mise à jour locale immédiate) mais la tentative de
synchronisation reçoit un 404 du serveur, classé comme échec définitif (voir
plus bas) : elle est abandonnée proprement plutôt que retentée indéfiniment.
Une vraie récolte déclarée via le formulaire, elle, existe bien côté serveur
dès sa création et se synchronise normalement pour toute action suivante.

## Synchronisation et idempotence

Chaque écriture porte un identifiant généré côté client
(`clientId` pour marchand, l'`id` lui-même pour identificateur/producteur —
choisi par l'écran, pas par la base). Si la tentative immédiate échoue une
fois la requête déjà partie (ex. la connexion tombe juste après l'envoi, la
réponse ne revient jamais), l'action mise en file d'attente porte le même
identifiant. Quand elle est rejouée plus tard, le serveur reconnaît cet
identifiant s'il a déjà traité la requête et renvoie l'enregistrement
existant (`200`) au lieu d'en créer un doublon (`201`) — aucune vente, aucun
dossier, aucune récolte ne peut donc être comptée deux fois à cause d'un
renvoi.

## Gestion des conflits

Deux catégories d'échec, traitées différemment par `flushPendingSync`
(`src/lib/offline-db.ts`) :

- **Transitoire** (pas de réseau, 5xx, timeout) → l'entrée reste dans la
  file, retentée au prochain retour de réseau. Le traitement d'une entité
  s'arrête à la première entrée transitoire en échec pour préserver l'ordre
  (ex. un réapprovisionnement doit atteindre le serveur après la création
  du produit qu'il concerne) — les entités suivantes ne sont pas bloquées
  pour autant, chaque entité (vente, dépense, récolte…) a sa propre file.
- **Définitif** (`400`/`404`/`422` — la requête est rejetée sur le fond :
  données invalides, ou l'enregistrement ciblé par une mise à jour a été
  supprimé ou n'a jamais existé côté serveur) → l'entrée est abandonnée
  (journalisée, retirée de la file) et le traitement continue avec les
  entrées suivantes. Sans cette distinction, une seule entrée définitivement
  invalide bloquait indéfiniment tout ce qui la suivait dans la même file —
  c'était le comportement avant ce correctif.

Il n'y a pas de résolution de conflit "à la Git" (fusion de deux
modifications concurrentes) : chaque enregistrement (vente, dossier,
récolte, entrée de carnet) appartient à un seul appareil/utilisateur et
n'est jamais modifié en parallèle par deux sources. Le seul vrai conflit
possible est structurel (la cible n'existe plus / n'a jamais existé), traité
comme ci-dessus.

## Scénarios de test

Vérifiés de bout en bout (Playwright, requêtes réseau interceptées pour
simuler le hors-ligne ; SQLite natif — donc la persistance réelle de la file
d'attente sur l'appareil — n'est testable que sur un vrai build
Android/iOS, limite déjà documentée dans `offline-db.ts`).

### Marchand
1. Vente enregistrée en ligne → une seule requête `POST /api/marchand/sales`, `201`.
2. Vente enregistrée avec le réseau coupé (requête interceptée) → mise en
   file d'attente (`queuePendingSync('sale', …)` appelé), aucune perte de
   la vente localement.
3. Dépense créée en ligne → `POST /api/marchand/expenses`, `201`, description non altérée.
4. Produit ajouté en ligne → `POST /api/marchand/products`, une seule requête (pas de doublon).
5. Réapprovisionnement (`updateProduct`) hors ligne → mis en file
   (`product-update`), appliqué localement immédiatement.
6. Renvoi d'une vente déjà reçue par le serveur (même `clientId`) → `200`,
   pas de duplicat créé.

### Identificateur
1. Dossier rempli et soumis en ligne (depuis l'assistant de saisie) → une
   seule requête `POST /api/backoffice/enrolments`, dossier retrouvé en
   base avec le bon statut.
2. Dossier soumis depuis le bouton "Soumettre" d'un brouillon (chemin
   différent du précédent) → même comportement, même endpoint.
3. Soumission avec le réseau coupé → toast "en attente de synchronisation"
   (pas de faux succès), `queuePendingSync('enrolment', …)` appelé.

### Producteur
1. Récolte déclarée et publiée en ligne → `POST /api/producteur/recoltes`,
   `201`, `producteurId` correctement renseigné.
2. Récolte déclarée avec le réseau coupé → mise en file
   (`recolte-create`), visible immédiatement dans "Mes récoltes".
3. Mise à jour d'une récolte réellement créée côté serveur (`publierRecolte`) →
   `PATCH /api/producteur/recoltes`, `200`.
4. Mise à jour d'une récolte de démonstration (jamais créée côté serveur) →
   `404`, classé "définitif", abandonné sans retenter indéfiniment.
5. Entrée de carnet de champ ajoutée en ligne → `POST /api/producteur/journal`,
   `201`, retrouvée en base sous le bon `cycleId`.
6. Renvoi d'une entrée de carnet déjà reçue (même `id`) → `200`, pas de doublon.
