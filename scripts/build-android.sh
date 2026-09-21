#!/usr/bin/env bash
# build-android.sh — build Android paramétrable de Jùlaba (Sprint V, MODE-957).
#
# Encapsule la procédure reproducible de docs/CAPACITOR.md (§ Build APK de
# test, Task 32) avec les DEUX choix de la décision « packs vocaux » :
#
#   VARIANT=full|lite   full = modèles vocaux embarqués (APK ≈ 400 Mo, tout
#                       offline dès l'install — usage terrain interne)
#                       lite = AAR seul (APK léger — les packs se
#                       téléchargent depuis l'app avec consentement ;
#                       release GitHub voice-models-v1 à publier AVANT, sinon
#                       l'installation des packs échouera avec un message
#                       honnête)
#   TYPE=apk|bundle     apk = assembleDebug (test appareil)
#                       bundle = bundleRelease (Android App Bundle, Play
#                       Store — la signature release est à la charge du
#                       propriétaire : keystore, ≠ debug)
#
# Usage : VARIANT=lite TYPE=apk ./scripts/build-android.sh
# Prérequis : JDK 21+ (JAVA_HOME), SDK Android (local.properties), bun/curl.
set -euo pipefail
cd "$(dirname "$0")/.."

VARIANT="${VARIANT:-full}"
TYPE="${TYPE:-apk}"

if [ "$VARIANT" != "full" ] && [ "$VARIANT" != "lite" ]; then
  echo "VARIANT invalide : '$VARIANT' (full|lite)" >&2; exit 2
fi
if [ "$TYPE" != "apk" ] && [ "$TYPE" != "bundle" ]; then
  echo "TYPE invalide : '$TYPE' (apk|bundle)" >&2; exit 2
fi

echo "== 1/4 Dépendances lourdes (variant=$VARIANT) =="
ANDROID_VOICE_VARIANT="$VARIANT" bash scripts/fetch-android-deps.sh

echo "== 2/4 Sync Capacitor =="
# Rappel : définir CAPACITOR_SERVER_URL avant cap sync pour viser un serveur
# particulier (défaut production : https://julaba.vercel.app/ — cf. capacitor.config.ts).
npx cap sync android

echo "== 3/4 Gradle ($TYPE, $VARIANT) =="
cd android
case "$TYPE" in
  apk)    ./gradlew assembleDebug ;;
  bundle) ./gradlew bundleRelease ;;
esac
cd ..

echo "== 4/4 Résultat =="
case "$TYPE" in
  apk)
    OUT="android/app/build/outputs/apk/debug/app-debug.apk"
    [ -f "$OUT" ] && ls -lh "$OUT" && echo "Installer : adb install -r $OUT"
    ;;
  bundle)
    OUT="android/app/build/outputs/bundle/release/app-release.aab"
    [ -f "$OUT" ] && ls -lh "$OUT" && echo "AAB release : signer avec le keystore propriétaire avant upload Play (voir docs/CAPACITOR.md)."
    ;;
esac
