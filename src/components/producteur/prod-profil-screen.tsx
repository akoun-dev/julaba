'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
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
  Volume2, Clock, Sparkles, Download, Trash2, ChevronRight, Settings2,
} from 'lucide-react'
import { NotificationPreferencesScreen } from '@/components/shared/notification-preferences-screen'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { cn } from '@/lib/utils'
import { cleanupProducteurData } from '@/lib/cleanup'
import { getSimpleNotifPrefs, setSimpleNotifPrefs } from '@/lib/notification-preferences'
import {
  tataSpeak, tataStop, haptic, unlockTataAudio,
  getTtsEngine, setTtsEngine, getWebSpeechStatus,
} from '@/lib/voice/tata-tts'
import { isPiperSupported, isPiperVoiceReady, downloadPiperVoice, removePiperVoice } from '@/lib/voice/piper-tts'
import { isKokoroSupported, isKokoroVoiceReady, downloadKokoroVoice, removeKokoroVoice, KOKORO_MODEL_SIZE_MB } from '@/lib/voice/kokoro-tts'
import { GemmaDownloadCard } from '@/components/marchand/gemma-download-card'

const PROD_COLOR = '#2E8B57'

// Token unique pour tous les interrupteurs du profil (répété en dur avant).
const SWITCH_CLS = 'data-[state=checked]:bg-[#2E8B57]'

/**
 * Sous-écran « Voix » du profil producteur — parité avec le sous-écran
 * marchand « Voix & Langue » (audit P1/F4) : volume, vitesse, test de voix
 * avec diagnostics, moteurs neuronaux Piper et Kokoro (téléchargement/
 * activation, mutuellement exclusifs) et assistant hors ligne Gemma
 * (audit P0/F2 — auparavant inaccessible aux producteurs, la carte
 * n'existait que côté marchand).
 */
