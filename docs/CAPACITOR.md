# Jùlaba — Capacitor (apps mobiles natives)

## Architecture : pourquoi "hybride distant" et pas un export statique

Jùlaba est une application Next.js complète (SSR, routes API sous
`src/app/api/**`, base de données Supabase (Postgres), `next.config.ts` avec
`output: "standalone"`). Elle ne peut pas être exportée en HTML/JS statique
(`next export`) : les écrans Backoffice, marchand et identificateur
dépendent tous d'appels serveur (`fetch('/api/...')`) et d'une session
serveur (voir l'audit sécurité Backoffice).

Capacitor est donc configuré en mode **hybride distant** : la coquille
native (Android/iOS) charge directement l'URL de votre backend Next.js
déployé, exactement comme le ferait un navigateur, mais avec en plus le pont
JS Capacitor qui expose les APIs natives (caméra, GPS, notifications, etc.)
aux composants React existants.

```ini
┌─────────────────────────────┐        HTTPS         ┌────────────────────┐
│  Coquille native (WebView)  │ ───────────────────▶  │  Next.js déployé   │
│  Android / iOS + plugins    │ ◀───────────────────  │  (API + Supabase)  │
└─────────────────────────────┘                        └────────────────────┘
```

## Configuration du serveur

`capacitor.config.ts` lit la variable d'environnement `CAPACITOR_SERVER_URL`
__au moment où vous lancez la CLI Capacitor__ (`cap sync` / `cap open` /
`cap run`), pas au runtime de l'app :

```bash
# Production (build à distribuer)
CAPACITOR_SERVER_URL=https://julaba.vercel.app npx cap sync

# Émulateur Android (le backend tourne sur votre machine via `npm run dev`)
CAPACITOR_SERVER_URL=https://julaba.vercel.app/ npx cap sync

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
| `@capacitor/core` (**SystemBars**) | Barres système modernes (status + navigation) pour l'edge-to-edge — livré avec le core, voir la section ci-dessous |
| `@capacitor/splash-screen` | Écran de démarrage natif (utilise `splash.png`/`splash-dark.png`) |
| `@capacitor/keyboard` | Redimensionnement lors de l'ouverture du clavier, masque les barres de navigation basses |
| `@capacitor/app` | Bouton retour matériel Android, état de l'app |
| `@capacitor/network` | État réseau unique de l'app (`src/lib/stores/network-store.ts`) : bandeau « Hors ligne », sync au retour, notifications « connexion perdue/rétablie » — fonctionne aussi sur le web via `navigator.onLine` |
| `@capacitor/haptics` | Retour haptique sur les actions de confirmation |
| `@capacitor/share` | Partage de reçus/rapports |
| `@capacitor/browser` | Ouverture des liens externes dans un navigateur in-app |
| `@capacitor/dialog` | Boîtes de dialogue natives |
| `@capacitor/device` | Informations sur l'appareil (diagnostics, journal d'audit) |
| `@capacitor/clipboard` | Copier le mot de passe temporaire généré à la création d'un utilisateur BO |
| `@capacitor/action-sheet` | Menus d'actions natifs sur mobile |
| `@capacitor/screen-reader` | Détection lecteur d'écran actif (accessibilité) |
| `@capacitor/text-zoom` | Respect des réglages d'accessibilité (taille de texte système) |
| `@aparajita/capacitor-biometric-auth` | Déverrouillage rapide par empreinte/Face ID côté Marchand — voir `src/lib/biometric-auth.ts`, branché dans `auth-screen.tsx` |
| `@aparajita/capacitor-secure-storage` | Stockage chiffré (Keychain/Keystore) pour tokens et PIN hachés — voir `src/lib/secure-storage.ts` |

Le bootstrap (`src/lib/capacitor.ts`, monté via
`src/components/capacitor-provider.tsx` dans `src/app/layout.tsx`) configure
les barres système (`SystemBars.setStyle`), masque l'écran de démarrage, gère
le clavier et le bouton retour Android. Il ne fait rien sur le web
(`Capacitor.isNativePlatform()` est alors `false`).

### Barres système & edge-to-edge (SystemBars)

Depuis Android 15 (targetSdk 36), l'edge-to-edge est **forcé** : la WebView
dessine sous les barres système et les anciens appels
`setOverlaysWebView(false)` / `setBackgroundColor()` du plugin
`@capacitor/status-bar` sont ignorés. Le plugin a donc été **retiré** au
profit de `SystemBars`, livré avec `@capacitor/core` (aucun package à
installer) :

- `capacitor.config.ts` → `plugins.SystemBars` :
   - `insetsHandling: "css"` — le bridge Android injecte les variables CSS
      `--safe-area-inset-*` (valeurs correctes) et neutralise le bug
      `env(safe-area-inset-*)` des WebView Android < 140 ;
   - `style: "LIGHT"` — icônes/texte **sombres** sur fond clair (thème clair
      forcé de l'app ; la valeur `"DARK"` historique donnait des icônes
      blanches invisibles sur le beige `#FAFAF7`).

- `src/lib/capacitor.ts` → `SystemBars.setStyle({ style: LIGHT })` au
   démarrage (les deux barres).
- `MainActivity.java` → `EdgeToEdge.enable(this)` avant `super.onCreate` :
   edge-to-edge **uniforme** sur toutes les versions d'Android (déjà forcé
   sur Android 15+ ; Capacitor 9 l'appliquera par défaut via
   `insetsHandling: "native"`).
