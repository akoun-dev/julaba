# Audit / corrections des espaces acteurs — 2026-09-23

## Réalisé

### Marchand
- Marketplace : le paiement d'une commande exige désormais la session appareil du marchand acheteur.
- Une seconde initiation de paiement est refusée lorsqu'un paiement est déjà pending/authorized pour la commande.
- La réception est maintenant une action métier explicite : le marchand confirme qu'il a réellement reçu la commande.
- Le modèle de commande expose buyer_received_at.
- L'interface n'affiche plus un faux téléchargement d'attestation côté identificateur (voir section Identificateur).

### Producteur
- Le producteur peut désormais accéder au catalogue Marketplace depuis son espace.
- Il peut créer une commande Marketplace et suivre ses achats avec le même moteur transactionnel que le marchand.
- Un espace « Ventes marketplace » a été ajouté pour consulter les commandes reçues.
- Les commandes mono-vendeur peuvent être traitées : accepter/refuser → préparer → prête → remise au transporteur.
- Les commandes multi-vendeurs restent volontairement bloquées côté traitement vendeur tant que le workflow de fulfillment par vendeur n'est pas séparé.

### Coopérative
- Aucun faux écran « marché coopératif » n'a été ajouté : les tables actuelles ne permettent pas de représenter proprement une coopérative comme vendeur sans rattacher artificiellement ses ventes au compte du président.
- Le besoin réel reste un domaine dédié : publications coopératives, type de marché, visibilité grossiste/semi-grossiste, commandes coopératives, négociation et clôture de paiement.

### Identificateur
- Le détail d'un dossier rejeté indique désormais une correction générique plutôt qu'un motif photo inventé.
- Le bouton « Télécharger l'attestation provisoire » a été remplacé par « Demander l'attestation au back-office », car aucune génération/download réel n'existe actuellement dans le code.
- Le workflow brouillon → soumission → attente → validation/rejet reste inchangé et conserve le fonctionnement offline déjà en place.

## Reste à construire avant de considérer les quatre espaces complets

1. Marketplace vendeur multi-vendeurs : états indépendants par vendeur et fulfillment partiel.
2. Paiement réel : l'état pending est une initiation ; il faut brancher le provider Mobile Money/Carte avant de parler de paiement confirmé.
3. Réputation producteur : table d'avis, règles d'éligibilité après transaction livrée, agrégation serveur et affichage.
4. Marché coopératif : domaine et workflow dédiés, sans détourner marketplace_seller_profiles.merchant_id.
5. Validation acteur F-17 : décider si marchand/producteur peut utiliser l'application avant validation BO, puis appliquer la règle côté serveur et UI.
6. Tests : exécuter typecheck, lint, build et tests DB/route sur le HEAD après application des migrations.

## Principe appliqué

Aucune donnée métier n'est simulée pour donner l'impression qu'une fonction est terminée. Quand le backend ne possède pas encore le modèle nécessaire, l'interface doit le dire explicitement plutôt que de fabriquer une relation métier.