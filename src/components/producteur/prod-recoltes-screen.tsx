'use client'

import { PROD_COLOR } from '@/lib/design-tokens'
import { useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, Camera, ImageIcon, Wheat, MapPin, Calendar,
  Wallet, Plus, Upload, Info, X, Images, Package,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore, PRIX_MARCHE_REFERENCE, type RecolteQualite } from '@/lib/stores/producteur-store'
import { PRODUITS } from '@/lib/stores/identificateur-store'
import { formatFCFA } from '@/lib/utils'
import { ProdAideLitteratie } from '@/components/producteur/prod-aide-litteratie'
import { announceProducteurAction } from '@/lib/voice/producteur-actions'
import { cn } from '@/lib/utils'

const PARCELLES = ['Champ Nord', 'Champ Sud', 'Champ Est', 'Autre parcelle']

type Filter = 'toutes' | 'ce-mois' | 'publiees' | 'vendues'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'ce-mois', label: 'Ce mois' },
  { id: 'publiees', label: 'Publiées' },
  { id: 'vendues', label: 'Vendues' },
]

const STATUT_BADGE: Record<string, { label: string; className: string }> = {
  brouillon: { label: 'En attente de publication', className: 'bg-amber-100 text-amber-700 border-0 dark:bg-amber-900/60 dark:text-amber-300' },
  publiee: { label: 'Publiée sur le marché', className: 'bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/60 dark:text-emerald-300' },
  // Statut posé par le seed/serveur pour une récolte en stock — son badge
  // disparaissait silencieusement avant.
  disponible: { label: 'Disponible', className: 'bg-sky-100 text-sky-700 border-0 dark:bg-sky-900/60 dark:text-sky-300' },
  vendue: { label: 'Vendue', className: 'bg-slate-100 text-slate-700 border-0 dark:bg-slate-800 dark:text-slate-300' },
}

