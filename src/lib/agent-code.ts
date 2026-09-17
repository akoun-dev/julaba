// Génération des codes agents uniques pour les identificateurs.
//
// Règle produit : les comptes identificateur sont créés UNIQUEMENT par le
// back-office, et chaque compte reçoit un code agent unique lisible au
// terrain (format `JID-0001`, séquentiel). Le code sert d'identifiant de
// connexion alternatif au numéro de téléphone sur l'app.
//
// Fonctions pures, testées unitairement (agent-code.test.ts) — la route API
// vérifie ensuite l'unicité réelle en base (index unique
// uq_legacy_bo_identificateurs_agent_code) avec une petite boucle de
// réessaie en cas de collision.

export const AGENT_CODE_PREFIX = 'JID'
export const AGENT_CODE_PAD = 4

/** Formate un numéro de séquence en code agent : 1 -> "JID-0001". */
export function buildAgentCode(seq: number): string {
  const safe = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 1
  return `${AGENT_CODE_PREFIX}-${String(safe).padStart(AGENT_CODE_PAD, '0')}`
}

/**
 * Extrait la plus grande séquence déjà utilisée dans une liste de codes
 * existants ("JID-0042" -> 42). Les valeurs mal formées sont ignorées.
 */
export function maxAgentCodeSeq(existingCodes: Iterable<string>): number {
  let max = 0
  const pattern = new RegExp(`^${AGENT_CODE_PREFIX}-(\\d{1,})$`, 'i')
  for (const code of existingCodes) {
    if (!code) continue
    const match = pattern.exec(code.trim())
    if (!match) continue
    const seq = Number.parseInt(match[1], 10)
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return max
}

/**
 * Choisit le prochain code agent libre : la plus grande séquence existante
 * + 1. Si cette séquence est déjà prise (trou comblé manuellement), avance
 * jusqu'à trouver une séquence non utilisée.
 */
export function nextAgentCode(existingCodes: Iterable<string>): string {
  const used = new Set<string>()
  for (const code of existingCodes) {
    if (code) used.add(code.trim().toUpperCase())
  }
  let seq = maxAgentCodeSeq(used) + 1
  while (used.has(buildAgentCode(seq))) seq += 1
  return buildAgentCode(seq)
}

/**
 * Normalise un numéro de téléphone ivoirien pour les recherches :
 * conserve uniquement les chiffres et retire l'indicatif +225.
 * "05 55 55 55 55" et "+225 05 55 55 55 55" -> "0555555555".
 */
export function normalizeAgentPhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^225/, '')
}
