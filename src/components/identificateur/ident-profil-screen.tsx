'use client'

import { useMemo, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@/components/ui/collapsible'
import { useToast } from '@/hooks/use-toast'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, User, MapPin, Store, Shield, Moon, Delete,
  ClipboardList, Camera, FileEdit,
  GraduationCap, Headphones, LogOut, Target,
  Lock, Smartphone, Fingerprint, Info, Trash2, TriangleAlert,
  Minus, Plus, ChevronDown, Phone, Mail, CheckCircle2, Bell,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, ZONES } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'
import { cleanupIdentData, cleanupAllData } from '@/lib/cleanup'
import { getSimpleNotifPrefs, setSimpleNotifPrefs } from '@/lib/notification-preferences'

const IDENT_COLOR = '#9F8170'

// ─── Helpers (copied from auth screen) ───────────────────────────────────────

const simpleHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}

const normalizePhone = (phone: string) =>
  phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')

interface AgentData {
  id: string
  firstName: string
  phone: string
  pinHash: string
}

const loadAgent = (phone: string): AgentData | null => {
  void phone
  return null
}

import { savePinHash, getPinHash } from '@/lib/secure-storage'

const saveAgent = async (data: AgentData) => {
  const normalized = normalizePhone(data.phone)
  const { pinHash } = data
  if (pinHash) await savePinHash(`ident-pin-${normalized}`, pinHash).catch(() => {})
}
const loadAgentPinHash = async (phone: string): Promise<string | null> => {
  const normalized = normalizePhone(phone)
  const secure = await getPinHash(`ident-pin-${normalized}`).catch(() => null)
  if (secure) return secure
  return null
}

// ─── Info row component ──────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, soleilMode: sm, darkMode }: { icon: typeof User; label: string; value: string; soleilMode: boolean; darkMode: boolean }) {
  const textCls = darkMode ? 'text-stone-100' : sm ? 'text-black' : ''
  const mutedCls = darkMode ? 'text-stone-400' : 'text-muted-foreground'
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <Icon className={cn('w-4 h-4', mutedCls)} />
        <span className={cn('text-sm', textCls, sm && 'text-base')}>{label}</span>
      </div>
      <span className={cn('text-sm font-medium', mutedCls, textCls, sm && 'text-base')}>
        {value}
      </span>
    </div>
  )
}

// ─── PIN Numpad (used in change PIN sheet) ───────────────────────────────────

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

type PinStep = 'current' | 'new' | 'confirm'

function PinDots({ length }: { length: number }) {
  return (
    <div className="flex justify-center gap-4 mb-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-4 h-4 rounded-full border-2 transition-all duration-150',
            i < length
              ? 'border-[#9F8170] bg-[#9F8170]'
              : 'border-[#9F8170]/40 bg-transparent',
          )}
        />
      ))}
    </div>
  )
}

