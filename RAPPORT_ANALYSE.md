# Rapport d'analyse de `julaba-app`

Date de l'audit : 20 septembre 2026

## Périmètre et méthode

L'analyse porte sur le dépôt GitHub demandé `SOMET1010/julaba-app`, et non sur le remote préconfiguré du workspace local (`akoun-dev/julaba`). Le snapshot analysé est :

- branche : `main`
- commit : `e17992a1be2e869b9df59890e69edaba42e53e81`
- message : `Merge pull request #246 from SOMET1010/claude/clever-allen-dnr8by`
- version applicative déclarée : `5.0.0`, `appVersion: 5.0.0.20`

L'audit est statique : lecture des composants frontend, services voix, plugins Android, contrôleurs backend, documentation produit et scripts de build. Aucun secret n'est inclus dans ce rapport. Les tests du workspace local ne sont pas considérés comme des résultats du dépôt audité, qui possède une architecture et des scripts distincts.

## Résumé exécutif

Jùlaba dispose d'une surface fonctionnelle importante : marchand, producteur, coopérative, identificateur, institution et back-office, avec caisse, stock, commandes, crédit, tontines, Keiwa, Academy, notifications, audit et synchronisation hors ligne. L'architecture actuelle est toutefois en transition : frontend Vite/React Router et backend NestJS/TypeORM cohabitent avec une forte dépendance aux scripts et aux conventions documentaires.

Les points bloquants avant un pilote terrain fiable sont les suivants :

1. **La chaîne voix native n'est pas auto-garantie par le build.** Les modèles STT/TTS et l'AAR Sherpa sont téléchargés par `android/scripts/installer-voix.sh`, volontairement hors Git. Un build Android sans cette étape produit une application dont la voix peut être indisponible, avec un repli clavier ou un silence pour les montants dynamiques.
2. **La vente, le crédit et le paiement ne forment pas encore un contrat métier unique démontré de bout en bout.** La documentation identifie elle-même le panier unique et l'atomicité vente + stock + dette comme des prérequis.
3. **Les capacités annoncées ne sont pas distinguées par canal.** Le Web garde le clavier comme filet et l'APK porte la STT hors ligne ; le mobile money, la livraison opérationnelle et certaines fonctions sociales sont encore partiellement recettés ou conditionnels.
4. **La surface fonctionnelle est plus large que la profondeur de recette.** Le dépôt contient beaucoup de routes et modules, mais les preuves terrain ciblent surtout la caisse espèces, le stock et le guidage vocal marchand.
5. **La sécurité est sérieuse sur plusieurs points, mais la surface d'administration, les données personnelles et les flux de paiement exigent une recette dédiée avant production élargie.** Le backend utilise JWT/cookies, Helmet, validation et throttling, mais le démarrage automatique du schéma et la présence de routes internes nécessitent un cloisonnement opérationnel strict.

**Verdict :** base prometteuse pour un pilote marchand Android limité, sous réserve de verrouiller la chaîne de build voix, le parcours vente/crédit hors ligne, les paiements réellement supportés et une recette appareil complète. Ce n'est pas encore une base suffisamment prouvée pour présenter toutes les fonctions comme disponibles en production.

## Fonctionnalités présentes

### Marchand

Les routes principales sont déclarées dans `frontend_src/src/app/routes.tsx` :

- accueil et authentification ;
- caisse espèces (`POSCaisse`), dépenses et résumé de caisse ;
- catalogue et stock (`GestionStock`) ;
- ventes passées et partage de reçu ;
- marché virtuel, commandes et négociation ;
- crédits, tontines, fidélité et protection sociale ;
- Keiwa : portefeuille, transfert, paiements, banque, carte, historique ;
- Academy, profil, support et paramètres.

### Autres surfaces

Le dépôt inclut également :

