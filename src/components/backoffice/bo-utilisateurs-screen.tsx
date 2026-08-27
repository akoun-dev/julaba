'use client'

import { useState, useMemo } from 'react'
import {
  Search,
  Plus,
  Pencil,
  Check,
  X as XIcon,
  Shield,
  ChevronDown,
  Users,
  MapPin,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  useBackofficeStore,
  ROLE_LABELS,
  type BoUser,
  type BoRole,
  hasModuleAccess,
  BO_COLOR,
} from '@/lib/stores/backoffice-store'

// ============== CONSTANTS ==============

const ZONES_LIST = [
  'Adjamé', 'Cocody', 'Plateau', 'Yopougon', 'Abobo',
  'Bouaké', 'Kong', 'Yamoussoukro', 'Daloa', 'San-Pédro',
  'Korhogo', 'Man', 'National',
]

const ALL_ROLES: BoRole[] = [
  'super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain',
]

// 10 main modules for permission matrix
const MATRIX_MODULES = [
  'dashboard', 'acteurs', 'enrolement', 'zones', 'missions',
  'supervision', 'utilisateurs', 'rapports', 'audit', 'monitoring-ia',
] as const

const MATRIX_MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  acteurs: 'Acteurs',
  enrolement: 'Enrôlement',
  zones: 'Zones',
  missions: 'Missions',
  supervision: 'Supervision',
  utilisateurs: 'Utilisateurs',
  rapports: 'Rapports',
  audit: 'Audit',
  'monitoring-ia': 'Monitoring IA',
}

const ROLE_BADGE_COLORS: Record<BoRole, string> = {
  super_admin: 'bg-amber-100 text-amber-900 border-amber-200',
  admin_general: 'bg-rose-100 text-rose-900 border-rose-200',
  admin_national: 'bg-violet-100 text-violet-900 border-violet-200',
  gestionnaire_zone: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  operateur_terrain: 'bg-sky-100 text-sky-900 border-sky-200',
}

type RoleFilter = 'tous' | BoRole
type StatusFilter = 'tous' | 'actif' | 'inactif'

// ============== HELPER ==============

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ============== DIALOG FORM ==============

interface UserFormState {
  name: string
  email: string
  role: BoRole
  zone: string
  isActive: boolean
}

const emptyForm: UserFormState = {
  name: '',
  email: '',
  role: 'operateur_terrain',
  zone: '',
  isActive: true,
}

