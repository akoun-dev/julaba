'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, Loader2, Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/lib/stores/app-store'
import { useInstitutionStore, type InsUser } from '@/lib/stores/institution-store'
import { cn } from '@/lib/utils'

// Comptes de démonstration exposés par la route (jamais de mot de passe).
interface DemoAccount {
  email: string
  name: string
  role: string
  zone: string | null
}

interface AuthenticatedUser {
  id: string
  email: string
  name: string
  role: string
  zone: string | null
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  forcePasswordChange?: boolean
}

export function InsAuthScreen() {
  const { setUserRole, setAuth, navigate } = useAppStore()
  const setInsAuth = useInstitutionStore((s) => s.setInsAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([])
  const [demoLoading, setDemoLoading] = useState(true)
  const [showDemo, setShowDemo] = useState(false)

  useEffect(() => {
    fetch('/api/backoffice/demo-accounts')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DemoAccount[]) => {
        const institutionAccounts = Array.isArray(data) ? data.filter((a) => a.role === 'institution') : []
        setDemoAccounts(institutionAccounts)
      })
      .catch(() => setDemoAccounts([]))
      .finally(() => setDemoLoading(false))
  }, [])

  // Ouverture de session institution : l'app-store (contrat de surface)
  // porte le rôle + l'identité, puis le store institution pose l'utilisateur
  // serveur-validé et la navigation bascule sur ins-dashboard.
  const finalizeLogin = useCallback(
    (user: AuthenticatedUser) => {
      setUserRole('institution')
      setAuth(user.email, user.name, '')
      setInsAuth({
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'institution',
        zone: user.zone,
        isActive: user.isActive,
      } satisfies InsUser)
      navigate('ins-dashboard')
    },
    [setUserRole, setAuth, setInsAuth, navigate]
  )

  const performLogin = useCallback(
    (loginEmail: string, loginPassword: string) => {
      setError('')
      setLoading(true)
      fetch('/api/backoffice/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
        .then((res) => {
          if (!res.ok) {
            return res.json().then((d: { erreur?: string }) => {
              throw new Error(d.erreur || 'Identifiants incorrects')
            })
          }
          return res.json() as Promise<AuthenticatedUser>
        })
        .then((user) => {
          if (!user.isActive) {
            throw new Error('Ce compte n\'a pas les droits institution.')
          }
          if (user.role !== 'institution') {
            throw new Error('Ce compte n\'a pas les droits institution.')
          }
          if (user.forcePasswordChange) {
            throw new Error('Ce compte doit d\'abord définir un nouveau mot de passe. Contactez l\'administration Jùlaba.')
          }
          finalizeLogin(user)
        })
        .catch((err: Error) => {
          const message = err.message
          setError(
            message === 'Identifiants incorrects' || message.includes('invalide')
              ? 'Identifiants incorrects. Réessayez.'
              : message
          )
        })
        .finally(() => setLoading(false))
    },
    [finalizeLogin]
  )

  const handleLogin = useCallback(() => {
    if (!email || !password) {
      setError('Remplissez tous les champs obligatoires.')
      return
    }
    performLogin(email.trim(), password)
  }, [email, password, performLogin])

  const handleDemoLogin = useCallback(
    (account: DemoAccount) => {
      performLogin(account.email, 'admin123')
    },
    [performLogin]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) handleLogin()
    },
    [loading, handleLogin]
  )

  return (
    <div className="screen-enter flex min-h-dvh items-center justify-center bg-[#F8FAFC] p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.08)]">
        {/* Bandeau marque — univers distinct du back-office */}
        <div className="bg-[#0F172A] px-8 py-6">
          <div className="flex items-center gap-3">
            <img src="/icon-only.png" alt="" className="h-9 w-9 object-contain" />
            <div>
              <p className="text-lg font-bold text-white">Espace institution</p>
              <p className="text-xs text-slate-400">Accès partenaires — Jùlaba</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#3B82F6]/15 px-3 py-2">
            <Building2 size={14} className="text-[#93C5FD]" />
            <p className="text-xs text-[#BFDBFE]">
              Supervision du territoire en lecture seule — vue nationale agrégée.
            </p>
          </div>
        </div>

        <div className="space-y-5 px-8 py-8" onKeyDown={handleKeyDown}>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-[#0F172A]">Connexion</h1>
            <p className="text-sm text-[#64748B]">Identifiez-vous pour accéder aux indicateurs nationaux.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ins-email" className="text-sm text-[#334155]">
              Email professionnel
            </Label>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                id="ins-email"
                type="email"
                autoComplete="username"
                placeholder="vous@institution.ci"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ins-password" className="text-sm text-[#334155]">
              Mot de passe
            </Label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                id="ins-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </div>
          ) : null}

          <Button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-[#3B82F6] text-white hover:bg-[#2563EB]"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Connexion en cours…' : 'Se connecter'}
          </Button>

          {/* Comptes de démonstration — servis uniquement hors production
              (BACKOFFICE_DEMO_ACCOUNTS=true), route demo-accounts. */}
          {demoLoading ? null : demoAccounts.length > 0 ? (
            <div className="border-t border-[#E2E8F0] pt-4">
              <button
                onClick={() => setShowDemo(!showDemo)}
                className="text-sm font-medium text-[#3B82F6] hover:text-[#1D4ED8]"
                aria-expanded={showDemo}
              >
                {showDemo ? 'Masquer' : 'Afficher'} les comptes de démonstration
              </button>
              {showDemo ? (
                <ul className="mt-3 space-y-2">
                  {demoAccounts.map((account) => (
                    <li key={account.email}>
                      <button
                        onClick={() => handleDemoLogin(account)}
                        disabled={loading}
                        className={cn(
                          'w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-left transition-colors',
                          'hover:border-[#3B82F6]/40 hover:bg-[#3B82F6]/5'
                        )}
                      >
                        <p className="text-sm font-medium text-[#0F172A]">{account.name}</p>
                        <p className="text-xs text-[#64748B]">{account.email}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}