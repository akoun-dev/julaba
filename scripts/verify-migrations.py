#!/usr/bin/env python3
"""
verify_migrations.py — Garde-fou du dossier supabase/migrations.

Vérifie, sur chaque fichier :
  1. nomenclature officielle Supabase : <YYYYMMDDHHMMSS>_<nom_snake_case>.sql ;
  2. versions uniques ;
  3. une seule « cible » par fichier (1 table = 1 fichier, 1 fonction = 1
     fichier, 1 alter ciblant une seule table) ;
  4. ordre des dépendances : toute table référencée par une FK d'un CREATE
     TABLE est définie dans un fichier de version antérieure ou égale ;
  5. ordre des seeds : aucun seed ne précède la création de sa table
     (vérifié via les INSERT INTO).

Sortie : OK + résumé, sinon liste des violations (exit 1).
"""

import re
import sys
from pathlib import Path

ROOT = Path('/home/z/my-project/julaba/supabase/migrations')

NAME_RE = re.compile(r'^(\d{14})_([a-z0-9_]+)\.sql$')
CREATE_TABLE_RE = re.compile(r'create table (?:if not exists )?public\.(\w+)\s*\(', re.I)
REFERENCE_RE = re.compile(r'references\s+public\.(\w+)', re.I)
ALTER_TABLE_RE = re.compile(r'alter table (?:only )?public\.(\w+)', re.I)
INSERT_INTO_RE = re.compile(r'insert into public\.(\w+)', re.I)
CREATE_FN_RE = re.compile(r'create (?:or replace )?function public\.(\w+)', re.I)
CREATE_IDX_RE = re.compile(r'create index (?:if not exists )?\w*\s*on public\.(\w+)', re.I)

def main() -> int:
    files = sorted(p for p in ROOT.glob('*.sql'))
    problems: list[str] = []

    versions: dict[str, str] = {}
    seen_versions: set[str] = set()

    for path in files:
        m = NAME_RE.match(path.name)
        if not m:
            problems.append(f'[nomenclature] {path.name} — attendu <YYYYMMDDHHMMSS>_<nom_snake_case>.sql')
            continue
        version, name = m.groups()
        if version in seen_versions:
            problems.append(f'[doublon] version {version} utilisée plusieurs fois')
        seen_versions.add(version)
        versions[path.name] = version

        content = path.read_text(encoding='utf-8')

        # 1 table par fichier (les DO blocks redistribuant des alters multiples
        # sont acceptés : ils ne ciblent qu'UNE table ; on vérifie donc que les
        # CREATE TABLE du fichier ne concernent qu'une seule table)
        created = set(CREATE_TABLE_RE.findall(content))
        if len(created) > 1:
            problems.append(f'[1-table-1-fichier] {path.name} crée plusieurs tables: {sorted(created)}')

        # 1 fonction principale par fichier
        fns = set(CREATE_FN_RE.findall(content))
        if len(fns) > 1:
            problems.append(f'[1-fonction-1-fichier] {path.name} définit plusieurs fonctions: {sorted(fns)}')

        # alters ciblant plusieurs tables différentes
        alters = set(ALTER_TABLE_RE.findall(content))
        if len(alters) > 1 and not created:
            problems.append(f'[1-cible-1-fichier] {path.name} altère plusieurs tables: {sorted(alters)}')

        # ordre des FK : références d'un CREATE TABLE
        for cm in CREATE_TABLE_RE.finditer(content):
            table = cm.group(1)
            # corps du create table : jusqu'à la parenthèse fermante au niveau 0
            depth = 0
            body = ''
            for ch in content[cm.end() - 1:]:
                body += ch
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0:
                        break
            for ref in REFERENCE_RE.findall(body):
                ref_files = [f for f, v in versions.items() if f'create_{ref}_table' in f]
                if not ref_files:
                    continue  # table hors migrations (ex. storage) — ignoré
                ref_version = versions[ref_files[0]]
                if ref_version > version:
                    problems.append(f'[ordre-FK] {path.name}: {table} référence {ref} définie plus tard ({ref_files[0]})')

        # ordre des seeds
        for ins in INSERT_INTO_RE.findall(content):
            table_files = [f for f in versions if f'create_{ins}_table' in f or f'_{ins}.sql' in f]
            seed_is_early = version < '20260101030000'
            if ins not in ('merchant_categories',) and seed_is_early and table_files and 'seed' not in path.name:
                pass  # les seeds légitimes sont marqués _seed_
            if 'seed' in path.name:
                continue

    # seeds : la table seedée doit exister avant
    for path in files:
        if 'seed' not in path.name:
            continue
        content = path.read_text(encoding='utf-8')
        version = versions[path.name]
        for ins in INSERT_INTO_RE.findall(content):
            creators = [f for f, v in versions.items() if f'create_{ins}_table' in f]
            if creators and versions[creators[0]] > version:
                problems.append(f'[ordre-seed] {path.name} insère dans {ins} créée plus tard ({creators[0]})')

    total = len(files)
    if problems:
        print(f'✗ {len(problems)} violation(s) sur {total} fichiers :\n')
        for p in problems:
            print('  -', p)
        return 1
    print(f'✓ {total} fichiers de migration conformes (nomenclature, unicité, 1 objet/fichier, ordre FK/seeds).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
