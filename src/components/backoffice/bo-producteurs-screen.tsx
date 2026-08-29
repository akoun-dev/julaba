'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wheat, Package, Truck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
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

export function BoProducteursScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [recoltes, setRecoltes] = useState<Recolte[]>([])
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [producteurCount, setProducteurCount] = useState(0)
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
    } catch {
      setError('Impossible de charger les données producteur.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  const formatFCFA = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
      <BoPageHeader
        title="Producteurs"
        description="Récoltes et commandes déclarées par les producteurs — aucun compte producteur n'est encore modélisé côté backoffice, ce module reste donc en lecture seule."
      />

      <Separator />

      <div className="grid grid-cols-3 gap-4">
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
                      Producteur {r.producteurId.slice(0, 8)}… · {formatFCFA(r.prixSouhaiteParKg)}/kg · {formatDate(r.createdAt)}
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
        <h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Commandes récentes</h2>
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
                      {c.acheteurNom} vers producteur {c.producteurId.slice(0, 8)}… · {formatFCFA(c.montant)} · {formatDate(c.createdAt)}
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
    </div>
  )
}
