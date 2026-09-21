"use client"

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Camera,
  ArrowLeft,
  ArrowRight,
  Save,
  Upload,
  Trash2,
  MapPin,
  Map,
  FileText,
  RotateCcw,
  Loader2,
  Check,
  Lock,
  Grid3X3,
  ImageIcon,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertTriangle,
  Handshake,
  Sprout,
  Store,
  UserRound,
  CreditCard,
  ScanLine,
  Sparkles,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Geolocation as CapacitorGeolocation } from '@capacitor/geolocation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'
import { PatternLock } from '@/components/marchand/pattern-lock'
import { VisualCodeGrid, visualCodeToHash } from '@/components/marchand/visual-code-grid'
import {
  useIdentificateurStore,
  createEmptyDossier,
  type Dossier,
  type ActorType,
  ZONES,
  activitesPour,
  PRODUITS,
} from '@/lib/stores/identificateur-store'
import {
  MARCHAND_CATEGORIES_META,
  MARCHAND_CATEGORIES_BY_POSITION,
  type MarchandCategorie,
} from '@/lib/marchand-categories'
import { checkEnrollmentPhoto } from '@/lib/vision/photo-quality'
import { submitDossierToServer } from '@/lib/identificateur-sync'
import { extractDocumentText, parseCniFields } from '@/lib/vision/document-ocr'

const IDENT_COLOR = '#9F8170'
const TOTAL_STEPS = 5

// L'enrôlement démarre par la CNI : une seule action (scanner la carte)
// qui pré-remplit toute l'identité par OCR — l'étape la plus utile pour
// l'agent, et celle qui réduit le plus la saisie manuelle ensuite.
const STEPS_META = [
  { label: 'CNI', icon: CreditCard },
  { label: 'Photo & Identité', icon: UserRound },
  { label: 'Détails', icon: FileText },
  { label: 'Localisation', icon: MapPin },
  { label: 'Autorisation', icon: Lock },
]

// Simple hash utility (same as auth-screen)
const simpleHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}
const patternToHash = (pattern: number[]) => simpleHash(pattern.join('-'))

