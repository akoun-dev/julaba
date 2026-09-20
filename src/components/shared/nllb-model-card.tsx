// Carte de réglages « Traduction <langue> » — partagée marchand/producteur.
//
// Opt-in utilisateur du modèle NLLB adapté à la langue (Task 84) :
// téléchargement unique (≈ 872 Mo dioula / ≈ 893 Mo baoulé — Wi-Fi
// recommandé), progression, erreurs affichées sous le bouton (jamais de
// toast muet), suppression. Une fois installé, le traducteur sert la
// compréhension (transcript → parseur français) ET la narration
// (réponses fra → langue, conversation.ts).
//
// Le modèle dioula (NLLB-200 Meta) est téléchargé depuis Hugging Face ; le
// modèle baoulé (finetune spécialisé GaindeNdiaye/nllb-baoule-v1) transite
// par le proxy same-origin /api/voix/nllb-baoule-v1 (GitHub sans CORS).
// Licence CC-BY-NC-4.0 pour les deux : pilote/évaluation, production
// commerciale soumise à décision dédiée (B3-033/034 équivalent).
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Download, AlertCircle, Trash2, Languages } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  describeNllbError, isNllbModelReady, downloadNllbModel, removeNllbModel,
  type NllbModelDescriptor,
} from '@/lib/voice/nllb-translation'
import type { SessionVoiceLanguage } from '@/lib/voice/nllb-translation'

export interface NllbModelCardProps {
  /** Descripteur du modèle (registre vérifié nllb-translation). */
  model: NllbModelDescriptor
  /** Langue de session servie par ce modèle (sonde + téléchargement). */
  langue: Exclude<SessionVoiceLanguage, 'fr'>
  /** Taille affichée (Mo, mesurée). */
  tailleMo: number
  /** Titre de la carte. */
  titre: string
  /** Description honnête (qualité, usage, caveats). */
  description: string
  /** Libellé du bouton d'installation (sans la taille). */
  libelleBouton: string
  textColorClass?: string
}

export function NllbModelCard({
  model, langue, tailleMo, titre, description, libelleBouton, textColorClass,
}: NllbModelCardProps) {
  const [ready, setReady] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    let actif = true
    // Sonde sans effet de bord : la langue cible oriente le bon modèle.
    isNllbModelReady(langue).then((ok) => { if (actif) setReady(ok) })
    return () => { actif = false }
  }, [langue])

  const handleDownload = async () => {
    setDownloading(true)
    setProgress(0)
    setDownloadError('')
    try {
      const ok = await downloadNllbModel(setProgress, langue)
      setDownloading(false)
      setReady(ok)
      if (!ok) {
        setDownloadError('Téléchargement impossible — vérifiez la connexion puis réessayez.')
      }
    } catch (error) {
      setDownloading(false)
      setDownloadError(describeNllbError(error))
    }
  }

  const handleRemove = async () => {
    await removeNllbModel(model.id)
    setReady(false)
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-muted-foreground" />
          <div>
            <span className={cn('text-sm font-medium', textColorClass)}>
              {titre} <span className="text-xs text-amber-600">(bêta)</span>
            </span>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        {!ready && !downloading && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            {libelleBouton} (~{tailleMo} Mo)
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
            Supprimer le modèle téléchargé
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