function PinNumpad({ onDigit, onDelete, disabled }: { onDigit: (d: string) => void; onDelete: () => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-4">
      {NUMPAD_KEYS.map((key) => {
        if (key === '') return <div key="empty" />
        if (key === 'del') {
          return (
            <button
              key="del"
              type="button"
              onClick={onDelete}
              disabled={disabled}
              className="h-14 rounded-xl bg-muted text-muted-foreground font-medium text-lg active:scale-95 transition-transform disabled:opacity-40"
            >
              <Delete className="mx-auto size-5" aria-hidden="true" />
            </button>
          )
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => onDigit(key)}
            disabled={disabled}
            className="h-14 rounded-xl bg-white border border-border text-lg font-semibold active:scale-95 transition-transform hover:bg-muted/50 disabled:opacity-40"
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}

// ─── FAQ Item (to avoid useState inside map) ───────────────────────────────────

function FaqItem({ faq, textClass, soleilMode: sm }: { faq: { question: string; answer: string }; textClass: string; soleilMode: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-xl border border-border text-left hover:bg-muted/30 transition-colors">
        <span className={cn('text-sm font-medium pr-2', textClass, sm && 'text-base')}>{faq.question}</span>
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground shrink-0 transition-transform',
          open && 'rotate-180',
        )} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-1">
          <p className={cn('text-xs text-muted-foreground leading-relaxed', sm && 'text-sm')}>
            {faq.answer}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function IdentProfilScreen() {
  const { goBack, soleilMode, merchantName, merchantPhone, merchantId, logout } = useAppStore()
  const {
    agentZone, agentMarche, mission, screenSensitive, toggleScreenSensitive, identDarkMode, toggleIdentDarkMode,
    autoLockMinutes, setAutoLockMinutes,
    screenshotBlocked, toggleScreenshotBlocked,
    setAgentZone, setAgentMarche, setMission,
    dossiers,
  } = useIdentificateurStore()
  const { toast } = useToast()

  const [systemeNotif, setSystemeNotif] = useState(() => getSimpleNotifPrefs('identificateur').systeme)
  const toggleSystemeNotif = (checked: boolean) => {
    setSystemeNotif(checked)
    setSimpleNotifPrefs('identificateur', { systeme: checked })
  }

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedTextClass = identDarkMode ? 'text-stone-400' : 'text-muted-foreground'
  const headingClass = soleilMode ? 'text-lg' : 'text-base'
  const cardClass = identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-100' : ''

  // Mask phone if screen sensitive
  const maskedPhone = useMemo(() => {
    if (!screenSensitive || !merchantPhone) return merchantPhone || '—'
    if (merchantPhone.length <= 4) return merchantPhone
    return merchantPhone.slice(0, 3) + '****' + merchantPhone.slice(-2)
  }, [merchantPhone, screenSensitive])

  // Initials
  const initials = useMemo(() => {
    if (!merchantName) return '??'
    const parts = merchantName.trim().split(/\s+/)
    const first = parts[0]?.charAt(0)?.toUpperCase() || ''
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : ''
    return first + last || '??'
  }, [merchantName])

  // Truncated merchant ID
  const truncatedId = useMemo(() => {
    if (!merchantId) return '—'
    if (merchantId.length <= 12) return merchantId
    return merchantId.slice(0, 6) + '...' + merchantId.slice(-4)
  }, [merchantId])

  // Member since
  const memberSince = useMemo(() => {
    if (dossiers.length === 0) return "Aujourd'hui"
    const sorted = [...dossiers].sort((a, b) => a.createdAt - b.createdAt)
    return new Date(sorted[0].createdAt).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }, [dossiers])

  // Auto-lock display value
  const autoLockLabel = useMemo(() => {
    if (autoLockMinutes === 0) return 'Désactivé'
    return `${autoLockMinutes} min`
  }, [autoLockMinutes])

  // ─── Modal states ──────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  // ─── Sheet states ──────────────────────────────────────────────────────────
  const [showPinSheet, setShowPinSheet] = useState(false)
  const [showAutoLockSheet, setShowAutoLockSheet] = useState(false)
  const [showZoneSheet, setShowZoneSheet] = useState(false)
  const [showTargetSheet, setShowTargetSheet] = useState(false)
  const [showAcademySheet, setShowAcademySheet] = useState(false)
  const [showSupportSheet, setShowSupportSheet] = useState(false)

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

  const currentPinLen = pinStep === 'current' ? currentPin.length : pinStep === 'new' ? newPin.length : confirmPin.length

  const pinStepTitle = pinStep === 'current'
    ? 'Entrez votre code actuel'
    : pinStep === 'new'
      ? 'Entrez le nouveau code'
      : 'Confirmez le nouveau code'

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

  // ─── Target state ──────────────────────────────────────────────────────────
  const [tempTarget, setTempTarget] = useState(mission.target)

  const handleTargetSave = () => {
    setMission({ ...mission, target: tempTarget })
    setShowTargetSheet(false)
    toast({ title: 'Objectif mensuel mis à jour' })
  }

  // ─── Academy data ──────────────────────────────────────────────────────────
  const academyCards = [
    {
      icon: ClipboardList,
      title: 'Comment identifier un acteur',
      description: '1. Demandez le nom complet et le numéro de téléphone. 2. Prenez une photo claire du visage. 3. Complétez les informations sur l\'activité. 4. Vérifiez et soumettez le dossier.',
    },
    {
      icon: Camera,
      title: 'Photographie professionnelle',
      description: 'Assurez-vous que le visage est bien éclairé et centré. Évitez les ombres et les arrière-plans chargés. Prenez la photo de face, à hauteur des yeux.',
    },
    {
      icon: FileEdit,
      title: 'Gérer les brouillons',
      description: 'Les dossiers incomplets sont sauvegardés automatiquement en brouillon. Retrouvez-les dans l\'onglet « Brouillons » et complétez-les à tout moment.',
    },
    {
      icon: CheckCircle2,
      title: 'Bonnes pratiques',
      description: 'Identifiez chaque acteur avec précision. Ne créez jamais de doublons. Vérifiez les informations avant de soumettre. Respectez la confidentialité des données.',
    },
  ]

  // ─── Support FAQ data ─────────────────────────────────────────────────────
  const faqItems = [
    {
      question: 'Comment réinitialiser mon code PIN ?',
      answer: 'Allez dans Mon Profil > Changer mon code PIN. Vous devrez saisir votre code actuel, puis définir un nouveau code à 4 chiffres.',
    },
    {
      question: 'Mes dossiers ne s\'envoient pas',
      answer: 'Vérifiez votre connexion internet. Les dossiers sont d\'abord sauvegardés localement en tant que brouillons. Ils seront envoyés automatiquement lorsque la connexion sera rétablie.',
    },
    {
      question: 'Comment changer de zone ?',
      answer: 'Allez dans Mon Profil > Paramètres > Affectation zone. Sélectionnez votre nouvelle zone et le marché correspondant, puis enregistrez.',
    },
    {
      question: 'Puis-je utiliser l\'application hors ligne ?',
      answer: 'Oui, tous vos dossiers sont sauvegardés localement sur votre appareil. Vous pouvez continuer à identifier des acteurs même sans connexion internet.',
    },
  ]

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
      {/* ─── Top bar ──────────────────────────────────────────────────────── */}
      <div
        className="px-4 py-3 flex items-center gap-3 rounded-b-2xl"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <span className="text-white font-bold text-sm tracking-wider">MON PROFIL</span>
      </div>

      {/* ─── Profile header ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center mt-6 mb-2 px-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-3"
          style={{ backgroundColor: IDENT_COLOR }}
        >
          {initials}
        </div>
        <p className={cn('font-bold text-lg', textClass, soleilMode && 'text-xl')}>
          {merchantName || 'Agent'}
        </p>
        <p className={cn('text-sm mt-0.5', mutedTextClass, soleilMode && 'text-base')}>
          <Phone className="mr-1 inline size-3.5" /> {maskedPhone}
        </p>
      </div>

      {/* ─── Info cards ───────────────────────────────────────────────────── */}
      <div className="px-4 mt-4">
        <Card className={cardClass}>
          <CardContent className="p-4">
            <InfoRow icon={Shield} label="Agent ID" value={truncatedId} soleilMode={soleilMode} darkMode={identDarkMode} />
            <Separator className="my-1" />
            <InfoRow icon={MapPin} label="Zone" value={agentZone} soleilMode={soleilMode} darkMode={identDarkMode} />
            <Separator className="my-1" />
            <InfoRow icon={Store} label="Marché" value={agentMarche} soleilMode={soleilMode} darkMode={identDarkMode} />
            <Separator className="my-1" />
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <User className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Rôle</span>
              </div>
              <Badge style={{ backgroundColor: IDENT_COLOR, color: 'white' }}>
                Identificateur
              </Badge>
            </div>
            <Separator className="my-1" />
            <InfoRow icon={Info} label="Membre depuis" value={memberSince} soleilMode={soleilMode} darkMode={identDarkMode} />
          </CardContent>
        </Card>
      </div>

      {/* ─── PARAMÈTRES section ───────────────────────────────────────────── */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
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
            {/* Objectif mensuel — clickable */}
            <button
              type="button"
              className="w-full flex items-center justify-between py-2.5"
              onClick={() => { setTempTarget(mission.target); setShowTargetSheet(true) }}
            >
              <div className="flex items-center gap-2.5">
                <Target className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Objectif mensuel</span>
              </div>
              <span className={cn('text-sm font-bold', textClass, soleilMode && 'text-base')} style={{ color: IDENT_COLOR }}>
                {mission.target}
              </span>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* ─── SÉCURITÉ section ─────────────────────────────────────────────── */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
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
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
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

      {/* ─── Deconnexion & Suppression ─────────────────────────────────────── */}
      <div className="px-4 mt-8 space-y-3 mb-4">
        <Button
          className="w-full h-12 font-semibold gap-2"
          variant="outline"
          style={{ borderColor: '#dc2626', color: '#dc2626' }}
          onClick={() => setShowLogoutModal(true)}
        >
          <LogOut className="w-4 h-4" />
          DÉCONNEXION
        </Button>
        <Button
          className="w-full h-12 font-semibold gap-2"
          variant="outline"
          style={{ borderColor: '#dc2626', color: '#dc2626' }}
          onClick={() => setShowDeleteModal(true)}
        >
          <Trash2 className="w-4 h-4" />
          SUPPRIMER MON COMPTE
        </Button>
      </div>

      {/* ─── Sheets ───────────────────────────────────────────────────── */}

      {/* ─── 1. Sheet: Changer mon code PIN ───────────────────────────────── */}
      <Sheet open={showPinSheet} onOpenChange={(open) => { if (!open) { resetPinState(); setShowPinSheet(false) } }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-center items-center">
            <SheetTitle className={cn(textClass)}>{pinStepTitle}</SheetTitle>
            <SheetDescription>
              {pinStep === 'current' && 'Saisissez votre code PIN actuel à 4 chiffres'}
              {pinStep === 'new' && 'Choisissez un nouveau code à 4 chiffres'}
              {pinStep === 'confirm' && 'Resaisissez le nouveau code pour confirmer'}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-4">
              {(['current', 'new', 'confirm'] as const).map((step, idx) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                      pinStep === step
                        ? 'text-white'
                        : idx < ['current', 'new', 'confirm'].indexOf(pinStep)
                          ? 'bg-green-100 text-green-700'
                          : 'bg-muted text-muted-foreground',
                    )}
                    style={pinStep === step ? { backgroundColor: IDENT_COLOR } : undefined}
                  >
                    {idx < ['current', 'new', 'confirm'].indexOf(pinStep) ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  {idx < 2 && (
                    <div className={cn(
                      'w-8 h-0.5',
                      idx < ['current', 'new', 'confirm'].indexOf(pinStep) ? 'bg-green-300' : 'bg-muted',
                    )} />
                  )}
                </div>
              ))}
            </div>

            <PinDots length={currentPinLen} />

            {pinError && (
              <p className="text-red-500 text-xs text-center mb-2 flex items-center justify-center gap-1">
                <Info className="w-3 h-3" /> {pinError}
              </p>
            )}

            {pinProcessing && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="w-5 h-5 border-2 border-[#9F8170] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Enregistrement...</span>
              </div>
            )}

            <PinNumpad onDigit={handlePinDigit} onDelete={handlePinDelete} disabled={pinProcessing} />
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── 2. Sheet: Verrouillage automatique ───────────────────────────── */}
      <Sheet open={showAutoLockSheet} onOpenChange={setShowAutoLockSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}>Verrouillage automatique</SheetTitle>
            <SheetDescription>Choisissez après combien de temps l\'application se verrouille.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <RadioGroup
              value={tempAutoLock}
              onValueChange={setTempAutoLock}
              className="space-y-3"
            >
              {[
                { value: '5', label: '5 min' },
                { value: '10', label: '10 min' },
                { value: '15', label: '15 min' },
                { value: '30', label: '30 min' },
                { value: '0', label: 'Désactivé' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                    tempAutoLock === opt.value ? 'border-[#9F8170] bg-[#9F8170]/5' : 'border-border',
                  )}
                >
                  <RadioGroupItem value={opt.value} />
                  <span className={cn('text-sm font-medium', textClass, soleilMode && 'text-base')}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </RadioGroup>
            <SheetFooter className="pt-4">
              <Button
                className="w-full text-white font-semibold"
                style={{ backgroundColor: IDENT_COLOR }}
                onClick={handleAutoLockSave}
              >
                Enregistrer
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── 3. Sheet: Affectation zone ───────────────────────────────────── */}
      <Sheet open={showZoneSheet} onOpenChange={setShowZoneSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}>Affectation zone</SheetTitle>
            <SheetDescription>Modifiez votre zone et votre marché d\'affectation.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <Label className={cn(textClass)}>Zone</Label>
              <Select value={tempZone} onValueChange={setTempZone}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionnez une zone" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {ZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className={cn(textClass)}>Marché</Label>
              <Input
                value={tempMarche}
                onChange={(e) => setTempMarche(e.target.value)}
                placeholder="Nom du marché"
                className={cn(textClass)}
              />
            </div>
            <SheetFooter>
              <Button
                className="w-full text-white font-semibold"
                style={{ backgroundColor: IDENT_COLOR }}
                onClick={handleZoneSave}
              >
                Enregistrer
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── 4. Sheet: Objectif mensuel ───────────────────────────────────── */}
      <Sheet open={showTargetSheet} onOpenChange={setShowTargetSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}>Objectif mensuel</SheetTitle>
            <SheetDescription>Définissez votre nombre cible d\'identifications pour ce mois.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-4">
            {/* Stepper */}
            <div className="flex items-center justify-center gap-6">
              <button
                type="button"
                className="w-12 h-12 rounded-xl border border-border flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all disabled:opacity-30"
                onClick={() => setTempTarget((t) => Math.max(10, t - 10))}
                disabled={tempTarget <= 10}
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className="text-center min-w-[100px]">
                <p className={cn('text-3xl font-bold', textClass)} style={{ color: IDENT_COLOR }}>
                  {tempTarget}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">identifications</p>
              </div>
              <button
                type="button"
                className="w-12 h-12 rounded-xl border border-border flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all disabled:opacity-30"
                onClick={() => setTempTarget((t) => Math.min(9999, t + 10))}
                disabled={tempTarget >= 9999}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {/* Quick values */}
            <div className="flex flex-wrap gap-2 justify-center">
              {[100, 200, 300, 500, 750, 1000].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                    tempTarget === val
                      ? 'border-[#9F8170] text-white'
                      : 'border-border text-muted-foreground hover:border-[#9F8170]/50',
                  )}
                  style={tempTarget === val ? { backgroundColor: IDENT_COLOR } : undefined}
                  onClick={() => setTempTarget(val)}
                >
                  {val}
                </button>
              ))}
            </div>
            <SheetFooter>
              <Button
                className="w-full text-white font-semibold"
                style={{ backgroundColor: IDENT_COLOR }}
                onClick={handleTargetSave}
              >
                Enregistrer
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── 6. Sheet: Academy ────────────────────────────────────────────── */}
      <Sheet open={showAcademySheet} onOpenChange={setShowAcademySheet}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}><GraduationCap className="mr-2 inline size-5" /> Academy</SheetTitle>
            <SheetDescription>Guides et conseils pour améliorer vos identifications sur le terrain.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-3">
            {academyCards.map((card, idx) => (
              <Card key={idx} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <card.icon className="mt-0.5 size-6 shrink-0 text-[#9F8170]" />
                    <div>
                      <h3 className={cn('font-semibold text-sm mb-1.5', textClass)}>{card.title}</h3>
                      <p className={cn('text-xs text-muted-foreground leading-relaxed', soleilMode && 'text-sm')}>
                        {card.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── 7. Sheet: Support ────────────────────────────────────────────── */}
      <Sheet open={showSupportSheet} onOpenChange={setShowSupportSheet}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}>Support</SheetTitle>
            <SheetDescription>Contactez-nous ou consultez la FAQ.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {/* Contact info */}
            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>+225 07 00 00 00 00</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>support@julaba.ci</span>
              </div>
            </div>

            <h3 className={cn('font-semibold text-sm mb-3', textClass)}>Questions fréquentes</h3>

            {/* FAQ */}
            <div className="space-y-2">
              {faqItems.map((faq, idx) => (
                <FaqItem key={idx} faq={faq} textClass={textClass} soleilMode={soleilMode} />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Existing modals (logout & delete) ─────────────────────────── */}

      {/* Modale de déconnexion */}
      <AlertDialog open={showLogoutModal} onOpenChange={setShowLogoutModal}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader className="items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
              style={{ backgroundColor: '#dc262615' }}
            >
              <LogOut className="w-7 h-7 text-red-600" />
            </div>
            <AlertDialogTitle className="text-base">Se déconnecter ?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Vous pouvez vous reconnecter à tout moment avec votre numéro et votre code secret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: '#dc2626' }}
              onClick={() => { setShowLogoutModal(false); handleLogout() }}
            >
              Se déconnecter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modale de suppression de compte */}
      <AlertDialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader className="items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
              style={{ backgroundColor: '#dc262615' }}
            >
              <TriangleAlert className="w-7 h-7 text-red-600" />
            </div>
            <AlertDialogTitle className="text-base">Supprimer le compte ?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Cette action est <strong>irréversible</strong>. Toutes vos données seront définitivement supprimées, y compris vos dossiers enregistrés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: '#dc2626' }}
              onClick={handleDeleteAccount}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
