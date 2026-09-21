#!/usr/bin/env bash
# fetch-android-deps.sh — dépendances Android lourdes de Jùlaba (reproductible).
#
# Tout ce qui n'est PAS versionné dans git (poids) mais requis par le build
# APK : AAR sherpa-onnx seulement par défaut. Les modèles sont des packs
# optionnels téléchargés dans le stockage privé de l'application. Un build
# terrain peut encore les embarquer explicitement avec les variables
# JULABA_BUNDLE_FR_STT / JULABA_BUNDLE_IVORIAN_STT (=1 pour embarquer).
#
# Compat Sprint V (MODE-953) : ANDROID_VOICE_VARIANT=full|lite est une
# COUCHE DE COMPATibilité qui traduit vers ces mêmes flags
#   full → JULABA_BUNDLE_FR_STT=1 + JULABA_BUNDLE_IVORIAN_STT=1
#   lite → aucune traduction (défauts : rien d'embarqué)
# Les modèles non embarqués sont téléchargés DEPUIS L'APP avec
# consentement explicite (Réglages → Voix & Langue → packs vocaux ;
# release GitHub voice-models-v1) et résolus depuis le disque par le
# plugin natif (disque d'abord, asset ensuite).
#
# Usage : bash scripts/fetch-android-deps.sh
#         JULABA_BUNDLE_FR_STT=1 JULABA_BUNDLE_IVORIAN_STT=1 bash scripts/fetch-android-deps.sh
#         ANDROID_VOICE_VARIANT=full bash scripts/fetch-android-deps.sh  (compat)
# Prérequis : curl, tar, bun (jq équivalent non requis). Réseau : github.com
# (releases k2-fsa) — HuggingFace n'est PAS utilisé (source unique, stable).
set -euo pipefail
cd "$(dirname "$0")/.."

LIBS_DIR="android/app/libs"
ASSETS_MODELS="android/app/src/main/assets/models"
DL_DIR=".android-cache/dl"

# ── Couche compat Sprint V : ANDROID_VOICE_VARIANT → JULABA_BUNDLE_* ──────
VARIANT="${ANDROID_VOICE_VARIANT:-}"
if [ -n "$VARIANT" ]; then
  if [ "$VARIANT" != "full" ] && [ "$VARIANT" != "lite" ]; then
    echo "ANDROID_VOICE_VARIANT invalide : '$VARIANT' (full|lite attendus)" >&2
    exit 2
  fi
  if [ "$VARIANT" = "full" ]; then
    export JULABA_BUNDLE_FR_STT="${JULABA_BUNDLE_FR_STT:-1}"
    export JULABA_BUNDLE_IVORIAN_STT="${JULABA_BUNDLE_IVORIAN_STT:-1}"
  fi
fi

mkdir -p "$LIBS_DIR" "$ASSETS_MODELS" "$DL_DIR"

GH="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"

# AUDIT-005 — empreintes SHA-256 épinglées des artefacts téléchargés.
# Un miroir compromis ou une réédition silencieuse d'une release ne doit
# PAS pouvoir injecter du code natif (AAR) ou un modèle altéré dans l'APK.
# Recalcul : sha256sum <fichier> après un téléchargement depuis github.com
# officiel — toute divergence = ABANDON du build, ne jamais « forcer ».
SHA_AAR="633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96"
SHA_FR="77d4cbd61dcfa55fd2c14efc0ce5c6798be5931c05f35df5bab60c921950bb8c"
SHA_BCI="cdcd0559c7c73efed54209a926e321afc914d046c5fdbf3665f00dc78180e5ed"

