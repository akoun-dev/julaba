'use client'

/**
 * MODE-921 — Écran d'authentification de l'espace COOPÉRATIVE (repli).
 *
 * L'entrée PRINCIPALE reste l'écran unifié multi-utilisateurs (auth-screen :
 * un numéro → /api/auth/lookup → rôle détecté → espace coopérative).
 * Cet écran dédié couvre le cas qui n'existe chez aucun autre rôle :
 * l'INSCRIPTION du président de coopérative (auto-provisioning — le compte
 * coopérateur et SA coopérative naissent ensemble, comme julaba-app).
 * Il gère aussi la connexion de repli (même grammaire que prod-auth).
 *
 * Grammaire visuelle : même structure que prod-auth-screen, accent bleu
 * coopérative (COOP_COLOR), cibles tactiles ≥ 44 px, aucun spinner plein
 * écran (overlay de traitement avec libellé, conforme aux audits UI).
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Phone, Shield, Info, CheckCircle2, Users, Building2 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'

type AuthStep = 'choix' | 'inscription' | 'phone' | 'login-pin'

const normalizePhone = (phone: string) =>
  phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')

export function CoopAuthScreen() {
  const { setUserRole, setAuth, navigate } = useAppStore()

  const [step, setStep] = useState<AuthStep>('choix')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [firstName, setFirstName] = useState('')
  const [nomCooperative, setNomCooperative] = useState('')
  const [commune, setCommune] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [pendingAuthData, setPendingAuthData] = useState<{ id: string; name: string; phone: string } | null>(null)

  const pinRef = useRef(pin)
  pinRef.current = pin

  const goBack = () => {
    setUserRole('marchand')
    navigate('auth')
  }

  const goBackToPhone = () => {
    setError('')
    setPin('')
    pinRef.current = ''
    setStep('phone')
  }

  // ── Connexion (repli) : le lookup unifié détecte déjà les coopérateurs,
  // cet écran couvre le cas « je connais mon compte » hors écran unifié.
  const submitPhone = async (phoneValue: string) => {
    setError('')
    const normalized = normalizePhone(phoneValue)
    if (normalized.length < 10) {
      setError('Numéro invalide. Ex : 05 55 55 55 55')
      return
    }
    setPhone(normalized)
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/cooperatives/cooperateurs?phone=${encodeURIComponent(normalized)}`)
      if (!res.ok) {
        setError('Compte coopérative non trouvé. Créez votre espace ci-dessous.')
        setStep('choix')
        return
      }
      setStep('login-pin')
    } catch {
      setError('Réseau indisponible. Réessayez.')
    } finally {
      setIsProcessing(false)
    }
  }

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

  const handleLogin = async () => {
    setIsProcessing(true)
    setError('')
    try {
      // MODE-936 (S-03) : le code BRUT part sur le fil — hachage scrypt et
      // lockout serveur (le hash djb2 local ne sert qu'au hors ligne).
      const res = await fetch('/api/cooperatives/cooperateurs/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, method: 'pin', code: pinRef.current }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError((data?.error as string) || 'Code incorrect.')
        pinRef.current = ''
        setPin('')
        return
      }
      setPendingAuthData({ id: data.id, name: data.firstName, phone })
      setIsProcessing(false)
    } catch {
      setError('Erreur de connexion.')
      setIsProcessing(false)
    }
  }

  const confirmConnection = (id: string, name: string) => {
    setUserRole('cooperateur')
    setAuth(id, name, phone)
  }

  // ── Inscription (auto-provisioning) ─────────────────────────────────
  const handleInscription = async () => {
    setError('')
    const normalized = normalizePhone(phone)
    if (!firstName.trim()) {
      setError('Votre prénom est requis.')
      return
    }
    if (nomCooperative.trim().length < 2) {
      setError('Le nom de la coopérative est requis (2 caractères min).')
      return
    }
    if (normalized.length < 10) {
      setError('Numéro invalide. Ex : 05 55 55 55 55')
      return
    }
    if (pinRef.current.length !== 4) {
      setError('Choisissez un code secret à 4 chiffres.')
      return
    }
    setIsProcessing(true)
    try {
      // MODE-936 (S-03) : le PIN part en BRUT — hachage scrypt serveur.
      const res = await fetch('/api/cooperatives/cooperateurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          phone: normalized,
          authMethod: 'pin',
          pin: pinRef.current,
          nomCooperative: nomCooperative.trim(),
          commune: commune.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError((data?.erreur as string) || 'Inscription impossible.')
        return
      }
      // Connexion immédiate : le compte existe et la coopérative est née.
      const loginRes = await fetch('/api/cooperatives/cooperateurs/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, method: 'pin', code: pinRef.current }),
      })
      if (!loginRes.ok) {
        setError('Espace créé — connectez-vous avec votre code.')
        setStep('phone')
        setPhone(normalized)
        return
      }
      setUserRole('cooperateur')
      setAuth(data.id, firstName.trim(), normalized)
    } catch {
      setError('Réseau indisponible. Réessayez.')
    } finally {
      setIsProcessing(false)
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
              onClick={() => {
                const newPin = pin.slice(0, -1)
                setPin(newPin)
                pinRef.current = newPin
              }}
              aria-label="Effacer le dernier chiffre"
              className="h-12 rounded-xl font-medium text-lg active:scale-95 transition-transform bg-muted text-muted-foreground"
            >
              ⌫
            </button>
          )
        }
        return (
          <button
            key={key}
            onClick={() => handleLoginPinDigit(key)}
            className="h-12 rounded-xl font-semibold text-lg active:scale-95 transition-transform bg-slate-700 border border-slate-600 text-slate-100 hover:bg-slate-600"
          >
            {key}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-[#0f172a] to-[#1a2332]">
      <div className="flex items-center px-4 pt-4 pb-2">
        <button
          onClick={goBack}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors bg-slate-700/60 hover:bg-slate-700/80"
          aria-label="Retour à l'écran de connexion"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 pb-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: `${COOP_COLOR}20` }}>
            <Users className="w-9 h-9" style={{ color: COOP_COLOR }} />
          </div>
          <h1 className="font-bold text-xl" style={{ color: COOP_COLOR }}>
            Jùlaba Coopérative
          </h1>
          <p className="text-sm text-slate-400">Regroupez vos forces d&apos;achat et de vente</p>
        </div>

        {/* Choix : se connecter ou créer son espace */}
        {step === 'choix' && (
          <div className="w-full max-w-sm space-y-3 animate-in fade-in duration-300">
            <button
              onClick={() => setStep('phone')}
              className="w-full rounded-2xl p-4 text-left border border-slate-600 bg-slate-800 hover:bg-slate-700 transition-colors min-h-[72px]"
            >
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
                <div>
                  <p className="font-semibold text-slate-100">Se connecter</p>
                  <p className="text-xs text-slate-400">J&apos;ai déjà un espace coopérative</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => setStep('inscription')}
              className="w-full rounded-2xl p-4 text-left border border-slate-600 bg-slate-800 hover:bg-slate-700 transition-colors min-h-[72px]"
            >
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
                <div>
                  <p className="font-semibold text-slate-100">Créer ma coopérative</p>
                  <p className="text-xs text-slate-400">Je suis président(e) d&apos;une coopérative</p>
                </div>
              </div>
            </button>
            {error && (
              <p className="text-red-500 text-xs flex items-center gap-1">
                <Info className="w-3 h-3" /> {error}
              </p>
            )}
          </div>
        )}

        {/* Inscription */}
        {step === 'inscription' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className="border-0 shadow-lg bg-slate-800">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-5 h-5" style={{ color: COOP_COLOR }} />
                  <h2 className="font-semibold text-slate-100">Créer votre espace</h2>
                </div>
                <Input
                  placeholder="Votre prénom"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-12 bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500"
                  aria-label="Votre prénom"
                  maxLength={60}
                />
                <Input
                  placeholder="Nom de la coopérative"
                  value={nomCooperative}
                  onChange={(e) => setNomCooperative(e.target.value)}
                  className="h-12 bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500"
                  aria-label="Nom de la coopérative"
                  maxLength={120}
                />
                <Input
                  placeholder="Commune (optionnel)"
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  className="h-12 bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500"
                  aria-label="Commune de la coopérative"
                  maxLength={80}
                />
                <div className="flex gap-2">
                  <div className="flex items-center px-3 h-12 rounded-lg text-sm font-medium shrink-0 bg-slate-700 text-slate-400">
                    +225
                  </div>
                  <Input
                    type="tel"
                    placeholder="07 55 55 55 55"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError('') }}
                    className="h-12 bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500"
                    aria-label="Numéro de téléphone"
                    maxLength={14}
                  />
                </div>
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="Code secret à 4 chiffres"
                  value={pin}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 4)
                    setPin(digits)
                    pinRef.current = digits
                  }}
                  className="h-12 bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500"
                  aria-label="Code secret à 4 chiffres"
                />
                {error && (
                  <p className="text-red-500 text-xs flex items-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}
                <Button
                  className="w-full h-12 text-white font-semibold min-h-[44px]"
                  style={{ backgroundColor: COOP_COLOR }}
                  onClick={handleInscription}
                  disabled={isProcessing}
                >
                  Créer ma coopérative
                </Button>
                <button
                  type="button"
                  onClick={() => { setError(''); setStep('choix') }}
                  className="w-full text-xs text-slate-400 hover:text-slate-300 py-2"
                >
                  Retour
                </button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Connexion : téléphone */}
        {step === 'phone' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className="border-0 shadow-lg bg-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Phone className="w-5 h-5" style={{ color: COOP_COLOR }} />
                  <h2 className="font-semibold text-slate-100">Numéro de téléphone</h2>
                </div>
                <div className="flex gap-2">
                  <div className="flex items-center px-3 h-12 rounded-lg text-sm font-medium shrink-0 bg-slate-700 text-slate-400">
                    +225
                  </div>
                  <Input
                    type="tel"
                    placeholder="07 55 55 55 55"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError('') }}
                    className="h-12 text-lg bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500"
                    autoFocus
                    aria-label="Numéro de téléphone"
                    onKeyDown={(e) => { if (e.key === 'Enter') void submitPhone(phone) }}
                    maxLength={14}
                  />
                </div>
                {error && (
                  <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> {error}
                  </p>
                )}
                <Button
                  className="w-full h-12 mt-4 text-white font-semibold"
                  style={{ backgroundColor: COOP_COLOR }}
                  onClick={() => void submitPhone(phone)}
                  disabled={isProcessing}
                >
                  Continuer
                </Button>
                <button
                  type="button"
                  onClick={() => { setError(''); setStep('choix') }}
                  className="w-full text-xs text-slate-400 hover:text-slate-300 py-3 mt-1"
                >
                  Retour
                </button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Connexion : code */}
        {step === 'login-pin' && (
          <div className="w-full max-w-sm animate-in fade-in duration-300">
            <Card className="border-0 shadow-lg bg-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5" style={{ color: COOP_COLOR }} />
                  <h2 className="font-semibold text-slate-100">Entrez votre code</h2>
                </div>
                <div className="flex justify-center gap-3 mb-2">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const filled = i < pin.length
                    return (
                      <div
                        key={i}
                        className="w-4 h-4 rounded-full border-2 transition-all duration-150"
                        style={{
                          backgroundColor: filled ? COOP_COLOR : 'transparent',
                          borderColor: filled ? COOP_COLOR : `${COOP_COLOR}66`,
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
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-medium underline underline-offset-2 text-slate-400 hover:text-slate-300"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Numéro incorrect ? Modifier le numéro
                </button>
              </CardContent>
            </Card>
            {renderNumpad()}
          </div>
        )}

        {/* Traitement : libellé + indicateur (aucun spinner générique plein écran) */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" role="status" aria-live="polite">
            <Card className="p-5 bg-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: COOP_COLOR, borderTopColor: 'transparent' }}
                />
                <span className="text-sm text-slate-100">Traitement en cours…</span>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Confirmation de connexion (même modal que prod-auth) */}
      <AlertDialog open={pendingAuthData !== null} onOpenChange={(open) => { if (!open) setPendingAuthData(null) }}>
        <AlertDialogContent className="max-w-xs bg-slate-800 border-slate-700">
          <AlertDialogHeader className="items-center text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1" style={{ backgroundColor: `${COOP_COLOR}20` }}>
              <CheckCircle2 className="w-7 h-7" style={{ color: COOP_COLOR }} />
            </div>
            <AlertDialogTitle className="text-base text-slate-100">Bienvenue !</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {`Bonjour ${pendingAuthData?.name || ''}, confirmez votre connexion pour ouvrir votre espace coopérative.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1" onClick={() => setPendingAuthData(null)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: COOP_COLOR }}
              onClick={() => {
                if (pendingAuthData) confirmConnection(pendingAuthData.id, pendingAuthData.name)
                setPendingAuthData(null)
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
