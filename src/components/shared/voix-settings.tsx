'use client'

/**
 * Réglages de la voix — composant partagé marchand / producteur (NORM-301).
 *
 * Extrait des deux sous-écrans dupliqués (VoixSubScreen marchand,
 * ProdVoixSubScreen producteur — ~400 lignes à 95 % identiques) : langue de
 * la voix (voice-language-store partagé), volume, vitesse, test de voix
 * avec diagnostics, moteurs neuronaux opt-in Piper / Kokoro (mutuellement
 * exclusifs), voix baoulé pilote (BciVoiceCard), assistant hors ligne Gemma
 * et carte « Confirmation vocale » (marchand seule : elle concerne les
 * ventes).
 *
 * Les différences historiques deviennent des props explicites : titre,
 * mode soleil (marchand), classe d'accent des interrupteurs (producteur
 * vert), carte confirmation et note de pied de page. Zéro changement de
 * comportement : mêmes stores, mêmes handlers Piper/Kokoro, mêmes phrases.
 */

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft, Mic, Volume2, Clock, Download, Sparkles, Trash2, AlertCircle, Languages,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import {
  tataSpeak, tataStop, haptic, unlockTataAudio,
  getTtsEngine, setTtsEngine, getWebSpeechStatus,
} from '@/lib/voice/tata-tts'
import { isPiperSupported, isPiperVoiceReady, downloadPiperVoice, removePiperVoice } from '@/lib/voice/piper-tts'
import { isKokoroSupported, isKokoroVoiceReady, downloadKokoroVoice, removeKokoroVoice, KOKORO_MODEL_SIZE_MB } from '@/lib/voice/kokoro-tts'
import { getVoiceTestPhrase } from '@/lib/voice/test-phrase'
import { isMmsDyuVoiceReady } from '@/lib/voice/mms-tts'
import { useVoiceLanguageStore, getSelectedTtsLanguage } from '@/lib/stores/voice-language-store'
import { GemmaDownloadCard } from '@/components/marchand/gemma-download-card'
import { BciVoiceCard } from '@/components/shared/bci-voice-card'
import { DyuVoiceCard } from '@/components/shared/dyu-voice-card'
import { VoiceLanguageSelector } from '@/components/voice/language-selector'
import { cn } from '@/lib/utils'

export interface VoixSettingsProps {
  onBack: () => void
  /** Titre du sous-écran — « Voix & Langue » (marchand) / « Réglages de la voix » (producteur). */
  title: string
  /** Mode « soleil » marchand : titres et libellés en noir sur fond clair. */
  soleilMode?: boolean
  /** Classe d'accent des interrupteurs (ex. vert producteur) — défaut : shadcn. */
  switchClassName?: string
  /** Carte « Confirmation vocale » (marchand seule — concerne les ventes). */
  showConfirmation?: boolean
  /** Note de pied de page (producteur : portée des réglages). */
  footerNote?: string
}

