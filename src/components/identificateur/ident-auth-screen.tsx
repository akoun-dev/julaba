'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Phone, Lock, IdCard, Shield, Info, CheckCircle2, Delete } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { claimDeviceSession, claimDeviceSessionWithCode } from '@/lib/claim-device-session'
import { normalizeAgentPhone } from '@/lib/agent-code'
import { cn } from '@/lib/utils'
import Image from 'next/image'

const IDENT_COLOR = '#9F8170'

// Flux d'authentification identificateur — les comptes sont créés
// UNIQUEMENT par le back-office (nom, prénom, téléphone, email, code agent
// unique). L'app n'a plus d'auto-inscription : elle vérifie le numéro ou le
// code agent auprès du serveur, puis l'agent utilise un code PIN local.
// MODE-937 (S-04) : la liaison de l'appareil exige un CODE DE LIAISON
// one-shot « ABCD-EFGH » (émis 30 j par le back-office) — l'étape
// 'claim-code' collecte ce code au premier lien, puis à chaque re-liaison.
type AuthStep = 'phone' | 'pin' | 'confirm' | 'login-pin' | 'claim-code'

interface AgentData {
  id: string
  firstName: string
  phone: string
  agentCode?: string
  zone?: string
  pinHash?: string
}

interface LookupResult {
  id: string
  name: string
  firstName?: string
  lastName?: string
  agentCode?: string
  zone?: string
}

const simpleHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}

const AGENT_NAMESPACE = 'julaba-ident-agent'

const normalizeInput = (value: string) => value.replace(/\s+/g, ' ').trim()

/** 10 chiffres (indicatif +225 toléré) => numéro de téléphone. */
const isPhoneInput = (value: string) => /^\d{10}$/.test(normalizeAgentPhone(value))

/** Format code agent : JID-0001 (préfixe 2-4 lettres, insensible à la casse). */
const isAgentCodeInput = (value: string) => /^[a-z]{2,4}-\d{3,6}$/i.test(normalizeInput(value))

const loadAgentByPhone = (phone: string): AgentData | null => {
  const key = `${AGENT_NAMESPACE}-${normalizeAgentPhone(phone)}`
  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key)
    if (raw) return JSON.parse(raw) as AgentData
  } catch {}
  return null
}

// Connexion par code agent hors-ligne : le cache local est indexé par
// téléphone, on balaie donc les entrées du namespace pour retrouver le
// compte correspondant au code saisi.
const loadAgentByCode = (code: string): AgentData | null => {
  const needle = normalizeInput(code).toUpperCase()
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (!key || !key.startsWith(AGENT_NAMESPACE)) continue
        try {
          const agent = JSON.parse(storage.getItem(key) || '') as AgentData
          if (agent.agentCode && agent.agentCode.toUpperCase() === needle) return agent
        } catch {}
      }
    } catch {}
  }
  return null
}

import { savePinHash, getPinHash } from '@/lib/secure-storage'

const saveAgent = async (data: AgentData) => {
  const normalized = normalizeAgentPhone(data.phone)
  const { pinHash } = data
  if (pinHash) await savePinHash(`ident-pin-${normalized}`, pinHash).catch(() => {})
  const key = `${AGENT_NAMESPACE}-${normalized}`
  try { sessionStorage.setItem(key, JSON.stringify(data)) } catch {
    try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
  }
}

const loadAgentPinHash = async (phone: string): Promise<string | null> => {
  const normalized = normalizeAgentPhone(phone)
  const secure = await getPinHash(`ident-pin-${normalized}`).catch(() => null)
  if (secure) return secure
  return null
}

