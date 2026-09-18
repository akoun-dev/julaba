// Carte de réglages « Voix baoulé (pilote) » — partagée marchand/producteur.
//
// Opt-in utilisateur du moteur MMS-TTS pilote (mms-tts.ts, B3-031) :
// téléchargement unique (~114 Mo), progression, erreurs affichées sous le
// bouton (jamais de toast muet), suppression. Le libellé annonce
// honnêtement la nature PILOTE du checkpoint (donor akan, qualité limitée
// — voir .ai/EVAL_B3_TTS.md) : la mission jùlaba interdit un repli
// silencieux, y compris côté promesse UI.
//
// Une fois installée, la voix est utilisée automatiquement par tataSpeak()
// quand « Baoulé » est sélectionné comme langue de la voix
// (voice-language-store). Cette carte ne gère PAS la sélection de langue —
// elle vit déjà dans le sélecteur fr/bci des modales et des réglages.
'use client'

import { useEffect, useState } from 'react'
import {
  MMS_MODEL_SIZE_MB,
  isMmsSupported,
  isMmsBciVoiceReady,
  downloadMmsBciVoice,
  removeMmsBciVoice,
} from '@/lib/voice/mms-tts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Download, AlertCircle, Trash2, Languages } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BciVoiceCard({ textColorClass }: { textColorClass?: string }) {
  const [supported] = useState(() => isMmsSupported())
  const [ready, setReady] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    if (!supported) return
    let active = true
    isMmsBciVoiceReady().then((ok) => { if (active) setReady(ok) })
    return () => { active = false }
  }, [supported])

  if (!supported) return null

  const handleDownload = async () => {
    setDownloading(true)
    setProgress(0)
    setDownloadError('')
    const ok = await downloadMmsBciVoice(setProgress)
    setDownloading(false)
    setReady(ok)
    if (!ok) {
      setDownloadError('Téléchargement impossible — vérifiez la connexion puis réessayez.')
    }
  }

  const handleRemove = async () => {
    await removeMmsBciVoice()
    setReady(false)
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-muted-foreground" />
          <div>
            <span className={cn('text-sm font-medium', textColorClass)}>
              Voix baoulé <span className="text-xs text-amber-600">(pilote — qualité limitée)</span>
            </span>
            <p className="text-xs text-muted-foreground">
              Voix expérimentale pour tester la narration baoulé — hors ligne
              après téléchargement (~{MMS_MODEL_SIZE_MB} Mo). Validez la
              prononciation avant usage quotidien.
            </p>
          </div>
        </div>

        {!ready && !downloading && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Installer la voix pilote (~{MMS_MODEL_SIZE_MB} Mo)
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
