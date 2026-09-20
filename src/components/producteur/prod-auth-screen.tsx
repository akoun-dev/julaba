'use client'

import { PROD_COLOR } from '@/lib/design-tokens'
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Phone, Shield, Info, CheckCircle2, Delete, Grid3X3 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { PatternLock } from '@/components/marchand/pattern-lock'


type AuthMethod = 'pin' | 'pattern'

type AuthStep = 'phone' | 'login-pin' | 'pattern-login'

interface ProducteurData {
  id: string
  firstName: string
  phone: string
  pinHash: string
  patternHash?: string
  authMethod: AuthMethod
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

const patternToHash = (pattern: number[]) => simpleHash(pattern.join('-'))

const loadProducteur = (phone: string): ProducteurData | null => {
  return null
}

import { savePinHash, getPinHash } from '@/lib/secure-storage'

const saveProducteur = async (data: ProducteurData) => {
  const normalized = normalizePhone(data.phone)
  const { pinHash, patternHash } = data
  if (pinHash) await savePinHash(`prod-pin-${normalized}`, pinHash).catch(() => {})
  if (patternHash) await savePinHash(`prod-pattern-${normalized}`, patternHash).catch(() => {})
}
const loadProducteurPinHash = async (phone: string): Promise<string | null> => {
  const normalized = normalizePhone(phone)
  const secure = await getPinHash(`prod-pin-${normalized}`).catch(() => null)
  if (secure) return secure
    return null
}
const loadProducteurPatternHash = async (phone: string): Promise<string | null> => {
  const normalized = normalizePhone(phone)
  return await getPinHash(`prod-pattern-${normalized}`).catch(() => null)
}

// Only an identificateur can create a producteur account now (see
// /api/backoffice/enrolments) — self-registration is gone. The first login
// on a given device has no local cache yet, so it has to ask the server
// whether this phone has an account at all, and which method it uses.
const checkServerProducteur = async (
  phone: string
): Promise<{ id: string; firstName: string; authMethod: AuthMethod } | null> => {
  try {
    const res = await fetch(`/api/producteur?phone=${encodeURIComponent(phone)}`)
    if (!res.ok) return null
    const data = await res.json()
    return { id: data.id, firstName: data.firstName, authMethod: data.authMethod }
  } catch {
    return null
  }
}

// Verifies a login attempt server-side (see /api/producteur/login) — only
// the already-computed hash is sent, never the raw PIN/pattern.
// A refus serveur renvoie { serverError } pour afficher la vraie raison
// (code erroné, compte déjà lié à un autre appareil…) au lieu d'un
// « Code incorrect » générique qui masquait les 409 de claim d'appareil.
const verifyServerLogin = async (
  phone: string, method: AuthMethod, hash: string
): Promise<{ id: string; firstName: string; sexe?: 'masculin' | 'feminin' | 'autre' | null } | { serverError: string } | null> => {
  try {
    const res = await fetch('/api/producteur/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, method, hash }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      return data?.error ? { serverError: data.error as string } : null
    }
    return await res.json()
  } catch {
    return null
  }
}

export function ProdAuthScreen() {
  const { setUserRole, setAuth, navigate, soleilMode } = useAppStore()

  const [step, setStep] = useState<AuthStep>('phone')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingAuthData, setPendingAuthData] = useState<{ id: string; name: string; phone: string; sexe?: 'masculin' | 'feminin' | 'autre' | null } | null>(null)
  const [patternError, setPatternError] = useState(false)
  const [patternSuccess, setPatternSuccess] = useState(false)

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

  const routeToLoginStep = (method: AuthMethod) => {
    setStep(method === 'pattern' ? 'pattern-login' : 'login-pin')
  }

  // Permet de corriger un numéro mal saisi depuis l'écran du code (PIN ou
  // schéma) : retour à l'étape téléphone avec le numéro pré-rempli et
  // réinitialisation de l'état transitoire (code, erreurs, schéma).
  const goBackToPhone = () => {
    setError('')
    setPin('')
    pinRef.current = ''
    setPatternError(false)
    setPatternSuccess(false)
    setStep('phone')
  }

