'use client'

// Dialogs du workflow d'examen de l'écran Enrôlement back-office (DET-001
// tranche 12, MODE-1001) — JSX verbatim depuis bo-enrolement-screen.tsx :
// rejet (raisons prédéfinies + texte obligatoire) et demande d'information
// (« Demander info » persisté côté serveur). Les setters d'état de
// l'orchestrateur sont passés en props de mêmes noms.

import type { Dispatch, SetStateAction } from 'react'
import { XCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PREDEFINED_REASONS } from '@/lib/backoffice/enrolement-logic'
import type { BoEnrolment } from '@/lib/backoffice/bo-models'

interface RejectDialogProps {
  rejectDialogOpen: boolean
  setRejectDialogOpen: Dispatch<SetStateAction<boolean>>
  rejectTarget: BoEnrolment | null
  rejectReason: string
  setRejectReason: Dispatch<SetStateAction<string>>
  selectedPreset: string
  handlePresetReason: (reason: string) => void
  handleConfirmReject: () => void
  isDark: boolean
}

export function RejectDialog({
  rejectDialogOpen,
  setRejectDialogOpen,
  rejectTarget,
  rejectReason,
  setRejectReason,
  selectedPreset,
  handlePresetReason,
  handleConfirmReject,
  isDark,
}: RejectDialogProps) {
  return (
    <>
      {/* ===== REJECT DIALOG ===== */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-slate-100' : 'text-[#333333]'}>
              Rejeter l&apos;enrôlement
            </DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-[#333333]'}`}>
                    {rejectTarget.actorName}
                  </span>{' '}
                  — {rejectTarget.dossierId}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Predefined reasons */}
            <div className="flex flex-col gap-2">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-[#333333]'}`}>
                Raison prédéfinie
              </Label>
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_REASONS.map((reason) => (
                  <Button
                    key={reason}
                    variant={selectedPreset === reason ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePresetReason(reason)}
                    className={
                      selectedPreset === reason
                        ? 'bg-[#333333] text-white hover:bg-[#333333]/90'
                        : isDark ? 'text-slate-100' : 'text-[#333333]'
                    }
                  >
                    {reason}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom reason */}
            <div className="flex flex-col gap-2">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-[#333333]'}`}>
                Raison du rejet <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Décrivez la raison du rejet..."
                className="min-h-[100px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              className={isDark ? 'text-slate-100' : 'text-[#333333]'}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={!rejectReason.trim()}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface InfoRequestDialogProps {
  infoDialogOpen: boolean
  setInfoDialogOpen: Dispatch<SetStateAction<boolean>>
  infoTarget: BoEnrolment | null
  infoMessage: string
  setInfoMessage: Dispatch<SetStateAction<string>>
  selectedInfoPreset: string
  setSelectedInfoPreset: Dispatch<SetStateAction<string>>
  handleConfirmRequestInfo: () => void
  isDark: boolean
}

export function InfoRequestDialog({
  infoDialogOpen,
  setInfoDialogOpen,
  infoTarget,
  infoMessage,
  setInfoMessage,
  selectedInfoPreset,
  setSelectedInfoPreset,
  handleConfirmRequestInfo,
  isDark,
}: InfoRequestDialogProps) {
  return (
    <>
      {/* ===== INFO-REQUEST DIALOG (« Demander info » persisté) ===== */}
      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-slate-100' : 'text-[#333333]'}>
              Demander des informations
            </DialogTitle>
            <DialogDescription>
              {infoTarget && (
                <>
                  <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-[#333333]'}`}>
                    {infoTarget.actorName}
                  </span>{' '}
                  — {infoTarget.dossierId}. Le dossier passe en « Info demandée » et l&apos;identificateur est notifié.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-[#333333]'}`}>
                Précision demandée
              </Label>
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_REASONS.filter((r) => r !== 'Autre').map((reason) => (
                  <Button
                    key={reason}
                    variant={selectedInfoPreset === reason ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSelectedInfoPreset(reason)
                      setInfoMessage(reason)
                    }}
                    className={
                      selectedInfoPreset === reason
                        ? 'bg-[#333333] text-white hover:bg-[#333333]/90'
                        : isDark ? 'text-slate-100' : 'text-[#333333]'
                    }
                  >
                    {reason}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-[#333333]'}`}>
                Message à l&apos;identificateur <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>(optionnel)</span>
              </Label>
              <Textarea
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                placeholder="Ex. : la photo de la pièce d'identité est illisible, merci de la reprendre…"
                className="min-h-[100px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInfoDialogOpen(false)}
              className={isDark ? 'text-slate-100' : 'text-[#333333]'}
            >
              Annuler
            </Button>
            <Button onClick={handleConfirmRequestInfo}>
              <Info className="mr-1.5 h-4 w-4" />
              Demander
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
