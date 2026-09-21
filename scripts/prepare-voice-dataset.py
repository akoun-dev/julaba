#!/usr/bin/env python3
"""Validate metadata and convert accepted recordings to mono WAV.

The script is intentionally conservative. It never invents transcripts and it
never deletes rejected or source files.
"""
from __future__ import annotations

import argparse
import csv
import subprocess
from pathlib import Path

REQUIRED_COLUMNS = {
    "utt_id", "audio_path", "speaker_id", "locale", "register", "context",
    "text", "normalized_text", "protected_context", "review_status",
}
ACCEPTED_STATUSES = {"approved", "recorded", "ready"}


def probe(path: Path) -> tuple[float, int, int]:
    command = [
        "ffprobe", "-v", "error", "-show_entries",
        "stream=sample_rate,channels:format=duration",
        "-of", "csv=p=0", str(path),
    ]
    output = subprocess.check_output(command, text=True).strip().splitlines()
    if not output:
        raise RuntimeError(f"Impossible de lire {path}")
    values = output[0].split(",")
    # ffprobe may emit duration on a separate line depending on the container.
    numbers = []
    for line in output:
        for value in line.split(","):
            try:
                numbers.append(float(value))
            except ValueError:
                pass
    duration = numbers[0] if numbers else 0.0
    sample_rate = int(numbers[1]) if len(numbers) > 1 else 0
    channels = int(numbers[2]) if len(numbers) > 2 else 0
    return duration, sample_rate, channels


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", default="data/voice/ivoirian-v1/metadata.csv")
    parser.add_argument("--root", default="data/voice/ivoirian-v1")
    parser.add_argument("--output", default="data/voice/ivoirian-v1/processed")
    parser.add_argument("--convert", action="store_true", help="convert approved sources to WAV")
    args = parser.parse_args()

    root = Path(args.root)
    metadata_path = Path(args.metadata)
    output = Path(args.output)
    with metadata_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
        columns = set(rows[0]) if rows else set()
    missing = REQUIRED_COLUMNS - columns
    if missing:
        raise SystemExit(f"Colonnes manquantes: {', '.join(sorted(missing))}")

    errors = []
    ready = 0
    total_seconds = 0.0
    for row in rows:
        source = root / row["audio_path"]
        if row["review_status"] not in ACCEPTED_STATUSES:
            continue
        if not row["text"].strip() or not row["normalized_text"].strip():
            errors.append(f"{row['utt_id']}: transcription vide")
            continue
        if not source.is_file():
            errors.append(f"{row['utt_id']}: fichier absent {source}")
            continue
        try:
            duration, sample_rate, channels = probe(source)
        except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
            errors.append(f"{row['utt_id']}: {error}")
            continue
        if duration < 0.4 or duration > 15:
            errors.append(f"{row['utt_id']}: durée hors plage ({duration:.2f}s)")
            continue
        if channels != 1:
            errors.append(f"{row['utt_id']}: l’audio doit être mono ({channels} canaux)")
            continue
        ready += 1
        total_seconds += duration
        if args.convert:
            target = output / f"{row['utt_id']}.wav"
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run([
                "ffmpeg", "-y", "-v", "error", "-i", str(source),
                "-ac", "1", "-ar", "22050", "-sample_fmt", "s16", str(target),
            ], check=True)

    print(f"Phrases examinées: {len(rows)}")
    print(f"Phrases prêtes: {ready}")
    print(f"Durée prête: {total_seconds / 60:.2f} minutes")
    if errors:
        print("Erreurs:")
        for error in errors:
            print(f"- {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
