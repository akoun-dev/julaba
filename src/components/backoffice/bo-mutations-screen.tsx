'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  Plus,
  ArrowRightLeft,
  Check,
  X,
  MapPin,
  User,
  Calendar,
  Clock,
  MessageSquare,
  ArrowRight,
  FileText,
  UserCheck,
  UserX,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type MutationStatus = 'en_attente' | 'approuvee' | 'refusee'
type ActorType = 'marchand' | 'producteur' | 'cooperatif'

interface Mutation {
  id: string
  actorName: string
  actorId: string
  actorType: ActorType
  sourceZone: string
  destZone: string
  requestedBy: string
  reason: string
  status: MutationStatus
  createdAt: string
  processedAt?: string
  processedBy?: string
  rejectReason?: string
}

// ============== CONSTANTS ==============

const ZONES = ['Adjamé', 'Cocody', 'Plateau', 'Yopougon', 'Abobo', 'Bouaké', 'Kong', 'Yamoussoukro', 'Daloa', 'San-Pédro', 'Korhogo', 'Man']

const STATUS_CONFIG: Record<MutationStatus, { label: string; color: string; dotColor: string }> = {
  en_attente: { label: 'En attente', color: 'bg-amber-100 text-amber-700', dotColor: 'bg-amber-500' },
  approuvee: { label: 'Approuvée', color: 'bg-emerald-100 text-emerald-700', dotColor: 'bg-emerald-500' },
  refusee: { label: 'Refusée', color: 'bg-red-100 text-red-700', dotColor: 'bg-red-500' },
}

const ACTOR_TYPE_COLORS: Record<ActorType, string> = {
  marchand: 'bg-orange-100 text-orange-700',
  producteur: 'bg-green-100 text-green-700',
  cooperatif: 'bg-purple-100 text-purple-700',
}

const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  marchand: 'Marchand(e)',
  producteur: 'Producteur(rice)',
  cooperatif: 'Coopérative',
}

// ============== MAIN COMPONENT ==============