- producteur : production, récoltes, stocks, commandes et publication ;
- coopérative : membres, stock commun, commandes, finances et trésorerie ;
- identificateur : dossiers, brouillons, suivi, acteurs, statistiques et rapports ;
- institution : tableaux de bord, acteurs, supervision, analytics et audit ;
- back-office : enrôlement, acteurs, missions, modération, mutations, carte, reporting, Keiwa, API keys et monitoring.

### Voix et hors ligne

- sortie audio centralisée par `frontend_src/src/app/services/audioManager.ts` ;
- clips Tata embarqués pour les phrases fixes ;
- STT natif Sherpa-ONNX via `android/app/src/main/java/com/julaba/app/SherpaSttPlugin.kt` ;
- TTS natif Sherpa/Piper via `android/app/src/main/java/com/julaba/app/SherpaTtsPlugin.kt` ;
- intents locaux et caisse hors ligne dans `frontend_src/src/app/voice-offline/` ;
- file de synchronisation et idempotence dans les contextes caisse/services ;
- WebAuthn/biométrie et sessions multiples côté authentification.

## Fonctionnalités manquantes ou incomplètes

### P0/P1 : à traiter avant pilote élargi

#### 1. Build voix non reproductible sans étape manuelle

**Constat :** `android/scripts/installer-voix.sh` télécharge l'AAR Sherpa, le modèle STT français d'environ 71 Mo et le modèle TTS d'environ 79 Mo. Les fichiers sont exclus du dépôt et aucun workflow CI/CD visible ne prouve que ce script est exécuté avant `assembleDebug` ou `assembleRelease`.

**Références :**

- `android/scripts/installer-voix.sh:1-20,66-106` ;
- `SherpaSttPlugin.kt:27-32` ;
- `SherpaTtsPlugin.kt:40-47` ;
- `docs/RUNTIME_VOCAL_HORS_LIGNE.md:9-21` ;
- `.gitignore:39-41` et absence des assets dans le snapshot.

**Impact :** une build valide techniquement peut être livrée avec `isAvailable() = false`. La vente vocale, la dictée du montant et la lecture dynamique peuvent alors ne pas fonctionner sur l'APK. Le repli clavier ne couvre pas le besoin d'une marchande non lectrice.

**Correctif recommandé :** faire du téléchargement/vérification des assets une étape obligatoire et contrôlée du pipeline Android ; produire un manifeste avec tailles, hashes, licences et version de modèles ; faire échouer le build release si les assets requis manquent ; ajouter un smoke test APK qui vérifie STT, TTS et lecture d'un montant.

#### 2. Vente vocale et caisse tactile doivent partager un seul panier vérifié

**Constat :** `docs/AUDIT_UX.md:13-24` et `docs/PARCOURS.md:44-57` identifient encore deux parcours historiques et posent comme règle cible un panier unique. Le code contient plusieurs orchestrateurs (`CaisseContext`, `useVoiceCore`, `offlineCaisse`, `POSCaisse`, `SaisieGuidee`) ; la convergence doit être démontrée, pas seulement documentée.

**Impact :** risque de divergence entre produit, quantité, prix dicté, stock, paiement et total affiché. Une divergence sur un prix ou une quantité est un incident financier, pas un simple défaut UX.

**Correctif recommandé :** exposer un contrat unique `Cart/Order` avec invariants ; faire passer voix, tactile et saisie guidée par la même commande ; tester correction vocale, fusion de ligne, suppression, rechargement, paiement échoué et rejeu hors ligne avec les mêmes identifiants d'idempotence.

#### 3. Crédit et paiement non entièrement recettés comme transaction atomique

**Constat :** `docs/AUDIT_UX.md:17-20,70-79` demande une transaction atomique vente + stock + dette et précise que le mobile money doit être masqué ou marqué pilote tant qu'il n'est pas recetté. `docs/PARCOURS.md:185-193` confirme que Keiwa et le backend existent mais que le paiement réel bout en bout n'est pas démontré.

**Références code :** `frontend_src/src/app/components/marchand/CreditModal.tsx`, `frontend_src/src/app/components/wallet/`, `backend/src/wallets/`, `backend/src/commandes-rest/`.

