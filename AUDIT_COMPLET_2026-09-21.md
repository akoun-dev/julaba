# Audit complet du projet Jùlaba

**Date de l’audit :** 21 septembre 2026  
**Révision analysée :** `b5c679e` — `style(ui): harmoniser les notifications avec la couleur primaire`  
**Périmètre :** interfaces marchand, producteur, identificateur, coopérateur et back-office ; parcours d’authentification, onboarding, vente, stock, offline, voix, synchronisation, administration et API ; ergonomie, accessibilité, sécurité, performance, risques techniques et métier.

> **MISE À JOUR 22/09/2026 (MODE-961)** : les mentions de MFA back-office de
> ce rapport sont caduces — la vérification MFA du back-office a été **retirée**
> à la demande du porteur (login mono-facteur scrypt + verrous anti-force-brute
> conservés ; migration `20260921110000_mfa_totp` supprimée). Le point 7
> « MFA » de la synthèse sécurité est traité par ce retrait.

## 1. Conclusion exécutive

Jùlaba est un produit ambitieux, structuré autour d’un besoin métier cohérent : aider des acteurs du commerce informel ivoirien dans des contextes de connectivité intermittente et de littératie variable. L’architecture distingue correctement les espaces métier, s’appuie sur une source de vérité Supabase, protège les opérations critiques de stock par des RPC transactionnelles et prévoit une file offline avec rejeu idempotent. L’expérience vocale est traitée comme un canal métier plutôt que comme un simple ajout cosmétique, avec des confirmations pour les actions financières et des erreurs explicites lorsqu’un moteur ou une langue n’est pas disponible.

Le risque principal n’est donc pas l’absence de fonctionnalités. Il vient de la **surface produit devenue trop large par rapport à la capacité de validation réelle**. Une seule route client distribue plus de trente écrans marchands, six écrans producteur, six écrans coopératifs, sept écrans identificateur et plus de trente modules back-office. Le dépôt compte 112 routes API et 521 fichiers TypeScript/TSX recensés dans `src`. Cette richesse crée un risque de cohérence entre les interfaces, les droits, les données réelles et les parcours offline.

L’application paraît la plus mature sur les domaines suivants : authentification d’appareil, caisse et vente, stock transactionnel, synchronisation idempotente, séparation back-office/appareil et contrôles des RPC marchandes. Elle est moins aboutie sur les validations terrain, l’accessibilité systématique, la performance des modèles locaux, l’observabilité de production, les tests end-to-end et la cohérence documentaire. La validation de ce checkout n’a pas pu être exécutée dans le clone, car Bun et les dépendances ne sont pas installés dans l’environnement ; les commandes de qualité retournent donc `command not found`, et aucun audit visuel automatisé n’a été exécuté.

### Priorités immédiates

| Niveau | Priorité | Décision recommandée |
|---|---|---|
| **P0** | Sécurité et sortie terrain | Révoquer tout secret GitHub potentiellement exposé dans l’historique, vérifier la configuration de production, interdire les comptes démo et réaliser une revue de toutes les routes coopératives. |
| **P0** | Fiabilité métier | Valider sur appareils Android réels les parcours vente, stock, transfert, voix et reconnexion. Sans cette validation, ne pas présenter le produit comme « 100 % offline » sur le terrain. |
| **P1** | Cohérence produit | Réduire le périmètre de lancement à un noyau marchand/producteur/identificateur ; remettre les fonctions mockées ou incomplètes derrière un statut explicite. |
| **P1** | Accessibilité | Mettre en place une grille de tests clavier, lecteur d’écran, contraste, taille de texte, zoom et utilisation sans voix. |
| **P1** | Performance | Mesurer les budgets de démarrage, RAM, temps d’ouverture de modèle et taille d’APK sur des téléphones d’entrée de gamme. |
| **P2** | Maintenabilité | Découper les composants de plus de 500 lignes, centraliser les appels serveur et réconcilier la documentation avec le code et les migrations. |

## 2. Méthode et limites

L’audit a été réalisé par lecture du dépôt à la révision indiquée, cartographie des routes et composants, recherche des garde-fous d’authentification et de validation, lecture des migrations et de la documentation projet, puis inspection statique des patterns d’accessibilité et de performance. Les constats citent les fichiers du dépôt afin d’être vérifiables.

