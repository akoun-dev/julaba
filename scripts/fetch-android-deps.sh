#!/usr/bin/env bash
# fetch-android-deps.sh — dépendances Android lourdes de Jùlaba (reproductible).
#
# Tout ce qui n'est PAS versionné dans git (poids) mais requis par le build
# APK : AAR sherpa-onnx seulement par défaut. Les modèles sont des packs
# optionnels téléchargés dans le stockage privé de l'application. Un build
# terrain peut encore les embarquer explicitement avec les variables ci-dessous.
#
# Usage : bash scripts/fetch-android-deps.sh
# Prérequis : curl, tar, bun (jq équivalent non requis). Réseau : github.com
# (releases k2-fsa) — HuggingFace n'est PAS utilisé (source unique, stable).
set -euo pipefail
cd "$(dirname "$0")/.."

LIBS_DIR="android/app/libs"
ASSETS_MODELS="android/app/src/main/assets/models"
DL_DIR=".android-cache/dl"

mkdir -p "$LIBS_DIR" "$ASSETS_MODELS" "$DL_DIR"

GH="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"

fetch() { # fetch <url> <dest>
  local url="$1" dest="$2"
  if [ ! -s "$dest" ]; then
    echo "→ $(basename "$dest") …"
    curl -L --fail --retry 2 -o "$dest" "$url"
  fi
}

echo "== 1/3 AAR sherpa-onnx 1.13.8 (natives arm64 + API Java/Kotlin) =="
fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar" \
  "$LIBS_DIR/sherpa-onnx-1.13.8.aar"

if [ "${JULABA_BUNDLE_FR_STT:-0}" != "1" ]; then
  echo "== Modèle français non embarqué (pack fr-stt-v1 requis après installation) =="
  echo "   Pour une variante terrain dédiée : JULABA_BUNDLE_FR_STT=1 bash scripts/fetch-android-deps.sh"
  echo "== Modèle omnilingual non embarqué (pack bci-stt-v1 requis après installation) =="
  exit 0
fi

echo "== 2/3 Modèle français — variante terrain dédiée =="
FR_DIR="$ASSETS_MODELS/sherpa-onnx-streaming-zipformer-fr-2023-04-14-int8"
if [ ! -s "$FR_DIR/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx" ]; then
  fetch "$GH/sherpa-onnx-streaming-zipformer-fr-2023-04-14.tar.bz2" "$DL_DIR/fr.tar.bz2"
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
    "$DL_DIR/bci.tar.bz2"
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