**Impact :** dette créée sans vente, paiement confirmé sans livraison, ou affichage d'un succès alors que le fournisseur de paiement n'a pas confirmé l'opération.

**Correctif recommandé :** définir un état de transaction explicite (`initiated`, `pending`, `confirmed`, `failed`, `reversed`) ; imposer la confirmation serveur et la preuve avant le message de succès ; rendre le crédit atomique au niveau DB ; afficher clairement « pilote »/« en attente » pour tout flux non confirmé.

#### 4. Promesse mains-libres non satisfaite

**Constat :** `docs/PARCOURS.md:177-183` indique que le mot-réveil a été retiré et que la voix se déclenche au toucher. `docs/AUDIT_UX.md:121-122` demande de trancher cette promesse.

**Impact :** le discours « mains libres » ou « oreillette » peut induire une attente erronée. Dans un marché, le toucher obligatoire est une contrainte importante.

**Correctif recommandé :** soit réintroduire un wake word hors ligne avec recette anti-déclenchement, soit supprimer la promesse marketing et afficher « toucher pour parler » sur tous les canaux concernés.

### P2 : fonctionnel à cadrer ou approfondir

- **Protection sociale :** `frontend_src/src/app/components/marchand/ProtectionSociale.tsx` repose encore sur un suivi local et des API officielles attendues (`docs/PARCOURS.md:65-66,191-193`). Afficher clairement le statut informatif et l'absence de cotisation officielle.
- **Livraison :** les statuts de commande existent, mais pas un suivi transporteur complet (`docs/PARCOURS.md:194-197`). Ne pas présenter un statut comme une logistique opérationnelle.
- **Marché virtuel :** négociation présente mais couverture vocale absente (`docs/PARCOURS.md:153-156`). La tâche principale d'une marchande non lectrice reste donc dépendante du texte pour cette partie.
- **Identification terrain :** le flux d'identification existe, mais le consentement oral avant photo, document et géolocalisation est identifié comme manquant (`docs/AUDIT_UX.md:94-97`).
- **Langues locales :** la documentation définit le français comme pack par défaut et les packs Dioula/Bambara comme séparés (`docs/RUNTIME_VOCAL_HORS_LIGNE.md:29-31`). Le périmètre réellement livré et recetté par langue doit être affiché dans l'application et dans le kit terrain.
- **Studio et collecte voix :** `frontend_src/src/app/routes.tsx:48-55` expose des outils internes. Leur présence est utile, mais ils doivent être protégés par un mode opérateur explicite et ne pas être atteignables par un utilisateur final par simple URL en production.

## Bonnes pratiques recommandées

### Architecture et données

1. Formaliser les contrats partagés dans un package typé frontend/backend ou via OpenAPI généré. Le dépôt possède de nombreux contrôleurs et DTO, mais les contrats métier critiques sont dispersés.
2. Conserver une source de vérité append-only pour l'argent et dériver caisse, marge, dette et rapports de ce journal. C'est déjà le principe de `CONSTITUTION.md:106-151`; il faut le rendre vérifiable par invariants en CI et en production.
3. Remplacer les comportements « fallback non transactionnel » des modules financiers par des opérations DB atomiques, ou les marquer explicitement comme mode dégradé non acceptable pour une confirmation financière.
4. Versionner les migrations et interdire le `synchronize` en production. `backend/src/main.ts:16-47` prévoit une construction automatique sur base vierge ; ce comportement doit rester strictement limité au développement et être protégé par une politique d'environnement vérifiable.
5. Documenter un ADR pour chaque changement de contrat argent, crédit, synchronisation et paiement, conformément à `CONSTITUTION.md:116-132`.

### Voix