export function BoMutationsScreen() {
  const { searchQuery, setSearchQuery, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [mutations, setMutations] = useState<Mutation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [newMut, setNewMut] = useState({
    actorName: '', actorType: 'marchand' as ActorType, sourceZone: '', destZone: '', reason: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/mutations')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setMutations(data.mutations)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return mutations.filter((m) => {
      const matchSearch = !searchQuery ||
        m.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.actorId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.sourceZone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.destZone.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = statusFilter === 'tous' || m.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [mutations, searchQuery, statusFilter])

  const stats = useMemo(() => ({
    total: mutations.length,
    enAttente: mutations.filter((m) => m.status === 'en_attente').length,
    approuvees: mutations.filter((m) => m.status === 'approuvee').length,
    refusees: mutations.filter((m) => m.status === 'refusee').length,
  }), [mutations])

  const handleApprove = (id: string) => {
    setMutations((prev) => prev.map((m) =>
      m.id === id ? { ...m, status: 'approuvee' as const, processedAt: new Date().toISOString(), processedBy: 'Aminata KONÉ' } : m
    ))
  }

  const handleReject = () => {
    if (!rejectDialogId) return
    setMutations((prev) => prev.map((m) =>
      m.id === rejectDialogId ? {
        ...m, status: 'refusee' as const, processedAt: new Date().toISOString(),
        processedBy: 'Aminata KONÉ', rejectReason: rejectReason || 'Aucune raison fournie',
      } : m
    ))
    setRejectDialogId(null)
    setRejectReason('')
  }

  const handleAddMutation = () => {
    if (!newMut.actorName || !newMut.sourceZone || !newMut.destZone) return
    const typePrefix = newMut.actorType === 'marchand' ? 'M' : newMut.actorType === 'producteur' ? 'P' : 'C'
    const newMutation: Mutation = {
      id: `mut-${Date.now()}`,
      actorName: newMut.actorName,
      actorId: `${typePrefix}-${String(950 + mutations.length).padStart(4, '0')}`,
      actorType: newMut.actorType,
      sourceZone: newMut.sourceZone,
      destZone: newMut.destZone,
      requestedBy: 'Aminata KONÉ',
      reason: newMut.reason || 'Mutation demandée',
      status: 'en_attente',
      createdAt: new Date().toISOString(),
    }
    setMutations((prev) => [newMutation, ...prev])
    setNewMut({ actorName: '', actorType: 'marchand', sourceZone: '', destZone: '', reason: '' })
    setShowAddDialog(false)
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'Moins d\'1h'
    if (hours < 24) return `Il y a ${hours}h`
    return `Il y a ${Math.floor(hours / 24)}j`
  }

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            <span className="inline-flex items-center gap-2"><ArrowRightLeft className="h-6 w-6" />MUTATIONS</span>
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Demandes de transfert d&apos;acteurs entre zones
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className={`whitespace-nowrap ${isDark ? '' : 'shadow-sm'}`}>
          <Plus className="h-4 w-4 mr-2" />
          Demande de mutation
        </Button>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Total demandes</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{stats.total}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <FileText className={`h-4 w-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>En attente</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold mt-1 text-amber-600">{stats.enAttente}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Approuvées</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.approuvees}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                <UserCheck className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Refusées</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold mt-1 text-red-600">{stats.refusees}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                <UserX className="h-4 w-4 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <Card className={isDark ? 'bg-slate-800 border-slate-700' : ''}>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              <Input
                placeholder="Rechercher acteur, zone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className={`h-6 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous statuts</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
                <SelectItem value="approuvee">Approuvée</SelectItem>
                <SelectItem value="refusee">Refusée</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && !loading && (
        <div className={`flex flex-col items-center justify-center py-16 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
          <AlertCircle className="h-14 w-14 mb-4 opacity-50" />
          <p className="text-sm font-medium">Erreur de chargement</p>
          <p className="text-xs mt-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Réessayer
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-28" /></div>
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-full max-w-md" />
                    <div className="flex items-center gap-2"><Skeleton className="h-8 w-28" /><Skeleton className="h-4 w-4" /><Skeleton className="h-8 w-28" /></div>
                    <div className="flex gap-4"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-32" /></div>
                  </div>
                  <div className="flex gap-2 shrink-0"><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-20" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Mutations List */}
      {!loading && !error && (
        <div className="space-y-3">
          {filtered.map((mut) => {
            const sc = STATUS_CONFIG[mut.status] ?? { label: mut.status, color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600', dotColor: 'bg-gray-400' }
            const isPending = mut.status === 'en_attente'
            return (
              <Card key={mut.id} className={`border-0 ${isDark ? '' : 'shadow-sm hover:shadow-md'} transition-all duration-200 ${isDark ? 'bg-slate-800' : ''} ${isPending ? (isDark ? 'ring-1 ring-amber-500/30' : 'ring-1 ring-amber-200') : ''}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 font-medium ${sc.color}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${sc.dotColor}`} />
                          {sc.label}
                        </Badge>
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${ACTOR_TYPE_COLORS[mut.actorType]}`}>
                          {ACTOR_TYPE_LABELS[mut.actorType]}
                        </Badge>
                        <span className={`text-[11px] font-mono ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>#{mut.id} · {mut.actorId}</span>
                      </div>

                      {/* Actor name + reason */}
                      <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{mut.actorName}</p>
                      <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{mut.reason}</p>

                      {/* Zone transfer visual */}
                      <div className="flex items-center gap-2 text-sm">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                          <MapPin className={`h-3.5 w-3.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                          {mut.sourceZone}
                        </div>
                        <div className="flex items-center">
                          <ArrowRight className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                        </div>
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 border ${isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                          <MapPin className="h-3.5 w-3.5" />
                          {mut.destZone}
                        </div>
                      </div>

                      {/* Meta info */}
                      <div className={`flex flex-wrap gap-x-5 gap-y-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        <span className="flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          Demandé par <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>{mut.requestedBy}</strong>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {formatDate(mut.createdAt)}
                        </span>
                        {mut.processedBy && (
                          <span className="flex items-center gap-1.5">
                            <Check className="h-3 w-3" />
                            Traité par <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>{mut.processedBy}</strong>
                          </span>
                        )}
                        {!mut.processedBy && (
                          <span className="flex items-center gap-1.5 text-amber-600">
                            <Clock className="h-3 w-3" />
                            {timeAgo(mut.createdAt)}
                          </span>
                        )}
                      </div>

                      {/* Rejection reason */}
                      {mut.status === 'refusee' && mut.rejectReason && (
                        <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                          <p className="text-[11px] font-medium text-red-700 mb-0.5">Motif de refus</p>
                          <p className="text-xs text-red-600">{mut.rejectReason}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {isPending && (
                      <div className="flex flex-col gap-2 shrink-0 lg:ml-4">
                        <Button
                          size="sm"
                          className={`text-xs h-8 bg-emerald-600 hover:bg-emerald-700 ${isDark ? '' : 'shadow-sm'}`}
                          onClick={() => handleApprove(mut.id)}
                        >
                          <Check className="h-3 w-3 mr-1.5" />
                          Approuver
                        </Button>
                        <Button
                          size="sm" variant="destructive" className={`text-xs h-8 ${isDark ? '' : 'shadow-sm'}`}
                          onClick={() => setRejectDialogId(mut.id)}
                        >
                          <X className="h-3 w-3 mr-1.5" />
                          Refuser
                        </Button>
                      </div>
                    )}

                    {mut.status === 'approuvee' && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600 shrink-0">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                          <UserCheck className="h-5 w-5" />
                        </div>
                      </div>
                    )}

                    {mut.status === 'refusee' && (
                      <div className="flex items-center gap-2 text-xs text-red-600 shrink-0">
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                          <UserX className="h-5 w-5" />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {filtered.length === 0 && (
            <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              <ArrowRightLeft className="h-14 w-14 mx-auto mb-4 opacity-30" />
              <p className="text-sm font-medium">Aucune mutation trouvée</p>
              <p className="text-xs mt-1">Modifiez vos filtres ou créez une nouvelle demande</p>
            </div>
          )}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nouvelle demande de mutation
            </DialogTitle>
            <DialogDescription>Initiez un transfert de zone pour un acteur.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Nom de l&apos;acteur *</Label>
              <Input
                placeholder="Ex: Awa KOUASSI"
                value={newMut.actorName}
                onChange={(e) => setNewMut({ ...newMut, actorName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Type d&apos;acteur</Label>
              <Select value={newMut.actorType} onValueChange={(v) => setNewMut({ ...newMut, actorType: v as ActorType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marchand">Marchand(e)</SelectItem>
                  <SelectItem value="producteur">Producteur(rice)</SelectItem>
                  <SelectItem value="cooperatif">Coopérative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Zone source *</Label>
                <Select value={newMut.sourceZone} onValueChange={(v) => setNewMut({ ...newMut, sourceZone: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Zone destination *</Label>
                <Select value={newMut.destZone} onValueChange={(v) => setNewMut({ ...newMut, destZone: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Motif</Label>
              <Textarea
                placeholder="Motif de la mutation"
                rows={3}
                value={newMut.reason}
                onChange={(e) => setNewMut({ ...newMut, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Annuler</Button>
            <Button onClick={handleAddMutation} disabled={!newMut.actorName || !newMut.sourceZone || !newMut.destZone}>
              <Plus className="h-4 w-4 mr-2" />
              Soumettre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={!!rejectDialogId} onOpenChange={() => { setRejectDialogId(null); setRejectReason('') }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-500" />
              Refuser la mutation ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              La demande de mutation sera refusée. Veuillez indiquer le motif du refus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-xs font-medium">Motif de refus</Label>
            <Textarea
              placeholder="Expliquez pourquoi la mutation est refusée..."
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleReject}
            >
              <X className="h-4 w-4 mr-2" />
              Confirmer le refus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
