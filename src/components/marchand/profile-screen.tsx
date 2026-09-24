"use client"

// MODE-991 (DET-001 tranche 5) — profile-screen devient orchestrateur
// (1789 -> ~300 lignes) : modèle + persistance déplacés dans
// src/lib/marchand-profile-data.ts (testés), blocs UI déplacés
// VERBATIM dans src/components/marchand/profile/* (preuve
// octet-pour-octet via le script de chirurgie persisté). Le corps de
// ProfilScreen est inchangé ; seul le return final (écran principal)
// est délégué à ProfileMain par props de mêmes noms — JSX verbatim
// lui aussi. API publique inchangée : ProfilScreen (page.tsx +
// ré-export secondary-screens.tsx).
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { cleanupMerchantData, cleanupAllData } from '@/lib/cleanup'
import { VoixSettings } from '@/components/shared/voix-settings'
import {
  defaultProfile,
  loadMerchantProfile,
  saveMerchantProfile,
  type MerchantProfile,
} from '@/lib/marchand-profile-data'
import { type SubScreen } from '@/components/marchand/profile/profile-parts'
import { InformationsSubScreen } from '@/components/marchand/profile/profile-info'
import { SecuriteSubScreen } from '@/components/marchand/profile/profile-securite'
import { CommerceSubScreen } from '@/components/marchand/profile/profile-commerce'
import { CommuneSubScreen } from '@/components/marchand/profile/profile-commune'
import { AffichageSubScreen } from '@/components/marchand/profile/profile-affichage'
import { NotificationsSubScreen } from '@/components/marchand/profile/profile-notifications'
import { FaqSubScreen } from '@/components/marchand/profile/profile-faq'
import { AproposSubScreen } from '@/components/marchand/profile/profile-apropos'
import { ProfileMain } from '@/components/marchand/profile/profile-main'
import { SupportAideScreen } from '@/components/shared/support-aide-screen'

// Sous-écran « Voix & Langue » — extrait vers le composant partagé
// src/components/shared/voix-settings.tsx (NORM-301 : les deux espaces
// marchand/producteur rendent exactement les mêmes cartes ; le marchand
// ajoute la carte « Confirmation vocale » (concerne les ventes) et le
// mode soleil).

// ============================================================
// MAIN PROFIL SCREEN
// ============================================================

