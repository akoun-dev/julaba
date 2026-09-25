'use client'

import { PROD_COLOR } from '@/lib/design-tokens'
import { useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ProdAideLitteratie } from '@/components/producteur/prod-aide-litteratie'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Wheat, Camera, BookOpen, CheckCircle2, Plus, Sprout } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { announceProducteurAction } from '@/lib/voice/producteur-actions'
import { AppEmpty } from '@/components/shared/app-states'
import { cn } from '@/lib/utils'


export function ProdCyclesScreen() {
  const { soleilMode, goBack } = useAppStore()
  const { cycleEnCours, cyclesTermines, addJournalEntry, demarrerCycle, terminerCycle, pendingOperations } = useProducteurStore()
  const textClass = soleilMode ? 'text-black' : ''
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Formulaire replié par défaut : le carnet se lit d'abord, on ouvre le
  // formulaire seulement quand on veut écrire une entrée.
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [entryText, setEntryText] = useState('')
  const [entryPhoto, setEntryPhoto] = useState<string | undefined>()

  // Task 98-B — démarrage d'un cycle réel (table legacy_producteur_cycles +
  // POST /api/producteur/cycles). Replié par défaut, comme le carnet.
  const [showCycleForm, setShowCycleForm] = useState(false)
  const [cycleProduit, setCycleProduit] = useState('')
  const [cycleParcelle, setCycleParcelle] = useState('')
  const [cycleDateSemis, setCycleDateSemis] = useState(new Date().toISOString().slice(0, 10))
  const [cycleDateRecolte, setCycleDateRecolte] = useState('')

  // MODE-935 (I-03) — clôture du cycle : formulaire replié avec la quantité
  // réellement récoltée (saisie producteur, jamais déduite du prévisionnel).
  const [showFinishForm, setShowFinishForm] = useState(false)
  const [quantiteRecoltee, setQuantiteRecoltee] = useState('')

  const capturePhoto = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await CapacitorCamera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          quality: 80,
          promptLabelHeader: 'Photo du champ',
          promptLabelPhoto: 'Choisir depuis la galerie',
          promptLabelPicture: 'Prendre une photo',
        })
        if (photo.dataUrl) setEntryPhoto(photo.dataUrl)
      } catch {
        // User cancelled — nothing to do.
      }
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setEntryPhoto(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleAddEntry = () => {
    const texte = entryText.trim()
    if (!texte) return
    addJournalEntry(texte, entryPhoto)
    setEntryText('')
    setEntryPhoto(undefined)
    setShowEntryForm(false)
    // UI-MP-004 — WF4 : l'entrée du carnet de champ est confirmée à la voix
    // (le producteur les mains dans la terre n'a pas toujours l'écran sous
    // les yeux) + vibrée.
    announceProducteurAction('Entrée ajoutée au carnet.')
  }

  // Task 98-B — le POST rejoue l'annonce elle-même (succès parlé) ; ici on
  // ne fait que valider localement et replier le formulaire.
  const handleDemarrerCycle = () => {
    const produit = cycleProduit.trim()
    if (!produit || !cycleDateSemis || !cycleDateRecolte) return
    demarrerCycle({
      produit,
      parcelle: cycleParcelle.trim(),
      dateSemis: cycleDateSemis,
      dateRecoltePrevue: cycleDateRecolte,
    })
    setCycleProduit('')
    setCycleParcelle('')
    setShowCycleForm(false)
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mes cycles de production</h1>
      </div>

      {/* F-22 (MODE-980) — aide littératie déployée sur l'écran à formulaire. */}
      <ProdAideLitteratie />

      {cycleEnCours && (
        <div className="px-4 mt-4">
          <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
            Cycle en cours
          </h3>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wheat className="w-4 h-4" style={{ color: PROD_COLOR }} />
                <p className={cn('font-semibold', textClass)}>{cycleEnCours.produit} · {cycleEnCours.parcelle}</p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Semé le {new Date(cycleEnCours.dateSemis).toLocaleDateString('fr-FR')} · Récolte prévue le{' '}
                {new Date(cycleEnCours.dateRecoltePrevue).toLocaleDateString('fr-FR')}
              </p>
              <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${Math.min(100, Math.round((cycleEnCours.joursEcoules / cycleEnCours.joursTotal) * 100))}%`,
                    backgroundColor: PROD_COLOR,
                  }}
                />
              </div>
              <p className={cn('text-sm', textClass)}>
                J+{cycleEnCours.joursEcoules}/{cycleEnCours.joursTotal} · Phase : {cycleEnCours.phase}
              </p>
              {/* MODE-935 (I-03) — « Terminer le cycle » : la clôture pose
                  statut='termine' + la quantité réellement récoltée ; un
                  seul cycle en cours est possible, il devient visible et
                  closable au lieu de s'accumuler invisible. */}
              {showFinishForm ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <label className={cn('block text-xs text-muted-foreground space-y-1', soleilMode && 'text-sm')}>
                    Quantité réellement récoltée (kg)
                    <Input
                      value={quantiteRecoltee}
                      onChange={(e) => setQuantiteRecoltee(e.target.value.replace(/[^\d.,]/g, ''))}
                      placeholder="Ex : 320"
                      inputMode="decimal"
                      aria-label="Quantité récoltée en kilogrammes"
                      className="min-h-11 mt-1"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      className="flex-1 min-h-11"
                      onClick={() => { setShowFinishForm(false); setQuantiteRecoltee('') }}
                    >
                      Annuler
                    </Button>
                    <Button
                      className="flex-1 min-h-11 text-white gap-1.5 bg-[#2E8B57] hover:bg-[#27794D]"
                      disabled={!quantiteRecoltee.trim() || Object.keys(pendingOperations).some((key) => key.startsWith('cycle:'))}
                      onClick={() => {
                        terminerCycle(Number(quantiteRecoltee.replace(',', '.')))
                        setShowFinishForm(false)
                        setQuantiteRecoltee('')
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Terminer le cycle
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full min-h-11 mt-3 gap-2 border-[#2E8B57]/40 text-[#2E8B57] hover:bg-[#2E8B57]/5"
                  disabled={Object.keys(pendingOperations).some((key) => key.startsWith('cycle:'))}
                  onClick={() => setShowFinishForm(true)}
                >
                  <CheckCircle2 className="w-4 h-4" /> Terminer ce cycle
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Aucun cycle en cours — empty state explicite + démarrage réel */}
      {!cycleEnCours && (
        <div className="px-4 mt-4">
          {/* MODE-1008 : AppEmpty (miroir BoEmptyState), texte inchangé. */}
          <Card>
            <CardContent className="p-0">
              <AppEmpty
                icon={Wheat}
                title="Aucun cycle en cours. Démarrez une culture pour la suivre ici."
                soleilMode={soleilMode}
                className="py-10"
              />
            </CardContent>
          </Card>
          {showCycleForm ? (
            <Card className="mt-3">
              <CardContent className="p-4 space-y-3">
                <p className={cn('text-sm font-semibold', textClass)}>Nouveau cycle</p>
                <Input
                  placeholder="Culture (ex : Maïs)"
                  value={cycleProduit}
                  onChange={(e) => setCycleProduit(e.target.value)}
                  aria-label="Culture"
                  className="min-h-11"
                />
                <Input
                  placeholder="Parcelle (ex : Champ nord)"
                  value={cycleParcelle}
                  onChange={(e) => setCycleParcelle(e.target.value)}
                  aria-label="Parcelle"
                  className="min-h-11"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground space-y-1">
                    Date de semis
                    <Input
                      type="date"
                      value={cycleDateSemis}
                      onChange={(e) => setCycleDateSemis(e.target.value)}
                      aria-label="Date de semis"
                      className="min-h-11"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground space-y-1">
                    Récolte prévue
                    <Input
                      type="date"
                      value={cycleDateRecolte}
                      onChange={(e) => setCycleDateRecolte(e.target.value)}
                      aria-label="Récolte prévue"
                      className="min-h-11"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="flex-1 min-h-11" onClick={() => setShowCycleForm(false)}>
                    Annuler
                  </Button>
                  <Button
                    className="flex-1 min-h-11 text-white gap-1.5 bg-[#2E8B57] hover:bg-[#27794D]"
                    disabled={!cycleProduit.trim() || !cycleDateSemis || !cycleDateRecolte || new Date(cycleDateRecolte) <= new Date(cycleDateSemis)}
                    onClick={handleDemarrerCycle}
                  >
                    <Sprout className="w-4 h-4" /> Démarrer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              className="w-full min-h-12 mt-3 gap-2 text-white bg-[#2E8B57] hover:bg-[#27794D]"
              onClick={() => setShowCycleForm(true)}
            >
              <Sprout className="w-4 h-4" /> Démarrer un cycle
            </Button>
          )}
        </div>
      )}

      {/* Carnet de champ */}
      {cycleEnCours && (
        <div className="px-4 mt-5">
          <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5', soleilMode && 'text-base')}>
            <BookOpen className="w-4 h-4" /> Carnet de champ
          </h3>

          {showEntryForm ? (
            <Card className="mb-3">
              <CardContent className="p-4 space-y-2">
                <Textarea
                  placeholder="Ex : Deuxième sarclage effectué aujourd'hui"
                  value={entryText}
                  onChange={(e) => setEntryText(e.target.value)}
                  className="min-h-20"
                />
                {entryPhoto && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border">
                    <img src={entryPhoto} alt="Photo de l'entrée" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="min-h-11 gap-1.5" onClick={capturePhoto}>
                    <Camera className="w-3.5 h-3.5" /> {entryPhoto ? 'Changer la photo' : 'Ajouter une photo'}
                  </Button>
                  <Button
                    className="ml-auto min-h-11 text-white gap-1.5 bg-[#2E8B57] hover:bg-[#27794D]"
                    disabled={!entryText.trim() || Object.keys(pendingOperations).some((key) => key.startsWith('journal:'))}
                    onClick={handleAddEntry}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ajouter
                  </Button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              className="w-full h-11 gap-2 border-[#2E8B57]/40 text-[#2E8B57] hover:bg-[#2E8B57]/5 mb-3"
              onClick={() => setShowEntryForm(true)}
            >
              <Plus className="w-4 h-4" /> Ajouter une entrée au carnet
            </Button>
          )}

          <div className="space-y-2">
            {cycleEnCours.journal.length === 0 && (
              // MODE-1008 : AppEmpty (miroir BoEmptyState), texte inchangé.
              <AppEmpty
                title="Aucune entrée pour l'instant. Notez ici vos travaux de champ."
                soleilMode={soleilMode}
                className="py-6"
              />
            )}
            {cycleEnCours.journal.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-3 flex items-start gap-3">
                  {entry.photoUrl && (
                    <img src={entry.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString('fr-FR')}</p>
                    <p className={cn('text-sm', textClass)}>{entry.texte}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="px-4 mt-5">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Historique
        </h3>
        <div className="space-y-2">
          {cyclesTermines.length === 0 && (
            // MODE-1008 : AppEmpty (miroir BoEmptyState), texte inchangé.
            <AppEmpty
              title="Aucun cycle terminé pour le moment."
              soleilMode={soleilMode}
              className="py-6"
            />
          )}
          {cyclesTermines.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', textClass)}>{c.produit} ({c.periode})</p>
                </div>
                <span className={cn('text-sm font-semibold shrink-0', textClass)}>
                  {c.quantiteRecolteeKg.toLocaleString('fr-FR')} kg
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
