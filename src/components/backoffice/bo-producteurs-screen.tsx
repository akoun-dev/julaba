'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wheat, Package, Truck, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { formatFCFA } from '@/lib/utils'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

interface Recolte {
  id: string
  producteurId: string
  produit: string
  quantiteKg: number
  qualite: string
  statut: string
  prixSouhaiteParKg: number
  createdAt: string
}

interface Commande {
  id: string
  producteurId: string
  reference: string
  acheteurNom: string
  produit: string
  quantiteKg: number
  montant: number
  statut: string
  urgent: boolean
  createdAt: string
}

const RECOLTE_STATUT_LABEL: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: 'bg-slate-100 text-slate-700' },
  publiee: { label: 'Publiée', color: 'bg-blue-100 text-blue-700' },
  vendue: { label: 'Vendue', color: 'bg-emerald-100 text-emerald-700' },
}

const COMMANDE_STATUT_LABEL: Record<string, { label: string; color: string }> = {
  a_traiter: { label: 'À traiter', color: 'bg-amber-100 text-amber-700' },
  en_cours: { label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  livree: { label: 'Livrée', color: 'bg-emerald-100 text-emerald-700' },
  refusee: { label: 'Refusée', color: 'bg-red-100 text-red-700' },
}

interface ActorInfo {
  firstName: string
  lastName: string | null
  phone: string
  zone: string
}

export function BoProducteursScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [recoltes, setRecoltes] = useState<Recolte[]>([])
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [producteurCount, setProducteurCount] = useState(0)
  const [actorByProducteurId, setActorByProducteurId] = useState<Record<string, ActorInfo>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/producteurs')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setRecoltes(data.recoltes ?? [])
      setCommandes(data.commandes ?? [])
      setProducteurCount(data.producteurCount ?? 0)
      setActorByProducteurId(data.actorByProducteurId ?? {})
    } catch {
      setError('Impossible de charger les données producteur.')
    } finally {
      setLoading(false)
    }
  }, [])

  const producteurLabel = (id?: string) => {
    if (!id) return 'Producteur inconnu'
    const actor = actorByProducteurId[id]
    if (!actor) return `Producteur ${id.slice(0, 8)}…`
    return `${actor.firstName}${actor.lastName ? ` ${actor.lastName}` : ''} · ${actor.phone}`
  }

  useEffect(() => { fetchData() }, [fetchData])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

  // Known producteurs = whoever has already declared at least one récolte —
  // there's no separate producteur directory to pick from (see bo-actors
  // linkage: only self-service registrations end up here at all).
  const knownProducteurIds = [...new Set(recoltes.map((r) => r.producteurId))]

  const [showNewCommande, setShowNewCommande] = useState(false)
  const [ncProducteurId, setNcProducteurId] = useState('')
  const [ncAcheteurNom, setNcAcheteurNom] = useState('')
  const [ncProduit, setNcProduit] = useState('')
  const [ncQuantiteKg, setNcQuantiteKg] = useState('')
  const [ncMontant, setNcMontant] = useState('')
  const [ncDateLivraison, setNcDateLivraison] = useState('')
  const [ncUrgent, setNcUrgent] = useState(false)
  const [ncSubmitting, setNcSubmitting] = useState(false)
  const [ncError, setNcError] = useState<string | null>(null)

  const resetNewCommandeForm = () => {
    setNcProducteurId(''); setNcAcheteurNom(''); setNcProduit(''); setNcQuantiteKg('')
    setNcMontant(''); setNcDateLivraison(''); setNcUrgent(false); setNcError(null)
  }

  const handleCreateCommande = async () => {
    setNcError(null)
    if (!ncProducteurId || !ncAcheteurNom.trim() || !ncProduit.trim()) {
      setNcError('Producteur, acheteur et produit sont obligatoires.')
      return
    }
    setNcSubmitting(true)
    try {
      const res = await fetch('/api/producteur/commandes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          producteurId: ncProducteurId,
          reference: `CMD-${Date.now().toString(36).toUpperCase()}`,
          acheteurNom: ncAcheteurNom.trim(),
          produit: ncProduit.trim(),
          quantiteKg: Number(ncQuantiteKg) || 0,
          montant: Number(ncMontant) || 0,
          dateLivraisonSouhaitee: ncDateLivraison || undefined,
          urgent: ncUrgent,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Erreur ${res.status}`)
      }
      setShowNewCommande(false)
      resetNewCommandeForm()
      await fetchData()
    } catch (err) {
      setNcError(err instanceof Error ? err.message : 'Erreur lors de la création de la commande.')
    } finally {
      setNcSubmitting(false)
    }
  }

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100%' }}>
      <BoPageHeader
        title="Producteurs"
        description="Récoltes et commandes déclarées par les producteurs — les noms affichés proviennent du registre Acteurs quand le producteur s'est déjà connecté (liaison automatique à l'inscription)."
      />

      <Separator />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Wheat className="h-4 w-4" /> Producteurs actifs
            </div>
            {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{producteurCount}</p>}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Package className="h-4 w-4" /> Récoltes
            </div>
            {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{recoltes.length}</p>}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Truck className="h-4 w-4" /> Commandes
            </div>
            {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{commandes.length}</p>}
          </CardContent>
        </Card>
      </div>

      {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

      <div>
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Récoltes récentes</h2>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-0 divide-y divide-border">
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4"><Skeleton className="h-5 w-64" /></div>
            ))}
            {!loading && recoltes.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground text-center">Aucune récolte enregistrée.</p>
            )}
            {!loading && recoltes.map((r) => {
              const meta = RECOLTE_STATUT_LABEL[r.statut] ?? { label: r.statut, color: 'bg-slate-100 text-slate-700' }
              return (
                <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {r.produit} · {r.quantiteKg} kg · {r.qualite}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {producteurLabel(r.producteurId)} · {formatFCFA(r.prixSouhaiteParKg)}/kg · {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <Badge className={`${meta.color} shrink-0`}>{meta.label}</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Commandes récentes</h2>
          <Button
            size="sm"
            variant="outline"
            disabled={knownProducteurIds.length === 0}
            onClick={() => setShowNewCommande(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nouvelle commande
          </Button>
        </div>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
          <CardContent className="p-0 divide-y divide-border">
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4"><Skeleton className="h-5 w-64" /></div>
            ))}
            {!loading && commandes.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground text-center">Aucune commande enregistrée.</p>
            )}
            {!loading && commandes.map((c) => {
              const meta = COMMANDE_STATUT_LABEL[c.statut] ?? { label: c.statut, color: 'bg-slate-100 text-slate-700' }
              return (
                <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {c.reference} · {c.produit} · {c.quantiteKg} kg
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.acheteurNom} vers {producteurLabel(c.producteurId)} · {formatFCFA(c.montant)} · {formatDate(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.urgent && <Badge className="bg-red-100 text-red-700">Urgent</Badge>}
                    <Badge className={meta.color}>{meta.label}</Badge>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Sheet open={showNewCommande} onOpenChange={(open) => { setShowNewCommande(open); if (!open) resetNewCommandeForm() }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Nouvelle commande</SheetTitle>
            <SheetDescription>
              Enregistre une commande reçue par téléphone ou en personne pour un producteur — celui-ci en est notifié immédiatement dans l&apos;application.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nc-producteur">Producteur</Label>
              <Select value={ncProducteurId} onValueChange={setNcProducteurId}>
                <SelectTrigger id="nc-producteur" className="w-full">
                  <SelectValue placeholder="Sélectionner un producteur" />
                </SelectTrigger>
                <SelectContent>
                  {knownProducteurIds.map((id) => (
                    <SelectItem key={id} value={id}>{producteurLabel(id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-acheteur">Nom de l&apos;acheteur</Label>
              <Input id="nc-acheteur" value={ncAcheteurNom} onChange={(e) => setNcAcheteurNom(e.target.value)} placeholder="Ex : Restaurant Le Palmier" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nc-produit">Produit</Label>
                <Input id="nc-produit" value={ncProduit} onChange={(e) => setNcProduit(e.target.value)} placeholder="Ex : Manioc" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nc-quantite">Quantité (kg)</Label>
                <Input id="nc-quantite" type="number" min="0" value={ncQuantiteKg} onChange={(e) => setNcQuantiteKg(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nc-montant">Montant (FCFA)</Label>
                <Input id="nc-montant" type="number" min="0" value={ncMontant} onChange={(e) => setNcMontant(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nc-date">Livraison souhaitée</Label>
                <Input id="nc-date" type="date" value={ncDateLivraison} onChange={(e) => setNcDateLivraison(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="nc-urgent" checked={ncUrgent} onCheckedChange={(v) => setNcUrgent(v === true)} />
              <Label htmlFor="nc-urgent" className="font-normal">Commande urgente</Label>
            </div>
            {ncError && <p className="text-sm text-red-600">{ncError}</p>}
          </div>
          <SheetFooter>
            <Button onClick={handleCreateCommande} disabled={ncSubmitting}>
              {ncSubmitting ? 'Création…' : 'Créer la commande'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
