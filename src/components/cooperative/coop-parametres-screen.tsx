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
 *
 * MODE-979 (DET-COOP-008) — « Commune de la coopérative » : le président
 * choisit SA commune dans le référentiel GPS (41 communes, /api/communes).
 * Fin du texte libre : la commune liée active le tri Haversine des
 * « Récoltes prévues » (parité julaba-app §4.3). Décision en file offline
 * (synced | queued | lost — messageDecisionCoop).
 */

import { useEffect, useState } from 'react'
import { COOP_COLOR } from '@/lib/design-tokens'
import { Bell, LogOut, Moon, Volume2, Info, ChevronRight, MapPin } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CoopScreenShell } from './coop-shell'
import { messageDecisionCoop } from './coop-ui'

interface CommuneItem {
  id: string
  nom: string
  region: string
  lat: number
  lng: number
}

export function CoopParametresScreen() {
  const merchantName = useAppStore((s) => s.merchantName)
  const merchantId = useAppStore((s) => s.merchantId)
  const logout = useAppStore((s) => s.logout)
  const soleilMode = useAppStore((s) => s.soleilMode)
  const toggleSoleil = useAppStore((s) => s.toggleSoleil)
  const voiceEnabled = useAppStore((s) => s.voiceEnabled)
  const toggleVoice = useAppStore((s) => s.toggleVoice)
  const reset = useCooperativeStore((s) => s.reset)
  const cooperative = useCooperativeStore((s) => s.cooperative)
  const changerCommuneCooperative = useCooperativeStore((s) => s.changerCommuneCooperative)

  // MODE-979 — annuaire des communes (référentiel GPS, aucune donnée
  // personnelle). Chargé une fois à l'entrée de l'écran ; échec = message
  // honnête, le reste des réglages reste utilisable.
  const [communes, setCommunes] = useState<CommuneItem[]>([])
  const [communesErreur, setCommunesErreur] = useState<string | null>(null)
  const [communeEnCours, setCommuneEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    fetch('/api/communes')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Annuaire indisponible'))))
      .then((d: { communes: CommuneItem[] }) => {
        if (!annule) setCommunes(d.communes ?? [])
      })
      .catch(() => {
        if (!annule) setCommunesErreur("Annuaire des communes indisponible — vérifiez la connexion.")
      })
    return () => {
      annule = true
    }
  }, [])

  const annoncer = (texte: string) => {
    setMessage(texte)
    window.setTimeout(() => setMessage(null), 4000)
  }

  const choisirCommune = async (communeId: string) => {
    if (!merchantId || communeEnCours) return
    const commune = communes.find((c) => c.id === communeId)
    if (!commune) return
    setCommuneEnCours(true)
    try {
      const statutSync = await changerCommuneCooperative(merchantId, communeId, commune.nom)
      annoncer(messageDecisionCoop(statutSync, `Commune de la coopérative : ${commune.nom}.`))
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Choix impossible')
    } finally {
      setCommuneEnCours(false)
    }
  }

  const seDeconnecter = () => {
    reset()
    logout()
  }

  return (
    <CoopScreenShell>
      <header className="px-4 pt-5 pb-2">
        <h1 className="text-xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Réglages de l&apos;espace coopérative</p>
      </header>

      {/* Affichage & voix — toggles réels (app-store, persistés) */}
      <section className="px-4 mt-3" aria-label="Affichage et son">
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <Moon className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Mode Soleil</p>
                  <p className="text-xs text-muted-foreground leading-snug">
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
                  <p className="text-sm font-semibold text-foreground">Narration vocale</p>
                  <p className="text-xs text-muted-foreground leading-snug">
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

      {/* Commune de la coopérative (MODE-979) — référentiel GPS, fin du
          texte libre : la commune liée active le tri Haversine des
          « Récoltes prévues ». */}
      <section className="px-4 mt-3" aria-label="Commune de la coopérative">
        <Card>
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 shrink-0" style={{ color: COOP_COLOR }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Commune de la coopérative</p>
                <p className="text-xs text-muted-foreground leading-snug">
                  {cooperative?.communeId
                    ? `Commune actuelle : ${cooperative.commune ?? 'non définie'}.`
                    : 'Aucune commune liée — les récoltes ne sont pas encore triées par proximité.'}
                </p>
              </div>
            </div>
            {communesErreur ? (
              <p className="text-xs text-red-700" role="alert">{communesErreur}</p>
            ) : communes.length === 0 ? (
              <p className="text-xs text-muted-foreground/80">Chargement de l&apos;annuaire…</p>
            ) : (
              <Select
                value={cooperative?.communeId ?? ''}
                onValueChange={(v) => void choisirCommune(v)}
                disabled={communeEnCours || !merchantId}
              >
                <SelectTrigger className="w-full h-11 min-h-[44px]" aria-label="Choisir la commune de la coopérative">
                  <SelectValue placeholder="Choisir une commune" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {communes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nom} — {c.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {message ? (
              <p className="text-xs text-foreground" role="status">{message}</p>
            ) : null}
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
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                <p className="text-xs text-muted-foreground leading-snug">
                  Votre centre de notifications est la cloche en haut de l&apos;écran.
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/80 shrink-0" />
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
              <p className="text-sm font-semibold text-foreground">À propos de Jùlaba</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
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
          <p className="text-xs text-muted-foreground/80 text-center">
            Aucune session active — reconnectez-vous depuis l&apos;écran d&apos;accueil.
          </p>
        )}
      </section>
    </CoopScreenShell>
  )
}
