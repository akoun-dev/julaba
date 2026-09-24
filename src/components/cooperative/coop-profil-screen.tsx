'use client'

/**
 * MODE-921 — Profil du coopérateur (président) : informations réelles du
 * compte et de la coopérative + déconnexion (même grammaire que les
 * autres espaces — logout purge l'état de navigation, le store
 * coopérative suit).
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { Users, LogOut, MapPin, Building2, Phone, Settings, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CoopScreenShell } from './coop-shell'
import { ActorProfileFooter } from '@/components/shared/actor-profile-footer'
import { SupportAideScreen } from '@/components/shared/support-aide-screen'
import { useState } from 'react'

export function CoopProfilScreen() {
  const merchantName = useAppStore((s) => s.merchantName)
  const merchantPhone = useAppStore((s) => s.merchantPhone)
  const logout = useAppStore((s) => s.logout)
  const navigate = useAppStore((s) => s.navigate)
  const cooperative = useCooperativeStore((s) => s.cooperative)
  const reset = useCooperativeStore((s) => s.reset)
  const [showSupport, setShowSupport] = useState(false)

  const seDeconnecter = () => {
    reset()
    logout()
  }

  if (showSupport) {
    return <CoopScreenShell><SupportAideScreen onBack={() => setShowSupport(false)} accentColor={COOP_COLOR} actorLabel="coopérateur" /></CoopScreenShell>
  }

  return (
    <CoopScreenShell>
      {/* MODE-974 (G11) — habillage porté par le shell. */}
      <header className="px-4 pt-5 pb-2">
        <h1 className="text-xl font-bold text-foreground">Mon profil</h1>
        <p className="text-sm text-muted-foreground">Espace coopérative</p>
      </header>

      <section className="px-4 mt-3 space-y-3" aria-label="Informations du profil">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COOP_COLOR}15` }}>
                <Users className="w-6 h-6" style={{ color: COOP_COLOR }} />
              </div>
              <div>
                <p className="font-semibold text-foreground">{merchantName ?? 'Président(e)'}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {merchantPhone ?? '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">Coopérative</p>
            {cooperative ? (
              <>
                <p className="font-semibold text-foreground flex items-center gap-2">
                  <Building2 className="w-4 h-4 shrink-0" style={{ color: COOP_COLOR }} />
                  {cooperative.nom}
                </p>
                {cooperative.commune && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4 shrink-0 text-muted-foreground/80" />
                    {cooperative.commune}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune coopérative chargée — votre espace apparaît après la connexion.
              </p>
            )}
          </CardContent>
        </Card>

        {/* MODE-976 (G15) — accès aux paramètres de l'espace (réglages
            réels : Mode Soleil, narration vocale, session). */}
        <button
          onClick={() => navigate('coop-parametres')}
          className="w-full text-left"
          aria-label="Ouvrir les paramètres"
        >
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Settings className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Paramètres</p>
                <p className="text-xs text-muted-foreground">Affichage, voix, session</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/80 shrink-0" />
            </CardContent>
          </Card>
        </button>

        <Button
          variant="outline"
          onClick={seDeconnecter}
          className="w-full h-12 min-h-[44px] text-red-700 border-red-200 hover:bg-red-50"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Se déconnecter
        </Button>
      </section>

      <ActorProfileFooter accentColor={COOP_COLOR} onSupport={() => setShowSupport(true)} />
    </CoopScreenShell>
  )
}
