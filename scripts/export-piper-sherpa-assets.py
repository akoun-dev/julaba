#!/usr/bin/env python3
"""Create Sherpa-ONNX tokens.txt and metadata for an exported Piper model."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path, help="exported Piper .onnx file")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    config_path = Path(f"{args.model}.json")
    if not config_path.is_file():
        raise SystemExit(f"Configuration Piper absente: {config_path}")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    phoneme_id_map = config.get("phoneme_id_map")
    if not isinstance(phoneme_id_map, dict):
        raise SystemExit("phoneme_id_map absent dans la configuration Piper")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    tokens_path = args.output_dir / "tokens.txt"
    with tokens_path.open("w", encoding="utf-8") as handle:
        for symbol, ids in sorted(phoneme_id_map.items(), key=lambda item: item[1][0]):
            handle.write(f"{symbol} {ids[0]}\n")

    try:
        import onnx
    except ImportError as error:
        raise SystemExit("Installez onnx==1.17.0 avant la conversion") from error

    model = onnx.load(str(args.model))
    language = config.get("language", {})
    espeak = config.get("espeak", {})
    metadata = {
        "model_type": "vits",
        "comment": "piper",
        "language": language.get("name_english", "French (Côte d'Ivoire)"),
        "voice": espeak.get("voice", "fr-fr"),
        "has_espeak": 1,
        "n_speakers": config.get("num_speakers", 1),
        "sample_rate": config.get("audio", {}).get("sample_rate", 22050),
    }
    for key, value in metadata.items():
        entry = model.metadata_props.add()
        entry.key = key
        entry.value = str(value)
    onnx.save(model, str(args.output_dir / args.model.name))
    (args.output_dir / f"{args.model.name}.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Modèle Sherpa prêt dans {args.output_dir}")
    print(f"- {args.output_dir / args.model.name}")
    print(f"- {tokens_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
