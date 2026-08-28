# Jùlaba — Capacitor (apps mobiles natives)

## Architecture : pourquoi "hybride distant" et pas un export statique

Jùlaba est une application Next.js complète (SSR, routes API sous
`src/app/api/**`, base de données Prisma/SQLite, `next.config.ts` avec
`output: "standalone"`). Elle ne peut pas être exportée en HTML/JS statique
(`next export`) : les écrans Backoffice, marchand et identificateur
dépendent tous d'appels serveur (`fetch('/api/...')`) et d'une session
serveur (voir l'audit sécurité Backoffice).

Capacitor est donc configuré en mode **hybride distant** : la coquille
native (Android/iOS) charge directement l'URL de votre backend Next.js
déployé, exactement comme le ferait un navigateur, mais avec en plus le pont
JS Capacitor qui expose les APIs natives (caméra, GPS, notifications, etc.)
aux composants React existants.

```
┌─────────────────────────────┐        HTTPS         ┌────────────────────┐
│  Coquille native (WebView)  │ ───────────────────▶  │  Next.js déployé   │
│  Android / iOS + plugins    │ ◀───────────────────  │  (API + DB Prisma) │
└─────────────────────────────┘                        └────────────────────┘
```

## Configuration du serveur

`capacitor.config.ts` lit la variable d'environnement `CAPACITOR_SERVER_URL`
**au moment où vous lancez la CLI Capacitor** (`cap sync` / `cap open` /
`cap run`), pas au runtime de l'app :

```bash
# Production (build à distribuer)
CAPACITOR_SERVER_URL=https://app.julaba.ci npx cap sync

# Émulateur Android (le backend tourne sur votre machine via `npm run dev`)
CAPACITOR_SERVER_URL=http://10.0.2.2:3000 npx cap sync

# Appareil physique sur le même réseau local
CAPACITOR_SERVER_URL=http://<ip-de-votre-machine>:3000 npx cap sync
```

Sans cette variable, l'app native chargera le contenu local minimal de
`capacitor-www/` (page de repli hors-ligne uniquement) — pensez à toujours
la définir avant `cap sync`/`cap open`.

`cleartext` (HTTP non chiffré) n'est autorisé que si l'URL commence par
`http://` (donc uniquement en développement local) ; la production doit
être en `https://`.

## Plugins installés

| Plugin | Usage dans Jùlaba |
|---|---|
| `@capacitor/camera` | Photo de l'acteur, photo de l'étal, capture de documents (écran d'identification) |
| `@capacitor/geolocation` | Coordonnées GPS lors de l'enrôlement |
| `@capacitor/filesystem` | Stockage local de fichiers (exports, pièces jointes) |
| `@capacitor/push-notifications` | Notifications push (alertes Backoffice, rappels) — nécessite vos propres identifiants FCM/APNs, voir plus bas |
| `@capacitor/local-notifications` | Rappels programmés côté appareil |
| `@capacitor/preferences` | Stockage clé-valeur natif (alternative à localStorage) |
| `@capacitor/status-bar` | Style de la barre de statut (clair/sombre) |
| `@capacitor/splash-screen` | Écran de démarrage natif (utilise `splash.png`/`splash-dark.png`) |
| `@capacitor/keyboard` | Redimensionnement lors de l'ouverture du clavier, masque les barres de navigation basses |
| `@capacitor/app` | Bouton retour matériel Android, état de l'app |
| `@capacitor/network` | Bandeau "Hors ligne" (fonctionne aussi sur le web via `navigator.onLine`) |
| `@capacitor/haptics` | Retour haptique sur les actions de confirmation |
| `@capacitor/share` | Partage de reçus/rapports |
| `@capacitor/browser` | Ouverture des liens externes dans un navigateur in-app |
| `@capacitor/dialog` | Boîtes de dialogue natives |
| `@capacitor/device` | Informations sur l'appareil (diagnostics, journal d'audit) |
| `@capacitor/clipboard` | Copier le mot de passe temporaire généré à la création d'un utilisateur BO |
| `@capacitor/action-sheet` | Menus d'actions natifs sur mobile |
| `@capacitor/screen-reader` | Détection lecteur d'écran actif (accessibilité) |
| `@capacitor/text-zoom` | Respect des réglages d'accessibilité (taille de texte système) |
| `@capacitor/background-runner` | Synchronise la file d'attente hors-ligne (ventes, dossiers) dès le retour du réseau, même app en arrière-plan — voir `capacitor-www/runners/sync-runner.js` |
| `@capacitor-community/sqlite` | Base de données locale relationnelle (mode **hors-ligne** : brouillons de vente, dossiers d'enrôlement) — voir `src/lib/offline-db.ts` |
| `@aparajita/capacitor-biometric-auth` | Déverrouillage rapide par empreinte/Face ID côté Marchand — voir `src/lib/biometric-auth.ts`, branché dans `auth-screen.tsx` |
| `@aparajita/capacitor-secure-storage` | Stockage chiffré (Keychain/Keystore) pour tokens et PIN hachés — voir `src/lib/secure-storage.ts` |

Le bootstrap (`src/lib/capacitor.ts`, monté via
`src/components/capacitor-provider.tsx` dans `src/app/layout.tsx`) configure
automatiquement la barre de statut, masque l'écran de démarrage, gère le
clavier et le bouton retour Android. Il ne fait rien sur le web
(`Capacitor.isNativePlatform()` est alors `false`).

Caméra et GPS sont déjà branchés dans l'écran d'enrôlement
(`src/components/identificateur/ident-identification-screen.tsx`) : ils
utilisent les plugins natifs sur l'app, et retombent sur les APIs web
(`<input capture>`, `navigator.geolocation`) dans un onglet de navigateur
classique. Le déverrouillage biométrique est branché dans l'écran de
connexion Marchand (`auth-screen.tsx`) : un bouton "Déverrouiller avec
l'empreinte" apparaît sur l'étape de saisie du code PIN quand la biométrie
est disponible, et réutilise le même chemin de connexion qu'un code correct.

### Base de données locale hors-ligne (SQLite)

`src/lib/offline-db.ts` ouvre une base SQLite partagée
(`@capacitor-community/sqlite`, avec repli web via `jeep-sqlite` +
`sql-wasm.wasm` copié dans `public/assets/`) et expose une file d'attente
générique `pending_sync` : n'importe quel écran peut appeler
`queuePendingSync(entity, payload)` pendant une coupure réseau (ou tout
simplement un `fetch` qui échoue), puis `flushAllPendingSync()` la vide dès
que `@capacitor/network` signale le retour de la connexion
(`src/components/capacitor-provider.tsx`).

**Câblé sur un vrai flux métier — l'inscription Marchand et l'encaissement**
(`src/components/marchand/auth-screen.tsx`, `caisse-screen.tsx`) :

- L'inscription d'un compte Marchand (PIN, schéma, ou code visuel — les 3
  méthodes) était jusque-là **100% locale** : `POST /api/merchant` existait
  côté serveur mais n'était jamais appelé. `registerMerchantAccount()`
  l'appelle maintenant à l'inscription, avec l'id généré côté client
  (`crypto.randomUUID()`) réutilisé côté serveur — pas de réconciliation
  entre un id local et un id serveur. En cas d'échec (hors-ligne), la
  demande est mise en file (`entity: 'merchant'`).
- La validation d'une vente (bouton "Valider" du paiement) ne faisait rien
  d'autre que fermer la modale — ni décrément de stock server-side,
  ni écriture en base : `handleCompleteSale()` était défini mais jamais
  appelé (bug préexistant, corrigé au passage). Elle appelle maintenant
  `POST /api/marchand/sales`, avec repli sur la file (`entity: 'sale'`) en
  cas d'échec.
- `src/lib/sync-handlers.ts` enregistre l'ordre de vidage de la file :
  `merchant` avant `sale`, puisqu'une vente référence l'id du marchand en
  clé étrangère — un marchand encore en attente de synchronisation ne doit
  pas voir ses ventes échouer pour rien.
- Le schéma `Merchant` a été étendu (`patternHash`, `visualCodeHash`,
  `authMethod`, `pinHash` rendu optionnel) : il ne supportait que
  l'authentification par PIN, alors que le mode par défaut de l'app est le
  code visuel.

Les brouillons d'identification (`ident-identification-screen.tsx`)
utilisent le même primitive mais ne sont pas encore branchés — même
raisonnement que pour la caisse à l'origine (éviter de réécrire une
couche de données sans tests sur appareil réel), à faire au besoin.

## Permissions natives déjà déclarées

- **Android** (`android/app/src/main/AndroidManifest.xml`) : caméra,
  localisation (fine + approximative), micro (saisie vocale), notifications
  (Android 13+), vibration (haptics), stockage (Android ≤12 uniquement),
  biométrie.
- **iOS** (`ios/App/App/Info.plist`) : descriptions d'usage caméra,
  photothèque, localisation, micro, reconnaissance vocale, Face ID, modes
  d'arrière-plan (`UIBackgroundModes` : fetch + processing) pour
  `@capacitor/background-runner`.

## Notifications push : ce qu'il reste à faire

Le plugin `@capacitor/push-notifications` est installé et prêt côté client,
mais l'envoi de notifications nécessite vos propres identifiants, que je ne
peux pas générer pour vous :

- **Android** : un projet Firebase + fichier `google-services.json` à placer
  dans `android/app/`.
- **iOS** : activer la capacité "Push Notifications" dans Xcode (génère un
  fichier `.entitlements`), et un certificat/clé APNs.

Le serveur applicatif devra ensuite stocker les tokens d'appareil (nouvelle
route API + table Prisma) et appeler FCM/APNs pour déclencher l'envoi — non
fait dans cette passe, car cela dépend de choix externes (fournisseur,
credentials).

