# Sherpa-onnx — ce qu'il manque pour un STT 100% hors-ligne fonctionnel

Ce document détaille précisément ce qui reste à faire pour que le scaffold
sherpa-onnx (`src/lib/voice/sherpa-stt.ts`,
`android/app/src/main/java/ci/julaba/app/SherpaSttPlugin.java`,
`ios/App/App/SherpaSttPlugin.swift`) passe d'un stub qui rejette toujours à
une reconnaissance vocale réelle, entièrement embarquée sur l'appareil.

Recherché et vérifié contre le dépôt officiel
[k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) le 2026-08-28.
Pas encore implémenté ici : ce travail touche du code natif (Kotlin/Swift)
que je ne peux ni compiler ni tester sans SDK Android/Xcode dans cet
environnement — voir CAPACITOR.md pour cette limite. Ce document donne le
plan d'implémentation précis, pas juste des pistes.

## État actuel

| Élément | État |
|---|---|
| Interface TypeScript (`sherpa-stt.ts`) | ✅ Définie, `registerPlugin('SherpaStt')` |
| Plugin Android (`SherpaSttPlugin.java`) | ⚠️ Stub — `isAvailable()` renvoie toujours `false`, les autres méthodes rejettent |
| Plugin iOS (`SherpaSttPlugin.swift`) | ⚠️ Stub, **pas encore ajouté au target Xcode** (voir CAPACITOR.md) |
| Dépendance native sherpa-onnx | ❌ Absente |
| Modèle de reconnaissance embarqué | ❌ Absent |
| Capture audio → flux sherpa-onnx | ❌ Absente |
| Câblage dans l'app (remplacement/complément du Web Speech API) | ❌ Absent |

Tant que ce qui suit n'est pas fait, la voix continue de fonctionner via
`src/lib/voice/stt.ts` (Web Speech API dans la WebView) — pas hors-ligne,
mais opérationnel.

## Ce qui manque — vue d'ensemble

1. **Dépendance native** : ajouter sherpa-onnx comme dépendance de build,
   côté Android et iOS séparément (mécanismes différents).
2. **Modèle** : choisir, télécharger et embarquer (ou télécharger à la
   première ouverture) un modèle de reconnaissance streaming en français.
3. **Capture audio** : lire le micro en PCM 16 kHz mono côté natif (pas la
   Web Audio API du WebView) et nourrir le moteur en continu.
4. **Boucle de reconnaissance** : implémenter le cycle
   `decode → getResult → isEndpoint → reset` et renvoyer les résultats à la
   couche JS (résultats partiels + finaux, via un événement de plugin).
5. **Câblage applicatif** : décider où/quand utiliser `SherpaStt` plutôt que
   (ou en plus de) `stt.ts`, et gérer le cas où le modèle n'est pas encore
   téléchargé/chargé.
6. **Tests sur appareil réel** : les émulateurs ne reflètent ni la
   saturation du micro en environnement bruyant (marché), ni la latence
   réelle du moteur sur un processeur d'entrée de gamme.

## 1. Dépendance native

### Android — la voie la plus simple : Maven Central

sherpa-onnx publie un artefact Maven officiel, pas seulement des sources à
compiler soi-même :

```gradle
// android/app/build.gradle
dependencies {
    implementation "com.k2fsa.sherpa.onnx:sherpa-onnx-android:1.13.2"
    // vérifier la dernière version : https://github.com/k2-fsa/sherpa-onnx/releases
}
```

Cet artefact embarque déjà les bibliothèques natives (`.so` pour
arm64-v8a/armeabi-v7a/x86_64/x86) et les classes Kotlin
(`com.k2fsa.sherpa.onnx.OnlineRecognizer`, `OnlineStream`,
`OnlineRecognizerConfig`, etc.) — pas besoin de copier des fichiers `.kt`
sources dans le projet ni de builder depuis les sources C++.

`SherpaSttPlugin.java` (actuellement en Java pur, volontairement, pour
éviter d'introduire le plugin Gradle Kotlin dans un module qui n'en avait
pas besoin jusque-là — voir la note dans CAPACITOR.md) devra soit :
- être réécrit en Kotlin (nécessite d'appliquer
  `org.jetbrains.kotlin.android` dans `android/build.gradle` et
  `android/app/build.gradle`, avec une version compatible d'AGP 8.13 — à
  vérifier/tester, non fait ici pour la même raison que précédemment : un
  changement de toolchain Gradle que je ne peux pas valider par une
  compilation réelle), soit
- appeler l'API Kotlin de sherpa-onnx depuis Java (fonctionne, l'API Kotlin
  générée est utilisable depuis Java sans souci, juste un peu moins
  idiomatique).

### iOS — la voie la plus simple : Swift Package Manager