1. Garder une seule file audio et un verrou parole/écoute. `docs/AUDIT_VOIX.md:28-55` signale encore des contournements du manager par `onboardingVoix.direIntro`, `LoginPassword.parle()`, `ModeAccesSwitcher`, `BOProfil` et les bips WebAudio.
2. Ajouter une matrice de capacités par canal : Web, PWA, APK Android, iOS, hors ligne/ligne, STT/TTS/langues.
3. Rendre les états vocaux observables : écoute, traitement, confirmation, erreur, permission micro, modèle absent, synchronisation en attente.
4. Prévoir une phrase de correction et une annulation à chaque étape. Une reconnaissance vocale qui transcrit sans permettre « non », « corrige » et « annule » ne constitue pas un parcours voix complet.
5. Tester la non-régression « Tata ne s'entend pas elle-même » : couper toute sortie audio avant l'ouverture du micro et vérifier les appels concurrents.

### Sécurité

1. Vérifier que toutes les routes sensibles utilisent systématiquement les guards d'authentification, d'autorisation et de propriétaire ; ajouter des tests négatifs par rôle et par utilisateur.
2. Maintenir les cookies `HttpOnly`, `Secure`, `SameSite` adaptés au canal et faire tourner les secrets en production. La configuration est présente dans `backend/src/auth/auth.controller.ts` et `backend/src/main.ts`, mais doit être vérifiée en environnement réel.
3. Ne jamais exposer les routes internes (`/studio-voix`, `/collecte-voix`, `/database`, `/create-super-admin`, `/admin-recovery`) hors mode développeur ou rôle opérateur dédié. Les routes diagnostic sont filtrées par `import.meta.env.DEV` dans `routes.tsx`, mais le Studio/collecte restent déclarés hors de cette condition.
4. Réduire les autorisations CSP à la liste réellement nécessaire. `backend/src/main.ts:177-200` autorise plusieurs domaines sensibles, dont OpenAI, ElevenLabs, Cloudinary, paiement et Sentry ; chaque origine doit être justifiée par un flux actif.
5. Mettre en place une politique de rétention et de chiffrement pour photos, documents d'identité, géolocalisation, journaux vocaux et données financières.
6. Ajouter des limites de taille et de durée spécifiques aux uploads et aux endpoints PDF/CSV, en plus de la limite JSON globale de 10 Mo (`backend/src/main.ts:171-174`).

### Performance et fiabilité

1. Maintenir le lazy loading des routes, mais mesurer les budgets de bundle et le temps avant première interaction sur Android entrée de gamme.
2. Éviter de charger tous les providers globaux pour chaque surface si leur coût est mesurable (`frontend_src/src/app/App.tsx:64-107`). Un découpage par rôle réduirait le coût initial et les risques de couplage.
3. Encadrer la dictée pseudo-live basée sur `ScriptProcessor` dans `offlineStt.ts:90-175` : cette API est ancienne, coûteuse et peut dégrader les appareils bas de gamme. Prévoir une stratégie AudioWorklet ou un mode push-to-talk borné.
4. Ajouter des métriques de synchronisation : âge de la plus vieille opération, nombre d'échecs, conflit, dernière réussite, espace local restant.
5. Tester les migrations sur base vide et base existante dans un pipeline isolé ; le démarrage automatique doit être couvert par des tests de déploiement, pas uniquement par des commentaires.

### Accessibilité et expérience utilisateur

1. Recetter à 375/390 px, au soleil, avec grands textes, contraste renforcé, navigation clavier et lecteur d'écran.
2. Garantir des cibles tactiles d'au moins 44 à 48 px et ne jamais faire porter une information critique par la seule couleur.
3. Faire de la voix un moyen d'agir, pas seulement de lire : le critère est « vendre sans lire », avec relecture produit/quantité/prix/total et correction orale.
4. Conserver le panier et le brouillon après erreur, perte réseau, rechargement et expiration de session ; distinguer « enregistré sur le téléphone » de « synchronisé ».
5. Réduire l'entrée onboarding et proposer le premier succès vocal avant les téléchargements lourds, comme recommandé dans `docs/AUDIT_UX.md:26-38`.
6. Vérifier les libellés standardisés, les `aria-label`, le focus des modales et les annonces d'état. Les composants doivent rester utilisables quand la voix est indisponible.

