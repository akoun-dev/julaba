/**
 * AUDIT-005 — durcissement des filtres de recherche PostgREST.
 *
 * Les routes back-office interpolent des paramètres d'URL directement dans
 * la grammaire `.or("col.ilike.%<valeur>%")` de PostgREST. Une valeur
 * contenant `,` `(` `)` casse la grammaire et permet d'AJOUTER des filtres
 * (ex. `?search=a),zone.eq.œil` → `first_name.ilike.%a),zone.eq.œil%`
 * devient un OU arbitraire sur des colonnes que la route ne souhaitait pas
 * exposer) — équivalent PostgREST d'une injection SQL, d'autant plus
 * gênante que ces routes tournent avec le client service_role.
 *
 * Deux gardes :
 *  - sanitizeSearchTerm : neutralise les séparateurs/opérateurs de la
 *    grammaire `.or()` ET les jokers LIKE (`%` `_`), borne la longueur —
 *    à utiliser pour toute valeur interpolée dans `.or(...)` / `.ilike(...)`;
 *  - isUuid : validation stricte des identifiants UUID avant toute
 *    interpolation dans un filtre `.eq(...)` / `.or(...)`.
 */

/** Longueur max d'un terme de recherche (au-delà : tronqué). */
export const MAX_SEARCH_TERM_LENGTH = 64

/**
 * Nettoie un terme de recherche saisi avant interpolation PostgREST.
 *
 * - retire les séparateurs de la grammaire `.or()` ( `,` `(` `)` ),
 *   le caractère d'échappement `\` et les jokers LIKE `%` `_` ;
 * - compacte les espaces et borne la longueur (MAX_SEARCH_TERM_LENGTH) ;
 * - renvoie une chaîne VIDE si le terme nettoyé est vide — l'appelant
 *   doit alors omettre le filtre (convention des routes : truthy → filtre).
 */
export function sanitizeSearchTerm(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/[,()\\%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEARCH_TERM_LENGTH)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True si `raw` est un UUID syntaxiquement valide (toutes variantes). */
export function isUuid(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID_RE.test(raw)
}