## Note sur les noms de paquets communautaires

Le cahier des charges mentionnait `@capacitor-community/biometric-auth`,
`@capacitor-community/background-runner` et
`@capacitor-community/secure-storage` : ces trois noms n'existent plus (ou
pas) sur npm. Paquets réellement installés, activement maintenus pour
Capacitor 8 :

- `@capacitor/background-runner` — passé officiel (équipe Ionic), pas
  communautaire.
- `@aparajita/capacitor-biometric-auth` (au lieu de `capacitor-native-biometric`,
  qui ne déclare qu'une dépendance dure sur `@capacitor/core@^3`, obsolète et
  source de conflit de versions avec Capacitor 8).
- `@aparajita/capacitor-secure-storage`.
- `@capacitor-community/sqlite` — celui-là existe bien tel quel.

## STT 100% hors-ligne (sherpa-onnx) : scaffold, pas fonctionnel

Il n'existe pas de plugin Capacitor officiel ou communautaire pour
sherpa-onnx. Un plugin **local** (non publié sur npm) a été scaffoldé pour
servir de point de départ :

- `src/lib/voice/sherpa-stt.ts` — interface TypeScript (`isAvailable`,
  `initModel`, `startRecognition`, `stopRecognition`), enregistrée via
  `registerPlugin('SherpaStt')`.
