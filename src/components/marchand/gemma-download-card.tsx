'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Download, Check, RotateCw, X, Trash2, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useGemmaModelStore } from '@/lib/stores/gemma-model-store'
import { GEMMA_MODEL_SIZE_LABEL } from '@/lib/ai/gemma-model'
import { cn } from '@/lib/utils'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

function formatBytes(bytes: number): string {
  if (!bytes) return `0 / ${GEMMA_MODEL_SIZE_LABEL}`
  return `${(bytes / 1024 / 1024).toFixed(0)} / ${GEMMA_MODEL_SIZE_LABEL}`
}

export function GemmaDownloadCard({ onboarding = false, soleilMode = false }: { onboarding?: boolean; soleilMode?: boolean }) {
  const status = useGemmaModelStore((state) => state.status)
  const progress = useGemmaModelStore((state) => state.progressPercent)
  const downloadedBytes = useGemmaModelStore((state) => state.downloadedBytes)
  const errorMessage = useGemmaModelStore((state) => state.errorMessage)
  const modelVersion = useGemmaModelStore((state) => state.modelVersion)
  const refreshStatus = useGemmaModelStore((state) => state.refreshStatus)
  const startDownload = useGemmaModelStore((state) => state.startDownload)
  const retryDownload = useGemmaModelStore((state) => state.retryDownload)
  const cancelDownload = useGemmaModelStore((state) => state.cancelDownload)
  const removeModel = useGemmaModelStore((state) => state.removeModel)

  useEffect(() => {
    void refreshStatus()
    const reconcile = () => { if (document.visibilityState === 'visible') void refreshStatus() }
    document.addEventListener('visibilitychange', reconcile)
    window.addEventListener('pageshow', reconcile)
    return () => {
      document.removeEventListener('visibilitychange', reconcile)
      window.removeEventListener('pageshow', reconcile)
    }
  }, [refreshStatus])

  const isBusy = status === 'checking' || status === 'preparing' || status === 'downloading' || status === 'verifying'
  const canCancel = status === 'preparing' || status === 'downloading' || status === 'verifying'
  const isNative = Capacitor.isNativePlatform()
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <Card className={cn(onboarding && 'border-[#C66A2C]/20 bg-white/70')}>
      <CardContent className={cn('p-4 space-y-3', onboarding && 'p-3 space-y-2')}>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#C66A2C]/10 p-2.5 text-[#C66A2C] shrink-0">
            <Cpu className={cn('w-5 h-5', soleilMode && 'w-6 h-6')} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={cn('text-sm font-semibold', textClass)}>Assistant hors ligne</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Commandes vocales sans internet. Facultatif : {GEMMA_MODEL_SIZE_LABEL}.
            </p>
          </div>
        </div>

        {status === 'ready' && (
          <div className="text-sm text-emerald-700 flex items-center gap-1.5 font-medium">
            <Check className="w-4 h-4" aria-hidden="true" /> Assistant téléchargé et vérifié
            {modelVersion && <span className="text-xs text-muted-foreground ml-1">({modelVersion})</span>}
          </div>
        )}

        {isBusy && (
          <div className="space-y-2" aria-live="polite">
            <Progress value={status === 'verifying' ? undefined : progress} aria-label={`Téléchargement de l’assistant, ${progress}%`} />
            <p className="text-xs text-muted-foreground text-center">
              {status === 'checking' && 'Vérification du modèle…'}
              {status === 'preparing' && 'Préparation du téléchargement…'}
              {status === 'downloading' && `Téléchargement… ${progress}% (${formatBytes(downloadedBytes)})`}
              {status === 'verifying' && 'Vérification du fichier…'}
            </p>
          </div>
        )}

        {errorMessage && status !== 'cancelled' && status !== 'unsupported' && (
          <p role="alert" className="text-xs text-destructive">{errorMessage}</p>
        )}

        {status === 'unsupported' && (
          <div className="space-y-2" role="alert">
            <p className="text-xs text-destructive">
              {isNative
                ? 'Cette version de l’application ou cet appareil ne prend pas en charge l’assistant hors ligne.'
                : 'Le téléchargement de l’assistant est disponible dans l’application mobile, pas dans cette version web.'}
            </p>
            <Button type="button" variant="outline" className="w-full min-h-11" onClick={() => void refreshStatus()}>
              <RotateCw className="w-4 h-4 mr-2" aria-hidden="true" /> Vérifier à nouveau
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          {(status === 'idle' || status === 'cancelled') && (
            <Button type="button" variant="outline" className="w-full min-h-11" onClick={() => void startDownload()}>
              <Download className="w-4 h-4 mr-2" aria-hidden="true" /> Télécharger ({GEMMA_MODEL_SIZE_LABEL})
            </Button>
          )}
          {status === 'error' && (
            <Button type="button" variant="outline" className="w-full min-h-11" onClick={() => void retryDownload()}>
              <RotateCw className="w-4 h-4 mr-2" aria-hidden="true" /> Réessayer
            </Button>
          )}
          {canCancel && (
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => void cancelDownload()}>
              <X className="w-4 h-4 mr-2" aria-hidden="true" /> Annuler
            </Button>
          )}
          {status === 'ready' && !onboarding && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" className="w-full min-h-11 text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" /> Supprimer le modèle
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer l’assistant hors ligne ?</AlertDialogTitle>
                  <AlertDialogDescription>L’assistant hors ligne ne fonctionnera plus après suppression. Vous pourrez le télécharger à nouveau depuis cette page.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void removeModel()}>Supprimer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {onboarding && status !== 'ready' && (
          <p className="text-xs text-muted-foreground text-center">Téléchargeable plus tard dans Profil.</p>
        )}
      </CardContent>
    </Card>
  )
}
