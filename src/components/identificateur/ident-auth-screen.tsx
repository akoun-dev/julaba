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
import { ArrowLeft, Phone, Lock, User, Shield, Info, CheckCircle2, Delete } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'
import Image from 'next/image'

const IDENT_COLOR = '#9F8170'
const IDENT_COLOR_HOVER = '#8B6F60'

type AuthStep = 'phone' | 'name' | 'pin' | 'confirm' | 'login-pin'

interface AgentData {
  id: string
  firstName: string
  phone: string
  pinHash: string
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

const normalizePhone = (phone: string) =>
  phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')

const loadAgent = (phone: string): AgentData | null => {
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

export function IdentAuthScreen() {
  const { setUserRole, setAuth, navigate, soleilMode } = useAppStore()

  const [step, setStep] = useState<AuthStep>('phone')
  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [pin, setPin] = useState('')
  const [pinDisplay, setPinDisplay] = useState<string[]>([])
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'login' | 'register' | null>(null)
  const [pendingAuthData, setPendingAuthData] = useState<{ id: string; name: string; phone: string } | null>(null)

  const phoneRef = useRef(phone)
  const pinRef = useRef(pin)
  const stepRef = useRef(step)
  phoneRef.current = phone
  pinRef.current = pin
  stepRef.current = step

  const textClass = soleilMode ? 'text-black' : ''
  const headingClass = soleilMode ? 'text-xl' : 'text-lg'

  const goBackToMarchand = () => {
    setUserRole('marchand')
    navigate('auth')
  }

  const handlePhoneSubmit = () => {
    setError('')
    const normalized = normalizePhone(phone)
    if (normalized.length < 10) {
      setError('Numéro invalide. Ex: 05 55 55 55 55')
      return
    }
    const existing = loadAgent(phone)
    if (existing) {
      setStep('login-pin')
    } else {
      setStep('name')
    }
  }

  const handleNameSubmit = () => {
    setError('')
    const name = firstName.trim()
    if (name.length < 2) {
      setError('Entrez votre prénom')
      return
    }
    setStep('pin')
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
          handleRegister()
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

  const handleRegister = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const id = crypto.randomUUID()
      const hash = simpleHash(pin)
      const agentData: AgentData = {
        id,
        firstName: firstName.trim(),
        phone: normalizePhone(phone),
        pinHash: hash,
      }
      await saveAgent(agentData)
      setPendingAuthData({ id, name: agentData.firstName, phone: agentData.phone })
      setConfirmAction('register')
      setShowConfirmModal(true)
    } catch {
      setError('Erreur lors de l\'enregistrement.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleLogin = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const stored = loadAgent(phoneRef.current)
      if (!stored) {
        setError('Agent non trouvé.')
        setIsProcessing(false)
        return
      }
      const enteredPin = pinRef.current
      const storedPinHash = await loadAgentPinHash(phone || 'demo')
      const hash = simpleHash(enteredPin)
      if (hash !== storedPinHash) {
        setError('Code incorrect.')
        setIsProcessing(false)
        pinRef.current = ''
        setPin('')
        setPinDisplay([])
        return
      }
      setPendingAuthData({ id: stored.id, name: stored.firstName, phone: stored.phone })
      setConfirmAction('login')
      setShowConfirmModal(true)
    } catch {
      setError('Erreur de connexion.')
    } finally {
      setIsProcessing(false)
    }
  }

  const confirmConnection = () => {
    if (pendingAuthData) {
      setAuth(pendingAuthData.id, pendingAuthData.name, pendingAuthData.phone)
    }
  }

  const handleDemoLogin = () => {
    setPhone('05 55 55 55 55')
    setError('')
    const existing = loadAgent('05 55 55 55 55')
    if (existing) {
      setStep('login-pin')
    } else {
      setFirstName('Kouamé')
      setStep('name')
    }
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
              className={`h-12 rounded-xl font-medium text-lg active:scale-95 transition-transform ${soleilMode ? 'bg-muted text-muted-foreground' : 'bg-slate-700 text-slate-400'}`}
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
            className={`h-12 rounded-xl font-semibold text-lg active:scale-95 transition-transform ${soleilMode ? 'bg-white border border-border hover:bg-muted/50' : 'bg-slate-700 border border-slate-600 text-slate-100 hover:bg-slate-600'}`}
          >
            {key}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className={`min-h-dvh flex flex-col ${soleilMode ? 'bg-gradient-to-b from-[#F5EDE8] to-[#EDE0D6]' : 'bg-gradient-to-b from-[#0f172a] to-[#1a2332]'}`}>
      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button
          onClick={goBackToMarchand}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${soleilMode ? 'bg-white/60 hover:bg-white/80' : 'bg-slate-700/60 hover:bg-slate-700/80'}`}
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
          <p className={`text-sm ${soleilMode ? 'text-muted-foreground' : 'text-slate-400'}`}>
            Votre assistant marché
          </p>
        </div>

        {/* Step: Phone */}
        {step === 'phone' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={`border-0 shadow-lg ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Phone className="w-5 h-5 text-[#9F8170]" />
                  <h2 className={`font-semibold ${textClass}`}>Numéro de téléphone</h2>
                </div>
                <div className="flex gap-2">
                  <div className={`flex items-center px-3 h-12 rounded-lg text-sm font-medium shrink-0 ${soleilMode ? 'bg-muted text-muted-foreground' : 'bg-slate-700 text-slate-400'}`}>
                    +225
                  </div>
                  <Input
                    type="tel"
                    placeholder="05 55 55 55 55"
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
                {error && (
                  <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}
                <Button
                  className="w-full h-12 mt-4 text-white font-semibold"
                  style={{ backgroundColor: IDENT_COLOR }}
                  onClick={handlePhoneSubmit}
                >
                  Continuer
                </Button>
              </CardContent>
            </Card>

            {/* Demo hint */}
            <div className="mt-6 text-center">
              <button
                onClick={handleDemoLogin}
                className={`text-xs underline underline-offset-2 transition-colors ${soleilMode ? 'text-[#9F8170] hover:text-[#8B6F60]' : 'text-[#c4a99a] hover:text-[#d4bbb0]'}`}
              >
                Démo : Tél 05 55 55 55 55 · Code 0000
              </button>
            </div>
          </div>
        )}

        {/* Step: Name (registration) */}
        {step === 'name' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={`border-0 shadow-lg ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-[#9F8170]" />
                  <h2 className={`font-semibold ${textClass}`}>Votre prénom</h2>
                </div>
                <Input
                  type="text"
                  placeholder="Kouamé"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value)
                    setError('')
                  }}
                  className={`h-12 text-lg ${soleilMode ? 'text-xl' : ''}`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSubmit()
                  }}
                />
                {error && (
                  <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}
                <Button
                  className="w-full h-12 mt-4 text-white font-semibold"
                  style={{ backgroundColor: IDENT_COLOR }}
                  onClick={handleNameSubmit}
                >
                  Continuer
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: PIN creation */}
        {(step === 'pin' || step === 'confirm') && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={`border-0 shadow-lg ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-5 h-5 text-[#9F8170]" />
                  <h2 className={`font-semibold ${textClass}`}>
                    {step === 'pin' ? 'Créer votre code secret' : 'Confirmer votre code'}
                  </h2>
                </div>
                <p className={`text-xs mb-3 ${soleilMode ? 'text-muted-foreground' : 'text-slate-400'}`}>
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

                {step === 'pin' && (
                  <button
                    onClick={handleClear}
                    className={`text-xs text-center w-full mb-1 ${soleilMode ? 'text-muted-foreground' : 'text-slate-400'}`}
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
            <Card className={`border-0 shadow-lg ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-[#9F8170]" />
                  <h2 className={`font-semibold ${textClass}`}>Entrez votre code</h2>
                </div>
                <p className={`text-xs mb-3 ${soleilMode ? 'text-muted-foreground' : 'text-slate-400'}`}>
                  Bienvenue ! Entrez votre code secret.
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
              </CardContent>
            </Card>
            {renderNumpad()}
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
            <Card className={`p-6 ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-[#9F8170] border-t-transparent rounded-full animate-spin" />
                <span className={`text-sm ${textClass}`}>Connexion en cours...</span>
              </div>
            </Card>
          </div>
        )}

      {/* Confirmation de connexion */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent className={`max-w-xs ${!soleilMode ? 'bg-slate-800 border-slate-700' : ''}`}>
          <AlertDialogHeader className="items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
              style={{ backgroundColor: `${IDENT_COLOR}15` }}
            >
              <CheckCircle2 className="w-7 h-7" style={{ color: IDENT_COLOR }} />
            </div>
            <AlertDialogTitle className="text-base">
              {confirmAction === 'register' ? 'Compte créé !' : 'Bienvenue !'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {confirmAction === 'register'
                ? `Bonjour ${pendingAuthData?.name || ''}, votre compte a été créé avec succès. Vous pouvez maintenant accéder à l'application.`
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
          Démo : Tél 05 55 55 55 55 · Code 0000
        </p>
      </div>
    </div>
  )
}
