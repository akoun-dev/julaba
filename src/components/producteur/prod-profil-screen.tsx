'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Phone, MapPin, Star, LogOut, Award, BarChart3, Mic, Bell, Moon } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { cn } from '@/lib/utils'
import { cleanupProducteurData } from '@/lib/cleanup'
import { getSimpleNotifPrefs, setSimpleNotifPrefs } from '@/lib/notification-preferences'

const PROD_COLOR = '#2E8B57'

// Token unique pour tous les interrupteurs du profil (répété en dur avant).
const SWITCH_CLS = 'data-[state=checked]:bg-[#2E8B57]'

export function ProdProfilScreen() {
  const { darkMode, toggleDarkMode, soleilMode, goBack, merchantName, merchantPhone, merchantSexe, logout, voiceEnabled, toggleVoice, wakeWordEnabled, toggleWakeWord } = useAppStore()
  const { reputation } = useProducteurStore()
  const textClass = soleilMode ? 'text-black' : ''
  const initials = (merchantName || 'K').charAt(0).toUpperCase()
  const honorific = merchantSexe === 'feminin' ? 'Maman' : 'Papa'

  // 'systeme' is the only mutable category outside marchand (which also has
  // 'tontines') — covers sync-conflict alerts and admin announcements.
  const [systemeNotif, setSystemeNotif] = useState(() => getSimpleNotifPrefs('producteur').systeme)
  const toggleSystemeNotif = (checked: boolean) => {
    setSystemeNotif(checked)
    setSimpleNotifPrefs('producteur', { systeme: checked })
  }

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mon profil</h1>
      </div>

      <div className="px-4 mt-5 flex flex-col items-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center border-2"
          style={{ backgroundColor: `${PROD_COLOR}15`, borderColor: `${PROD_COLOR}4d` }}
        >
          <span className="text-2xl font-bold" style={{ color: PROD_COLOR }}>{initials}</span>
        </div>
        <h2 className={cn('text-lg font-bold mt-3', textClass)}>{honorific} {merchantName || 'Kouadio'}</h2>
        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
          <MapPin className="w-3.5 h-3.5" /> Exploitation agricole
        </p>
        <div className="flex items-center gap-1 mt-2 text-sm">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          <span className="font-semibold">{reputation.note}</span>
          <span className="text-muted-foreground">({reputation.avisCount} avis)</span>
        </div>
      </div>

      <div className="px-4 mt-6">
        {/* Compte + préférences regroupés — l'ancienne version éparpillait
            5 réglages dans 6 cartes séparées. */}
        <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
            Compte & préférences
        </h3>
        <Card>
          <CardContent className="p-0 divide-y">
            <div className="flex items-center gap-3 p-4">
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-stone-800 flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-slate-600 dark:text-stone-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Téléphone</p>
                <p className={cn('text-sm font-medium', textClass)}>{merchantPhone || '—'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={cn('text-sm font-medium', textClass)}>Voix activée</span>
              </div>
              <Switch checked={voiceEnabled} onCheckedChange={toggleVoice} className={SWITCH_CLS} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <span className={cn('text-sm font-medium', textClass)}>Mot d&apos;appel &quot;Julaba&quot;</span>
                  <p className="text-xs text-muted-foreground">Dites &quot;Julaba&quot; pour activer la voix</p>
                </div>
              </div>
              <Switch checked={wakeWordEnabled} onCheckedChange={toggleWakeWord} className={SWITCH_CLS} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <span className={cn('text-sm font-medium', textClass)}>Notifications système</span>
                  <p className="text-xs text-muted-foreground">Alertes de synchronisation et annonces Jùlaba</p>
                </div>
              </div>
              <Switch checked={systemeNotif} onCheckedChange={toggleSystemeNotif} className={SWITCH_CLS} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={cn('text-sm font-medium', textClass)}>Mode sombre</span>
              </div>
              <Switch checked={darkMode} onCheckedChange={toggleDarkMode} className={SWITCH_CLS} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Réputation détaillée */}
      <div className="px-4 mt-6">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Ma réputation
        </h3>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className={cn('font-bold', textClass)}>{reputation.qualite}/5</p>
                <p className="text-[11px] text-muted-foreground">Qualité</p>
              </div>
              <div>
                <p className={cn('font-bold', textClass)}>{reputation.ponctualite}/5</p>
                <p className="text-[11px] text-muted-foreground">Ponctualité</p>
              </div>
              <div>
                <p className={cn('font-bold', textClass)}>{reputation.communication}/5</p>
                <p className="text-[11px] text-muted-foreground">Communication</p>
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Award className="w-4 h-4 shrink-0" style={{ color: PROD_COLOR }} />
                <span className={textClass}>{reputation.badge}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <BarChart3 className="w-4 h-4 shrink-0" style={{ color: PROD_COLOR }} />
                <span className={textClass}>{reputation.classement}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-6">
        <Button
          variant="outline"
          className="w-full h-12 gap-2 text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => { cleanupProducteurData(); logout() }}
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </Button>
      </div>
    </div>
  )
}