fetch() { # fetch <url> <dest> <sha256_attendu>
  local url="$1" dest="$2" expected="$3"
  if [ ! -s "$dest" ]; then
    echo "→ $(basename "$dest") …"
    curl -L --fail --retry 2 -o "$dest" "$url"
  fi
  local actual
  actual=$(sha256sum "$dest" | awk '{print $1}')
  if [ "$actual" != "$expected" ]; then
    echo "SHA-256 MISMATCH pour $(basename "$dest") :" >&2
    echo "  attendu : $expected" >&2
    echo "  obtenu  : $actual" >&2
    rm -f "$dest"
    exit 1
  fi
}

echo "== 1/3 AAR sherpa-onnx 1.13.8 (natives arm64 + API Java/Kotlin) =="
fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar" \
  "$LIBS_DIR/sherpa-onnx-1.13.8.aar" "$SHA_AAR"

if [ "${JULABA_BUNDLE_FR_STT:-0}" != "1" ]; then
  echo "== Modèle français non embarqué (pack fr-stt-v1 requis après installation) =="
  echo "   Pour une variante terrain dédiée : JULABA_BUNDLE_FR_STT=1 bash scripts/fetch-android-deps.sh"
  echo "== Modèle omnilingual non embarqué (pack bci-stt-v1 requis après installation) =="
  exit 0
fi

echo "== 2/3 Modèle français — variante terrain dédiée =="
FR_DIR="$ASSETS_MODELS/sherpa-onnx-streaming-zipformer-fr-2023-04-14-int8"
if [ ! -s "$FR_DIR/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx" ]; then
  fetch "$GH/sherpa-onnx-streaming-zipformer-fr-2023-04-14.tar.bz2" "$DL_DIR/fr.tar.bz2" "$SHA_FR"
  echo "→ extraction des 4 fichiers int8 …"
  tar -xjf "$DL_DIR/fr.tar.bz2" -C "$DL_DIR" \
    "sherpa-onnx-streaming-zipformer-fr-2023-04-14/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx" \
    "sherpa-onnx-streaming-zipformer-fr-2023-04-14/decoder-epoch-29-avg-9-with-averaged-model.int8.onnx" \
    "sherpa-onnx-streaming-zipformer-fr-2023-04-14/joiner-epoch-29-avg-9-with-averaged-model.int8.onnx" \
    "sherpa-onnx-streaming-zipformer-fr-2023-04-14/tokens.txt"
  mkdir -p "$FR_DIR"
  cp "$DL_DIR/sherpa-onnx-streaming-zipformer-fr-2023-04-14/"*.int8.onnx "$FR_DIR/"
  cp "$DL_DIR/sherpa-onnx-streaming-zipformer-fr-2023-04-14/tokens.txt" "$FR_DIR/"
fi

if [ "${JULABA_BUNDLE_IVORIAN_STT:-0}" != "1" ]; then
  echo "== Modèle omnilingual non embarqué (pack bci-stt-v1 requis après installation) =="
  exit 0
fi

echo "== 3/3 Modèle Baoulé — variante terrain dédiée uniquement =="
BCI_DIR="$ASSETS_MODELS/omnilingual-asr-300M-ctc-int8-2025-11-12"
if [ ! -s "$BCI_DIR/model.int8.onnx" ]; then
  fetch "$GH/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12.tar.bz2" \
    "$DL_DIR/bci.tar.bz2" "$SHA_BCI"
  echo "→ extraction …"
  tar -xjf "$DL_DIR/bci.tar.bz2" -C "$DL_DIR" \
    "sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12/model.int8.onnx" \
    "sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12/tokens.txt"
  mkdir -p "$BCI_DIR"
  cp "$DL_DIR/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12/model.int8.onnx" "$BCI_DIR/"
  cp "$DL_DIR/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12/tokens.txt" "$BCI_DIR/"
fi

echo
echo "== Vérification =="
ls -lh "$LIBS_DIR/sherpa-onnx-1.13.8.aar" \
  "$FR_DIR"/encoder*.onnx "$BCI_DIR"/model.int8.onnx
echo "OK — puis : bun run cap:sync (ou npx cap sync android) et build gradle."
