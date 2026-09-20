'use client'

/**
 * MODE-932 — ScoreRing : anneau de score JULABA (parité julaba-app,
 * écran Membres). Seuils contractuels 71/41 → haut / moyen / bas.
 * SVG pur, sans dépendance : taille contrôlée par `taille` (px),
 * accessible (role="img" + aria-label). L'arc démarre à 12 h
 * (rotation SVG de l'anneau de progression seul — le texte reste droit).
 */

import { cn } from '@/lib/utils'
import { SEUIL_HAUT, SEUIL_MOYEN, type NiveauPerformance } from '@/lib/scores/score-julaba'

const COULEURS_NIVEAU: Record<NiveauPerformance, string> = {
  haut: '#16A34A',
  moyen: '#D97706',
  bas: '#DC2626',
}

const LIBELLES_NIVEAU: Record<NiveauPerformance, string> = {
  haut: 'performance haute',
  moyen: 'performance moyenne',
  bas: 'performance basse',
}

export function niveauDepuisScore(score: number): NiveauPerformance {
  if (score >= SEUIL_HAUT) return 'haut'
  if (score >= SEUIL_MOYEN) return 'moyen'
  return 'bas'
}

interface ScoreRingProps {
  /** Score 0–100 (valeurs hors bornes clampées à l'affichage). */
  score: number
  /** Diamètre en pixels (défaut 48). */
  taille?: number
  /** Épaisseur du trait (défaut 5). */
  epaisseur?: number
  className?: string
}

export function ScoreRing({ score, taille = 48, epaisseur = 5, className }: ScoreRingProps) {
  const scoreClamp = Math.min(100, Math.max(0, Math.round(score)))
  const niveau = niveauDepuisScore(scoreClamp)
  const couleur = COULEURS_NIVEAU[niveau]

  const rayon = (taille - epaisseur) / 2
  const circonference = 2 * Math.PI * rayon
  // Un petit décalage d'arc évite un anneau invisible à score 0.
  const arc = circonference * (scoreClamp / 100)
  const centre = taille / 2

  return (
    <svg
      width={taille}
      height={taille}
      viewBox={`0 0 ${taille} ${taille}`}
      role="img"
      aria-label={`Score ${scoreClamp} sur 100 — ${LIBELLES_NIVEAU[niveau]}`}
      className={cn('shrink-0', className)}
    >
      <circle cx={centre} cy={centre} r={rayon} fill="none" stroke="#E7E5E4" strokeWidth={epaisseur} />
      <g transform={`rotate(-90 ${centre} ${centre})`}>
        <circle
          cx={centre}
          cy={centre}
          r={rayon}
          fill="none"
          stroke={couleur}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circonference - arc}`}
        />
      </g>
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        style={{ fill: couleur, fontWeight: 700, fontSize: Math.round(taille * 0.3) }}
      >
        {scoreClamp}
      </text>
    </svg>
  )
}
