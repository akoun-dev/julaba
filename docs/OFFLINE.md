# Jùlaba — Fonctionnement hors ligne

Ce document décrit le comportement hors connexion des trois profils mobiles.
Supabase est la seule source de vérité : les mutations métier en attente sont
placées dans une file d'attente locale (`localStorage`, voir
`src/lib/offline-db.ts`) et rejouées vers l'API au retour du réseau — la base
n'est jamais feinte. Le backoffice suppose une connexion permanente.

## Architecture

Les écrans peuvent conserver un état de saisie en mémoire pendant la session,
mais les données métier confirmées viennent toujours de l'API adossée à
Supabase. Les actions qui doivent atteindre le serveur (vente, dossier,
récolte, etc.) suivent ce schéma :

1. **Tentative d'envoi à Supabase**, puis :
   - **succès** → l'interface est actualisée depuis la réponse serveur ;
   - **échec réseau/serveur** → l'action est mise en file d'attente locale
     (`queuePendingSync(entité, payload)`) et l'interface montre un état
     "en attente de synchronisation" honnête ;
   - **échec et file indisponible** → l'action est refusée explicitement et
     la saisie reste récupérable dans l'écran courant.

La file est rejouée automatiquement par le composant `SyncFlusher`
(`src/components/shared/sync-flusher.tsx`), monté à la racine pour les trois
profils : au retour de la connectivité, au focus de la fenêtre, au
chargement avec une file héritée d'une session précédente, et juste après
une liaison d'appareil réussie (`claim-device-session.ts`). Chaque type
d'entité a un gestionnaire de rejeu dans `src/lib/sync-handlers.ts` qui
renvoie exactement la même requête que la tentative directe.

Le TTS personnalisé suit désormais le même principe local : après installation
vérifiée du pack, `VoicePackPlugin.synthesize` initialise Sherpa-ONNX VITS/Piper
avec `model.onnx`, `tokens.txt` et `espeak-ng-data`, puis joue les échantillons
PCM directement avec `AudioTrack`. Le chemin TypeScript
`tataSpeakWithContext` tente ce moteur uniquement si un pack prêt est présent
et retombe sur le TTS existant en cas d’indisponibilité. Le pack de production
doit encore fournir les SHA-256 et URLs réels ; les valeurs `REPLACE_WITH_*`
du manifeste d’exemple sont volontairement refusées.

**Limite d'architecture :** l'app reste chargée en mode Capacitor "hybride
distante". Après un premier chargement réussi, `public/sw.js` met en cache la
coquille déjà visitée, les chunks Next.js et la page de repli
`public/offline.html`. Une relance à froid peut donc rouvrir la coquille sans
réseau si le service worker a déjà été installé et si l'écran a été chargé au
moins une fois. En revanche, le premier lancement sans réseau ne peut toujours
pas démarrer l'application, et une route ou un écran jamais mis en cache ne
peut pas être inventé localement. Les réponses `/api/*` authentifiées ne sont
jamais mises en cache : les lectures métier restent dépendantes du serveur et
les mutations restent protégées par la file locale. Un bundle Next.js local
avec serveur embarqué serait nécessaire pour supprimer aussi la limite du
premier lancement.

## Fonctionnalités disponibles hors connexion, par profil

### Marchand

