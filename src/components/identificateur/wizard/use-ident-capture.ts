"use client"

/**
 * MODE-989 (DET-001 tranche 3) — mécanique de capture du wizard
 * d'enrôlement : photos acteur/étal, CNI recto/verso (plugin natif ou
 * input web), OCR sur l'appareil, documents joints, contrôle qualité
 * photo. Corps repris VERBATIM de ident-identification-screen ; les
 * deux reducers inline (fusion OCR, ajout de document) sont délégués à
 * la lib testée ident-enrolement — équivalence prouvée par tests.
 *
 * Le hook reçoit le dossier vivant et ses setters (injectés à chaque
 * rendu, mêmes closures que l'original) et possède l'état transitoire
 * de capture (statut OCR, avertissements photo, refs d'inputs cachés).
 */
import { useRef, useState, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useToast } from '@/hooks/use-toast'
import { checkEnrollmentPhoto } from '@/lib/vision/photo-quality'
import { extractDocumentText, parseCniFields } from '@/lib/vision/document-ocr'
import { fusionnerChampsCni, avecDocumentAjoute } from '@/lib/ident-enrolement'
import type { Dossier } from '@/lib/stores/identificateur-store'

interface IdentCaptureCtx {
  dossier: Dossier | null
  updateField: <K extends keyof Dossier>(key: K, value: Dossier[K]) => void
  setDossier: Dispatch<SetStateAction<Dossier | null>>
}

export function useIdentCapture({ dossier, updateField, setDossier }: IdentCaptureCtx) {
  const { toast } = useToast()

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
          runCniOcrWhenAvailable(field === 'cniRecto' ? photo.dataUrl : dossier?.cniRecto, field === 'cniVerso' ? photo.dataUrl : dossier?.cniVerso)
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
      runCniOcrWhenAvailable(
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

  /**
   * Le recto suffit fréquemment pour l'identité. Lire la première face dès
   * sa capture évite de bloquer le pré-remplissage derrière une seconde
   * photo ; le verso enrichit l'analyse lorsqu'il arrive ensuite.
   */
  const runCniOcrWhenAvailable = (recto?: string, verso?: string) => {
    if (recto || verso) runCniOcr(recto, verso)
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
        setDossier((prev) => fusionnerChampsCni(prev, fields))
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
        setDossier((prev) => avecDocumentAjoute(prev, docEntry))
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

  return {
    ocrStatus,
    photoWarnings,
    checkingPhoto,
    runPhotoQualityCheck,
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
  }
}
