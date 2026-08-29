'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Wheat, Warehouse, Calendar, Plus, CircleCheck, TriangleAlert, CircleAlert } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { cn } from '@/lib/utils'

const PROD_COLOR = '#2E8B57'

const ETAT_CONFIG = {
  bon: { label: 'En bon état', icon: CircleCheck, className: 'text-emerald-600' },
  a_surveiller: { label: 'À surveiller (humidité)', icon: TriangleAlert, className: 'text-amber-600' },
  bas: { label: 'Stock bas', icon: CircleAlert, className: 'text-red-600' },
} as const

export function ProdStockScreen() {
  const { soleilMode, goBack, navigate } = useAppStore()
  const { stock, cycleEnCours } = useProducteurStore()
  const textClass = soleilMode ? 'text-black' : ''
  const totalKg = stock.reduce((sum, s) => sum + s.quantiteKg, 0)

  return (
    <div className="screen-enter pb-24">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mon stock</h1>
      </div>

      <div className="px-4 mt-4">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Stock disponible
        </h3>
        <div className="space-y-3">
          {stock.map((s) => {
            const etat = ETAT_CONFIG[s.etat]
            const EtatIcon = etat.icon
            return (
              <Card key={s.produit}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${PROD_COLOR}15` }}>
                    <Wheat className="w-6 h-6" style={{ color: PROD_COLOR }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-semibold', textClass)}>{s.produit}</p>
                    <p className="text-sm text-muted-foreground">{s.quantiteKg.toLocaleString('fr-FR')} kg disponibles</p>
                    {s.prochaineRecolte && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        Récolte prévue : {new Date(s.prochaineRecolte).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                    <p className={cn('text-xs flex items-center gap-1 mt-1 font-medium', etat.className)}>
                      <EtatIcon className="w-3.5 h-3.5" /> {etat.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <div className="px-4 mt-5">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Entrepôts
        </h3>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Warehouse className="w-4 h-4 text-muted-foreground" />
              <span className={textClass}>Entrepôt principal</span>
              <span className="ml-auto font-semibold">{Math.round(totalKg * 0.75).toLocaleString('fr-FR')} kg</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Warehouse className="w-4 h-4 text-muted-foreground" />
              <span className={textClass}>Entrepôt village</span>
              <span className="ml-auto font-semibold">{Math.round(totalKg * 0.25).toLocaleString('fr-FR')} kg</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {cycleEnCours && (
        <div className="px-4 mt-5">
          <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
            Prochaines récoltes
          </h3>
          <Card>
            <CardContent className="p-4 flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4" style={{ color: PROD_COLOR }} />
              <span className={textClass}>
                {new Date(cycleEnCours.dateRecoltePrevue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} : {cycleEnCours.produit}
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 mt-5">
        <Button
          className="w-full h-12 text-white font-semibold gap-2"
          style={{ backgroundColor: PROD_COLOR }}
          onClick={() => navigate('prod-recoltes')}
        >
          <Plus className="w-5 h-5" />
          Déclarer une récolte
        </Button>
      </div>
    </div>
  )
}