## Risques et dettes techniques

| Priorité | Risque / dette | Preuve | Conséquence |
|---|---|---|---|
| P0 | Assets voix hors Git et étape manuelle | `android/scripts/installer-voix.sh`, `.gitignore` | APK silencieux ou sans STT selon le pipeline |
| P0 | Divergence possible entre caisse, voix, stock et crédit | `CaisseContext`, `useVoiceCore`, `offlineCaisse`, `docs/AUDIT_UX.md` | Erreur financière, doublon ou vente perdue |
| P1 | Paiement numérique non recetté bout en bout | `docs/PARCOURS.md:185-190`, `backend/src/wallets` | Faux succès ou fonds bloqués |
| P1 | Promesse mains-libres sans wake word | `docs/PARCOURS.md:177-183` | Friction terrain et perte de confiance |
| P1 | Contournements du manager audio | `docs/AUDIT_VOIX.md:28-55` | Chevauchement parole/écoute, faux intents |
| P1 | Routes internes potentiellement exposées | `frontend_src/src/app/routes.tsx:48-55` | Accès à des outils de collecte/diagnostic |
| P1 | Schéma automatique sur base vierge | `backend/src/main.ts:16-47` | Déploiement non maîtrisé si mauvais environnement |
| P2 | Gros graphe de providers globaux | `frontend_src/src/app/App.tsx:64-107` | Temps de démarrage, couplage et maintenance |
| P2 | `ScriptProcessor` pour pseudo-live | `frontend_src/src/app/voice-offline/offlineStt.ts:107-158` | CPU, batterie et instabilité appareils modestes |
| P2 | Code mort ou composants historiques | `docs/AUDIT_VOIX.md:22-25,55` et backlog | Réactivation accidentelle d'un flux cloud ou doublon |
| P2 | Recette terrain incomplète sur fonctions profondes | `docs/BACKLOG.md:59-78` | Régressions non détectées malgré CI verte |

## État des tests et de la qualité

### Points positifs

- Le frontend possède une suite très large de tests ciblés : caisse, panier, voix, hors ligne, langues, FCFA, accessibilité tactile, auth, crédits, marge et routes.
- Le backend possède des tests unitaires et des tests de contrôleurs, notamment auth, Academy et stock.
- Le backend active `ValidationPipe` global, Helmet, Sentry et throttling (`backend/src/main.ts`, `backend/src/app.module.ts`).
- Des recettes Maestro existent dans `maestro/` et une documentation de recette existe dans `docs/RECETTE.md`.

### Gaps de validation

- Aucun résultat CI ou build exécutable n'a été produit dans cet audit pour le snapshot distant ; la présence de scripts ne prouve pas leur passage sur la branche publiée.
- La recette Android réelle STT/TTS, permissions micro, modèles présents, téléphone verrouillé, batterie faible et stockage presque plein doit être obligatoire.
- La recette mobile money doit couvrir callback, timeout, double appui, reprise après fermeture et réconciliation serveur.
- Les tests doivent inclure des propriétés/invariants argent : conservation du total, idempotence, absence de double débit, cohérence stock/crédit.
- Il faut ajouter une matrice de tests par canal et par rôle, notamment pour les routes internes, les autorisations et les états expirés.

## Priorités

### P0 — bloque le pilote

1. Rendre le build voix reproductible, vérifiable et bloquant si les modèles/artefacts manquent.
2. Prouver un parcours vente unique voix + tactile + stock + espèces + hors ligne + synchronisation idempotente.
3. Empêcher tout succès financier tant que le serveur n'a pas confirmé la transaction ; verrouiller crédit et paiement.

### P1 — à terminer avant généralisation

