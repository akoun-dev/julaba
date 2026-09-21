#!/usr/bin/env python3
"""Convert approved Jùlaba metadata into Piper's pipe-delimited metadata.csv."""
from __future__ import annotations

import argparse
import csv
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/voice/ivoirian-v1/metadata.csv")
    parser.add_argument("--output", default="data/voice/ivoirian-v1/piper/metadata.csv")
    parser.add_argument("--audio-root", default="data/voice/ivoirian-v1/processed")
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    audio_root = Path(args.audio_root)
    written = 0
    errors = []
    with Path(args.input).open(encoding="utf-8", newline="") as source, output.open("w", encoding="utf-8", newline="") as target:
        rows = csv.DictReader(source)
        writer = csv.writer(target, delimiter="|", lineterminator="\n")
        for row in rows:
            if row["review_status"] not in {"approved", "recorded", "ready"}:
                continue
            if row["protected_context"] == "true" and row["register"] != "clear":
                errors.append(f"{row['utt_id']}: contexte protégé non clair")
                continue
            wav = audio_root / f"{row['utt_id']}.wav"
            if not wav.is_file():
                errors.append(f"{row['utt_id']}: WAV préparé absent {wav}")
                continue
            # Piper LJSpeech format: id|text, no header.
            writer.writerow([row["utt_id"], row["text"]])
            written += 1
    print(f"Entrées Piper écrites: {written}")
    if errors:
        print("Erreurs:")
        for error in errors:
            print(f"- {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