function UserFormDialog({
  open,
  onOpenChange,
  initialData,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialData?: BoUser | null
  onSubmit: (data: UserFormState) => void
}) {
  const [form, setForm] = useState<UserFormState>(emptyForm)
  const isEdit = !!initialData

  // Reset form when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setForm(
        initialData
          ? {
              name: initialData.name,
              email: initialData.email,
              role: initialData.role,
              zone: initialData.zone ?? '',
              isActive: initialData.isActive,
            }
          : { ...emptyForm }
      )
    }
    onOpenChange(v)
  }

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) return
    onSubmit(form)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle style={{ color: BO_COLOR }}>
            {isEdit ? 'Modifier l\'utilisateur' : 'Créer un utilisateur'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifiez les informations de l\'utilisateur backoffice.'
              : 'Remplissez les informations pour créer un nouvel utilisateur backoffice.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="user-name">Nom complet *</Label>
            <Input
              id="user-name"
              placeholder="Ex: Aminata KONÉ"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-email">Email *</Label>
            <Input
              id="user-email"
              type="email"
              placeholder="Ex: aminata@julaba.ci"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Rôle *</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v as BoRole })}
            >
              <SelectTrigger id="user-role" className="w-full">
                <SelectValue placeholder="Sélectionner un rôle" />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-zone">Zone (optionnel)</Label>
            <Select
              value={form.zone}
              onValueChange={(v) => setForm({ ...form, zone: v })}
            >
              <SelectTrigger id="user-zone" className="w-full">
                <SelectValue placeholder="Aucune zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Aucune zone</SelectItem>
                {ZONES_LIST.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            disabled={!form.name.trim() || !form.email.trim()}
            onClick={handleSubmit}
            style={{ backgroundColor: BO_COLOR, color: '#fff' }}
          >
            {isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============== PERMISSION MATRIX ==============

function PermissionMatrix() {
  return (
    <Card>
      <Collapsible>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" style={{ color: BO_COLOR }} />
              <CardTitle className="text-base font-semibold" style={{ color: BO_COLOR }}>
                Matrice des permissions par rôle
              </CardTitle>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                <span className="hidden sm:inline">Afficher</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead
                      className="sticky left-0 z-10 bg-gray-50 font-semibold text-xs"
                      style={{ color: BO_COLOR, minWidth: 140 }}
                    >
                      Module
                    </TableHead>
                    {ALL_ROLES.map((role) => (
                      <TableHead
                        key={role}
                        className="text-center font-semibold text-xs"
                        style={{ color: BO_COLOR, minWidth: 100 }}
                      >
                        <span className="inline-flex flex-col items-center gap-0.5">
                          <span>{ROLE_LABELS[role].split(' ')[0]}</span>
                          {ROLE_LABELS[role].split(' ').length > 1 && (
                            <span className="font-normal text-[10px] opacity-70">
                              {ROLE_LABELS[role].split(' ').slice(1).join(' ')}
                            </span>
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MATRIX_MODULES.map((mod, idx) => (
                    <TableRow
                      key={mod}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}
                    >
                      <TableCell
                        className="sticky left-0 z-10 font-medium text-sm"
                        style={{
                          color: BO_COLOR,
                          backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa',
                        }}
                      >
                        {MATRIX_MODULE_LABELS[mod]}
                      </TableCell>
                      {ALL_ROLES.map((role) => {
                        const access = hasModuleAccess(role, mod)
                        return (
                          <TableCell
                            key={role}
                            className="text-center p-2"
                          >
                            <span
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold ${
                                access
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-50 text-red-300'
                              }`}
                            >
                              {access ? '✓' : '✕'}
                            </span>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-xs font-bold text-emerald-700">
                  ✓
                </span>
                Accès autorisé
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-red-50 text-xs font-bold text-red-300">
                  ✕
                </span>
                Accès refusé
              </span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// ============== MAIN COMPONENT ==============

export function BoUtilisateursScreen() {
  const { users, createUser, updateUser } = useBackofficeStore()

  // Local state
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('tous')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('tous')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<BoUser | null>(null)

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase()
        if (
          !u.name.toLowerCase().includes(q) &&
          !u.email.toLowerCase().includes(q) &&
          !(u.zone ?? '').toLowerCase().includes(q)
        ) {
          return false
        }
      }
      if (roleFilter !== 'tous' && u.role !== roleFilter) return false
      if (statusFilter === 'actif' && !u.isActive) return false
      if (statusFilter === 'inactif' && u.isActive) return false
      return true
    })
  }, [users, search, roleFilter, statusFilter])

  // Stats
  const stats = useMemo(() => {
    const actifs = users.filter((u) => u.isActive).length
    const inactifs = users.length - actifs
    return { total: users.length, actifs, inactifs }
  }, [users])

  // Handlers
  const handleCreate = (data: UserFormState) => {
    createUser({
      name: data.name,
      email: data.email,
      role: data.role,
      zone: data.zone || undefined,
      isActive: data.isActive,
    })
  }

  const handleEdit = (data: UserFormState) => {
    if (!editingUser) return
    updateUser(editingUser.id, {
      name: data.name,
      email: data.email,
      role: data.role,
      zone: data.zone || undefined,
      isActive: data.isActive,
    })
    setEditingUser(null)
  }

  const handleToggleActive = (user: BoUser) => {
    updateUser(user.id, { isActive: !user.isActive })
  }

  return (
    <div className="space-y-6 p-6">
      {/* ===== HEADER ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: BO_COLOR }}
          >
            UTILISATEURS BACKOFFICE
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestion des comptes et permissions d\'accès au backoffice
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          style={{ backgroundColor: BO_COLOR, color: '#fff' }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Créer utilisateur
        </Button>
      </div>

      {/* ===== STATS CARDS ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
              <Users className="h-5 w-5" style={{ color: BO_COLOR }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>
                {stats.total}
              </p>
              <p className="text-xs text-gray-500">Total utilisateurs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-700">
                {stats.actifs}
              </p>
              <p className="text-xs text-gray-500">Actifs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50">
              <XIcon className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">
                {stats.inactifs}
              </p>
              <p className="text-xs text-gray-500">Inactifs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== SEARCH & FILTERS ===== */}
      <Card>
        <CardContent className="space-y-4 p-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher par nom, email ou zone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-gray-500 whitespace-nowrap">
                Rôle :
              </Label>
              <Select
                value={roleFilter}
                onValueChange={(v) => setRoleFilter(v as RoleFilter)}
              >
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les rôles</SelectItem>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-gray-500 whitespace-nowrap">
                Statut :
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous</SelectItem>
                  <SelectItem value="actif">Actif</SelectItem>
                  <SelectItem value="inactif">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto text-xs text-gray-400">
              {filteredUsers.length} utilisateur{filteredUsers.length !== 1 ? 's' : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== TABLE ===== */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow
                  className="hover:bg-transparent"
                  style={{ backgroundColor: '#fafafa' }}
                >
                  <TableHead
                    className="font-semibold text-xs"
                    style={{ color: BO_COLOR }}
                  >
                    Nom
                  </TableHead>
                  <TableHead
                    className="font-semibold text-xs"
                    style={{ color: BO_COLOR }}
                  >
                    Email
                  </TableHead>
                  <TableHead
                    className="font-semibold text-xs"
                    style={{ color: BO_COLOR }}
                  >
                    Rôle
                  </TableHead>
                  <TableHead
                    className="font-semibold text-xs"
                    style={{ color: BO_COLOR }}
                  >
                    Zone
                  </TableHead>
                  <TableHead
                    className="font-semibold text-xs"
                    style={{ color: BO_COLOR }}
                  >
                    Statut
                  </TableHead>
                  <TableHead
                    className="font-semibold text-xs"
                    style={{ color: BO_COLOR }}
                  >
                    Dernière connexion
                  </TableHead>
                  <TableHead
                    className="text-right font-semibold text-xs"
                    style={{ color: BO_COLOR }}
                  >
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-12 text-center text-sm text-gray-400"
                    >
                      Aucun utilisateur trouvé.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user, idx) => (
                    <TableRow
                      key={user.id}
                      className={
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                      }
                    >
                      {/* Name */}
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: BO_COLOR }}
                          >
                            {user.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <span style={{ color: BO_COLOR }}>{user.name}</span>
                        </div>
                      </TableCell>

                      {/* Email */}
                      <TableCell className="text-sm text-gray-600">
                        {user.email}
                      </TableCell>

                      {/* Role */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-medium ${ROLE_BADGE_COLORS[user.role]}`}
                        >
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </TableCell>

                      {/* Zone */}
                      <TableCell className="text-sm">
                        {user.zone ? (
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <MapPin className="h-3 w-3" />
                            {user.zone}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              user.isActive ? 'bg-emerald-500' : 'bg-red-400'
                            }`}
                          />
                          <span
                            className={
                              user.isActive ? 'text-emerald-700' : 'text-red-600'
                            }
                          >
                            {user.isActive ? 'Actif' : 'Inactif'}
                          </span>
                        </span>
                      </TableCell>

                      {/* Last Login */}
                      <TableCell className="text-sm text-gray-500">
                        {user.lastLogin ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(user.lastLogin)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2 text-xs"
                            onClick={() => setEditingUser(user)}
                          >
                            Modifier
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-8 gap-1 px-2 text-xs ${
                              user.isActive
                                ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                                : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.isActive ? 'Désactiver' : 'Activer'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ===== PERMISSION MATRIX ===== */}
      <PermissionMatrix />

      {/* ===== DIALOGS ===== */}
      <UserFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreate}
      />
      <UserFormDialog
        open={!!editingUser}
        onOpenChange={(v) => !v && setEditingUser(null)}
        initialData={editingUser}
        onSubmit={handleEdit}
      />
    </div>
  )
}
