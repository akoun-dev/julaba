'use client'

import { useState, useMemo } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BO_COLOR, BO_COLOR_BG } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type DeliveryStatus = 'en_preparation' | 'en_transit' | 'livree' | 'retard' | 'echoue'

interface Delivery {
  id: string
  destinataire: string
  zone: string
  address: string
  status: DeliveryStatus
  livreur: string
  createdAt: string
  estimatedDelivery: string
  itemsCount: number
}

// ============== MOCK DATA ==============

const DELIVERIES: Delivery[] = [
  { id: '#LIV-2026-0451', destinataire: 'Awa KOUASSI', zone: 'Adjamé', address: 'Marché Adjamé, Lot 45', status: 'en_transit', livreur: 'Kouadio Jean', createdAt: '2026-08-27T08:00:00Z', estimatedDelivery: '2026-08-27T16:00:00Z', itemsCount: 3 },
  { id: '#LIV-2026-0452', destinataire: 'Ibrahim DIABY', zone: 'Cocody', address: 'Rue des Palmiers, Cocody Centre', status: 'en_preparation', livreur: 'Bamba Fatou', createdAt: '2026-08-27T10:00:00Z', estimatedDelivery: '2026-08-27T18:00:00Z', itemsCount: 1 },
  { id: '#LIV-2026-0453', destinataire: 'Paul BAMBA', zone: 'Yopougon', address: 'Carrefour Yopougon, Marché', status: 'livree', livreur: 'Diaby Ibrahim', createdAt: '2026-08-27T06:00:00Z', estimatedDelivery: '2026-08-27T14:00:00Z', itemsCount: 5 },
  { id: '#LIV-2026-0454', destinataire: 'Coopérative Akwaba', zone: 'Kong', address: 'Centre ville, Kong', status: 'retard', livreur: 'Soro Marie', createdAt: '2026-08-26T14:00:00Z', estimatedDelivery: '2026-08-27T12:00:00Z', itemsCount: 10 },
  { id: '#LIV-2026-0455', destinataire: 'Traoré Moussa', zone: 'Bouaké', address: 'Zone industrielle, Bouaké', status: 'en_transit', livreur: 'Jean KOUADIO', createdAt: '2026-08-27T07:00:00Z', estimatedDelivery: '2026-08-27T15:00:00Z', itemsCount: 2 },
  { id: '#LIV-2026-0456', destinataire: 'Fatoumata TRAORÉ', zone: 'Abobo', address: "Marché d'Abobo, Stand 12", status: 'livree', livreur: 'Affi COULIBALY', createdAt: '2026-08-27T05:00:00Z', estimatedDelivery: '2026-08-27T13:00:00Z', itemsCount: 1 },
  { id: '#LIV-2026-0457', destinataire: 'Kouadio Aminata', zone: 'Plateau', address: 'Avenue Franchet d\'Espérey', status: 'en_preparation', livreur: 'Kouadio Jean', createdAt: '2026-08-27T11:00:00Z', estimatedDelivery: '2026-08-27T19:00:00Z', itemsCount: 4 },
  { id: '#LIV-2026-0458', destinataire: 'Soro Marie', zone: 'Daloa', address: 'Gare routière, Daloa', status: 'retard', livreur: 'Bamba Fatou', createdAt: '2026-08-26T10:00:00Z', estimatedDelivery: '2026-08-27T10:00:00Z', itemsCount: 8 },
  { id: '#LIV-2026-0459', destinataire: 'Ouattara Yao', zone: 'San-Pédro', address: 'Port autonome, San-Pédro', status: 'echoue', livreur: 'Koné Aminata', createdAt: '2026-08-26T16:00:00Z', estimatedDelivery: '2026-08-27T08:00:00Z', itemsCount: 2 },
  { id: '#LIV-2026-0460', destinataire: 'Diallo Mariam', zone: 'Korhogo', address: 'Marché central, Korhogo', status: 'en_transit', livreur: 'Diaby Ibrahim', createdAt: '2026-08-27T09:30:00Z', estimatedDelivery: '2026-08-27T17:30:00Z', itemsCount: 6 },
  { id: '#LIV-2026-0461', destinataire: 'Camara Moussa', zone: 'Yamoussoukro', address: 'Zone commerciale, Yamoussoukro', status: 'livree', livreur: 'Soro Marie', createdAt: '2026-08-27T04:00:00Z', estimatedDelivery: '2026-08-27T12:00:00Z', itemsCount: 3 },
  { id: '#LIV-2026-0462', destinataire: 'Bakayoko Awa', zone: 'Man', address: 'Centre ville, Man', status: 'en_preparation', livreur: 'Jean KOUADIO', createdAt: '2026-08-27T12:00:00Z', estimatedDelivery: '2026-08-27T20:00:00Z', itemsCount: 7 },
]

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; color: string; icon: React.ReactNode }> = {
  en_preparation: { label: 'En préparation', color: 'bg-amber-100 text-amber-700', icon: <Package className="h-3 w-3" /> },
  en_transit: { label: 'En transit', color: 'bg-sky-100 text-sky-700', icon: <Truck className="h-3 w-3" /> },
  livree: { label: 'Livrée', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="h-3 w-3" /> },
  retard: { label: 'Retard', color: 'bg-red-100 text-red-700', icon: <AlertTriangle className="h-3 w-3" /> },
  echoue: { label: 'Échoué', color: 'bg-gray-200 text-gray-700', icon: <XCircle className="h-3 w-3" /> },
}

