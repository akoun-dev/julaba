#!/usr/bin/env bash
# Jùlaba — téléchargement des dépendances Android lourdes (git-ignorées).
#
#   1. AAR officiel sherpa-onnx 1.13.8  → android/app/libs/          (~50 Mo)
#   2. Modèle français zipformer int8   → android/app/src/main/assets/models/ (~127 Mo)
#
# k2-fsa ne publie pas d'artefact Maven Central : l'AAR précompilé des
# releases GitHub est la voie officielle (jitpack ne peut pas construire
# l'AAR natif). À lancer UNE FOIS avant ./gradlew assembleDebug.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="https://github.com/k2-fsa/sherpa-onnx/releases/download"
MODEL_DIR="android/app/src/main/assets/models/sherpa-onnx-streaming-zipformer-fr-2023-04-14-int8"
CACHE=".android-cache"

fetch() {
  local url=$1 out=$2
  if [ -f "$out" ]; then
    echo "✓ $out présent"
    return 0
  fi
  mkdir -p "$(dirname "$out")"
  echo "↓ $url"
  curl -fL --retry 3 -o "$out" "$url"
}

# 1) AAR sherpa-onnx (natives onnxruntime + JNI, toutes ABIs)
fetch "$BASE/v1.13.8/sherpa-onnx-1.13.8.aar" android/app/libs/sherpa-onnx-1.13.8.aar

# 2) Modèle français (4 fichiers int8 seulement — pas les .onnx fp32)
if [ -f "$MODEL_DIR/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx" ]; then
  echo "✓ modèle FR présent ($MODEL_DIR)"
else
  mkdir -p "$CACHE"
  fetch "$BASE/asr-models/sherpa-onnx-streaming-zipformer-fr-2023-04-14.tar.bz2" "$CACHE/sherpa-fr.tar.bz2"
  echo "… extraction int8"
  tar -xjf "$CACHE/sherpa-fr.tar.bz2" -C "$CACHE" \
    --wildcards "*/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx" \
                "*/decoder-epoch-29-avg-9-with-averaged-model.int8.onnx" \
                "*/joiner-epoch-29-avg-9-with-averaged-model.int8.onnx" \
                "*/tokens.txt"
  mkdir -p "$MODEL_DIR"
  cp "$CACHE"/sherpa-onnx-streaming-zipformer-fr-2023-04-14/* "$MODEL_DIR"/
  rm -rf "$CACHE"
  echo "✓ modèle installé dans $MODEL_DIR"
fi

echo "Dépendances Android prêtes — ./gradlew assembleDebug (dans android/)"