  // Only an identificateur creates accounts now (see checkServerProducteur),
  // so a phone with no local cache and no server record just can't log in.
  const submitPhone = async (phoneValue: string) => {
    setError('')
    const normalized = normalizePhone(phoneValue)
    if (normalized.length < 10) {
      setError('Numéro invalide. Ex: 05 55 55 55 55')
      return
    }
    setPhone(normalized)
    phoneRef.current = normalized

    const existing = loadProducteur(normalized)
    if (existing) {
      routeToLoginStep(existing.authMethod)
      return
    }

    setIsProcessing(true)
    const server = await checkServerProducteur(normalized)
    setIsProcessing(false)
    if (server) {
      routeToLoginStep(server.authMethod)
    } else {
      setError('Compte non trouvé. Demandez à un identificateur de créer votre compte.')
    }
  }

  const handlePhoneSubmit = () => { void submitPhone(phone) }

  const handleLoginPinDigit = (digit: string) => {
    const currentPin = pinRef.current
    if (currentPin.length >= 4) return
    const newPin = currentPin + digit
    pinRef.current = newPin
    setPin(newPin)
    if (newPin.length === 4) {
      setTimeout(() => void handleLogin(), 200)
    }
  }

  const handleDelete = () => {
    const newPin = pin.slice(0, -1)
    setPin(newPin)
    pinRef.current = newPin
  }

  // --- PIN login --- (local cache first, server verify on a device's first
  // login for this account — see verifyServerLogin)
  const handleLogin = async () => {
    setIsProcessing(true)
    setError('')
    const phoneValue = phoneRef.current
    const hash = simpleHash(pinRef.current)
    try {
      const stored = loadProducteur(phoneValue)
      if (stored) {
        const storedPinHash = await loadProducteurPinHash(phoneValue)
        if (hash !== storedPinHash) {
          setError('Code incorrect.')
          pinRef.current = ''
          setPin('')
          return
        }
        setPendingAuthData({ id: stored.id, name: stored.firstName, phone: stored.phone })
        setShowConfirmModal(true)
        return
      }
      const result = await verifyServerLogin(phoneValue, 'pin', hash)
      if (result && 'serverError' in result) {
        setError(result.serverError)
        pinRef.current = ''
        setPin('')
        return
      }
      if (!result) {
        setError('Code incorrect.')
        pinRef.current = ''
        setPin('')
        return
      }
      await saveProducteur({ id: result.id, firstName: result.firstName, phone: phoneValue, pinHash: hash, authMethod: 'pin' })
      setPendingAuthData({ id: result.id, name: result.firstName, phone: phoneValue, sexe: result.sexe })
      setShowConfirmModal(true)
    } catch {
      setError('Erreur de connexion.')
    } finally {
      setIsProcessing(false)
    }
  }

  // --- Pattern login --- (same local-first/server-fallback shape as handleLogin)
  const handlePatternLogin = async (pattern: number[]) => {
    setError('')
    const phoneValue = phoneRef.current
    const hash = patternToHash(pattern)
    try {
      const stored = loadProducteur(phoneValue)
      if (stored) {
        const storedPatternHash = await loadProducteurPatternHash(phoneValue)
        if (storedPatternHash && hash === storedPatternHash) {
          setPatternSuccess(true)
          setPendingAuthData({ id: stored.id, name: stored.firstName, phone: stored.phone })
          setShowConfirmModal(true)
          return
        }
      } else {
        const result = await verifyServerLogin(phoneValue, 'pattern', hash)
        if (result && 'serverError' in result) {
          setError(result.serverError)
          setPatternError(true)
          setTimeout(() => setPatternError(false), 1200)
          return
        }
        if (result) {
          await saveProducteur({ id: result.id, firstName: result.firstName, phone: phoneValue, pinHash: '', patternHash: hash, authMethod: 'pattern' })
          setPatternSuccess(true)
          setPendingAuthData({ id: result.id, name: result.firstName, phone: phoneValue, sexe: result.sexe })
          setShowConfirmModal(true)
          return
        }
      }
      setPatternError(true)
      setError('Schéma incorrect.')
      setTimeout(() => setPatternError(false), 1200)
    } catch {
      setError('Erreur de connexion.')
    }
  }