// ============== MAIN COMPONENT ==============

export function BoLivraisonScreen() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('tous')

  const filtered = useMemo(() => {
    return DELIVERIES.filter((d) => {
      const matchSearch = !searchQuery ||
        d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.destinataire.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.livreur.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.zone.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = statusFilter === 'tous' || d.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [searchQuery, statusFilter])

  const stats = useMemo(() => {
    const enCours = DELIVERIES.filter(d => d.status === 'en_transit' || d.status === 'en_preparation').length
    const livreesToday = DELIVERIES.filter(d => d.status === 'livree' && d.createdAt.startsWith('2026-08-27')).length
    const retards = DELIVERIES.filter(d => d.status === 'retard').length
    const taux = Math.round((DELIVERIES.filter(d => d.status === 'livree').length / DELIVERIES.length) * 100)
    return { enCours, livreesToday, retards, taux }
  }, [])

  const formatTime = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: BO_COLOR_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
          <span className="inline-flex items-center gap-2"><Truck className="h-6 w-6" />LIVRAISON</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Suivi et gestion des livraisons en temps réel
        </p>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="h-4 w-4 text-sky-500" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">En cours</p>
            </div>
            <p className="text-2xl font-bold text-sky-600">{stats.enCours}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">Livrées aujourd&apos;hui</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats.livreesToday}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">Retards</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.retards}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-gray-500" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">Taux livraison</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>{stats.taux}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher ID, destinataire, livreur..."
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
            <SelectItem value="en_preparation">En préparation</SelectItem>
            <SelectItem value="en_transit">En transit</SelectItem>
            <SelectItem value="livree">Livrée</SelectItem>
            <SelectItem value="retard">Retard</SelectItem>
            <SelectItem value="echoue">Échoué</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main Grid: Delivery list + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Delivery Cards */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Aucune livraison trouvée</p>
            </div>
          )}
          {filtered.map((delivery) => {
            const sc = STATUS_CONFIG[delivery.status]
            return (
              <Card key={delivery.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Top row: ID + Status + Items */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold" style={{ color: BO_COLOR }}>
                          {delivery.id}
                        </span>
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${sc.color}`}>
                          {sc.icon}<span className="ml-1">{sc.label}</span>
                        </Badge>
                        <span className="text-xs text-gray-400">{delivery.itemsCount} article(s)</span>
                      </div>
                      {/* Destinataire */}
                      <p className="font-semibold text-sm" style={{ color: BO_COLOR }}>{delivery.destinataire}</p>
                      {/* Details row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{delivery.zone} — {delivery.address}</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{delivery.livreur}</span>
                      </div>
                      {/* Date row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Créé le {formatTime(delivery.createdAt)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Estimé : {formatTime(delivery.estimatedDelivery)}</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs h-8 shrink-0">
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
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
              <MapPin className="h-4 w-4 inline mr-1.5" />
              Carte de suivi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="h-[520px] rounded-lg bg-gray-100 flex flex-col items-center justify-center text-gray-400 relative"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#D1D5DB transparent' }}
            >
              <MapPin className="h-14 w-14 mb-3 opacity-30" />
              <p className="text-sm font-medium">Carte de suivi</p>
              <p className="text-xs mt-1">Intégration Google Maps / Mapbox</p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center px-4">
                {DELIVERIES.filter(d => d.status === 'en_transit').map(d => (
                  <div key={d.id} className="flex items-center gap-1.5 text-[10px] bg-white px-2.5 py-1.5 rounded-md shadow-sm border border-gray-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                    <span className="font-medium text-gray-600">{d.zone}</span>
                  </div>
                ))}
                {DELIVERIES.filter(d => d.status === 'retard').map(d => (
                  <div key={d.id} className="flex items-center gap-1.5 text-[10px] bg-white px-2.5 py-1.5 rounded-md shadow-sm border border-gray-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="font-medium text-gray-600">{d.zone}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}