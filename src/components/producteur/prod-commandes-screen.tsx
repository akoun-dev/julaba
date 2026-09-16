'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Check, X, Truck, MapPin, Calendar, ShoppingCart } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore, type CommandeStatut } from '@/lib/stores/producteur-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { cn } from '@/lib/utils'

const PROD_COLOR = '#2E8B57'

type Filter = 'a_traiter' | 'en_cours' | 'livree' | 'toutes'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'a_traiter', label: 'À traiter' },
  { id: 'en_cours', label: 'En cours' },
  { id: 'livree', label: 'Livrées' },
  { id: 'toutes', label: 'Toutes' },
]

export function ProdCommandesScreen() {
  const { soleilMode, goBack } = useAppStore()
  const { commandes, repondreCommande, confirmerLivraison } = useProducteurStore()
  const [filter, setFilter] = useState<Filter>('a_traiter')
  const textClass = soleilMode ? 'text-black' : ''

  const filtered = commandes.filter((c) => {
    if (filter === 'toutes') return true
    return c.statut === (filter as CommandeStatut)
  })

  const countFor = (statut: CommandeStatut) => commandes.filter((c) => c.statut === statut).length

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mes commandes</h1>
      </div>

      <div className="px-4 pt-3 flex gap-2 overflow-x-auto julaba-scroll">
        {FILTERS.map((f) => {
          const count = f.id === 'toutes' ? commandes.length : countFor(f.id as CommandeStatut)
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                 filter === f.id ? 'text-white border-transparent' : 'bg-white text-muted-foreground border-border dark:bg-stone-800 dark:text-stone-300 dark:border-stone-600'
              )}
              style={filter === f.id ? { backgroundColor: PROD_COLOR } : undefined}
            >
              {f.label}{count > 0 ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>

      <div className="px-4 mt-4 space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <ShoppingCart className="w-8 h-8 opacity-30" />
              Aucune commande dans cette catégorie
            </CardContent>
          </Card>
        )}
        {filtered.map((c) => (
          <Card key={c.id} className={c.urgent && c.statut === 'a_traiter' ? 'border-orange-300' : undefined}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-muted-foreground">#{c.reference}</span>
                {c.urgent && c.statut === 'a_traiter' && (
                   <Badge className="bg-orange-100 text-orange-700 border-0 dark:bg-orange-900/60 dark:text-orange-300">Urgent</Badge>
                )}
                {c.statut === 'en_cours' && (
                   <Badge className="bg-sky-100 text-sky-700 border-0 gap-1 dark:bg-sky-900/60 dark:text-sky-300"><Truck className="w-3 h-3" /> En livraison</Badge>
                )}
                {c.statut === 'livree' && (
                   <Badge className="bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/60 dark:text-emerald-300">Livrée</Badge>
                )}
              </div>
              <p className={cn('font-semibold', textClass)}>{c.acheteurNom}</p>
              <p className="text-sm text-muted-foreground">{c.produit} · {c.quantiteKg} kg</p>
              <p className={cn('text-sm font-semibold mt-1 fcfa', textClass)}>{formatFCFA(c.montant)}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="w-3 h-3" />
                Livraison souhaitée : {new Date(c.dateLivraisonSouhaitee).toLocaleDateString('fr-FR')}
              </p>
              {c.transporteur && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Transporteur : {c.transporteur}
                </p>
              )}

              {c.statut === 'a_traiter' && (
                <div className="flex gap-2 mt-3">
                  <Button
                    className="flex-1 h-10 text-white font-medium gap-1.5"
                    style={{ backgroundColor: PROD_COLOR }}
                    onClick={() => repondreCommande(c.id, true)}
                  >
                    <Check className="w-4 h-4" /> Accepter
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-10 font-medium gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => repondreCommande(c.id, false)}
                  >
                    <X className="w-4 h-4" /> Refuser
                  </Button>
                </div>
              )}
              {c.statut === 'en_cours' && (
                <Button
                  className="w-full h-10 mt-3 text-white font-medium gap-1.5"
                  style={{ backgroundColor: PROD_COLOR }}
                  onClick={() => confirmerLivraison(c.id)}
                >
                  <Check className="w-4 h-4" /> Confirmer la livraison
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