function ProdVoixSubScreen({ onBack }: { onBack: () => void }) {
  const { voiceEnabled, toggleVoice, wakeWordEnabled, toggleWakeWord, voiceVolume, setVoiceVolume, voiceRate, setVoiceRate } = useAppStore()

  // Opt-in neural voices (Piper / Kokoro): off by default, each requires an
  // explicit one-time model download (tens of MB) before it can be enabled.
  // The two switches are mutually exclusive: the TTS engine is a single
  // value ('webspeech' | 'piper' | 'kokoro') consumed by tataSpeak().
  const [piperReady, setPiperReady] = useState(false)
  const [piperEngineOn, setPiperEngineOn] = useState(false)
  const [piperDownloading, setPiperDownloading] = useState(false)
  const [piperProgress, setPiperProgress] = useState(0)
  const [kokoroReady, setKokoroReady] = useState(false)
  const [kokoroEngineOn, setKokoroEngineOn] = useState(false)
  const [kokoroDownloading, setKokoroDownloading] = useState(false)
  const [kokoroProgress, setKokoroProgress] = useState(0)
  const [testState, setTestState] = useState<'idle' | 'speaking' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const piperAvailable = isPiperSupported()
  const kokoroAvailable = isKokoroSupported()

  useEffect(() => {
    // Readiness flags only (isXxxVoiceReady never downloads). The switches
    // reflect the engine stored by the user: a downloaded model is never
    // re-activated behind their back — the engine is switched exclusively
    // by an explicit download or toggle below.
    isPiperVoiceReady().then(setPiperReady)
    isKokoroVoiceReady().then(setKokoroReady)
    const engine = getTtsEngine()
    setPiperEngineOn(engine === 'piper')
    setKokoroEngineOn(engine === 'kokoro')
  }, [])

  const handleDownloadPiperVoice = async () => {
    setPiperDownloading(true)
    setPiperProgress(0)
    const ok = await downloadPiperVoice(setPiperProgress)
    setPiperDownloading(false)
    setPiperReady(ok)
    if (ok) {
      setTtsEngine('piper')
      setPiperEngineOn(true)
      setKokoroEngineOn(false)
      haptic('success')
    } else {
      haptic('error')
    }
  }

  const handleTogglePiperEngine = (enabled: boolean) => {
    if (enabled) {
      setTtsEngine('piper')
      setPiperEngineOn(true)
      setKokoroEngineOn(false)
    } else {
      if (getTtsEngine() === 'piper') setTtsEngine('webspeech')
      setPiperEngineOn(false)
    }
  }

  const handleRemovePiperVoice = async () => {
    await removePiperVoice()
    if (getTtsEngine() === 'piper') setTtsEngine('webspeech')
    setPiperEngineOn(false)
    setPiperReady(false)
  }

  const handleDownloadKokoroVoice = async () => {
    setKokoroDownloading(true)
    setKokoroProgress(0)
    const ok = await downloadKokoroVoice(setKokoroProgress)
    setKokoroDownloading(false)
    setKokoroReady(ok)
    if (ok) {
      setTtsEngine('kokoro')
      setKokoroEngineOn(true)
      setPiperEngineOn(false)
      haptic('success')
    } else {
      haptic('error')
    }
  }

  const handleToggleKokoroEngine = (enabled: boolean) => {
    if (enabled) {
      setTtsEngine('kokoro')
      setKokoroEngineOn(true)
      setPiperEngineOn(false)
    } else {
      if (getTtsEngine() === 'kokoro') setTtsEngine('webspeech')
      setKokoroEngineOn(false)
    }
  }

  const handleRemoveKokoroVoice = async () => {
    await removeKokoroVoice()
    if (getTtsEngine() === 'kokoro') setTtsEngine('webspeech')
    setKokoroEngineOn(false)
    setKokoroReady(false)
  }

  const handleTestVoice = () => {
    if (testState === 'speaking') {
      tataStop()
      setTestState('idle')
      return
    }
    setTestState('speaking')
    setTestError('')
    haptic('light')
    unlockTataAudio()
    tataSpeak('Bonjour ! Je suis Tata Nanti Lou. Tu m\'entends bien ?', (state) => {
      if (state === 'done') {
        setTestState('success')
        setTimeout(() => setTestState('idle'), 2500)
      } else {
        const engine = getTtsEngine()
        if (engine === 'piper') {
          setTestError('La voix haute qualité Piper n’a pas pu démarrer. Vérifiez le téléchargement du modèle et réessayez.')
          setTestState('error')
          setTimeout(() => setTestState('idle'), 3000)
          return
        }
        if (engine === 'kokoro') {
          setTestError('La voix Kokoro n’a pas pu démarrer. Vérifiez le téléchargement du modèle et réessayez.')
          setTestState('error')
          setTimeout(() => setTestState('idle'), 3000)
          return
        }
        const status = getWebSpeechStatus()
        setTestError(status === 'unsupported'
          ? 'La synthèse vocale Web n’est pas prise en charge par ce navigateur.'
          : status === 'no-voice'
            ? 'Aucune voix installée. Ajoutez une voix française dans les réglages du navigateur ou de l’appareil.'
            : 'Le navigateur a bloqué la lecture vocale. Réessayez après un clic utilisateur.')
        setTestState('error')
        setTimeout(() => setTestState('idle'), 3000)
      }
    })
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">Réglages de la voix</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-5">
        {/* Volume */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Volume de la voix</span>
              </div>
              <span className="text-sm text-muted-foreground">{voiceVolume}%</span>
            </div>
            <Slider
              value={[voiceVolume]}
              onValueChange={(v) => setVoiceVolume(v[0])}
              min={0}
              max={100}
              step={5}
            />
          </CardContent>
        </Card>

        {/* Voice speed */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Vitesse de la voix</span>
              </div>
              <span className="text-sm text-muted-foreground">{voiceRate.toFixed(1)}x</span>
            </div>
            <Slider
              value={[voiceRate]}
              onValueChange={(v) => setVoiceRate(v[0])}
              min={0.5}
              max={2.0}
              step={0.1}
            />
          </CardContent>
        </Card>

        {/* Test voice */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <Button
              variant={testState === 'success' ? 'default' : testState === 'error' ? 'destructive' : 'outline'}
              className="w-full"
              onClick={handleTestVoice}
            >
              <Mic className="w-4 h-4 mr-2" />
              {testState === 'speaking' && 'Écoute...'}
              {testState === 'success' && 'Tata vous parle !'}
              {testState === 'error' && 'Échec — réessayez'}
              {testState === 'idle' && 'Tester la voix'}
            </Button>
            {testState === 'error' && (
              <p className="text-xs text-destructive text-center">
                {testError || 'La synthèse vocale n’est pas disponible sur cet appareil.'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Voix activée */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <div>
                  <span className="text-sm font-medium">Voix activée</span>
                  <p className="text-xs text-muted-foreground">Narration des écrans et réponses de Tata</p>
                </div>
              </div>
              <Switch checked={voiceEnabled} onCheckedChange={toggleVoice} className={SWITCH_CLS} />
            </div>
          </CardContent>
        </Card>

        {/* Wake word */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <div>
                  <span className="text-sm font-medium">Mot d&apos;appel &quot;Julaba&quot;</span>
                  <p className="text-xs text-muted-foreground">Dites &quot;Julaba&quot; pour activer la voix</p>
                </div>
              </div>
              <Switch checked={wakeWordEnabled} onCheckedChange={toggleWakeWord} className={SWITCH_CLS} />
            </div>
          </CardContent>
        </Card>

        {!piperAvailable && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium">Voix du navigateur active</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sur le Web, Tata utilise la voix française installée dans votre navigateur ou sur votre appareil.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Piper high-quality voice (opt-in, requires model download) */}
        {piperAvailable && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm font-medium">Voix haute qualité <span className="text-xs text-muted-foreground">(bêta)</span></span>
                    <p className="text-xs text-muted-foreground">Voix française naturelle, fonctionne hors ligne après téléchargement (~25 Mo)</p>
                  </div>
                </div>
                {piperReady && <Switch checked={piperEngineOn} onCheckedChange={handleTogglePiperEngine} className={SWITCH_CLS} />}
              </div>

              {!piperReady && !piperDownloading && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleDownloadPiperVoice}>
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger la voix (~25 Mo)
                </Button>
              )}

              {piperDownloading && (
                <div className="space-y-1.5">
                  <Progress value={piperProgress} />
                  <p className="text-xs text-muted-foreground text-center">Téléchargement... {piperProgress}%</p>
                </div>
              )}

              {piperReady && (
                <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={handleRemovePiperVoice}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer la voix téléchargée
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Kokoro neural voice (opt-in, requires a one-time ~86 Mo model
            download; French voice 'ff_siwis' — see kokoro-tts.ts header).
            Mutually exclusive with the Piper switch above. */}
        {kokoroAvailable && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm font-medium">Voix ultra naturelle <span className="text-xs text-muted-foreground">(bêta)</span></span>
                    <p className="text-xs text-muted-foreground">Voix française Kokoro, encore plus fluide — hors ligne après téléchargement (~{KOKORO_MODEL_SIZE_MB} Mo)</p>
                  </div>
                </div>
                {kokoroReady && <Switch checked={kokoroEngineOn} onCheckedChange={handleToggleKokoroEngine} className={SWITCH_CLS} />}
              </div>

              {!kokoroReady && !kokoroDownloading && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleDownloadKokoroVoice}>
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger la voix (~{KOKORO_MODEL_SIZE_MB} Mo)
                </Button>
              )}

              {kokoroDownloading && (
                <div className="space-y-1.5">
                  <Progress value={kokoroProgress} />
                  <p className="text-xs text-muted-foreground text-center">Téléchargement... {kokoroProgress}%</p>
                </div>
              )}

              {kokoroReady && (
                <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={handleRemoveKokoroVoice}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer la voix téléchargée
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Assistant hors ligne (Gemma) — parité marchand (audit P0/F2) :
            sans cette carte, classifyProducteurNavigation ne pouvait jamais
            devenir opérationnel pour un producteur. */}
        <GemmaDownloadCard />

        <p className="text-xs text-muted-foreground text-center pb-2">
          Ces réglages s&apos;appliquent à toutes les voix de l&apos;espace producteur.
        </p>
      </div>
    </div>
  )
}

export function ProdProfilScreen() {
  const { darkMode, toggleDarkMode, soleilMode, goBack, merchantName, merchantPhone, merchantSexe, logout, voiceEnabled, toggleVoice, wakeWordEnabled, toggleWakeWord } = useAppStore()
  const { reputation } = useProducteurStore()
  const textClass = soleilMode ? 'text-black' : ''
  const initials = (merchantName || 'K').charAt(0).toUpperCase()
  const honorific = merchantSexe === 'feminin' ? 'Maman' : 'Papa'

  // Sous-écran voix (volume, vitesse, test, Piper, Gemma) — ouvert depuis
  // la carte Compte & préférences, sans route dédiée (même logique que les
  // sous-écrans du profil marchand).
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  // Sous-écran préférences de notifications (Task 28 — parité marchand).
  const [showNotifPrefs, setShowNotifPrefs] = useState(false)

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

  if (showVoiceSettings) {
    return <ProdVoixSubScreen onBack={() => setShowVoiceSettings(false)} />
  }

  if (showNotifPrefs) {
    return (
      <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowNotifPrefs(false)} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
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
        <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
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