Les contrôles `bunx eslint .`, `bunx tsc --noEmit` et `bun run test` n’ont pas pu s’exécuter : l’environnement d’audit ne contient ni Bun ni `node_modules`. Il faut donc distinguer les constats **confirmés par le code** des résultats de tests **déclarés dans les notes internes mais non reproduits ici**. Aucun verdict de performance ne doit être considéré comme mesuré tant qu’il n’a pas été obtenu sur un appareil cible.

## 3. Cartographie globale des interfaces et acteurs

Le routage principal se trouve dans `src/app/page.tsx`. Il distribue les espaces suivants :

| Acteur | Interfaces principales | Parcours couverts |
|---|---|---|
| **Marchand** | Onboarding, authentification, accueil, caisse, vente rapide, mode marché, stock, transferts, dépenses, crédits, fournisseurs, points de vente, ventes, commandes, tontines, Keiwa, académie, fidélité, protection sociale, profil | Création de compte, connexion locale et serveur, ouverture/fermeture de caisse, vente tactile/vocale, suivi de stock, dépenses, crédit client, commerce hors connexion, fonctions d’accompagnement. |
| **Producteur** | Authentification, accueil, récoltes, commandes, stock, cycles, profil, aide littératie, modal vocale | Déclaration de récolte, suivi de cycle, réception de commandes, stock et journal agricole. |
| **Identificateur** | Authentification, accueil, identification, dossier détail, suivi, missions, brouillons, profil | Connexion terrain, enrôlement d’acteurs, capture de dossier, brouillon offline, mission et suivi. |
| **Coopérateur / président** | Authentification, accueil, membres, trésorerie, stock commun, besoins, profil, espace coopérative marchand | Création ou accès coopératif, adhésion, cotisations, achats groupés, distribution, trésorerie et stock commun. |
| **Back-office** | Authentification, MFA, dashboard, acteurs, carte, enrôlement, producteurs, zones, missions, identificateurs, objectifs, alertes, supervision, utilisateurs, rapports, audit, institutions, modération, mutations, contenus, monitoring IA, événements, analytics, scores, clés API, marketplace, livraison, communication, cron, configuration institution, Keiwa, ventes, tontines, sessions appareils, conflits de synchronisation, notifications, académie | Administration RBAC, supervision, correction de données, gestion des acteurs et contenus, suivi des opérations et résolution des conflits. |

Le choix d’un routage applicatif client unique facilite la réutilisation et le fonctionnement hybride avec Capacitor. En contrepartie, les interfaces ne bénéficient pas de routes URL indépendantes. Cela limite les liens profonds, la reprise après interruption, la navigation navigateur, le partage d’un écran précis et l’observabilité par parcours.

## 4. Audit par acteur et par interface

## 4.1 Marchand

### Authentification et onboarding

L’authentification marchand prend en charge le téléphone, le PIN, le schéma, le code visuel, la biométrie et plusieurs comptes sur un même appareil. La route `src/app/api/merchant/login/route.ts` vérifie le secret côté serveur, applique un verrouillage et crée ou renouvelle une session liée à l’appareil. Le client conserve également un artefact local pour permettre une reconnexion offline sur le même appareil.

Le point fort est la séparation entre preuve serveur, session appareil et accès local. Le risque est la complexité cognitive et technique du parcours. Un utilisateur peut avoir plusieurs comptes locaux, changer de méthode d’authentification, perdre ses données locales ou changer d’appareil. Il faut rendre explicites les concepts « compte », « appareil lié », « connexion hors connexion » et « reprendre un compte existant ». Le changement de téléphone et la reprise d’un compte doivent être testés avec un appareil ancien encore actif, un cookie supprimé et une reconnexion sans réseau.

Le composant `src/components/marchand/auth-screen.tsx` est très volumineux. Il concentre plusieurs méthodes d’entrée et augmente la probabilité de régression visuelle, de divergence entre les états clavier/tactile et de défaut de lecture par technologies d’assistance. Il doit être découpé en étapes et composants testables : identification du téléphone, choix de méthode, saisie, récupération, choix du compte, confirmation de liaison.

### Accueil, caisse et vente rapide

`HomeScreen`, `CaisseScreen`, `VenteRapideModal` et `VoiceModal` forment le parcours métier le plus important. L’accueil expose la caisse, les ventes, les dépenses, les alertes de stock, les notifications et des raccourcis vers les fonctions secondaires. Le choix de tuiles tactiles pour les fonctions auparavant accessibles seulement par la voix est une amélioration significative pour la robustesse du produit.

