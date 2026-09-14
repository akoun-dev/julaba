'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  Plus,
  Building2,
  Phone,
  Mail,
  Users,
  RefreshCw,
  Globe,
  MoreVertical,
  ExternalLink,
  Clock,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Loader2,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

type InstitutionType = 'gouvernement' | 'financier' | 'sante' | 'agriculture' | 'central'
type InstitutionStatus = 'actif' | 'inactif' | 'en_attente'

interface Institution {
  id: string
  name: string
  initials: string
  color: string
  type: InstitutionType
  contact: string
  email: string
  website: string
  linkedActors: number
  status: InstitutionStatus
  lastSync: string
}

// ============== CONSTANTS ==============

const TYPE_LABELS: Record<InstitutionType, string> = {
  gouvernement: 'Gouvernement',
  financier: 'Institution Financière',
  sante: 'Santé',
  agriculture: 'Agriculture',
  central: 'Banque Centrale',
}

const TYPE_COLORS: Record<InstitutionType, string> = {
  gouvernement: 'bg-amber-100 text-amber-800',
  financier: 'bg-emerald-100 text-emerald-800',
  sante: 'bg-rose-100 text-rose-800',
  agriculture: 'bg-green-100 text-green-800',
  central: 'bg-slate-100 text-slate-800',
}

const STATUS_COLORS: Record<InstitutionStatus, string> = {
  actif: 'bg-emerald-100 text-emerald-700',
  inactif: 'bg-gray-200 text-gray-600',
  en_attente: 'bg-amber-100 text-amber-700',
}

const STATUS_LABELS: Record<InstitutionStatus, string> = {
  actif: 'Actif',
  inactif: 'Inactif',
  en_attente: 'En attente',
}

// ============== MAIN COMPONENT ==============