export function ProdRecoltesScreen() {
  const { soleilMode, goBack } = useAppStore()
  const { recoltes, publierRecolte, mettreEnStock, pendingOperations } = useProducteurStore()
  const [filter, setFilter] = useState<Filter>('toutes')
  const [showForm, setShowForm] = useState(false)
  const textClass = soleilMode ? 'text-black' : ''

  const currentMonth = new Date().toISOString().slice(0, 7)
  const filtered = recoltes.filter((r) => {
    if (filter === 'ce-mois') return r.dateRecolte.startsWith(currentMonth)
    // 'disponible' = récolte en stock côté serveur, au même niveau que
    // 'publiee' pour l'affichage marché.
    if (filter === 'publiees') return r.statut === 'publiee' || r.statut === 'disponible'
    if (filter === 'vendues') return r.statut === 'vendue'
    return true
  })

  if (showForm) {
    return <NouvelleRecolteForm onClose={() => setShowForm(false)} />
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mes récoltes</h1>
      </div>

      {/* F-22 (MODE-980) — aide littératie déployée sur l'écran à formulaire. */}
      <ProdAideLitteratie />

      <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              'shrink-0 min-h-11 px-3 rounded-full text-xs font-medium border transition-colors',
              filter === f.id
                ? 'bg-[#2E8B57] text-white border-transparent'
                : 'bg-card text-muted-foreground border-border'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
              <Wheat className="w-12 h-12 opacity-30" />
              Aucune récolte pour ce filtre
              <Button variant="outline" className="min-h-11" onClick={() => setShowForm(true)}>Déclarer une récolte</Button>
            </CardContent>
          </Card>
        )}
        {filtered.map((r) => {
          const badge = STATUT_BADGE[r.statut]
          return (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: `${PROD_COLOR}15` }}>
                    {r.photos.length > 0 ? (
                      <img src={r.photos[0]} alt={r.produit} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Wheat className="w-6 h-6" style={{ color: PROD_COLOR }} />
                      </div>
                    )}
                    {r.photos.length > 1 && (
                      <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[9px] font-semibold rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                        <Images className="w-2.5 h-2.5" /> {r.photos.length}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-semibold truncate', textClass)}>{r.produit} · {r.quantiteKg} kg</p>
                    {/* Date et parcelle regroupées sur une seule ligne : moins
                        de lignes par carte, liste plus scannable. */}
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 shrink-0" />
                      Récolté le {new Date(r.dateRecolte).toLocaleDateString('fr-FR')} · {r.parcelle}
                    </p>
                    {r.statut === 'vendue' ? (
                      <p className={cn('text-sm font-semibold mt-1 fcfa truncate', textClass)}>
                        {formatFCFA(r.montantVente ?? 0)} · {r.acheteur}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        Prix souhaité : {formatFCFA(r.prixSouhaiteParKg)}/kg
                      </p>
                    )}
                    {badge && <Badge className={cn('mt-2', badge.className)}>{badge.label}</Badge>}
                  </div>
                </div>
                {r.statut === 'brouillon' && (
                  <Button
                    className="w-full min-h-11 mt-3 text-white font-medium gap-2 bg-[#2E8B57] hover:bg-[#27794D]"
                    disabled={Boolean(pendingOperations[`recolte:${r.id}`])}
                    onClick={() => {
                      announceProducteurAction('Publication de la récolte en cours.', 'light')
                      publierRecolte(r.id)
                    }}
                  >
                    <Upload className="w-4 h-4" />
                    Publier sur le marché
                  </Button>
                )}
                {/* MODE-935 (I-01) — le WRITER du stock : la récolte entre
                    dans « Mon stock » (statut 'disponible' posé par le
                    serveur) ; l'écran stock et le KPI sortent de zéro. */}
                {(r.statut === 'brouillon' || r.statut === 'publiee') && (
                  <Button
                    variant="outline"
                    className="w-full min-h-11 mt-3 font-medium gap-2 border-[#2E8B57]/40 text-[#2E8B57] hover:bg-[#2E8B57]/5"
                    disabled={Boolean(pendingOperations[`recolte:${r.id}`])}
                    onClick={() => {
                      announceProducteurAction('Mise en stock de la récolte en cours.', 'light')
                      mettreEnStock(r.id)
                    }}
                  >
                    <Package className="w-4 h-4" />
                    Mettre en stock
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="fixed left-4 right-4 max-w-lg mx-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Button
          className="w-full h-12 text-white font-semibold gap-2 shadow-lg bg-[#2E8B57] hover:bg-[#27794D]"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-5 h-5" />
          Déclarer une nouvelle récolte
        </Button>
      </div>
    </div>
  )
}

function NouvelleRecolteForm({ onClose }: { onClose: () => void }) {
  const { soleilMode } = useAppStore()
  const { addRecolte } = useProducteurStore()
  const textClass = soleilMode ? 'text-black' : ''
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [photos, setPhotos] = useState<string[]>([])
  const [produit, setProduit] = useState('Manioc')
  const [quantite, setQuantite] = useState('')
  const [qualite, setQualite] = useState<RecolteQualite>('standard')
  const [dateRecolte, setDateRecolte] = useState(() => new Date().toISOString().slice(0, 10))
  const [parcelle, setParcelle] = useState(PARCELLES[0])
  const [prix, setPrix] = useState('')
  const [error, setError] = useState('')

  const prixMarche = PRIX_MARCHE_REFERENCE[produit]

  const MAX_PHOTOS = 6

  const capturePhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await CapacitorCamera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          quality: 80,
          promptLabelHeader: 'Photo de la récolte',
          promptLabelPhoto: 'Choisir depuis la galerie',
          promptLabelPicture: 'Prendre une photo',
        })
        const dataUrl = photo.dataUrl
        if (dataUrl) setPhotos((p) => [...p, dataUrl])
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
    reader.onloadend = () => setPhotos((p) => [...p, reader.result as string])
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removePhoto = (index: number) => setPhotos((p) => p.filter((_, i) => i !== index))

  const handleSave = (publier: boolean) => {
    setError('')
    const qty = parseFloat(quantite)
    if (!qty || qty <= 0) {
      setError('Entrez une quantité valide')
      return
    }
    const prixParKg = parseFloat(prix) || prixMarche?.prixFcfaKg || 0
    addRecolte({
      produit,
      quantiteKg: qty,
      qualite,
      dateRecolte,
      parcelle,
      prixSouhaiteParKg: prixParKg,
      photos,
      statut: publier ? 'publiee' : 'brouillon',
    })
    // UI-MP-004 — WF4 : jamais d'écriture silencieuse, la publication ou le
    // brouillon sont annoncés à la voix + vibrés.
    announceProducteurAction(
      publier ? `Récolte publiée : ${qty} kg de ${produit}.` : `Récolte enregistrée en brouillon : ${qty} kg de ${produit}.`,
    )
    onClose()
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Nouvelle récolte</h1>
      </div>

      <div className="px-4 mt-4 space-y-5">
        {/* Photos */}
        <div>
          <p className={cn('text-sm font-medium mb-2', textClass)}>
            Photos de la récolte {photos.length > 0 && <span className="text-muted-foreground font-normal">({photos.length}/{MAX_PHOTOS})</span>}
          </p>
          {photos.length === 0 ? (
            <button
              onClick={capturePhoto}
              className="w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground"
              style={{ borderColor: `${PROD_COLOR}55` }}
            >
              <Camera className="w-8 h-8" style={{ color: PROD_COLOR }} />
              <span className="text-sm">Prendre une photo</span>
              <span className="text-xs flex items-center gap-1"><ImageIcon className="w-3 h-3" /> ou choisir dans la galerie</span>
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                  <img src={url} alt={`Récolte ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    aria-label={`Retirer la photo ${i + 1}`}
                    className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60">
                      <X className="w-4 h-4 text-white" />
                    </span>
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  onClick={capturePhoto}
                  aria-label="Ajouter une photo"
                  className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground"
                  style={{ borderColor: `${PROD_COLOR}55` }}
                >
                  <Plus className="w-6 h-6" style={{ color: PROD_COLOR }} />
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        </div>

        {/* Produit */}
        <div>
          <p className={cn('text-sm font-medium mb-2', textClass)}>Produit</p>
          <Select value={produit} onValueChange={setProduit}>
            <SelectTrigger className="w-full h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUITS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quantité + date — regroupés côte à côte pour raccourcir le
            formulaire (l'ancienne version empilait 7 blocs à la suite). */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={cn('text-sm font-medium mb-2', textClass)}>Quantité</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                placeholder="500"
                value={quantite}
                onChange={(e) => { setQuantite(e.target.value); setError('') }}
                className="h-12"
              />
              <span className="text-sm text-muted-foreground shrink-0">kg</span>
            </div>
          </div>
          <div>
            <p className={cn('text-sm font-medium mb-2 flex items-center gap-1.5', textClass)}>
              <Calendar className="w-4 h-4" /> Date
            </p>
            <Input type="date" value={dateRecolte} onChange={(e) => setDateRecolte(e.target.value)} className="h-12" />
          </div>
        </div>

        {/* Qualité */}
        <div>
          <p className={cn('text-sm font-medium mb-2', textClass)}>Qualité</p>
          <div className="grid grid-cols-3 gap-2">
            {(['premium', 'standard', 'secondaire'] as RecolteQualite[]).map((q) => (
              <button
                key={q}
                onClick={() => setQualite(q)}
                className={cn(
                  'h-11 rounded-lg border text-sm font-medium capitalize transition-colors',
                  qualite === q
                    ? 'bg-[#2E8B57] text-white border-transparent'
                    : 'bg-card text-muted-foreground border-border'
                )}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Parcelle + prix */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={cn('text-sm font-medium mb-2 flex items-center gap-1.5', textClass)}>
              <MapPin className="w-4 h-4" /> Parcelle
            </p>
            <Select value={parcelle} onValueChange={setParcelle}>
              <SelectTrigger className="w-full h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARCELLES.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className={cn('text-sm font-medium mb-2 flex items-center gap-1.5', textClass)}>
              <Wallet className="w-4 h-4" /> Prix
            </p>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="decimal"
                placeholder={prixMarche ? String(prixMarche.prixFcfaKg) : '300'}
                value={prix}
                onChange={(e) => setPrix(e.target.value)}
                className="h-12"
              />
              <span className="text-xs text-muted-foreground shrink-0">FCFA/kg</span>
            </div>
          </div>
        </div>
        {prixMarche && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 -mt-2">
            <Info className="w-3 h-3 shrink-0" /> Prix indicatif : {formatFCFA(prixMarche.prixFcfaKg)}/kg
          </p>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      <div className="fixed left-4 right-4 max-w-lg mx-auto flex gap-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Button variant="outline" className="flex-1 h-12 bg-card" onClick={() => handleSave(false)}>
          Brouillon
        </Button>
        <Button className="flex-1 h-12 text-white font-semibold bg-[#2E8B57] hover:bg-[#27794D]" onClick={() => handleSave(true)}>
          Publier
        </Button>
      </div>
    </div>
  )
}
