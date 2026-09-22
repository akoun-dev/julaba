'use client'

/**
 * MODE-976 (AUDIT-007 G15) — PARAMÈTRES de l'espace coopérative (le
 * profil était minimal : identité + déconnexion, aucun réglage).
 *
 * Honnêteté des réglages (leçon du BO, profile-screen:941 : « un réglage
 * qui ment est pire qu'un réglage absent ») — seuls des toggles RÉELS sont
 * exposés :
 *  - Mode Soleil (app-store.soleilMode, persisté — lisibilité extérieure) ;
 *  - Narration vocale (app-store.voiceEnabled, persisté — coupe aussi la
 *    narration de navigation de l'espace, cohérence MODE-9xx page.tsx) ;
 *  - notifications : PAS de toggle inventé (le store notifications n'a pas
 *    de préférence d'activation) — renvoi honnête vers la cloche du shell ;
 *  - session : déconnexion (même grammaire que le profil — reset du store
 *    coopérative puis logout) ;
 *  - à propos : description réelle, pas de version inventée.
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { Bell, LogOut, Moon, Volume2, Info, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CoopScreenShell } from './coop-shell'

export function CoopParametresScreen() {
  const merchantName = useAppStore((s) => s.merchantName)
  const merchantId = useAppStore((s) => s.merchantId)
  const logout = useAppStore((s) => s.logout)
  const soleilMode = useAppStore((s) => s.soleilMode)
  const toggleSoleil = useAppStore((s) => s.toggleSoleil)
  const voiceEnabled = useAppStore((s) => s.voiceEnabled)
  const toggleVoice = useAppStore((s) => s.toggleVoice)
  const reset = useCooperativeStore((s) => s.reset)

  const seDeconnecter = () => {
    reset()
    logout()
  }

  return (
    <CoopScreenShell>
      <header className="px-4 pt-5 pb-2">
        <h1 className="text-xl font-bold text-stone-900">Paramètres</h1>
        <p className="text-sm text-stone-500">Réglages de l&apos;espace coopérative</p>
      </header>

      {/* Affichage & voix — toggles réels (app-store, persistés) */}
      <section className="px-4 mt-3" aria-label="Affichage et son">
        <Card>
          <CardContent className="p-0 divide-y divide-stone-100">
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <Moon className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">Mode Soleil</p>
                  <p className="text-xs text-stone-500 leading-snug">
                    Contrastes renforcés pour l&apos;extérieur (marché, champ).
                  </p>
                </div>
              </div>
              <Switch
                checked={soleilMode}
                onCheckedChange={toggleSoleil}
                aria-label="Activer ou désactiver le Mode Soleil"
              />
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <Volume2 className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">Narration vocale</p>
                  <p className="text-xs text-stone-500 leading-snug">
                    Tata annonce chaque écran de l&apos;espace coopérative.
                  </p>
                </div>
              </div>
              <Switch
                checked={voiceEnabled}
                onCheckedChange={toggleVoice}
                aria-label="Activer ou désactiver la narration vocale"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Notifications — renvoi honnête, pas de toggle inventé */}
      <section className="px-4 mt-3" aria-label="Notifications">
        <button
          onClick={() => useAppStore.getState().navigate('coop-home')}
          className="w-full text-left"
          aria-label="Voir le centre de notifications depuis l'accueil"
        >
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Bell className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900">Notifications</p>
                <p className="text-xs text-stone-500 leading-snug">
                  Votre centre de notifications est la cloche en haut de l&apos;écran.
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
            </CardContent>
          </Card>
        </button>
      </section>

      {/* À propos — description réelle, pas de version inventée */}
      <section className="px-4 mt-3" aria-label="À propos">
        <Card>
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
              <p className="text-sm font-semibold text-stone-900">À propos de Jùlaba</p>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              L&apos;espace coopérative réunit vos membres autour d&apos;une trésorerie
              validée, d&apos;un stock commun et d&apos;achats groupés. Connecté en tant
              que président{merchantName ? ` : ${merchantName}` : ''}.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Session — même grammaire que le profil (reset puis logout) */}
      <section className="px-4 mt-4 mb-4" aria-label="Session">
        {merchantId ? (
          <Button
            variant="outline"
            onClick={seDeconnecter}
            className="w-full h-12 min-h-[44px] text-red-700 border-red-200 hover:bg-red-50"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Se déconnecter
          </Button>
        ) : (
          <p className="text-xs text-stone-400 text-center">
            Aucune session active — reconnectez-vous depuis l&apos;écran d&apos;accueil.
          </p>
        )}
      </section>
    </CoopScreenShell>
  )
}
