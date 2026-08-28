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

Le bootstrap (`src/lib/capacitor.ts`, monté via
`src/components/capacitor-provider.tsx` dans `src/app/layout.tsx`) configure
automatiquement la barre de statut, masque l'écran de démarrage, gère le
clavier et le bouton retour Android. Il ne fait rien sur le web
(`Capacitor.isNativePlatform()` est alors `false`).

Caméra et GPS sont déjà branchés dans l'écran d'enrôlement
(`src/components/identificateur/ident-identification-screen.tsx`) : ils
utilisent les plugins natifs sur l'app, et retombent sur les APIs web
(`<input capture>`, `navigator.geolocation`) dans un onglet de navigateur
classique.

## Permissions natives déjà déclarées

- **Android** (`android/app/src/main/AndroidManifest.xml`) : caméra,
  localisation (fine + approximative), micro (saisie vocale), notifications
  (Android 13+).
- **iOS** (`ios/App/App/Info.plist`) : descriptions d'usage caméra,
  photothèque, localisation, micro, reconnaissance vocale.

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
