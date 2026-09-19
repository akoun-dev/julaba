/**
 * Jetons de design partagés (NORM-304) — UNE définition par couleur
 * d'espace, plus jamais une constante locale par fichier.
 *
 * Historique : les 9 écrans producteur définissaient chacun leur
 * `const PROD_COLOR = '#2E8B57'` en haut de fichier (idem marchand avec
 * #C66A2C en classes Tailwind inline). Une seule source évite la dérive
 * silencieuse d'une teinte entre écrans.
 */

/** Couleur d'accent de l'espace PRODUCTEUR (vert). */
export const PROD_COLOR = '#2E8B57'

/** Couleur d'accent de l'espace MARCHAND (orange Terra). Utilisée en
 * classes Tailwind inline (`bg-[#C66A2C]`) — importer cette constante pour
 * les styles inline (style={{ color: MARCHAND_COLOR }}). */
export const MARCHAND_COLOR = '#C66A2C'

/** Variante hover de l'accent marchand. */
export const MARCHAND_COLOR_HOVER = '#B55D25'
