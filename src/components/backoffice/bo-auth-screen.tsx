'use client'

import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { useBackofficeStore, type BoRole, ROLE_LABELS } from '@/lib/stores/backoffice-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Shield, Lock, ArrowLeft, Monitor, CheckCircle2, Fingerprint } from 'lucide-react'

// Demo accounts for easy testing
const DEMO_ACCOUNTS = [
  { email: 'aminata@julaba.ci', password: 'admin123', role: 'super_admin' as BoRole },
  { email: 'koffi@julaba.ci', password: 'admin123', role: 'admin_general' as BoRole },
  { email: 'moussa@dge.ci', password: 'admin123', role: 'admin_national' as BoRole },
  { email: 'fatou@julaba.ci', password: 'admin123', role: 'gestionnaire_zone' as BoRole },
  { email: 'jean@julaba.ci', password: 'admin123', role: 'operateur_terrain' as BoRole },
]

export function BoAuthScreen() {
  const { setUserRole, navigate, setAuth } = useAppStore()
  const { setBoAuth } = useBackofficeStore()

  const [step, setStep] = useState<'credentials' | 'mfa' | 'success'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [matchedUser, setMatchedUser] = useState<(typeof DEMO_ACCOUNTS)[0] | null>(null)
  const [showDemo, setShowDemo] = useState(false)
  const otpRef = useRef<string>('')

  const handleLogin = useCallback(() => {
    setError('')
    if (!email || !password) {
      setError('Veuillez remplir tous les champs')
      return
    }

    setLoading(true)
    // Simulate API delay
    setTimeout(() => {
      const account = DEMO_ACCOUNTS.find(
        (a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password
      )
      if (!account) {
        setError('Email ou mot de passe incorrect')
        setLoading(false)
        return
      }
      setMatchedUser(account)
      setLoading(false)
      setStep('mfa')
    }, 800)
  }, [email, password])

  const handleMfaVerify = useCallback(() => {
    setError('')
    if (otpRef.current.length !== 6) {
      setError('Veuillez entrer le code à 6 chiffres')
      return
    }
    // Accept any 6-digit code for demo
    setStep('success')
    setTimeout(() => {
      if (!matchedUser) return
      setUserRole('backoffice')
      setAuth(matchedUser.email, matchedUser.email.split('@')[0], '')
      setBoAuth({
        id: `bo-${matchedUser.role}`,
        email: matchedUser.email,
        name: matchedUser.email.split('@')[0].charAt(0).toUpperCase() + matchedUser.email.split('@')[0].slice(1),
        role: matchedUser.role,
        isActive: true,
        createdAt: new Date().toISOString(),
      })
      navigate('bo-dashboard')
    }, 600)
  }, [matchedUser, setBoAuth, setAuth, setUserRole, navigate])

  const handleDemoLogin = useCallback((account: (typeof DEMO_ACCOUNTS)[0]) => {
    setEmail(account.email)
    setPassword(account.password)
    setMatchedUser(account)
    setStep('mfa')
  }, [])

  const handleBack = useCallback(() => {
    if (step === 'mfa') {
      setStep('credentials')
      setTotpCode('')
      otpRef.current = ''
    } else {
      navigate('auth')
    }
  }, [step, navigate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (step === 'credentials') handleLogin()
        else if (step === 'mfa') handleMfaVerify()
      }
    },
    [step, handleLogin, handleMfaVerify]
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 25px 25px, white 2px, transparent 0)', backgroundSize: '50px 50px' }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="absolute -top-12 left-0 flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>

        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-2xl mb-4"
            style={{ backgroundColor: '#333333' }}
          >
            <Monitor className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Jùlaba BackOffice</h1>
          <p className="text-gray-400 text-sm mt-1">Interface d'administration sécurisée</p>
        </div>

        {/* Step: Credentials */}
        {step === 'credentials' && (
          <Card className="border-gray-700 bg-gray-800/50 backdrop-blur-sm shadow-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Connexion sécurisée
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 mb-1.5 block">Email professionnel</label>
                <Input
                  type="email"
                  placeholder="vous@julaba.ci"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 focus:border-gray-400"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 mb-1.5 block">Mot de passe</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 focus:border-gray-400"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <Button
                onClick={handleLogin}
                disabled={loading}
                className="w-full text-white font-semibold h-11"
                style={{ backgroundColor: '#333333' }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Vérification...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Se connecter
                  </span>
                )}
              </Button>

              {/* MFA notice */}
              <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-700/30 rounded-lg p-3">
                <Fingerprint className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Authentification à deux facteurs requise (TOTP) après la connexion.</span>
              </div>

              {/* Demo accounts toggle */}
              <button
                onClick={() => setShowDemo(!showDemo)}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors pt-2"
              >
                {showDemo ? 'Masquer' : 'Afficher'} les comptes de démonstration
              </button>

              {showDemo && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-gray-500 text-center mb-2">Cliquez pour connexion rapide</p>
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      onClick={() => handleDemoLogin(account)}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-gray-700/40 hover:bg-gray-700/70 transition-colors text-left"
                    >
                      <div>
                        <p className="text-sm text-white font-medium">{account.email}</p>
                        <p className="text-xs text-gray-400">{ROLE_LABELS[account.role]}</p>
                      </div>
                      <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                        {ROLE_LABELS[account.role]}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: MFA */}
        {step === 'mfa' && (
          <Card className="border-gray-700 bg-gray-800/50 backdrop-blur-sm shadow-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Vérification MFA
              </CardTitle>
              <p className="text-gray-400 text-sm">
                Entrez le code à 6 chiffres de votre application d'authentification
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center py-4">
                <InputOTP
                  maxLength={6}
                  onChange={(value) => {
                    otpRef.current = value
                    setTotpCode(value)
                    if (value.length === 6) {
                      setTimeout(() => handleMfaVerify(), 300)
                    }
                  }}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="w-12 h-14 text-xl font-bold bg-gray-700/50 border-gray-600 text-white" />
                    <InputOTPSlot index={1} className="w-12 h-14 text-xl font-bold bg-gray-700/50 border-gray-600 text-white" />
                    <InputOTPSlot index={2} className="w-12 h-14 text-xl font-bold bg-gray-700/50 border-gray-600 text-white" />
                    <InputOTPSlot index={3} className="w-12 h-14 text-xl font-bold bg-gray-700/50 border-gray-600 text-white" />
                    <InputOTPSlot index={4} className="w-12 h-14 text-xl font-bold bg-gray-700/50 border-gray-600 text-white" />
                    <InputOTPSlot index={5} className="w-12 h-14 text-xl font-bold bg-gray-700/50 border-gray-600 text-white" />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2 text-center">{error}</p>
              )}

              <p className="text-center text-xs text-gray-500">
                Code de démonstration : entrez n'importe quel code à 6 chiffres
              </p>

              <Button
                variant="outline"
                onClick={() => {
                  setStep('credentials')
                  setTotpCode('')
                  otpRef.current = ''
                }}
                className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                Retour
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <Card className="border-gray-700 bg-gray-800/50 backdrop-blur-sm shadow-2xl">
            <CardContent className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Authentification réussie</h2>
              <p className="text-gray-400 text-sm">Redirection vers le tableau de bord...</p>
              <div className="mt-4 w-32 mx-auto h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security badges */}
        <div className="flex items-center justify-center gap-4 mt-6 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            TLS 1.3
          </span>
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            AES-256
          </span>
          <span className="flex items-center gap-1">
            <Fingerprint className="w-3 h-3" />
            MFA
          </span>
        </div>
      </div>
    </div>
  )
}