Le parcours de caisse est bien orienté action : ouverture de caisse, panier, montant reçu, monnaie à rendre, confirmation et clôture. L’idempotence des ventes et l’écriture transactionnelle du stock réduisent les risques de double enregistrement. La distinction entre opération originale et opération inverse est adaptée à un contexte financier.

Les risques résident dans les états exceptionnels : double appui sur « valider », fermeture de l’application après validation serveur mais avant mise à jour locale, vente sans stock, vente hors ligne puis modification du produit, caisse ouverte depuis plusieurs appareils et clôture avec écart. Ces scénarios doivent être visibles dans l’interface avec un identifiant d’opération, un statut clair et un accès à l’historique. Une notification ou une couleur seule ne suffit pas pour une opération financière.

Le code d’accueil emploie de bonnes pratiques d’accessibilité ponctuelles, notamment des `aria-label` sur les boutons iconographiques. Il faut toutefois vérifier les dialogues, l’ordre de focus, la restitution des montants masqués, les annonces de mise à jour du panier et la capacité à réaliser toute la vente au clavier ou avec un lecteur d’écran.

### Mode Marché et fonctionnement offline

Le Mode Marché est un bon choix produit : il réduit les distractions et correspond à une session de vente dédiée. La file offline et le rejeu FIFO idempotent sont documentés dans `src/lib/offline-db.ts` et `src/lib/sync-handlers.ts`. Les conflits définitifs sont censés devenir visibles plutôt que de boucler indéfiniment.

Le risque métier est la perception d’une réussite locale qui ne serait pas encore une réussite serveur. Les libellés doivent distinguer « enregistré sur ce téléphone », « synchronisé », « en attente » et « à résoudre ». Le statut doit rester compréhensible même après redémarrage, changement d’utilisateur sur téléphone partagé et expiration de session. La limite de capacité de file et le comportement lorsque la file est pleine doivent être annoncés avant de bloquer une vente.

Le produit revendique un fonctionnement 100 % offline natif, mais l’architecture Capacitor décrite dans `capacitor.config.ts` utilise un serveur distant via `server.url`. Le premier lancement sans réseau peut donc être inaccessible avant que l’application n’ait chargé son interface. Cette contradiction doit être traitée au niveau produit : soit embarquer un shell et les écrans critiques, soit reformuler l’engagement en « usage métier offline après chargement initial et installation des modèles ».

### Stock, transferts, achats et fournisseurs

Le périmètre stock est particulièrement complet : produits, unités, prix, mouvements, achats, transferts entre marchands et contrôle de stock insuffisant. Le choix d’un journal append-only et de RPC côté serveur est approprié. Les opérations vocales de réapprovisionnement ont été alignées sur le contrat d’achat, ce qui évite une modification directe et silencieuse de balance.

L’interface doit néanmoins rendre lisible la différence entre quantité disponible, quantité réservée, quantité en transit, mouvement en attente et quantité rejetée. Les transferts comportent plusieurs états et acteurs ; l’expéditeur et le destinataire doivent voir le même identifiant, l’horodatage, la quantité et le motif d’annulation. Toute incohérence d’affichage entre projection locale et balance serveur est un risque commercial élevé.

Le volume fonctionnel peut surcharger une marchande qui veut simplement enregistrer une vente. Il faut maintenir une séparation stricte entre le parcours « vente maintenant » et le parcours « administrer le stock », avec une recherche tolérante, des unités locales compréhensibles et un mode de correction guidé.

### Dépenses, crédits et fournisseurs

Les dépenses et crédits répondent à un besoin essentiel de suivi de trésorerie. Les écrans proposent des états vides et des saisies explicites, mais l’audit statique signale dans `depenses-screen.tsx` un historique de placeholder local ayant précédemment coexisté avec la persistance serveur. Ce type de dette est dangereux : l’utilisateur peut croire qu’un enregistrement est durable alors qu’il n’est que local.

Le crédit client exige une confidentialité renforcée. Les noms, montants et notes doivent être masqués au repos, protégés lors d’un changement de compte sur le téléphone partagé et non inclus dans des notifications trop détaillées. Les règles de correction, remboursement partiel, annulation et historique doivent être identiques dans le tactile et la voix.

### Tontines, Keiwa, fidélité, protection sociale et académie

