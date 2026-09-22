'use client'

/**
 * MODE-977 (AUDIT-007 G4) — recherche transversale de l'espace coopérative,
 * sur le modèle de la palette BO (bo-command-palette.tsx) mais ancrée
 * mobile : ouverte par la loupe du header du shell (le raccourci Ctrl+K /
 * ⌘K reste actif pour les grands écrans où la sidebar est permanente).
 *
 * Sources (module pur coop-search.ts, index construit sur les données
 * RÉELLES du store) : navigation (COOP_NAV_ITEMS), membres → fiche (G3),
 * pot commun → Stock, besoins → Achats groupés. cmdk filtre nativement sur
 * la chaîne `value` — aucune logique de scoring recopiée.
 *
 * Budget mobile (AUDIT-007 §6) : index plafonné par source
 * (PLAFOND_PAR_SOURCE), aucune requête réseau — la palette ne consomme que
 * ce qui est déjà en mémoire.
 */

import { Fragment, useEffect, useMemo } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { COOP_COLOR } from '@/lib/design-tokens'
import {
  construireIndexRecherche,
  COOP_SEARCH_GROUPES,
  type CoopSearchGroupe,
  type CoopSearchResult,
} from '@/lib/cooperatives/coop-search'
import { COOP_NAV_ITEMS } from './coop-nav'
import { CoopIconProxy } from './coop-icon-proxy'

const TITRES_GROUPE: Record<CoopSearchGroupe, string> = {
  navigation: 'Aller à',
  membres: 'Membres',
  stock: 'Pot commun',
  besoins: 'Achats groupés',
}

export function CoopCommandPalette({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Sélecteurs atomiques (convention S-14 — jamais de store entier).
  const navigate = useAppStore((s) => s.navigate)
  const membres = useCooperativeStore((s) => s.membres)
  const stock = useCooperativeStore((s) => s.stock)
  const besoins = useCooperativeStore((s) => s.besoins)
  const selectionnerMembre = useCooperativeStore((s) => s.selectionnerMembre)

  // Raccourci clavier Ctrl+K / ⌘K (desktop — la sidebar permanente ne
  // dispense pas d'une recherche, comme au BO).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  // L'index est reconstruit à l'ouverture (les listes sont en mémoire —
  // coût nul, et l'ouverture montre toujours l'état courant).
  const groupes = useMemo(
    () =>
      construireIndexRecherche({
        routes: COOP_NAV_ITEMS,
        membres,
        stock,
        besoins,
      }),
    [open, membres, stock, besoins],
  )

  const executer = (resultat: CoopSearchResult) => {
    onOpenChange(false)
    if (resultat.action.type === 'navigate') {
      navigate(resultat.action.route as Parameters<typeof navigate>[0])
    } else {
      selectionnerMembre(resultat.action.membreId)
      navigate('coop-membre-detail')
    }
  }

  const groupesNonVides = COOP_SEARCH_GROUPES.filter((g) => groupes[g].length > 0)

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Recherche"
      description="Aller à un écran, ouvrir une fiche membre, retrouver un produit ou un besoin"
      className="sm:max-w-xl"
    >
      <CommandInput placeholder="Rechercher un écran, un membre, un produit, un besoin..." />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Aucun résultat pour cette recherche.</CommandEmpty>

        {groupesNonVides.map((groupe, gi) => (
          <Fragment key={groupe}>
            <CommandGroup heading={TITRES_GROUPE[groupe]}>
              {groupes[groupe].map((resultat) => (
                <CommandItem
                  key={resultat.id}
                  value={resultat.keywords}
                  onSelect={() => executer(resultat)}
                >
                  {groupe === 'membres' ? (
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: COOP_COLOR }}
                    >
                      {resultat.label.slice(0, 1).toUpperCase()}
                    </span>
                  ) : (
                    <CoopIconProxy
                      name={groupe === 'navigation' ? iconNavigation(resultat) : iconSource(groupe)}
                      className="h-4 w-4 shrink-0"
                    />
                  )}
                  <span className="font-medium">{resultat.label}</span>
                  {resultat.description && (
                    <span className="text-xs text-muted-foreground truncate">{resultat.description}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {gi < groupesNonVides.length - 1 && <CommandSeparator />}
          </Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  )
}

/** Icône d'un item de navigation — l'icône déclarée par COOP_NAV_ITEMS. */
function iconNavigation(resultat: CoopSearchResult): string {
  const item = COOP_NAV_ITEMS.find((i) => resultat.id === `nav-${i.id}`)
  return item?.icon ?? 'Compass'
}

function iconSource(groupe: CoopSearchGroupe): string {
  if (groupe === 'stock') return 'Package'
  if (groupe === 'besoins') return 'ClipboardList'
  return 'Compass'
}
