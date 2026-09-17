'use client'

/**
 * En-tête partagé des vues du menu identificateur (maquettes Accueil /
 * Dossiers / Missions / Détail) : libellé gras + ligne « Synchronisé… »,
 * pastille brune des réglages à droite. Fond beige plat, bordure chaude.
 */

import { Settings } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { formatRelativeTime } from '@/lib/relative-time'
import { cn } from '@/lib/utils'

export function IdentTopBar({ title }: { title: string }) {
  const { navigate } = useAppStore()
  const { dossiers, identDarkMode } = useIdentificateurStore()

  // Dernière activité connue = mise à jour la plus récente d'un dossier ;
  // sans donnée on reste sobre (« Synchronisé »).
  const lastUpdate = dossiers.reduce<number>((max, d) => Math.max(max, d.updatedAt || 0), 0)
  const syncLabel = lastUpdate ? `Synchronisé ${formatRelativeTime(lastUpdate)}` : 'Synchronisé'

  return (
    <header
      className={cn(
        'flex items-center justify-between border-b px-4 py-3',
        identDarkMode ? 'border-stone-800 bg-stone-950' : 'border-[#E7E0D8] bg-[#FAFAF7]'
      )}
    >
      <div className="min-w-0">
        <p className={cn('text-[13px] font-bold leading-tight', identDarkMode && 'text-stone-100')}>{title}</p>
        <p className={cn('mt-0.5 truncate text-[11px]', identDarkMode ? 'text-stone-400' : 'text-[#78716C]')}>{syncLabel}</p>
      </div>
      <button
        type="button"
        aria-label="Ouvrir les paramètres"
        onClick={() => navigate('ident-parametres')}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170] focus-visible:ring-offset-2',
          identDarkMode && 'ring-stone-950 focus-visible:ring-offset-stone-950'
        )}
        style={{ backgroundColor: '#9F8170' }}
      >
        <Settings className="h-[18px] w-[18px]" />
      </button>
    </header>
  )
}
