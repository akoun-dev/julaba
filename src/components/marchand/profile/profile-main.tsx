"use client"

// MODE-991 (DET-001 tranche 5) — écran principal du profil (carte
// identité, sections Mon compte / Préférences / Aide & Support, modale
// de déconnexion, suppression de compte) : JSX déplacé VERBATIM du
// return final de ProfilScreen dans profile-screen.tsx (preuve
// octet-pour-octet) ; valeurs dérivées (displayName, initials,
// displayPhone, memberSince, tc) et handlers vivent dans
// l'orchestrateur et arrivent ici par props de mêmes noms.
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
  ArrowLeft, User, Shield, Store, Mic, Sun, Bell, GraduationCap,
  CircleHelp, BookOpen, LogOut, Trash2, Camera, MapPin, Phone, Star,
} from 'lucide-react'
import { haptic } from '@/lib/voice/tata-tts'
import { type ScreenRoute } from '@/lib/stores/app-store'
import { MenuItem, SectionHeader } from '@/components/marchand/profile/profile-parts'
import { type MerchantProfile } from '@/lib/marchand-profile-data'
import { type SubScreen } from '@/components/marchand/profile/profile-parts'
import { ActorProfileFooter } from '@/components/shared/actor-profile-footer'
import { cn } from '@/lib/utils'

export function ProfileMain({
  goBack,
  soleilMode,
  profile,
  displayName,
  initials,
  displayPhone,
  memberSince,
  scoreJulaba,
  tc,
  handlePhotoUpload,
  handleSubScreenOpen,
  onSupport,
  navigate,
  showLogoutConfirm,
  setShowLogoutConfirm,
  handleLogout,
  handleDeleteAccount,
  showDeleteConfirm,
  setShowDeleteConfirm,
  confirmDeleteAccount,
}: {
  goBack: () => void
  soleilMode: boolean
  profile: MerchantProfile
  displayName: string
  initials: string
  displayPhone: string
  memberSince: string
  scoreJulaba: number | null
  tc: string
  handlePhotoUpload: () => void
  handleSubScreenOpen: (screen: SubScreen) => void
  onSupport: () => void
  navigate: (screen: ScreenRoute) => void
  showLogoutConfirm: boolean
  setShowLogoutConfirm: (v: boolean) => void
  handleLogout: () => void
  handleDeleteAccount: () => void
  showDeleteConfirm: boolean
  setShowDeleteConfirm: (v: boolean) => void
  confirmDeleteAccount: () => void
}) {
  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); goBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>PROFIL</h1>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-4">
        {/* Profile Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center">
              {/* Avatar */}
              <div className="relative">
                {profile.photoDataUrl ? (
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#C66A2C]/30">
                    <img
                      src={profile.photoDataUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-[#C66A2C]/10 flex items-center justify-center border-2 border-[#C66A2C]/30">
                    <span className="text-2xl font-bold text-[#C66A2C]">{initials}</span>
                  </div>
                )}
                <button
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#C66A2C] text-white flex items-center justify-center shadow-md active:scale-95 transition-transform after:absolute after:-inset-2 after:content-['']"
                  onClick={handlePhotoUpload}
                  aria-label="Changer la photo de profil"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>

              <h2 className={cn('text-lg font-bold mt-3', soleilMode && 'text-xl text-black')}>
                {displayName}
              </h2>

              {displayPhone && (
                <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  <span className={cn('text-sm', soleilMode && 'text-base')}>{displayPhone}</span>
                </div>
              )}

              {profile.market && (
                <p className={cn('text-sm text-muted-foreground mt-0.5', soleilMode && 'text-base')}>{profile.market}</p>
              )}

              {profile.activity && (
                <Badge className="mt-2 bg-[#C66A2C]/10 text-[#C66A2C] border-0">
                  {profile.activity}
                </Badge>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-4 mt-4">
                <div className="text-center">
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-[#C66A2C]" />
                    <span className={cn('text-sm font-bold', tc)}>{scoreJulaba ?? '—'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Score JULABA</p>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div className="text-center">
                  <p className={cn('text-sm font-medium', tc)}>{memberSince}</p>
                  <p className="text-xs text-muted-foreground">Membre depuis</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MON COMPTE section */}
        <SectionHeader>Mon compte</SectionHeader>

        <MenuItem
          icon={<User className="w-5 h-5 text-[#C66A2C]" />}
          label="Mes informations"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('informations')}
        />
        <MenuItem
          icon={<Shield className="w-5 h-5 text-[#C66A2C]" />}
          label="Sécurité & Connexion"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('securite')}
        />
        <MenuItem
          icon={<Store className="w-5 h-5 text-[#C66A2C]" />}
          label="Mon commerce"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('commerce')}
        />
        {/* MODE-985 (DET-COOP-011 tranche 2) — déclaration de commune :
            nourrit les filtres région/commune de la liste membres de la
            coopérative (même référentiel GPS que les producteurs). */}
        <MenuItem
          icon={<MapPin className="w-5 h-5 text-[#C66A2C]" />}
          label="Ma commune"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('commune')}
        />

        {/* PRÉFÉRENCES section */}
        <SectionHeader>Préférences</SectionHeader>

        <MenuItem
          icon={<Mic className="w-5 h-5 text-[#C66A2C]" />}
          label="Voix & Langue"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('voix')}
        />
        <MenuItem
          icon={<Sun className="w-5 h-5 text-[#C66A2C]" />}
          label="Affichage"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('affichage')}
        />
        <MenuItem
          icon={<Bell className="w-5 h-5 text-[#C66A2C]" />}
          label="Notifications"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('notifications')}
        />

        {/* AIDE & SUPPORT section */}
        <SectionHeader>Aide & Support</SectionHeader>

        <MenuItem
          icon={<GraduationCap className="w-5 h-5 text-[#C66A2C]" />}
          label="Academy"
          soleilMode={soleilMode}
          onClick={() => navigate('academy')}
        />
        <MenuItem
          icon={<CircleHelp className="w-5 h-5 text-[#C66A2C]" />}
          label="FAQ & Aide"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('faq')}
        />
        <MenuItem
          icon={<BookOpen className="w-5 h-5 text-[#C66A2C]" />}
          label="À propos de Jùlaba"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('apropos')}
        />

        <Separator className="my-2" />

        {/* Bottom actions */}
        <MenuItem
          icon={<LogOut className="w-5 h-5 text-muted-foreground" />}
          label="Déconnexion"
          soleilMode={soleilMode}
          onClick={() => setShowLogoutConfirm(true)}
        />
        <MenuItem
          icon={<Trash2 className="w-5 h-5" />}
          label="Supprimer mon compte"
          soleilMode={soleilMode}
          danger
          onClick={handleDeleteAccount}
        />

        {/* Modale de confirmation de déconnexion */}
        <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
          <AlertDialogContent className="max-w-xs">
            <AlertDialogHeader className="items-center text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1 bg-red-500/10">
                <LogOut className="w-7 h-7 text-red-600" />
              </div>
              <AlertDialogTitle className="text-base">Se déconnecter ?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                Vous pourrez vous reconnecter à tout moment avec votre numéro et votre code secret. Vos données restent enregistrées sur cet appareil.
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

        {showDeleteConfirm && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 space-y-3">
              <p className={cn('text-sm font-medium text-destructive', soleilMode && 'text-base')}>
                Êtes-vous sûre de vouloir supprimer votre compte ? Toutes vos données seront perdues.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={confirmDeleteAccount}
                >
                  Oui, supprimer
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      <ActorProfileFooter accentColor="#C66A2C" onSupport={onSupport} />

      </div>
    </div>
  )
}