1. Décider et corriger la promesse mains-libres/wake word.
2. Unifier tous les chemins audio sous `audioManager` et tester l'exclusion parole/écoute.
3. Fermer les outils internes et vérifier les guards sur les modules administratifs, wallet, export et identité.
4. Recetter Android réel, permissions, modèles, réseau faible, expiration de session et reprise après crash.
5. Marquer explicitement les fonctions pilotes ou dépendantes d'une API externe.

### P2 — amélioration structurante

1. Réduire le couplage des providers et documenter les contrats API générés.
2. Remplacer `ScriptProcessor` ou limiter le pseudo-live aux appareils capables de le supporter.
3. Étendre l'accessibilité vocale du marché virtuel, Keiwa, protection sociale et identification.
4. Supprimer le code mort, consolider les composants historiques et compléter les ADR.
5. Mettre en place observabilité produit : taux de vente vocale réussie, correction, abandon, conflit de synchro et panne audio par version d'APK.

## Plan d'action concret

### Phase 0 — décision et garde-fous, 1 à 2 jours

- Établir la matrice Web/PWA/APK/iOS : STT, TTS, hors ligne, paiement, biométrie, notifications.
- Décider si le pilote promet le toucher vocal ou le mains-libres.
- Geler les nouvelles fonctions secondaires pendant la stabilisation du parcours vente.
- Ajouter une checklist release avec secrets, migrations, assets voix, licences, hashes et smoke tests.

### Phase 1 — noyau vente, 3 à 5 jours

- Faire de la commande/panier unique le contrat consommé par `POSCaisse`, `useVoiceCore`, `offlineCaisse` et la saisie guidée.
- Ajouter les invariants argent/stock/crédit et les tests d'idempotence.
- Tester : correction, annulation, fusion, panier persistant, rechargement, offline, reconnexion et conflit.
- Ne jouer le message vocal « vente enregistrée » qu'après le verdict correct du contrat.

### Phase 2 — chaîne voix et APK, 2 à 4 jours

- Intégrer l'installation des modèles dans CI/release ou publier un artefact Android signé contenant les assets validés.
- Vérifier la présence, la taille, le hash et la licence de chaque fichier.
- Unifier les derniers chemins audio autour d'`audioManager`.
- Ajouter une recette appareil automatisée : voix Tata fixe, montant dynamique, STT français, permission refusée, moteur absent, stop et concurrence.

### Phase 3 — sécurité et paiements, 3 à 5 jours

- Auditer tous les contrôleurs avec matrice rôle/ressource/propriétaire.
- Protéger ou retirer les routes studio, collecte et diagnostic en production.
- Recetter wallet et paiement avec états asynchrones, callbacks signés, réconciliation et annulation.
- Vérifier migrations base neuve/existante sans `synchronize` en production.

### Phase 4 — recette terrain, 1 semaine

- Rejouer les scénarios Maestro et les scénarios réels sur plusieurs Android d'entrée de gamme.
- Mesurer temps de démarrage, consommation, mémoire, stockage, taux de compréhension et taux de correction.
- Faire tester par des marchandes non lectrices : ouverture, vente, monnaie, dépense, stock bas, erreur micro et perte réseau.
- Publier seulement les fonctionnalités dont la matrice de capacités et la preuve de recette sont vertes.

## Conclusion

Le dépôt est riche et comporte déjà de bonnes bases : séparation frontend/backend, validation backend, observabilité, tests ciblés, offline-first, audio centralisé en intention et documentation de gouvernance. La dette principale vient de l'écart entre cette richesse fonctionnelle et la preuve de fiabilité du noyau métier.

La priorité n'est pas d'ajouter de nouveaux écrans. Elle est de rendre incontestable le parcours : **parler → vérifier → corriger → panier unique → payer → confirmer → synchroniser**. Une fois ce parcours prouvé sur APK réel, les fonctions conditionnelles comme Keiwa, la protection sociale, la négociation vocale et les langues supplémentaires pourront être activées progressivement sans augmenter le risque financier ou la dette de confiance.
