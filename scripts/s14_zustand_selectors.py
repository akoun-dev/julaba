#!/usr/bin/env python3
"""S-14 (MODE-966) — Migration des sélecteurs zustand back-office vers des
sélections atomiques.

Pattern hors convention (AUDIT-005 S-14) :
    const { A, B, C } = useBackofficeStore()      # abonnement au STORE ENTIER
→ convention cible (sélecteur atomique par primitive, cf. bo-supervision-screen) :
    const A = useBackofficeStore((s) => s.A)
    const B = useBackofficeStore((s) => s.B)
    const C = useBackofficeStore((s) => s.C)

Le script :
  1. balaie les fichiers cibles (arguments) ;
  2. détecte les blocs `const { ... } = useBackofficeStore()` (mono/multi-lignes) ;
  3. refuse (et signale) tout champ non trivial : renommage `x: y`, valeur par
     défaut `x = y`, rest spread `...rest` — ils nécessitent une décision ;
  4. réécrit en sélecteurs atomiques, indentation de la ligne `const` préservée.

Usage :
    python scripts/s14_zustand_selectors.py --dry-run FILE...   # inspection
    python scripts/s14_zustand_selectors.py FILE...             # réécriture
"""
from __future__ import annotations

import argparse
import re
import sys

PATTERN = re.compile(
    r"const\s*\{([^{}]*)\}\s*=\s*useBackofficeStore\(\)",
    re.DOTALL,
)


def rewrite(source: str, path: str, dry_run: bool) -> tuple[str, int, int, list[str]]:
    """Retourne (source_modifiée, nb_blocs, nb_champs, avertissements)."""
    warnings: list[str] = []
    state = {"blocks": 0, "fields": 0}

    def replace(m: re.Match[str]) -> str:
        fields = [f.strip() for f in m.group(1).split(",") if f.strip()]
        if not fields:
            warnings.append(f"{path}: bloc vide ignoré")
            return m.group(0)

        bad = [f for f in fields if ":" in f or "=" in f or f.startswith("...")]
        if bad:
            warnings.append(f"{path}: champs non triviaux NON convertis : {bad}")
            return m.group(0)

        # Indentation = celle de la ligne qui contient le `const`.
        line_start = source.rfind("\n", 0, m.start()) + 1
        indent = re.match(r"[ \t]*", source[line_start:]).group(0)

        # L'indentation d'origine (avant `const`) est préservée par re.sub :
        # elle ne doit préfixer que les lignes SUIVANTES, jamais la première.
        state["blocks"] += 1
        state["fields"] += len(fields)
        return ("\n" + indent).join(
            f"const {f} = useBackofficeStore((s) => s.{f})"
            for f in fields
        )

    result = PATTERN.sub(replace, source)
    return result, state["blocks"], state["fields"], warnings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="+", help="fichiers à traiter")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    total_blocks = 0
    total_fields = 0
    fatal = False

    for path in args.files:
        try:
            with open(path, encoding="utf-8") as fh:
                src = fh.read()
        except OSError as exc:
            print(f"ERREUR lecture {path}: {exc}", file=sys.stderr)
            fatal = True
            continue

        out, n_blocks, n_fields, warnings = rewrite(src, path, args.dry_run)
        total_blocks += n_blocks
        total_fields += n_fields
        for w in warnings:
            print(f"⚠️  {w}")
        if n_blocks:
            print(f"  {path} : {n_blocks} bloc(s), {n_fields} champ(s)")
            if not args.dry_run:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(out)

    mode = "DRY-RUN" if args.dry_run else "RÉÉCRITURE"
    print(f"\n[{mode}] {total_blocks} bloc(s), {total_fields} champ(s) converti(s)")
    return 1 if fatal else 0


if __name__ == "__main__":
    sys.exit(main())
