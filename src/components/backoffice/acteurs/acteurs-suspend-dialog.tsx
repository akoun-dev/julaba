'use client'

// Dialog de confirmation de suspension de l'écran Acteurs back-office
// (DET-001 tranche 9, MODE-995) — JSX verbatim depuis bo-acteurs-screen.tsx.

import type { Dispatch, SetStateAction } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { BoActor } from '@/lib/backoffice/bo-models'

interface ActeursSuspendDialogProps {
  showSuspendConfirm: boolean
  setShowSuspendConfirm: (open: boolean) => void
  suspendActor: BoActor | null
  suspendReason: string
  setSuspendReason: Dispatch<SetStateAction<string>>
  confirmSuspend: () => void
  isDark: boolean
}

export function ActeursSuspendDialog({
  showSuspendConfirm,
  setShowSuspendConfirm,
  suspendActor,
  suspendReason,
  setSuspendReason,
  confirmSuspend,
  isDark,
}: ActeursSuspendDialogProps) {
  return (
      <Dialog open={showSuspendConfirm} onOpenChange={setShowSuspendConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-slate-100' : 'text-slate-900'}>
              Suspendre l'acteur ?
            </DialogTitle>
            <DialogDescription>
              Cette action est réversible. L'acteur ne pourra plus se connecter pendant la suspension.
            </DialogDescription>
          </DialogHeader>
          {suspendActor && (
            <div className="space-y-4">
              <div className={`p-3 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center size-10 rounded-full ${isDark ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-600'} text-sm font-bold`}>
                    {suspendActor.firstName.charAt(0)}{suspendActor.lastName.charAt(0)}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {suspendActor.firstName} {suspendActor.lastName}
                    </p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {suspendActor.actorId} · {suspendActor.zone}
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  Motif de suspension
                </label>
                <Input
                  placeholder="Indiquez la raison de la suspension..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSuspendConfirm(false)}>
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmSuspend}
                  disabled={!suspendReason.trim()}
                >
                  Suspendre l'acteur
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

  )
}