Ces interfaces étendent fortement la proposition de valeur mais présentent un risque de maturité inégale. Les notes internes signalent des récompenses fidélité et un catalogue fournisseurs encore mockés ou partiellement ouverts. L’écran Académie contient un message de disponibilité future. Il faut distinguer dans l’UI une donnée métier réelle, une fonctionnalité en cours d’ouverture et un contenu d’exemple.

Keiwa, tontines et protection sociale touchent à des domaines financiers ou sociaux sensibles. Le produit ne doit pas afficher de solde, score, avantage ou statut de couverture fabriqué pour remplir une carte. Les actions doivent préciser si elles sont simulées, en attente ou effectivement exécutées par un partenaire. Les écrans doivent inclure une politique de confidentialité et un mécanisme de contestation ou de correction.

## 4.2 Producteur

L’espace producteur est plus réduit et plus lisible que l’espace marchand. Il couvre l’accueil agricole, récoltes, commandes, stock, cycles et profil. Le routage `ProdScreenRouter` recharge les données serveur lorsque le rôle est producteur, ce qui réduit le risque de rester sur une projection périmée.

Le parcours de déclaration de récolte et de cycle est adapté à un journal d’activité. Il faut toutefois tester l’ordre temporel des cycles, la correction d’une récolte déjà synchronisée, la saisie de dates sans réseau, les unités agricoles et le lien entre récolte, stock disponible et commande marchand. Les commandes doivent définir sans ambiguïté les engagements : demande reçue, acceptée, préparée, livrée, refusée ou annulée.

La modal vocale producteur partage une logique avec la modal marchand mais possède un squelette séparé. Cette duplication peut être justifiée par des intentions métier différentes, mais elle doit reposer sur un composant commun pour l’état d’écoute, la confirmation, les erreurs micro, la reprise après narration et la gestion de la langue. Le risque principal est une expérience vocale incohérente entre les deux acteurs.

L’aide à la littératie et la narration des écrans constituent un point fort. Il faut encore vérifier que les textes, erreurs, contrôles de formulaire et états de synchronisation sont entièrement narrés. Une annonce uniquement au changement d’écran ne suffit pas lorsque la sauvegarde ou la synchronisation échoue.

## 4.3 Identificateur

L’identificateur dispose d’un espace terrain spécifique : authentification, missions, identification, dossiers, brouillons, suivi et profil. Le wizard d’enrôlement et les fonctions OCR CNI/GPS sont adaptés à un contexte de collecte sur le terrain. La persistance de brouillons est critique et constitue une bonne réponse au risque d’interruption.

Le parcours doit être évalué sur trois dimensions. D’abord, la reprise : fermeture forcée après chaque étape, batterie faible, manque de stockage et retour à une mission commencée. Ensuite, la qualité des données : champs obligatoires, correction d’un OCR erroné, consentement, statut de la pièce et géolocalisation. Enfin, la gouvernance : qui peut corriger, soumettre, rejeter ou valider un dossier.

Le risque documenté de premier claim sans preuve serveur doit être traité comme une priorité de sécurité. Un code agent ou une identité locale ne doivent pas suffire à ouvrir l’accès à des dossiers sensibles. Les données d’identité et les images de documents doivent avoir une durée de rétention, un chiffrement, un contrôle d’export et une trace d’accès.

L’interface doit être utilisable dans des conditions extérieures : contraste au soleil, gros contrôles, saisie avec une main, appareil peu puissant, perte réseau et batterie limitée. Le mode soleil marchand/producteur ne doit pas être supposé disponible pour l’identificateur ; l’espace identificateur dispose d’un thème propre, mais cette différence doit être testée sur tout le parcours.

## 4.4 Coopérateur et président de coopérative

L’espace coopératif est un ajout métier important : membres, trésorerie, stock commun, besoins groupés et profil. La route principale `src/app/api/cooperatives/route.ts` applique `requirePresident`, ce qui constitue un contrôle pertinent pour les données de la coopérative présidée. Plusieurs routes spécialisées réutilisent aussi cette garde, valident les montants FCFA entiers et prévoient une idempotence par `clientId`.

Le risque est la lisibilité de la responsabilité. L’interface marchand « Ma coopérative » et l’espace président « Coopérative » représentent deux perspectives du même domaine. Les actions d’un membre, d’un président et d’un opérateur back-office doivent être distinguées visuellement et au niveau des droits. Une adhésion, une cotisation, un besoin et une distribution ne doivent pas partager un même vocabulaire trop générique.