export function VoixSettings({
  onBack,
  title,
  soleilMode = false,
  switchClassName,
  showConfirmation = false,
  footerNote,
}: VoixSettingsProps) {
  const { voiceEnabled, toggleVoice, wakeWordEnabled, toggleWakeWord, voiceVolume, setVoiceVolume, voiceRate, setVoiceRate, voiceConfirmation, setVoiceConfirmation } = useAppStore()
  // Langue de la voix sélectionnée — pilote la notice visible sous le
  // sélecteur et la phrase du test de voix (MODE-913).
  const voiceLang = useVoiceLanguageStore((s) => s.sttLanguage)
  // Voix dioula installée ? (MODE-914) — pilote la notice dyu et la phrase
  // du test (phrase dioula réelle si installée, explication française sinon).
  const [dyuVoiceReady, setDyuVoiceReady] = useState(false)

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
  // Échecs de téléchargement affichés explicitement (jamais avalés) : sans
  // message, l'utilisateur ne voit que le bouton réapparaître sans raison.
  const [piperDownloadError, setPiperDownloadError] = useState('')
  const [kokoroDownloadError, setKokoroDownloadError] = useState('')
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
    isMmsDyuVoiceReady().then(setDyuVoiceReady)
    const engine = getTtsEngine()
    setPiperEngineOn(engine === 'piper')
    setKokoroEngineOn(engine === 'kokoro')
  }, [])

  const handleDownloadPiperVoice = async () => {
    setPiperDownloading(true)
    setPiperProgress(0)
    setPiperDownloadError('')
    const ok = await downloadPiperVoice(setPiperProgress)
    setPiperDownloading(false)
    setPiperReady(ok)
    if (ok) {
      setTtsEngine('piper')
      setPiperEngineOn(true)
      setKokoroEngineOn(false)
      haptic('success')
    } else {
      setPiperDownloadError('Le téléchargement de la voix Piper a échoué. Vérifiez votre connexion réseau puis réessayez.')
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
    setKokoroDownloadError('')
    const ok = await downloadKokoroVoice(setKokoroProgress)
    setKokoroDownloading(false)
    setKokoroReady(ok)
    if (ok) {
      setTtsEngine('kokoro')
      setKokoroEngineOn(true)
      setPiperEngineOn(false)
      haptic('success')
    } else {
      setKokoroDownloadError('Le téléchargement de la voix Kokoro a échoué. Vérifiez votre connexion réseau puis réessayez.')
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

  const handleTestVoice = async () => {
    if (testState === 'speaking') {
      // Si déjà en lecture, on arrête.
      tataStop()
      setTestState('idle')
      return
    }
    setTestState('speaking')
    setTestError('')
    haptic('light')
    unlockTataAudio()
    // MODE-913/914 : la phrase du test dépend de la langue sélectionnée ET,
    // en dioula, de l'installation de la voix (sondée au clic — jamais de
    // téléchargement) : installée → phrase dioula réelle lue par la voix
    // MMS dyu ; sinon → phrase d'explication française (chaîne de repli).
    const lang = getSelectedTtsLanguage()
    const dyuReady = lang === 'dyu' ? await isMmsDyuVoiceReady() : false
    tataSpeak(getVoiceTestPhrase(lang, { dyuVoiceReady: dyuReady }), (state) => {
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

  const tc = soleilMode ? 'text-black' : ''
  const switchCls = switchClassName ?? ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>{title}</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-6">
        {/* Langue de la voix (Task 40) — réglage par défaut dictée + Tata,
            partagé entre les espaces marchand et producteur via le
            voice-language-store. La sélection écrite ici est celle
            qu'affichent d'emblée les modales vocales. */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-muted-foreground" />
              <span className={cn('text-sm font-medium', tc)}>Langue de la voix</span>
            </div>
            <VoiceLanguageSelector variant="light" className="w-fit" />
            {/* Notice VISIBLE quand une langue sans voix TTS installée est
                sélectionnée (MODE-913/914) : l'écart « je sélectionne
                dioula, Tata parle français » doit s'expliquer à l'écran au
                moment de la sélection, pas seulement dans la console. */}
            {voiceLang === 'dyu' && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground" role="note">
                {dyuVoiceReady
                  ? 'Voix dioula installée : Tata parle dioula (les réponses sont traduites via le traducteur hors ligne NLLB — carte ci-dessous si besoin).'
                  : 'Dioula sélectionné : Tata comprend le dioula et te répond en français. Télécharge la voix dioula ci-dessous (~114 Mo) pour l\'entendre parler dioula.'}
              </p>
            )}
            {voiceLang === 'bci' && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground" role="note">
                Baoulé sélectionné : l&apos;écoute hors ligne fonctionne, mais
                Tata ne comprend pas encore le baoulé — la traduction baoulé
                n&apos;est pas disponible pour le moment (modèle spécialisé
                en préparation). Il répondra en français et le signalera.
                La voix pilote (carte plus bas) reste disponible pour tester
                la prononciation.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Langue par défaut des dictées vocales (Français / Baoulé β /
              Dioula β). Baoulé et dioula partagent le même moteur d'écoute
              offline (Omnilingual ASR). Traduction : le dioula est couvert
              par NLLB (Meta) ; le baoulé attend un modèle spécialisé
              (bci_Latn n'est pas couvert par NLLB). Voix baoulé pilote et
              voix dioula : cartes de téléchargement ci-dessous — sans
              installation, Tata répond en français et le signale.
            </p>
          </CardContent>
        </Card>

        {/* Volume */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm font-medium', tc)}>Volume de la voix</span>
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

        {/* Vitesse */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm font-medium', tc)}>Vitesse de la voix</span>
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

        {/* Test de voix */}
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
                  <span className={cn('text-sm font-medium', tc)}>Voix activée</span>
                  <p className="text-xs text-muted-foreground">Narration des écrans et réponses de Tata</p>
                </div>
              </div>
              <Switch checked={voiceEnabled} onCheckedChange={toggleVoice} className={switchCls} />
            </div>
          </CardContent>
        </Card>

        {/* Mot de réveil */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <div>
                  <span className={cn('text-sm font-medium', tc)}>Mot d&apos;appel &quot;Julaba&quot;</span>
                  <p className="text-xs text-muted-foreground">Dites &quot;Julaba&quot; pour activer la voix</p>
                </div>
              </div>
              <Switch checked={wakeWordEnabled} onCheckedChange={toggleWakeWord} className={switchCls} />
            </div>
          </CardContent>
        </Card>

        {!piperAvailable && (
          <Card>
            <CardContent className="p-4">
              <p className={cn('text-sm font-medium', tc)}>Voix du navigateur active</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sur le Web, Tata utilise la voix française installée dans votre navigateur ou sur votre appareil.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Voix Piper haute qualité (opt-in, téléchargement de modèle requis) */}
        {piperAvailable && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className={cn('text-sm font-medium', tc)}>Voix haute qualité <span className="text-xs text-muted-foreground">(bêta)</span></span>
                    <p className="text-xs text-muted-foreground">Voix française naturelle, fonctionne hors ligne après téléchargement (~25 Mo)</p>
                  </div>
                </div>
                {piperReady && <Switch checked={piperEngineOn} onCheckedChange={handleTogglePiperEngine} className={switchCls} />}
              </div>

              {!piperReady && !piperDownloading && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleDownloadPiperVoice}>
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger la voix (~25 Mo)
                </Button>
              )}

              {piperDownloadError && (
                <p className="flex items-start gap-1.5 text-xs text-red-500" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {piperDownloadError}
                </p>
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

        {/* Voix neurale Kokoro (opt-in, ~86 Mo en une fois ; voix française
            'ff_siwis' — voir l'en-tête kokoro-tts.ts). Mutuellement
            exclusive avec l'interrupteur Piper ci-dessus. */}
        {kokoroAvailable && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className={cn('text-sm font-medium', tc)}>Voix ultra naturelle <span className="text-xs text-muted-foreground">(bêta)</span></span>
                    <p className="text-xs text-muted-foreground">Voix française Kokoro, encore plus fluide — hors ligne après téléchargement (~{KOKORO_MODEL_SIZE_MB} Mo)</p>
                  </div>
                </div>
                {kokoroReady && <Switch checked={kokoroEngineOn} onCheckedChange={handleToggleKokoroEngine} className={switchCls} />}
              </div>

              {!kokoroReady && !kokoroDownloading && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleDownloadKokoroVoice}>
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger la voix (~{KOKORO_MODEL_SIZE_MB} Mo)
                </Button>
              )}

              {kokoroDownloadError && (
                <p className="flex items-start gap-1.5 text-xs text-red-500" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {kokoroDownloadError}
                </p>
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

        {/* Voix baoulé pilote (B3-031) : opt-in MMS, orthogonal au moteur
            (elle parle quand « Baoulé » est sélectionné comme langue de la
            voix — voice-language-store), libellé honnête « qualité limitée ». */}
        <BciVoiceCard textColorClass={tc} />

        {/* Voix dioula (MODE-914) : opt-in MMS — le VRAI checkpoint dioula
            (facebook/mms-tts-dyu, port ONNX produit et prouvé), servi par
            le proxy /api/voix/dyu-model. */}
        <DyuVoiceCard textColorClass={tc} />

        <GemmaDownloadCard soleilMode={soleilMode} />

        {/* Confirmation vocale (marchand — concerne les ventes) */}
        {showConfirmation && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <span className={cn('text-sm font-medium', tc)}>Confirmation vocale</span>
              <RadioGroup
                value={voiceConfirmation}
                onValueChange={(v) => setVoiceConfirmation(v as 'always' | 'never' | 'high-amount')}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="always" id="vconf-always" />
                  <Label htmlFor="vconf-always" className={tc}>Toujours</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="high-amount" id="vconf-high-amount" />
                  <Label htmlFor="vconf-high-amount" className={tc}>Montants élevés seulement</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="never" id="vconf-never" />
                  <Label htmlFor="vconf-never" className={tc}>Jamais</Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {footerNote && (
          <p className="text-xs text-muted-foreground text-center pb-2">{footerNote}</p>
        )}
      </div>
    </div>
  )
}
