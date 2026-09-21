'use client'

/**
 * Carte « Packs vocaux » — réglages unifiés des ressources lourdes
 * (Sprint V, MODE-954).
 *
 * UNE carte pour le consentement explicite de TOUS les packs (dictée FR
 * native, dictée baoulé & dioula, voix Piper/Kokoro/MMS, traductions NLLB)
 * — au-dessus du pack-manager (source de vérité = sondes des modules
 * propriétaires), cette carte n'implémente AUCUN mécanisme : elle affiche
 * l'état réel, taille honnête (≈ si estimée), progression réelle, erreurs
 * jamais avalées.
 *
 * Consentement : le bouton « Installer · X Mo » EST l'action explicite
 * (même convention que les cartes Piper/Gemma existantes) — la taille est
 * affichée AVANT le téléchargement, Wi-Fi conseillé dans le libellé. Jamais
 * de téléchargement automatique : le pack-manager n'installe que sur appel
 * utilisateur.
 *
 * ⚠️ INCIDENT-006 : AUCUN useMemo dans les selectors zustand — filtres sur
 * place, le store reste simple.
 */

import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, Download, HardDriveDownload, PackageCheck, Trash2 } from 'lucide-react'
import { useVoicePacksStore } from '@/lib/stores/voice-packs-store'
import { cn } from '@/lib/utils'

export function VoicePacksCard({ textColorClass }: { textColorClass?: string }) {
  const packs = useVoicePacksStore((s) => s.packs)
  const refreshInFlight = useVoicePacksStore((s) => s.refreshInFlight)
  const installInFlight = useVoicePacksStore((s) => s.installInFlight)
  const installProgress = useVoicePacksStore((s) => s.installProgress)
  const lastError = useVoicePacksStore((s) => s.lastError)
  const refreshPacks = useVoicePacksStore((s) => s.refreshPacks)
  const installPack = useVoicePacksStore((s) => s.installPack)
  const removePack = useVoicePacksStore((s) => s.removePack)

  useEffect(() => {
    void refreshPacks()
  }, [refreshPacks])

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HardDriveDownload className="w-4 h-4 text-muted-foreground" />
          <div>
            <span className={cn('text-sm font-medium', textColorClass)}>Packs vocaux (hors-ligne)</span>
            <p className="text-xs text-muted-foreground">
              Les gros modèles se téléchargent une seule fois, sur votre accord, puis
              fonctionnent sans réseau. Wi-Fi vivement conseillé.
            </p>
          </div>
        </div>

        {refreshInFlight && (
          <p className="text-xs text-muted-foreground" role="status">Vérification de l&apos;état des packs…</p>
        )}

        <ul className="space-y-2">
          {packs.map(({ descriptor, supported, installed }) => {
            const installing = installInFlight === descriptor.id
            const sizeLabel = descriptor.sizeVerified
              ? `${descriptor.sizeMb} Mo`
              : `≈ ${descriptor.sizeMb} Mo`
            return (
              <li key={descriptor.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn('text-sm font-medium', textColorClass)}>{descriptor.label}</p>
                    <p className="text-xs text-muted-foreground">{descriptor.description}</p>
                  </div>
                  {installed && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <PackageCheck className="w-3.5 h-3.5" />
                      Installé
                    </span>
                  )}
                </div>

                {installing && (
                  <div className="space-y-1.5">
                    <Progress value={installProgress} />
                    <p className="text-xs text-muted-foreground text-center">
                      Téléchargement… {installProgress}% ({sizeLabel})
                    </p>
                  </div>
                )}

                {!installing && !supported && (
                  <p className="text-xs text-muted-foreground">
                    Indisponible sur cet appareil — ouvrez Jùlaba depuis l&apos;application Android.
                  </p>
                )}

                {!installing && supported && !installed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => void installPack(descriptor.id)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Installer · {sizeLabel}
                  </Button>
                )}

                {!installing && supported && installed && descriptor.removable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-red-500"
                    onClick={() => void removePack(descriptor.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer (libérer {sizeLabel})
                  </Button>
                )}
              </li>
            )
          })}
        </ul>

        {packs.length === 0 && !refreshInFlight && (
          <p className="text-xs text-muted-foreground" role="status">
            État des packs indisponible pour l&apos;instant — réessayez dans un instant.
          </p>
        )}

        {lastError && (
          <p className="flex items-start gap-1.5 text-xs text-red-500" role="alert">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {lastError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
