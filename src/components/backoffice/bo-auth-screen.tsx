'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { useBackofficeStore, type BoRole, ROLE_LABELS } from '@/lib/stores/backoffice-store'
import { OrbitOtp } from './orbit-otp'
import { ArrowLeft, Shield, Fingerprint, CheckCircle2, Lock, KeyRound } from 'lucide-react'

// Types for demo accounts from API (no password exposed)
interface DemoAccount {
  email: string
  name: string
  role: string
  zone: string | null
}

// Response from POST /api/backoffice/login: password verified, MFA challenge
// issued server-side. No session/user data is returned (and no cookie set)
// until the challenge is verified.
// MODE-934 (AUDIT-003 S-02) : MFA par TOTP (application d'authentification).
// - mfaMode 'totp' : code à 6 chiffres depuis l'appli ; 'enroll' : premier
//   login → provisioning (secret + URI otpauth + codes de récupération à
//   conserver) ; 'test' : ancien chemin inline (dev uniquement).
interface LoginChallenge {
  challengeId: string
  expiresAt: string
  email: string
  mfaMode?: 'totp' | 'enroll' | 'test'
  secret?: string | null
  otpauthUri?: string | null
  recoveryCodes?: string[] | null
}

// Type for authenticated user from the MFA verification API
interface AuthenticatedUser {
  id: string
  email: string
  name: string
  role: string
  zone: string | null
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  /** MODE-941 (AUDIT-003 S-10) — le compte doit changer son mot de passe
   * temporaire avant d'entrer dans le back-office. */
  forcePasswordChange?: boolean
}

type Step = 'credentials' | 'mfa' | 'change-password' | 'success'

