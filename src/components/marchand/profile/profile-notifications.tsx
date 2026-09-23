"use client"

// MODE-991 (DET-001 tranche 5) — bloc déplacé VERBATIM de
// profile-screen.tsx (preuve octet-pour-octet via le script de
// chirurgie persisté) ; comportement inchangé. Substitution
// documentée : déclaration « export »ée.
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { haptic } from '@/lib/voice/tata-tts'
import { NotificationPreferencesScreen } from '@/components/shared/notification-preferences-screen'

// ============================================================
// SUB-SCREEN: NOTIFICATIONS
// ============================================================

// Only categories that actually gate a real notification (see
// src/lib/notification-preferences.ts) belong here — this used to list 8
// categories (ventes, stockBas, objectifs, promotions, academy…) that no
// notification ever existed for, so toggling them silently did nothing.

export function NotificationsSubScreen({
  soleilMode,
  onBack,
}: {
  soleilMode: boolean
  onBack: () => void
}) {
  // Task 28 : préférences de notifications enrichies (une préférence par
  // catégorie : tout / important / jamais + toasts + historique + mode
  // silencieux), composant partagé avec l'espace producteur. Les anciennes
  // clés du profil marchand (tontines/systeme) sont reprises par la
  // migration v2 de notification-preferences.ts.
  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Notifications</h1>
        </div>
      </div>

      <div className="px-4 mt-4 pb-4">
        <NotificationPreferencesScreen accentColor="#C66A2C" onBack={onBack} />
      </div>
    </div>
  )
}
