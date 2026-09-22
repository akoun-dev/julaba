'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Truck,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Search,
  User,
  XCircle,
  CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

type DeliveryStatus = 'en_attente' | 'en_preparation' | 'en_transit' | 'livree' | 'retard' | 'echouee' | 'ramassee'

interface Delivery {
  id: string
  recipientName: string
  senderName: string
  senderPhone: string
  recipientPhone: string
  zone: string
  address: string
  status: DeliveryStatus
  courierName: string
  createdAt: string
  pickupAt?: string
  deliveredAt?: string
}

// ============== MAIN COMPONENT ==============

export function BoLivraisonScreen() {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'

  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)

  const statusConfig: Record<DeliveryStatus, { label: string; color: string; icon: React.ReactNode }> = {
    en_attente: { label: 'En attente', color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600', icon: <Package className="h-3 w-3" /> },
    en_preparation: { label: 'En préparation', color: isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700', icon: <Package className="h-3 w-3" /> },
    en_transit: { label: 'En transit', color: isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700', icon: <Truck className="h-3 w-3" /> },
    livree: { label: 'Livrée', color: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="h-3 w-3" /> },
    retard: { label: 'Retard', color: isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700', icon: <AlertTriangle className="h-3 w-3" /> },
    echouee: { label: 'Échoué', color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-700', icon: <XCircle className="h-3 w-3" /> },
    ramassee: { label: 'Ramassee', color: isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-700', icon: <Package className="h-3 w-3" /> },
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('tous')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/deliveries')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
       const rows = data.deliveries ?? (Array.isArray(data) ? data : [])
       setDeliveries(rows.map((row: Record<string, unknown>) => ({
         id: String(row.id ?? ''),
         recipientName: String(row.recipient_name ?? row.recipientName ?? 'Destinataire inconnu'),
         senderName: String(row.sender_name ?? row.senderName ?? 'Expéditeur inconnu'),
         senderPhone: String(row.sender_phone ?? row.senderPhone ?? ''),
         recipientPhone: String(row.recipient_phone ?? row.recipientPhone ?? ''),
         zone: String(row.zone ?? 'Zone inconnue'),
         address: String(row.address ?? 'Adresse non renseignée'),
         status: (row.status ?? 'en_attente') as DeliveryStatus,
         courierName: String(row.courier_name ?? row.courierName ?? ''),
         createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
         pickupAt: row.pickup_at ? String(row.pickup_at) : row.pickupAt ? String(row.pickupAt) : undefined,
         deliveredAt: row.delivered_at ? String(row.delivered_at) : row.deliveredAt ? String(row.deliveredAt) : undefined,
       })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      const matchSearch = !searchQuery ||
        d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.recipientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.courierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.zone.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = statusFilter === 'tous' || d.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [deliveries, searchQuery, statusFilter])

  const stats = useMemo(() => {
    if (deliveries.length === 0) return { enCours: 0, livreesToday: 0, retards: 0, taux: 0 }
    const enCours = deliveries.filter(d => d.status === 'en_transit' || d.status === 'en_preparation').length
    const livreesToday = deliveries.filter(d => d.status === 'livree' && d.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length
    const retards = deliveries.filter(d => d.status === 'retard').length
    const taux = Math.round((deliveries.filter(d => d.status === 'livree').length / deliveries.length) * 100)
    return { enCours, livreesToday, retards, taux }
  }, [deliveries])

  const formatTime = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const updateStatus = async (delivery: Delivery, status: DeliveryStatus) => {
    try {
      const res = await fetch('/api/backoffice/deliveries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: delivery.id, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.erreur || data.error || `Erreur ${res.status}`)
      const updated = { ...delivery, status, ...(status === 'ramassee' ? { pickupAt: new Date().toISOString() } : {}), ...(status === 'livree' ? { deliveredAt: new Date().toISOString() } : {}) }
      setDeliveries((current) => current.map((item) => item.id === delivery.id ? updated : item))
      setSelectedDelivery(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour')
    }
  }

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Header */}
      <BoPageHeader
        title="Livraison"
        description="Suivi et gestion des livraisons en temps réel"
      />

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-7 w-12 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Truck className="h-4 w-4 text-sky-500" />
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>En cours</p>
                </div>
                <p className="text-2xl font-bold text-sky-600">{stats.enCours}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-7 w-12 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Livrées aujourd&apos;hui</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{stats.livreesToday}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-7 w-12 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Retards</p>
                </div>
                <p className="text-2xl font-bold text-red-600">{stats.retards}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-7 w-12 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-500'}`} />
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Taux livraison</p>
                </div>
                <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{stats.taux}%</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <Input
            placeholder="Rechercher ID, destinataire, transporteur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les statuts</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="en_preparation">En préparation</SelectItem>
            <SelectItem value="en_transit">En transit</SelectItem>
            <SelectItem value="livree">Livrée</SelectItem>
            <SelectItem value="retard">Retard</SelectItem>
            <SelectItem value="echouee">Échoué</SelectItem>
            <SelectItem value="ramassee">Ramassee</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error State */}
      {error && <BoErrorBanner message={error} onRetry={fetchData} />}

      {/* Main Grid: Delivery list + Map */}
      {!error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Delivery Cards */}
          <div className="lg:col-span-2 space-y-3">
            {loading && (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className={`h-4 w-28 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                      <Skeleton className={`h-5 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                      <Skeleton className={`h-3 w-16 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    </div>
                    <Skeleton className={`h-4 w-48 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    <div className="flex gap-4">
                      <Skeleton className={`h-3 w-40 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                      <Skeleton className={`h-3 w-28 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    </div>
                    <div className="flex gap-4">
                      <Skeleton className={`h-3 w-36 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                      <Skeleton className={`h-3 w-36 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            {!loading && filtered.length === 0 && (
              <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Aucune livraison trouvée</p>
              </div>
            )}
            {!loading && filtered.map((delivery) => {
              const sc = statusConfig[delivery.status] ?? { label: delivery.status, color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600', icon: <Package className="h-3 w-3" /> }
              return (
                <Card key={delivery.id} className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border hover:shadow-none' : 'shadow-sm hover:shadow-md'} transition-shadow`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Top row: ID + Status + Items */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-mono text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {delivery.id}
                          </span>
                          <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${sc.color}`}>
                            {sc.icon}<span className="ml-1">{sc.label}</span>
                          </Badge>
                          <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{delivery.zone}</span>
                        </div>
                        {/* Destinataire */}
                        <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{delivery.recipientName}</p>
                        {/* Details row */}
                        <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{delivery.zone} — {delivery.address}</span>
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{delivery.courierName || 'Non assigné'}</span>
                        </div>
                        {/* Date row */}
                        <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Créé le {formatTime(delivery.createdAt)}</span>
                          {delivery.deliveredAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Livrée le {formatTime(delivery.deliveredAt)}</span>}
                        </div>
                      </div>
                       <Button variant="outline" size="sm" className="text-xs h-8 shrink-0" onClick={() => setSelectedDelivery(delivery)}>
                        <Truck className="h-3 w-3 mr-1" />
                        Détails
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Map Placeholder */}
          <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                <MapPin className="h-4 w-4 inline mr-1.5" />
                Carte de suivi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`h-[520px] rounded-lg ${isDark ? 'bg-slate-700' : 'bg-slate-100'} flex flex-col items-center justify-center ${isDark ? 'text-slate-500' : 'text-slate-400'} relative`}
                style={{ scrollbarWidth: 'thin', scrollbarColor: isDark ? '#475569 transparent' : '#D1D5DB transparent' }}
              >
                <MapPin className="h-14 w-14 mb-3 opacity-30" />
                <p className="text-sm font-medium">Carte de suivi</p>
                <p className="text-xs mt-1">Intégration Google Maps / Mapbox</p>
                <div className="mt-6 flex flex-wrap gap-2 justify-center px-4">
                  {deliveries.filter(d => d.status === 'en_transit').map(d => (
                    <div key={d.id} className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-md ${isDark ? 'bg-slate-800 border-slate-700 border' : 'bg-white border-slate-100 border'} ${isDark ? '' : 'shadow-sm'}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                      <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{d.zone}</span>
                    </div>
                  ))}
                  {deliveries.filter(d => d.status === 'retard').map(d => (
                    <div key={d.id} className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-md ${isDark ? 'bg-slate-800 border-slate-700 border' : 'bg-white border-slate-100 border'} ${isDark ? '' : 'shadow-sm'}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{d.zone}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={selectedDelivery !== null} onOpenChange={(open) => { if (!open) setSelectedDelivery(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails de la livraison</DialogTitle>
            <DialogDescription>{selectedDelivery?.id || 'Livraison'}</DialogDescription>
          </DialogHeader>
          {selectedDelivery && (() => {
            const sc = statusConfig[selectedDelivery.status] ?? { label: selectedDelivery.status, color: '', icon: <Package className="h-3 w-3" /> }
            return (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary" className={sc.color}>{sc.icon}<span className="ml-1">{sc.label}</span></Badge>
                  <span className="font-mono text-xs text-muted-foreground">{selectedDelivery.id}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Expéditeur</p><p className="text-sm font-medium">{selectedDelivery.senderName}</p><p className="text-xs text-muted-foreground">{selectedDelivery.senderPhone || 'Téléphone non renseigné'}</p></div>
                  <div className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Destinataire</p><p className="text-sm font-medium">{selectedDelivery.recipientName}</p><p className="text-xs text-muted-foreground">{selectedDelivery.recipientPhone || 'Téléphone non renseigné'}</p></div>
                </div>
                <div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Adresse:</span> {selectedDelivery.address}</p><p><span className="text-muted-foreground">Zone:</span> {selectedDelivery.zone}</p><p><span className="text-muted-foreground">Transporteur:</span> {selectedDelivery.courierName || 'Non assigné'}</p><p><span className="text-muted-foreground">Créée le:</span> {formatTime(selectedDelivery.createdAt)}</p>{selectedDelivery.pickupAt && <p><span className="text-muted-foreground">Ramassée le:</span> {formatTime(selectedDelivery.pickupAt)}</p>}{selectedDelivery.deliveredAt && <p><span className="text-muted-foreground">Livrée le:</span> {formatTime(selectedDelivery.deliveredAt)}</p>}</div>
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => setSelectedDelivery(null)}>Fermer</Button>{selectedDelivery.status === 'en_attente' && <Button onClick={() => updateStatus(selectedDelivery, 'en_preparation')}>Préparer</Button>}{selectedDelivery.status === 'en_preparation' && <Button onClick={() => updateStatus(selectedDelivery, 'en_transit')}>Mettre en transit</Button>}{selectedDelivery.status === 'en_transit' && <Button onClick={() => updateStatus(selectedDelivery, 'livree')}>Marquer livrée</Button>}</div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
