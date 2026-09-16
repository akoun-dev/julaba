'use client'

import { useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Wheat, Camera, BookOpen, CheckCircle2 } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { cn } from '@/lib/utils'

const PROD_COLOR = '#2E8B57'

export function ProdCyclesScreen() {
  const { soleilMode, goBack } = useAppStore()
  const { cycleEnCours, cyclesTermines, addJournalEntry } = useProducteurStore()
  const textClass = soleilMode ? 'text-black' : ''
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [entryText, setEntryText] = useState('')
  const [entryPhoto, setEntryPhoto] = useState<string | undefined>()

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
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mes cycles de production</h1>
      </div>

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
            </CardContent>
          </Card>
        </div>
      )}

      {/* Carnet de champ */}
      {cycleEnCours && (
        <div className="px-4 mt-5">
          <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5', soleilMode && 'text-base')}>
            <BookOpen className="w-4 h-4" /> Carnet de champ
          </h3>

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
                <Button variant="outline" size="sm" className="gap-1.5" onClick={capturePhoto}>
                  <Camera className="w-3.5 h-3.5" /> {entryPhoto ? 'Changer la photo' : 'Ajouter une photo'}
                </Button>
                <Button
                  size="sm"
                  className="ml-auto text-white gap-1.5"
                  style={{ backgroundColor: PROD_COLOR }}
                  disabled={!entryText.trim()}
                  onClick={handleAddEntry}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ajouter
                </Button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
            </CardContent>
          </Card>

          <div className="space-y-2">
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
