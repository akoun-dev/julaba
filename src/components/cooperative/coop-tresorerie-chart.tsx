'use client'

/**
 * MODE-975 (AUDIT-007 Phase 3) — Courbe de trésorerie validée du dashboard
 * coopératif (séries jour par jour du MODE-972 : entrées / sorties, les
 * cotisations font partie des entrées — même sémantique que le module
 * partagé MODE-935).
 *
 * Pourquoi un fichier SÉPARÉ : le graphique est chargé en next/dynamic
 * (ssr:false) par l'accueil — budget rendu mobile (garde-fou #5) : un
 * président qui n'arrive que pour valider une écriture ne télécharge pas
 * le bundle recharts. Les widgets légers (héros, KPIs, top produits,
 * mouvements) restent dans coop-dashboard.tsx, toujours synchrones.
 *
 * Données : la fenêtre vient du sélecteur (7 ou 30 jours) — zéro remplissage
 * cosmétique, les jours sans écriture sont des zéros explicites côté
 * serveur (honnêteté des données, garde-fou #1).
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COOP_COLOR } from '@/lib/design-tokens'
import type { DashboardCoop } from '@/lib/stores/cooperative-store'

type JourTresorerie = DashboardCoop['series']['tresorerie'][number]

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const

function libelleJour(jourIso: string): string {
  const d = new Date(`${jourIso}T00:00:00Z`)
  return `${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`
}

/** Axe Y compact : 12 000 → « 12k » (FCFA implicite, rappelé au tooltip). */
function montantCompact(valeur: number): string {
  if (Math.abs(valeur) >= 1_000_000) return `${(valeur / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
  if (Math.abs(valeur) >= 1_000) return `${(valeur / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k`
  return String(valeur)
}

const COULEUR_SORTIES = '#C2410C'

export function CoopTresorerieChart({ serie }: { serie: DashboardCoop['series']['tresorerie'] }) {
  return (
    <div className="h-52 w-full" role="img" aria-label="Trésorerie validée par jour : entrées et sorties">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="coopEntrees" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COOP_COLOR} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COOP_COLOR} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="coopSorties" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COULEUR_SORTIES} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COULEUR_SORTIES} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
          <XAxis
            dataKey="jour"
            tickFormatter={libelleJour}
            tick={{ fontSize: 11, fill: '#78716C' }}
            axisLine={{ stroke: '#E7E5E4' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={montantCompact}
            tick={{ fontSize: 11, fill: '#78716C' }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            formatter={(value: number, nom: string) => [
              `${value.toLocaleString('fr-FR')} FCFA`,
              nom === 'entrees' ? 'Entrées' : 'Sorties',
            ]}
            labelFormatter={(label: string) => libelleJour(label)}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #E7E5E4',
              fontSize: 12,
              padding: '6px 10px',
            }}
          />
          <Area
            type="monotone"
            dataKey="entrees"
            name="entrees"
            stroke={COOP_COLOR}
            strokeWidth={2}
            fill="url(#coopEntrees)"
          />
          <Area
            type="monotone"
            dataKey="sorties"
            name="sorties"
            stroke={COULEUR_SORTIES}
            strokeWidth={2}
            fill="url(#coopSorties)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