sherpa-onnx publie aussi un package SPM officiel, et
`ios/App/CapApp-SPM/Package.swift` (déjà généré par Capacitor pour tous les
plugins de ce projet) est l'endroit naturel pour l'ajouter :

```swift
// ios/App/CapApp-SPM/Package.swift
dependencies: [
    // ... dépendances Capacitor existantes ...
    .package(url: "https://github.com/k2-fsa/sherpa-onnx", from: "1.13.2")
],
targets: [
    .target(
        name: "CapApp-SPM",
        dependencies: [
            // ... dépendances existantes ...
            .product(name: "SherpaOnnx", package: "sherpa-onnx") // nom exact du produit à vérifier dans Package.swift du dépôt
        ]
    )
]
```

Ce fichier étant généré/mis à jour automatiquement par `npx cap sync`
(voir les diffs déjà apportés par les plugins Capacitor installés),
l'ajouter à la main risque d'être écrasé au prochain sync — le faire plutôt
via Xcode ("Add Package Dependency…") une fois le fichier
`SherpaSttPlugin.swift` lui-même ajouté au target (voir CAPACITOR.md pour
pourquoi ce fichier doit être ajouté depuis Xcode et pas par édition de
`project.pbxproj`).

## 2. Choisir et embarquer un modèle

sherpa-onnx propose un modèle streaming (Zipformer) entraîné en français :
[`csukuangfj/sherpa-onnx-streaming-zipformer-fr-2023-04-14`](https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-fr-2023-04-14)
sur Hugging Face. Composants attendus dans ce type de modèle streaming
transducer :

- `encoder-epoch-*.onnx` (le plus gros fichier)
- `decoder-epoch-*.onnx`
- `joiner-epoch-*.onnx`
- `tokens.txt`

⚠️ Les tailles rapportées pour ce modèle varient selon la source consultée
(de l'ordre de quelques dizaines de Mo à ~400 Mo selon la variante fp32 vs
int8 quantifiée, et selon que l'archive regroupe plusieurs variantes) — à
vérifier directement sur la page Hugging Face avant de décider, l'accès à
huggingface.co était bloqué depuis cet environnement au moment de la
rédaction. **Privilégier la variante quantifiée int8** si elle existe pour
ce modèle : elle réduit fortement la taille et la latence, avec une perte
de précision généralement acceptable pour de la commande vocale courte
(montants, produits) plutôt que de la dictée longue.

### Où stocker le modèle

Deux options, à trancher selon la taille réelle constatée :

- **Embarqué dans l'app** (asset Android / resource bundle iOS) : simple,
  fonctionne dès l'installation sans réseau, mais grossit l'APK/IPA de
  plusieurs dizaines à centaines de Mo — attention à la limite de 150 Mo
  pour l'APK de base sur le Play Store (au-delà, il faut passer par un
  Android App Bundle avec livraison différée / à la demande).
