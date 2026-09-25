#!/usr/bin/env bash
# banc-wf7.sh — automatique adb du banc physique Jùlaba (MODE-1013).
#
# Le banc WF7 exige un APPAREIL RÉEL branché en USB (débogage USB activé) :
# ce script automatise tout ce qui est automatisable (installation, lancement,
# logs, mode avion, redémarrages) et affiche les jalons du runbook
# .ai/BANC-WF7-PHYSIQUE.md — les étapes UI (auth PIN, vente) restent
# manuelles par design (pas de sélecteurs DOM stables à inventer).
#
# Usage :
#   ./scripts/banc-wf7.sh check                # appareil + environnement
#   ./scripts/banc-wf7.sh install [apk]        # installe l'APK (défaut full)
#   ./scripts/banc-wf7.sh avion on|off         # mode avion
#   ./scripts/banc-wf7.sh relance              # force-stop + relance l'app
#   ./scripts/banc-wf7.sh logs                 # logcat filtré banc
#   ./scripts/banc-wf7.sh connected-test       # suite E2E instrumentée
#
# Prérequis : adb dans le PATH, appareil déverrouillé, APK construit
# (VARIANT=full TYPE=apk ./scripts/build-android.sh — la bascule IndexedDB
# c23b251 est incluse par défaut).
set -euo pipefail

PKG="ci.julaba.app"
TESTS_PKG="ci.julaba.app.test"
LOGTAGS='Capacitor|Console|SERVICE|julaba|chromium|cr_'

die() { echo "ERREUR: $*" >&2; exit 1; }
need_device() {
  adb get-state >/dev/null 2>&1 || die "aucun appareil — branchez l'appareil (débogage USB) puis adb devices"
  echo "Appareil : $(adb shell getprop ro.product.model) — Android $(adb shell getprop ro.build.version.release) — WebView $(adb shell dumpsys package com.google.android.webview 2>/dev/null | rg -o 'versionName=[^ ]+' | head -1 || echo 'n/a')"
}

case "${1:-}" in
  check)
    need_device
    echo "adb : $(adb version | head -1)"
    echo "Serveur visé par l'APK : configurer à la build (CAPACITOR_SERVER_URL, défaut https://julaba.vercel.app/)"
    ;;
  install)
    need_device
    APK="${2:-android/app/build/outputs/apk/debug/app-debug.apk}"
    [ -f "$APK" ] || die "APK introuvable : $APK (construire : VARIANT=full TYPE=apk ./scripts/build-android.sh)"
    adb install -r "$APK"
    echo "APK installé : $APK"
    ;;
  avion)
    need_device
    case "${2:-}" in
      on)  adb shell cmd connectivity airplane-mode enable  ; echo "mode avion ON" ;;
      off) adb shell cmd connectivity airplane-mode disable ; echo "mode avion OFF" ;;
      *) die "usage : $0 avion on|off" ;;
    esac
    ;;
  relance)
    need_device
    adb shell am force-stop "$PKG"
    sleep 1
    adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
    echo "App relancée (force-stop + launch)"
    ;;
  logs)
    need_device
    echo "logcat banc (Ctrl-C pour arrêter) — jalons attendus : flush, sync, SW"
    adb logcat -c
    adb logcat | rg -i "$LOGTAGS"
    ;;
  connected-test)
    need_device
    cd "$(dirname "$0")/../android"
    ./gradlew connectedAndroidTest
    echo "Rapport : app/build/outputs/androidTest-results/connected/"
    ;;
  *)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
