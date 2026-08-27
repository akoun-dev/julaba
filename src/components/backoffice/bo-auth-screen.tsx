'use client'

import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { useBackofficeStore, type BoRole, ROLE_LABELS } from '@/lib/stores/backoffice-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, CheckCircle2, Shield, Fingerprint } from 'lucide-react'

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
  const { setBoAuth, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

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
      setError('Veuillez entrer le code \u00e0 6 chiffres')
      return
    }
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
    <div className={`min-h-screen flex ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      {/* Left side - Decorative panel */}
      <div className={`hidden lg:flex lg:w-1/2 relative overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-900'}`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 25px 25px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-8 shadow-lg">
            <span className="text-slate-900 font-bold text-2xl">J</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight">
            J\u00f9laba<br />BackOffice
          </h1>
          <p className="text-slate-400 text-base mt-4 max-w-sm leading-relaxed">
            Interface d'administration s\u00e9curis\u00e9e pour la gestion des acteurs et l'identification nationale.
          </p>
          <div className="flex items-center gap-6 mt-10 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              TLS 1.3
            </span>
            <span className="flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5" />
              MFA TOTP
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              AES-256
            </span>
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Back button */}
          <button
            onClick={handleBack}
            className={`flex items-center gap-2 transition-colors text-sm mb-8 ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-white' : 'bg-slate-900'}`}>
              <span className={`font-bold text-lg ${isDark ? 'text-slate-900' : 'text-white'}`}>J</span>
            </div>
            <span className={`font-bold text-xl ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>J\u00f9laba BackOffice</span>
          </div>

          {/* Title */}
          <div className="mb-8">
            <h2 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {step === 'credentials' ? 'Connexion' : step === 'mfa' ? 'V\u00e9rification MFA' : 'Authentification r\u00e9ussie'}
            </h2>
            <p className={`text-sm mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {step === 'credentials'
                ? 'Entrez vos identifiants pour acc\u00e9der au backoffice'
                : step === 'mfa'
                ? `Code envoy\u00e9 \u00e0 ${matchedUser?.email}`
                : 'Redirection vers le tableau de bord...'}
            </p>
          </div>

          {/* Step: Credentials */}
          {step === 'credentials' && (
            <Card className={`${isDark ? 'bg-slate-800 border-slate-700' : 'border-slate-200'} shadow-sm`}>
              <CardContent className="p-6 space-y-4">
                <div>
                  <label className={`text-sm font-medium mb-1.5 block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Email professionnel</label>
                  <Input
                    type="email"
                    placeholder="vous@julaba.ci"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`h-11 ${isDark ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:ring-blue-400/20' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20'}`}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className={`text-sm font-medium mb-1.5 block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Mot de passe</label>
                  <Input
                    type="password"
                    placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`h-11 ${isDark ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:ring-blue-400/20' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20'}`}
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <p className={`text-sm rounded-lg px-3 py-2 ${isDark ? 'text-red-400 bg-red-500/15 border border-red-500/20' : 'text-red-600 bg-red-50 border border-red-100'}`}>{error}</p>
                )}

                <Button
                  onClick={handleLogin}
                  disabled={loading}
                  className={`w-full h-11 font-semibold rounded-lg ${isDark ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className={`w-4 h-4 border-2 rounded-full animate-spin ${isDark ? 'border-slate-900/30 border-t-slate-900' : 'border-white/30 border-t-white'}`} />
                      V\u00e9rification...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Se connecter
                    </span>
                  )}
                </Button>

                {/* MFA notice */}
                <div className={`flex items-start gap-2 text-xs rounded-lg p-3 ${isDark ? 'text-slate-500 bg-slate-800' : 'text-slate-400 bg-slate-50'}`}>
                  <Fingerprint className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Authentification \u00e0 deux facteurs (TOTP) requise apr\u00e8s la connexion.</span>
                </div>

                {/* Demo accounts toggle */}
                <button
                  onClick={() => setShowDemo(!showDemo)}
                  className={`w-full text-center text-xs transition-colors pt-2 ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {showDemo ? 'Masquer' : 'Afficher'} les comptes de d\u00e9monstration
                </button>

                {showDemo && (
                  <div className="space-y-2 pt-2">
                    <p className={`text-xs text-center mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Cliquez pour connexion rapide</p>
                    {DEMO_ACCOUNTS.map((account) => (
                      <button
                        key={account.email}
                        onClick={() => handleDemoLogin(account)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${isDark ? 'border-slate-700 hover:bg-slate-700 hover:border-slate-600' : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300'}`}
                      >
                        <div>
                          <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{account.email}</p>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{ROLE_LABELS[account.role]}</p>
                        </div>
                        <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                          {ROLE_LABELS[account.role]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step: MFA */}
          {step === 'mfa' && (
            <Card className={`${isDark ? 'bg-slate-800 border-slate-700' : 'border-slate-200'} shadow-sm`}>
              <CardContent className="p-6 space-y-6">
                <div className="flex justify-center py-2">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
                    <Shield className={`w-8 h-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                  </div>
                </div>

                <div className="flex justify-center">
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
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className={`w-12 h-14 text-xl font-bold rounded-lg ${isDark ? 'bg-slate-800 border-slate-600 text-white focus:border-blue-400 focus:ring-blue-400/20' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {error && (
                  <p className={`text-sm rounded-lg px-3 py-2 text-center ${isDark ? 'text-red-400 bg-red-500/15 border border-red-500/20' : 'text-red-600 bg-red-50 border border-red-100'}`}>{error}</p>
                )}

                <p className={`text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  D\u00e9mo : entrez n'importe quel code \u00e0 6 chiffres
                </p>

                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('credentials')
                    setTotpCode('')
                    otpRef.current = ''
                  }}
                  className={`w-full rounded-lg ${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  Retour
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-12">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${isDark ? 'bg-emerald-500/15' : 'bg-emerald-50'}`}>
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Authentification r\u00e9ussie</h2>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Redirection vers le tableau de bord...</p>
              <div className={`mt-6 w-32 h-1 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