La trésorerie agrège les écritures validées et borne la liste d’affichage à 100 lignes. C’est une bonne distinction entre calcul global et affichage paginé. Il faut toutefois prévoir pagination, export contrôlé, rapprochement et procédure de correction. Les opérations financières coopératives doivent suivre les mêmes garanties d’annulation et de journal append-only que la caisse marchand.

Les routes coopératives non centrées sur la coopérative présidée doivent faire l’objet d’une revue dédiée : membres, besoins, distribution, cotisation, recherche de coopérateurs, login et rejoindre. L’analyse statique ne permet pas de conclure à une vulnérabilité sur chacune, mais leur hétérogénéité de garde et de validation justifie un test d’autorisation par rôle et par identifiant de coopérative.

## 4.5 Back-office

Le back-office possède une couverture fonctionnelle très large et une architecture mieux protégée que la surface mobile. `BoGate` ne rend pas les écrans tant qu’une session serveur n’a pas été confirmée. Le modèle RBAC distingue les modules et introduit `canPerformAction` pour séparer lecture et écriture, ce qui corrige le risque classique consistant à réutiliser un droit de visibilité comme droit de mutation.

Le principal défaut est la densité. Plus de trente modules, plusieurs niveaux de rôles, cartes, tableaux, filtres, audits, actions de masse et écrans de configuration demandent une architecture d’information stricte. Les écrans doivent rendre visibles le périmètre de zone, le rôle actuel, la fraîcheur des données et les opérations qui nécessitent une double validation. Les tableaux doivent éviter la surcharge et proposer une recherche, une pagination, un état vide et un état d’erreur cohérents.

Les modules les plus sensibles sont les acteurs, enrôlements, identificateurs, sessions appareils, clés API, Keiwa, scores, tontines, commandes/livraisons et conflits de synchronisation. Toute action irréversible doit afficher la cible, la conséquence, l’auteur et la possibilité de retour. Les données financières et identifiantes nécessitent une limitation de visibilité par rôle et par zone, pas seulement un masquage visuel.

La route de changement de mot de passe (`src/app/api/backoffice/users/change-password/route.ts`) exige une session, le mot de passe actuel, une longueur minimale de huit caractères et une trace d’audit. C’est une base correcte, mais la politique reste faible pour un espace d’administration : absence apparente de vérification de compromission, de longueur maximale documentée, de limitation dédiée, de rotation des sessions et de notification de changement. Le comportement de `force_password_change` doit être testé avec une session MFA active et une session ancienne.

Les comptes de démonstration sont désactivés par défaut via `BACKOFFICE_DEMO_ACCOUNTS`. Lorsqu’ils sont activés, la route renvoie publiquement les emails, noms, rôles et zones. Cette configuration doit être impossible en production par garde de build ou valeur d’environnement signée, car une mauvaise variable suffit à transformer une commodité de preview en énumération d’identifiants.

## 5. Audit transversal des parcours et interactions

### Authentification, changement de rôle et déconnexion

Le produit gère plusieurs rôles et plusieurs méthodes d’accès. Il doit exister un parcours de déconnexion qui purge explicitement les projections locales, la file offline, les notifications et les modèles associés au compte sans supprimer les données d’un autre compte présent sur le téléphone. Le document `README.md` rappelle cette nécessité, mais elle doit être vérifiée par des tests de changement marchand/producteur/coopérateur/identificateur sur un seul appareil.

Le back-office est correctement séparé de l’état client persistant. Cette séparation doit devenir la règle pour toutes les fonctions sensibles. Aucun écran protégé ne doit être rendu sur la seule base d’un `currentScreen` persisté.

### Voix et langues

La chaîne française est structurée avec STT, NLU, TTS et confirmation. Les actions financières sont confirmables, le réapprovisionnement vocal suit désormais le contrat d’achat et les erreurs ne doivent pas basculer silencieusement d’une langue à une autre.

La roadmap baoulé reste le point le plus important de cohérence produit. Les documents ne sont pas synchronisés : `PROJECT_CONTEXT.md` indique que NLLB B2 est livré, tandis que `REQUIREMENTS.md` indique B2 et B3 à construire, et `ARCHITECTURE.md` affirme que la traduction est absente. Le code doit être la source de vérité. Tant que la traduction bci↔fr et la synthèse baoulé ne sont pas validées de bout en bout, le sélecteur de langue doit annoncer clairement les capacités réelles. Un réglage `ttsLanguage='bci'` sans voix baoulé effective crée une attente trompeuse, même si une notification de limite est prévue.