export function BoInstitutionsScreen() {
  const { searchQuery, setSearchQuery, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('tous')
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [sortBy, setSortBy] = useState<'name' | 'actors' | 'sync'>('name')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [newInst, setNewInst] = useState({
    name: '', type: 'gouvernement' as InstitutionType, contact: '', email: '', website: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/institutions')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const raw: Record<string, unknown>[] = Array.isArray(data) ? data : data.institutions ?? []
      const mapped: Institution[] = raw.map((r) => ({
        id: r.id as string,
        name: (r.name as string) || '',
        initials: (r.initials as string) || '',
        color: (r.color as string) || '#64748b',
        type: (r.type as InstitutionType) || 'gouvernement',
        contact: (r.contact_phone ?? r.contact) as string || '',
        email: (r.contact_email ?? r.email) as string || '',
        website: (r.website as string) || '',
        linkedActors: (r.linked_actors ?? r.linkedActors ?? 0) as number,
        status: (r.status as InstitutionStatus) || 'en_attente',
        lastSync: ((r.last_sync ?? r.lastSync) as string) || new Date().toISOString(),
      }))
      setInstitutions(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = institutions.filter((inst) => {
      const matchSearch = !searchQuery ||
        inst.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inst.initials.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inst.email.toLowerCase().includes(searchQuery.toLowerCase())
      const matchType = typeFilter === 'tous' || inst.type === typeFilter
      const matchStatus = statusFilter === 'tous' || inst.status === statusFilter
      return matchSearch && matchType && matchStatus
    })
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'fr')
      if (sortBy === 'actors') return b.linkedActors - a.linkedActors
      return new Date(b.lastSync).getTime() - new Date(a.lastSync).getTime()
    })
    return result
  }, [institutions, searchQuery, typeFilter, statusFilter, sortBy])

  const stats = useMemo(() => ({
    total: institutions.length,
    actives: institutions.filter((i) => i.status === 'actif').length,
    totalActors: institutions.reduce((sum, i) => sum + i.linkedActors, 0),
    enAttente: institutions.filter((i) => i.status === 'en_attente').length,
  }), [institutions])

  const [adding, setAdding] = useState(false)

  const handleAddInstitution = async () => {
    if (!newInst.name) return
    const initials = newInst.name.split(' ').filter((w) => w.length > 2).map((w) => w[0]).join('').toUpperCase().slice(0, 6)
    const colors = ['#D97706', '#059669', '#DC2626', '#9333EA', '#16A34A', '#475569', '#EA580C', '#0891B2']
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/institutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newInst.name,
          type: newInst.type,
          contactPhone: newInst.contact || undefined,
          contactEmail: newInst.email || undefined,
          website: newInst.website || undefined,
          initials: initials || 'NEW',
          color: colors[Math.floor(Math.random() * colors.length)],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.erreur || `Erreur ${res.status}`)
      }
      await fetchData()
      setNewInst({ name: '', type: 'gouvernement', contact: '', email: '', website: '' })
      setShowAddDialog(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de création')
    } finally {
      setAdding(false)
    }
  }

  const handleToggleStatus = async (id: string) => {
    const inst = institutions.find((i) => i.id === id)
    if (!inst) return
    const newStatus: InstitutionStatus = inst.status === 'actif' ? 'inactif' : 'actif'
    setInstitutions((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)))
    try {
      const res = await fetch('/api/backoffice/institutions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
    } catch (err) {
      setInstitutions((prev) => prev.map((i) => (i.id === id ? inst : i)))
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour')
    }
  }

  const handleSync = async (id: string) => {
    setSyncingId(id)
    try {
      const lastSync = new Date().toISOString()
      const res = await fetch('/api/backoffice/institutions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, lastSync }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      setInstitutions((prev) => prev.map((inst) => (inst.id === id ? { ...inst, lastSync } : inst)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de synchronisation')
    } finally {
      setSyncingId(null)
    }
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 5) return 'À l\'instant'
    if (diffMins < 60) return `Il y a ${diffMins} min`
    if (diffHours < 24) return `Il y a ${diffHours}h`
    if (diffDays < 7) return `Il y a ${diffDays}j`
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <BoPageHeader
        title="Institutions"
        description="Gestion des institutions partenaires et synchronisation des données"
        actions={
          <Button onClick={() => setShowAddDialog(true)} className={`whitespace-nowrap ${isDark ? '' : 'shadow-sm'}`}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter institution
          </Button>
        }
      />

      <Separator />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Total institutions</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{stats.total}</p>
                )}
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Building2 className={`h-5 w-5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Actives</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.actives}</p>
                )}
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Acteurs liés</p>
                {loading ? <Skeleton className="h-8 w-16 mt-1" /> : (
                  <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{stats.totalActors.toLocaleString('fr-FR')}</p>
                )}
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Users className={`h-5 w-5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>En attente</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-2xl font-bold mt-1 text-amber-600">{stats.enAttente}</p>
                )}
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                <Clock className="h-5 w-5 text-amber-500" />
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
                placeholder="Rechercher une institution..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className={`h-6 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les types</SelectItem>
                <SelectItem value="gouvernement">Gouvernement</SelectItem>
                <SelectItem value="financier">Institution Financière</SelectItem>
                <SelectItem value="sante">Santé</SelectItem>
                <SelectItem value="agriculture">Agriculture</SelectItem>
                <SelectItem value="central">Banque Centrale</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous</SelectItem>
                <SelectItem value="actif">Actif</SelectItem>
                <SelectItem value="inactif">Inactif</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline" size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => setSortBy(sortBy === 'name' ? 'actors' : sortBy === 'actors' ? 'sync' : 'name')}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortBy === 'name' ? 'Nom' : sortBy === 'actors' ? 'Acteurs' : 'Sync'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

      {/* Loading State */}
      {loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="h-px w-full" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((inst) => (
            <Card key={inst.id} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm hover:shadow-md'} transition-shadow duration-200 group`}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${isDark ? 'shadow-none' : 'shadow-sm'} transition-transform group-hover:scale-105"
                    style={{ backgroundColor: inst.color }}
                  >
                    {inst.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className={`text-sm font-semibold leading-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {inst.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="secondary" className={`text-[10px] px-2 py-0 font-medium ${TYPE_COLORS[inst.type]}`}>
                        {TYPE_LABELS[inst.type]}
                      </Badge>
                      <Badge variant="secondary" className={`text-[10px] px-2 py-0 font-medium ${STATUS_COLORS[inst.status]}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${inst.status === 'actif' ? 'bg-emerald-500' : inst.status === 'en_attente' ? 'bg-amber-500' : 'bg-gray-400'}`} />
                        {STATUS_LABELS[inst.status]}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleToggleStatus(inst.id)}>
                        {inst.status === 'actif' ? <XCircle className="h-4 w-4 mr-2 text-red-500" /> : <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" />}
                        {inst.status === 'actif' ? 'Désactiver' : 'Activer'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSync(inst.id)}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${syncingId === inst.id ? 'animate-spin' : ''}`} />
                        Synchroniser
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Voir le site
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">{inst.contact}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{inst.email}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="truncate">{inst.website}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    <Users className="h-3 w-3 shrink-0" />
                    <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{inst.linkedActors.toLocaleString('fr-FR')}</span>
                    <span>acteurs</span>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                    <RefreshCw className={`h-3 w-3 ${syncingId === inst.id ? 'animate-spin text-emerald-500' : ''}`} />
                    <span>Sync : {formatDate(inst.lastSync)}</span>
                  </div>
                  <Button
                    variant="ghost" size="sm" className={`h-7 text-xs ${isDark ? 'text-slate-400 hover:text-emerald-400' : 'text-gray-500 hover:text-emerald-600'}`}
                    onClick={() => handleSync(inst.id)}
                    disabled={syncingId === inst.id}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${syncingId === inst.id ? 'animate-spin' : ''}`} />
                    Sync
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
          <Building2 className="h-14 w-14 mx-auto mb-4 opacity-30" />
          <p className="text-sm font-medium">Aucune institution trouvée</p>
          <p className="text-xs mt-1">Essayez de modifier vos filtres</p>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Ajouter une institution
            </DialogTitle>
            <DialogDescription>Renseignez les informations de la nouvelle institution partenaire.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Nom de l&apos;institution *</Label>
              <Input
                placeholder="Ex: Direction Générale du Trésor"
                value={newInst.name}
                onChange={(e) => setNewInst({ ...newInst, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Type *</Label>
              <Select value={newInst.type} onValueChange={(v) => setNewInst({ ...newInst, type: v as InstitutionType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gouvernement">Gouvernement</SelectItem>
                  <SelectItem value="financier">Institution Financière</SelectItem>
                  <SelectItem value="sante">Santé</SelectItem>
                  <SelectItem value="agriculture">Agriculture</SelectItem>
                  <SelectItem value="central">Banque Centrale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Téléphone</Label>
                <Input
                  placeholder="+225 XX XX XX XX"
                  value={newInst.contact}
                  onChange={(e) => setNewInst({ ...newInst, contact: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Email</Label>
                <Input
                  type="email"
                  placeholder="contact@inst.ci"
                  value={newInst.email}
                  onChange={(e) => setNewInst({ ...newInst, email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Site web</Label>
              <Input
                placeholder="www.institution.ci"
                value={newInst.website}
                onChange={(e) => setNewInst({ ...newInst, website: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Annuler</Button>
            <Button onClick={handleAddInstitution} disabled={!newInst.name || adding}>
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
