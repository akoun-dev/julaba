'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Pencil,
  Plus,
  Store,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/stores/app-store'
import { useSellingPointsStore } from '@/lib/market-mode/selling-points-store'
import { activeOrDefault, type SellingPoint, type SellingPointKind } from '@/lib/market-mode/selling-point'
import { tataSpeak, playBeep, haptic } from '@/lib/voice/tata-tts'

// MODE-908 (§18) — écran « Mes points de vente » : liste (nom, kind en
// badge, actif en surbrillance, archivés en section repliée), ajout
// (nom + kind), renommage, archivage (JAMAIS de suppression), définition du
// point actif. Tout est lu depuis le store local (selling-points-store) —
// offline-first : l'écran ne dépend JAMAIS du réseau. Zéro emoji, gros
// boutons, formulations tata (tutoiement).

const KIND_OPTIONS: Array<{ id: SellingPointKind; label: string }> = [
  { id: 'boutique', label: 'Boutique' },
  { id: 'marche', label: 'Marché' },
  { id: 'autre', label: 'Autre' },
]

function kindLabel(kind: SellingPointKind): string {
  return KIND_OPTIONS.find((k) => k.id === kind)?.label ?? 'Autre'
}

export function PointsVenteScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const points = useSellingPointsStore((s) => s.points)
  const activePointClientId = useSellingPointsStore((s) => s.activePointClientId)
  const textClass = soleilMode ? 'text-black' : ''

  // Premier usage : « Boutique » est créée automatiquement — jamais de
  // liste vide bloquante. Effet de montage (jamais pendant le rendu :
  // activePoint mute le store au premier appel).
  useEffect(() => {
    useSellingPointsStore.getState().activePoint()
  }, [])

  // MODE-940 (AUDIT-003 F-11) — resynchronisation multi-appareils : les
  // points créés/renommés/archivés depuis un autre appareil sont relus
  // au montage et fusionnés (la préférence « point actif » reste
  // appareil). Best-effort : hors ligne, rien ne change.
  useEffect(() => {
    if (!merchantId) return
    void useSellingPointsStore.getState().resyncFromServer(merchantId)
  }, [merchantId])

  const list = useMemo(
    () => Object.values(points).sort((a, b) => a.createdAt - b.createdAt),
    [points],
  )
  const activePoints = useMemo(() => list.filter((p) => p.archivedAt == null), [list])
  const archivedPoints = useMemo(() => list.filter((p) => p.archivedAt != null), [list])
  const active = useMemo(
    () => activeOrDefault(list, activePointClientId),
    [list, activePointClientId],
  )

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<SellingPointKind>('boutique')
  const [renameFor, setRenameFor] = useState<SellingPoint | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const handleAdd = () => {
    const result = useSellingPointsStore.getState().addPoint({ name: newName, kind: newKind })
    if (!result.ok) {
      setError(result.error)
      return
    }
    playBeep('success')
    haptic('success')
    tataSpeak(`${result.point.name} ajouté.`)
    setShowAdd(false)
    setNewName('')
    setNewKind('boutique')
    setError(null)
  }

  const handleRename = () => {
    if (!renameFor) return
    const result = useSellingPointsStore.getState().renamePoint(renameFor.clientId, renameValue)
    if (!result.ok) {
      setError(result.error)
      return
    }
    playBeep('success')
    haptic('success')
    tataSpeak(`C'est noté : ${result.point.name}.`)
    setRenameFor(null)
    setRenameValue('')
    setError(null)
  }

  const handleSetActive = (point: SellingPoint) => {
    haptic('light')
    const result = useSellingPointsStore.getState().setActive(point.clientId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    playBeep('success')
    tataSpeak(`Tu vends maintenant à ${point.name}.`)
  }

  const handleArchive = (point: SellingPoint) => {
    haptic('light')
    const result = useSellingPointsStore.getState().archivePoint(point.clientId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    tataSpeak(`${point.name} archivé. Tu ne supprimes jamais rien.`)
  }

  return (
    <div className="screen-enter min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-40 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C66A2C]">Mode Marché</p>
            <h1 className={`truncate text-xl font-bold ${textClass}`}>Mes points de vente</h1>
          </div>
          <Store className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" />
        </div>
      </header>

      <main className="space-y-5 px-4 py-5">
        {/* Point actif */}
        <Card className="border-[#E8944F]/40 bg-[#FDF3ED]">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 text-[#C66A2C]" />
              <span className="text-xs font-semibold uppercase tracking-wide">Tu vends actuellement à</span>
            </div>
            <p className={`mt-2 text-2xl font-bold text-[#C66A2C] ${soleilMode ? 'text-3xl' : ''}`} aria-live="polite">
              {active.name}
            </p>
            <p className={`mt-1 text-sm text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>
              Chaque vente est notée avec ce nom, même sans connexion.
            </p>
          </CardContent>
        </Card>

        <Button
          className="h-14 w-full bg-[#C66A2C] text-base text-white hover:bg-[#9E5222]"
          onClick={() => {
            haptic('light')
            setError(null)
            setShowAdd(true)
          }}
        >
          <Plus className="mr-2 h-5 w-5" /> Nouveau point de vente
        </Button>

        {/* Points en activité */}
        <section>
          <h2 className={`mb-3 text-lg font-bold ${textClass}`}>Points en activité</h2>
          <div className="space-y-2">
            {activePoints.map((point) => {
              const isActive = point.clientId === active.clientId
              return (
                <Card key={point.clientId} className={isActive ? 'border-[#C66A2C] ring-1 ring-[#C66A2C]/40' : undefined}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF3ED]">
                          {point.kind === 'marche' ? (
                            <MapPin className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" />
                          ) : (
                            <Store className="h-5 w-5 text-[#C66A2C]" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`truncate font-semibold ${textClass}`}>{point.name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge className="border-0 bg-muted text-muted-foreground">{kindLabel(point.kind)}</Badge>
                            {isActive && (
                              <Badge className="border-0 bg-[#FDF3ED] text-[#C66A2C]">
                                <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" /> Point actif
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!isActive && (
                        <Button
                          className="min-h-11 flex-1 bg-[#C66A2C] text-white hover:bg-[#B55D25]"
                          onClick={() => handleSetActive(point)}
                        >
                          <MapPin className="mr-1 h-4 w-4" /> Vendre ici
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="min-h-11 flex-1"
                        onClick={() => {
                          haptic('light')
                          setError(null)
                          setRenameFor(point)
                          setRenameValue(point.name)
                        }}
                      >
                        <Pencil className="mr-1 h-4 w-4" /> Renommer
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-11 flex-1 text-amber-700 hover:bg-amber-50"
                        onClick={() => handleArchive(point)}
                      >
                        <Archive className="mr-1 h-4 w-4" /> Archiver
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        {/* Archivés — section repliée (jamais de suppression) */}
        {archivedPoints.length > 0 && (
          <section>
            <button
              type="button"
              className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-sm font-semibold ${textClass}`}
              onClick={() => setShowArchived((v) => !v)}
              aria-expanded={showArchived}
            >
              <span>Archivés ({archivedPoints.length})</span>
              <span className="text-xs font-normal text-muted-foreground">{showArchived ? 'Replier' : 'Déplier'}</span>
            </button>
            {showArchived && (
              <div className="mt-2 space-y-2">
                {archivedPoints.map((point) => (
                  <Card key={point.clientId} className="opacity-70">
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Archive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <p className={`truncate text-sm font-medium ${textClass}`}>{point.name}</p>
                      </div>
                      <Badge className="border-0 bg-muted text-muted-foreground">{kindLabel(point.kind)}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Rien n'est jamais supprimé : un point archivé reste dans ton cahier. Tes points se synchronisent dès que la connexion revient.
        </p>
      </main>

      {/* Modale : nouveau point de vente — Sheet Radix (UI-MP-003). */}
      {showAdd && (
        <Sheet open onOpenChange={(o) => { if (!o) setShowAdd(false) }}>
          <SheetContent side="bottom" aria-describedby={undefined} className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-0 gap-0 border-0 [&>button:last-of-type]:hidden">
            <div className="p-6 pb-10">
              <div className="mb-4 flex items-center justify-between">
                <SheetTitle asChild>
                  <h3 className={`text-lg font-bold ${textClass}`}>Nouveau point de vente</h3>
                </SheetTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowAdd(false)} aria-label="Fermer">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <label className={`mb-1 block text-sm font-medium ${textClass}`}>Nom du point</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex : Marché Adjamé"
                aria-label="Nom du point de vente"
                maxLength={60}
                autoFocus
              />
              <label className={`mb-1 mt-4 block text-sm font-medium ${textClass}`}>Type de point</label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type de point de vente">
                {KIND_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={newKind === option.id}
                    onClick={() => setNewKind(option.id)}
                    className={`min-h-11 rounded-xl border px-2 text-sm font-semibold ${newKind === option.id ? 'border-[#C66A2C] bg-[#C66A2C] text-white' : 'border-border bg-background text-muted-foreground'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {error && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}
              <Button
                className="mt-6 h-12 w-full bg-[#C66A2C] text-white hover:bg-[#B55D25]"
                onClick={handleAdd}
                disabled={newName.trim().length < 2}
              >
                Ajouter le point
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Modale : renommer — Sheet Radix (UI-MP-003). */}
      {renameFor && (
        <Sheet open onOpenChange={(o) => { if (!o) setRenameFor(null) }}>
          <SheetContent side="bottom" aria-describedby={undefined} className="w-full max-w-lg mx-auto rounded-t-3xl rounded-b-none p-0 gap-0 border-0 [&>button:last-of-type]:hidden">
            <div className="p-6 pb-10">
              <div className="mb-4 flex items-center justify-between">
                <SheetTitle asChild>
                  <h3 className={`text-lg font-bold ${textClass}`}>Renommer {renameFor.name}</h3>
                </SheetTitle>
                <Button variant="ghost" size="icon" onClick={() => setRenameFor(null)} aria-label="Fermer">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <label className={`mb-1 block text-sm font-medium ${textClass}`}>Nouveau nom</label>
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                aria-label="Nouveau nom du point de vente"
                maxLength={60}
                autoFocus
              />
              {error && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}
              <div className="mt-6 flex gap-2">
                <Button variant="outline" className="h-12 flex-1" onClick={() => setRenameFor(null)}>
                  Annuler
                </Button>
                <Button
                  className="h-12 flex-1 bg-[#C66A2C] text-white hover:bg-[#B55D25]"
                  onClick={handleRename}
                  disabled={renameValue.trim().length < 2}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