export function BoAuthScreen() {
  const { setUserRole, navigate, setAuth } = useAppStore()
  const { setBoAuth } = useBackofficeStore()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)
  const [showDemo, setShowDemo] = useState(false)
  const [otpResetKey, setOtpResetKey] = useState(0)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([])
  const [demoLoading, setDemoLoading] = useState(true)
  // MODE-941 (S-10) — interception post-login : compte à mot de passe
  // temporaire, formulaire de changement obligatoire.
  const [pendingUser, setPendingUser] = useState<AuthenticatedUser | null>(null)
  const [chgCurrent, setChgCurrent] = useState('')
  const [chgNew, setChgNew] = useState('')
  const [chgConfirm, setChgConfirm] = useState('')
  const [chgError, setChgError] = useState('')
  const [chgSaving, setChgSaving] = useState(false)

  // Fetch demo accounts from DB on mount
  useEffect(() => {
    fetch('/api/backoffice/demo-accounts')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DemoAccount[]) => setDemoAccounts(Array.isArray(data) ? data : []))
      .catch(() => setDemoAccounts([]))
      .finally(() => setDemoLoading(false))
  }, [])

  const requestChallenge = useCallback((loginEmail: string, loginPassword: string) => {
    setError('')
    setLoading(true)
    fetch('/api/backoffice/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error(d.erreur || 'Erreur') })
        return res.json()
      })
      .then((data: LoginChallenge) => {
        // MFA bypass: server returned user data directly
        if ('mfaDisabled' in data && data.mfaDisabled) {
          const user = data as unknown as AuthenticatedUser
          // MODE-941 (AUDIT-003 S-10) — le contournement MFA (BACKOFFICE_MFA_DISABLED)
          // n'annule pas le changement de mot de passe obligatoire : un compte
          // créé par le back-office avec un mot de passe temporaire doit
          // toujours poser un vrai mot de passe avant d'entrer, même quand
          // le MFA est désactivé.
          if (user.forcePasswordChange) {
            setPendingUser(user)
            setStep('change-password')
          } else {
            setStep('success')
            setTimeout(() => {
              // Actions lues via getState() : aucune valeur réactive capturée
              // dans ce callback (mémoïsation [] préservable par le
              // compilateur React) — les actions zustand sont stables.
              const { setUserRole, setAuth, navigate } = useAppStore.getState()
              const { setBoAuth } = useBackofficeStore.getState()
              setUserRole('backoffice')
              setAuth(user.email, user.name, '')
              setBoAuth({
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role as BoRole,
                zone: user.zone || undefined,
                isActive: user.isActive,
                lastLogin: user.lastLogin || undefined,
                createdAt: user.createdAt,
              })
              navigate('bo-dashboard')
            }, 600)
          }
          return
        }
        // Normal MFA flow
        setChallenge(data)
        setEmail(data.email)
        setStep('mfa')
        setOtpResetKey((k) => k + 1)
      })
      .catch((err) => {
        setError(err.message || 'Email ou mot de passe incorrect')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleLogin = useCallback(() => {
    if (!email || !password) {
      setError('Veuillez remplir tous les champs')
      return
    }
    requestChallenge(email, password)
  }, [email, password, requestChallenge])

  // MODE-941 (S-10) — suite du flux après MFA (ou après le changement de
  // mot de passe obligatoire) : ouverture de la session back-office.
  const finalizeLogin = useCallback((user: AuthenticatedUser) => {
    setUserRole('backoffice')
    setAuth(user.email, user.name, '')
    setBoAuth({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as BoRole,
      zone: user.zone || undefined,
      isActive: user.isActive,
      lastLogin: user.lastLogin || undefined,
      createdAt: user.createdAt,
    })
    navigate('bo-dashboard')
  }, [setUserRole, setAuth, setBoAuth, navigate])

  const handleMfaComplete = useCallback(
    (code: string) => {
      if (!challenge) return
      // TOTP = 6 chiffres ; code de récupération = 8 caractères (saisie libre).
      if (recoveryMode ? code.replace(/[^A-Za-z0-9]/g, '').length !== 8 : code.length !== 6) return
      setError('')
      setVerifying(true)

      fetch('/api/backoffice/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.challengeId, code }),
      })
        .then((res) => {
          if (!res.ok) return res.json().then((d) => { throw new Error(d.erreur || 'Code incorrect') })
          return res.json()
        })
        .then((user: AuthenticatedUser) => {
          // MODE-941 (AUDIT-003 S-10) — interception post-login : un compte
          // créé par le back-office (force_password_change) DOIT poser un
          // vrai mot de passe avant d'entrer — le mot de passe temporaire
          // ne donne plus jamais accès au dashboard.
          if (user.forcePasswordChange) {
            setPendingUser(user)
            setStep('change-password')
            setVerifying(false)
            return
          }
          setStep('success')
          setTimeout(() => {
            finalizeLogin(user)
          }, 600)
        })
        .catch((err) => {
          setError(err.message || 'Code de vérification incorrect')
          setVerifying(false)
          setOtpResetKey((k) => k + 1)
        })
    },
    [challenge, recoveryMode, setBoAuth, setAuth, setUserRole, navigate, finalizeLogin]
  )

  // MODE-941 (S-10) — changement de mot de passe obligatoire (compte créé
  // par le back-office avec un mot de passe temporaire). L'endpoint
  // vérifie l'actuel, impose 8 caractères minimum, efface
  // force_password_change, puis la session s'ouvre normalement.
  const handleChangePassword = useCallback(() => {
    if (!pendingUser) return
    if (!chgCurrent || !chgNew || !chgConfirm) {
      setChgError('Tous les champs sont obligatoires')
      return
    }
    if (chgNew.length < 8) {
      setChgError('Le nouveau mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (chgNew !== chgConfirm) {
      setChgError('Les deux mots de passe ne correspondent pas')
      return
    }
    setChgError('')
    setChgSaving(true)
    fetch('/api/backoffice/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: chgCurrent, newPassword: chgNew }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}) as { erreur?: string })
          throw new Error(d.erreur || 'Changement impossible')
        }
      })
      .then(() => {
        setStep('success')
        setTimeout(() => {
          finalizeLogin(pendingUser)
          setPendingUser(null)
        }, 600)
      })
      .catch((err: Error) => {
        setChgError(err.message)
      })
      .finally(() => setChgSaving(false))
  }, [pendingUser, chgCurrent, chgNew, chgConfirm, finalizeLogin])

  const handleDemoLogin = useCallback((account: DemoAccount) => {
    requestChallenge(account.email, 'admin123')
  }, [requestChallenge])

  const handleBack = useCallback(() => {
    if (step === 'mfa') {
      setStep('credentials')
      setError('')
      setVerifying(false)
      setOtpResetKey((k) => k + 1)
    } else {
      navigate('auth')
    }
  }, [step, navigate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && step === 'credentials') handleLogin()
    },
    [step, handleLogin]
  )

  return (
    <div className="bo-auth-root">
      {/* ============ LEFT PANEL — BRANDING ============ */}
      <div className="bo-auth-left">
        <div className="bo-auth-left-pattern" />
        <div className="bo-auth-left-content">
          <div className="bo-auth-logo">
            <img src="/icon-only.png" alt="Jùlaba" className="bo-auth-logo-img" />
          </div>
          <h1 className="bo-auth-left-title">
            Jùlaba
            <br />
            BackOffice
          </h1>
          <p className="bo-auth-left-desc">
            Interface d&rsquo;administration sécurisée pour la gestion des acteurs
            et l&rsquo;identification nationale.
          </p>

          {/* Security badges */}
          <div className="bo-auth-badges">
            <div className="bo-auth-badge">
              <Lock className="bo-auth-badge-icon" size={14} />
              <span>TLS 1.3</span>
            </div>
            <div className="bo-auth-badge">
              <Fingerprint className="bo-auth-badge-icon" size={14} />
              <span>MFA TOTP</span>
            </div>
            <div className="bo-auth-badge">
              <KeyRound className="bo-auth-badge-icon" size={14} />
              <span>AES-256</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============ RIGHT PANEL — FORM ============ */}
      <div className="bo-auth-right">
        <div className="bo-auth-right-inner">
          {/* Back button */}
          <button className="bo-auth-back-btn" onClick={handleBack}>
            <ArrowLeft size={16} />
            <span>Retour</span>
          </button>

          {/* Mobile logo */}
          <div className="bo-auth-mobile-logo">
            <div className="bo-auth-mobile-logo-icon">
              <img src="/icon-only.png" alt="Jùlaba" className="bo-auth-mobile-logo-img" />
            </div>
            <span className="bo-auth-mobile-logo-text">Jùlaba BackOffice</span>
          </div>

          {/* Title */}
          <div className="bo-auth-header">
            <h2 className="bo-auth-title">
              {step === 'credentials'
                ? 'Connexion'
                : step === 'mfa'
                  ? 'Vérification MFA'
                  : step === 'change-password'
                    ? 'Nouveau mot de passe'
                    : 'Authentification réussie'}
            </h2>
            <p className="bo-auth-subtitle">
              {step === 'credentials'
                ? 'Entrez vos identifiants pour accéder au backoffice'
                : step === 'mfa'
                  ? `Code envoyé à ${email}`
                  : step === 'change-password'
                    ? 'Votre compte utilise un mot de passe temporaire — choisissez-en un personnel pour continuer.'
                    : 'Redirection vers le tableau de bord…'}
            </p>
          </div>

          {/* ====== STEP: CREDENTIALS ====== */}
          {step === 'credentials' && (
            <div className="bo-auth-card">
              <div className="bo-auth-field">
                <label className="bo-auth-label">Email professionnel</label>
                <input
                  type="email"
                  className="bo-auth-input"
                  placeholder="vous@julaba.ci"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="email"
                />
              </div>

              <div className="bo-auth-field">
                <label className="bo-auth-label">Mot de passe</label>
                <input
                  type="password"
                  className="bo-auth-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="bo-auth-error">
                  <span>{error}</span>
                </div>
              )}

              <button
                className="bo-auth-submit-btn"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <span className="bo-auth-submit-loading">
                    <span className="bo-auth-spinner" />
                    Vérification…
                  </span>
                ) : (
                  'Se connecter'
                )}
              </button>

              {/* MFA notice */}
              <div className="bo-auth-mfa-notice">
                <Fingerprint size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Authentification à deux facteurs (TOTP) requise après la
                  connexion.
                </span>
              </div>

              {/* Demo toggle — masqué en production : la route ne renvoie
                  des comptes que si BACKOFFICE_DEMO_ACCOUNTS=true. */}
              {!demoLoading && demoAccounts.length > 0 && (
                <button
                  className="bo-auth-demo-toggle"
                  onClick={() => setShowDemo(!showDemo)}
                >
                  {showDemo ? 'Masquer' : 'Afficher'} les comptes de démonstration
                </button>
              )}

              {showDemo && (
                <div className="bo-auth-demo-list">
                  <p className="bo-auth-demo-hint">
                    Cliquez pour connexion rapide
                  </p>
                  {demoLoading ? (
                    <div style={{ textAlign: 'center', padding: '12px', color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
                      Chargement des comptes…
                    </div>
                  ) : demoAccounts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '12px', color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
                      Aucun compte disponible
                    </div>
                  ) : (
                    demoAccounts.map((account) => (
                      <button
                        key={account.email}
                        className="bo-auth-demo-item"
                        onClick={() => handleDemoLogin(account)}
                      >
                        <div className="bo-auth-demo-info">
                          <span className="bo-auth-demo-email">{account.name} — {account.email}</span>
                          <span className="bo-auth-demo-role">{ROLE_LABELS[account.role as BoRole] || account.role}{account.zone ? ` · ${account.zone}` : ''}</span>
                        </div>
                        <span className="bo-auth-demo-badge">{ROLE_LABELS[account.role as BoRole] || account.role}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* ====== STEP: MFA ====== */}
          {step === 'mfa' && (
            <div className="bo-auth-card">
              {/* Fingerprint icon */}
              <div className="bo-auth-mfa-icon-wrapper">
                <div className="bo-auth-mfa-icon-bg">
                  <Fingerprint size={30} />
                </div>
              </div>

              {/* MODE-934 (AUDIT-003 S-02) : TOTP — provisioning, code,
                  code de récupération. L'ancienne mention « code envoyé »
                  est supprimée : plus aucun code ne circule par le serveur. */}
              {challenge?.mfaMode === 'enroll' && (
                <div className="bo-auth-mfa-enroll">
                  <p className="bo-auth-mfa-enroll-title">
                    Configurez votre application d&rsquo;authentification (une seule fois)
                  </p>
                  <ol className="bo-auth-mfa-enroll-steps">
                    <li>Ouvrez votre application d&rsquo;authentification, puis « Saisir une clé de provision ».</li>
                    <li>Recopiez ce secret (espaces ignorés) :</li>
                  </ol>
                  <code className="bo-auth-mfa-enroll-secret">{challenge.secret}</code>
                  <p className="bo-auth-mfa-enroll-uri" title={challenge.otpauthUri ?? ''}>
                    {challenge.otpauthUri}
                  </p>
                  <p className="bo-auth-mfa-enroll-recovery-title">Codes de récupération (conservez-les — chaque code ne sert qu&rsquo;une fois) :</p>
                  <div className="bo-auth-mfa-enroll-codes">
                    {(challenge.recoveryCodes ?? []).map((c) => (
                      <code key={c}>{c}</code>
                    ))}
                  </div>
                </div>
              )}

              <p className="bo-auth-mfa-desc">
                {challenge?.mfaMode === 'enroll'
                  ? 'Saisissez le code à 6 chiffres affiché par l’application pour terminer la configuration.'
                  : challenge?.mfaMode === 'test'
                    ? 'Authentification à deux facteurs requise après la connexion.'
                    : 'Saisissez le code à 6 chiffres de votre application d’authentification.'}
              </p>

              {/* OrbitOtp component */}
              <OrbitOtp
                length={6}
                onComplete={handleMfaComplete}
                error={error || undefined}
                verifying={verifying}
                resetKey={otpResetKey}
                onResend={() => {
                  setOtpResetKey((k) => k + 1)
                  setError('')
                }}
              />

              {challenge?.mfaMode === 'test' ? (
                <p className="bo-auth-mfa-demo-hint">
                  Environnement de démonstration : le code inline est journalisé côté serveur (BACKOFFICE_MFA_TEST_MODE).
                </p>
              ) : (
                <div className="bo-auth-mfa-recovery">
                  {recoveryMode ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={recoveryInput}
                        onChange={(e) => setRecoveryInput(e.target.value)}
                        placeholder="ABCD-2345"
                        aria-label="Code de récupération"
                        maxLength={12}
                        style={{ flex: 1 }}
                        disabled={verifying}
                      />
                      <button
                        type="button"
                        className="bo-auth-mfa-back-btn"
                        onClick={() => handleMfaComplete(recoveryInput)}
                        disabled={verifying}
                      >
                        Utiliser
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="bo-auth-mfa-back-btn"
                    onClick={() => {
                      setRecoveryMode((m) => !m)
                      setRecoveryInput('')
                      setError('')
                    }}
                    disabled={verifying}
                  >
                    {recoveryMode ? 'Revenir au code TOTP' : 'Perdu l’accès ? Utiliser un code de récupération'}
                  </button>
                </div>
              )}

              {/* Back to credentials */}
              <button
                className="bo-auth-mfa-back-btn"
                onClick={() => {
                  setStep('credentials')
                  setError('')
                  setVerifying(false)
                  setOtpResetKey((k) => k + 1)
                }}
              >
                <ArrowLeft size={14} />
                Retour aux identifiants
              </button>
            </div>
          )}

          {/* ====== STEP: CHANGE-PASSWORD (MODE-941 S-10) ====== */}
          {step === 'change-password' && (
            <div className="bo-auth-card">
              <div className="bo-auth-field">
                <label className="bo-auth-label">Mot de passe temporaire (actuel)</label>
                <input
                  type="password"
                  className="bo-auth-input"
                  placeholder="••••••••"
                  value={chgCurrent}
                  onChange={(e) => setChgCurrent(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="bo-auth-field">
                <label className="bo-auth-label">Nouveau mot de passe (8 caractères minimum)</label>
                <input
                  type="password"
                  className="bo-auth-input"
                  placeholder="••••••••"
                  value={chgNew}
                  onChange={(e) => setChgNew(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="bo-auth-field">
                <label className="bo-auth-label">Confirmer le nouveau mot de passe</label>
                <input
                  type="password"
                  className="bo-auth-input"
                  placeholder="••••••••"
                  value={chgConfirm}
                  onChange={(e) => setChgConfirm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword() }}
                  autoComplete="new-password"
                />
              </div>

              {chgError && (
                <div className="bo-auth-error" role="alert">{chgError}</div>
              )}

              <button
                type="button"
                className="bo-auth-submit-btn"
                disabled={chgSaving || !chgCurrent || !chgNew || !chgConfirm}
                onClick={handleChangePassword}
              >
                {chgSaving ? 'Enregistrement…' : 'Enregistrer et continuer'}
              </button>
            </div>
          )}

          {/* ====== STEP: SUCCESS ====== */}
          {step === 'success' && (
            <div className="bo-auth-success">
              <div className="bo-auth-success-icon-wrapper">
                <CheckCircle2 className="bo-auth-success-check" size={40} />
              </div>
              <h2 className="bo-auth-success-title">Authentification réussie</h2>
              <p className="bo-auth-success-desc">
                Redirection vers le tableau de bord…
              </p>
              <div className="bo-auth-success-bar-track">
                <div className="bo-auth-success-bar-fill" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============ STYLED-JSX ============ */}
      <style jsx>{`
        /* ---------- Root ---------- */
        .bo-auth-root {
          display: flex;
          min-height: 100dvh;
          background: #121319;
          font-family: inherit;
        }

        /* ---------- LEFT PANEL ---------- */
        .bo-auth-left {
          display: none;
          width: 50%;
          position: relative;
          overflow: hidden;
          background: #0b0c10;
          flex-direction: column;
          justify-content: center;
          padding: 64px;
        }
        @media (min-width: 1024px) {
          .bo-auth-left {
            display: flex;
          }
        }

        .bo-auth-left-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.07;
          background-image: radial-gradient(circle at 25px 25px, #ffffff 1px, transparent 0);
          background-size: 40px 40px;
          pointer-events: none;
        }

        .bo-auth-left-content {
          position: relative;
          z-index: 1;
          max-width: 400px;
        }

        .bo-auth-logo {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 32px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .bo-auth-logo-letter {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1;
        }
        .bo-auth-logo-img {
          width: 40px;
          height: 40px;
          object-fit: contain;
        }

        .bo-auth-left-title {
          font-size: 36px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.15;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .bo-auth-left-desc {
          font-size: 14px;
          color: #64748b;
          line-height: 1.65;
          margin-top: 16px;
          max-width: 340px;
        }

        .bo-auth-badges {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-top: 40px;
        }
        .bo-auth-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #475569;
          font-weight: 500;
          letter-spacing: 0.02em;
        }
        .bo-auth-badge-icon {
          color: #334155;
        }

        /* ---------- RIGHT PANEL ---------- */
        .bo-auth-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          min-width: 0;
          overflow-y: auto;
        }

        .bo-auth-right-inner {
          width: 100%;
          max-width: 400px;
        }

        /* Back button */
        .bo-auth-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #475569;
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px 0;
          margin-bottom: 28px;
          transition: color 0.15s;
          font-family: inherit;
        }
        .bo-auth-back-btn:hover {
          color: #94a3b8;
        }

        /* Mobile logo */
        .bo-auth-mobile-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
        }
        @media (min-width: 1024px) {
          .bo-auth-mobile-logo {
            display: none;
          }
        }
        .bo-auth-mobile-logo-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bo-auth-mobile-logo-icon span {
          font-size: 17px;
          font-weight: 800;
          color: #0f172a;
        }
        .bo-auth-mobile-logo-img {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }
        .bo-auth-mobile-logo-text {
          font-size: 17px;
          font-weight: 700;
          color: #e2e8f0;
        }

        /* Header */
        .bo-auth-header {
          margin-bottom: 28px;
        }
        .bo-auth-title {
          font-size: 22px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .bo-auth-subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 6px 0 0;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        /* ---------- CARD ---------- */
        .bo-auth-card {
          background: linear-gradient(165deg, rgba(30, 32, 42, 0.95), rgba(18, 19, 25, 0.98));
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          padding: 28px;
          box-sizing: border-box;
          width: 100%;
          max-width: 370px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Fields */
        .bo-auth-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .bo-auth-label {
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
        }
        .bo-auth-input {
          height: 44px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #f1f5f9;
          font-size: 14px;
          font-family: inherit;
          outline: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          width: 100%;
          box-sizing: border-box;
        }
        .bo-auth-input::placeholder {
          color: #3b4255;
        }
        .bo-auth-input:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12), 0 0 16px rgba(59, 130, 246, 0.06);
          background: rgba(59, 130, 246, 0.04);
        }

        /* Error */
        .bo-auth-error {
          font-size: 13px;
          color: #f87171;
          background: rgba(239, 68, 68, 0.07);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 8px;
          padding: 8px 14px;
          line-height: 1.4;
        }

        /* Submit */
        .bo-auth-submit-btn {
          height: 44px;
          border: none;
          border-radius: 10px;
          background: #ffffff;
          color: #0f172a;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
          margin-top: 2px;
        }
        .bo-auth-submit-btn:hover:not(:disabled) {
          background: #e2e8f0;
        }
        .bo-auth-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .bo-auth-submit-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .bo-auth-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(15, 23, 42, 0.2);
          border-top-color: #0f172a;
          border-radius: 50%;
          animation: boAuthSpin 0.6s linear infinite;
        }
        @keyframes boAuthSpin {
          to { transform: rotate(360deg); }
        }

        /* MFA notice */
        .bo-auth-mfa-notice {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #475569;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          padding: 10px 12px;
          line-height: 1.5;
        }

        /* Demo toggle */
        .bo-auth-demo-toggle {
          width: 100%;
          text-align: center;
          font-size: 12px;
          color: #3b4255;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 0;
          font-family: inherit;
          transition: color 0.15s;
        }
        .bo-auth-demo-toggle:hover {
          color: #64748b;
        }

        /* Demo list */
        .bo-auth-demo-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-top: 4px;
        }
        .bo-auth-demo-hint {
          font-size: 12px;
          color: #334155;
          text-align: center;
          margin-bottom: 4px;
        }
        .bo-auth-demo-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          transition: all 0.15s;
          color: inherit;
        }
        .bo-auth-demo-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
        }
        .bo-auth-demo-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .bo-auth-demo-email {
          font-size: 13px;
          font-weight: 500;
          color: #e2e8f0;
        }
        .bo-auth-demo-role {
          font-size: 11px;
          color: #475569;
        }
        .bo-auth-demo-badge {
          font-size: 10px;
          font-weight: 500;
          color: #475569;
          background: rgba(255, 255, 255, 0.05);
          padding: 3px 10px;
          border-radius: 20px;
        }

        /* ---------- MFA STEP ---------- */
        .bo-auth-mfa-icon-wrapper {
          display: flex;
          justify-content: center;
          padding: 4px 0 0;
        }
        .bo-auth-mfa-icon-bg {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #3B82F6;
        }

        .bo-auth-mfa-desc {
          font-size: 13px;
          color: #64748b;
          text-align: center;
          line-height: 1.5;
          margin: 0;
        }

        .bo-auth-mfa-demo-hint {
          font-size: 12px;
          color: #334155;
          text-align: center;
          margin: 0;
        }

        /* MODE-934 — enrôlement TOTP (provisioning une seule fois) */
        .bo-auth-mfa-enroll {
          width: 100%;
          padding: 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bo-auth-mfa-enroll-title,
        .bo-auth-mfa-enroll-recovery-title {
          font-size: 12px;
          font-weight: 600;
          color: #cbd5e1;
          margin: 0;
        }
        .bo-auth-mfa-enroll-steps {
          font-size: 12px;
          color: #64748b;
          margin: 0;
          padding-left: 18px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .bo-auth-mfa-enroll-secret {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 14px;
          letter-spacing: 2px;
          color: #3B82F6;
          text-align: center;
          background: rgba(59, 130, 246, 0.08);
          border-radius: 8px;
          padding: 8px;
          word-break: break-all;
        }
        .bo-auth-mfa-enroll-uri {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          color: #94a3b8;
          word-break: break-all;
          margin: 0;
        }
        .bo-auth-mfa-enroll-codes {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }
        .bo-auth-mfa-enroll-codes code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          padding: 4px 2px;
          text-align: center;
        }
        .bo-auth-mfa-recovery {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }
        .bo-auth-mfa-recovery input {
          height: 40px;
          padding: 0 12px;
          font-size: 14px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          letter-spacing: 1px;
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          outline: none;
        }
        .bo-auth-mfa-recovery input:focus {
          border-color: rgba(59, 130, 246, 0.6);
        }

        .bo-auth-mfa-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          justify-content: center;
          width: 100%;
          height: 40px;
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .bo-auth-mfa-back-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
        }

        @media (max-width: 480px) {
          .bo-auth-right {
            align-items: flex-start;
            padding: 16px 12px 24px;
          }
          .bo-auth-right-inner {
            max-width: none;
          }
          .bo-auth-back-btn {
            margin-bottom: 18px;
          }
          .bo-auth-header {
            margin-bottom: 18px;
          }
          .bo-auth-card {
            max-width: none;
            border-radius: 16px;
            padding: 20px 14px;
            gap: 14px;
          }
          .bo-auth-mfa-desc,
          .bo-auth-mfa-demo-hint {
            max-width: 30rem;
            padding-inline: 4px;
          }
        }

        /* ---------- SUCCESS STEP ---------- */
        .bo-auth-success {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 48px 0;
          max-width: 370px;
          margin: 0 auto;
        }
        .bo-auth-success-icon-wrapper {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          animation: boAuthSuccessPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes boAuthSuccessPop {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .bo-auth-success-check {
          color: #10b981;
        }
        .bo-auth-success-title {
          font-size: 18px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 8px;
        }
        .bo-auth-success-desc {
          font-size: 13px;
          color: #64748b;
          margin: 0;
        }
        .bo-auth-success-bar-track {
          width: 128px;
          height: 4px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.06);
          margin-top: 24px;
          overflow: hidden;
        }
        .bo-auth-success-bar-fill {
          height: 100%;
          width: 60%;
          border-radius: 4px;
          background: #3B82F6;
          animation: boAuthPulseBar 1.2s ease-in-out infinite;
        }
        @keyframes boAuthPulseBar {
          0%, 100% { opacity: 1; width: 60%; }
          50% { opacity: 0.7; width: 80%; }
        }
      `}</style>
    </div>
  )
}