Les confirmations oui/non en baoulé doivent être traitées comme un risque métier P1. Une confirmation de vente comprise dans la mauvaise langue peut créer une perte financière ou une opération non autorisée.

### Synchronisation, erreurs et notifications

La présence d’une outbox FIFO est une force, mais la réussite utilisateur doit être alignée sur le statut de synchronisation. Il faut une page ou un panneau unique qui récapitule les opérations locales, synchronisées, en attente, rejetées et conflictuelles. Les notifications doivent conduire vers l’objet concerné et ne jamais exposer un montant ou une donnée privée sur un écran verrouillé sans réglage explicite.

Chaque mutation importante devrait avoir une corrélation visible : `operationId`, date, acteur, appareil et dernier verdict serveur. Cette corrélation est indispensable au support, au back-office et à la résolution des litiges.

### Navigation et reprise

L’absence de routes URL par écran est acceptable pour une application mobile, mais problématique pour le web. Elle empêche un lien direct vers un dossier, un conflit ou une commande et complique le retour navigateur. Il faut au minimum persister un contexte de navigation sûr, gérer le bouton retour matériel Android et proposer des liens internes stables pour les dossiers back-office.

## 6. Ergonomie et accessibilité

L’application montre une attention réelle à l’accessibilité : boutons iconographiques dotés d’étiquettes, mode soleil, narration de navigation, aide littératie, contrôles de taille et tuiles tactiles. Toutefois, ces améliorations sont distribuées de manière inégale et ne constituent pas encore une garantie systémique.

Les risques principaux sont les suivants :

1. **Dépendance résiduelle à la voix.** Toute action métier doit rester possible sans micro, notamment sur les écrans secondaires et en cas d’autorisation micro refusée.
2. **Focus des modales.** Les modales de vente, montant, confirmation et ouverture/fermeture de caisse doivent piéger le focus, rendre le titre accessible, restituer le focus au déclencheur et annoncer les erreurs.
3. **Contraste et mode soleil.** Les fonds colorés, textes semi-transparents et badges doivent être contrôlés avec WCAG AA, y compris dans les états désactivé, chargement et erreur.
4. **Taille et zoom.** Les montants et tableaux doivent rester lisibles à 200 % et avec le zoom texte natif. Les lignes compactes de back-office sont particulièrement à risque.
5. **Annonces dynamiques.** Les changements de panier, résultats de synchronisation, alertes de stock, erreurs réseau et confirmations financières doivent utiliser une région live appropriée sans interrompre abusivement la narration.
6. **Terminologie.** « caisse », « solde », « crédit », « en attente », « synchronisé » et « conflit » doivent être expliqués en français simple et rester stables dans toutes les interfaces.
7. **Gestes et clavier.** Les fonctions drag-and-drop, cartes, filtres et actions contextuelles doivent disposer d’une alternative clavier et tactile simple.

Le dépôt contient des labels explicites dans plusieurs écrans, mais la couverture n’est pas mesurée. Il faut ajouter une checklist automatisée et manuelle par acteur, avec axe clavier, lecteur d’écran, contraste, zoom, mouvement réduit et utilisation sans voix.

## 7. Sécurité et conformité

### Points forts

Les contrôles décrits dans `SECURITY_AUDIT.md` sont solides sur les routes marchandes et les RPC de stock : sessions appareil, cookies httpOnly, jetons aléatoires stockés sous forme hashée, MFA back-office, verrouillage, journal d’audit, RLS et révocation des droits d’exécution des RPC critiques. Le secret `SUPABASE_SERVICE_ROLE_KEY` est lu côté serveur et les composants client ne semblent pas importer le client administrateur.

La route de login marchand vérifie le code brut côté serveur, applique un lockout et émet un cookie de session. La liaison de session après preuve du secret est préférable à un claim direct par identifiant.

### Risques à traiter