export function IdentIdentificationScreen() {
  const { goBack, navigate, soleilMode, merchantId, merchantName } = useAppStore()
  const {
    dossiers,
    addDossier,
    updateDossier,
    currentDraftId,
    setCurrentDraftId,
    identDarkMode,
  } = useIdentificateurStore()
  const { toast } = useToast()

  const [currentStep, setCurrentStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Auth step states
  const [pinValue, setPinValue] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [pinDone, setPinDone] = useState(false)
  const [patternDone, setPatternDone] = useState(false)
  const [patternError, setPatternError] = useState(false)
  const [visualDone, setVisualDone] = useState(false)
  const [visualError, setVisualError] = useState(false)
  const [visualGridKey, setVisualGridKey] = useState(0)

  // Initialize dossier — synchronous via lazy initializer for new dossiers
  const [dossier, setDossier] = useState<Dossier | null>(() => {
    // Try to resume an existing draft
    if (currentDraftId) {
      const existing = dossiers.find((d) => d.id === currentDraftId)
      if (existing) return { ...existing }
    }
    // Create a new empty dossier
    if (merchantId && merchantName) {
      return createEmptyDossier(merchantId, merchantName)
    }
    return null
  })
  const [isNew, setIsNew] = useState(() => {
    if (currentDraftId) {
      return !dossiers.find((d) => d.id === currentDraftId)
    }
    return true
  })

  // Reactive init for draft resume (dossiers array may load after first render)
  const initDone = useRef(!!(merchantId && merchantName) || !!currentDraftId)
  useEffect(() => {
    if (dossier) return
    if (currentDraftId) {
      const existing = dossiers.find((d) => d.id === currentDraftId)
      if (existing) {
        setDossier({ ...existing })
        setIsNew(false)
        return
      }
    }
    if (merchantId && merchantName) {
      setDossier(createEmptyDossier(merchantId, merchantName))
    }
  }, [currentDraftId, dossiers, merchantId, merchantName, dossier])

  // ---- Étape 1 : scan CNI recto/verso + OCR ----
  const cniRectoInputRef = useRef<HTMLInputElement>(null)
  const cniVersoInputRef = useRef<HTMLInputElement>(null)
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'analyzing' | 'success' | 'failure'>('idle')

  // Best-effort on-device photo quality check (blur + face presence) for
  // the actor photo. Never blocks the flow — see photo-quality.ts.
  const [photoWarnings, setPhotoWarnings] = useState<string[]>([])
  const [checkingPhoto, setCheckingPhoto] = useState(false)
  const runPhotoQualityCheck = useCallback((dataUrl: string) => {
    setCheckingPhoto(true)
    setPhotoWarnings([])
    checkEnrollmentPhoto(dataUrl)
      .then((result) => setPhotoWarnings(result.warnings))
      .catch(() => setPhotoWarnings([]))
      .finally(() => setCheckingPhoto(false))
  }, [])

  const photoInputRef = useRef<HTMLInputElement>(null)
  const etalInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Text size helper
  const txt = soleilMode ? 'text-base' : 'text-sm'
  const txtLabel = soleilMode ? 'text-base font-medium' : 'text-sm font-medium'

  // Auto-save every 30 seconds
  const autoSave = useCallback(() => {
    if (!dossier) return
    setSaveStatus('saving')
    const now = Date.now()
    try {
      if (isNew) {
        addDossier({ ...dossier, updatedAt: now, status: 'brouillon' })
        setIsNew(false)
        setCurrentDraftId(dossier.id)
      } else updateDossier(dossier.id, { ...dossier, updatedAt: now, status: 'brouillon' })
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [dossier, isNew, addDossier, updateDossier, setCurrentDraftId])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (dossier && (dossier.cniRecto || dossier.photoBase64 || dossier.firstName || dossier.lastName || dossier.phone)) autoSave()
    }, 800)
    const interval = setInterval(() => {
      if (dossier) autoSave()
    }, 30000)
    return () => { clearTimeout(timer); clearInterval(interval) }
  }, [dossier, autoSave])

  const saveToStore = useCallback(
    (status: Dossier['status']) => {
      if (!dossier) return
      const now = Date.now()
      const updates: Partial<Dossier> = {
        ...dossier,
        updatedAt: now,
        status,
      }
      if (status === 'en_attente') updates.submittedAt = now
      if (isNew) {
        addDossier(updates as Dossier)
        setIsNew(false)
        setCurrentDraftId(dossier.id)
      } else {
        updateDossier(dossier.id, updates)
      }
      setSaveStatus('saved')
    },
    [dossier, isNew, addDossier, updateDossier, setCurrentDraftId]
  )

  const updateField = <K extends keyof Dossier>(key: K, value: Dossier[K]) => {
    setDossier((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  // Photo handling
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      updateField('photoBase64', dataUrl)
      runPhotoQualityCheck(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleEtalPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => updateField('photoEtal', reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // On the native shell, use the Camera plugin (native camera/gallery picker
  // with proper OS permission prompts) instead of the <input type=file>
  // fallback, which is what's used in a regular browser tab.
  const captureViaCameraPlugin = async (
    field: 'photoBase64' | 'photoEtal' | 'cniRecto' | 'cniVerso',
    header: string
  ) => {
    try {
      const photo = await CapacitorCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 80,
        allowEditing: false,
        promptLabelHeader: header,
        promptLabelPhoto: 'Choisir depuis la galerie',
        promptLabelPicture: 'Prendre une photo',
      })
      if (photo.dataUrl) {
        updateField(field, photo.dataUrl)
        if (field === 'photoBase64') runPhotoQualityCheck(photo.dataUrl)
        if (field === 'cniRecto' || field === 'cniVerso') {
          setOcrStatus('idle')
          runCniOcrIfComplete(field === 'cniRecto' ? photo.dataUrl : dossier?.cniRecto, field === 'cniVerso' ? photo.dataUrl : dossier?.cniVerso)
        }
      }
    } catch {
      // User cancelled the native picker — nothing to do.
    }
  }

  const captureActorPhoto = () => {
    if (Capacitor.isNativePlatform()) {
      captureViaCameraPlugin('photoBase64', "Photo de l'acteur")
      return
    }
    photoInputRef.current?.click()
  }

  const captureEtalPhoto = () => {
    if (Capacitor.isNativePlatform()) {
      captureViaCameraPlugin('photoEtal', "Photo de l'étal")
      return
    }
    etalInputRef.current?.click()
  }

  // ---- CNI : capture recto/verso (native ou web) puis OCR ----
  const handleCniFile = (side: 'cniRecto' | 'cniVerso') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      updateField(side, dataUrl)
      setOcrStatus('idle')
      runCniOcrIfComplete(
        side === 'cniRecto' ? dataUrl : dossier?.cniRecto,
        side === 'cniVerso' ? dataUrl : dossier?.cniVerso
      )
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const captureCniSide = (side: 'cniRecto' | 'cniVerso') => {
    if (Capacitor.isNativePlatform()) {
      captureViaCameraPlugin(side, side === 'cniRecto' ? 'CNI — Recto' : 'CNI — Verso')
      return
    }
    ;(side === 'cniRecto' ? cniRectoInputRef : cniVersoInputRef).current?.click()
  }

  const removeCniSide = (side: 'cniRecto' | 'cniVerso') => {
    updateField(side, undefined)
    setOcrStatus('idle')
  }

  /** Lance l'analyse dès que recto ET verso sont disponibles. */
  const runCniOcrIfComplete = (recto?: string, verso?: string) => {
    if (recto && verso) runCniOcr(recto, verso)
  }

  // OCR sur l'appareil (Tesseract.js, worker WASM) : lit recto + verso,
  // fusionne les textes puis en extrait nom, prénom, sexe, N°CNI et NNI.
  // Pré-remplissage doux — seuls les champs vides sont renseignés, une
  // valeur saisie par l'agent n'est jamais écrasée. Best-effort : un échec
  // n'est jamais bloquant, la saisie manuelle reste possible.
  const runCniOcr = useCallback(
    async (recto?: string, verso?: string) => {
      const rectoImg = recto ?? dossier?.cniRecto
      const versoImg = verso ?? dossier?.cniVerso
      if (!rectoImg && !versoImg) return
      setOcrStatus('analyzing')
      try {
        const [rectoRes, versoRes] = await Promise.all([
          rectoImg ? extractDocumentText(rectoImg) : Promise.resolve(null),
          versoImg ? extractDocumentText(versoImg) : Promise.resolve(null),
        ])
        const text = [rectoRes?.text, versoRes?.text].filter(Boolean).join('\n')
        const fields = parseCniFields(text)
        const found = Object.values(fields).some(Boolean)
        if (!found) {
          setOcrStatus('failure')
          return
        }
        setDossier((prev) =>
          prev
            ? {
                ...prev,
                lastName: prev.lastName.trim() || fields.lastName || prev.lastName,
                firstName: prev.firstName.trim() || fields.firstName || prev.firstName,
                sexe: prev.sexe ?? fields.sexe ?? prev.sexe,
                cniNumero: prev.cniNumero || fields.cniNumero,
                nni: prev.nni || fields.nni,
              }
            : prev
        )
        setOcrStatus('success')
        toast({ title: 'CNI lue avec succès', description: 'Vérifiez les informations extraites et corrigez si besoin.' })
      } catch {
        setOcrStatus('failure')
      }
    },
    [dossier?.cniRecto, dossier?.cniVerso, toast]
  )

  // Document handling
  const runDocumentOcr = useCallback((dataUrl: string) => {
    extractDocumentText(dataUrl)
      .then((result) => {
        if (!result) return
        setDossier((prev) => {
          if (!prev) return prev
          const docs = (prev.documents || []).map((d) =>
            d.base64 === dataUrl ? { ...d, ocrText: result.text } : d
          )
          return { ...prev, documents: docs }
        })
      })
      .catch(() => {})
  }, [])

  const handleDocumentAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !dossier) return
    Array.from(files).forEach((file) => {
      if ((dossier.documents || []).length >= 10) return
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        const docEntry = { name: file.name, base64: dataUrl, type: file.type }
        setDossier((prev) => {
          if (!prev) return prev
          const docs = [...(prev.documents || []), docEntry].slice(0, 10)
          return { ...prev, documents: docs }
        })
        // Best-effort text extraction, on-device — never blocks attaching
        // the document itself. Only images (not PDFs) are recognizable.
        if (file.type.startsWith('image/')) runDocumentOcr(dataUrl)
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeDocument = (index: number) => {
    if (!dossier) return
    const docs = [...(dossier.documents || [])]
    docs.splice(index, 1)
    updateField('documents', docs)
  }

  // GPS capture — the Geolocation plugin (native permission prompt) on the
  // native shell, the browser's own API in a regular web tab.
  const captureGPS = async () => {
    if (Capacitor.isNativePlatform()) {
      setGpsLoading(true)
      try {
        const position = await CapacitorGeolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
        })
        updateField('gps', {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        })
        updateField('gpsStatus', 'captured')
        toast({ title: 'Position capturée', description: `Précision: ${Math.round(position.coords.accuracy)}m` })
      } catch {
        updateField('gpsStatus', 'refused')
        updateField('gpsUnavailableReason', 'Permission de localisation refusée')
        toast({ title: 'Erreur', description: 'Permission de localisation refusée ou position indisponible' })
      } finally {
        setGpsLoading(false)
      }
      return
    }

    if (!navigator.geolocation) {
      toast({ title: 'Erreur', description: 'Géolocalisation non disponible sur cet appareil' })
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateField('gps', {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        })
        updateField('gpsStatus', 'captured')
        setGpsLoading(false)
        toast({ title: 'Position capturée', description: `Précision: ${Math.round(position.coords.accuracy)}m` })
      },
      (error) => {
        setGpsLoading(false)
        let msg = 'Erreur lors de la capture de la position'
        if (error.code === 1) msg = 'Permission de localisation refusée'
        if (error.code === 2) msg = 'Position non disponible'
        if (error.code === 3) msg = 'Délai de localisation expiré'
        updateField('gpsStatus', error.code === 1 ? 'refused' : 'unavailable')
        updateField('gpsUnavailableReason', msg)
        toast({ title: 'Erreur', description: msg })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  // Multi-select toggle
  const toggleProduit = (produit: string, field: 'produitsPrincipaux' | 'principalesCultures' | 'domainesActivite') => {
    if (!dossier) return
    const current = (dossier[field] as string[]) || []
    if (current.includes(produit)) {
      updateField(field, current.filter((p) => p !== produit))
    } else {
      if (current.length >= 5) {
        toast({ title: 'Limite atteinte', description: 'Vous pouvez choisir au maximum 5 éléments' })
        return
      }
      updateField(field, [...current, produit])
    }
  }

  // Step validation
  const validateStep1 = (): string | null => {
    if (!dossier) return 'Dossier non disponible'
    return null
  }

  const validateStep2 = (): string | null => {
    if (!dossier) return 'Dossier non disponible'
    if (!dossier.actorType) return 'Type d\'acteur obligatoire'
    if (!dossier.firstName.trim()) return 'Prénom obligatoire'
    if (!dossier.lastName.trim()) return 'Nom obligatoire'
    if (!dossier.phone.trim()) return 'Téléphone obligatoire'
    if (!dossier.activite) return 'Activité obligatoire'
    if (!dossier.zone) return 'Zone / Marché obligatoire'
    // La classification détaillant / semi-grossiste / grossiste est le
    // socle du profil marchand : sans elle, ni prix de gros ni recommandations
    // fournisseurs cohérentes côté app.
    if (dossier.actorType === 'marchand' && !dossier.categorieMarchand) {
      return 'Catégorie du marchand obligatoire'
    }
    return null
  }

  const validateStep4 = (): string | null => {
    return null
  }

  // Animation direction for step transitions
  const [animDirection, setAnimDirection] = useState<'forward' | 'back'>('forward')
  const [animKey, setAnimKey] = useState(0)

  const goNext = () => {
    if (currentStep === 1) {
      const err = validateStep1()
      if (err) { toast({ title: 'Champ obligatoire manquant', description: err }); return }
    }
    if (currentStep === 2) {
      const err = validateStep2()
      if (err) { toast({ title: 'Champ obligatoire manquant', description: err }); return }
    }
    if (currentStep === 4) {
      const err = validateStep4()
      if (err) { toast({ title: 'Champ obligatoire manquant', description: err }); return }
    }
    if (currentStep < TOTAL_STEPS) {
      setAnimDirection('forward')
      setAnimKey((k) => k + 1)
      setCurrentStep(currentStep + 1)
    }
  }

  const goPrev = () => {
    if (currentStep > 1) {
      setAnimDirection('back')
      setAnimKey((k) => k + 1)
      setCurrentStep(currentStep - 1)
    }
  }

  // Save draft
  const handleSaveDraft = () => {
    saveToStore('brouillon')
    toast({ title: 'Brouillon enregistré', description: 'Dossier sauvegardé en brouillon' })
    navigate('ident-brouillons')
  }

  // Submit requires a photo, complete identity and one actor authentication
  // method so the account can be provisioned safely in Supabase.
  const handleSubmit = async () => {
    if (!dossier) return
    if (!dossier.photoBase64) { toast({ title: 'Photo à ajouter', description: 'Ajoutez une photo avant d’envoyer le dossier.' }); setCurrentStep(2); return }
    const identityError = validateStep2()
    if (identityError) { toast({ title: 'Dossier incomplet', description: identityError }); setCurrentStep(2); return }
    if (!dossier.pinHash && !dossier.patternHash && !dossier.visualCodeHash) {
      toast({ title: 'Authentification obligatoire', description: 'Ajoutez un code PIN, un schéma ou un code visuel pour l’acteur.' })
      setCurrentStep(5)
      return
    }
    if (!dossier.gps) updateField('gpsStatus', dossier.gpsStatus || 'unavailable')

    // createEmptyDossier() starts with dossierNumber: ''. The store's addDossier
    // generates the real ID on first save, but the local state never receives it.
    // Persist first so the dossier gets a dossierNumber, then re-read from store.
    if (!dossier.dossierNumber) {
      saveToStore('brouillon')
      const saved = useIdentificateurStore.getState().dossiers.find((d) => d.id === dossier.id)
      if (saved?.dossierNumber) {
        setDossier({ ...saved })
        if (isNew) setIsNew(false)
      }
    }

    const fresh = useIdentificateurStore.getState().dossiers.find((d) => d.id === dossier.id)
    const toSubmit = fresh?.dossierNumber ? { ...dossier, dossierNumber: fresh.dossierNumber } : dossier

    if (!toSubmit.dossierNumber) {
      toast({ title: 'Erreur', description: 'Numéro de dossier manquant. Enregistrez puis réessayez.' })
      return
    }

    setSubmitting(true)

    const result = await submitDossierToServer(toSubmit)
    setSubmitting(false)

    if (result.status === 'lost') {
      // Neither the live request nor the offline queue worked — the
      // dossier was not recorded anywhere. Don't mark it as submitted, so
      // the agent sees it's still a draft and can retry from there.
      saveToStore('brouillon')
      toast({
        title: 'Dossier non envoyé',
        description: result.reason || 'Réessayez depuis les brouillons dès que possible.',
      })
      return
    }

    saveToStore('en_attente')
    toast({
      title: 'Dossier soumis',
      description: result.status === 'synced' ? 'Dossier envoyé pour validation' : 'Dossier enregistré, en attente de synchronisation',
    })
    navigate('ident-suivi')
  }

  // Auth: PIN
  const handlePinSubmit = () => {
    if (pinValue.length < 4) {
      toast({ title: 'Code trop court', description: 'Saisissez au moins 4 chiffres' })
      return
    }
    if (pinValue !== pinConfirm) {
      toast({ title: 'Codes non conformes', description: 'Les deux codes ne sont pas identiques' })
      return
    }
    // MODE-936 (S-03) : le BRUT est gardé dans le dossier pour la soumission
    // (hachage scrypt SERVEUR) ; le hash djb2 reste pour compat brouillons.
    updateField('pin', pinValue)
    updateField('pinHash', simpleHash(pinValue))
    setPinDone(true)
    toast({ title: 'Code PIN enregistré' })
  }

  // Auth: Pattern
  const handlePatternComplete = (pattern: number[]) => {
    updateField('pattern', pattern.join('-'))
    updateField('patternHash', patternToHash(pattern))
    setPatternDone(true)
    setPatternError(false)
    toast({ title: 'Schéma enregistré' })
  }

  // Auth: Visual
  const handleVisualComplete = (sequence: string[]) => {
    updateField('visualCode', sequence.join('>'))
    updateField('visualCodeHash', visualCodeToHash(sequence))
    setVisualDone(true)
    setVisualError(false)
    toast({ title: 'Code visuel enregistré' })
  }

  if (!dossier) {
    return (
      <div className={cn('flex items-center justify-center min-h-dvh', identDarkMode ? 'bg-stone-950' : 'bg-[#FAFAF7]')}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin" style={{ color: IDENT_COLOR }} />
          <span className="text-sm text-muted-foreground">Chargement du dossier...</span>
        </div>
      </div>
    )
  }

  const actorTypeLabels: Record<ActorType, string> = {
    marchand: 'Marchand', producteur: 'Producteur', cooperative: 'Coopérative',
  }
  const sexeLabels: Record<string, string> = { masculin: 'Masculin', feminin: 'Féminin', autre: 'Autre' }
  const typeCommerceLabels: Record<string, string> = { marche: 'Marché', boutique: 'Boutique', ambulant: 'Ambulant' }
  const typeProductionLabels: Record<string, string> = { culture: 'Culture', elevage: 'Élevage', mixte: 'Mixte' }
  const modeExploitationLabels: Record<string, string> = { familial: 'Familial', cooperatif: 'Coopératif', individuel: 'Individuel' }

  return (
    <div className={cn('flex flex-col min-h-dvh bg-[#FAFAF7]', identDarkMode && 'bg-stone-950')}>
      {/* Top Bar */}
      <header className={`sticky top-0 z-30 border-b ${identDarkMode ? 'bg-stone-900 border-stone-700' : 'bg-[#FAFAF7] border-[#E7E0D8]'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={currentStep === 1 ? goBack : goPrev}
            className={`p-2 rounded-full transition-colors ${identDarkMode ? 'hover:bg-stone-800' : 'hover:bg-[#F5F0EB]'}`}
            aria-label={currentStep === 1 ? 'Retour' : 'Étape précédente'}
          >
            <ArrowLeft className="size-5" style={{ color: IDENT_COLOR, opacity: 0.7 }} />
          </button>
          <div className="flex min-w-0 flex-col items-center">
            <h1 className={`${soleilMode ? 'text-lg' : 'text-base'} font-bold tracking-tight`} style={{ color: IDENT_COLOR }}>NOUVEAU DOSSIER</h1>
            <span aria-live="polite" className={`text-[10px] ${saveStatus === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
              {saveStatus === 'saving' ? 'Enregistrement...' : saveStatus === 'saved' ? 'Brouillon enregistré' : saveStatus === 'error' ? 'Enregistrement impossible' : ' '}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSaveDraft} className="gap-1 min-h-9" style={{ color: IDENT_COLOR }}>
            <Save className="size-4" /> Enregistrer
          </Button>
        </div>

        {/* Step indicator — cercles numérotés 1→5 reliés par des connecteurs
            qui se remplissent au fil de la progression. */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1">
            {STEPS_META.map((step, i) => {
              const stepNum = i + 1
              const isActive = currentStep === stepNum
              const isDone = currentStep > stepNum
              return (
                <React.Fragment key={stepNum}>
                  {i > 0 && (
                    <div
                      className={`h-0.5 flex-1 rounded-full transition-[background-color] duration-500 ${
                        stepNum <= currentStep ? 'bg-[#9F8170]' : identDarkMode ? 'bg-stone-800' : 'bg-[#E7E0D8]'
                      }`}
                    />
                  )}
                  <button
                    onClick={() => stepNum < currentStep && setCurrentStep(stepNum)}
                    disabled={stepNum > currentStep}
                    aria-label={`Étape ${stepNum} : ${step.label}${isDone ? ' (terminée)' : ''}`}
                    className={`flex shrink-0 items-center justify-center transition-all duration-300 ${
                      stepNum <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed'
                    }`}
                  >
                    <div
                      className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                        isActive
                          ? 'scale-110 text-white shadow-md ring-4 ring-[#9F817025]'
                          : isDone
                          ? 'text-white'
                          : identDarkMode ? 'bg-stone-800 text-stone-400' : 'bg-[#F5F0EB] text-[#78716C]'
                      }`}
                      style={isActive || isDone ? { backgroundColor: IDENT_COLOR } : undefined}
                    >
                      {isDone ? <Check className="size-4" /> : stepNum}
                    </div>
                  </button>
                </React.Fragment>
              )
            })}
          </div>
          {/* Légende de l'étape courante — toujours lisible, même sur petit écran */}
          <p aria-live="polite" className="mt-1.5 text-center text-[11px] font-medium text-muted-foreground">
            <span style={{ color: IDENT_COLOR }} className="font-bold">
              Étape {currentStep} sur {TOTAL_STEPS}
            </span>{' '}
            · {STEPS_META[currentStep - 1].label}
          </p>
        </div>
      </header>

      {/* Step Content */}
      <main className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div
            key={animKey}
            className={cn(
              'animate-[stepIn_300ms_ease-out]',
            )}
          >
          {/* ======================== ÉTAPE 1 : CNI (recto/verso + OCR) ======================== */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <StepHero
                step={1}
                icon={<CreditCard className="size-5" />}
                title="Pièce d'identité (CNI)"
                description="Scannez le recto puis le verso de la CNI : Jùlaba lit le nom, le prénom, le sexe, le N°CNI et le NNI, puis pré-remplit le dossier. Tout reste modifiable."
              />

              {/* ---- Scan recto & verso ---- */}
              <section>
                <SectionTitle icon={<CreditCard className="size-4" />} title="SCAN CNI — RECTO & VERSO" />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <CniSlot
                    label="Recto"
                    image={dossier.cniRecto}
                    onCapture={() => captureCniSide('cniRecto')}
                    onRemove={() => removeCniSide('cniRecto')}
                  />
                  <CniSlot
                    label="Verso"
                    image={dossier.cniVerso}
                    onCapture={() => captureCniSide('cniVerso')}
                    onRemove={() => removeCniSide('cniVerso')}
                  />
                </div>
                <input ref={cniRectoInputRef} type="file" accept="image/*" capture="environment" onChange={handleCniFile('cniRecto')} className="hidden" />
                <input ref={cniVersoInputRef} type="file" accept="image/*" capture="environment" onChange={handleCniFile('cniVerso')} className="hidden" />
                {dossier.cniRecto && !dossier.cniVerso && (
                  <p className={`${txt} mt-2 text-xs text-muted-foreground`}>Recto enregistré — ajoutez le verso pour lancer l'analyse automatique.</p>
                )}
                {!dossier.cniRecto && dossier.cniVerso && (
                  <p className={`${txt} mt-2 text-xs text-muted-foreground`}>Verso enregistré — ajoutez le recto pour lancer l'analyse automatique.</p>
                )}
              </section>

              {/* ---- Statut de l'analyse OCR ---- */}
              {ocrStatus === 'analyzing' && (
                <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-[#F5F0EB]'}`} role="status">
                  <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: IDENT_COLOR }} />
                  <p className={`${txt} text-muted-foreground`}>Lecture de la carte en cours...</p>
                </div>
              )}
              {ocrStatus === 'success' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5" role="status">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-green-600" />
                  <p className={`${txt} text-green-800`}>Informations lues automatiquement — vérifiez-les et corrigez si besoin avant de continuer.</p>
                </div>
              )}
              {ocrStatus === 'failure' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5" role="status">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className={`${txt} text-amber-800`}>Lecture impossible sur cette photo. Complétez les informations manuellement ci-dessous, ou reprenez les photos.</p>
                    <button type="button" onClick={() => runCniOcr()} className="mt-1 text-xs font-semibold underline" style={{ color: IDENT_COLOR }}>
                      Analyser à nouveau
                    </button>
                  </div>
                </div>
              )}

              <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${identDarkMode ? 'bg-stone-900' : 'bg-[#F5F0EB]'}`}>
                <ScanLine className="mt-0.5 size-4 shrink-0" style={{ color: IDENT_COLOR }} />
                <p className={`${txt} text-muted-foreground`}>
                  Les informations de la CNI seront préremplies à l&apos;étape suivante. Vous pourrez tout vérifier et corriger au même endroit.
                </p>
              </div>

              {/* ---- Confidentialité + passer ---- */}
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${identDarkMode ? 'bg-stone-900' : 'bg-[#F5F0EB]'}`}>
                <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: IDENT_COLOR }} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  L'analyse se fait entièrement sur votre téléphone — les photos de la CNI ne quittent jamais l'appareil et restent attachées au dossier.
                </p>
              </div>
              <button type="button" onClick={goNext} className="w-full py-1 text-center text-xs font-medium underline text-muted-foreground transition-colors hover:text-foreground">
                Continuer sans scanner la CNI
              </button>
            </div>
          )}

          {/* ======================== ÉTAPE 2 : Photo & Identité ======================== */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <StepHero
                step={2}
                icon={<UserRound className="size-5" />}
                title="Photo & identité de l'acteur"
                description="Prenez la photo de l'acteur, choisissez son type d'activité, puis vérifiez les informations pré-remplies depuis la CNI."
              />
              {/* Photo */}
              <section>
                <SectionTitle icon={<Camera className="size-4" />} title="PHOTO ACTEUR" required />
                <div className="mt-3">
                  {dossier.photoBase64 ? (
                    <div className="relative">
                      <img
                        src={dossier.photoBase64}
                        alt="Photo acteur"
                        className="h-56 w-full rounded-xl border-2 object-cover"
                        style={{ borderColor: IDENT_COLOR }}
                      />
                      <button
                        onClick={captureActorPhoto}
                        className="absolute bottom-3 right-3 rounded-full border bg-white p-2.5 shadow-md transition-colors hover:bg-[#F5F0EB]"
                        style={{ borderColor: IDENT_COLOR }}
                        aria-label="Reprendre photo"
                      >
                        <RotateCcw className="size-3.5" style={{ color: IDENT_COLOR }} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={captureActorPhoto}
                      className="flex h-56 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors hover:bg-[#F5F0EB]"
                      style={{ borderColor: IDENT_COLOR }}
                    >
                      <Camera className="mb-2 size-12" style={{ color: IDENT_COLOR, opacity: 0.6 }} />
                      <span className={`${txt} text-muted-foreground`}>Prendre photo</span>
                    </button>
                  )}
                  <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                  {dossier.photoBase64 && checkingPhoto && (
                    <p className={`${txt} text-muted-foreground mt-2 flex items-center gap-1.5`}>
                      <Loader2 className="size-3.5 animate-spin" />
                      Vérification de la photo...
                    </p>
                  )}
                  {dossier.photoBase64 && !checkingPhoto && photoWarnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {photoWarnings.map((w) => (
                        <p key={w} className={`${txt} text-amber-700 flex items-start gap-1.5`}>
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
                          <span>{w}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {!dossier.photoBase64 && (
                    <p className={`${txt} mt-2 max-w-xs text-muted-foreground`}>La photo peut être ajoutée plus tard. Elle sera nécessaire pour envoyer le dossier.</p>
                  )}
                </div>
              </section>

              {/* Type acteur */}
              {/* Type acteur */}
              <section>
                <SectionTitle icon={<UserRound className="size-4" />} title="TYPE ACTEUR" required />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                       { type: 'marchand' as ActorType, icon: Store, label: 'Marchand' },
                       { type: 'producteur' as ActorType, icon: Sprout, label: 'Producteur' },
                       { type: 'cooperative' as ActorType, icon: Handshake, label: 'Coopérative' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => updateField('actorType', item.type)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        dossier.actorType === item.type ? 'border-current shadow-sm' : identDarkMode ? 'border-stone-700 hover:border-stone-600' : 'border-[#E7E0D8] hover:border-[#D9CFC4]'
                      }`}
                      style={dossier.actorType === item.type ? { borderColor: IDENT_COLOR, backgroundColor: `${IDENT_COLOR}10` } : undefined}
                    >
                       <item.icon className="size-6" aria-hidden="true" />
                      <span className={`${txt} font-medium`} style={{ color: dossier.actorType === item.type ? IDENT_COLOR : undefined }}>
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Classification marchand : détaillant / semi-grossiste /
                  grossiste. N'apparaît que pour les marchands — c'est la
                  réponse à « où se situe-t-il dans la chaîne de
                  distribution ? », qui pilera tarifs, volumes et
                  recommandations fournisseurs. */}
              {dossier.actorType === 'marchand' && (
                <section>
                  <SectionTitle icon={<Store className="size-4" />} title="CATÉGORIE MARCHAND" required />
                  <p className={`${txt} text-muted-foreground mt-1`}>
                    Où se situe ce commerce dans la chaîne de distribution ?
                  </p>
                  <div className="mt-3 space-y-2">
                    {MARCHAND_CATEGORIES_BY_POSITION.map((catId) => {
                      const meta = MARCHAND_CATEGORIES_META[catId as MarchandCategorie]
                      const selected = dossier.categorieMarchand === catId
                      return (
                        <button
                          key={catId}
                          type="button"
                          onClick={() => updateField('categorieMarchand', catId)}
                          className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                            selected ? 'border-current shadow-sm' : identDarkMode ? 'border-stone-700 hover:border-stone-600' : 'border-[#E7E0D8] hover:border-[#D9CFC4]'
                          }`}
                          style={selected ? { borderColor: IDENT_COLOR, backgroundColor: `${IDENT_COLOR}10` } : undefined}
                          aria-pressed={selected}
                        >
                          <span
                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                              selected ? 'border-transparent' : identDarkMode ? 'border-stone-600' : 'border-[#D9CFC4]'
                            }`}
                            style={selected ? { backgroundColor: IDENT_COLOR } : undefined}
                            aria-hidden="true"
                          >
                            {selected && <Check className="size-3 text-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className={`${txt} block font-semibold`} style={{ color: selected ? IDENT_COLOR : undefined }}>
                              {meta.label}
                            </span>
                            <span className={`${txt} block text-muted-foreground`}>{meta.description}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Informations obligatoires — pré-remplies depuis la CNI
                  quand elle a été scannée à l'étape 1. */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="IDENTITÉ ET COORDONNÉES" required />
                {(dossier.cniRecto || dossier.cniVerso) && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-700">
                    <Sparkles className="size-3.5 shrink-0" aria-hidden />
                    Pré-rempli depuis la CNI scannée — vérifiez chaque champ.
                  </p>
                )}
                <div className="mt-3 space-y-4">
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Prénom <span className="text-red-500">*</span></Label>
                    <Input className={txt} placeholder="Prénom de l'acteur" value={dossier.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Nom <span className="text-red-500">*</span></Label>
                    <Input className={txt} placeholder="Nom de l'acteur" value={dossier.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Sexe</Label>
                    <div className="flex gap-4">
                      {(['masculin', 'feminin', 'autre'] as const).map((s) => (
                        <label key={s} className={`flex items-center gap-2 cursor-pointer ${txt}`}>
                          <input type="radio" name="sexe" value={s} checked={dossier.sexe === s} onChange={() => updateField('sexe', s)} className="accent-[#9F8170]" />
                          {sexeLabels[s]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>N° CNI</Label>
                      <Input className={`${txt} font-mono`} placeholder="CI0000000000" value={dossier.cniNumero || ''} onChange={(e) => updateField('cniNumero', e.target.value.toUpperCase())} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>NNI</Label>
                      <Input className={`${txt} font-mono`} placeholder="0000000000" inputMode="numeric" value={dossier.nni || ''} onChange={(e) => updateField('nni', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Téléphone <span className="text-red-500">*</span></Label>
                    <div className="flex items-center">
                      <span className={`${txt} px-3 py-2 rounded-l-md border border-r-0 ${identDarkMode ? 'bg-stone-800 text-stone-400' : 'bg-[#F5F0EB] text-[#78716C]'}`}>+225</span>
                      <Input className={`${txt} rounded-l-none`} type="tel" placeholder="0X XX XX XX XX" value={dossier.phone} onChange={(e) => updateField('phone', e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Activité <span className="text-red-500">*</span></Label>
                    {/* Liste scindée par profil : un détaillant ne devrait pas
                        avoir à choisir « Culture de cacao ». */}
                    <Select value={dossier.activite} onValueChange={(val) => updateField('activite', val)}>
                      <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir une activité" /></SelectTrigger>
                      <SelectContent>{activitesPour(dossier.actorType).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Zone / Marché <span className="text-red-500">*</span></Label>
                    <Select value={dossier.zone} onValueChange={(val) => updateField('zone', val)}>
                      <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir une zone ou un marché" /></SelectTrigger>
                      <SelectContent>{ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ======================== ÉTAPE 3 : Détails ======================== */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <StepHero
                step={3}
                icon={<FileText className="size-5" />}
                title="Détails de l'activité"
                description="Informations complémentaires, puis champs spécifiques au type d'acteur choisi."
              />
              {/* Complementary info */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="INFORMATIONS COMPLÉMENTAIRES" />
                <div className="mt-3 space-y-4">
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Date de naissance</Label>
                    <Input className={txt} type="date" value={dossier.dateNaissance || ''} onChange={(e) => updateField('dateNaissance', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Adresse complète</Label>
                    <Textarea className={txt} placeholder="Adresse complète de l'acteur" rows={2} value={dossier.adresse || ''} onChange={(e) => updateField('adresse', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Nombre d'employés</Label>
                    <Input className={txt} type="number" min={0} placeholder="0" value={dossier.nbEmployes ?? ''} onChange={(e) => updateField('nbEmployes', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Chiffre d'affaires estimé</Label>
                    <div className="relative">
                      <Input className={`${txt} pr-24`} type="number" min={0} placeholder="0" value={dossier.chiffreAffaires ?? ''} onChange={(e) => updateField('chiffreAffaires', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">FCFA / mois</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Dynamic fields by actor type */}
              {dossier.actorType === 'marchand' && (
                <section>
                  <SectionTitle icon={<Store className="size-4" />} title="INFORMATIONS MARCHAND" />
                  <div className="mt-3 space-y-4">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Nom du commerce</Label>
                      <Input className={txt} placeholder="Nom du commerce" value={dossier.nomCommerce || ''} onChange={(e) => updateField('nomCommerce', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Type de commerce</Label>
                      <Select value={dossier.typeCommerce || ''} onValueChange={(val) => updateField('typeCommerce', val as Dossier['typeCommerce'])}>
                        <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir un type de commerce" /></SelectTrigger>
                        <SelectContent>{Object.entries(typeCommerceLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <MultiSelectField
                      label="Produits principaux" max={5}
                      items={PRODUITS}
                      selected={dossier.produitsPrincipaux || []}
                      onToggle={(p) => toggleProduit(p, 'produitsPrincipaux')}
                      txtClass={txt}
                    />
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Heures d'ouverture</Label>
                      <Input className={txt} placeholder="eg. 7h - 18h" value={dossier.horaires || ''} onChange={(e) => updateField('horaires', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Stand / Emplacement</Label>
                      <Input className={txt} placeholder="Numéro ou description du stand" value={dossier.standEmplacement || ''} onChange={(e) => updateField('standEmplacement', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Photo de l'étal</Label>
                      {dossier.photoEtal ? (
                        <div className="relative inline-block">
                          <img src={dossier.photoEtal} alt="Photo de l'étal" className="w-28 h-28 rounded-lg object-cover border" style={{ borderColor: IDENT_COLOR }} />
                          <button onClick={() => updateField('photoEtal', undefined)} className="absolute -top-1 -right-1 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors" aria-label="Retirer la photo de l'étal">
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={captureEtalPhoto} className="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed hover:bg-[#F5F0EB] transition-colors" style={{ borderColor: IDENT_COLOR }}>
                          <Upload className="size-4" style={{ color: IDENT_COLOR }} />
                          <span className={txt} style={{ color: IDENT_COLOR }}>Ajouter une photo de l'étal</span>
                        </button>
                      )}
                      <input ref={etalInputRef} type="file" accept="image/*" onChange={handleEtalPhoto} className="hidden" />
                    </div>
                  </div>
                </section>
              )}

              {dossier.actorType === 'producteur' && (
                <section>
                  <SectionTitle icon={<Sprout className="size-4" />} title="INFORMATIONS PRODUCTEUR" />
                  <div className="mt-3 space-y-4">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Type de production</Label>
                      <Select value={dossier.typeProduction || ''} onValueChange={(val) => updateField('typeProduction', val as Dossier['typeProduction'])}>
                        <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir un type de production" /></SelectTrigger>
                        <SelectContent>{Object.entries(typeProductionLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Superficie</Label>
                      <div className="relative">
                        <Input className={`${txt} pr-20`} type="number" min={0} step={0.1} placeholder="0" value={dossier.superficie ?? ''} onChange={(e) => updateField('superficie', e.target.value ? parseFloat(e.target.value) : undefined)} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ha</span>
                      </div>
                    </div>
                    <MultiSelectField
                      label="Cultures principales" max={5}
                      items={PRODUITS}
                      selected={dossier.principalesCultures || []}
                      onToggle={(p) => toggleProduit(p, 'principalesCultures')}
                      txtClass={txt}
                    />
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Nombre de cycles / an</Label>
                      <Input className={txt} type="number" min={0} placeholder="0" value={dossier.nbCyclesAn ?? ''} onChange={(e) => updateField('nbCyclesAn', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Mode d'exploitation</Label>
                      <Select value={dossier.modeExploitation || ''} onValueChange={(val) => updateField('modeExploitation', val as Dossier['modeExploitation'])}>
                        <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir un mode d'exploitation" /></SelectTrigger>
                        <SelectContent>{Object.entries(modeExploitationLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className={txtLabel}>Accès irrigation</Label>
                      <Switch checked={dossier.accesIrrigation || false} onCheckedChange={(val) => updateField('accesIrrigation', val)} className="data-[state=checked]:bg-[#9F8170]" />
                    </div>
                  </div>
                </section>
              )}

              {dossier.actorType === 'cooperative' && (
                <section>
                  <SectionTitle icon={<Handshake className="size-4" />} title="INFORMATIONS COOPÉRATIVE" />
                  <div className="mt-3 space-y-4">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Nom de la coopérative</Label>
                      <Input className={txt} placeholder="Nom de la coopérative" value={dossier.nomCooperative || ''} onChange={(e) => updateField('nomCooperative', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Numéro d'enregistrement</Label>
                      <Input className={txt} placeholder="Numéro d'enregistrement" value={dossier.numeroEnregistrement || ''} onChange={(e) => updateField('numeroEnregistrement', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Nombre de membres</Label>
                      <Input className={txt} type="number" min={0} placeholder="0" value={dossier.nbMembres ?? ''} onChange={(e) => updateField('nbMembres', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Adresse du siège</Label>
                      <Input className={txt} placeholder="Adresse du siège de la coopérative" value={dossier.adresseSiege || ''} onChange={(e) => updateField('adresseSiege', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Président / Responsable</Label>
                      <Input className={txt} placeholder="Nom du président ou responsable" value={dossier.president || ''} onChange={(e) => updateField('president', e.target.value)} />
                    </div>
                    <MultiSelectField
                      label="Domaines d'activité" max={5}
                      items={PRODUITS}
                      selected={dossier.domainesActivite || []}
                      onToggle={(p) => toggleProduit(p, 'domainesActivite')}
                      txtClass={txt}
                    />
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ======================== ÉTAPE 4 : Localisation ======================== */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <StepHero
                step={4}
                icon={<MapPin className="size-5" />}
                title="Localisation & pièces jointes"
                description="Capturez la position GPS de l'acteur, ajoutez des notes et les documents utiles au dossier."
              />
              {/* GPS */}
              <section>
                <SectionTitle icon={<MapPin className="size-4" />} title="GÉOLOCALISATION" required />
                <div className="mt-3 space-y-3">
                  <Button type="button" variant="outline" className={`w-full gap-2 ${txt}`} style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }} onClick={captureGPS} disabled={gpsLoading}>
                    {gpsLoading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                    {gpsLoading ? 'Capture...' : 'Capturer ma position'}
                  </Button>
                  {dossier.gps && (
                    <Card className="p-3 space-y-1.5">
                      <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Latitude:</span><span className="font-mono">{dossier.gps.lat.toFixed(6)}</span></div>
                      <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Longitude:</span><span className="font-mono">{dossier.gps.lon.toFixed(6)}</span></div>
                      {dossier.gps.accuracy && <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Précision:</span><span className="font-mono">{Math.round(dossier.gps.accuracy)}m</span></div>}
                      <button className={`flex items-center gap-1 mt-2 ${txt} font-medium`} style={{ color: IDENT_COLOR }} type="button">
                        <Map className="size-4" /> Voir sur la carte
                      </button>
                    </Card>
                  )}
                  {!dossier.gps && dossier.gpsStatus && (
                    <p className={`${txt} text-amber-700`} role="status">Localisation à compléter : {dossier.gpsUnavailableReason || 'position indisponible'}.</p>
                  )}
                </div>
              </section>

              {/* Notes */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="NOTES" />
                <div className="mt-3">
                  <Textarea className={txt} placeholder="Commentaire libre..." rows={3} value={dossier.notes || ''} onChange={(e) => updateField('notes', e.target.value)} />
                </div>
              </section>

              {/* Documents */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="PIÈCES JOINTES" />
                <div className="mt-3 space-y-3">
                  <Button type="button" variant="outline" className={`w-full gap-2 ${txt}`} style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }} onClick={() => docInputRef.current?.click()}>
                    <Upload className="size-4" /> + Ajouter un document
                  </Button>
                  <input ref={docInputRef} type="file" multiple onChange={handleDocumentAdd} className="hidden" />
                  {dossier.documents && dossier.documents.length > 0 && (
                    <div className="space-y-2">
                      {dossier.documents.map((doc, idx) => (
                        <div key={`${doc.name}-${idx}`} className={`p-2.5 rounded-md border space-y-1.5 ${identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-[#F5F0EB]'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="size-4 shrink-0 text-muted-foreground" />
                              <span className={`${txt} truncate`}>{doc.name}</span>
                            </div>
                            <button onClick={() => removeDocument(idx)} className="p-2 -m-1 rounded-full hover:bg-red-50 text-red-500 transition-colors shrink-0" aria-label={`Supprimer ${doc.name}`}>
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                          {doc.ocrText && (
                            <div className="pl-6 space-y-1">
                              <p className="text-xs text-muted-foreground line-clamp-3">
                                Texte détecté : {doc.ocrText}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  updateField('notes', `${dossier.notes ? dossier.notes + '\n' : ''}[${doc.name}] ${doc.ocrText}`)
                                }
                                className="text-xs font-medium underline"
                                style={{ color: IDENT_COLOR }}
                              >
                                Ajouter aux notes
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ======================== ÉTAPE 5 : Autorisation ======================== */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <StepHero
                step={5}
                icon={<Lock className="size-5" />}
                title="Autorisation & envoi"
                description="Le schéma est recommandé, mais vous pouvez configurer l'autorisation plus tard si l'acteur n'est pas disponible. Vérifiez le dossier puis envoyez-le."
              />
              <Card className="border-[#9F8170]/30 bg-[#FDF3ED] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold" style={{ color: IDENT_COLOR }}>Vérifier le dossier</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Les éléments obligatoires doivent être complétés avant l’envoi.</p>
                  </div>
                  <FileText className="size-5 shrink-0" style={{ color: IDENT_COLOR }} />
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <ReviewRow label="CNI (recto & verso)" complete={!!dossier.cniRecto && !!dossier.cniVerso} onEdit={() => setCurrentStep(1)} detail={dossier.cniRecto && dossier.cniVerso ? 'Scannée' : 'Optionnelle — non scannée'} />
                  <ReviewRow label="Photo" complete={!!dossier.photoBase64} onEdit={() => setCurrentStep(2)} required />
                  <ReviewRow label="Identité et activité" complete={!!dossier.firstName && !!dossier.lastName && !!dossier.phone && !!dossier.actorType && !!dossier.activite} onEdit={() => setCurrentStep(2)} required />
                  <ReviewRow label="Zone / marché" complete={!!dossier.zone} onEdit={() => setCurrentStep(2)} required />
                  <ReviewRow label="Localisation" complete={!!dossier.gps} onEdit={() => setCurrentStep(4)} detail={dossier.gps ? 'Position capturée' : 'À compléter plus tard'} />
                  <ReviewRow label="Autorisation" complete={!!dossier.pinHash || !!dossier.patternHash || !!dossier.visualCodeHash} onEdit={() => undefined} detail={dossier.pinHash || dossier.patternHash || dossier.visualCodeHash ? 'Configurée' : 'À configurer plus tard'} />
                </div>
              </Card>

              {/* ---- 1. Schéma (recommandé) ---- */}
              <Card className="p-4 space-y-3 border-2" style={{ borderColor: patternDone ? '#16A34A' : IDENT_COLOR }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: patternDone ? '#16A34A20' : `${IDENT_COLOR}15` }}>
                      {patternDone ? <Check className="size-4 text-green-600" /> : <Grid3X3 className="size-4" style={{ color: IDENT_COLOR }} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`${txtLabel}`} style={{ color: patternDone ? '#16A34A' : IDENT_COLOR }}>1. Schéma</h3>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white rounded-full px-2 py-0.5" style={{ backgroundColor: IDENT_COLOR }}>
                          Recommandé
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Dessinez un schéma (min. 4 points)</p>
                    </div>
                  </div>
                  {patternDone && (
                    <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => { setPatternDone(false); setPatternError(false); updateField('patternHash', undefined) }}>
                      Changer
                    </Button>
                  )}
                </div>

                {!patternDone && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <div className={patternError ? 'animate-[shake_0.4s_ease-in-out]' : ''}>
                      <PatternLock
                        onComplete={handlePatternComplete}
                        color={IDENT_COLOR}
                        size={220}
                        error={patternError}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Connecter au moins 4 points</p>
                  </div>
                )}
              </Card>

              {/* ---- 2. Code PIN ---- */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: pinDone ? '#16A34A20' : `${IDENT_COLOR}15` }}>
                      {pinDone ? <Check className="size-4 text-green-600" /> : <Lock className="size-4" style={{ color: IDENT_COLOR }} />}
                    </div>
                    <div>
                      <h3 className={`${txtLabel}`} style={{ color: pinDone ? '#16A34A' : IDENT_COLOR }}>2. Code PIN</h3>
                      <p className="text-xs text-muted-foreground">Code secret à chiffres (4-6 chiffres)</p>
                    </div>
                  </div>
                  {pinDone && (
                    <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => { setPinDone(false); setPinValue(''); setPinConfirm(''); updateField('pinHash', undefined) }}>
                      Changer
                    </Button>
                  )}
                </div>

                {!pinDone && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Code PIN</Label>
                      <div className="relative">
                        <Input
                          className={`${txt} pr-10`}
                          type={pinVisible ? 'text' : 'password'}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="••••"
                          value={pinValue}
                          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
                        />
                        <button type="button" onClick={() => setPinVisible(!pinVisible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {pinVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Confirmer le code</Label>
                      <Input
                        className={txt}
                        type={pinVisible ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="••••"
                        value={pinConfirm}
                        onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full text-white"
                      style={{ backgroundColor: IDENT_COLOR }}
                      onClick={handlePinSubmit}
                      disabled={pinValue.length < 4 || !pinConfirm}
                    >
                      <Lock className="size-4 mr-1" /> Enregistrer le code PIN
                    </Button>
                  </div>
                )}
              </Card>

              {/* ---- 3. Code Visuel (Image) — marchand only, never offered for producteur ---- */}
              {dossier.actorType !== 'producteur' && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: visualDone ? '#16A34A20' : `${IDENT_COLOR}15` }}>
                        {visualDone ? <Check className="size-4 text-green-600" /> : <ImageIcon className="size-4" style={{ color: IDENT_COLOR }} />}
                      </div>
                      <div>
                        <h3 className={`${txtLabel}`} style={{ color: visualDone ? '#16A34A' : IDENT_COLOR }}>3. Code Visuel</h3>
                        <p className="text-xs text-muted-foreground">Choisir 4 images dans l'ordre</p>
                      </div>
                    </div>
                    {visualDone && (
                      <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => { setVisualDone(false); setVisualError(false); setVisualGridKey((k) => k + 1); updateField('visualCodeHash', undefined) }}>
                        Changer
                      </Button>
                    )}
                  </div>

                  {!visualDone && (
                    <div className="flex flex-col items-center gap-2 pt-2">
                      <div className={visualError ? 'animate-[shake_0.4s_ease-in-out]' : ''}>
                        <VisualCodeGrid
                          key={visualGridKey}
                          onComplete={handleVisualComplete}
                          requiredLength={3}
                          gridSize={3}
                          soleilMode={soleilMode}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Sélectionnez 3 symboles dans le bon ordre</p>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}
          </div>
        </div>
      </main>

      {/* ======================== BOTTOM ACTION BAR ======================== */}
      {/* pb safe-area : les CTA métier restent au-dessus de l'indicateur home
          iOS (34px) qui recouvre le viewport quand viewport-fit=cover. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {/* Progression fine X/5 au-dessus des CTA */}
        <div className={`h-1 w-full ${identDarkMode ? 'bg-stone-800' : 'bg-[#E7E0D8]'}`} role="presentation">
          <div
            className="h-full transition-[width] duration-500"
            style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%`, backgroundColor: IDENT_COLOR }}
          />
        </div>
        <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex gap-3">
          {currentStep === 1 && (
            <Button
              type="button"
              variant="outline"
              className={`flex-1 gap-2 ${txt}`}
              style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }}
              onClick={handleSaveDraft}
            >
              <Save className="size-4" /> Enregistrer
            </Button>
          )}
          {currentStep > 1 && currentStep < TOTAL_STEPS && (
            <Button
              type="button"
              variant="outline"
              className={`flex-1 gap-2 ${txt}`}
              style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }}
              onClick={goPrev}
            >
              <ArrowLeft className="size-4" /> Précédent
            </Button>
          )}
          {currentStep < TOTAL_STEPS && (
            <Button
              type="button"
              className={`flex-1 gap-2 text-white ${txt}`}
              style={{ backgroundColor: IDENT_COLOR }}
              onClick={goNext}
            >
              Suivant <ArrowRight className="size-4" />
            </Button>
          )}
          {currentStep === TOTAL_STEPS && (
            <Button
              type="button"
              className={`flex-1 gap-2 text-white ${txt}`}
              style={{ backgroundColor: IDENT_COLOR }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
               {submitting ? 'Envoi en cours...' : 'Envoyer le dossier'}
            </Button>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

/* ======================== Sub-components ======================== */

// Bandeau d'introduction commun à toutes les étapes : numérotation X/5,
// titre et consigne — la signature visuelle du parcours de création.
function StepHero({ step, icon, title, description }: {
  step: number
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{ borderColor: `${IDENT_COLOR}45`, backgroundColor: `${IDENT_COLOR}0a` }}
    >
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${IDENT_COLOR}1a` }}
      >
        <span style={{ color: IDENT_COLOR }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: IDENT_COLOR }}>
          Étape {step} sur 5
        </p>
        <h2 className="text-base font-bold leading-snug" style={{ color: IDENT_COLOR }}>
          {title}
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// Emplacement de capture d'une face de la CNI (recto ou verso). Ratio
// 1.586 = format réel d'une carte ID-1 (85,6 × 54 mm).
function CniSlot({ label, image, onCapture, onRemove }: {
  label: string
  image?: string
  onCapture: () => void
  onRemove: () => void
}) {
  if (image) {
    return (
      <div className="relative overflow-hidden rounded-xl border-2" style={{ borderColor: IDENT_COLOR }}>
        <img src={image} alt={`CNI — ${label}`} className="aspect-[1.586] w-full object-cover" />
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: IDENT_COLOR }}
        >
          {label}
        </span>
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button
            onClick={onCapture}
            className="rounded-full border bg-white/95 p-2 shadow-md transition-colors hover:bg-[#F5F0EB]"
            style={{ borderColor: IDENT_COLOR }}
            aria-label={`Reprendre le ${label}`}
          >
            <RotateCcw className="size-3.5" style={{ color: IDENT_COLOR }} />
          </button>
          <button
            onClick={onRemove}
            className="rounded-full border border-red-200 bg-white/95 p-2 text-red-500 shadow-md transition-colors hover:bg-red-50"
            aria-label={`Supprimer le ${label}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onCapture}
      className="flex aspect-[1.586] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-colors hover:bg-[#F5F0EB]"
      style={{ borderColor: `${IDENT_COLOR}80` }}
    >
      <CreditCard className="size-8" style={{ color: IDENT_COLOR, opacity: 0.65 }} />
      <span className="text-xs font-semibold" style={{ color: IDENT_COLOR }}>
        Scanner le {label.toLowerCase()}
      </span>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Camera className="size-3" aria-hidden /> Photo ou galerie
      </span>
    </button>
  )
}

function SectionTitle({ icon, title, required }: { icon: React.ReactNode; title: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: IDENT_COLOR }}>
      <span style={{ color: IDENT_COLOR }}>{icon}</span>
      <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: IDENT_COLOR }}>
        {title} {required && <span className="text-red-500">*</span>}
      </h2>
    </div>
  )
}

function ReviewRow({
  label,
  complete,
  required,
  detail,
  onEdit,
}: {
  label: string
  complete: boolean
  required?: boolean
  detail?: string
  onEdit: () => void
}) {
  const identDarkMode = useIdentificateurStore((s) => s.identDarkMode)
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${identDarkMode ? 'bg-stone-800/70' : 'bg-white/70'}`}>
      {complete ? <Check className="size-4 shrink-0 text-green-600" /> : <AlertTriangle className="size-4 shrink-0 text-amber-600" />}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}{required && <span className="text-red-500"> *</span>}</span>
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
      <button type="button" onClick={onEdit} className="shrink-0 text-xs font-medium underline" style={{ color: IDENT_COLOR }}>Modifier</button>
    </div>
  )
}

function MultiSelectField({ label, max, items, selected, onToggle, txtClass }: {
  label: string
  max: number
  items: string[]
  selected: string[]
  onToggle: (item: string) => void
  txtClass: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className={`text-sm font-medium`}>
        {label} <span className="text-muted-foreground font-normal">(max {max})</span>
      </Label>
      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-md border p-2">
        {items.map((p) => {
          const checked = selected.includes(p)
          return (
            <label key={p} className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(p)}
                className="data-[state=checked]:bg-[#9F8170] data-[state=checked]:border-[#9F8170]"
              />
              <span className={txtClass}>{p}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
