'use client'

import { PROD_COLOR } from '@/lib/design-tokens'
import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, Phone, MapPin, Star, LogOut, Award, BarChart3, Mic, Bell, Moon,
  ChevronRight, Settings2, Download, Headphones,
} from 'lucide-react'
import { NotificationPreferencesScreen } from '@/components/shared/notification-preferences-screen'
import { VoixSettings } from '@/components/shared/voix-settings'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  buildRapportProducteurCsv,
  resumerRapportProducteur,
  type RapportProducteurServeur,
} from '@/lib/producteur/rapport'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { cn } from '@/lib/utils'
import { cleanupProducteurData } from '@/lib/cleanup'
import { getSimpleNotifPrefs, setSimpleNotifPrefs } from '@/lib/notification-preferences'
import { SupportAideScreen } from '@/components/shared/support-aide-screen'


// Token unique pour tous les interrupteurs du profil (répété en dur avant).
const SWITCH_CLS = 'data-[state=checked]:bg-[#2E8B57]'

// Sous-écran « Voix » producteur — extrait vers le composant partagé
// src/components/shared/voix-settings.tsx (NORM-301 : mêmes cartes que
// l'espace marchand ; accent vert SWITCH_CLS, titre propre, note de
// portée — la carte « Confirmation vocale » reste marchand seule).

