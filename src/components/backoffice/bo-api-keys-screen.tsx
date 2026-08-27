'use client'

import { useState, useMemo } from 'react'
import {
  Plus,
  Key,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
import { Label } from '@/components/ui/label'
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
import { useBackofficeStore, BO_COLOR, BO_COLOR_BG } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type ApiKeyStatus = 'active' | 'revoked'

interface ApiKey {
  id: string
  name: string
  key: string
  description: string
  createdAt: string
  lastUsed: string
  status: ApiKeyStatus
  requestCount: number
  expiresAt: string
}

// ============== MOCK DATA ==============

const INITIAL_KEYS: ApiKey[] = [
  {
    id: 'key-1', name: 'Production API', key: 'sk-jl-prod-a1b2c3d4e5f6g7h8i9j0k1l2m3n4',
    description: 'Clé principale pour l\'environnement de production',
    createdAt: '2026-01-15T08:00:00Z', lastUsed: '2026-08-27T14:30:00Z', status: 'active',
    requestCount: 1245600, expiresAt: '2027-01-15T08:00:00Z',
  },
  {
    id: 'key-2', name: 'Staging API', key: 'sk-jl-stg-q7r8s9t0u1v2w3x4y5z6a7b8c9d0',
    description: 'Environnement de test et staging',
    createdAt: '2026-03-01T10:00:00Z', lastUsed: '2026-08-27T13:45:00Z', status: 'active',
    requestCount: 456200, expiresAt: '2027-03-01T10:00:00Z',
  },
  {
    id: 'key-3', name: 'Mobile App v1', key: 'sk-jl-mob-g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7',
    description: 'Application mobile (ancienne version)',
    createdAt: '2025-09-01T08:00:00Z', lastUsed: '2026-06-15T12:00:00Z', status: 'revoked',
    requestCount: 890340, expiresAt: '2026-09-01T08:00:00Z',
  },
  {
    id: 'key-4', name: 'Partner BCEAO', key: 'sk-jl-prt-w9x0y1z2a3b4c5d6e7f8g9h0i1j2k3l4',
    description: 'Accès partenaire pour la BCEAO',
    createdAt: '2026-06-15T14:00:00Z', lastUsed: '2026-08-27T12:00:00Z', status: 'active',
    requestCount: 34500, expiresAt: '2027-06-15T14:00:00Z',
  },
  {
    id: 'key-5', name: 'Internal Services', key: 'sk-jl-int-m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0',
    description: 'Services internes (cron, webhooks)',
    createdAt: '2026-02-01T08:00:00Z', lastUsed: '2026-08-27T14:00:00Z', status: 'active',
    requestCount: 678900, expiresAt: '2027-02-01T08:00:00Z',
  },
  {
    id: 'key-6', name: 'Webhook Listener', key: 'sk-jl-whk-c1d2e3f4g5h6i7j8k9l0m1n2o3p4q5r6',
    description: 'Endpoints webhook pour callbacks externes',
    createdAt: '2026-05-20T09:00:00Z', lastUsed: '2026-08-27T14:20:00Z', status: 'active',
    requestCount: 234100, expiresAt: '2027-05-20T09:00:00Z',
  },
]

function maskKey(key: string): string {
  const prefix = key.slice(0, 7) // 'sk-jl-xx'
  const last4 = key.slice(-4)
  return `${prefix}...${last4}`
}

// ============== MAIN COMPONENT ==============

export function BoApiKeysScreen() {
  const [keys, setKeys] = useState<ApiKey[]>(INITIAL_KEYS)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newKey, setNewKey] = useState({ name: '', description: '', expiry: '90' })
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return keys.filter((k) => {
      const matchSearch = !searchQuery || k.name.toLowerCase().includes(searchQuery.toLowerCase()) || k.description.toLowerCase().includes(searchQuery.toLowerCase())
      return matchSearch
    })
  }, [keys, searchQuery])

  const toggleVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleRevoke = (id: string) => {
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: 'revoked' as const } : k))
    setRevokeTarget(null)
  }

  const handleCreate = () => {
    const prefix = 'sk-jl-new'
    const random = Math.random().toString(36).slice(2, 30)
    const generatedKey = `${prefix}-${random}`
    const newApiKey: ApiKey = {
      id: `key-${Date.now()}`,
      name: newKey.name,
      key: generatedKey,
      description: newKey.description,
      createdAt: new Date().toISOString(),
      lastUsed: '-',
      status: 'active',
      requestCount: 0,
      expiresAt: new Date(Date.now() + parseInt(newKey.expiry) * 86400000).toISOString(),
    }
    setKeys((prev) => [newApiKey, ...prev])
    setCreatedKey(generatedKey)
    setShowCreateDialog(false)
    setNewKey({ name: '', description: '', expiry: '90' })
  }

  const formatDate = (d: string) => {
    if (d === '-') return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const totalRequests = keys.filter(k => k.status === 'active').reduce((s, k) => s + k.requestCount, 0)

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: BO_COLOR_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
          <span className="inline-flex items-center gap-2"><Key className="h-6 w-6" />API KEYS</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestion des clés d\'API pour les intégrations partenaires
        </p>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total clés</p>
            <p className="text-2xl font-bold mt-1" style={{ color: BO_COLOR }}>{keys.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Actives</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{keys.filter(k => k.status === 'active').length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Requêtes (30j)</p>
            <p className="text-2xl font-bold mt-1" style={{ color: BO_COLOR }}>{(totalRequests / 1000000).toFixed(1)}M</p>
          </CardContent>
        </Card>
      </div>

      {/* Created Key Banner */}
      {createdKey && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 inline-block mr-1.5 text-emerald-600" />Nouvelle clé créée avec succès</p>
              <code className="text-xs text-emerald-700 font-mono mt-1 block break-all bg-emerald-100/50 rounded px-2 py-1">
                {createdKey}
              </code>
              <p className="text-xs text-emerald-600 mt-1.5"><AlertTriangle className="h-3.5 w-3.5 inline-block mr-1 text-amber-500" />Copiez cette clé maintenant. Elle ne sera plus affichée.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="text-xs border-emerald-300 hover:bg-emerald-100" onClick={() => { copyKey(createdKey, 'new'); setCreatedKey(null) }}>
                <Copy className="h-3 w-3 mr-1" /> Copier & Fermer
              </Button>
              <Button size="sm" variant="ghost" className="text-xs text-emerald-700" onClick={() => setCreatedKey(null)}>Fermer</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 sm:max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher une clé..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="whitespace-nowrap">
          <Plus className="h-4 w-4 mr-2" />
          Créer clé
        </Button>
      </div>

      {/* Keys Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nom</TableHead>
                  <TableHead className="text-xs">Clé</TableHead>
                  <TableHead className="text-xs">Créée le</TableHead>
                  <TableHead className="text-xs">Dernière utilisation</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-xs text-right">Requêtes</TableHead>
                  <TableHead className="text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell className="text-xs py-3">
                      <div>
                        <p className="font-semibold" style={{ color: BO_COLOR }}>{apiKey.name}</p>
                        <p className="text-gray-400 text-[11px] mt-0.5 max-w-[180px] truncate">{apiKey.description}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-3">
                      <div className="flex items-center gap-1">
                        <code className="text-[11px] font-mono text-gray-600">
                          {visibleKeys.has(apiKey.id) ? apiKey.key : maskKey(apiKey.key)}
                        </code>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => toggleVisibility(apiKey.id)}>
                          {visibleKeys.has(apiKey.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => copyKey(apiKey.key, apiKey.id)}>
                          {copiedKey === apiKey.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-3 text-gray-500 whitespace-nowrap">{formatDate(apiKey.createdAt)}</TableCell>
                    <TableCell className="text-xs py-3 text-gray-500 whitespace-nowrap">{formatDate(apiKey.lastUsed)}</TableCell>
                    <TableCell className="py-3">
                      <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${apiKey.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {apiKey.status === 'active' ? 'Active' : 'Révoquée'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs py-3 text-right font-medium text-gray-600 tabular-nums whitespace-nowrap">
                      {apiKey.requestCount.toLocaleString('fr-FR')}
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      {apiKey.status === 'active' && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setRevokeTarget(apiKey.id)}>
                          <Trash2 className="h-3 w-3 mr-1" /> Révoquer
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Key className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune clé trouvée</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une clé API</DialogTitle>
            <DialogDescription>Générez une nouvelle clé d\'API pour votre intégration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nom de la clé</Label>
              <Input placeholder="Ex: Production API v2" value={newKey.name} onChange={(e) => setNewKey({ ...newKey, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Usage prévu de cette clé" value={newKey.description} onChange={(e) => setNewKey({ ...newKey, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Durée d\'expiration</Label>
              <Select value={newKey.expiry} onValueChange={(v) => setNewKey({ ...newKey, expiry: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 jours</SelectItem>
                  <SelectItem value="90">90 jours</SelectItem>
                  <SelectItem value="180">180 jours</SelectItem>
                  <SelectItem value="365">1 an</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={!newKey.name}>
              <Key className="h-4 w-4 mr-2" />
              Générer la clé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette clé API ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes les applications utilisant cette clé perdront l\'accès immédiatement.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => revokeTarget && handleRevoke(revokeTarget)}>
              Révoquer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
