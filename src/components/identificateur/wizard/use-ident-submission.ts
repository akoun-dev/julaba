"use client"

import { useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useToast } from '@/hooks/use-toast'
import {
  useIdentificateurStore,
  type Dossier,
} from '@/lib/stores/identificateur-store'
import { submitDossierToServer, messageAdhesionCoop } from '@/lib/identificateur-sync'
import { validateIdentiteDossier } from '@/lib/ident-enrolement'
import type { ScreenRoute } from '@/lib/stores/app-store'

// MODE-989 (DET-001 tranche 3) — persistance & soumission du wizard
// d'enrôlement. Corps repris VERBATIM de ident-identification-screen
// (preuve octet-pour-octet via le script de chirurgie persisté) ; les
// seules transformations documentées : validateStep2() est appelée via
// la lib testée ident-enrolement, et les actions du store zustand sont
// déstructurées dans le hook (même instance, actions stables).

interface IdentSubmissionCtx {
  dossier: Dossier | null
  setDossier: Dispatch<SetStateAction<Dossier | null>>
  updateField: <K extends keyof Dossier>(key: K, value: Dossier[K]) => void
  isNew: boolean
  setIsNew: Dispatch<SetStateAction<boolean>>
  setSaveStatus: Dispatch<SetStateAction<'idle' | 'saving' | 'saved' | 'error'>>
  setSubmitting: Dispatch<SetStateAction<boolean>>
  setIssuedLiaisonCode: Dispatch<SetStateAction<string | null>>
  setCurrentStep: Dispatch<SetStateAction<number>>
  navigate: (screen: ScreenRoute) => void
}

export function useIdentSubmission(ctx: IdentSubmissionCtx) {
  const { toast } = useToast()
  const { addDossier, updateDossier, setCurrentDraftId } = useIdentificateurStore()
  const { dossier, setDossier, updateField, isNew, setIsNew, setSaveStatus, setSubmitting, setIssuedLiaisonCode, setCurrentStep, navigate } = ctx

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

  // Save draft
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
    // (MODE-989) validateStep2() du wizard = validateIdentiteDossier(dossier)
    // — lib testée ident-enrolement, corps verbatim de l'original.
    const identityError = validateIdentiteDossier(dossier)
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
    // MODE-937 (S-04) : le serveur renvoie un code de liaison one-shot (30 j)
    // pour le compte provisionné — affiché UNE fois à l'agent avant de
    // quitter l'écran (le serveur ne pourra jamais le ré-afficher).
    if (result.status === 'synced' && result.codeLiaison) {
      setIssuedLiaisonCode(result.codeLiaison)
      const msgAdhesion = messageAdhesionCoop(result.adhesionCooperative, toSubmit.cooperativeNom)
      if (msgAdhesion) toast({ title: msgAdhesion.titre, description: msgAdhesion.description })
      return
    }
    toast({
      title: 'Dossier soumis',
      description: result.status === 'synced' ? 'Dossier envoyé pour validation' : 'Dossier enregistré, en attente de synchronisation',
    })
    // DET-COOP-007 — verdict honnête de l'adhésion automatique (le
    // dossier reste soumis dans tous les cas ; ici on INFORME).
    const msgAdhesion = messageAdhesionCoop(result.adhesionCooperative, toSubmit.cooperativeNom)
    if (msgAdhesion) toast({ title: msgAdhesion.titre, description: msgAdhesion.description })
    navigate('ident-suivi')
  }


  return { autoSave, saveToStore, handleSaveDraft, handleSubmit }
}
