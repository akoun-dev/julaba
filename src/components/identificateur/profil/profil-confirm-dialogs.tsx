/**
 * MODE-998 (DET-001 tranche 10) — bloc boutons « DÉCONNEXION / SUPPRIMER MON
 * COMPTE » (qui ouvrent ces confirmations) + AlertDialogs « Se déconnecter ? »
 * et « Supprimer le compte ? » de ident-profil-screen.tsx, déplacés VERBATIM
 * (DOM de flux inchangé : les Dialog/AlertDialog Radix contrôlés sans Trigger
 * ne rendent rien inline, les boutons restent donc entre À PROPOS et les
 * Sheets dans le flux ; props de mêmes noms).
 */
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { LogOut, TriangleAlert, Trash2 } from 'lucide-react'

interface ProfilConfirmDialogsProps {
  showLogoutModal: boolean
  setShowLogoutModal: (open: boolean) => void
  handleLogout: () => void
  showDeleteModal: boolean
  setShowDeleteModal: (open: boolean) => void
  handleDeleteAccount: () => void
}

export function ProfilConfirmDialogs({ showLogoutModal, setShowLogoutModal, handleLogout, showDeleteModal, setShowDeleteModal, handleDeleteAccount }: ProfilConfirmDialogsProps) {
  return (
    <>
      {/* ─── Deconnexion & Suppression ─────────────────────────────────────── */}
      <div className="px-4 mt-8 space-y-3 mb-4">
        <Button
          className="w-full h-12 font-semibold gap-2 border-red-200 text-red-600 hover:bg-red-50"
          variant="outline"
          onClick={() => setShowLogoutModal(true)}
        >
          <LogOut className="w-4 h-4" />
          DÉCONNEXION
        </Button>
        <Button
          className="w-full h-12 font-semibold gap-2 border-red-200 text-red-600 hover:bg-red-50"
          variant="outline"
          onClick={() => setShowDeleteModal(true)}
        >
          <Trash2 className="w-4 h-4" />
          SUPPRIMER MON COMPTE
        </Button>
      </div>

      {/* ─── Existing modals (logout & delete) ─────────────────────────── */}

      {/* Modale de déconnexion */}
      <AlertDialog open={showLogoutModal} onOpenChange={setShowLogoutModal}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader className="items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
              style={{ backgroundColor: '#dc262615' }}
            >
              <LogOut className="w-7 h-7 text-red-600" />
            </div>
            <AlertDialogTitle className="text-base">Se déconnecter ?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Vous pouvez vous reconnecter à tout moment avec votre numéro et votre code secret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
              onClick={() => { setShowLogoutModal(false); handleLogout() }}
            >
              Se déconnecter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modale de suppression de compte */}
      <AlertDialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader className="items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1"
              style={{ backgroundColor: '#dc262615' }}
            >
              <TriangleAlert className="w-7 h-7 text-red-600" />
            </div>
            <AlertDialogTitle className="text-base">Supprimer le compte ?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Cette action est <strong>irréversible</strong>. Toutes vos données seront définitivement supprimées, y compris vos dossiers enregistrés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
              onClick={handleDeleteAccount}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
