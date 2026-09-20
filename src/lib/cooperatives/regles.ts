/**
 * MODE-935 (audit #003, I-11) — règles métier coopératives partagées.
 *
 * Le montant de la cotisation annuelle vivait UNIQUEMENT côté client
 * (constante locale de l'écran marchand) : le serveur se contentait
 * d'exiger un entier > 0 — un client modifié pouvait cotiser 1 FCFA
 * et devenir « à jour ». La constante est désormais partagée et la
 * route serveur l'impose.
 */

/** Cotisation annuelle d'adhésion, en FCFA (cf. marchand-coop-screen). */
export const COTISATION_ANNUELLE_FCFA = 25000
