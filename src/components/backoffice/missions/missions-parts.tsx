'use client'

// Icônes des onglets de filtrage de l'écran Missions back-office
// (DET-001 tranche 11, MODE-1000) — verbatim depuis bo-missions-screen.tsx.

import { Target, Clock, CheckCircle2, PauseCircle } from 'lucide-react'

export const STATUS_TAB_ICONS: Record<string, React.ElementType> = {
  toutes: Target,
  en_cours: Clock,
  terminee: CheckCircle2,
  suspendue: PauseCircle,
}
