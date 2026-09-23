"use client"

// MODE-991 (DET-001 tranche 5) — bloc déplacé VERBATIM de
// profile-screen.tsx (preuve octet-pour-octet via le script de
// chirurgie persisté) ; comportement inchangé. Substitution
// documentée : déclaration « export »ée.
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { ArrowLeft, Eye, Sun, Moon } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { type MerchantProfile } from '@/lib/marchand-profile-data'
import { cn } from '@/lib/utils'

// ============================================================
// SUB-SCREEN: AFFICHAGE
// ============================================================

export function AffichageSubScreen({
  profile,
  setProfile,
  soleilMode,
  onBack,
}: {
  profile: MerchantProfile
  setProfile: (p: MerchantProfile) => void
  soleilMode: boolean
  onBack: () => void
}) {
  const { toggleSoleil, darkMode, toggleDarkMode } = useAppStore()

  const handleTextSizeChange = (value: number[]) => {
    const textSize = value[0]
    const updated = {
      ...profile,
      preferences: { ...profile.preferences, textSize },
    }
    setProfile(updated)
    // Apply zoom to root element
    document.documentElement.style.setProperty('--julaba-zoom', textSize.toString())
  }

  const tc = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Affichage</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-6">
        {/* Text size */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm font-medium', tc)}>Taille du texte <span className="text-xs text-muted-foreground">(bientôt)</span></span>
              </div>
              <span className="text-sm text-muted-foreground">{profile.preferences.textSize.toFixed(1)}x</span>
            </div>
            <Slider
              value={[profile.preferences.textSize]}
              onValueChange={handleTextSizeChange}
              min={0.8}
              max={2.0}
              step={0.1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Petit</span>
              <span>Grand</span>
            </div>
          </CardContent>
        </Card>

        {/* Soleil mode */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-muted-foreground" />
                <div>
                  <span className={cn('text-sm font-medium', tc)}>Mode Soleil</span>
                  <p className="text-xs text-muted-foreground">Contraste élevé pour l'extérieur</p>
                </div>
              </div>
              <Switch checked={soleilMode} onCheckedChange={toggleSoleil} />
            </div>
          </CardContent>
        </Card>

        {/* MODE-983 (DET-UI-015) — le réglage « sombre » est réactivé : la
            surface marchand/producteur est convertie aux jetons sémantiques
            (bg-card, text-foreground…) et la coopérative l'était dès
            MODE-981, le thème s'applique donc intégralement sur les rôles
            à surface convertie. La classe `.dark` est posée sur html/body
            par page.tsx (darkRole). Exclusivité Soleil gérée au store. */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-muted-foreground" />
                <div>
                  <span className={cn('text-sm font-medium', tc)}>Thème sombre</span>
                  <p className="text-xs text-muted-foreground">Confort visuel en faible lumière</p>
                </div>
              </div>
              <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