1. **Secret GitHub potentiellement exposé.** `REQUIREMENTS.md` mentionne un PAT GitHub en clair, même tronqué. Il faut considérer le secret comme compromis, le révoquer, rechercher son empreinte dans l’historique et remplacer tout jeton CI.
2. **Durée de session appareil.** La durée documentée de 365 jours est longue pour un appareil partagé ou perdu. Une rotation, une révocation à distance et une réauthentification périodique sont nécessaires.
3. **Routes coopératives.** Les routes présentent des stratégies d’autorisation différentes. Une matrice testée doit couvrir membre, président, marchand non membre, autre coopérative, identificateur et back-office.
4. **Données d’identité.** OCR CNI, coordonnées GPS, téléphone, dossiers et historique d’accès doivent avoir des règles de conservation, d’export, de suppression et de consentement.
5. **Clés API et fonctions d’administration.** Les écrans de gestion de clés API, cron, communication et configuration institutionnelle nécessitent une double validation, une rotation et une journalisation sans secret.
6. **Logs.** Les `console.error` côté serveur doivent exclure les payloads, codes secrets, tokens, pièces d’identité et données financières.
7. **MFA.** Le mode de test doit être impossible à activer en production. La configuration doit être bloquée par environnement et contrôlée au démarrage.

## 8. Performance et risques techniques

La stack combine Next.js 16, React 19, Capacitor, plusieurs modèles ONNX/WASM, Tesseract, Recharts, Leaflet et des modèles vocaux. Cette combinaison peut être viable, mais la performance doit être budgétée par appareil et non déduite du build desktop.

Les risques les plus élevés sont la taille de l’APK, le chargement initial hybride distant, la mémoire WebView pendant TTS/STT/OCR, les téléchargements de modèles et l’exécution concurrente de plusieurs moteurs. Les notes projet mentionnent des modèles de plusieurs centaines de mégaoctets et un APK pouvant dépasser les limites de distribution. Un App Bundle et des téléchargements à la demande sont indispensables.

Le démarrage doit être instrumenté avec les mesures suivantes : temps jusqu’au premier écran utilisable, temps jusqu’à l’authentification, taille JS initiale, temps de chargement du modèle, RAM avant/après modèle, latence STT/TTS, autonomie, taux d’échec réseau et temps de rejeu de l’outbox. Ces mesures doivent être produites sur au moins un téléphone d’entrée de gamme et un téléphone intermédiaire utilisés en Côte d’Ivoire.

Le dépôt signale aussi des fichiers très volumineux, notamment `auth-screen.tsx` et plusieurs écrans dépassant 500 lignes. Cela augmente le coût de revue, de compilation et de chargement mental. La priorité n’est pas de découper mécaniquement, mais d’extraire les machines d’état, formulaires, tableaux et contrats serveur afin de réduire les régressions.

## 9. Fonctionnalités manquantes ou à clarifier

Les manques les plus importants sont :

- validation terrain du Baoulé sur locuteurs natifs, avec WER/CER, RTF, RAM et environnement de marché ;
- chaîne complète bci→fr→IA→fr→bci, y compris confirmations oui/non en Baoulé ;
- TTS Baoulé effectivement compréhensible, avec téléchargement opt-in et cache ;
- premier lancement réellement utilisable sans réseau, ou reformulation claire de l’engagement offline ;
- résolution complète des conflits avec écran utilisateur compréhensible et procédure de support ;
- pagination et rapprochement sur les historiques financiers et coopératifs ;
- audit end-to-end des parcours sensibles et tests sur APK réel ;
- statut explicite des fonctions fidélité, catalogue, académie et intégrations financières non ouvertes ;
- politique de conservation et de suppression pour données d’identité, géolocalisation, notifications et fichiers ;
- reprise de compte et révocation d’appareil documentées pour l’utilisateur final.

## 10. Plan d’amélioration priorisé

### Urgence P0 — avant pilote terrain ou mise en production élargie

1. Révoquer le PAT GitHub mentionné dans les documents, rechercher les traces historiques et vérifier les secrets CI/CD.
2. Interdire par build et par démarrage production `BACKOFFICE_DEMO_ACCOUNTS=true`, puis ajouter un test de non-exposition.
3. Écrire et exécuter une matrice d’autorisation pour toutes les routes coopératives et back-office sensibles.
4. Réaliser un smoke test APK sur appareils réels : installation, premier lancement sans réseau, login, vente, stock, transfert, clôture, redémarrage, reconnexion et conflit.
5. Vérifier qu’aucune fonction financière ou sociale n’affiche de donnée mockée en production.
6. Mettre en place une procédure de révocation appareil, effacement local et récupération de compte.

### Urgence P1 — stabilisation produit

