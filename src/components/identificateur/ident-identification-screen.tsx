"use client"

// MODE-989 (DET-001 tranche 3) — le wizard d'enrôlement devient
// orchestrateur : les cinq étapes, l'en-tête, le pied, les sous-composants
// de rendu (wizard/), la mécanique de capture (use-ident-capture) et la
// logique pure (ident-enrolement) sont extraits VERBATIM ; les seuls
// corps substitués ici sont validateStep2, toggleProduit et le callback
// d'erreur GPS web — chacun délégué à la lib testée ident-enrolement.
import { useEffect, useRef, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation as CapacitorGeolocation } from '@capacitor/geolocation'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'
import { AppLoading } from '@/components/shared/app-states'
import { visualCodeToHash } from '@/components/marchand/visual-code-grid'
import {
  useIdentificateurStore,
  createEmptyDossier,
  type Dossier,
  type ActorType,
} from '@/lib/stores/identificateur-store'
import {
  simpleHash,
  patternToHash,
  validateIdentiteDossier,
  basculeMulti,
  erreurGpsWeb,
} from '@/lib/ident-enrolement'
import { TOTAL_STEPS } from './wizard/parts'
import { useIdentCapture } from './wizard/use-ident-capture'
import { useIdentSubmission } from './wizard/use-ident-submission'
import { WizardHeader } from './wizard/wizard-header'
import { WizardFooter } from './wizard/wizard-footer'
import { StepCni } from './wizard/step-cni'
import { StepIdentite } from './wizard/step-identite'
import { StepDetails } from './wizard/step-details'
import { StepLocalisation } from './wizard/step-localisation'
import { StepAutorisation } from './wizard/step-autorisation'