  const confirmConnection = () => {
    if (pendingAuthData) {
      setAuth(pendingAuthData.id, pendingAuthData.name, pendingAuthData.phone, pendingAuthData.sexe)
    }
  }

  // Task 98-B — handleDemoLogin RETIRÉ avec son bouton (règle « zéro seed »).

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
              aria-label="Effacer le dernier chiffre"
              className={`h-12 rounded-xl font-medium text-lg active:scale-95 transition-transform ${soleilMode ? 'bg-muted text-muted-foreground' : 'bg-slate-700 text-slate-400'}`}
            >
              <Delete className="mx-auto size-5" aria-hidden="true" />
            </button>
          )
        }
        return (
          <button
            key={key}
            onClick={() => handleLoginPinDigit(key)}
            className={`h-12 rounded-xl font-semibold text-lg active:scale-95 transition-transform ${soleilMode ? 'bg-white border border-border hover:bg-muted/50' : 'bg-slate-700 border border-slate-600 text-slate-100 hover:bg-slate-600'}`}
          >
            {key}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className={`min-h-dvh flex flex-col ${soleilMode ? 'bg-gradient-to-b from-[#EAF5EE] to-[#D7ECDE]' : 'bg-gradient-to-b from-[#0f172a] to-[#1a2332]'}`}>
      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button
          onClick={goBackToMarchand}
          className={`h-11 w-11 rounded-full flex items-center justify-center transition-colors ${soleilMode ? 'bg-white/60 hover:bg-white/80' : 'bg-slate-700/60 hover:bg-slate-700/80'}`}
          aria-label="Retour"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: PROD_COLOR }} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-6">
        {/* Logo and title */}
        <div className="flex flex-col items-center mb-8">
          <Image src="/icon-only.png" alt="Jùlaba" width={72} height={72} className="mb-3" />
          <h1 className={`font-bold ${headingClass}`} style={{ color: PROD_COLOR }}>
            Jùlaba Producteur
          </h1>
          <p className={`text-sm ${soleilMode ? 'text-muted-foreground' : 'text-slate-400'}`}>
            Vos récoltes, vos ventes
          </p>
        </div>

        {/* Step: Phone */}
        {step === 'phone' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={`border-0 shadow-lg ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Phone className="w-5 h-5" style={{ color: PROD_COLOR }} />
                  <h2 className={`font-semibold ${textClass}`}>Numéro de téléphone</h2>
                </div>
                <div className="flex gap-2">
                  <div className={`flex items-center px-3 h-12 rounded-lg text-sm font-medium shrink-0 ${soleilMode ? 'bg-muted text-muted-foreground' : 'bg-slate-700 text-slate-400'}`}>
                    +225
                  </div>
                  <Input
                    type="tel"
                    placeholder="07 44 44 44 44"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError('') }}
                    className={`h-12 text-lg ${soleilMode ? 'text-xl' : ''}`}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePhoneSubmit() }}
                  />
                </div>
                {error && (
                  <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}
                <Button
                  className="w-full h-12 mt-4 text-white font-semibold"
                  style={{ backgroundColor: PROD_COLOR }}
                  onClick={handlePhoneSubmit}
                  disabled={isProcessing}
                >
                  Continuer
                </Button>
              </CardContent>
            </Card>

            {/* Task 98-B (audit 97-B1 #4) — l'affordance de connexion démo
            (producteur-1, seed) est RETIRÉE : un écran de production ne
            propose plus de comptes fictifs (règle projet « zéro seed »).
            La purge complète des lignes producteur du seed.sql reste à
            faire (DET-PROD-002) — les tests pgTAP s'y réfèrent. */}
          </div>
        )}

        {/* Step: Login PIN */}
        {step === 'login-pin' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={`border-0 shadow-lg ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5" style={{ color: PROD_COLOR }} />
                  <h2 className={`font-semibold ${textClass}`}>Entrez votre code</h2>
                </div>
                <p className={`text-xs mb-3 ${soleilMode ? 'text-muted-foreground' : 'text-slate-400'}`}>
                  Bienvenue ! Entrez votre code secret.
                </p>

                <div className="flex justify-center gap-3 mb-1">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const filled = i < pin.length
                    return (
                      <div
                        key={i}
                        className={cn('w-4 h-4 rounded-full border-2 transition-all duration-150')}
                        style={{
                          backgroundColor: filled ? PROD_COLOR : 'transparent',
                          borderColor: filled ? PROD_COLOR : `${PROD_COLOR}66`,
                        }}
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
                  className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium underline underline-offset-2 transition-colors ${soleilMode ? 'text-muted-foreground' : 'text-slate-400 hover:text-slate-300'}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Numéro incorrect ? Modifier le numéro
                </button>
              </CardContent>
            </Card>
            {renderNumpad()}
          </div>
        )}

        {/* Step: Pattern login */}
        {step === 'pattern-login' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className={`border-0 shadow-lg ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <CardContent className="p-6 space-y-3">
                <div className="text-center mb-1">
                  <Grid3X3 className="w-10 h-10 mx-auto mb-2" style={{ color: PROD_COLOR }} />
                  <h2 className={`font-semibold ${headingClass} ${textClass}`}>
                    Dessinez pour vous connecter
                  </h2>
                  <p className={`text-xs mt-1 ${soleilMode ? 'text-muted-foreground' : 'text-slate-400'}`}>
                    Reproduisez votre schéma secret
                  </p>
                </div>

                <div className="flex justify-center py-2">
                  <PatternLock
                    onComplete={handlePatternLogin}
                    disabled={isProcessing}
                    error={patternError}
                    success={patternSuccess}
                    color={PROD_COLOR}
                    size={soleilMode ? 290 : 260}
                  />
                </div>

                {error && (
                  <p className="text-red-500 text-xs text-center flex items-center justify-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={goBackToPhone}
                  className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium underline underline-offset-2 transition-colors ${soleilMode ? 'text-muted-foreground' : 'text-slate-400 hover:text-slate-300'}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Numéro incorrect ? Modifier le numéro
                </button>
              </CardContent>
            </Card>
          </div>
        )}

        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
            <Card className={`p-6 ${!soleilMode ? 'bg-slate-800' : ''}`}>
              <div className="flex items-center gap-3">
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: PROD_COLOR, borderTopColor: 'transparent' }}
                />
                <span className={`text-sm ${textClass}`}>Connexion en cours...</span>
              </div>
            </Card>
          </div>
        )}

        <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
          <AlertDialogContent className={`max-w-xs ${!soleilMode ? 'bg-slate-800 border-slate-700' : ''}`}>
            <AlertDialogHeader className="items-center text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
                style={{ backgroundColor: `${PROD_COLOR}15` }}
              >
                <CheckCircle2 className="w-7 h-7" style={{ color: PROD_COLOR }} />
              </div>
              <AlertDialogTitle className="text-base">
                Bienvenue !
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                {`Bonjour ${pendingAuthData?.name || ''}, confirmez votre connexion pour continuer.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
              <AlertDialogCancel
                className="flex-1"
                onClick={() => {
                  setShowConfirmModal(false)
                  setPendingAuthData(null)
                  setPin('')
                  pinRef.current = ''
                  setPatternError(false)
                  setPatternSuccess(false)
                }}
              >
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                className="flex-1 text-white"
                style={{ backgroundColor: PROD_COLOR }}
                onClick={confirmConnection}
              >
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Task 98-B — la mention démo du bas d'écran est retirée (règle
      « zéro seed » à l'écran). */}
    </div>
  )
}
