#!/usr/bin/env python3
# B3-030 — Construit un tokenizer.json (format fast/tokenizers) pour un
# checkpoint VITS MMS char-level, à partir de son vocab.json.
#
# Le schéma reproduit celui des ports ONNX fonctionnels de transformers.js
# (référence : Xenova/mms-tts-fra) :
#   - normalizer : Lowercase + whitelist regex (supprime tout caractère
#     absent du vocab — évite les <unk> silencieux) + Strip + apposition
#     du pad token en fin de séquence (astuce Replace `(?=.)|(?<!^)$`) ;
#   - pre_tokenizer : Split par caractère (Regex '' Isolated) ;
#   - model : WordLevel avec le vocab char-level du checkpoint.
#
# Usage : python3 build_tokenizer_json.py <dir-modèle-local>
# (dir contient vocab.json et tokenizer_config.json ; écrit tokenizer.json)
import json
import re
import sys
from pathlib import Path

def esc(ch: str) -> str:
    """Échappe un caractère pour une classe de caractères regex JAVASCRIPT.

    Attention : re.escape() de Python produit des séquences invalides en JS
    avec le flag `u` (ex. `\\ ` pour l'espace). Dans une classe JS, seuls
    `\\ ] ^ -` ont besoin d'un échappement ; tout le reste (espace, lettres
    accentuées, apostrophes) reste littéral — comme dans le template
    Xenova/mms-tts-fra (`[^îz\\-ùu… –pë…'ml]`).
    """
    if ch in "\\]^-":
        return "\\" + ch
    return ch

def main(model_dir: str) -> None:
    d = Path(model_dir)
    vocab = json.loads((d / "vocab.json").read_text(encoding="utf-8"))
    cfg = json.loads((d / "tokenizer_config.json").read_text(encoding="utf-8"))

    pad = cfg.get("pad_token") or next(iter(vocab))
    unk = cfg.get("unk_token") or "<unk>"

    # Identifiants des tokens ajoutés (unk est hors vocab char-level).
    added_decoder = cfg.get("added_tokens_decoder", {})
    unk_id = None
    for tid, meta in added_decoder.items():
        if meta.get("content") == unk:
            unk_id = int(tid)
    if unk_id is None:
        unk_id = len(vocab)

    # Whitelist = caractères du vocab (triés par id pour la lisibilité).
    chars = "".join(esc(ch) for ch, _ in sorted(vocab.items(), key=lambda kv: kv[1]))
    whitelist = f"[^{chars}]"

    tokenizer = {
        "version": "1.0",
        "truncation": None,
        "padding": None,
        "added_tokens": [
            {
                "id": unk_id,
                "content": unk,
                "single_word": False,
                "lstrip": False,
                "rstrip": False,
                "normalized": False,
                "special": True,
            }
        ],
        "normalizer": {
            "type": "Sequence",
            "normalizers": [
                {"type": "Lowercase"},
                {
                    "type": "Replace",
                    "pattern": {"Regex": whitelist},
                    "content": "",
                },
                {"type": "Strip", "strip_left": True, "strip_right": True},
                {
                    "type": "Replace",
                    "pattern": {"Regex": "(?=.)|(?<!^)$"},
                    "content": pad,
                },
            ],
        },
        "pre_tokenizer": {
            "type": "Split",
            "pattern": {"Regex": ""},
            "behavior": "Isolated",
            "invert": False,
        },
        "post_processor": None,
        "decoder": None,
        "model": {
            "type": "WordLevel",
            "vocab": vocab,
            "unk_token": unk,
        },
    }

    out = d / "tokenizer.json"
    out.write_text(json.dumps(tokenizer, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"tokenizer.json écrit : {out}")
    print(f"  vocab: {len(vocab)} chars | pad: {pad!r} | unk: {unk!r} (id {unk_id})")
    print(f"  whitelist: {whitelist}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: build_tokenizer_json.py <dir-modèle-local>")
    main(sys.argv[1])
