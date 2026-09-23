'use client'

// Écrans secondaires marchands — orchestrateur (DET-001 tranche 6, MODE-992).
// Chaque écran vit dans ./secondary/*, transféré verbatim depuis l'ancien
// fichier monolithe ; la logique pure (clamps, validation tontine, subjectRole
// fidélité) vit dans src/lib/marchand/secondary-logic.ts avec tests.
// Ce module ne définit plus rien : il maintient la surface d'import unique
// de page.tsx.

export { MarcheScreen } from './secondary/marche-screen'
export { CommandesScreen } from './secondary/commandes-screen'
export { TontinesScreen } from './secondary/tontines-screen'

// ============================================================
// PROFIL SCREEN - Re-exported from dedicated module
// ============================================================

export { ProfilScreen } from './profile-screen'

// Keiwa wallet lives in its own module now that it is a real screen —
// re-exported so page.tsx keeps a single import surface.
export { KeiwaScreen } from './keiwa-screen'


export { AcademyScreen } from './secondary/academy-screen'
export { FideliteScreen } from './secondary/fidelite-screen'
export { ProtectionSocialeScreen } from './secondary/protection-sociale-screen'