| Action | Hors ligne | Synchronisée au retour du réseau |
|---|---|---|
| Enregistrer une vente (caisse) | ✅ | ✅ |
| Ajouter une dépense | ✅ | ✅ |
| Ajouter un produit au stock | ✅ | ✅ |
| Modifier le prix d'un produit | ✅ | ✅ |
| Réappro / perte / comptage de stock (actions rapides stock, delta + `operation_id`) | ✅ | ✅ (RPC `merchant_*` — les valeurs absolues calculées client ont été supprimées, STK-811) |
| Transferts inter-marchands (envoi, annulation, réception) | ✅ (`stock-transfer` / `stock-transfer-action`) | ✅ (les entités stock hors ligne : `stock-movement`, `stock-count`, `stock-purchase`, `stock-transfer`, `stock-transfer-action`, `stock-reception`) |
| Supprimer un produit | ✅ (localement) | ❌ — nécessite une connexion pour être définitive |
| Commander auprès d'un fournisseur (Marché) | ✅ | ✅ |
| Créer une tontine | ❌ — nécessite une connexion (les cotisations ultérieures référencent l'id serveur) | — |
| Opérations Keiwa (dépôt, retrait, transfert) | ❌ — le solde est autoritaire côté serveur, aucune version locale ne doit pouvoir diverger | — |
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
| Déclarer une récolte (formulaire ou à la voix) | ✅ | ✅ |
| Publier une récolte sur le marché | ✅ | ✅ |
| Répondre à une commande (accepter/refuser) | ✅ | ✅ |
| Confirmer une livraison | ✅ | ✅ |
| Ajouter une entrée au carnet de champ (cycle en cours) | ✅ | ✅ |
| Consulter récoltes/commandes/stock/prix du marché | ✅ (dernière version connue en local) | — (lecture seule) |
| Assistant vocal (mot d'appel "Julaba", navigation, déclaration de récolte) | ✅ | ✅ (la déclaration vocale passe par la même écriture que le formulaire) |

Les commandes et récoltes de démonstration préchargées dans l'app
(`producteur-store.ts`, ids `r1`/`r2`/`r3`/`c1`/`c2`/`c3`) n'existent pas
côté serveur — elles ne représentent aucune donnée réelle. Y répondre reste
utilisable pour la démo (mise à jour locale immédiate) mais la tentative de
synchronisation reçoit un 404 du serveur, classé comme échec définitif (voir
plus bas) : elle est abandonnée proprement plutôt que retentée indéfiniment.
Une vraie récolte déclarée via le formulaire ou à la voix, elle, existe bien
côté serveur dès sa création et se synchronise normalement pour toute action
suivante.

La déclaration vocale ("j'ai récolté 100 kilos de manioc") est pensée pour
les producteurs qui ne lisent ou n'écrivent pas facilement : elle évite
complètement le formulaire (produit/quantité/qualité/parcelle/prix). Qualité
et prix ont des valeurs par défaut raisonnables si non précisés à l'oral,
modifiables ensuite depuis la fiche de la récolte. Toute déclaration vocale
est relue à voix haute et attend un "oui" explicite avant d'être enregistrée
— une quantité ou un produit mal compris n'écrit jamais silencieusement.

## Sécurité : liaison de session par appareil

Marchand, producteur et identificateur s'authentifient localement (code PIN
comparé à un hash stocké sur l'appareil, jamais envoyé au serveur) — sans
protection supplémentaire, n'importe quel appel à l'API portant un
merchantId/producteurId/identificateurId valide (des identifiants qui fuient
trivialement, ex. dans la query string d'un GET) pouvait lire ou écrire les
données de ce compte depuis n'importe où. `POST /api/session/claim`
(`src/lib/device-session.ts`) lie cet appareil au compte dès la première
connexion/inscription ; chaque route marchand/producteur/identificateur
vérifie ensuite ce lien via `requireDeviceOwner` avant de lire ou d'écrire
quoi que ce soit. Une session n'est plus attachée à vie à un seul appareil :
une connexion vérifiée (le bon code, contrôlé côté serveur par
`/api/merchant/login` ou `/api/producteur/login`) re-lie la session au
nouvel appareil — changement de téléphone, second appareil, cookies nettoyés
— et l'appareil précédent doit simplement se reconnecter. Ce qui reste
interdit, c'est la substitution sans preuve : un appel à
`/api/session/claim` qui ne présente pas le cookie du compte (ni un code
vérifié) ne peut pas s'approprier le compte — connaître un identifiant ne
suffit pas. (Pour l'identificateur, qui n'a pas de code serveur à vérifier
— PIN local uniquement —, la re-liaison reste ouverte sur
`/api/session/claim`, même niveau de confiance que le premier lien.) Cette
liaison est elle-même mise en file d'attente hors ligne (entité
`device-claim`, enregistrée avant toutes les autres dans
`sync-handlers.ts` — les écritures qui en dépendent doivent la trouver déjà
appliquée au moment où elles sont rejouées).

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

- **Transitoire** (pas de réseau, 408, 429, 5xx) → l'entrée reste dans la
  file, retentée au prochain retour de réseau. Le rejeu parcourt toute la
  file en FIFO et poursuit après une entrée transitoire en échec : une
  entrée bloquée n'empêche pas les suivantes d'atteindre le serveur.
- **Définitif** (tout autre 4xx — la requête est rejetée sur le fond :
  données invalides, ou l'enregistrement ciblé par une mise à jour a été
  supprimé ou n'a jamais existé côté serveur) → l'entrée est abandonnée,
  journalisée comme conflit (`recordSyncConflict`, visible au backoffice
  via `/api/sync-conflicts/report`) et le rejeu continue avec les entrées
  suivantes. Sans cette distinction, une seule entrée définitivement
  invalide bloquait indéfiniment tout ce qui la suivait dans la même file —
  c'était le comportement avant ce correctif.

Il n'y a pas de résolution de conflit "à la Git" (fusion de deux
modifications concurrentes) : chaque enregistrement (vente, dossier,
récolte, entrée de carnet) appartient à un seul appareil/utilisateur et
n'est jamais modifié en parallèle par deux sources. Le seul vrai conflit
possible est structurel (la cible n'existe plus / n'a jamais existé), traité
comme ci-dessus.

## Scénarios de test

Vérifiés de bout en bout avec des requêtes réseau interceptées pour simuler le
hors-ligne. Les tests doivent vérifier le refus explicite et la conservation
du brouillon uniquement dans l'écran courant.

### Marchand
1. Vente enregistrée en ligne → une seule requête `POST /api/marchand/sales`, `201`.
2. Vente enregistrée avec le réseau coupé (requête interceptée) → mise en
   file d'attente (`queuePendingSync('sale', …)` appelé), aucune perte de
   la vente localement.
3. Dépense créée en ligne → `POST /api/marchand/expenses`, `201`, description non altérée.
4. Produit ajouté en ligne → `POST /api/marchand/products`, une seule requête (pas de doublon).
5. Réapprovisionnement / opération stock hors ligne → mise en file
   (`stock-movement` / `stock-purchase` / `stock-count` — delta +
   `operation_id` UUID déterministe, STK-808), appliquée localement
   immédiatement. L'ancien réappro absolu (`updateProduct`) a été
   supprimé (STK-811) ; seul le réappro vocal historique reste à router
   sur la RPC achat (BUG-002).
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
7. Déclaration de récolte à la voix ("j'ai récolté 100 kilos de manioc") →
   lue à voix haute pour confirmation, "oui" déclenche `POST
   /api/producteur/recoltes`, `201`, récolte retrouvée en base avec le bon
   produit/quantité/qualité.
