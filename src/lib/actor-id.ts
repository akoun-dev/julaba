// MODE-941 (AUDIT-003 I-09/F-18) — actor_id séquentiel « #X-NNNN ».
//
// Fin du « #M- + 4 chiffres aléatoires » sur une colonne UNIQUE sans
// réessai : ~120 collisions attendues à 10 000 acteurs (paradoxe des
// anniversaires) → la validation d'un dossier pouvait 500. Même modèle
// que le pipeline JID (agent-code.ts) : la plus grande séquence
// existante + 1, avance si trou comblé manuellement, et réessai serveur
// sur 23505 (course concurrente).
//
// F-18 au passage : les coopératives ne sont plus rangées sous « #M- » —
// préfixe propre « #C- ». Module PUR (aucune dépendance), testé.

export type ActeurPrefix = 'M' | 'P' | 'C'

/** Préfixe d'acteur par type : producteur → #P-, coopératif → #C-,
 * marchand (et défaut) → #M-. */
export function acteurPrefixPourType(actorType: string): ActeurPrefix {
  const t = (actorType ?? '').trim().toLowerCase()
  if (t.startsWith('product')) return 'P'
  if (t.startsWith('cooper') || t.startsWith('coopér')) return 'C'
  return 'M'
}

export function buildActeurId(prefix: ActeurPrefix, seq: number): string {
  return `#${prefix}-${String(seq).padStart(4, '0')}`
}

function maxActeurSeq(existing: Iterable<string>, prefix: ActeurPrefix): number {
  const pattern = new RegExp(`^#${prefix}-(\\d+)$`)
  let max = 0
  for (const raw of existing) {
    if (!raw) continue
    const match = pattern.exec(raw.trim())
    if (!match) continue
    const seq = Number.parseInt(match[1], 10)
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return max
}

/** Prochain actor_id libre : max(séquences du préfixe) + 1, en avancant
 * si la séquence suivante est déjà prise (trou comblé manuellement). */
export function nextActeurId(existingIds: Iterable<string>, prefix: ActeurPrefix): string {
  const used = new Set<string>()
  for (const id of existingIds) {
    if (id) used.add(id.trim().toUpperCase())
  }
  let seq = maxActeurSeq(used, prefix) + 1
  while (used.has(buildActeurId(prefix, seq))) seq += 1
  return buildActeurId(prefix, seq)
}
