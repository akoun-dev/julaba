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
  ACTIVITES,
  PRODUITS,
} from '@/lib/stores/identificateur-store'

const IDENT_COLOR = '#9F8170'
const TOTAL_STEPS = 4

const STEPS_META = [
  { label: 'Photo & Identité', icon: '📸' },
  { label: 'Détails Acteur', icon: '📋' },
  { label: 'Localisation & Documents', icon: '📍' },
  { label: 'Autorisation', icon: '🔒' },
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
  } = useIdentificateurStore()
  const { toast } = useToast()

  const [currentStep, setCurrentStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)

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

  const photoInputRef = useRef<HTMLInputElement>(null)
  const etalInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Text size helper
  const txt = soleilMode ? 'text-base' : 'text-sm'
  const txtLabel = soleilMode ? 'text-base font-medium' : 'text-sm font-medium'

  // Auto-save every 30 seconds
  const autoSave = useCallback(() => {
    if (!dossier) return
    const now = Date.now()
    if (isNew) {
      addDossier({ ...dossier, updatedAt: now, status: 'brouillon' })
      setIsNew(false)
      setCurrentDraftId(dossier.id)
    } else {
      updateDossier(dossier.id, { ...dossier, updatedAt: now, status: 'brouillon' })
    }
  }, [dossier, isNew, addDossier, updateDossier, setCurrentDraftId])

  useEffect(() => {
    const interval = setInterval(() => {
      if (dossier) autoSave()
    }, 30000)
    return () => clearInterval(interval)
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
    reader.onloadend = () => updateField('photoBase64', reader.result as string)
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
  const captureViaCameraPlugin = async (field: 'photoBase64' | 'photoEtal') => {
    try {
      const photo = await CapacitorCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 80,
        allowEditing: false,
        promptLabelHeader: field === 'photoBase64' ? "Photo de l'acteur" : "Photo de l'étal",
        promptLabelPhoto: 'Choisir depuis la galerie',
        promptLabelPicture: 'Prendre une photo',
      })
      if (photo.dataUrl) updateField(field, photo.dataUrl)
    } catch {
      // User cancelled the native picker — nothing to do.
    }
  }

  const captureActorPhoto = () => {
    if (Capacitor.isNativePlatform()) {
      captureViaCameraPlugin('photoBase64')
      return
    }
    photoInputRef.current?.click()
  }

  const captureEtalPhoto = () => {
    if (Capacitor.isNativePlatform()) {
      captureViaCameraPlugin('photoEtal')
      return
    }
    etalInputRef.current?.click()
  }

  // Document handling
  const handleDocumentAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !dossier) return
    Array.from(files).forEach((file) => {
      if ((dossier.documents || []).length >= 10) return
      const reader = new FileReader()
      reader.onloadend = () => {
        const docEntry = { name: file.name, base64: reader.result as string, type: file.type }
        setDossier((prev) => {
          if (!prev) return prev
          const docs = [...(prev.documents || []), docEntry].slice(0, 10)
          return { ...prev, documents: docs }
        })
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
        toast({ title: 'Position capturée', description: `Précision: ${Math.round(position.coords.accuracy)}m` })
      } catch {
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
        setGpsLoading(false)
        toast({ title: 'Position capturée', description: `Précision: ${Math.round(position.coords.accuracy)}m` })
      },
      (error) => {
        setGpsLoading(false)
        let msg = 'Erreur lors de la capture de la position'
        if (error.code === 1) msg = 'Permission de localisation refusée'
        if (error.code === 2) msg = 'Position non disponible'
        if (error.code === 3) msg = 'Délai de localisation expiré'
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
    if (!dossier.photoBase64) return 'Photo de l\'acteur obligatoire'
    if (!dossier.actorType) return 'Type d\'acteur obligatoire'
    if (!dossier.firstName.trim()) return 'Prénom obligatoire'
    if (!dossier.lastName.trim()) return 'Nom obligatoire'
    if (!dossier.phone.trim()) return 'Téléphone obligatoire'
    if (!dossier.activite) return 'Activité obligatoire'
    if (!dossier.zone) return 'Zone / Marché obligatoire'
    return null
  }

  const validateStep3 = (): string | null => {
    if (!dossier?.gps) return 'Géolocalisation obligatoire'
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
    if (currentStep === 3) {
      const err = validateStep3()
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

  // Submit — at least 1 auth method required
  const handleSubmit = async () => {
    if (!dossier) return
    if (!dossier.pinHash && !dossier.patternHash && !dossier.visualCodeHash) {
      toast({ title: 'Autorisation obligatoire', description: 'Configurez au moins 1 méthode d\'autorisation' })
      return
    }
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 500))
    saveToStore('en_attente')
    setSubmitting(false)
    toast({ title: 'Dossier soumis', description: 'Dossier envoyé pour validation' })
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
    updateField('pinHash', simpleHash(pinValue))
    setPinDone(true)
    toast({ title: 'Code PIN enregistré ✅' })
  }

  // Auth: Pattern
  const handlePatternComplete = (pattern: number[]) => {
    updateField('patternHash', patternToHash(pattern))
    setPatternDone(true)
    setPatternError(false)
    toast({ title: 'Schéma enregistré ✅' })
  }

  // Auth: Visual
  const handleVisualComplete = (sequence: string[]) => {
    updateField('visualCodeHash', visualCodeToHash(sequence))
    setVisualDone(true)
    setVisualError(false)
    toast({ title: 'Code visuel enregistré ✅' })
  }

  if (!dossier) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-background">
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
    <div className="flex flex-col min-h-dvh bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={currentStep === 1 ? goBack : goPrev}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label={currentStep === 1 ? 'Retour' : 'Étape précédente'}
          >
            <ArrowLeft className="size-5" style={{ color: IDENT_COLOR }} />
          </button>
          <h1 className={`${soleilMode ? 'text-lg' : 'text-base'} font-bold tracking-tight`} style={{ color: IDENT_COLOR }}>
            NOUVEAU DOSSIER
          </h1>
          <Button variant="ghost" size="sm" onClick={handleSaveDraft} className="gap-1" style={{ color: IDENT_COLOR }}>
            💾 Brouillon
          </Button>
        </div>

        {/* Step indicator */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1">
            {STEPS_META.map((step, i) => {
              const stepNum = i + 1
              const isActive = currentStep === stepNum
              const isDone = currentStep > stepNum
              return (
                <React.Fragment key={stepNum}>
                  {i > 0 && (
                    <div
                      className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${isDone ? 'bg-[#9F8170]' : 'bg-gray-200'}`}
                    />
                  )}
                  <button
                    onClick={() => stepNum < currentStep && setCurrentStep(stepNum)}
                    disabled={stepNum > currentStep}
                    className={`flex flex-col items-center gap-0.5 min-w-[56px] transition-all ${
                      stepNum <= currentStep ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        isActive
                          ? 'text-white shadow-lg scale-125 ring-4 ring-[#9F817020]'
                          : isDone
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                      style={isActive || isDone ? { backgroundColor: IDENT_COLOR } : undefined}
                    >
                      {isDone ? <Check className="size-4" /> : stepNum}
                    </div>
                    <span
                      className={`${soleilMode ? 'text-[10px]' : 'text-[9px]'} font-medium text-center leading-tight ${
                        isActive ? 'text-[#9F8170]' : 'text-muted-foreground'
                      }`}
                    >
                      {step.icon} {step.label}
                    </span>
                  </button>
                </React.Fragment>
              )
            })}
          </div>
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
          {/* ======================== STEP 1: Photo & Identity ======================== */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Photo */}
              <section>
                <SectionTitle icon={<Camera className="size-4" />} title="PHOTO ACTEUR" required />
                <div className="mt-3">
                  {dossier.photoBase64 ? (
                    <div className="relative inline-block">
                      <img
                        src={dossier.photoBase64}
                        alt="Photo acteur"
                        className="w-32 h-32 rounded-lg object-cover border-2"
                        style={{ borderColor: IDENT_COLOR }}
                      />
                      <button
                        onClick={captureActorPhoto}
                        className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-white shadow-md border hover:bg-gray-50 transition-colors"
                        style={{ borderColor: IDENT_COLOR }}
                        aria-label="Reprendre photo"
                      >
                        <RotateCcw className="size-3.5" style={{ color: IDENT_COLOR }} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={captureActorPhoto}
                      className="flex flex-col items-center justify-center w-32 h-32 rounded-lg border-2 border-dashed hover:bg-gray-50 transition-colors cursor-pointer"
                      style={{ borderColor: IDENT_COLOR }}
                    >
                      <Camera className="size-8 mb-1" style={{ color: IDENT_COLOR, opacity: 0.6 }} />
                      <span className={`${txt} text-muted-foreground`}>Prendre photo</span>
                    </button>
                  )}
                  <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                </div>
              </section>

              {/* Type acteur */}
              <section>
                <SectionTitle icon={<span>👤</span>} title="TYPE ACTEUR" required />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      { type: 'marchand' as ActorType, icon: '🏪', label: 'Marchand' },
                      { type: 'producteur' as ActorType, icon: '🌾', label: 'Producteur' },
                      { type: 'cooperative' as ActorType, icon: '🤝', label: 'Coopérative' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => updateField('actorType', item.type)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        dossier.actorType === item.type ? 'border-current shadow-sm' : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={dossier.actorType === item.type ? { borderColor: IDENT_COLOR, backgroundColor: `${IDENT_COLOR}10` } : undefined}
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <span className={`${txt} font-medium`} style={{ color: dossier.actorType === item.type ? IDENT_COLOR : undefined }}>
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Informations obligatoires */}
              <section>
                <SectionTitle icon={<span>📋</span>} title="INFORMATIONS OBLIGATOIRES" required />
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
                    <Label className={txtLabel}>Téléphone <span className="text-red-500">*</span></Label>
                    <div className="flex items-center">
                      <span className={`${txt} px-3 py-2 rounded-l-md border border-r-0 bg-gray-50 text-muted-foreground`}>+225</span>
                      <Input className={`${txt} rounded-l-none`} type="tel" placeholder="0X XX XX XX XX" value={dossier.phone} onChange={(e) => updateField('phone', e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Activité <span className="text-red-500">*</span></Label>
                    <Select value={dossier.activite} onValueChange={(val) => updateField('activite', val)}>
                      <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir une activité" /></SelectTrigger>
                      <SelectContent>{ACTIVITES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
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

          {/* ======================== STEP 2: Actor Details ======================== */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Complementary info */}
              <section>
                <SectionTitle icon={<span>📝</span>} title="INFORMATIONS COMPLÉMENTAIRES" />
                <div className="mt-3 space-y-4">
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Date de naissance</Label>
                    <Input className={txt} type="date" value={dossier.dateNaissance || ''} onChange={(e) => updateField('dateNaissance', e.target.value)} />
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
                  <SectionTitle icon={<span>🏪</span>} title="INFORMATIONS MARCHAND" />
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
                        <button onClick={captureEtalPhoto} className="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed hover:bg-gray-50 transition-colors" style={{ borderColor: IDENT_COLOR }}>
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
                  <SectionTitle icon={<span>🌾</span>} title="INFORMATIONS PRODUCTEUR" />
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
                  <SectionTitle icon={<span>🤝</span>} title="INFORMATIONS COOPÉRATIVE" />
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

          {/* ======================== STEP 3: GPS, Notes, Documents ======================== */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* GPS */}
              <section>
                <SectionTitle icon={<MapPin className="size-4" />} title="GÉOLOCALISATION" required />
                <div className="mt-3 space-y-3">
                  <Button type="button" variant="outline" className={`w-full gap-2 ${txt}`} style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }} onClick={captureGPS} disabled={gpsLoading}>
                    {gpsLoading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                    {gpsLoading ? 'Capture...' : '📍 Capturer ma position'}
                  </Button>
                  {dossier.gps && (
                    <Card className="p-3 space-y-1.5">
                      <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Latitude:</span><span className="font-mono">{dossier.gps.lat.toFixed(6)}</span></div>
                      <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Longitude:</span><span className="font-mono">{dossier.gps.lon.toFixed(6)}</span></div>
                      {dossier.gps.accuracy && <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Précision:</span><span className="font-mono">{Math.round(dossier.gps.accuracy)}m</span></div>}
                      <button className={`flex items-center gap-1 mt-2 ${txt} font-medium`} style={{ color: IDENT_COLOR }} type="button">
                        <Map className="size-4" /> 🗺️ Voir sur la carte
                      </button>
                    </Card>
                  )}
                </div>
              </section>

              {/* Notes */}
              <section>
                <SectionTitle icon={<span>💬</span>} title="NOTES" />
                <div className="mt-3">
                  <Textarea className={txt} placeholder="Commentaire libre..." rows={3} value={dossier.notes || ''} onChange={(e) => updateField('notes', e.target.value)} />
                </div>
              </section>

              {/* Documents */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="📎 PIÈCES JOINTES" />
                <div className="mt-3 space-y-3">
                  <Button type="button" variant="outline" className={`w-full gap-2 ${txt}`} style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }} onClick={() => docInputRef.current?.click()}>
                    <Upload className="size-4" /> + Ajouter un document
                  </Button>
                  <input ref={docInputRef} type="file" multiple onChange={handleDocumentAdd} className="hidden" />
                  {dossier.documents && dossier.documents.length > 0 && (
                    <div className="space-y-2">
                      {dossier.documents.map((doc, idx) => (
                        <div key={`${doc.name}-${idx}`} className="flex items-center justify-between p-2.5 rounded-md border bg-gray-50">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <span className={`${txt} truncate`}>{doc.name}</span>
                          </div>
                          <button onClick={() => removeDocument(idx)} className="p-1 rounded-full hover:bg-red-50 text-red-500 transition-colors shrink-0" aria-label={`Supprimer ${doc.name}`}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ======================== STEP 4: Authentication ======================== */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${IDENT_COLOR}15` }}>
                  <ShieldCheck className="size-7" style={{ color: IDENT_COLOR }} />
                </div>
                <h2 className={`${soleilMode ? 'text-lg' : 'text-base'} font-bold`} style={{ color: IDENT_COLOR }}>
                  CONFIGURATION AUTORISATION
                </h2>
                <p className={`${txt} text-muted-foreground mt-1`}>
                  Configurez au moins 1 méthode d'autorisation pour l'acteur.
                  Cela lui permettra d'accéder à son compte en toute sécurité.
                </p>
              </div>

              {/* ---- 1. Code PIN ---- */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: pinDone ? '#16A34A20' : `${IDENT_COLOR}15` }}>
                      {pinDone ? <Check className="size-4 text-green-600" /> : <Lock className="size-4" style={{ color: IDENT_COLOR }} />}
                    </div>
                    <div>
                      <h3 className={`${txtLabel}`} style={{ color: pinDone ? '#16A34A' : IDENT_COLOR }}>1. Code PIN</h3>
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

              {/* ---- 2. Schéma ---- */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: patternDone ? '#16A34A20' : `${IDENT_COLOR}15` }}>
                      {patternDone ? <Check className="size-4 text-green-600" /> : <Grid3X3 className="size-4" style={{ color: IDENT_COLOR }} />}
                    </div>
                    <div>
                      <h3 className={`${txtLabel}`} style={{ color: patternDone ? '#16A34A' : IDENT_COLOR }}>2. Schéma</h3>
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

              {/* ---- 3. Code Visuel (Image) ---- */}
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
                        requiredLength={4}
                        gridSize={3}
                        soleilMode={soleilMode}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Sélectionnez 4 images dans le bon ordre</p>
                  </div>
                )}
              </Card>
            </div>
          )}
          </div>
        </div>
      </main>

      {/* ======================== BOTTOM ACTION BAR ======================== */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-lg mx-auto flex gap-3">
          {currentStep === 1 && (
            <Button
              type="button"
              variant="outline"
              className={`flex-1 gap-2 ${txt}`}
              style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }}
              onClick={handleSaveDraft}
            >
              <Save className="size-4" /> 💾 Brouillon
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
              {submitting ? 'Envoi en cours...' : '📤 Soumettre pour validation'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ======================== Sub-components ======================== */

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