- `android/app/src/main/java/ci/julaba/app/SherpaSttPlugin.java` — stub
  Android, enregistré manuellement dans `MainActivity.java`
  (`registerPlugin(SherpaSttPlugin.class)`, nécessaire pour un plugin local).
- `ios/App/App/SherpaSttPlugin.swift` — stub iOS.

**Ce scaffold ne fonctionne pas encore** : `isAvailable()` renvoie toujours
`{ available: false }`, et les autres méthodes rejettent. La voix continue
donc de passer par `src/lib/voice/stt.ts` (Web Speech API dans la WebView) —
fonctionnel, mais pas hors-ligne.

**Voir [SHERPA_ONNX.md](./SHERPA_ONNX.md) pour le détail précis de ce qui
manque** — dépendance native (Maven côté Android, SPM côté iOS, toutes
deux vérifiées existantes), choix et embarquement du modèle français,
capture audio native (`AudioRecord`/`AVAudioEngine`) avec exemple de code
pour chaque plateforme, câblage des événements vers le JS, et estimation
d'effort.

⚠️ **`SherpaSttPlugin.swift` doit être ajouté au target Xcode manuellement**
("Add Files to App…" dans Xcode) : `ios/App/App.xcodeproj` utilise le format
de liste de fichiers explicite (pas les groupes synchronisés du système de
fichiers d'Xcode 16), donc un fichier déposé directement dans le dossier
n'est pas compilé tant qu'il n'est pas ajouté depuis Xcode. Éditer
`project.pbxproj` à la main depuis un environnement sans Xcode est le genre
de changement qu'il est facile de rendre subtilement invalide sans pouvoir
l'ouvrir pour vérifier — volontairement non fait ici.

## Limites de cet environnement de build

Cette configuration a été scaffoldée et vérifiée (`npx cap sync` réussit
sans erreur pour les deux plateformes) dans un environnement Linux sans SDK
Android ni Xcode installés. Concrètement :

- `android/` et `ios/` sont des projets natifs complets et committés.
- Générer un `.apk`/`.aab` nécessite le SDK Android (`ANDROID_HOME`) +
  Gradle (présents partiellement ici, SDK absent) — à faire depuis une
  machine avec Android Studio.
- Générer un `.ipa` nécessite macOS + Xcode — impossible depuis Linux.

## Workflow de développement

```bash
# 1. Installer les dépendances (déjà fait)
npm install

# 2. Démarrer le serveur Next.js
npm run dev

# 3. Synchroniser la config + les plugins vers les projets natifs
CAPACITOR_SERVER_URL=http://10.0.2.2:3000 npx cap sync   # Android emulator
# ou
CAPACITOR_SERVER_URL=http://<lan-ip>:3000 npx cap sync   # appareil physique

# 4. Ouvrir dans l'IDE natif
npx cap open android   # nécessite Android Studio
npx cap open ios       # nécessite Xcode (macOS)
```

Après toute modification de `capacitor.config.ts` ou installation d'un
nouveau plugin, relancez `npx cap sync`.