export function IdentAuthScreen() {
  const { setUserRole, setAuth, navigate, soleilMode } = useAppStore()
  const setAgentZone = useIdentificateurStore((state) => state.setAgentZone)
  const setAgentCode = useIdentificateurStore((state) => state.setAgentCode)
  const identDarkMode = useIdentificateurStore((state) => state.identDarkMode)

  const [step, setStep] = useState<AuthStep>('phone')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pinDisplay, setPinDisplay] = useState<string[]>([])
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'login' | 'first-login' | null>(null)
  const [pendingAuthData, setPendingAuthData] = useState<{ id: string; name: string; phone: string } | null>(null)
  // MODE-937 — étape code de liaison : saisie « ABCD-EFGH » pour lier cet
  // appareil au compte (première fois ou changement d'appareil).
  const [claimCode, setClaimCode] = useState('')
  const [claimProcessing, setClaimProcessing] = useState(false)

  // Compte vérifié (serveur ou cache local) pour la saisie en cours —
  // jamais de création de compte à ce niveau.
  const verifiedAgentRef = useRef<AgentData | null>(null)
  const pinRef = useRef(pin)
  const stepRef = useRef(step)
  pinRef.current = pin
  stepRef.current = step

  // Palette identificateur : beige #FAFAF7 en clair, stone en sombre —
  // exactement la même base que les vues du menu (missions, suivi, accueil).
  const dark = identDarkMode && !soleilMode
  const textClass = dark ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedClass = dark ? 'text-stone-400' : 'text-[#78716C]'
  const cardClass = dark ? 'border border-stone-700 bg-stone-900' : 'border border-[#E7E0D8] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
  const headingClass = soleilMode ? 'text-xl' : 'text-lg'

  const goBackToMarchand = () => {
    setUserRole('marchand')
    navigate('auth')
  }

  const handlePhoneSubmit = async () => {
    setError('')
    const raw = normalizeInput(phone)
    const digits = normalizeAgentPhone(raw)
    if (!isPhoneInput(raw) && !isAgentCodeInput(raw)) {
      setError('Numéro invalide (ex: 05 55 55 55 55) ou code agent (ex: JID-0001)')
      return
    }

    setIsProcessing(true)
    let serverNotFound = false
    let serverUnavailable = false
    let resolved: AgentData | null = null

    try {
      // 1) Vérification du compte côté serveur (comptes créés par le
      //    back-office uniquement) — par numéro OU par code agent.
      try {
        const res = await fetch(`/api/identificateur/auth/lookup?query=${encodeURIComponent(raw)}`)
        if (res.ok) {
          const data = await res.json() as LookupResult & { found: boolean }
          if (data.found) {
            // AUDIT-005 : la réponse du lookup n'expose plus le téléphone
            // (donnée personnelle sur une route pré-auth). Connexion par
            // numéro : l'app vient de le saisir (digits). Par code agent :
            // on réutilise le téléphone du compte déjà caché sur cet
            // appareil s'il existe, sinon le code sert de clé locale — le
            // PIN créé reste lié à ce compte.
            const cachedByCode = isPhoneInput(raw) ? null : loadAgentByCode(raw)
            const localPhone = isPhoneInput(raw) ? digits : cachedByCode?.phone || raw
            const agent: AgentData = {
              id: data.id,
              firstName: data.firstName || data.name,
              phone: normalizeAgentPhone(localPhone),
              agentCode: data.agentCode,
              zone: data.zone || undefined,
            }
            await saveAgent(agent)
            resolved = agent
          } else {
            serverNotFound = true
          }
        } else {
          serverUnavailable = true
        }
      } catch {
        serverUnavailable = true
      }

      // 2) Compte vérifié en ligne
      if (resolved) {
        verifiedAgentRef.current = resolved
        if (resolved.zone) setAgentZone(resolved.zone)
        if (resolved.agentCode) setAgentCode(resolved.agentCode)
        const hasPin = Boolean(await loadAgentPinHash(resolved.phone))
        setStep(hasPin ? 'login-pin' : 'pin')
        return
      }

      // 3) Hors-ligne / serveur indisponible : seul un compte déjà utilisé
      //    sur cet appareil peut se reconnecter (PIN local).
      const cached = isPhoneInput(raw)
        ? loadAgentByPhone(digits || raw)
        : loadAgentByCode(raw)
      if (cached) {
        verifiedAgentRef.current = cached
        if (cached.zone) setAgentZone(cached.zone)
        if (cached.agentCode) setAgentCode(cached.agentCode)
        const hasPin = Boolean(await loadAgentPinHash(cached.phone))
        setStep(hasPin ? 'login-pin' : 'pin')
        return
      }

      if (serverNotFound) {
        setError('Aucun compte identificateur pour ce numéro. Il est créé par le back-office : contactez votre responsable.')
      } else if (serverUnavailable) {
        setError('Connexion au serveur impossible. Un premier accès nécessite le réseau.')
      } else {
        setError('Connexion impossible. Réessayez.')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePinDigit = (digit: string) => {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)
    pinRef.current = newPin
    setPinDisplay([...pinDisplay, '•'])
    if (newPin.length === 4) {
      setTimeout(() => {
        setStep('confirm')
      }, 200)
    }
  }

  const handleConfirmDigit = (digit: string) => {
    if (confirmPin.length >= 4) return
    const newConfirm = confirmPin + digit
    setConfirmPin(newConfirm)
    if (newConfirm.length === 4) {
      setTimeout(() => {
        if (newConfirm !== pinRef.current) {
          setError('Les codes ne correspondent pas')
          setConfirmPin('')
        } else {
          handlePinCreated()
        }
      }, 200)
    }
  }

  const handleLoginPinDigit = (digit: string) => {
    const currentPin = pinRef.current
    if (currentPin.length >= 4) return
    const newPin = currentPin + digit
    pinRef.current = newPin
    setPin(newPin)
    setPinDisplay(Array(newPin.length).fill('•'))
    if (newPin.length === 4) {
      setTimeout(() => {
        handleLogin()
      }, 200)
    }
  }

  const handleDelete = () => {
    if (step === 'confirm') {
      const newConfirm = confirmPin.slice(0, -1)
      setConfirmPin(newConfirm)
    } else {
      const newPin = pin.slice(0, -1)
      setPin(newPin)
      pinRef.current = newPin
      setPinDisplay(pinDisplay.slice(0, -1))
    }
  }

  const handleClear = () => {
    setPin('')
    pinRef.current = ''
    setPinDisplay([])
    setConfirmPin('')
    setError('')
  }

  // Première connexion sur un compte vérifié (back-office) : l'agent crée
  // son code PIN local. Aucun compte n'est créé ici — le roster est déjà
  // provisionné par le back-office.
  const handlePinCreated = async () => {
    const agent = verifiedAgentRef.current
    if (!agent) {
      setError('Session expirée. Ressaisissez votre numéro.')
      setStep('phone')
      return
    }
    setIsProcessing(true)
    setError('')
    try {
      const hash = simpleHash(pinRef.current)
      await saveAgent({ ...agent, pinHash: hash })
      setPendingAuthData({ id: agent.id, name: agent.firstName, phone: agent.phone })
      setConfirmAction('first-login')
      setShowConfirmModal(true)
    } catch {
      setError('Erreur lors de l\'enregistrement du code.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleLogin = async () => {
    const agent = verifiedAgentRef.current
    if (!agent) {
      setError('Session expirée. Ressaisissez votre numéro.')
      setStep('phone')
      return
    }
    setIsProcessing(true)
    setError('')
    try {
      const storedPinHash = await loadAgentPinHash(agent.phone)
      const hash = simpleHash(pinRef.current)
      if (!storedPinHash || hash !== storedPinHash) {
        setError('Code incorrect.')
        pinRef.current = ''
        setPin('')
        setPinDisplay([])
        return
      }
      setPendingAuthData({ id: agent.id, name: agent.firstName, phone: agent.phone })
      setConfirmAction('login')
      setShowConfirmModal(true)
    } catch {
      setError('Erreur de connexion.')
    } finally {
      setIsProcessing(false)
    }
  }

  const confirmConnection = async () => {
    if (!pendingAuthData) return
    setShowConfirmModal(false)
    setIsProcessing(true)
    // MODE-937 (S-04) : la liaison est un RENOUVELLEMENT si l'appareil est
    // déjà lié (cookie), sinon il faut un code de liaison — connaître l'id
    // ne suffit plus.
    const outcome = await claimDeviceSession('identificateur', pendingAuthData.id).catch(() => null)
    setIsProcessing(false)
    if (outcome?.ok || outcome?.queued) {
      setAuth(pendingAuthData.id, pendingAuthData.name, pendingAuthData.phone)
      return
    }
    if (outcome?.needsCode) {
      setError('')
      setClaimCode('')
      setStep('claim-code')
      return
    }
    setError("Liaison de l'appareil impossible pour le moment. Réessayez.")
    setStep('login-pin')
  }

  // Saisie du code de liaison one-shot (émis par le back-office, 30 j).
  const handleClaimCodeSubmit = async () => {
    if (!pendingAuthData) {
      setStep('phone')
      return
    }
    setClaimProcessing(true)
    setError('')
    const outcome = await claimDeviceSessionWithCode(claimCode).catch(() => null)
    setClaimProcessing(false)
    if (outcome?.ok || outcome?.queued) {
      setClaimCode('')
      setAuth(pendingAuthData.id, pendingAuthData.name, pendingAuthData.phone)
      return
    }
    setError('Code invalide, déjà utilisé ou expiré. Demandez un nouveau code au back-office.')
    setClaimCode('')
  }

  // Permet de corriger un numéro mal saisi depuis l'écran du code : retour à
  // l'étape téléphone avec réinitialisation de l'état transitoire.
  const goBackToPhone = () => {
    setError('')
    setPin('')
    pinRef.current = ''
    setPinDisplay([])
    setConfirmPin('')
    verifiedAgentRef.current = null
    setStep('phone')
  }

  const handleDemoLogin = () => {
    setPhone('05 55 55 55 55')
    setError('')
  }

  const numpadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  const renderNumpad = () => (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {numpadKeys.map((key) => {
        if (key === '') return <div key="empty" />
        if (key === 'del') {
          return (
            <button
              key="del"
              onClick={handleDelete}
              className={cn(
                'h-12 rounded-xl font-medium text-lg active:scale-95 transition-transform',
                dark ? 'bg-stone-800 text-stone-400 hover:bg-stone-700' : 'bg-[#F5F0EB] text-[#78716C] hover:bg-[#EDE5DC]',
              )}
            >
              <Delete className="mx-auto size-5" aria-hidden="true" />
            </button>
          )
        }
        const handlePress = () => {
          const currentStep = stepRef.current
          if (currentStep === 'confirm') {
            handleConfirmDigit(key)
          } else if (currentStep === 'login-pin') {
            handleLoginPinDigit(key)
          } else {
            handlePinDigit(key)
          }
        }
        return (
          <button
            key={key}
            onClick={handlePress}
            className={cn(
              'h-12 rounded-xl border font-semibold text-lg active:scale-95 transition-transform',
              dark ? 'border-stone-700 bg-stone-800 text-stone-100 hover:bg-stone-700' : 'border-[#E7E0D8] bg-white hover:bg-[#F5F0EB]',
            )}
          >
            {key}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className={cn('min-h-dvh flex flex-col bg-[#FAFAF7]', dark && 'bg-stone-950', soleilMode && !dark && 'text-black')}>
      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button
          onClick={goBackToMarchand}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
            dark ? 'bg-stone-800 hover:bg-stone-700' : 'bg-[#F5F0EB] hover:bg-[#EDE5DC]',
          )}
          aria-label="Retour"
        >
          <ArrowLeft className="w-5 h-5 text-[#9F8170]" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-6">
        {/* Logo and title */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/icon-only.png"
            alt="Jùlaba"
            width={72}
            height={72}
            className="mb-3"
          />
          <h1
            className={`font-bold text-[#9F8170] ${headingClass}`}
          >
            Jùlaba Identificateur
          </h1>
          <p className={cn('text-sm', mutedClass)}>
            Accès réservé aux agents enregistrés
          </p>
        </div>

        {/* Step: Phone / Agent code */}
        {step === 'phone' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={cardClass}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Phone className="w-5 h-5 text-[#9F8170]" />
                  <h2 className={`font-semibold ${textClass}`}>Numéro ou code agent</h2>
                </div>
                <div className="flex gap-2">
                  <div className={cn('flex items-center px-3 h-12 rounded-lg text-sm font-medium shrink-0', dark ? 'bg-stone-800 text-stone-400' : 'bg-[#F5F0EB] text-[#78716C]')}>
                    +225
                  </div>
                  <Input
                    type="tel"
                    placeholder="05 55 55 55 55 · JID-0001"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      setError('')
                    }}
                    className={`h-12 text-lg ${soleilMode ? 'text-xl' : ''}`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePhoneSubmit()
                    }}
                  />
                </div>
                <p className={cn('mt-3 flex items-start gap-1.5 text-xs', mutedClass)}>
                  <IdCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9F8170]" />
                  <span>
                    Les comptes identificateurs sont créés par le back-office
                    (nom, prénom, téléphone, email et code agent unique).
                    Connectez-vous avec votre numéro ou votre code agent.
                  </span>
                </p>
                {error && (
                  <p className="text-red-500 text-xs mt-2 flex items-start gap-1">
                    <Info className="mt-0.5 w-3 h-3 shrink-0" /> {error}
                  </p>
                )}
                <Button
                  className="w-full h-12 mt-4 text-white font-semibold"
                  style={{ backgroundColor: IDENT_COLOR }}
                  onClick={handlePhoneSubmit}
                  disabled={isProcessing}
                >
                  Continuer
                </Button>
              </CardContent>
            </Card>


          </div>
        )}

        {/* Step: PIN creation (first login on a backoffice-verified account) */}
        {(step === 'pin' || step === 'confirm') && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={cardClass}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-5 h-5 text-[#9F8170]" />
                  <h2 className={`font-semibold ${textClass}`}>
                    {step === 'pin' ? 'Créer votre code secret' : 'Confirmer votre code'}
                  </h2>
                </div>
                <p className={cn('text-xs mb-3', mutedClass)}>
                  {step === 'pin'
                    ? '4 chiffres pour sécuriser votre compte'
                    : 'Entrez le même code une 2ème fois'}
                </p>

                {/* PIN dots */}
                <div className="flex justify-center gap-3 mb-1">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const currentLen = step === 'confirm' ? confirmPin.length : pin.length
                    const filled = i < currentLen
                    return (
                      <div
                        key={i}
                        className={cn(
                          'w-4 h-4 rounded-full border-2 transition-all duration-150',
                          filled
                            ? 'bg-[#9F8170] border-[#9F8170]'
                            : 'border-[#9F8170]/40 bg-transparent'
                        )}
                      />
                    )
                  })}
                </div>

                {error && (
                  <p className="text-red-500 text-xs text-center mb-2 flex items-center justify-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={goBackToPhone}
                  className={cn('w-full flex items-center justify-center gap-1.5 text-xs font-medium underline underline-offset-2 transition-colors', mutedClass, 'hover:opacity-80')}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Ce n'est pas mon numéro
                </button>

                {step === 'pin' && (
                  <button
                    onClick={handleClear}
                    className={cn('text-xs text-center w-full mb-1', mutedClass)}
                  >
                    Effacer
                  </button>
                )}
              </CardContent>
            </Card>
            {renderNumpad()}
          </div>
        )}

        {/* Step: Login PIN */}
        {step === 'login-pin' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={cardClass}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-[#9F8170]" />
                  <h2 className={`font-semibold ${textClass}`}>Entrez votre code</h2>
                </div>
                <p className={cn('text-xs mb-3', mutedClass)}>
                  Bienvenue {verifiedAgentRef.current?.firstName ? `${verifiedAgentRef.current.firstName} !` : '!'} Entrez votre code secret.
                </p>

                {/* PIN dots */}
                <div className="flex justify-center gap-3 mb-1">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const filled = i < pin.length
                    return (
                      <div
                        key={i}
                        className={cn(
                          'w-4 h-4 rounded-full border-2 transition-all duration-150',
                          filled
                            ? 'bg-[#9F8170] border-[#9F8170]'
                            : 'border-[#9F8170]/40 bg-transparent'
                        )}
                      />
                    )
                  })}
                </div>

                {error && (
                  <p className="text-red-500 text-xs text-center mb-2 flex items-center justify-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={goBackToPhone}
                  className={cn('w-full flex items-center justify-center gap-1.5 text-xs font-medium underline underline-offset-2 transition-colors', mutedClass, 'hover:opacity-80')}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Ce n'est pas mon numéro
                </button>
              </CardContent>
            </Card>
            {renderNumpad()}
          </div>
        )}

        {/* Step: Liaison de l'appareil — code de liaison one-shot (MODE-937) */}
        {step === 'claim-code' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={cardClass}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-[#9F8170]" />
                  <h2 className={`font-semibold ${textClass}`}>Lier cet appareil</h2>
                </div>
                <p className={cn('text-xs mb-3', mutedClass)}>
                  Saisissez le code de liaison à 8 lettres fourni par le
                  back-office (format ABCD-EFGH). Il ne fonctionne qu'une
                  seule fois.
                </p>
                <Input
                  placeholder="ABCD-EFGH"
                  value={claimCode}
                  onChange={(e) => {
                    setClaimCode(e.target.value.toUpperCase())
                    setError('')
                  }}
                  className="h-12 text-center font-mono text-xl tracking-widest uppercase"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleClaimCodeSubmit()
                  }}
                />
                {error && (
                  <p className="text-red-500 text-xs text-center mt-3 mb-1 flex items-center justify-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}
                <Button
                  className="w-full h-12 mt-4 text-white font-semibold"
                  style={{ backgroundColor: IDENT_COLOR }}
                  onClick={handleClaimCodeSubmit}
                  disabled={claimProcessing || claimCode.replace(/[^A-Z]/gi, '').length !== 8}
                >
                  Lier mon appareil
                </Button>
                <button
                  type="button"
                  onClick={goBackToPhone}
                  className={cn('w-full flex items-center justify-center gap-1.5 text-xs font-medium underline underline-offset-2 transition-colors mt-3', mutedClass, 'hover:opacity-80')}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Ce n'est pas mon numéro
                </button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
            <Card className={cardClass + ' p-6'}>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-[#9F8170] border-t-transparent rounded-full animate-spin" />
                <span className={`text-sm ${textClass}`}>Connexion en cours...</span>
              </div>
            </Card>
          </div>
        )}

      {/* Confirmation de connexion */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent className={dark ? 'max-w-xs border-stone-700 bg-stone-900' : 'max-w-xs'}>
          <AlertDialogHeader className="items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
              style={{ backgroundColor: `${IDENT_COLOR}15` }}
            >
              <CheckCircle2 className="w-7 h-7" style={{ color: IDENT_COLOR }} />
            </div>
            <AlertDialogTitle className="text-base">
              {confirmAction === 'first-login' ? 'Compte vérifié !' : 'Bienvenue !'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {confirmAction === 'first-login'
                ? `Bonjour ${pendingAuthData?.name || ''}, votre code secret est activé. Vous pouvez accéder à l'application.`
                : `Bonjour ${pendingAuthData?.name || ''}, confirmez votre connexion pour continuer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel
              className="flex-1"
              onClick={() => {
                setShowConfirmModal(false)
                setPendingAuthData(null)
                setConfirmAction(null)
                setPin('')
                pinRef.current = ''
                setPinDisplay([])
                setStep('login-pin')
              }}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: IDENT_COLOR }}
              onClick={confirmConnection}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>

      {/* Demo hint at bottom (always visible) */}
      <div className="text-center pb-8">
        <p className="text-[10px] text-muted-foreground/60">
          Démo : Tél 05 55 55 55 55 · Code 0000 — compte provisionné par le back-office
        </p>
      </div>
    </div>
  )
}