1. Formaliser le noyau de lancement : authentification, caisse, vente, stock, dépenses, producteur, enrôlement et synchronisation.
2. Réconcilier `README.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `PROJECT_CONTEXT.md` et les composants de voix avec une matrice unique « livré / partiel / non livré ».
3. Mettre en place la page de statut offline : attente, succès serveur, erreur transitoire, conflit et action attendue.
4. Ajouter les tests end-to-end des parcours financiers et des transitions entre comptes sur un même appareil.
5. Définir et mesurer les budgets de performance sur appareils cibles.
6. Lancer une campagne d’accessibilité par acteur, en donnant la priorité au marchand et à l’identificateur.
7. Découpler les modales voix marchand/producteur sur un socle commun de machine d’état.
8. Ajouter la rotation des sessions appareil, la réauthentification périodique et une révocation back-office clairement visible.

### Urgence P2 — industrialisation

1. Découper les fichiers de plus de 500 lignes par domaine fonctionnel et machine d’état.
2. Centraliser les accès Supabase côté serveur derrière des services typés et supprimer le code mort.
3. Remplacer les routes client implicites par des URLs profondes pour les écrans back-office et les dossiers.
4. Ajouter une observabilité corrélée : opération, acteur, appareil, latence, tentative de rejeu et verdict.
5. Documenter les contrats d’annulation, correction, audit et conservation des données.
6. Revoir la politique de mot de passe, les limites de taille, les rate limits et les alertes de sécurité.

### Urgence P3 — amélioration continue

1. Mesurer la compréhension des libellés auprès d’utilisateurs et d’utilisatrices de niveaux de littératie différents.
2. Étendre la couverture de lecteur d’écran et de zoom aux modules back-office.
3. Optimiser le découpage des bundles, les modèles à la demande et la libération mémoire des moteurs vocaux.
4. Établir un rituel de revue documentaire à chaque feature et migration.

## 11. Critères de sortie recommandés

Le projet peut être considéré prêt pour un pilote limité lorsque les cinq conditions suivantes sont réunies :

- les gates lint, typecheck, tests unitaires, RLS et build sont verts dans un environnement propre et reproductible ;
- les parcours critiques sont validés sur appareils réels, réseau coupé puis rétabli ;
- la matrice d’autorisation des rôles est testée sur les API et l’interface ;
- aucun secret, compte démo ou jeu de données mocké n’est exposé par défaut ;
- le statut des langues et modèles vocaux est exact, compréhensible et vérifié par des utilisateurs cibles.

## 12. Références du dépôt

[1]: `README.md` "Présentation, périmètre métier et architecture déclarée"
[2]: `src/app/page.tsx` "Routage applicatif et séparation des espaces acteurs"
[3]: `src/lib/offline-db.ts` "File locale et mutations offline"
[4]: `src/lib/sync-handlers.ts` "Rejeu et synchronisation des opérations"
[5]: `src/app/api/merchant/login/route.ts` "Authentification marchand et liaison appareil"
[6]: `src/app/api/backoffice/users/change-password/route.ts` "Changement du mot de passe back-office"
[7]: `src/app/api/backoffice/demo-accounts/route.ts` "Exposition conditionnelle des comptes de démonstration"
[8]: `src/app/api/cooperatives/route.ts` "Accès président à la coopérative"
[9]: `src/lib/backoffice-permissions.ts` "RBAC et séparation lecture/écriture"
[10]: `.ai/SECURITY_AUDIT.md` "État déclaré des contrôles de sécurité"
[11]: `.ai/REQUIREMENTS.md` "Exigences et roadmap multilingue"
[12]: `.ai/ARCHITECTURE.md` "Architecture technique et dette identifiée"
[13]: `.ai/BUGS.md` "Registre des bugs et points d’attention"
[14]: `.ai/TEST_PLAN.md` "Plan de tests et couverture déclarée"
[15]: `src/components/marchand/home-screen.tsx` "Accueil marchand et raccourcis métier"
[16]: `capacitor.config.ts` "Configuration Capacitor et serveur distant"
[17]: `.github/workflows/ci.yml` "Pipeline CI lint, typecheck, tests et pgTAP"

---

**Avis final :** Jùlaba dispose d’une base technique sérieuse pour un pilote, mais son niveau de confiance doit être limité aux domaines effectivement testés. La prochaine étape ne devrait pas être d’ajouter de nouveaux modules. Elle devrait consister à fermer les écarts P0/P1, valider les parcours sur appareils réels et rendre l’état fonctionnel des langues, données et synchronisations parfaitement explicite pour chaque acteur.
