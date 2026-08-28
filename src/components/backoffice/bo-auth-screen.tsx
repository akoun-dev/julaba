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
interface LoginChallenge {
  challengeId: string
  expiresAt: string
  email: string
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
}

type Step = 'credentials' | 'mfa' | 'success'

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
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([])
  const [demoLoading, setDemoLoading] = useState(true)

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

  const handleMfaComplete = useCallback(
    (code: string) => {
      if (code.length !== 6 || !challenge) return
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
          setStep('success')
          setTimeout(() => {
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
        })
        .catch((err) => {
          setError(err.message || 'Code de vérification incorrect')
          setVerifying(false)
          setOtpResetKey((k) => k + 1)
        })
    },
    [challenge, setBoAuth, setAuth, setUserRole, navigate]
  )

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
            <span className="bo-auth-logo-letter">J</span>
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
              <span>J</span>
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
                  : 'Authentification réussie'}
            </h2>
            <p className="bo-auth-subtitle">
              {step === 'credentials'
                ? 'Entrez vos identifiants pour accéder au backoffice'
                : step === 'mfa'
                  ? `Code envoyé à ${email}`
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

              {/* Demo toggle */}
              <button
                className="bo-auth-demo-toggle"
                onClick={() => setShowDemo(!showDemo)}
              >
                {showDemo ? 'Masquer' : 'Afficher'} les comptes de démonstration
              </button>

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

              <p className="bo-auth-mfa-desc">
                Authentification à deux facteurs requise après la connexion.
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

              <p className="bo-auth-mfa-demo-hint">
                Environnement de démonstration : aucun fournisseur SMS/e-mail
                n&rsquo;est connecté, le code est journalisé côté serveur.
              </p>

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
          min-height: 100vh;
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
        }

        /* ---------- CARD ---------- */
        .bo-auth-card {
          background: linear-gradient(165deg, rgba(30, 32, 42, 0.95), rgba(18, 19, 25, 0.98));
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          padding: 28px;
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