- **Téléchargé au premier lancement** (via `@capacitor/filesystem`, déjà
  installé) : garde l'app légère à l'installation, mais nécessite une
  connexion au moins une fois — à concilier avec le positionnement
  "hors-ligne" de Jùlaba (acceptable si le téléchargement initial se fait
  au moment de l'onboarding, quand une connexion est disponible ; documenter
  clairement cette exception à l'utilisateur).

Étant donné le contexte (téléphones d'entrée de gamme, réseau
intermittent), la seconde option avec mise en cache locale est probablement
préférable, mais c'est un arbitrage produit, pas seulement technique — à
valider avec l'équipe plutôt que décidé unilatéralement ici.

## 3. Capture audio (Android)

Le WebView (Web Speech API / `getUserMedia`) ne peut pas nourrir un moteur
natif directement : il faut capturer le micro côté Kotlin/Java avec
`AudioRecord`, au format que sherpa-onnx attend (16 kHz, mono, PCM 16 bits) :

```kotlin
val sampleRateInHz = 16000
val bufferSize = AudioRecord.getMinBufferSize(
    sampleRateInHz, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
) * 2

val audioRecord = AudioRecord(
    MediaRecorder.AudioSource.MIC, sampleRateInHz,
    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize
)

// Boucle de capture (thread dédié, pas le thread UI) :
val buffer = ShortArray(bufferSize)
while (isRecording) {
    val n = audioRecord.read(buffer, 0, buffer.size)
    if (n > 0) {
        val samples = FloatArray(n) { buffer[it] / 32768.0f }
        stream.acceptWaveform(samples, sampleRate = sampleRateInHz)

        while (recognizer.isReady(stream)) {
            recognizer.decode(stream)
        }
        val text = recognizer.getResult(stream).text
        if (recognizer.isEndpoint(stream)) {
            // texte final pour ce segment → renvoyer à SherpaSttPlugin.notifyListeners("sttResult", ...)
            recognizer.reset(stream)
        }
    }
}
```

C'est exactement le pattern utilisé par l'app d'exemple officielle
(`android/SherpaOnnx` dans le dépôt sherpa-onnx). L'API Kotlin
(`OnlineRecognizer`, `OnlineStream`) est directement accessible depuis Java
via l'artefact Maven — pas besoin de réécrire ce fichier en Kotlin pour
l'utiliser, seulement pour bénéficier d'une syntaxe plus idiomatique.

`SherpaSttPlugin.initModel()` devrait construire l'`OnlineRecognizerConfig`
(chemins vers encoder/decoder/joiner/tokens.txt une fois le modèle
téléchargé/localisé), `startRecognition()` démarrer l'`AudioRecord` et la
boucle ci-dessus sur un thread dédié, `stopRecognition()` l'arrêter et
libérer l'`AudioRecord`. Les résultats partiels/finaux doivent être renvoyés
au JS via `notifyListeners("sttResult", JSObject)` (mécanisme standard des
plugins Capacitor pour les événements), pas via la valeur de retour d'un
`PluginCall` puisque la reconnaissance est continue.

## 4. Capture audio (iOS)

Équivalent avec `AVAudioEngine` : installer un tap sur le nœud d'entrée à
16 kHz mono, convertir chaque buffer en `[Float]`, appeler
`stream.acceptWaveform(samples:sampleRate:)`. Le cycle
`decode/getResult/isEndpoint/reset` est identique côté Swift (même API,
adaptée du C++ via le package SPM).

## 5. Câblage côté application (JS)

Une fois les deux plateformes fonctionnelles :

- `SherpaStt.addListener('sttResult', (data) => { ... })` pour recevoir les
  résultats (`src/lib/voice/sherpa-stt.ts` n'a pas encore cette méthode
  dans l'interface `SherpaSttPlugin` — à ajouter, sur le modèle des autres
  plugins Capacitor à événements comme `@capacitor/app`).
- Décider du point de bascule : appeler `SherpaStt.isAvailable()` au
  démarrage (une fois `initModel()` fonctionnel) et, si `available &&
  modelLoaded`, utiliser `SherpaStt` à la place de
  `createSingleShotSTT`/`createContinuousSTT` (`src/lib/voice/stt.ts`) —
  sans casser le repli existant sur le Web Speech API pour le web et pour
  le temps où le modèle n'est pas encore téléchargé.
- Prévoir un état "téléchargement du modèle en cours" dans l'UI vocale
  (`voice-modal`, `push-to-talk`) pour le premier lancement si l'option
  "téléchargé à la demande" est retenue (voir §2).

## 6. Tests

- **Obligatoirement sur appareil réel**, pas seulement l'émulateur : la
  latence de décodage et la saturation du micro en environnement bruyant
  (marché ivoirien) ne se reproduisent pas fidèlement en émulateur.
- Tester en priorité sur des modèles d'entrée de gamme représentatifs
  (Tecno, Infinix) plutôt que sur un appareil de développement haut de
  gamme, pour valider que la latence et la consommation mémoire restent
  acceptables avec le modèle choisi.
- Comparer explicitement avec le Web Speech API existant (précision, temps
  de première réponse, comportement hors-ligne réel) avant de basculer les
  utilisateurs dessus par défaut.

## Effort estimé

Ce n'est pas un simple `npm install` : c'est un vrai lot de travail natif.
Ordre de grandeur (pas un engagement, juste un repère) :

- Android (dépendance + capture audio + boucle + événements) : 2-4 jours
  pour quelqu'un à l'aise en Kotlin/Android, en comptant les allers-retours
  de test sur appareil.
- iOS (idem) : 2-4 jours, avec l'inconnue supplémentaire de l'ajout du
  fichier au target Xcode et de la résolution SPM.
- Choix, test et optimisation du modèle (taille/latence/précision en
  français) : à part, dépend beaucoup de la qualité voulue.
- Intégration UI (état de téléchargement, bascule Web Speech ↔ Sherpa,
  gestion d'erreur) : 1-2 jours.

## Sources

- [k2-fsa/sherpa-onnx — dépôt principal](https://github.com/k2-fsa/sherpa-onnx)
- [OnlineRecognizer.kt (API Kotlin officielle)](https://github.com/k2-fsa/sherpa-onnx/blob/master/sherpa-onnx/kotlin-api/OnlineRecognizer.kt)
- [OnlineStream.kt (API Kotlin officielle)](https://github.com/k2-fsa/sherpa-onnx/blob/master/sherpa-onnx/kotlin-api/OnlineStream.kt)
- [Exemple app Android officiel (capture audio + boucle de décodage)](https://github.com/k2-fsa/sherpa-onnx/tree/master/android/SherpaOnnx)
- [Modèle français streaming Zipformer (Hugging Face)](https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-fr-2023-04-14)
- [Releases (versions de l'artefact Maven / SPM)](https://github.com/k2-fsa/sherpa-onnx/releases)