export function ProfilScreen() {
  const {
    darkMode,
    soleilMode,
    goBack,
    merchantName,
    merchantPhone,
    merchantId,
    navigate,
    logout,
  } = useAppStore()

  const [subScreen, setSubScreen] = useState<SubScreen>(null)
  const initialized = useRef(false)
  const profileRef = useRef<MerchantProfile>(defaultProfile)
  const [profile, setProfileState] = useState<MerchantProfile>(defaultProfile)

  // MODE-938 (AUDIT-003 F-09) — « Points fidélité » n'existait nulle part :
  // profile.score n'était JAMAIS écrit. La carte affiche désormais le score
  // JULABA réel (GET /api/scores/me, même source que « Ma coopérative »).
  // null = pas encore chargé / hors ligne — jamais de chiffre inventé.
  const [scoreJulaba, setScoreJulaba] = useState<number | null>(null)
  useEffect(() => {
    if (!merchantId) return
    let annule = false
    void (async () => {
      try {
        const res = await fetch(`/api/scores/me?merchantId=${encodeURIComponent(merchantId)}`)
        if (!res.ok) return
        const data = (await res.json()) as { score?: number }
        if (!annule && typeof data.score === 'number') setScoreJulaba(data.score)
      } catch {
        // hors ligne : la statistique reste neutre
      }
    })()
    return () => { annule = true }
  }, [merchantId])

  // Load profile once when merchantPhone is available
  useEffect(() => {
    if (!merchantPhone || initialized.current) return
    initialized.current = true
    const loaded = loadMerchantProfile(merchantPhone)
    // Seed firstName from store if profile is fresh
    if (!loaded.firstName && merchantName) {
      loaded.firstName = merchantName
    }
    profileRef.current = loaded
    // Use rAF to defer setState out of effect sync
    requestAnimationFrame(() => {
      setProfileState(loaded)
    })
  }, [merchantPhone])

  const setProfile = useCallback(
    (updated: MerchantProfile) => {
      setProfileState(updated)
      if (merchantPhone) {
        saveMerchantProfile(merchantPhone, updated)
      }
    },
    [merchantPhone]
  )

  const handleLogout = () => {
    tataSpeak('À bientôt !')
    haptic('medium')
    // Logout ciblé : on ne purge que CE compte (cache unifié multiUser) —
    // les autres comptes enregistrés sur l'appareil restent connectables
    // hors ligne.
    cleanupMerchantData(merchantPhone || undefined)
    logout()
  }

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDeleteAccount = () => {
    cleanupAllData()
    haptic('heavy')
    logout()
  }

  const handlePhotoUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (file.size > 500 * 1024) {
        tataSpeak('Photo trop lourde. Choisissez une image de moins de 500 Ko.')
        haptic('error')
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        setProfile({ ...profile, photoDataUrl: dataUrl })
        haptic('success')
        tataSpeak('Belle photo !')
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const handleSubScreenOpen = (screen: SubScreen) => {
    haptic('light')
    setSubScreen(screen)
    const phrases: Record<string, string> = {
      informations: 'Tu peux modifier tes informations ici.',
      securite: 'Gère la sécurité de ton compte.',
      commerce: 'Modifie les informations de ton commerce.',
      commune: 'Choisis ta commune ici. Elle aide ta coopérative à filtrer ses membres.',
      voix: 'Paramètres de la voix et du langage.',
      affichage: 'Ajuste l\'affichage à ta convenance.',
      notifications: 'Choisis tes notifications.',
      faq: 'Trouve les réponses à tes questions.',
      apropos: 'À propos de Jùlaba.',
      support: 'Le support JùLABA est là pour t’aider.',
    }
    if (screen && phrases[screen]) {
      tataSpeak(phrases[screen])
    }
  }

  const tc = soleilMode ? 'text-black' : ''

  // Derive display values
  const displayName =
    profile.firstName || merchantName || 'Marchand Jùlaba'
  const initials = (
    (profile.firstName?.[0] || merchantName?.[0] || '') + (profile.lastName?.[0] || '')
  ).toUpperCase() || 'J'
  const displayPhone = merchantPhone
    ? (() => {
        const digits = merchantPhone.replace(/[^\d]/g, '')
        if (digits.length === 10) {
          return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '+225 $1 $2 $3 $4 $5')
        }
        return merchantPhone
      })()
    : ''
  const memberSince = profile.memberSince
    ? new Date(profile.memberSince).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
      })
    : 'Récente'

  // Render sub-screens
  if (subScreen === 'informations') {
    return (
      <InformationsSubScreen
        profile={profile}
        setProfile={setProfile}
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'securite') {
    return (
      <SecuriteSubScreen
        profile={profile}
        setProfile={setProfile}
        phone={merchantPhone || ''}
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'commerce') {
    return (
      <CommerceSubScreen
        profile={profile}
        setProfile={setProfile}
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'commune') {
    return <CommuneSubScreen soleilMode={soleilMode} onBack={() => setSubScreen(null)} />
  }
  if (subScreen === 'voix') {
    return (
      <VoixSettings
        title="Voix & Langue"
        soleilMode={soleilMode}
        showConfirmation
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'affichage') {
    return (
      <AffichageSubScreen
        profile={profile}
        setProfile={setProfile}
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'notifications') {
    return (
      <NotificationsSubScreen
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'faq') {
    return <FaqSubScreen soleilMode={soleilMode} onBack={() => setSubScreen(null)} />
  }
  if (subScreen === 'apropos') {
    return <AproposSubScreen soleilMode={soleilMode} onBack={() => setSubScreen(null)} />
  }
  if (subScreen === 'support') {
    return <SupportAideScreen onBack={() => setSubScreen(null)} accentColor="#C66A2C" actorLabel="marchand" soleilMode={soleilMode} />
  }

  // Main profile screen
  return (
    <ProfileMain
      goBack={goBack}
      soleilMode={soleilMode}
      profile={profile}
      displayName={displayName}
      initials={initials}
      displayPhone={displayPhone}
      memberSince={memberSince}
      scoreJulaba={scoreJulaba}
      tc={tc}
      handlePhotoUpload={handlePhotoUpload}
      handleSubScreenOpen={handleSubScreenOpen}
      onSupport={() => handleSubScreenOpen('support')}
      navigate={navigate}
      showLogoutConfirm={showLogoutConfirm}
      setShowLogoutConfirm={setShowLogoutConfirm}
      handleLogout={handleLogout}
      handleDeleteAccount={handleDeleteAccount}
      showDeleteConfirm={showDeleteConfirm}
      setShowDeleteConfirm={setShowDeleteConfirm}
      confirmDeleteAccount={confirmDeleteAccount}
    />
  )
}
