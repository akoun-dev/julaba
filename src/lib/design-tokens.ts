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

/** UI-MP-011 — jeton d'état « écoute vocale » de l'espace MARCHAND
 * (signature du bouton d'écoute : fond + halo ring-4 + pulse). Les classes
 * Tailwind consomment les variables CSS jumelles de globals.css
 * (--vl-marchand*, valeurs 100 % identiques) — importer cette constante
 * uniquement pour les styles inline. */
export const VOICE_LISTENING_COLOR = '#D2622A'

/** UI-MP-011 — jeton d'état « écoute vocale » de l'espace PRODUCTEUR : la
 * modale vocale producteur porte le VERT de son espace (repère visuel
 * « vert = producteur »), plus jamais l'orange marchand. Variable CSS
 * jumelle : --vl-prod* dans globals.css. */
export const VOICE_LISTENING_COLOR_PROD = PROD_COLOR

/** MODE-921 — Couleur d'accent de l'espace COOPÉRATIVE (bleu, même
 * signature que l'espace coopérative de julaba-app #2072AF). Importée par
 * les écrans coop-* et marchand-coop — jamais de constante locale. */
export const COOP_COLOR = '#2072AF'

/** MODE-921 — variante hover de l'accent coopérative. */
export const COOP_COLOR_HOVER = '#1B6095'
