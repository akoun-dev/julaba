'use client'

import { PROD_COLOR } from '@/lib/design-tokens'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Check, X, Truck, Calendar, ShoppingCart } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useProducteurStore, type CommandeStatut } from '@/lib/stores/producteur-store'
import { formatFCFA } from '@/lib/utils'
import { announceProducteurAction } from '@/lib/voice/producteur-actions'
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
import { cn } from '@/lib/utils'


// 'À traiter' couvre a_traiter + en_attente (les deux statuts posés par le
// serveur avant acceptation), 'En cours' couvre en_cours + confirmee.
type Filter = 'a_traiter' | 'en_cours' | 'livree' | 'toutes'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'a_traiter', label: 'À traiter' },
  { id: 'en_cours', label: 'En cours' },
  { id: 'livree', label: 'Livrées' },
]

// Tous les statuts réellement posés par le seed / le serveur ont désormais
// leur badge — avant, 'en_attente' et 'confirmee' n'affichaient rien.
const STATUT_BADGE: Record<CommandeStatut, { label: string; className: string }> = {
  a_traiter: { label: 'À traiter', className: 'bg-orange-100 text-orange-700 border-0 dark:bg-orange-900/60 dark:text-orange-300' },
  en_attente: { label: 'En attente', className: 'bg-orange-100 text-orange-700 border-0 dark:bg-orange-900/60 dark:text-orange-300' },
  confirmee: { label: 'Confirmée', className: 'bg-sky-100 text-sky-700 border-0 dark:bg-sky-900/60 dark:text-sky-300' },
  en_cours: { label: 'En livraison', className: 'bg-sky-100 text-sky-700 border-0 gap-1 dark:bg-sky-900/60 dark:text-sky-300' },
  livree: { label: 'Livrée', className: 'bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/60 dark:text-emerald-300' },
  refusee: { label: 'Refusée', className: 'bg-slate-100 text-slate-600 border-0 dark:bg-slate-800 dark:text-slate-300' },
}

export function ProdCommandesScreen() {
  const { soleilMode, goBack } = useAppStore()
  const { commandes, repondreCommande, confirmerLivraison } = useProducteurStore()
  // 'Toutes' par défaut : la liste n'est jamais vide à l'ouverture, même
  // quand aucun statut serveur ne correspond aux anciens filtres.
  const [filter, setFilter] = useState<Filter>('toutes')
  const textClass = soleilMode ? 'text-black' : ''
  // UI-MP-016 — refuser une commande est irréversible et engage le
  // producteur : la décision passe par une confirmation explicite qui nomme
  // l'objet (la commande de {acheteur}) et la conséquence (définitive).
  const [refusCible, setRefusCible] = useState<string | null>(null)

  // UI-MP-004 — chaque mutation métier est annoncée à la voix + vibrée
  // (WF4 : jamais d'écriture silencieuse dans l'espace producteur).
  const handleRepondre = (id: string, accepter: boolean) => {
    repondreCommande(id, accepter)
    announceProducteurAction(
      accepter ? 'Commande acceptée. Préparez la livraison.' : 'Commande refusée.',
    )
    setRefusCible(null)
  }

  const handleLivraison = (id: string) => {
    confirmerLivraison(id)
    announceProducteurAction('Livraison confirmée.')
  }

  const isATraiter = (s: CommandeStatut) => s === 'a_traiter' || s === 'en_attente'
  const isEnCours = (s: CommandeStatut) => s === 'en_cours' || s === 'confirmee'

  const filtered = commandes.filter((c) => {
    if (filter === 'toutes') return true
    if (filter === 'a_traiter') return isATraiter(c.statut)
    if (filter === 'en_cours') return isEnCours(c.statut)
    return c.statut === 'livree'
  })

  const countFor = (f: Filter) =>
    f === 'toutes'
      ? commandes.length
      : commandes.filter((c) =>
          f === 'a_traiter' ? isATraiter(c.statut) : f === 'en_cours' ? isEnCours(c.statut) : c.statut === 'livree'
        ).length

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={cn('font-bold text-lg', textClass)}>Mes commandes</h1>
      </div>

      <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              filter === f.id
                ? 'bg-[#2E8B57] text-white border-transparent'
                : 'bg-white text-muted-foreground border-border dark:bg-stone-800 dark:text-stone-300 dark:border-stone-600'
            )}
          >
            {f.label}{countFor(f.id) > 0 ? ` (${countFor(f.id)})` : ''}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <ShoppingCart className="w-12 h-12 opacity-30" />
              Aucune commande dans cette catégorie
            </CardContent>
          </Card>
        )}
        {filtered.map((c) => {
          const badge = STATUT_BADGE[c.statut]
          const actionable = isATraiter(c.statut)
          return (
            <Card
              key={c.id}
              className={cn(
                actionable && c.urgent && 'border-orange-300 bg-orange-50/50 dark:border-orange-800/70 dark:bg-orange-950/40'
              )}
            >
              <CardContent className="p-4">
                {/* Ligne clé : produit + montant — l'info essentielle d'abord */}
                <div className="flex items-start justify-between gap-3">
                  <p className={cn('font-semibold truncate', textClass)}>
                    {c.produit} · {c.quantiteKg.toLocaleString('fr-FR')} kg
                  </p>
                  <p className="text-sm font-semibold fcfa shrink-0" style={{ color: PROD_COLOR }}>
                    {formatFCFA(c.montant)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground truncate">{c.acheteurNom}</p>

                <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">#{c.reference}</span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {actionable && c.urgent && (
                      <Badge className="bg-orange-100 text-orange-700 border-0 dark:bg-orange-900/60 dark:text-orange-300">Urgent</Badge>
                    )}
                    {badge && (
                      <Badge className={badge.className}>
                        {c.statut === 'en_cours' && <Truck className="w-3 h-3" />}
                        {badge.label}
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                  <Calendar className="w-3 h-3 shrink-0" />
                  Livraison : {new Date(c.dateLivraisonSouhaitee).toLocaleDateString('fr-FR')}
                  {c.transporteur && <span className="truncate">· {c.transporteur}</span>}
                </p>

                {actionable && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      className="flex-1 h-10 text-white font-medium gap-1.5 bg-[#2E8B57] hover:bg-[#27794D]"
                      onClick={() => handleRepondre(c.id, true)}
                    >
                      <Check className="w-4 h-4" /> Accepter la commande
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-10 font-medium gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setRefusCible(c.id)}
                    >
                      <X className="w-4 h-4" /> Refuser la commande
                    </Button>
                  </div>
                )}
                {c.statut === 'en_cours' && (
                  <Button
                    className="w-full h-10 mt-3 text-white font-medium gap-1.5 bg-[#2E8B57] hover:bg-[#27794D]"
                    onClick={() => handleLivraison(c.id)}
                  >
                    <Check className="w-4 h-4" /> Confirmer la livraison
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* UI-MP-016 — confirmation explicite avant refus définitif : Verbe + Objet,
          conséquence nommée, sortie sans dommage (« Garder la commande »). */}
      <AlertDialog
        open={refusCible !== null}
        onOpenChange={(open) => { if (!open) setRefusCible(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refuser la commande ?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const c = commandes.find((cmd) => cmd.id === refusCible)
                return c
                  ? `Refuser la commande de ${c.acheteurNom} (${c.quantiteKg} kg de ${c.produit}) ? Elle ne pourra plus être acceptée.`
                  : 'Elle ne pourra plus être acceptée.'
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder la commande</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => refusCible && handleRepondre(refusCible, false)}
            >
              Refuser la commande
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
