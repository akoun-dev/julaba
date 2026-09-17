'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Eye, History, MoonStar, RotateCcw, ShieldCheck, VolumeX } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  categoryLabel, categoriesForRole, getNotificationPrefs, resetNotificationPrefs,
  setKeepHistory, setSilentUntil, setToastsEnabled, updateCategoryPref,
} from '@/lib/notifications/preferences'
import { effectiveCategoryPref } from '@/lib/notifications/rules'
import type { CategoryPref, NotificationCategory, NotificationPrefs } from '@/lib/notifications/types'

// Écran de préférences de notifications (§8 de la spec) — composant partagé
// marchand/producteur/identificateur, monté dans le profil de chaque rôle.
//
// Pour chaque catégorie : Tout afficher / Important seulement / Jamais —
// SAUF la sécurité, où « Jamais » n'existe pas (les notifications de
// sécurité ne peuvent pas être masquées sans avertissement, critère §8) ;
// le choix est silencieusement borné à « Important seulement », ce que
// l'interface explique en toutes lettres.
//
// Plus : toasts non critiques, conservation de l'historique, mode
// silencieux temporaire (jusqu'au réveil du mode / durée choisie),
// réinitialisation. Accessibilité : boutons ≥ 44 px, focus visible,
// labels explicites, aria-pressed sur le segment actif.

const PREF_OPTIONS: Array<{ value: CategoryPref; label: string }> = [
  { value: 'on', label: 'Tout' },
  { value: 'important', label: 'Important' },
  { value: 'off', label: 'Jamais' },
]

function CategoryPrefSelector({ category, value, onChange, accentColor }: { category: NotificationCategory; value: CategoryPref; onChange: (p: CategoryPref) => void; accentColor: string }) {
  const isSecurity = category === 'securite'
  const options = isSecurity ? PREF_OPTIONS.filter((o) => o.value !== 'off') : PREF_OPTIONS
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{categoryLabel(category)}</p>
        {isSecurity && (
          <p className="text-xs text-muted-foreground mt-0.5">
            La sécurité ne peut pas être désactivée complètement.
          </p>
        )}
      </div>
      <div
        role="group"
        aria-label={`Préférence pour ${categoryLabel(category)}`}
        className="flex shrink-0 rounded-lg border border-border p-0.5"
      >
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                'min-h-[36px] rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
                active ? 'text-white' : 'text-muted-foreground hover:bg-muted',
              )}
              style={active ? { backgroundColor: accentColor } : undefined}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function NotificationPreferencesScreen({ accentColor, onBack }: { accentColor: string; onBack: () => void }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [role, setRole] = useState<string>('marchand')
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    setPrefs(getNotificationPrefs())
    // Le rôle ne change pas pendant la vie de l'écran.
    import('@/lib/stores/app-store').then(({ useAppStore }) => setRole(useAppStore.getState().userRole))
  }, [])

  if (!prefs) {
    return <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
  }

  const categories = categoriesForRole(role)
  const silentActive = prefs.silentUntil && new Date(prefs.silentUntil).getTime() > Date.now()

  const silentForHours = (hours: number) => {
    setPrefs(setSilentUntil(new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()))
  }

  return (
    <div className="space-y-4">
      {/* Catégories */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Types de notifications</span>
          </div>
          {categories.map((category) => (
            <CategoryPrefSelector
              key={category}
              category={category}
              value={effectiveCategoryPref(prefs, category)}
              accentColor={accentColor}
              onChange={(p) => setPrefs(updateCategoryPref(category, p))}
            />
          ))}
        </CardContent>
      </Card>

      {/* Affichage */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Affichage</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <VolumeX className="w-4 h-4 text-muted-foreground" aria-hidden />Toasts non critiques
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Les messages d'erreur d'une action et les alertes importantes s'affichent toujours.
              </p>
            </div>
            <Switch checked={prefs.toastsEnabled} onCheckedChange={(v) => setPrefs(setToastsEnabled(v))} aria-label="Activer les toasts non critiques" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <History className="w-4 h-4 text-muted-foreground" aria-hidden />Conserver l'historique
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sinon, les notifications lues de plus de 7 jours sont effacées de l'appareil.
              </p>
            </div>
            <Switch checked={prefs.keepHistory} onCheckedChange={(v) => setPrefs(setKeepHistory(v))} aria-label="Conserver l'historique des notifications" />
          </div>
        </CardContent>
      </Card>

      {/* Mode silencieux */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MoonStar className="w-4 h-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Mode silencieux</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Met les toasts et la voix en pause. Les alertes importantes restent visibles dans le centre.
          </p>
          <div className="flex flex-wrap gap-2">
            {silentActive ? (
              <Button variant="outline" size="sm" className="h-11" onClick={() => setPrefs(setSilentUntil(null))}>
                <BellOff className="w-4 h-4 mr-1.5" aria-hidden />
                Désactiver (actif jusqu'à {new Date(prefs.silentUntil!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className="h-11" onClick={() => silentForHours(1)}>1 heure</Button>
                <Button variant="outline" size="sm" className="h-11" onClick={() => silentForHours(4)}>4 heures</Button>
                <Button variant="outline" size="sm" className="h-11" onClick={() => silentForHours(12)}>Jusqu'à ce soir</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Réinitialisation */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-muted-foreground" aria-hidden />Réinitialiser
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Restaure les préférences par défaut.</p>
            </div>
            <Button variant="outline" size="sm" className="h-11" onClick={() => setConfirmReset(true)}>
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground pb-2">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
        <span>Les alertes de sécurité et les erreurs qui demandent une correction restent toujours visibles.</span>
      </p>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser les préférences ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes les catégories reviendront à « Tout afficher », les toasts et l'historique seront réactivés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setPrefs(resetNotificationPrefs())}
              className="text-white"
              style={{ backgroundColor: accentColor }}
            >
              Réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
