'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, User, MapPin, Store, Shield, Sun,
  GraduationCap, Headphones, LogOut, Target,
  Lock, Smartphone, Fingerprint, Info, Trash2, TriangleAlert,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore } from '@/lib/stores/identificateur-store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

function InfoRow({ icon: Icon, label, value, soleilMode: sm }: { icon: typeof User; label: string; value: string; soleilMode: boolean }) {
  const textCls = sm ? 'text-black' : ''
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className={cn('text-sm', textCls, sm && 'text-base')}>{label}</span>
      </div>
      <span className={cn('text-sm font-medium text-muted-foreground', textCls, sm && 'text-base')}>
        {value}
      </span>
    </div>
  )
}

export function IdentProfilScreen() {
  const { goBack, soleilMode, toggleSoleil, merchantName, merchantPhone, merchantId, navigate, logout } = useAppStore()
  const { agentZone, agentMarche, mission, screenSensitive, toggleScreenSensitive, dossiers } = useIdentificateurStore()
  const { toast } = useToast()

  const textClass = soleilMode ? 'text-black' : ''
  const headingClass = soleilMode ? 'text-lg' : 'text-base'
  const smallTextClass = soleilMode ? 'text-sm' : 'text-xs'

  // Mask phone if screen sensitive
  const maskedPhone = useMemo(() => {
    if (!screenSensitive || !merchantPhone) return merchantPhone || '—'
    if (merchantPhone.length <= 4) return merchantPhone
    return merchantPhone.slice(0, 3) + '****' + merchantPhone.slice(-2)
  }, [merchantPhone, screenSensitive])

  // Initials
  const initials = useMemo(() => {
    if (!merchantName) return '??'
    const parts = merchantName.trim().split(/\s+/)
    const first = parts[0]?.charAt(0)?.toUpperCase() || ''
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : ''
    return first + last || '??'
  }, [merchantName])

  // Truncated merchant ID
  const truncatedId = useMemo(() => {
    if (!merchantId) return '—'
    if (merchantId.length <= 12) return merchantId
    return merchantId.slice(0, 6) + '...' + merchantId.slice(-4)
  }, [merchantId])

  // Member since: first dossier date or 'Aujourd\'hui'
  const memberSince = useMemo(() => {
    if (dossiers.length === 0) return "Aujourd'hui"
    const sorted = [...dossiers].sort((a, b) => a.createdAt - b.createdAt)
    return new Date(sorted[0].createdAt).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }, [dossiers])

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const handleLogout = () => {
    logout()
  }

  const handleDeleteAccount = () => {
    // Clear agent data from localStorage
    if (merchantPhone) {
      const normalized = merchantPhone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')
      localStorage.removeItem(`julaba-ident-agent-${normalized}`)
    }
    // Clear identificateur store persist data
    localStorage.removeItem('julaba-identificateur-store')
    // Logout and redirect to auth
    logout()
    setShowDeleteModal(false)
  }

  const handleChangePin = () => {
    toast({ title: 'Fonctionnalité bientôt disponible' })
  }

  const handleSupport = () => {
    toast({ title: 'Besoin de connexion internet' })
  }

  const handleAcademy = () => {
    navigate('ident-home')
  }

  return (
    <div className="screen-enter pb-24">
      {/* Top bar */}
      <div
        className="px-4 py-3 flex items-center gap-3 rounded-b-2xl"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="text-white/90 hover:text-white hover:bg-white/10 h-9 w-9"
          onClick={goBack}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-white font-bold text-sm tracking-wider">MON PROFIL</span>
      </div>

      {/* Profile header */}
      <div className="flex flex-col items-center mt-6 mb-2 px-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-3"
          style={{ backgroundColor: IDENT_COLOR }}
        >
          {initials}
        </div>
        <p className={cn('font-bold text-lg', textClass, soleilMode && 'text-xl')}>
          {merchantName || 'Agent'}
        </p>
        <p className={cn('text-sm text-muted-foreground mt-0.5', soleilMode && 'text-base')}>
          📱 {maskedPhone}
        </p>
      </div>

      {/* Info cards */}
      <div className="px-4 mt-4">
        <Card>
          <CardContent className="p-4">
            <InfoRow icon={Shield} label="Agent ID" value={truncatedId} soleilMode={soleilMode} />
            <Separator className="my-1" />
            <InfoRow icon={MapPin} label="Zone" value={agentZone} soleilMode={soleilMode} />
            <Separator className="my-1" />
            <InfoRow icon={Store} label="Marché" value={agentMarche} soleilMode={soleilMode} />
            <Separator className="my-1" />
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Rôle</span>
              </div>
              <Badge style={{ backgroundColor: IDENT_COLOR, color: 'white' }}>
                Identificateur
              </Badge>
            </div>
            <Separator className="my-1" />
            <InfoRow icon={Info} label="Membre depuis" value={memberSince} soleilMode={soleilMode} />
          </CardContent>
        </Card>
      </div>

      {/* PARAMÈTRES section */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          PARAMÈTRES
        </h2>
        <Card>
          <CardContent className="p-4 space-y-1">
            {/* Mode Soleil */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Sun className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Mode Soleil</span>
              </div>
              <Switch checked={soleilMode} onCheckedChange={toggleSoleil} />
            </div>
            <Separator className="my-1" />
            {/* Screen sensitive */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Écran sensible</span>
              </div>
              <Switch checked={screenSensitive} onCheckedChange={toggleScreenSensitive} />
            </div>
            <Separator className="my-1" />
            {/* Zone assignment */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Affectation zone</span>
              </div>
              <span className={cn('text-sm font-medium text-muted-foreground', textClass, soleilMode && 'text-base')}>
                {agentZone}
              </span>
            </div>
            <Separator className="my-1" />
            {/* Objectif mensuel */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Objectif mensuel</span>
              </div>
              <span className={cn('text-sm font-bold', textClass, soleilMode && 'text-base')} style={{ color: IDENT_COLOR }}>
                {mission.target}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECURITÉ section */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          SÉCURITÉ
        </h2>
        <Card>
          <CardContent className="p-4 space-y-1">
            {/* Change PIN */}
            <div className="py-2.5">
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between px-0 h-auto hover:bg-transparent"
                onClick={handleChangePin}
              >
                <div className="flex items-center gap-2.5">
                  <Fingerprint className="w-4 h-4 text-muted-foreground" />
                  <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Changer mon code PIN</span>
                </div>
              </Button>
            </div>
            <Separator className="my-1" />
            {/* Auto lock */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Verrouillage automatique</span>
              </div>
              <span className={cn('text-sm text-muted-foreground', soleilMode && 'text-base')}>15 min</span>
            </div>
            <Separator className="my-1" />
            {/* Screenshot blocked */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Capture écran bloquée</span>
              </div>
              <span className={cn('text-xs font-medium text-green-600', soleilMode && 'text-sm')}>Activé</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* À PROPOS section */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          À PROPOS
        </h2>
        <Card>
          <CardContent className="p-4 space-y-1">
            {/* Version */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Version</span>
              </div>
              <span className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
                Jùlaba Identificateur v1.0
              </span>
            </div>
            <Separator className="my-1" />
            {/* Academy */}
            <div className="py-2.5">
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between px-0 h-auto hover:bg-transparent"
                onClick={handleAcademy}
              >
                <div className="flex items-center gap-2.5">
                  <GraduationCap className="w-4 h-4 text-muted-foreground" />
                  <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Academy</span>
                </div>
              </Button>
            </div>
            <Separator className="my-1" />
            {/* Support */}
            <div className="py-2.5">
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between px-0 h-auto hover:bg-transparent"
                onClick={handleSupport}
              >
                <div className="flex items-center gap-2.5">
                  <Headphones className="w-4 h-4 text-muted-foreground" />
                  <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Support</span>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deconnexion & Suppression */}
      <div className="px-4 mt-8 space-y-3 mb-4">
        <Button
          className="w-full h-12 font-semibold gap-2"
          variant="outline"
          style={{ borderColor: '#dc2626', color: '#dc2626' }}
          onClick={() => setShowLogoutModal(true)}
        >
          <LogOut className="w-4 h-4" />
          DÉCONNEXION
        </Button>
        <Button
          className="w-full h-12 font-semibold gap-2"
          variant="outline"
          style={{ borderColor: '#dc2626', color: '#dc2626' }}
          onClick={() => setShowDeleteModal(true)}
        >
          <Trash2 className="w-4 h-4" />
          SUPPRIMER MON COMPTE
        </Button>
      </div>

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
              className="flex-1 text-white"
              style={{ backgroundColor: '#dc2626' }}
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
              className="flex-1 text-white"
              style={{ backgroundColor: '#dc2626' }}
              onClick={handleDeleteAccount}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