- `android/app/src/main/res/values/colors.xml` — **créé** (Task 30) :
   `styles.xml` référençait `@color/colorPrimary/colorPrimaryDark/colorAccent`
   sans qu'ils soient définis → le build Gradle échouait à l'étape resource
   linking. La fenêtre prend `#FAFAF7` en fond (plus de flash blanc entre le
   splash et le premier rendu).

L'app gère les insets côté web depuis longtemps (`viewport-fit="cover"` dans
`src/app/layout.tsx`, utilitaires `.pt-safe`/`.pb-safe`/`.pl-safe`/`.pr-safe`
et usages `env(safe-area-inset-*)` directs dans ~30 écrans). Les utilitaires
`*-safe` prennent désormais `max(env(...), var(--safe-area-inset-*))` — les
usages `env()` inline des écrans restent corrects sur WebView ≥ 140 ; sur
WebView < 140 ils valent 0 et les éléments critiques doivent migrer vers les
variables injectées si un problème visuel est constaté sur de vieux appareils.

### Réseau : source de vérité unique

`src/lib/stores/network-store.ts` concentre l'état réseau (`connected`,
`connectionType`, `hydrated`) : UN seul listener natif `@capacitor/network`
(alimenté par `initNetworkWatcher()` appelé par le provider racine) et tout
le monde s'abonne au store — le bandeau « Hors ligne », le hook
`useNetworkStatus()` (keiwa, écrans secondaires, panneau de notifications),
le watcher de notifications (gate des ticks + sync au retour) et le sync
flusher. `classifyNetworkTransition()` distingue la résolution initiale du
statut (jamais notifiée à l'utilisateur) d'une vraie perte/rétablissement
(déclenche re-claim de session, sync des files et notifications
« connexion perdue/rétablie »).

Caméra et GPS sont déjà branchés dans l'écran d'enrôlement
(`src/components/identificateur/ident-identification-screen.tsx`) : ils
utilisent les plugins natifs sur l'app, et retombent sur les APIs web
(`<input capture>`, `navigator.geolocation`) dans un onglet de navigateur
classique. Le déverrouillage biométrique est branché dans l'écran de
connexion Marchand (`auth-screen.tsx`) : un bouton "Déverrouiller avec
l'empreinte" apparaît sur l'étape de saisie du code PIN quand la biométrie
est disponible, et réutilise le même chemin de connexion qu'un code correct.

### Données hors ligne

Capacitor ne fournit pas de base locale métier. `src/lib/offline-db.ts` conserve
uniquement une interface de refus explicite pour les anciens appelants; aucune
mutation n'est écrite dans SQLite, IndexedDB ou `localStorage`. Les écritures
sont effectuées par les routes Next.js puis Supabase dès que le réseau est
disponible.

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
   photothèque, localisation, micro, reconnaissance vocale et Face ID.

## Notifications push (Task 29) : côté client fait, côté serveur à activer

### Ce qui est branché (fonctionne dès que FCM est configuré)

- __Bootstrap__ (`src/lib/capacitor.ts` → `initNativeNotifications`, monté
   via `CapacitorProvider`) : création des 3 canaux Android
   (`julaba-critical` / `julaba-important` / `julaba-info`, mapping
   sévérité→canal dans `src/lib/notifications/channels.ts`), demande de la
   permission Android 13+ (POST_NOTIFICATIONS), enregistrement FCM et envoi
   du token au serveur (`POST /api/push-tokens`).
- __Token côté serveur__ : route `src/app/api/push-tokens/route.ts`
   (identité = cookie de session appareil, upsert sur token unique — un
   appareil qui change de compte réattribue sa ligne) + table
   `device_push_tokens` (migration `20260918120000`). Repli gracieux : la
   route répond `{ ok: true, stored: false }` tant que la migration n'est
   pas appliquée, le client retente à chaque lancement / retour réseau.
- __Push reçu app ouverte__ (`src/lib/notifications/native.ts`) : routé
   vers le feed in-app (dédup par `deduplicationKey`, la copie serveur fait
   foi), toast uniquement si data-only (un push avec bloc `notification` est
   déjà affiché par le système), tap → navigation `action_route`.
- __Rappels locaux qui tirent même app fermée__
   (`src/lib/notifications/schedule.ts`) : rappel quotidien de clôture de
   caisse à 19h tant qu'une session est ouverte (abonnement du watcher à
   l'état caisse) et rappels d'échéance de tontine J-1/J-J à 8h (recalculés
   à chaque chargement de l'écran tontines). Volontairement INEXACTS
   (`isExactNotification: false`) : pas d'écran système « Alarmes et
   rappels », livraison possible différée en Doze — acceptable pour un
   rappel. `RECEIVE_BOOT_COMPLETED` les ré-arme après redémarrage.
- Respect des préférences : rien n'est planifié pour une catégorie masquée
   (`isNotificationHiddenForPrefs`), évalué au moment de la programmation.

### Ce qu'il reste à faire pour RECEVOIR les push (étape manuelle)

Le client est prêt mais inerte tant que les identifiants n'existent pas —
`PushNotifications.register()` échoue silencieusement (log
« registration error »), l'app fonctionne sans push :

1. **Android** : créer un projet Firebase, y déclarer l'app Android
   `ci.julaba.app`, puis déposer le `google-services.json` dans
   `android/app/` — le plugin Gradle google-services s'applique
   automatiquement quand le fichier existe (bloc conditionnel déjà en
   place dans `android/app/build.gradle`).
2. Appliquer la migration `20260918120000` sur la DB Supabase.
3. __Envoi serveur__ (non fait — choix externes) : un émetteur FCM HTTP v1
   (compte de service Firebase) qui lirait `device_push_tokens` et enverrait
   le payload au contrat documenté en tête de `native.ts`
   (`notification` + `data` avec `deduplicationKey`/`actionRoute`/`category`…,
   `android.channel_id` parmi les 3 canaux julaba).
4. **iOS** : capacité "Push Notifications" dans Xcode (fichier
   `.entitlements`) + clé APNs. Les rappels locaux fonctionnent sans rien
   configurer.

### Note icônes push/locales

Par défaut Android utilise l'icône de l'app (carré blanc possible). À
prévoir : une icône monochrome dans `android/app/src/main/res/drawable`
référencée via `LocalNotifications.smallIcon` (config Capacitor) et
`com.google.firebase.messaging.default_notification_icon` (manifest).

## Note sur les noms de paquets communautaires

Le cahier des charges mentionnait `@capacitor-community/biometric-auth`,
`@capacitor-community/background-runner` et
`@capacitor-community/secure-storage` : ces trois noms n'existent plus (ou
pas) sur npm. Paquets réellement installés, activement maintenus pour
Capacitor 8 :

- `@aparajita/capacitor-biometric-auth` (au lieu de `capacitor-native-biometric`,
   qui ne déclare qu'une dépendance dure sur `@capacitor/core@^3`, obsolète et
   source de conflit de versions avec Capacitor 8).
- `@aparajita/capacitor-secure-storage`.

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

__Voir [SHERPA_ONNX.md](./SHERPA_ONNX.md) pour le détail précis de ce qui
manque__ — dépendance native (Maven côté Android, SPM côté iOS, toutes
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

## Build APK de test (réalisé le 2026-09-18, Task 32)

Le premier APK Android de test a été compilé avec succès sur Linux sans
Android Studio (SDK en ligne de commande + JDK Temurin). Procédure
reproductible :

```bash
# 0. Prérequis : JDK complet (javac) 21+, pas un simple JRE
#    (ex. Temurin 21 : https://api.adoptium.net — exporter JAVA_HOME)

# 1. Dépendances lourdes (AAR sherpa-onnx 1.13.8 + modèle FR int8) — ~180 Mo
./scripts/fetch-android-deps.sh

# 2. SDK Android en ligne de commande (si absent)
#    cmdline-tools : https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
#    sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0"
#    → android/local.properties : sdk.dir=<chemin du SDK>

# 3. Synchroniser la config Capacitor
npx cap sync android

# 4. Compiler
cd android && ./gradlew assembleDebug
#    APK : android/app/build/outputs/apk/debug/app-debug.apk (~294 Mo —
#    modèle FR 127 Mo + natives sherpa/onnxruntime toutes ABIs embarquées)

# 5. Installer sur téléphone (débogage USB activé)
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Correctifs rendus possibles par ce premier build (Task 32) :

- `android/app/build.gradle` : dépendance jitpack `com.github.k2-fsa…`
   (jamais testée, insoutenable) remplacée par l'AAR officiel précompilé
   téléchargé dans `android/app/libs/` (git-ignoré, script ci-dessus).
- `android/app/src/main/res/values/colors.xml` : commentaire XML contenant
   `--` (interdit) qui cassait `mergeDebugResources`.

Important : l'app est en mode « hybrid remote » — la coque native charge le
serveur déployé (`https://julaba.vercel.app/` par défaut, cf.
`capacitor.config.ts`). L'APK de test affiche donc la prod ; pour tester
une branche locale sur le téléphone :
`CAPACITOR_SERVER_URL=http://<lan-ip>:3000 npx cap sync android` avant le
build (ou build prod après déploiement Vercel).
