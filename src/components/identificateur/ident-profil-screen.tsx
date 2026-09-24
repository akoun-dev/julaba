'use client'

/**
 * MODE-998 (DET-001 tranche 10) — orchestrateur du profil identificateur :
 * état, handlers et sections PARAMÈTRES / SÉCURITÉ / À PROPOS. Les parts
 * partagées, l'en-tête + cartes d'infos, les 5 Sheets, les boutons de
 * déconnexion/suppression et leurs 2 AlertDialogs vivent verbatim dans
 * ./profil/ ; la logique pure est testée dans lib/ident-profil-logic.ts
 * (djb2, téléphone, masquage, initiales, « membre depuis », étapes PIN).
 * API publique inchangée (IdentProfilScreen, page.tsx).
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import {
  Moon, Smartphone, Bell, ChevronRight, MapPin, Target,
  Fingerprint, Lock, Shield, Info, GraduationCap, Headphones,
  LogOut, Trash2,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { NotificationsPanel } from '@/components/shared/notifications-panel'
import { cn } from '@/lib/utils'
import { cleanupIdentData, cleanupAllData } from '@/lib/cleanup'
import { getSimpleNotifPrefs, setSimpleNotifPrefs } from '@/lib/notification-preferences'
import {
  simpleHash, loadAgent, saveAgent, loadAgentPinHash,
  computeMaskedPhone, computeInitials, computeTruncatedId, computeMemberSince,
  computeAutoLockLabel, pinStepTitleFor, pinLengthFor, type PinStep,
} from '@/lib/ident-profil-logic'
import { IDENT_COLOR } from './profil/profil-parts'
import { ProfilIdentity } from './profil/profil-identity'
import { ProfilPinSheet } from './profil/profil-pin-sheet'
import { ProfilSheets } from './profil/profil-sheets'
import { ProfilConfirmDialogs } from './profil/profil-confirm-dialogs'
import { ActorProfileFooter } from '@/components/shared/actor-profile-footer'

// ─── Main component ──────────────────────────────────────────────────────────

export function IdentProfilScreen() {
  const { goBack, soleilMode, merchantName, merchantPhone, merchantId, logout } = useAppStore()
  const {
    agentZone, agentMarche, mission, missionSource, fetchMissionFromServer, screenSensitive, toggleScreenSensitive, identDarkMode, toggleIdentDarkMode,
    agentCode,
    autoLockMinutes, setAutoLockMinutes,
    screenshotBlocked, toggleScreenshotBlocked,
    setAgentZone, setAgentMarche,
    dossiers,
  } = useIdentificateurStore()
  const { toast } = useToast()

  const [systemeNotif, setSystemeNotif] = useState(() => getSimpleNotifPrefs('identificateur').systeme)
  const toggleSystemeNotif = (checked: boolean) => {
    setSystemeNotif(checked)
    setSimpleNotifPrefs('identificateur', { systeme: checked })
  }

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedTextClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'
  const cardClass = identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-100' : 'border-[#E7E0D8] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]'

  // Mask phone if screen sensitive
  const maskedPhone = useMemo(() => computeMaskedPhone(merchantPhone, screenSensitive), [merchantPhone, screenSensitive])

  // Initials
  const initials = useMemo(() => computeInitials(merchantName), [merchantName])

  // Truncated merchant ID
  const truncatedId = useMemo(() => computeTruncatedId(merchantId), [merchantId])

  // Member since
  const memberSince = useMemo(() => computeMemberSince(dossiers), [dossiers])

  // Auto-lock display value
  const autoLockLabel = useMemo(() => computeAutoLockLabel(autoLockMinutes), [autoLockMinutes])


  // ─── Modal states ──────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  // ─── Sheet states ──────────────────────────────────────────────────────────
  const [showPinSheet, setShowPinSheet] = useState(false)
  const [showAutoLockSheet, setShowAutoLockSheet] = useState(false)
  const [showZoneSheet, setShowZoneSheet] = useState(false)
  const [showAcademySheet, setShowAcademySheet] = useState(false)
  const [showSupportSheet, setShowSupportSheet] = useState(false)
  // Centre de notifications — déplacé de l'accueil (maquettes « vues du
  // menu » : en-tête épuré) et désormais ouvert depuis les paramètres.
  const [showNotifications, setShowNotifications] = useState(false)

  // ─── PIN change state ──────────────────────────────────────────────────────
  const [pinStep, setPinStep] = useState<PinStep>('current')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinProcessing, setPinProcessing] = useState(false)

  const resetPinState = useCallback(() => {
    setPinStep('current')
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setPinError('')
    setPinProcessing(false)
  }, [])

  const handlePinDigit = useCallback(async (digit: string) => {
    setPinError('')
    if (pinStep === 'current') {
      if (currentPin.length >= 4) return
      const updated = currentPin + digit
      setCurrentPin(updated)
      if (updated.length === 4) {
        // Validate current PIN
        const agent = loadAgent(merchantPhone || '')
        if (!agent) {
          setPinError('Agent non trouvé.')
          setCurrentPin('')
          return
        }
        const storedPinHash = await loadAgentPinHash(merchantPhone || '')
        if (simpleHash(updated) !== storedPinHash) {
          setPinError('Code actuel incorrect.')
          setCurrentPin('')
          return
        }
        setTimeout(() => {
          setPinStep('new')
          setPinError('')
        }, 200)
      }
    } else if (pinStep === 'new') {
      if (newPin.length >= 4) return
      const updated = newPin + digit
      setNewPin(updated)
      if (updated.length === 4) {
        setTimeout(() => {
          setPinStep('confirm')
          setPinError('')
        }, 200)
      }
    } else if (pinStep === 'confirm') {
      if (confirmPin.length >= 4) return
      const updated = confirmPin + digit
      setConfirmPin(updated)
      if (updated.length === 4) {
        if (updated !== newPin) {
          setPinError('Les codes ne correspondent pas.')
          setConfirmPin('')
          return
        }
        // Save
        setPinProcessing(true)
        setTimeout(async () => {
          const agent = loadAgent(merchantPhone || '')
          if (agent) {
            await saveAgent({ ...agent, pinHash: simpleHash(updated) })
            toast({ title: 'Code PIN modifié avec succès' })
            setShowPinSheet(false)
            resetPinState()
          } else {
            setPinError('Erreur : agent non trouvé.')
            setPinProcessing(false)
          }
        }, 300)
      }
    }
  }, [pinStep, currentPin, newPin, confirmPin, merchantPhone, toast, resetPinState])

  const handlePinDelete = useCallback(() => {
    setPinError('')
    if (pinStep === 'current') setCurrentPin((p) => p.slice(0, -1))
    else if (pinStep === 'new') setNewPin((p) => p.slice(0, -1))
    else setConfirmPin((p) => p.slice(0, -1))
  }, [pinStep])

  const currentPinLen = pinLengthFor(pinStep, currentPin, newPin, confirmPin)

  const pinStepTitle = pinStepTitleFor(pinStep)


  // ─── Auto-lock state ───────────────────────────────────────────────────────
  const [tempAutoLock, setTempAutoLock] = useState(String(autoLockMinutes))

  const handleAutoLockSave = () => {
    setAutoLockMinutes(Number(tempAutoLock))
    setShowAutoLockSheet(false)
    toast({ title: 'Verrouillage automatique mis à jour' })
  }

  // ─── Zone state ────────────────────────────────────────────────────────────
  const [tempZone, setTempZone] = useState(agentZone)
  const [tempMarche, setTempMarche] = useState(agentMarche)

  const handleZoneSave = () => {
    if (!tempZone) {
      toast({ title: 'Veuillez sélectionner une zone', variant: 'destructive' })
      return
    }
    setAgentZone(tempZone)
    setAgentMarche(tempMarche)
    setShowZoneSheet(false)
    toast({ title: 'Affectation mise à jour' })
  }

  // ─── Target state ────────────────────────────────────────────────────────────
  // Règle produit : l'objectif mensuel est fixé par le back-office
  // (Objectifs), l'agent ne peut plus l'éditer lui-même. Affichage lecture
  // seule ; on rafraîchit la cible au montage (boucle BO -> terrain).
  useEffect(() => {
    if (!merchantId) return
    fetchMissionFromServer(merchantId)
     
  }, [merchantId])


  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = () => {
    cleanupIdentData()
    logout()
  }

  const handleDeleteAccount = () => {
    cleanupAllData()
    logout()
    setShowDeleteModal(false)
  }

  return (
    <div className={cn('screen-enter min-h-full pb-[calc(6rem+env(safe-area-inset-bottom))]', identDarkMode ? 'bg-stone-950' : 'bg-[#FAFAF7]')}>
      {/* ─── Top bar — même bannière brune que le suivi ─────────────────── */}
      <div
        className="rounded-b-[20px] px-4 py-3.5 text-white"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <span className="text-[15px] font-bold">Mon profil</span>
      </div>

      <ProfilIdentity
        merchantName={merchantName}
        initials={initials}
        maskedPhone={maskedPhone}
        agentCode={agentCode}
        identDarkMode={identDarkMode}
        textClass={textClass}
        mutedTextClass={mutedTextClass}
        cardClass={cardClass}
        soleilMode={soleilMode}
        agentZone={agentZone}
        agentMarche={agentMarche}
        truncatedId={truncatedId}
        memberSince={memberSince}
      />

      {/* ─── PARAMÈTRES section ───────────────────────────────────────────── */}
      <div className="px-4 mt-6">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#9F8170]">
          PARAMÈTRES
        </h2>
        <Card className={cardClass}>
          <CardContent className="p-4 space-y-1">
            {/* Mode Soleil is a marchand-only concept (surfaces-marchand.md) —
                no toggle for it here. */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Moon className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Mode sombre</span>
              </div>
              <Switch checked={identDarkMode} onCheckedChange={toggleIdentDarkMode} />
            </div>
            <Separator className="my-1" />
            {/* Screen sensitive */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Smartphone className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Écran sensible</span>
              </div>
              <Switch checked={screenSensitive} onCheckedChange={toggleScreenSensitive} />
            </div>
            <Separator className="my-1" />
            {/* Notifications système — the only mutable category outside
                marchand (which also has 'tontines'); covers sync-conflict
                alerts and admin announcements. */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Bell className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Notifications système</span>
              </div>
              <Switch checked={systemeNotif} onCheckedChange={toggleSystemeNotif} />
            </div>
            <Separator className="my-1" />
            {/* Centre de notifications (panneau complet) */}
            <button
              type="button"
              className="w-full flex items-center justify-between py-2.5"
              onClick={() => setShowNotifications(true)}
            >
              <div className="flex items-center gap-2.5">
                <Bell className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Centre de notifications</span>
              </div>
              <ChevronRight className={cn('w-4 h-4', mutedTextClass)} />
            </button>
            <Separator className="my-1" />
            {/* Zone assignment — clickable */}
            <button
              type="button"
              className="w-full flex items-center justify-between py-2.5"
              onClick={() => { setTempZone(agentZone); setTempMarche(agentMarche); setShowZoneSheet(true) }}
            >
              <div className="flex items-center gap-2.5">
                <MapPin className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Affectation zone</span>
              </div>
              <span className={cn('text-sm font-medium', mutedTextClass, textClass, soleilMode && 'text-base')}>
                {agentZone}
              </span>
            </button>
            <Separator className="my-1" />
            {/* Objectif mensuel — lecture seule (fixé par le back-office) */}
            <div className="w-full flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Target className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Objectif mensuel</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {mission ? 'Fixé par le BO' : 'Aucun objectif défini'}
                </span>
                <span className={cn('text-sm font-bold', textClass, soleilMode && 'text-base')} style={{ color: IDENT_COLOR }}>
                  {mission ? mission.target : '—'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── SÉCURITÉ section ─────────────────────────────────────────────── */}
      <div className="px-4 mt-6">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#9F8170]">
          SÉCURITÉ
        </h2>
        <Card className={cardClass}>
          <CardContent className="p-4 space-y-1">
            {/* Change PIN */}
            <div className="py-2.5">
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between px-0 h-auto hover:bg-transparent"
                onClick={() => { resetPinState(); setShowPinSheet(true) }}
              >
                <div className="flex items-center gap-2.5">
                  <Fingerprint className={cn('w-4 h-4', mutedTextClass)} />
                  <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Changer mon code PIN</span>
                </div>
              </Button>
            </div>
            <Separator className="my-1" />
            {/* Auto lock — clickable */}
            <button
              type="button"
              className="w-full flex items-center justify-between py-2.5"
              onClick={() => { setTempAutoLock(String(autoLockMinutes)); setShowAutoLockSheet(true) }}
            >
              <div className="flex items-center gap-2.5">
                <Lock className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Verrouillage automatique</span>
              </div>
              <span className={cn('text-sm', mutedTextClass, soleilMode && 'text-base')}>
                {autoLockLabel}
              </span>
            </button>
            <Separator className="my-1" />
            {/* Screenshot blocked — Switch */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Shield className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Capture écran bloquée</span>
              </div>
              <Switch checked={screenshotBlocked} onCheckedChange={toggleScreenshotBlocked} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── À PROPOS section ─────────────────────────────────────────────── */}
      <div className="px-4 mt-6">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#9F8170]">
          À PROPOS
        </h2>
        <Card className={cardClass}>
          <CardContent className="p-4 space-y-1">
            {/* Version */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Info className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Version</span>
              </div>
              <span className={cn('text-xs', mutedTextClass, soleilMode && 'text-sm')}>
                Jùlaba Identificateur v1.0
              </span>
            </div>
            <Separator className="my-1" />
            {/* Academy */}
            <div className="py-2.5">
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between px-0 h-auto hover:bg-transparent"
                onClick={() => setShowAcademySheet(true)}
              >
                <div className="flex items-center gap-2.5">
                  <GraduationCap className={cn('w-4 h-4', mutedTextClass)} />
                  <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Academy</span>
                </div>
              </Button>
            </div>
            <Separator className="my-1" />
            {/* Support */}
            <div className="py-2.5">
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between px-0 h-auto hover:bg-transparent"
                onClick={() => setShowSupportSheet(true)}
              >
                <div className="flex items-center gap-2.5">
                  <Headphones className={cn('w-4 h-4', mutedTextClass)} />
                  <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Support</span>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Sheets ───────────────────────────────────────────────────── */}

      <ProfilPinSheet
        showPinSheet={showPinSheet}
        resetPinState={resetPinState}
        setShowPinSheet={setShowPinSheet}
        pinStep={pinStep}
        pinStepTitle={pinStepTitle}
        currentPinLen={currentPinLen}
        pinError={pinError}
        pinProcessing={pinProcessing}
        handlePinDigit={handlePinDigit}
        handlePinDelete={handlePinDelete}
        textClass={textClass}
      />
      <ProfilSheets
        showAutoLockSheet={showAutoLockSheet}
        setShowAutoLockSheet={setShowAutoLockSheet}
        tempAutoLock={tempAutoLock}
        setTempAutoLock={setTempAutoLock}
        handleAutoLockSave={handleAutoLockSave}
        showZoneSheet={showZoneSheet}
        setShowZoneSheet={setShowZoneSheet}
        tempZone={tempZone}
        setTempZone={setTempZone}
        tempMarche={tempMarche}
        setTempMarche={setTempMarche}
        handleZoneSave={handleZoneSave}
        showAcademySheet={showAcademySheet}
        setShowAcademySheet={setShowAcademySheet}
        showSupportSheet={showSupportSheet}
        setShowSupportSheet={setShowSupportSheet}
        textClass={textClass}
        identDarkMode={identDarkMode}
        soleilMode={soleilMode}
      />
      <ProfilConfirmDialogs
        showLogoutModal={showLogoutModal}
        setShowLogoutModal={setShowLogoutModal}
        handleLogout={handleLogout}
        showDeleteModal={showDeleteModal}
        setShowDeleteModal={setShowDeleteModal}
        handleDeleteAccount={handleDeleteAccount}
      />

      <ActorProfileFooter accentColor={IDENT_COLOR} onSupport={() => setShowSupportSheet(true)} />

      <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} accentColor={IDENT_COLOR} soleilMode={soleilMode} />
    </div>
  )
}
