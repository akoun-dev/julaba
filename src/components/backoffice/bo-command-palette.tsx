'use client'

import { useEffect } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  useBackofficeStore,
  hasSidebarItemAccess,
  hasModuleAccess,
  SIDEBAR_GROUPS,
  ADMINISTRATION_ITEMS,
  ACTOR_TYPE_ICONS,
  STATUS_LABELS,
  type BoScreenRoute,
} from '@/lib/stores/backoffice-store'
import { IconProxy } from './bo-icon-proxy'
import { Hourglass, MapPin, Search } from 'lucide-react'

/**
 * Recherche globale du backoffice (Ctrl+K / ⌘K).
 * Navigue entre les écrans, ouvre une fiche acteur ou filtre un écran
 * (enrôlements, zones) avec la requête saisie.
 */
export function BoCommandPalette() {
  const commandPaletteOpen = useBackofficeStore((s) => s.commandPaletteOpen)
  const setCommandPaletteOpen = useBackofficeStore((s) => s.setCommandPaletteOpen)
  const boUserRole = useBackofficeStore((s) => s.boUserRole)
  const boNavigate = useBackofficeStore((s) => s.boNavigate)
  const actors = useBackofficeStore((s) => s.actors)
  const enrolments = useBackofficeStore((s) => s.enrolments)
  const zones = useBackofficeStore((s) => s.zones)
  const setSearchQuery = useBackofficeStore((s) => s.setSearchQuery)
  const openActorDetail = useBackofficeStore((s) => s.openActorDetail)

  // Raccourci clavier global Ctrl+K / ⌘K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  // Navigue vers un écran et y applique la requête de recherche
  const searchIn = (screen: BoScreenRoute, q: string) => {
    setSearchQuery(q)
    boNavigate(screen)
    setCommandPaletteOpen(false)
  }

  const accessibleGroups = SIDEBAR_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      hasSidebarItemAccess(boUserRole, item)
    ),
  })).filter((group) => group.items.length > 0)
  const accessibleAdministrationItems = ADMINISTRATION_ITEMS.filter((item) =>
    hasModuleAccess(boUserRole, item.id.replace('bo-', '') as never)
  )

  return (
    <CommandDialog
      open={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      title="Recherche globale"
      description="Rechercher un écran, un acteur, un enrôlement ou une zone"
      className="sm:max-w-xl"
    >
      <CommandInput placeholder="Rechercher un écran, un acteur, un enrôlement, une zone..." />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Aucun résultat pour cette recherche.</CommandEmpty>

        {/* ===== NAVIGATION ===== */}
        {accessibleGroups.map((group, gi) => (
          <CommandGroup key={group.id} heading={gi === 0 ? `Navigation · ${group.label}` : group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.id}
                value={`nav ${item.label}`}
                onSelect={() => {
                  boNavigate(item.id)
                  setCommandPaletteOpen(false)
                }}
              >
                <IconProxy name={item.icon} />
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {item.badge}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {accessibleAdministrationItems.length > 0 && (
          <CommandGroup heading="Administration">
            {accessibleAdministrationItems.map((item) => (
              <CommandItem
                key={item.id}
                value={`administration ${item.label}`}
                onSelect={() => {
                  boNavigate(item.id)
                  setCommandPaletteOpen(false)
                }}
              >
                <IconProxy name={item.icon} />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />

        {/* ===== ACTEURS ===== */}
        {actors.length > 0 && (
          <CommandGroup heading="Acteurs">
            {actors.slice(0, 400).map((actor) => (
              <CommandItem
                key={actor.id}
                value={`acteur ${actor.firstName} ${actor.lastName} ${actor.actorId} ${actor.phone} ${actor.zone}`}
                onSelect={() => {
                  openActorDetail(actor.id)
                  setCommandPaletteOpen(false)
                }}
              >
                {(() => {
                  const Icon = ACTOR_TYPE_ICONS[actor.type]
                  return Icon ? <Icon className="size-4" /> : null
                })()}
                <span className="font-medium">
                  {actor.firstName} {actor.lastName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {actor.actorId} · {actor.zone}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {STATUS_LABELS[actor.status]}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* ===== ENRÔLEMENTS EN ATTENTE ===== */}
        {enrolments.filter((e) => e.status === 'en_attente').length > 0 && (
          <CommandGroup heading="Enrôlements à traiter">
            {enrolments
              .filter((e) => e.status === 'en_attente')
              .slice(0, 50)
              .map((enrolment) => (
                <CommandItem
                  key={enrolment.id}
                  value={`enrolement ${enrolment.actorName} ${enrolment.dossierId} ${enrolment.phone} ${enrolment.zone}`}
                  onSelect={() => searchIn('bo-enrolement', enrolment.actorName)}
                >
                  <Hourglass className="size-4" />
                  <span className="font-medium">{enrolment.actorName}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    En attente
                  </span>
                </CommandItem>
              ))}
          </CommandGroup>
        )}

        {/* ===== ZONES ===== */}
        {zones.length > 0 && (
          <CommandGroup heading="Zones">
            {zones.slice(0, 100).map((zone) => (
              <CommandItem
                key={zone.id}
                value={`zone ${zone.name} ${zone.region || ''}`}
                onSelect={() => searchIn('bo-zones', zone.name)}
              >
                <MapPin className="size-4" />
                <span className="font-medium">{zone.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* ===== RECHERCHE DANS L'ÉCRAN ACTEURS ===== */}
        <CommandGroup heading="Actions">
          <CommandItem
            value="rechercher dans acteurs tous les acteurs liste"
            onSelect={() => searchIn('bo-acteurs', '')}
          >
            <Search className="size-4" />
            <span>Ouvrir la liste complète des acteurs</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
