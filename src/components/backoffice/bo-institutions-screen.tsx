'use client'

import { useState, useMemo } from 'react'
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
import { useBackofficeStore, BO_COLOR, BO_COLOR_BG } from '@/lib/stores/backoffice-store'

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

// ============== MOCK DATA ==============

const INITIAL_INSTITUTIONS: Institution[] = [
  {
    id: 'inst-1', name: 'Direction Générale des Impôts', initials: 'DGE', color: '#D97706',
    type: 'gouvernement', contact: '+225 20 30 40 50', email: 'contact@dge.ci',
    website: 'dge.ci', linkedActors: 1245, status: 'actif', lastSync: '2026-08-27T14:00:00Z',
  },
  {
    id: 'inst-2', name: 'Agence Nationale de la Sécurité URSSAF-T', initials: 'ANSUT', color: '#059669',
    type: 'gouvernement', contact: '+225 20 31 42 60', email: 'info@ansut.ci',
    website: 'ansut.ci', linkedActors: 890, status: 'actif', lastSync: '2026-08-27T13:30:00Z',
  },
  {
    id: 'inst-3', name: 'Caisse Nationale de Prévoyance Sociale', initials: 'CNPS', color: '#DC2626',
    type: 'financier', contact: '+225 20 32 50 70', email: 'contact@cnps.ci',
    website: 'cnps.ci', linkedActors: 2340, status: 'actif', lastSync: '2026-08-27T12:00:00Z',
  },
  {
    id: 'inst-4', name: "Caisse Nationale d'Assurance Maladie", initials: 'CNAM', color: '#9333EA',
    type: 'sante', contact: '+225 20 33 60 80', email: 'info@cnam.ci',
    website: 'cnam.ci', linkedActors: 1560, status: 'actif', lastSync: '2026-08-27T11:45:00Z',
  },
  {
    id: 'inst-5', name: "Ministère de l'Agriculture", initials: 'MINAGRI', color: '#16A34A',
    type: 'agriculture', contact: '+225 20 34 70 90', email: 'contact@minagri.ci',
    website: 'minagri.ci', linkedActors: 678, status: 'actif', lastSync: '2026-08-27T10:00:00Z',
  },
  {
    id: 'inst-6', name: "Banque Centrale des États de l'Afrique de l'Ouest", initials: 'BCEAO', color: '#475569',
    type: 'central', contact: '+225 20 35 80 10', email: 'info@bceao.int',
    website: 'bceao.int', linkedActors: 320, status: 'en_attente', lastSync: '2026-08-25T08:00:00Z',
  },
]

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

const TYPE_ICON_COLORS: Record<InstitutionType, string> = {
  gouvernement: 'bg-amber-500',
  financier: 'bg-emerald-500',
  sante: 'bg-rose-500',
  agriculture: 'bg-green-600',
  central: 'bg-slate-600',
}

// ============== MAIN COMPONENT ==============

export function BoInstitutionsScreen() {
  const { searchQuery, setSearchQuery } = useBackofficeStore()

  const [institutions, setInstitutions] = useState<Institution[]>(INITIAL_INSTITUTIONS)
  const [typeFilter, setTypeFilter] = useState<string>('tous')
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [sortBy, setSortBy] = useState<'name' | 'actors' | 'sync'>('name')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [newInst, setNewInst] = useState({
    name: '', type: 'gouvernement' as InstitutionType, contact: '', email: '', website: '',
  })

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

  const handleAddInstitution = () => {
    if (!newInst.name) return
    const initials = newInst.name.split(' ').filter((w) => w.length > 2).map((w) => w[0]).join('').toUpperCase().slice(0, 6)
    const colors = ['#D97706', '#059669', '#DC2626', '#9333EA', '#16A34A', '#475569', '#EA580C', '#0891B2']
    const newInstitution: Institution = {
      id: `inst-${Date.now()}`,
      name: newInst.name,
      initials: initials || 'NEW',
      color: colors[Math.floor(Math.random() * colors.length)],
      type: newInst.type,
      contact: newInst.contact || 'Non renseigné',
      email: newInst.email || '-',
      website: newInst.website || '-',
      linkedActors: 0,
      status: 'en_attente',
      lastSync: new Date().toISOString(),
    }
    setInstitutions((prev) => [newInstitution, ...prev])
    setNewInst({ name: '', type: 'gouvernement', contact: '', email: '', website: '' })
    setShowAddDialog(false)
  }

  const handleToggleStatus = (id: string) => {
    setInstitutions((prev) => prev.map((inst) => {
      if (inst.id !== id) return inst
      const newStatus: InstitutionStatus = inst.status === 'actif' ? 'inactif' : 'actif'
      return { ...inst, status: newStatus }
    }))
  }

  const handleSync = (id: string) => {
    setSyncingId(id)
    setTimeout(() => {
      setInstitutions((prev) => prev.map((inst) =>
        inst.id === id ? { ...inst, lastSync: new Date().toISOString() } : inst
      ))
      setSyncingId(null)
    }, 1500)
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
    <div className="p-6 space-y-6" style={{ backgroundColor: BO_COLOR_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: BO_COLOR }}>
            🏛️ INSTITUTIONS
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestion des institutions partenaires et synchronisation des données
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="whitespace-nowrap shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          Ajouter institution
        </Button>
      </div>

      <Separator />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Total institutions</p>
                <p className="text-2xl font-bold mt-1" style={{ color: BO_COLOR }}>{stats.total}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-gray-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Actives</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.actives}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Acteurs liés</p>
                <p className="text-2xl font-bold mt-1" style={{ color: BO_COLOR }}>{stats.totalActors.toLocaleString('fr-FR')}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-gray-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">En attente</p>
                <p className="text-2xl font-bold mt-1 text-amber-600">{stats.enAttente}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher une institution..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-48">
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
            <SelectTrigger className="w-full sm:w-40">
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
            className="hidden lg:flex h-9 gap-1.5 text-xs"
            onClick={() => setSortBy(sortBy === 'name' ? 'actors' : sortBy === 'actors' ? 'sync' : 'name')}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortBy === 'name' ? 'Nom' : sortBy === 'actors' ? 'Acteurs' : 'Sync'}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((inst) => (
          <Card key={inst.id} className="border-0 shadow-sm hover:shadow-md transition-all duration-200 group">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm transition-transform group-hover:scale-105"
                  style={{ backgroundColor: inst.color }}
                >
                  {inst.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm font-semibold leading-tight truncate" style={{ color: BO_COLOR }}>
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
                      <MoreVertical className="h-4 w-4 text-gray-400" />
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
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{inst.contact}</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{inst.email}</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="truncate">{inst.website}</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Users className="h-3 w-3 shrink-0" />
                  <span className="font-medium" style={{ color: BO_COLOR }}>{inst.linkedActors.toLocaleString('fr-FR')}</span>
                  <span>acteurs</span>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <RefreshCw className={`h-3 w-3 ${syncingId === inst.id ? 'animate-spin text-emerald-500' : ''}`} />
                  <span>Sync : {formatDate(inst.lastSync)}</span>
                </div>
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs text-gray-500 hover:text-emerald-600"
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

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
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
            <Button onClick={handleAddInstitution} disabled={!newInst.name}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
