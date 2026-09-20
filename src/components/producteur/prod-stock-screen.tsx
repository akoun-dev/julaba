'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Wheat, Calendar, Plus, CircleCheck, TriangleAlert, CircleAlert, Package, Warehouse } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore } from '@/lib/stores/producteur-store'
import { ProdAideLitteratie } from '@/components/producteur/prod-aide-litteratie'
import { cn } from '@/lib/utils'


const ETAT_CONFIG = {
  bon: { label: 'En bon état', icon: CircleCheck, className: 'text-emerald-600' },
  a_surveiller: { label: 'À surveiller (humidité)', icon: TriangleAlert, className: 'text-amber-600' },
  bas: { label: 'Stock bas', icon: CircleAlert, className: 'text-red-600' },
} as const

export function ProdStockScreen() {
  const { soleilMode, goBack, navigate } = useAppStore()
  const { stock, cycleEnCours, isLoading, loadError, hasLoaded, loadFromServer } = useProducteurStore()
  const textClass = soleilMode ? 'text-black' : ''
  const totalKg = stock.reduce((sum, s) => sum + s.quantiteKg, 0)

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mon stock</h1>
      </div>

      {/* MODE-930 — aide contextuelle littératie (micro plutôt que lecture) */}
      <ProdAideLitteratie />

      {isLoading && <p className="px-4 pt-4 text-sm text-muted-foreground" role="status">Chargement de votre stock…</p>}
      {loadError && hasLoaded && !isLoading && (
        <div className="px-4 pt-4" role="alert">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/70 dark:bg-red-950/40 dark:text-red-300">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => { void loadFromServer() }}>Réessayer</Button>
          </div>
        </div>
      )}

      {/* Héro dégradé — remplace les deux cartes « Entrepôt » et
          « Prochaines récoltes » qui doublaient l'information. */}
      <div className="px-4 mt-4">
        <Card className="bg-gradient-to-br from-[var(--vl-prod)] to-[var(--prod-dark)] text-white border-0">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-white/80" />
              <p className="text-white/80 text-xs">Stock total en entrepôt</p>
            </div>
            <p className="text-white font-bold text-2xl fcfa mt-1">{totalKg.toLocaleString('fr-FR')} kg</p>
            {cycleEnCours && (
              <p className="text-white/80 text-xs flex items-center gap-1 mt-2">
                <Calendar className="w-3 h-3 shrink-0" />
                Prochaine récolte : {new Date(cycleEnCours.dateRecoltePrevue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} ({cycleEnCours.produit})
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-5">
        <h3 className={cn('text-sm font-semibold text-muted-foreground mb-2', soleilMode && 'text-base')}>
          Détail par produit
        </h3>
        {stock.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Package className="w-12 h-12 opacity-30" />
              Aucun stock enregistré pour le moment
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {stock.map((s) => {
              const etat = ETAT_CONFIG[s.etat]
              const EtatIcon = etat.icon
              return (
                <Card key={s.produit}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 bg-[var(--prod-dim)]">
                      <Wheat className="w-6 h-6 text-[var(--vl-prod)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('font-semibold text-sm truncate', textClass)}>{s.produit}</p>
                        <p className={cn('text-sm font-semibold fcfa shrink-0', textClass)}>
                          {s.quantiteKg.toLocaleString('fr-FR')} kg
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5 flex-wrap">
                        {s.prochaineRecolte ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3 shrink-0" />
                            Récolte : {new Date(s.prochaineRecolte).toLocaleDateString('fr-FR')}
                          </p>
                        ) : (
                          <span />
                        )}
                        <p className={cn('text-xs flex items-center gap-1 font-medium', etat.className)}>
                          <EtatIcon className="w-3.5 h-3.5 shrink-0" /> {etat.label}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-4 mt-5">
        <Button
          className="w-full h-12 text-white font-semibold gap-2 bg-[var(--vl-prod)] hover:bg-[var(--prod-dark)]"
          onClick={() => navigate('prod-recoltes')}
        >
          <Plus className="w-5 h-5" />
          Déclarer une récolte
        </Button>
      </div>
    </div>
  )
}