export function ProdProfilScreen() {
  const { darkMode, toggleDarkMode, soleilMode, goBack, merchantName, merchantPhone, merchantSexe, merchantId, logout, voiceEnabled, toggleVoice, wakeWordEnabled, toggleWakeWord } = useAppStore()
  const { reputation } = useProducteurStore()
  const textClass = soleilMode ? 'text-black' : ''
  const initials = (merchantName || 'K').charAt(0).toUpperCase()
  const honorific = merchantSexe === 'feminin' ? 'Maman' : 'Papa'

  // MODE-979 (DET-COOP-008) — « Ma commune » : le producteur déclare sa
  // commune dans le référentiel GPS (41 communes). Sans commune, ses
  // récoltes n'ont pas de distance dans la vue « Récoltes prévues » des
  // coopératives (elles restent listées, en fin de liste, sans distance
  // inventée). L'annuaire charge une fois ; le choix courant est lu
  // serveur (null = « non définie », pas de valeur inventée).
  const [communes, setCommunes] = useState<{ id: string; nom: string; region: string }[]>([])
  const [communesErreur, setCommunesErreur] = useState(false)
  const [communeEnCours, setCommuneEnCours] = useState(false)

  useEffect(() => {
    let annule = false
    Promise.all([
      fetch('/api/communes').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      merchantId
        ? fetch(`/api/producteur/profil/commune?producteurId=${encodeURIComponent(merchantId)}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        : Promise.resolve({ commune: null }),
    ])
      .then(([annuaire, courant]) => {
        if (annule) return
        setCommunes((annuaire.communes ?? []) as { id: string; nom: string; region: string }[])
        const c = courant?.commune as { id: string; nom: string } | null | undefined
        if (c?.id) useProducteurStore.setState({ commune: { id: c.id, nom: c.nom } })
      })
      .catch(() => {
        if (!annule) setCommunesErreur(true)
      })
    return () => {
      annule = true
    }
  }, [merchantId])

  const communeCourante = useProducteurStore((s) => s.commune)
  const changerCommune = useProducteurStore((s) => s.changerCommune)

  const choisirCommune = async (communeId: string) => {
    if (!merchantId || communeEnCours) return
    const commune = communes.find((c) => c.id === communeId)
    if (!commune) return
    setCommuneEnCours(true)
    try {
      await changerCommune(merchantId, communeId, commune.nom)
      tataSpeak(`Commune enregistrée : ${commune.nom}.`)
    } catch {
      tataSpeak('Choix impossible pour le moment.')
      haptic('error')
    } finally {
      setCommuneEnCours(false)
    }
  }

  // Sous-écran voix (volume, vitesse, test, Piper, Gemma) — ouvert depuis
  // la carte Compte & préférences, sans route dédiée (même logique que les
  // sous-écrans du profil marchand).
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  // Sous-écran préférences de notifications (Task 28 — parité marchand).
  const [showNotifPrefs, setShowNotifPrefs] = useState(false)
  const [showSupport, setShowSupport] = useState(false)

  // 'systeme' is the only mutable category outside marchand (which also has
  // 'tontines') — covers sync-conflict alerts and admin announcements.
  const [systemeNotif, setSystemeNotif] = useState(() => getSimpleNotifPrefs('producteur').systeme)
  const toggleSystemeNotif = (checked: boolean) => {
    setSystemeNotif(checked)
    setSimpleNotifPrefs('producteur', { systeme: checked })
  }

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const handleLogout = () => {
    cleanupProducteurData(merchantPhone || undefined)
    logout()
  }

  // MODE-947 (AUDIT-003 D-3) — rapport cycles & récoltes servi par le
  // serveur : résumé parlé puis CSV (partage natif ou téléchargement).
  const [rapportEtat, setRapportEtat] = useState<'repos' | 'chargement'>('repos')
  const [rapportErreur, setRapportErreur] = useState<string | null>(null)

  const handleRapport = async () => {
    if (!merchantId) return
    setRapportEtat('chargement')
    setRapportErreur(null)
    try {
      const res = await fetch(`/api/producteur/rapport?producteurId=${encodeURIComponent(merchantId)}`)
      if (!res.ok) throw new Error(String(res.status))
      const rapport = await res.json() as RapportProducteurServeur
      tataSpeak(resumerRapportProducteur(rapport))
      const csv = buildRapportProducteurCsv(rapport, {
        genereLe: new Date().toLocaleString('fr-FR'),
      })
      const nom = 'rapport-producteur.csv'
      if (Capacitor.isNativePlatform()) {
        const ecrit = await Filesystem.writeFile({
          path: nom,
          data: csv,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
        await Share.share({ title: nom, url: ecrit.uri, dialogTitle: 'Partager mon rapport' })
      } else {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = nom
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      setRapportErreur('Rapport serveur indisponible (hors ligne ?) — réessayez quand la connexion revient.')
      tataSpeak('Rapport serveur indisponible. Réessayez quand la connexion revient.')
      haptic('error')
    } finally {
      setRapportEtat('repos')
    }
  }

  if (showVoiceSettings) {
    return (
      <VoixSettings
        title="Réglages de la voix"
        switchClassName={SWITCH_CLS}
        footerNote="Ces réglages s'appliquent à toutes les voix de l'espace producteur."
        onBack={() => setShowVoiceSettings(false)}
      />
    )
  }

  if (showSupport) {
    return <SupportAideScreen accentColor={PROD_COLOR} actorLabel="producteur" onBack={() => setShowSupport(false)} />
  }

  if (showNotifPrefs) {
    return (
      <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowNotifPrefs(false)} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold">Préférences de notifications</h1>
          </div>
        </div>
        <div className="px-4 mt-4 pb-4">
          <NotificationPreferencesScreen accentColor={PROD_COLOR} onBack={() => setShowNotifPrefs(false)} />
        </div>
      </div>
    )
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mon profil</h1>
      </div>

      <div className="px-4 mt-5 flex flex-col items-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center border-2"
          style={{ backgroundColor: `${PROD_COLOR}15`, borderColor: `${PROD_COLOR}4d` }}
        >
          <span className="text-2xl font-bold" style={{ color: PROD_COLOR }}>{initials}</span>
        </div>
        <h2 className={cn('text-lg font-bold mt-3', textClass)}>{honorific} {merchantName || 'Kouadio'}</h2>
        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
          <MapPin className="w-3.5 h-3.5" /> Exploitation agricole
        </p>
        <div className="flex items-center gap-1 mt-2 text-sm">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          <span className="font-semibold">{reputation.note}</span>
          <span className="text-muted-foreground">({reputation.avisCount} avis)</span>
        </div>
      </div>

      <div className="px-4 mt-6">
        {/* Compte + préférences regroupés — l'ancienne version éparpillait
            5 réglages dans 6 cartes séparées. */}
        <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
            Compte &amp; préférences
        </h3>
        <Card>
          <CardContent className="p-0 divide-y">
            <div className="flex items-center gap-3 p-4">
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-stone-800 flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-slate-600 dark:text-stone-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Téléphone</p>
                <p className={cn('text-sm font-medium', textClass)}>{merchantPhone || '—'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowVoiceSettings(true)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
              aria-label="Ouvrir les réglages de la voix"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${PROD_COLOR}15` }}>
                <Settings2 className="w-4 h-4" style={{ color: PROD_COLOR }} />
              </div>
              <div className="min-w-0 flex-1">
                <span className={cn('text-sm font-medium', textClass)}>Réglages de la voix</span>
                <p className="text-xs text-muted-foreground">Volume, vitesse, test et voix haute qualité</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => setShowNotifPrefs(true)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
              aria-label="Ouvrir les préférences de notifications"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${PROD_COLOR}15` }}>
                <Bell className="w-4 h-4" style={{ color: PROD_COLOR }} />
              </div>
              <div className="min-w-0 flex-1">
                <span className={cn('text-sm font-medium', textClass)}>Préférences de notifications</span>
                <p className="text-xs text-muted-foreground">Ventes, récoltes, synchronisation, sécurité…</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={cn('text-sm font-medium', textClass)}>Voix activée</span>
              </div>
              <Switch checked={voiceEnabled} onCheckedChange={toggleVoice} className={SWITCH_CLS} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <span className={cn('text-sm font-medium', textClass)}>Mot d&apos;appel &quot;Julaba&quot;</span>
                  <p className="text-xs text-muted-foreground">Dites &quot;Julaba&quot; pour activer la voix</p>
                </div>
              </div>
              <Switch checked={wakeWordEnabled} onCheckedChange={toggleWakeWord} className={SWITCH_CLS} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <span className={cn('text-sm font-medium', textClass)}>Notifications système</span>
                  <p className="text-xs text-muted-foreground">Alertes de synchronisation et annonces Jùlaba</p>
                </div>
              </div>
              <Switch checked={systemeNotif} onCheckedChange={toggleSystemeNotif} className={SWITCH_CLS} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={cn('text-sm font-medium', textClass)}>Mode sombre</span>
              </div>
              <Switch checked={darkMode} onCheckedChange={toggleDarkMode} className={SWITCH_CLS} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MODE-979 (DET-COOP-008) — déclaration de commune : condition de
          la distance Haversine des « Récoltes prévues » (julaba-app §4.3). */}
      <div className="px-4 mt-6">
        <Card>
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0" style={{ color: PROD_COLOR }} />
              <span className={cn('text-sm font-semibold', textClass)}>Ma commune</span>
            </div>
            <p className={cn('text-xs text-muted-foreground', textClass)}>
              {communeCourante
                ? `Commune déclarée : ${communeCourante.nom}.`
                : "Aucune commune déclarée — vos récoltes n'apparaîtront pas triées par proximité."}
            </p>
            {communesErreur ? (
              <p className="text-xs text-amber-600">Annuaire des communes indisponible (hors ligne ?) — réessayez plus tard.</p>
            ) : communes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chargement de l&apos;annuaire…</p>
            ) : (
              <Select
                value={communeCourante?.id ?? ''}
                onValueChange={(v) => void choisirCommune(v)}
                disabled={communeEnCours || !merchantId}
              >
                <SelectTrigger className="w-full h-11 min-h-[44px]" aria-label="Choisir ma commune">
                  <SelectValue placeholder="Choisir ma commune" />
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
          </CardContent>
        </Card>
      </div>

      {/* Réputation détaillée */}
      <div className="px-4 mt-6">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Ma réputation
        </h3>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className={cn('font-bold', textClass)}>{reputation.qualite}/5</p>
                <p className="text-[11px] text-muted-foreground">Qualité</p>
              </div>
              <div>
                <p className={cn('font-bold', textClass)}>{reputation.ponctualite}/5</p>
                <p className="text-[11px] text-muted-foreground">Ponctualité</p>
              </div>
              <div>
                <p className={cn('font-bold', textClass)}>{reputation.communication}/5</p>
                <p className="text-[11px] text-muted-foreground">Communication</p>
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Award className="w-4 h-4 shrink-0" style={{ color: PROD_COLOR }} />
                <span className={textClass}>{reputation.badge}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <BarChart3 className="w-4 h-4 shrink-0" style={{ color: PROD_COLOR }} />
                <span className={textClass}>{reputation.classement}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MODE-947 (AUDIT-003 D-3) — rapport cycles & récoltes : un seul
          bouton, la lecture serveur parle puis le CSV part en partage /
          téléchargement. Échec réseau = raison dite, jamais de chiffre
          fabriqué localement. */}
      <div className="px-4 mt-6">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 shrink-0" style={{ color: PROD_COLOR }} />
              <span className={cn('text-sm font-semibold', textClass)}>Mon rapport</span>
            </div>
            <p className={cn('text-xs text-muted-foreground', textClass)}>
              Vos cycles de culture, récoltes et ventes — tels qu&apos;enregistrés sur le serveur.
            </p>
            <Button
              variant="outline"
              className="w-full h-11"
              disabled={rapportEtat === 'chargement' || !merchantId}
              onClick={() => void handleRapport()}
            >
              <Download className="w-4 h-4 mr-2" aria-hidden="true" />
              {rapportEtat === 'chargement' ? 'Rapport en cours de lecture…' : 'Lire et partager mon rapport'}
            </Button>
            {rapportErreur && (
              <p className="text-xs text-amber-600">{rapportErreur}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Headphones className="w-5 h-5" style={{ color: PROD_COLOR }} />
              <div className="min-w-0 flex-1">
                <p className={cn('font-semibold text-sm', textClass)}>Support & Aide JÙLABA</p>
                <p className="text-xs text-muted-foreground mt-1">Besoin d'aide ou d'assistance ?</p>
              </div>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setShowSupport(true)} aria-label="Ouvrir le support">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-6">
        <Button
          variant="outline"
          className="w-full h-12 gap-2 text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => setShowLogoutConfirm(true)}
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </Button>
      </div>

      {/* Modale de confirmation de déconnexion */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader className="items-center text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1 bg-red-500/10">
              <LogOut className="w-7 h-7 text-red-600" />
            </div>
            <AlertDialogTitle className="text-base">Se déconnecter ?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Vous pourrez vous reconnecter à tout moment avec votre numéro et votre code secret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
              onClick={() => { setShowLogoutConfirm(false); handleLogout() }}
            >
              Se déconnecter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