export function IdentIdentificationScreen() {
  const { goBack, navigate, soleilMode, merchantId, merchantName } = useAppStore()
  const { dossiers, currentDraftId, identDarkMode } = useIdentificateurStore()
  const { toast } = useToast()

  const [currentStep, setCurrentStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  // MODE-937 — code de liaison one-shot renvoyé par la soumission, affiché
  // une seule fois avant de quitter l'écran.
  const [issuedLiaisonCode, setIssuedLiaisonCode] = useState<string | null>(null)
  // DET-COOP-007 (MODE-978) — annuaire coopératives (id + nom, aucune
  // donnée personnelle) chargé paresseusement au premier cochage de
  // l'adhésion. Hors ligne ou erreur : l'agent voit l'état honnête et
  // peut réessayer ou décocher — le dossier n'est jamais bloqué.
  const [cooperativesListe, setCooperativesListe] = useState<Array<{ id: string; nom: string }>>([])
  const [cooperativesEtat, setCooperativesEtat] = useState<'idle' | 'chargement' | 'pret' | 'erreur'>('idle')
  const chargerCooperatives = useCallback(async () => {
    if (!merchantId) return
    setCooperativesEtat('chargement')
    try {
      const res = await fetch(`/api/identificateur/cooperatives?identificateurId=${encodeURIComponent(merchantId)}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { cooperatives?: Array<{ id: string; nom: string }> }
      setCooperativesListe(body.cooperatives ?? [])
      setCooperativesEtat('pret')
    } catch {
      setCooperativesEtat('erreur')
    }
  }, [merchantId])
  const basculerAdhesion = (coche: boolean) => {
    updateField('estMembreCooperative', coche)
    if (coche) {
      updateField('cooperativeId', undefined)
      updateField('cooperativeNom', undefined)
      if (cooperativesEtat === 'idle' || cooperativesEtat === 'erreur') void chargerCooperatives()
    }
  }
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

  // Text size helper
  const txt = soleilMode ? 'text-base' : 'text-sm'
  const txtLabel = soleilMode ? 'text-base font-medium' : 'text-sm font-medium'



  const updateField = <K extends keyof Dossier>(key: K, value: Dossier[K]) => {
    setDossier((prev) => (prev ? { ...prev, [key]: value } : prev))
  }
  // Mécanique de capture (photos, CNI, OCR, documents) — extraite dans le
  // hook use-ident-capture ; le dossier vivant et ses setters sont injectés
  // à chaque rendu (mêmes closures que l'original).
  const identCapture = useIdentCapture({ dossier, updateField, setDossier })
  const {
    ocrStatus,
    photoWarnings,
    checkingPhoto,
    cniRectoInputRef,
    cniVersoInputRef,
    photoInputRef,
    etalInputRef,
    docInputRef,
    handlePhotoCapture,
    handleEtalPhoto,
    captureActorPhoto,
    captureEtalPhoto,
    handleCniFile,
    captureCniSide,
    removeCniSide,
    runCniOcr,
    handleDocumentAdd,
    removeDocument,
  } = identCapture

  // Persistance & soumission (brouillon, auto-save, envoi serveur) —
  // extraite dans use-ident-submission, état injecté.
  const { handleSaveDraft, handleSubmit } = useIdentSubmission({
    dossier,
    setDossier,
    updateField,
    isNew,
    setIsNew,
    setSaveStatus,
    setSubmitting,
    setIssuedLiaisonCode,
    setCurrentStep,
    navigate,
  })


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
        const { message: msg, statut } = erreurGpsWeb(error.code)
        updateField('gpsStatus', statut)
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
    const { next, refuse } = basculeMulti(current, produit)
    if (next !== null) updateField(field, next)
    if (refuse) toast({ title: 'Limite atteinte', description: 'Vous pouvez choisir au maximum 5 éléments' })
  }

  // Step validation
  const validateStep1 = (): string | null => {
    if (!dossier) return 'Dossier non disponible'
    return null
  }

  const validateStep2 = (): string | null => validateIdentiteDossier(dossier)

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
        {/* MODE-1008 : AppLoading (miroir bo-ui), texte inchangé. */}
        <AppLoading label="Chargement du dossier..." soleilMode={soleilMode} />
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
      <WizardHeader
        currentStep={currentStep}
        setCurrentStep={setCurrentStep}
        saveStatus={saveStatus}
        identDarkMode={identDarkMode}
        soleilMode={soleilMode}
        goBack={goBack}
        goPrev={goPrev}
        handleSaveDraft={handleSaveDraft}
      />

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
            <StepCni
              dossier={dossier}
              captureCniSide={captureCniSide}
              removeCniSide={removeCniSide}
              handleCniFile={handleCniFile}
              cniRectoInputRef={cniRectoInputRef}
              cniVersoInputRef={cniVersoInputRef}
              ocrStatus={ocrStatus}
              runCniOcr={runCniOcr}
              goNext={goNext}
              identDarkMode={identDarkMode}
              soleilMode={soleilMode}
            />
          )}

          {/* ======================== ÉTAPE 2 : Photo & Identité ======================== */}
          {currentStep === 2 && (
            <StepIdentite
              dossier={dossier}
              updateField={updateField}
              handlePhotoCapture={handlePhotoCapture}
              captureActorPhoto={captureActorPhoto}
              photoInputRef={photoInputRef}
              checkingPhoto={checkingPhoto}
              photoWarnings={photoWarnings}
              basculerAdhesion={basculerAdhesion}
              chargerCooperatives={chargerCooperatives}
              cooperativesEtat={cooperativesEtat}
              cooperativesListe={cooperativesListe}
              sexeLabels={sexeLabels}
              identDarkMode={identDarkMode}
              soleilMode={soleilMode}
            />
          )}

          {/* ======================== ÉTAPE 3 : Détails ======================== */}
          {currentStep === 3 && (
            <StepDetails
              dossier={dossier}
              updateField={updateField}
              handleEtalPhoto={handleEtalPhoto}
              captureEtalPhoto={captureEtalPhoto}
              etalInputRef={etalInputRef}
              toggleProduit={toggleProduit}
              typeCommerceLabels={typeCommerceLabels}
              typeProductionLabels={typeProductionLabels}
              modeExploitationLabels={modeExploitationLabels}
              soleilMode={soleilMode}
            />
          )}

          {/* ======================== ÉTAPE 4 : Localisation ======================== */}
          {currentStep === 4 && (
            <StepLocalisation
              dossier={dossier}
              updateField={updateField}
              captureGPS={captureGPS}
              gpsLoading={gpsLoading}
              handleDocumentAdd={handleDocumentAdd}
              docInputRef={docInputRef}
              removeDocument={removeDocument}
              identDarkMode={identDarkMode}
              soleilMode={soleilMode}
            />
          )}

          {/* ======================== ÉTAPE 5 : Autorisation ======================== */}
          {currentStep === 5 && (
            <StepAutorisation
              dossier={dossier}
              updateField={updateField}
              setCurrentStep={setCurrentStep}
              soleilMode={soleilMode}
              pinValue={pinValue}
              setPinValue={setPinValue}
              pinConfirm={pinConfirm}
              setPinConfirm={setPinConfirm}
              pinVisible={pinVisible}
              setPinVisible={setPinVisible}
              pinDone={pinDone}
              setPinDone={setPinDone}
              patternDone={patternDone}
              setPatternDone={setPatternDone}
              patternError={patternError}
              setPatternError={setPatternError}
              visualDone={visualDone}
              setVisualDone={setVisualDone}
              visualError={visualError}
              setVisualError={setVisualError}
              visualGridKey={visualGridKey}
              setVisualGridKey={setVisualGridKey}
              handlePinSubmit={handlePinSubmit}
              handlePatternComplete={handlePatternComplete}
              handleVisualComplete={handleVisualComplete}
            />
          )}
          </div>
        </div>
      </main>

      <WizardFooter
        currentStep={currentStep}
        submitting={submitting}
        identDarkMode={identDarkMode}
        soleilMode={soleilMode}
        goNext={goNext}
        goPrev={goPrev}
        handleSaveDraft={handleSaveDraft}
        handleSubmit={handleSubmit}
        issuedLiaisonCode={issuedLiaisonCode}
        setIssuedLiaisonCode={setIssuedLiaisonCode}
        navigate={navigate}
      />
    </div>
  )
}
