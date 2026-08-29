'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Phone, MapPin, Star, LogOut } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { cn } from '@/lib/utils'

const PROD_COLOR = '#2E8B57'

export function ProdProfilScreen() {
  const { soleilMode, goBack, merchantName, merchantPhone, logout } = useAppStore()
  const textClass = soleilMode ? 'text-black' : ''
  const initials = (merchantName || 'K').charAt(0).toUpperCase()

  return (
    <div className="screen-enter pb-24">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9" aria-label="Retour">
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
        <h2 className={cn('text-lg font-bold mt-3', textClass)}>Papa {merchantName || 'Kouadio'}</h2>
        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
          <MapPin className="w-3.5 h-3.5" /> Village de Kong · Région des Lagunes
        </p>
        <div className="flex items-center gap-1 mt-2 text-sm">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          <span className="font-semibold">4.8</span>
          <span className="text-muted-foreground">(127 avis) · Producteur de confiance</span>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-3 p-4">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-slate-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Téléphone</p>
                <p className={cn('text-sm font-medium', textClass)}>{merchantPhone || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-6">
        <Button
          variant="outline"
          className="w-full h-12 gap-2 text-red-600 border-red-200 hover:bg-red-50"
          onClick={logout}
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </Button>
      </div>
    </div>
  )
}
