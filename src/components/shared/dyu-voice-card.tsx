// Carte de réglages « Voix dioula » — partagée marchand/producteur.
//
// Opt-in utilisateur de la voix MMS dioula (mms-tts.ts, MODE-914) :
// téléchargement unique (~114 Mo via le proxy /api/voix/dyu-model),
// progression, erreurs affichées sous le bouton (jamais de toast muet),
// suppression. Une fois installée, la voix est utilisée automatiquement par
// tataSpeak() quand « Dioula » est sélectionné comme langue de la voix
// (voice-language-store) — et narrateResponse (conversation.ts) traduit les
// réponses fra→dyu via NLLB. Cette carte ne gère PAS la sélection de
// langue — elle vit déjà dans le sélecteur fr/bci/dyu des modales et des
// réglages.
//
// Honnêteté produit : le checkpoint est le VRAI dioula (facebook/mms-tts-dyu
// — contrairement au pilote baoulé, un checkpoint donor), mais il reste un
// port MMS de qualité variable : la carte invite à valider la prononciation.
// Licence CC-BY-NC-4.0 (Meta MMS) : pilote/évaluation, production
// commerciale soumise à décision dédiée.
'use client'

import { useEffect, useState } from 'react'
import {
  MMS_DYU_MODEL_SIZE_MB,
  isMmsSupported,
  isMmsDyuVoiceReady,
  downloadMmsDyuVoice,
  removeMmsDyuVoice,
} from '@/lib/voice/mms-tts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Download, AlertCircle, Trash2, Languages } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DyuVoiceCard({ textColorClass }: { textColorClass?: string }) {
  const [supported] = useState(() => isMmsSupported())
  const [ready, setReady] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    if (!supported) return
    let active = true
    isMmsDyuVoiceReady().then((ok) => { if (active) setReady(ok) })
    return () => { active = false }
  }, [supported])

  if (!supported) return null

  const handleDownload = async () => {
    setDownloading(true)
    setProgress(0)
    setDownloadError('')
    const ok = await downloadMmsDyuVoice(setProgress)
    setDownloading(false)
    setReady(ok)
    if (!ok) {
      setDownloadError('Téléchargement impossible — vérifiez la connexion puis réessayez.')
    }
  }

  const handleRemove = async () => {
    await removeMmsDyuVoice()
    setReady(false)
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-muted-foreground" />
          <div>
            <span className={cn('text-sm font-medium', textColorClass)}>
              Voix dioula <span className="text-xs text-amber-600">(bêta)</span>
            </span>
            <p className="text-xs text-muted-foreground">
              Tata parle dioula — hors ligne après téléchargement
              (~{MMS_DYU_MODEL_SIZE_MB} Mo, Wi-Fi recommandé). Validez la
              prononciation avant usage quotidien.
            </p>
          </div>
        </div>

        {!ready && !downloading && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Installer la voix dioula (~{MMS_DYU_MODEL_SIZE_MB} Mo)
          </Button>
        )}

        {downloadError && (
          <p className="flex items-start gap-1.5 text-xs text-red-500" role="alert">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {downloadError}
          </p>
        )}

        {downloading && (
          <div className="space-y-1.5">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground text-center">Téléchargement... {progress}%</p>
          </div>
        )}

        {ready && (
          <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={handleRemove}>
            <Trash2 className="w-4 h-4 mr-2" />
            Supprimer la voix téléchargée
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
