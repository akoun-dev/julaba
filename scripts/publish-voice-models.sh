#!/usr/bin/env bash
# publish-voice-models.sh — prépare la release GitHub `voice-models-v1`
# (Sprint V, MODE-953) : les fichiers extraits des archives k2-fsa, renommés
# avec des noms UNIQUES (deux modèles ont chacun un tokens.txt), à uploader
# manuellement sur https://github.com/akoun-dev/julaba/releases (le propriétaire
# possède les droits d'upload — l'API ne le fait pas depuis ce sandbox).
#
# Usage : bash scripts/publish-voice-models.sh
# Sortie : dist/voice-models-v1/ prêt à uploader + les commandes gh release.
set -euo pipefail
cd "$(dirname "$0")/.."

DL_DIR=".android-cache/dl"
OUT_DIR="dist/voice-models-v1"
GH="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"

mkdir -p "$DL_DIR" "$OUT_DIR"

fetch() { # fetch <url> <dest>
  local url="$1" dest="$2"
  if [ ! -s "$dest" ]; then
    echo "→ $(basename "$dest") …"
    curl -L --fail --retry 2 -o "$dest" "$url"
  fi
}

echo "== 1/2 Modèle français (zipformer int8) =="
fetch "$GH/sherpa-onnx-streaming-zipformer-fr-2023-04-14.tar.bz2" "$DL_DIR/fr.tar.bz2"
if [ ! -d "$DL_DIR/sherpa-onnx-streaming-zipformer-fr-2023-04-14" ]; then
  tar -xjf "$DL_DIR/fr.tar.bz2" -C "$DL_DIR"
fi
FR_SRC="$DL_DIR/sherpa-onnx-streaming-zipformer-fr-2023-04-14"
cp "$FR_SRC/encoder-epoch-29-avg-9-with-averaged-model.int8.onnx" "$OUT_DIR/sherpa-fr-encoder-epoch-29-avg-9-with-averaged-model.int8.onnx"
cp "$FR_SRC/decoder-epoch-29-avg-9-with-averaged-model.int8.onnx" "$OUT_DIR/sherpa-fr-decoder-epoch-29-avg-9-with-averaged-model.int8.onnx"
cp "$FR_SRC/joiner-epoch-29-avg-9-with-averaged-model.int8.onnx" "$OUT_DIR/sherpa-fr-joiner-epoch-29-avg-9-with-averaged-model.int8.onnx"
cp "$FR_SRC/tokens.txt" "$OUT_DIR/sherpa-fr-tokens.txt"

echo "== 2/2 Modèle omnilingual (bci/dyu, CTC 300M int8) =="
fetch "$GH/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12.tar.bz2" "$DL_DIR/bci.tar.bz2"
if [ ! -d "$DL_DIR/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12" ]; then
  tar -xjf "$DL_DIR/bci.tar.bz2" -C "$DL_DIR"
fi
BCI_SRC="$DL_DIR/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12"
cp "$BCI_SRC/model.int8.onnx" "$OUT_DIR/omnilingual-bci-model.int8.onnx"
cp "$BCI_SRC/tokens.txt" "$OUT_DIR/omnilingual-bci-tokens.txt"

echo
echo "== Fichiers prêts dans $OUT_DIR : =="
ls -lh "$OUT_DIR"

# A11-F03 (AUDIT-011) : le registre applicatif (src/lib/voice/packs/registry.ts)
# porte désormais, par fichier, la taille ET l'empreinte SHA-256 attendues —
# le downloader refuse toute divergence AVANT de marquer un pack « installé ».
# Ce fragment est à coller dans les entrées `files` du registre au moment de
# la publication (les URLs y sont déjà ; ajouter sha256 + sizeBytes).
#
# MODE-1014 (AUDIT-013) — PUBLICATION STRICTE : le chemin de publication
# REFUSE une entrée sans empreinte vérifiable. Chaque fichier émis doit
# produire une empreinte SHA-256 de 64 caractères hexadécimaux et une taille
# entière > 0 — sinon le script échoue (exit 1) AVANT d'afficher les
# commandes d'upload : aucune publication invérifiable ne sort de ce script.
# Côté app, le garde symétrique (src/lib/voice/packs/publication.ts) refuse
# l'installation d'une entrée publiée sans empreintes complètes.
echo
echo "== Fragment d'intégrité à coller dans registry.ts (A11-F03) : =="
FRAGMENT_FILE=$(mktemp)
PUBLICATION_VALID=true
for f in "$OUT_DIR"/*; do
  size="$(wc -c < "$f" | tr -d ' ')"
  sha="$(sha256sum "$f" | cut -d' ' -f1)"
  printf '%-72s  sizeBytes: %-12s sha256: %s\n' "$(basename "$f")" "$size" "$sha" | tee "$FRAGMENT_FILE"
  # Garde MODE-1014 : empreinte = 64 hex minuscules, taille = entier > 0.
  if ! [[ "$sha" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERREUR PUBLICATION — empreinte SHA-256 invalide pour $(basename "$f") (64 hex attendus, obtenu « $sha »)." >&2
    PUBLICATION_VALID=false
  fi
  if ! [[ "$size" =~ ^[1-9][0-9]*$ ]]; then
    echo "ERREUR PUBLICATION — taille invalide pour $(basename "$f") (entier > 0 attendu, obtenu « $size »)." >&2
    PUBLICATION_VALID=false
  fi
done
if [ ! -s "$FRAGMENT_FILE" ]; then
  echo "ERREUR PUBLICATION — aucun fichier à publier dans $OUT_DIR (release vide)." >&2
  PUBLICATION_VALID=false
fi
if [ "$PUBLICATION_VALID" != true ]; then
  echo "PUBLICATION REFUSÉE (MODE-1014) — corrigez les fichiers ci-dessus ; aucun pack invérifiable n'est publié." >&2
  exit 1
fi
rm -f "$FRAGMENT_FILE"

cat << 'EOF'

== Commandes d'upload (gh CLI authentifié par le propriétaire) : ==
gh release create voice-models-v1 --title "Packs vocaux v1" \
  --notes "Modèles STT pour les builds allégés (MODE-953) — extraits des releases k2-fsa (sources : sherpa-onnx-streaming-zipformer-fr-2023-04-14, omnilingual-asr-300M-ctc-int8-2025-11-12)." \
  dist/voice-models-v1/*

(ou upload manuel via la page Releases → Draft a new release → tag voice-models-v1)
EOF
